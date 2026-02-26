# ==============================================
# backend/routers/categories.py
# 역할: 카테고리 CRUD + 순서 변경 API
# Python으로 치면: Flask Blueprint('categories', ...)
# ==============================================

import json
import shutil
import uuid

from fastapi import APIRouter, HTTPException

from backend.core import (
    VAULT_DIR,
    CategoryReorderBody,
    CreateCategoryBody,
    RenameCategoryBody,
    assert_inside_vault,
    get_folder_name,
    load_index,
    replace_image_urls_in_page,
    sanitize_category_name,
    save_index,
    validate_uuid,
)

# Python으로 치면: blueprint = Blueprint('categories', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/categories")
def get_categories():
    """카테고리 목록 반환"""
    index = load_index()
    return {
        "categories": index.get("categories", []),
        "categoryMap": index.get("categoryMap", {}),
        "categoryOrder": index.get("categoryOrder", []),
    }


@router.post("/categories", status_code=201)
def create_category(body: CreateCategoryBody):
    """
    새 카테고리 생성 → vault/{folderName}/ 폴더 생성
    Python으로 치면: os.mkdir(f'vault/{name}'); append_to_index()
    """
    cat_id = str(uuid.uuid4())
    folder_base = sanitize_category_name(body.name)

    index = load_index()

    # 중복 폴더명 방지 (숫자 suffix 추가)
    existing_folders = {c["folderName"] for c in index.get("categories", [])}
    folder_name = folder_base
    counter = 2
    while folder_name in existing_folders:
        folder_name = f"{folder_base}_{counter}"
        counter += 1

    # 🔒 vault 탈출 방지
    cat_dir = VAULT_DIR / folder_name
    assert_inside_vault(cat_dir)
    cat_dir.mkdir(exist_ok=True)

    cat = {"id": cat_id, "name": body.name, "folderName": folder_name}
    index["categories"].append(cat)
    index["categoryOrder"].append(cat_id)
    save_index(index)

    return cat


@router.put("/categories/{cat_id}")
def rename_category(cat_id: str, body: RenameCategoryBody):
    """
    카테고리 이름 변경 → 폴더 rename + 내부 페이지 이미지 URL 일괄 교체
    Python으로 치면: shutil.move(old_dir, new_dir); update_urls()
    """
    # 🔒 UUID 검증
    validate_uuid(cat_id, "카테고리 ID")

    index = load_index()

    # 카테고리 찾기
    cat = next((c for c in index.get("categories", []) if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")

    old_folder = cat["folderName"]
    new_folder_base = sanitize_category_name(body.name)

    # 중복 방지
    existing_folders = {c["folderName"] for c in index["categories"] if c["id"] != cat_id}
    new_folder = new_folder_base
    counter = 2
    while new_folder in existing_folders:
        new_folder = f"{new_folder_base}_{counter}"
        counter += 1

    renamed = old_folder != new_folder

    if renamed:
        old_path = VAULT_DIR / old_folder
        new_path = VAULT_DIR / new_folder

        # 🔒 vault 탈출 방지
        assert_inside_vault(old_path)
        assert_inside_vault(new_path)

        if old_path.exists():
            shutil.move(str(old_path), str(new_path))

        # 이 카테고리에 속한 모든 페이지의 이미지 URL 업데이트
        # Python으로 치면: for page in category_pages: update_urls(page)
        for page_id, cid in index.get("categoryMap", {}).items():
            if cid != cat_id:
                continue
            page_folder = get_folder_name(page_id, index)
            content_file = VAULT_DIR / new_folder / page_folder / "content.json"
            if not content_file.exists():
                continue
            page_data = json.loads(content_file.read_text(encoding="utf-8"))
            old_prefix = f"http://localhost:8000/static/{old_folder}/{page_folder}/"
            new_prefix = f"http://localhost:8000/static/{new_folder}/{page_folder}/"
            replace_image_urls_in_page(page_data, old_prefix, new_prefix)
            content_file.write_text(
                json.dumps(page_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        cat["folderName"] = new_folder

    cat["name"] = body.name
    save_index(index)

    return {"ok": True, "renamed": renamed, "category": cat}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: str):
    """
    카테고리 삭제
    안에 메모가 있으면 삭제 불가 → hasPages: True 반환
    Python으로 치면: if pages: return error; shutil.rmtree(cat_dir)
    """
    # 🔒 UUID 검증
    validate_uuid(cat_id, "카테고리 ID")

    index = load_index()

    # 카테고리 찾기
    cat = next((c for c in index.get("categories", []) if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")

    # 카테고리 안에 페이지가 있으면 삭제 불가
    pages_in_cat = [pid for pid, cid in index.get("categoryMap", {}).items() if cid == cat_id]
    if pages_in_cat:
        return {"ok": False, "hasPages": True, "count": len(pages_in_cat)}

    # 실제 폴더 삭제 (비어있는 경우)
    cat_dir = VAULT_DIR / cat["folderName"]

    # 🔒 vault 탈출 방지
    assert_inside_vault(cat_dir)

    if cat_dir.exists():
        shutil.rmtree(cat_dir)

    index["categories"] = [c for c in index["categories"] if c["id"] != cat_id]
    index["categoryOrder"] = [cid for cid in index.get("categoryOrder", []) if cid != cat_id]
    save_index(index)

    return {"ok": True, "hasPages": False}


@router.patch("/categories/reorder")
def reorder_categories(body: CategoryReorderBody):
    """
    카테고리 표시 순서 변경
    Python으로 치면: index['categoryOrder'] = body.order; save()
    """
    index = load_index()
    index["categoryOrder"] = body.order
    save_index(index)
    return {"ok": True}
