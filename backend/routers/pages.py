# ==============================================
# backend/routers/pages.py
# 역할: 페이지 CRUD + 이미지 업로드 + 순서/카테고리 변경 API
# Python으로 치면: Flask Blueprint('pages', ...)
# ==============================================

import json
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from typing import Optional

from backend.routers.history import save_snapshot
from backend.core import (
    ALLOWED_IMAGE_EXTS,
    MAX_IMAGE_SIZE,
    ALLOWED_VIDEO_EXTS,
    MAX_VIDEO_SIZE,
    ALLOWED_FILE_EXTS,
    MAX_FILE_SIZE,
    get_vault_dir,
    CreatePageBody,
    ImageCleanupBody,
    ImageDownloadBody,
    MoveCategoryBody,
    PageModel,
    PageReorderBody,
    assert_inside_vault,
    auto_discover_new_folders,
    begin_move_journal,
    complete_move_journal,
    get_cat_dir,
    get_cat_rel_path,
    get_category_folder_name,
    get_folder_name,
    get_image_url_prefix,
    get_page_dir,
    get_trash_dir,
    load_index,
    load_page,
    load_trash_index,
    make_folder_name,
    now_iso,
    replace_image_urls_in_page,
    resolve_content_file,
    resolve_trash_name,
    record_operation_error,
    save_index,
    save_page_to_disk,
    save_trash_index,
    serialized_vault_write,
    validate_uuid,
)

# Python으로 치면: blueprint = Blueprint('pages', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["pages"])


# -----------------------------------------------
# 이미지 다운로드 공통 헬퍼
# -----------------------------------------------

def _safe_download_name(name: str, fallback: str) -> str:
    """사용자 파일명에서 경로·Windows 금지 문자를 제거한다."""
    cleaned = Path(name or "").name.strip().replace("\x00", "")
    for char in '<>:"/\\|?*':
        cleaned = cleaned.replace(char, "_")
    cleaned = cleaned.rstrip(". ")
    cleaned = cleaned[:180] or fallback
    # Windows 장치 예약어는 확장자가 붙어도 파일로 만들 수 없다.
    # Python으로 치면: if Path(name).stem.upper() in RESERVED: name = f"_{name}"
    reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    if Path(cleaned).stem.upper() in reserved:
        cleaned = f"_{cleaned}"
    return cleaned


def _iter_image_items(page_data: dict):
    """현재 메모의 이미지 블록을 중첩 children까지 저장 순서대로 순회한다."""
    def walk(blocks: list[dict]):
        for block in blocks:
            if block.get("type") == "image":
                content = block.get("content") or ""
                try:
                    parsed = json.loads(content)
                except (json.JSONDecodeError, TypeError):
                    parsed = content
                if isinstance(parsed, dict) and isinstance(parsed.get("images"), list):
                    for item in parsed["images"]:
                        if isinstance(item, dict) and isinstance(item.get("src"), str):
                            yield item
                elif isinstance(parsed, dict) and isinstance(parsed.get("src"), str):
                    yield {
                        "src": parsed["src"],
                        "name": parsed.get("name"),
                        "caption": parsed.get("caption"),
                    }
                elif isinstance(parsed, str):
                    yield {"src": parsed}
            children = block.get("children") or []
            if isinstance(children, list):
                yield from walk(children)

    yield from walk(page_data.get("blocks") or [])


def _resolve_image_asset(url: str) -> Path:
    """로컬 정적 이미지 URL을 활성 볼트 안의 UUID 이미지 파일로 변환한다."""
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise HTTPException(status_code=400, detail="로컬 업로드 이미지 URL만 사용할 수 있습니다")
    if parsed.port not in {None, 8000}:
        raise HTTPException(status_code=400, detail="허용되지 않는 이미지 URL 포트입니다")

    static_prefix = "/static/"
    decoded_path = unquote(parsed.path)
    if not decoded_path.startswith(static_prefix):
        raise HTTPException(status_code=400, detail="정적 이미지 URL 형식이 아닙니다")
    relative_parts = PurePosixPath(decoded_path[len(static_prefix):]).parts
    if not relative_parts or any(part in {"", ".", ".."} for part in relative_parts):
        raise HTTPException(status_code=400, detail="허용되지 않는 이미지 경로입니다")

    asset_path = get_vault_dir().joinpath(*relative_parts)
    assert_inside_vault(asset_path)
    if asset_path.parent.name != "images" or asset_path.suffix.lower() not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="업로드 이미지 경로가 아닙니다")
    try:
        uuid.UUID(asset_path.stem)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="업로드 이미지 파일명이 아닙니다") from exc
    return asset_path


def _load_referenced_image(page_id: str, url: str) -> tuple[dict, Path, dict]:
    """메모가 현재 참조 중인 이미지인지 확인하고 메모·파일·메타데이터를 반환한다."""
    validate_uuid(page_id, "페이지 ID")
    index = load_index()
    page_data = load_page(page_id, index)
    if not page_data:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다")
    item = next((candidate for candidate in _iter_image_items(page_data) if candidate.get("src") == url), None)
    if item is None:
        raise HTTPException(status_code=404, detail="현재 메모에서 참조하는 이미지를 찾을 수 없습니다")
    asset_path = _resolve_image_asset(url)
    if not asset_path.is_file():
        raise HTTPException(status_code=404, detail="원본 이미지 파일을 찾을 수 없습니다")
    return page_data, asset_path, item


# -----------------------------------------------
# 페이지 목록 / 단일 조회
# -----------------------------------------------

@router.get("/pages")
def get_pages():
    """
    모든 페이지를 순서대로 반환 + 카테고리 정보 포함
    Python으로 치면: return [load_page(p) for p in index['pageOrder']]
    """
    index = load_index()
    # 탐색기에서 볼트에 직접 추가된 새 폴더 자동 감지 (스캔 버튼 없이도 반영)
    # Python으로 치면: if discover_new(index): save(index)
    if auto_discover_new_folders(index, get_vault_dir()):
        save_index(index)
    pages = []
    for page_id in index.get("pageOrder", []):
        page = load_page(page_id, index)
        if page:
            pages.append(page)
    return {
        "pages": pages,
        "currentPageId": index.get("currentPageId"),
        "categories": index.get("categories", []),
        "categoryMap": index.get("categoryMap", {}),
        "categoryOrder": index.get("categoryOrder", []),
        # 하위 폴더 순서: { parentCatId: [childCatId, ...] }
        "categoryChildOrder": index.get("categoryChildOrder", {}),
        # 현재 활성 볼트 이름 (폴더명) — 사이드바 표시용
        "vault_name": get_vault_dir().name,
    }


@router.get("/pages/{page_id}")
def get_page(page_id: str):
    """
    특정 페이지 반환
    보안: page_id UUID 검증 → 경로 트래버설 차단
    """
    # 🔒 UUID 형식 검증 — '../../../etc' 같은 값 차단
    validate_uuid(page_id, "페이지 ID")

    index = load_index()
    page = load_page(page_id, index)
    if not page:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다")
    return page


# -----------------------------------------------
# 페이지 생성 / 저장 / 삭제
# -----------------------------------------------

@router.post("/pages", status_code=201)
@serialized_vault_write
def create_page(body: CreatePageBody):
    """
    새 페이지 생성 → 카테고리가 지정되면 해당 카테고리 폴더 아래에 저장
    Python으로 치면: pages.append(Page(title, icon)); save_index()
    """
    # 카테고리 ID가 있으면 UUID 검증
    if body.categoryId:
        validate_uuid(body.categoryId, "카테고리 ID")

    page_id = str(uuid.uuid4())
    block_id = str(uuid.uuid4())
    now = now_iso()
    folder_name = make_folder_name(body.title, now, page_id)

    page = {
        "id": page_id,
        "title": body.title,
        "icon": body.icon,
        "cover": None,
        "coverPosition": 50,
        "tags": [],
        "starred": False,
        "blocks": [{
            "id": block_id,
            "type": "paragraph",
            "content": "",
            "createdAt": now,
            "updatedAt": now,
        }],
        "createdAt": now,
        "updatedAt": now,
    }

    index = load_index()

    # 카테고리 폴더 아래 또는 루트에 저장 (부모 체인 전체 경로 사용)
    # Python으로 치면: dir = get_cat_dir(cat_id) / folder if cat else vault / folder
    if body.categoryId:
        target_dir = get_cat_dir(body.categoryId, index) / folder_name
    else:
        target_dir = get_vault_dir() / folder_name

    # 🔒 vault 탈출 방지
    assert_inside_vault(target_dir)
    save_page_to_disk(page, target_dir)

    index["pageOrder"].append(page_id)
    index.setdefault("folderMap", {})[page_id] = folder_name
    if body.categoryId:
        index.setdefault("categoryMap", {})[page_id] = body.categoryId
    if not index.get("currentPageId"):
        index["currentPageId"] = page_id
    save_index(index)

    return page


@router.put("/pages/{page_id}")
@serialized_vault_write
def save_page(
    page_id: str,
    page: PageModel,
    categoryId: Optional[str] = Query(None),
    expectedRevision: Optional[int] = Query(None, ge=0),
):
    """
    페이지 저장 (upsert)

    제목 변경 시:
    1. 새 폴더명 계산
    2. 기존 폴더 → 새 폴더로 rename (카테고리 내부에서)
    3. 이미지 URL 업데이트
    4. renamed=True + 업데이트된 page 반환

    Python으로 치면:
        if new_folder != old_folder:
            shutil.move(old, new)
            replace_urls(blocks)
    """
    # 🔒 UUID 검증
    validate_uuid(page_id, "페이지 ID")

    index = load_index()
    folder_map = index.setdefault("folderMap", {})

    # A page revision prevents a stale tab from silently overwriting a newer
    # save from another window.  Legacy pages without this field start at 0.
    existing_page = load_page(page_id, index)
    current_revision = int(existing_page.get("revision", 0)) if existing_page else 0
    if existing_page and expectedRevision is not None and expectedRevision != current_revision:
        record_operation_error(
            "page_save_conflict",
            "stale page revision rejected",
            pageId=page_id,
            expectedRevision=expectedRevision,
            currentRevision=current_revision,
        )
        raise HTTPException(
            status_code=409,
            detail="다른 창에서 먼저 저장되었습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.",
        )

    old_folder = get_folder_name(page_id, index)
    page_data = page.model_dump()
    page_data["revision"] = current_revision + 1
    new_folder = make_folder_name(
        page_data["title"], page_data["createdAt"], page_id
    )

    # 현재 카테고리 정보 (URL 경로에 포함됨)
    # 인덱스에 없는 신규 페이지(로컬 폴백으로 생성된 경우)는 쿼리 파라미터 categoryId를 사용
    # Python으로 치면: cat_id = index["categoryMap"].get(page_id) or query_categoryId
    is_new_page = page_id not in folder_map
    cat_id = index.get("categoryMap", {}).get(page_id)
    if not cat_id and is_new_page and categoryId:
        validate_uuid(categoryId, "카테고리 ID")
        cat_id = categoryId
        index.setdefault("categoryMap", {})[page_id] = cat_id
    # 카테고리 전체 경로 계산 (부모 체인 포함)
    # Python으로 치면: cat_dir = get_cat_dir(cat_id) if cat_id else vault
    cat_rel = get_cat_rel_path(cat_id, index)

    renamed = False
    if old_folder != new_folder:
        # 카테고리 유무에 따라 올바른 경로 계산 (부모 체인 포함)
        if cat_id:
            cat_dir_path = get_cat_dir(cat_id, index)
            old_path = cat_dir_path / old_folder
            new_path = cat_dir_path / new_folder
        else:
            old_path = get_vault_dir() / old_folder
            new_path = get_vault_dir() / new_folder

        # 🔒 vault 탈출 방지
        assert_inside_vault(old_path)
        assert_inside_vault(new_path)

        # shutil.move: Windows에서 Path.rename()보다 안정적
        if old_path.exists():
            shutil.move(str(old_path), str(new_path))

        # 이미지 URL 교체 (카테고리 전체 상대경로 포함)
        old_prefix = get_image_url_prefix(old_folder, cat_rel)
        new_prefix = get_image_url_prefix(new_folder, cat_rel)
        replace_image_urls_in_page(page_data, old_prefix, new_prefix)

        folder_map[page_id] = new_folder
        save_index(index)
        renamed = True

    # content.json 저장 (부모 체인 포함 전체 경로)
    if cat_id:
        target_dir = get_cat_dir(cat_id, index) / new_folder
    else:
        target_dir = get_vault_dir() / new_folder

    # 🔒 vault 탈출 방지
    assert_inside_vault(target_dir)
    save_page_to_disk(page_data, target_dir)

    # 버전 히스토리 스냅샷 저장 (5분 간격, 최대 50개)
    # content.nct 저장 완료 후 호출 — 실패해도 메인 저장에는 영향 없음
    # Python으로 치면: try: save_snapshot(page_data, target_dir) except: pass
    try:
        save_snapshot(page_data, target_dir)
    except Exception:
        pass

    # pageOrder에 없으면 추가 (upsert)
    if page_id not in index.get("pageOrder", []):
        index["pageOrder"].append(page_id)
        save_index(index)

    return {"ok": True, "renamed": renamed, "page": page_data}


@router.delete("/pages/{page_id}")
@serialized_vault_write
def delete_page(page_id: str):
    """
    페이지 삭제 → _vault_trash/ 폴더로 물리 이동
    isTrashed 플래그 방식 폐기: 파일을 _vault_trash/<folderName>/ 으로 실제 이동
    _index.nct에서 완전 제거 (isTrashed 필드 없음)
    Python으로 치면: shutil.move(src, trash_dir/dst_name); del index[page_id]
    """
    validate_uuid(page_id, "페이지 ID")

    index = load_index()

    # 활성 페이지인지 확인
    # Python으로 치면: page_exists = page_id in page_order or page_id in folder_map
    page_exists = (
        page_id in index.get("pageOrder", []) or
        page_id in index.get("folderMap", {})
    )
    if not page_exists:
        # 이미 휴지통에 있는지 확인
        already_trashed = any(
            e.get("id") == page_id and e.get("type") == "page"
            for e in load_trash_index()
        )
        if already_trashed:
            raise HTTPException(status_code=400, detail="이미 휴지통에 있는 페이지입니다")
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다")

    # 원래 카테고리 정보 수집 (복원 시 사용)
    orig_cat_id = index.get("categoryMap", {}).get(page_id)
    orig_cat_folder = get_category_folder_name(orig_cat_id, index)

    # 파일에서 title, icon 읽기 (TrashPanel 표시용)
    page_data = load_page(page_id, index)
    title = page_data.get("title", "제목 없음") if page_data else "제목 없음"
    icon = page_data.get("icon", "📄") if page_data else "📄"
    folder_name = get_folder_name(page_id, index)

    # ── 물리 파일 이동 ──────────────────────────────────────
    # Python으로 치면: shutil.move(src, trash_dir / dst_name)
    src_path = get_page_dir(page_id, index)
    trash_dir = get_trash_dir()
    dst_name = resolve_trash_name(folder_name, trash_dir)

    if src_path.exists():
        assert_inside_vault(src_path)
        shutil.move(str(src_path), str(trash_dir / dst_name))
    else:
        # 물리 파일이 없어도 메타 기록은 유지
        import logging
        logging.getLogger(__name__).warning("페이지 폴더 없음, 메타만 기록: %s", src_path)
        dst_name = folder_name

    # ── _vault_trash/index.json 업데이트 ────────────────────
    trash_entries = load_trash_index()
    trash_entries.append({
        "id":                       page_id,
        "type":                     "page",
        "groupId":                  None,
        "trashedAt":                now_iso(),
        "title":                    title,
        "icon":                     icon,
        "folderName":               folder_name,
        "trashedFolderName":        dst_name,
        "originalCategoryId":       orig_cat_id,
        "originalCategoryFolderName": orig_cat_folder,
    })
    save_trash_index(trash_entries)

    # ── _index.nct에서 완전 제거 (isTrashed 플래그 없이 깔끔하게) ──
    index["pageOrder"] = [pid for pid in index.get("pageOrder", []) if pid != page_id]
    index.get("folderMap", {}).pop(page_id, None)
    index.get("categoryMap", {}).pop(page_id, None)
    # 레거시 isTrashed 잔존 항목도 정리
    index["pages"] = [p for p in index.get("pages", []) if p["id"] != page_id]

    if index.get("currentPageId") == page_id:
        remaining = index.get("pageOrder", [])
        index["currentPageId"] = remaining[0] if remaining else None

    save_index(index)
    return {"ok": True}


# -----------------------------------------------
# 현재 페이지 설정 / 순서 변경
# -----------------------------------------------

@router.patch("/current")
@serialized_vault_write
def set_current_page(body: dict):
    """
    현재 선택된 페이지 ID 저장
    Python으로 치면: index['currentPageId'] = page_id; save()
    """
    index = load_index()
    index["currentPageId"] = body.get("pageId")
    save_index(index)
    return {"ok": True}


@router.patch("/pages/reorder")
@serialized_vault_write
def reorder_pages(body: PageReorderBody):
    """
    페이지 표시 순서 변경
    Python으로 치면: index['pageOrder'] = body.order; save()
    """
    index = load_index()
    valid_ids = set(index.get("pageOrder", []))

    # 요청에 포함된 ID 중 유효한 것만 새 순서로
    new_order = [pid for pid in body.order if pid in valid_ids]

    # 혹시 누락된 ID는 뒤에 붙임 (안전 장치)
    for pid in index.get("pageOrder", []):
        if pid not in new_order:
            new_order.append(pid)

    index["pageOrder"] = new_order
    save_index(index)
    return {"ok": True}


@router.patch("/pages/{page_id}/category")
@serialized_vault_write
def move_page_to_category(page_id: str, body: MoveCategoryBody):
    """
    페이지를 다른 카테고리로 이동 (또는 미분류로)
    실제 폴더를 이동 + 이미지 URL 교체
    Python으로 치면: shutil.move(old_path, new_path); update_urls()
    """
    # 🔒 UUID 검증
    validate_uuid(page_id, "페이지 ID")
    if body.categoryId:
        validate_uuid(body.categoryId, "카테고리 ID")

    index = load_index()

    page = load_page(page_id, index)
    if not page:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다")

    old_cat_id = index.get("categoryMap", {}).get(page_id)
    new_cat_id = body.categoryId

    # 이미 같은 카테고리면 아무것도 안 함
    if old_cat_id == new_cat_id:
        return {"ok": True, "moved": False}

    page_folder = get_folder_name(page_id, index)
    # 하위 카테고리는 마지막 폴더명만으로 경로를 만들면 안 된다.
    # 예: work_log/2026년 아래 페이지는 "2026년"만 사용하면 다른
    # 최상위 2026년 카테고리와 충돌하고, 이미지 URL도 잘못 갱신된다.
    old_cat_rel = get_cat_rel_path(old_cat_id, index)
    new_cat_rel = get_cat_rel_path(new_cat_id, index)
    old_cat_dir = get_cat_dir(old_cat_id, index) if old_cat_id else get_vault_dir()
    new_cat_dir = get_cat_dir(new_cat_id, index) if new_cat_id else get_vault_dir()

    # 실제 폴더 이동 — 카테고리 전체 경로를 보존한다.
    old_path = old_cat_dir / page_folder
    new_path = new_cat_dir / page_folder

    # 🔒 vault 탈출 방지
    assert_inside_vault(old_path)
    assert_inside_vault(new_path)

    if not old_path.exists():
        record_operation_error("page_move", "source page folder missing", pageId=page_id, source=str(old_path), target=str(new_path))
        raise HTTPException(status_code=404, detail="이동할 페이지 폴더를 찾을 수 없습니다")
    if new_path.exists():
        record_operation_error("page_move", "target page folder already exists", pageId=page_id, source=str(old_path), target=str(new_path))
        raise HTTPException(status_code=409, detail="대상 위치에 같은 페이지 폴더가 이미 있습니다")

    # 대상 카테고리의 상위 경로까지 함께 준비한다.
    new_cat_dir.mkdir(parents=True, exist_ok=True)
    old_prefix = get_image_url_prefix(page_folder, old_cat_rel)
    new_prefix = get_image_url_prefix(page_folder, new_cat_rel)
    journal_id = begin_move_journal(
        "page_move", old_path, new_path,
        pageId=page_id, newCategoryId=new_cat_id, oldPrefix=old_prefix, newPrefix=new_prefix,
    )
    updated_page = None
    moved = False
    try:
        shutil.move(str(old_path), str(new_path))
        moved = True

        # 이미지 URL 교체
        content_file = resolve_content_file(new_path)
        if content_file.exists():
            import json
            page_data = json.loads(content_file.read_text(encoding="utf-8"))
            replace_image_urls_in_page(page_data, old_prefix, new_prefix)
            # .nct로 저장 (save_page_to_disk가 구버전 .json 자동 삭제)
            save_page_to_disk(page_data, new_path)
            updated_page = page_data

        # categoryMap 업데이트
        if new_cat_id:
            index.setdefault("categoryMap", {})[page_id] = new_cat_id
        else:
            index.get("categoryMap", {}).pop(page_id, None)

        save_index(index)
        complete_move_journal(journal_id)
    except Exception as exc:
        # 인덱스 저장 전 실패면 폴더와 URL을 원상태로 되돌린다.
        try:
            if moved and new_path.exists() and not old_path.exists():
                rollback_file = resolve_content_file(new_path)
                if rollback_file.exists():
                    import json
                    rollback_page = json.loads(rollback_file.read_text(encoding="utf-8"))
                    replace_image_urls_in_page(rollback_page, new_prefix, old_prefix)
                    save_page_to_disk(rollback_page, new_path)
                old_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(new_path), str(old_path))
        except Exception as rollback_exc:
            record_operation_error("page_move", "rollback failed", pageId=page_id, error=str(rollback_exc))
        record_operation_error("page_move", "move failed and was rolled back", pageId=page_id, error=str(exc))
        complete_move_journal(journal_id)
        raise HTTPException(status_code=500, detail="메모 이동 중 오류가 발생해 원래 위치로 되돌렸습니다")

    return {"ok": True, "moved": True, "page": updated_page}


# -----------------------------------------------
# 이미지 업로드
# -----------------------------------------------

@router.post("/pages/{page_id}/images")
async def upload_image(page_id: str, file: UploadFile = File(...)):
    """
    이미지 업로드 → vault/{경로}/images/{uuid}.ext 저장 → URL 반환

    보안:
    - page_id UUID 검증
    - 허용 확장자만 수락 (.jpg/.png/.gif/.webp/.svg/.bmp)
    - 파일 크기 20MB 제한
    - vault 탈출 방지 (resolve 체크)

    Python으로 치면: file.save(path); return {'url': url}
    """
    # 🔒 UUID 검증
    validate_uuid(page_id, "페이지 ID")

    # 🔒 확장자 화이트리스트 검증 (소문자로 정규화)
    # Python으로 치면: if suffix not in ALLOWED: raise ValueError
    raw_suffix = Path(file.filename or "").suffix.lower()
    if raw_suffix not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"허용되지 않는 파일 형식입니다. 허용: {', '.join(sorted(ALLOWED_IMAGE_EXTS))}",
        )

    # 🔒 파일 크기 제한 (10MB)
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="파일 크기가 너무 큽니다 (최대 10MB)",
        )

    index = load_index()
    # 페이지가 없거나 인덱스와 실제 폴더가 어긋난 상태에서 이미지만 먼저
    # 저장하면 화면에 절대 나타날 수 없는 고아 파일이 생긴다.
    if not load_page(page_id, index):
        record_operation_error("image_upload", "page missing before image upload", pageId=page_id, pageDir=str(get_page_dir(page_id, index)))
        raise HTTPException(status_code=404, detail="이미지를 추가할 메모를 찾을 수 없습니다")
    page_dir = get_page_dir(page_id, index)
    images_dir = page_dir / "images"

    # 🔒 vault 탈출 방지
    assert_inside_vault(images_dir)
    images_dir.mkdir(parents=True, exist_ok=True)

    # UUID 기반 파일명으로 저장 (원본 파일명 무시 → 경로 인젝션 방지)
    # Python으로 치면: filename = f"{uuid.uuid4()}{safe_suffix}"
    filename = f"{uuid.uuid4()}{raw_suffix}"
    file_path = images_dir / filename
    temp_path = images_dir / f".{filename}.uploading"
    if not content:
        record_operation_error("image_upload", "empty image file rejected", pageId=page_id, filename=file.filename or "")
        raise HTTPException(status_code=422, detail="비어 있는 이미지 파일은 업로드할 수 없습니다")
    try:
        # 업로드 도중 중단돼도 반쯤 저장된 이미지가 화면에 노출되지 않도록
        # 임시 파일을 원자적으로 교체한다.
        temp_path.write_bytes(content)
        temp_path.replace(file_path)
    except OSError as exc:
        temp_path.unlink(missing_ok=True)
        record_operation_error("image_upload", "image file write failed", pageId=page_id, path=str(file_path), error=str(exc))
        raise HTTPException(status_code=500, detail="이미지 파일 저장에 실패했습니다") from exc

    # URL 경로 계산 (부모 체인 포함 전체 카테고리 상대경로 사용)
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_rel = get_cat_rel_path(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_rel)
    url = f"{prefix}images/{filename}"

    return {
        "url": url,
        "filename": filename,
        "originalName": _safe_download_name(file.filename or "", filename),
        "size": len(content),
        "mime": file.content_type or "application/octet-stream",
    }


# -----------------------------------------------
# 이미지 원본 다운로드
# -----------------------------------------------
@router.post("/pages/{page_id}/images/download")
def download_image(page_id: str, body: ImageDownloadBody):
    """현재 메모가 참조하는 이미지 원본을 안전한 파일명으로 내려준다."""
    _page_data, asset_path, item = _load_referenced_image(page_id, body.url)
    requested_name = _safe_download_name(str(item.get("name") or ""), asset_path.name)
    if Path(requested_name).suffix.lower() != asset_path.suffix.lower():
        requested_name = f"{Path(requested_name).stem or 'image'}{asset_path.suffix.lower()}"
    return FileResponse(asset_path, filename=requested_name)


@router.get("/pages/{page_id}/images/download-all")
def download_all_images(page_id: str):
    """현재 메모의 이미지 블록이 참조하는 원본을 저장 순서대로 ZIP에 담는다."""
    validate_uuid(page_id, "페이지 ID")
    index = load_index()
    page_data = load_page(page_id, index)
    if not page_data:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다")

    resolved: list[tuple[Path, dict]] = []
    seen_paths: set[Path] = set()
    for item in _iter_image_items(page_data):
        src = item.get("src")
        if not isinstance(src, str):
            continue
        try:
            asset_path = _resolve_image_asset(src)
        except HTTPException:
            # data URL·외부 URL은 로컬 원본 ZIP 대상이 아니다.
            continue
        if asset_path in seen_paths:
            continue
        if not asset_path.is_file():
            raise HTTPException(status_code=404, detail=f"원본 이미지 파일을 찾을 수 없습니다: {asset_path.name}")
        seen_paths.add(asset_path)
        resolved.append((asset_path, item))

    if not resolved:
        raise HTTPException(status_code=404, detail="다운로드할 로컬 원본 이미지가 없습니다")

    # 이미지 총량만큼 RAM을 점유하지 않도록 임시 ZIP 파일에 스트리밍해서 쓴다.
    # 응답 전송이 끝나면 BackgroundTask가 정확한 임시 파일 하나만 삭제한다.
    archive_handle = tempfile.NamedTemporaryFile(prefix="notion-images-", suffix=".zip", delete=False)
    archive_path = Path(archive_handle.name)
    archive_handle.close()
    used_names: set[str] = set()
    try:
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            for index_no, (asset_path, item) in enumerate(resolved, start=1):
                fallback = f"image-{index_no:02d}{asset_path.suffix.lower()}"
                base_name = _safe_download_name(str(item.get("name") or ""), fallback)
                if Path(base_name).suffix.lower() != asset_path.suffix.lower():
                    base_name = f"{Path(base_name).stem or f'image-{index_no:02d}'}{asset_path.suffix.lower()}"
                candidate = base_name
                duplicate_no = 2
                while candidate.casefold() in used_names:
                    candidate = f"{Path(base_name).stem} ({duplicate_no}){asset_path.suffix.lower()}"
                    duplicate_no += 1
                used_names.add(candidate.casefold())
                zip_file.write(asset_path, arcname=candidate)
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise

    safe_title = _safe_download_name(str(page_data.get("title") or "memo"), "memo")
    filename = f"{safe_title}-images.zip"
    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename=filename,
        background=BackgroundTask(archive_path.unlink, missing_ok=True),
    )


# -----------------------------------------------
# 미참조 이미지 정리
# -----------------------------------------------
@router.post("/pages/{page_id}/images/cleanup")
@serialized_vault_write
def cleanup_unreferenced_image(page_id: str, body: ImageCleanupBody):
    """본문·커버·히스토리에 참조되지 않는 업로드 이미지만 삭제한다.

    페이지/블록 복제는 같은 URL을 공유하고, 버전 히스토리는 과거 URL을
    다시 복원할 수 있으므로 현재 페이지 하나만 보고 파일을 지우면 안 된다.
    """
    validate_uuid(page_id, "페이지 ID")

    asset_path = _resolve_image_asset(body.url)

    if not asset_path.exists():
        return {"deleted": False, "reason": "missing"}

    # UUID 파일명은 업로드마다 새로 생성되므로 이름 자체가 안전한 참조 키다.
    # _history와 _vault_trash도 포함해 Undo/복원/다른 페이지 복제본을 보존한다.
    filename = asset_path.name
    for nct_file in get_vault_dir().rglob("*.nct"):
        try:
            if filename in nct_file.read_text(encoding="utf-8"):
                return {"deleted": False, "reason": "referenced"}
        except (OSError, UnicodeDecodeError):
            # 읽을 수 없는 파일이 있어도 보수적으로 삭제를 진행하지 않는다.
            return {"deleted": False, "reason": "scan_failed"}

    asset_path.unlink()
    return {"deleted": True}


# -----------------------------------------------
# 비디오 업로드
# 이미지 업로드와 동일한 구조 — 저장 위치만 videos/ 로 분리
# Python으로 치면: def upload_video(page_id, file): validate → save → return url
# -----------------------------------------------
@router.post("/pages/{page_id}/videos")
async def upload_video(page_id: str, file: UploadFile = File(...)):
    """
    비디오 업로드 → vault/{경로}/videos/{uuid}.ext 저장 → URL 반환
    허용 확장자: .mp4 .webm .ogg .mov .avi .mkv  /  최대 500MB
    """
    # 🔒 UUID 검증 (경로 트래버설 방지)
    # Python으로 치면: validate_uuid(page_id)
    validate_uuid(page_id, "페이지 ID")

    # 확장자 화이트리스트 검증
    # Python으로 치면: if suffix not in ALLOWED_VIDEO: raise ValueError
    raw_suffix = Path(file.filename or "").suffix.lower()
    if raw_suffix not in ALLOWED_VIDEO_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"허용되지 않는 파일 형식입니다. 허용: {', '.join(sorted(ALLOWED_VIDEO_EXTS))}",
        )

    # 파일 내용 읽기 + 크기 제한 (500MB)
    # Python으로 치면: content = file.read(); assert len(content) <= MAX_VIDEO_SIZE
    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"파일 크기가 500MB를 초과합니다 ({len(content) // (1024*1024)}MB)",
        )

    # 페이지 폴더 + videos/ 하위 디렉토리에 저장
    # Python으로 치면: videos_dir = get_page_dir(page_id) / 'videos'
    index = load_index()
    page_dir = get_page_dir(page_id, index)
    videos_dir = page_dir / "videos"

    # 🔒 vault 탈출 방지
    assert_inside_vault(videos_dir)
    videos_dir.mkdir(parents=True, exist_ok=True)

    # UUID 기반 파일명 (원본 파일명 무시 → 경로 인젝션 방지)
    # Python으로 치면: filename = f"{uuid.uuid4()}{suffix}"
    filename = f"{uuid.uuid4()}{raw_suffix}"
    file_path = videos_dir / filename
    file_path.write_bytes(content)

    # URL 경로 계산 (부모 체인 포함 전체 카테고리 상대경로 사용)
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_rel = get_cat_rel_path(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_rel)
    url = f"{prefix}videos/{filename}"

    return {"url": url, "filename": filename}


# -----------------------------------------------
# 일반 파일 업로드
# 이미지/비디오 업로드와 동일한 구조 — 저장 위치만 files/ 로 분리
# Python으로 치면: def upload_file(page_id, file): validate → save → return url
# -----------------------------------------------
@router.post("/pages/{page_id}/files")
async def upload_file(page_id: str, file: UploadFile = File(...)):
    """
    일반 파일 업로드 → vault/{경로}/files/{uuid}.ext 저장 → URL + 원본파일명 + 크기 반환
    허용 확장자: .pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .csv .json .zip .rar .7z  /  최대 100MB
    """
    # 🔒 UUID 검증 (경로 트래버설 방지)
    validate_uuid(page_id, "페이지 ID")

    # 확장자 화이트리스트 검증 (소문자로 정규화)
    # Python으로 치면: if suffix not in ALLOWED_FILE: raise ValueError
    raw_suffix = Path(file.filename or "").suffix.lower()
    if raw_suffix not in ALLOWED_FILE_EXTS:
        raise HTTPException(
            status_code=415,
            detail=f"허용되지 않는 파일 형식입니다. 허용: {', '.join(sorted(ALLOWED_FILE_EXTS))}",
        )

    # 파일 내용 읽기 + 크기 제한 (100MB)
    # Python으로 치면: content = file.read(); assert len(content) <= MAX_FILE_SIZE
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"파일 크기가 100MB를 초과합니다 ({len(content) // (1024*1024)}MB)",
        )

    # 페이지 폴더 + files/ 하위 디렉토리에 저장
    # Python으로 치면: files_dir = get_page_dir(page_id) / 'files'
    index = load_index()
    page_dir = get_page_dir(page_id, index)
    files_dir = page_dir / "files"

    # 🔒 vault 탈출 방지
    assert_inside_vault(files_dir)
    files_dir.mkdir(parents=True, exist_ok=True)

    # UUID 기반 파일명 (원본 파일명 무시 → 경로 인젝션 방지)
    # Python으로 치면: filename = f"{uuid.uuid4()}{suffix}"
    filename = f"{uuid.uuid4()}{raw_suffix}"
    file_path = files_dir / filename
    file_path.write_bytes(content)

    # URL 경로 계산 (부모 체인 포함 전체 카테고리 상대경로 사용)
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_rel = get_cat_rel_path(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_rel)
    url = f"{prefix}files/{filename}"

    return {
        "url": url,
        "filename": filename,
        "original_name": file.filename or filename,
        "size": len(content),
    }
