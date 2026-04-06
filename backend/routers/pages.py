# ==============================================
# backend/routers/pages.py
# 역할: 페이지 CRUD + 이미지 업로드 + 순서/카테고리 변경 API
# Python으로 치면: Flask Blueprint('pages', ...)
# ==============================================

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
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
    MoveCategoryBody,
    PageModel,
    PageReorderBody,
    assert_inside_vault,
    auto_discover_new_folders,
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
    save_index,
    save_page_to_disk,
    save_trash_index,
    validate_uuid,
)

# Python으로 치면: blueprint = Blueprint('pages', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["pages"])


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

    # 카테고리 폴더 아래 또는 루트에 저장
    # Python으로 치면: dir = cat_dir / folder if cat else vault / folder
    cat_folder = get_category_folder_name(body.categoryId, index) if body.categoryId else None
    if cat_folder:
        target_dir = get_vault_dir() / cat_folder / folder_name
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
def save_page(
    page_id: str,
    page: PageModel,
    categoryId: Optional[str] = Query(None),
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

    old_folder = get_folder_name(page_id, index)
    page_data = page.model_dump()
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
    cat_folder = get_category_folder_name(cat_id, index)

    renamed = False
    if old_folder != new_folder:
        # 카테고리 유무에 따라 올바른 경로 계산
        if cat_folder:
            old_path = get_vault_dir() / cat_folder / old_folder
            new_path = get_vault_dir() / cat_folder / new_folder
        else:
            old_path = get_vault_dir() / old_folder
            new_path = get_vault_dir() / new_folder

        # 🔒 vault 탈출 방지
        assert_inside_vault(old_path)
        assert_inside_vault(new_path)

        # shutil.move: Windows에서 Path.rename()보다 안정적
        if old_path.exists():
            shutil.move(str(old_path), str(new_path))

        # 이미지 URL 교체 (카테고리 prefix 포함)
        old_prefix = get_image_url_prefix(old_folder, cat_folder)
        new_prefix = get_image_url_prefix(new_folder, cat_folder)
        replace_image_urls_in_page(page_data, old_prefix, new_prefix)

        folder_map[page_id] = new_folder
        save_index(index)
        renamed = True

    # content.json 저장
    if cat_folder:
        target_dir = get_vault_dir() / cat_folder / new_folder
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

    if renamed:
        return {"ok": True, "renamed": True, "page": page_data}
    return {"ok": True, "renamed": False}


@router.delete("/pages/{page_id}")
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
    old_cat_folder = get_category_folder_name(old_cat_id, index)
    new_cat_folder = get_category_folder_name(new_cat_id, index)

    # 실제 폴더 이동
    old_path = get_vault_dir() / old_cat_folder / page_folder if old_cat_folder else get_vault_dir() / page_folder
    new_path = get_vault_dir() / new_cat_folder / page_folder if new_cat_folder else get_vault_dir() / page_folder

    # 🔒 vault 탈출 방지
    assert_inside_vault(old_path)
    assert_inside_vault(new_path)

    if new_cat_folder:
        # 대상 카테고리 폴더가 없으면 생성
        (get_vault_dir() / new_cat_folder).mkdir(exist_ok=True)

    if old_path.exists():
        shutil.move(str(old_path), str(new_path))

    # 이미지 URL 교체
    content_file = resolve_content_file(new_path)
    updated_page = None
    if content_file.exists():
        import json
        page_data = json.loads(content_file.read_text(encoding="utf-8"))
        old_prefix = get_image_url_prefix(page_folder, old_cat_folder)
        new_prefix = get_image_url_prefix(page_folder, new_cat_folder)
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
    - 파일 크기 10MB 제한
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
    page_dir = get_page_dir(page_id, index)
    images_dir = page_dir / "images"

    # 🔒 vault 탈출 방지
    assert_inside_vault(images_dir)
    images_dir.mkdir(parents=True, exist_ok=True)

    # UUID 기반 파일명으로 저장 (원본 파일명 무시 → 경로 인젝션 방지)
    # Python으로 치면: filename = f"{uuid.uuid4()}{safe_suffix}"
    filename = f"{uuid.uuid4()}{raw_suffix}"
    file_path = images_dir / filename
    file_path.write_bytes(content)

    # URL 경로 계산 (카테고리 prefix 포함)
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_folder)
    url = f"{prefix}images/{filename}"

    return {"url": url, "filename": filename}


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

    # URL 경로 계산 (카테고리 prefix 포함, 이미지와 동일한 prefix 사용)
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_folder)
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

    # URL 경로 계산 (카테고리 prefix 포함, 이미지와 동일한 prefix 사용)
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_folder)
    url = f"{prefix}files/{filename}"

    return {
        "url": url,
        "filename": filename,
        "original_name": file.filename or filename,
        "size": len(content),
    }
