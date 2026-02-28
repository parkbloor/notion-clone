# ==============================================
# backend/routers/pages.py
# 역할: 페이지 CRUD + 이미지 업로드 + 순서/카테고리 변경 API
# Python으로 치면: Flask Blueprint('pages', ...)
# ==============================================

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.core import (
    ALLOWED_IMAGE_EXTS,
    MAX_IMAGE_SIZE,
    ALLOWED_VIDEO_EXTS,
    MAX_VIDEO_SIZE,
    VAULT_DIR,
    CreatePageBody,
    MoveCategoryBody,
    PageModel,
    PageReorderBody,
    assert_inside_vault,
    get_category_folder_name,
    get_folder_name,
    get_image_url_prefix,
    get_page_dir,
    load_index,
    load_page,
    make_folder_name,
    now_iso,
    replace_image_urls_in_page,
    save_index,
    save_page_to_disk,
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
        target_dir = VAULT_DIR / cat_folder / folder_name
    else:
        target_dir = VAULT_DIR / folder_name

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
def save_page(page_id: str, page: PageModel):
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
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)

    renamed = False
    if old_folder != new_folder:
        # 카테고리 유무에 따라 올바른 경로 계산
        if cat_folder:
            old_path = VAULT_DIR / cat_folder / old_folder
            new_path = VAULT_DIR / cat_folder / new_folder
        else:
            old_path = VAULT_DIR / old_folder
            new_path = VAULT_DIR / new_folder

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
        target_dir = VAULT_DIR / cat_folder / new_folder
    else:
        target_dir = VAULT_DIR / new_folder

    # 🔒 vault 탈출 방지
    assert_inside_vault(target_dir)
    save_page_to_disk(page_data, target_dir)

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
    페이지 삭제 — 폴더째 삭제 + 인덱스 업데이트
    Python으로 치면: shutil.rmtree(path); index['pageOrder'].remove(page_id)
    """
    # 🔒 UUID 검증
    validate_uuid(page_id, "페이지 ID")

    index = load_index()
    page_dir = get_page_dir(page_id, index)

    # 🔒 vault 탈출 방지
    assert_inside_vault(page_dir)

    if page_dir.exists():
        shutil.rmtree(page_dir)

    index["pageOrder"] = [pid for pid in index["pageOrder"] if pid != page_id]
    index.get("folderMap", {}).pop(page_id, None)
    index.get("categoryMap", {}).pop(page_id, None)

    if index.get("currentPageId") == page_id:
        index["currentPageId"] = index["pageOrder"][0] if index["pageOrder"] else None

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
    old_path = VAULT_DIR / old_cat_folder / page_folder if old_cat_folder else VAULT_DIR / page_folder
    new_path = VAULT_DIR / new_cat_folder / page_folder if new_cat_folder else VAULT_DIR / page_folder

    # 🔒 vault 탈출 방지
    assert_inside_vault(old_path)
    assert_inside_vault(new_path)

    if new_cat_folder:
        # 대상 카테고리 폴더가 없으면 생성
        (VAULT_DIR / new_cat_folder).mkdir(exist_ok=True)

    if old_path.exists():
        shutil.move(str(old_path), str(new_path))

    # 이미지 URL 교체
    content_file = new_path / "content.json"
    updated_page = None
    if content_file.exists():
        import json
        page_data = json.loads(content_file.read_text(encoding="utf-8"))
        old_prefix = get_image_url_prefix(page_folder, old_cat_folder)
        new_prefix = get_image_url_prefix(page_folder, new_cat_folder)
        replace_image_urls_in_page(page_data, old_prefix, new_prefix)
        content_file.write_text(
            json.dumps(page_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
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
