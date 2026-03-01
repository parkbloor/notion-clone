# ==============================================
# backend/routers/categories.py
# 역할: 카테고리 CRUD + 순서 변경 API (하위 폴더 트리 지원)
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
    MoveFolderBody,
    RenameCategoryBody,
    assert_inside_vault,
    get_folder_name,
    load_index,
    replace_image_urls_in_page,
    resolve_content_file,
    sanitize_category_name,
    save_index,
    save_page_to_disk,
    validate_uuid,
)

# Python으로 치면: blueprint = Blueprint('categories', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/categories")
def get_categories():
    """카테고리 목록 반환 (하위 폴더 순서 포함)"""
    index = load_index()
    return {
        "categories": index.get("categories", []),
        "categoryMap": index.get("categoryMap", {}),
        "categoryOrder": index.get("categoryOrder", []),
        # 하위 폴더 순서: { parentCatId: [childCatId, ...] }
        # Python으로 치면: category_child_order: dict[str, list[str]]
        "categoryChildOrder": index.get("categoryChildOrder", {}),
    }


@router.post("/categories", status_code=201)
def create_category(body: CreateCategoryBody):
    """
    새 카테고리 생성 → vault/{folderName}/ 폴더 생성
    parentId가 있으면 해당 카테고리의 하위 폴더로 생성
    Python으로 치면: os.mkdir(f'vault/{name}'); append_to_index()
    """
    # 🔒 parentId가 있으면 UUID 검증
    if body.parentId is not None:
        validate_uuid(body.parentId, "부모 카테고리 ID")

    cat_id = str(uuid.uuid4())
    folder_base = sanitize_category_name(body.name)

    index = load_index()

    # parentId가 있으면 부모 카테고리 존재 여부 확인
    # Python으로 치면: parent = next((c for c in cats if c['id'] == parent_id), None)
    if body.parentId is not None:
        parent = next(
            (c for c in index.get("categories", []) if c["id"] == body.parentId),
            None,
        )
        if not parent:
            raise HTTPException(status_code=404, detail="부모 카테고리를 찾을 수 없습니다")

    # 중복 폴더명 방지 (숫자 suffix 추가)
    # 물리 폴더는 무조건 vault/ 바로 아래 flat하게 생성 (논리적 트리만 index에 저장)
    # Python으로 치면: while folder_name in existing_folders: folder_name += f"_{counter}"
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

    # 카테고리 객체 (parentId 포함)
    # Python으로 치면: cat = {"id": id, "name": name, "folderName": fn, "parentId": pid}
    cat = {
        "id": cat_id,
        "name": body.name,
        "folderName": folder_name,
        "parentId": body.parentId,
    }
    index["categories"].append(cat)

    if body.parentId is None:
        # 최상위 카테고리 → categoryOrder에 추가
        index["categoryOrder"].append(cat_id)
    else:
        # 하위 카테고리 → 부모의 categoryChildOrder에 추가
        # Python으로 치면: child_order[parent_id].append(cat_id)
        child_order = index.setdefault("categoryChildOrder", {})
        child_order.setdefault(body.parentId, []).append(cat_id)

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
            content_file = resolve_content_file(VAULT_DIR / new_folder / page_folder)
            if not content_file.exists():
                continue
            page_data = json.loads(content_file.read_text(encoding="utf-8"))
            old_prefix = f"http://localhost:8000/static/{old_folder}/{page_folder}/"
            new_prefix = f"http://localhost:8000/static/{new_folder}/{page_folder}/"
            replace_image_urls_in_page(page_data, old_prefix, new_prefix)
            # 항상 .nct로 저장 (구버전 .json은 save_page_to_disk가 정리)
            save_page_to_disk(page_data, VAULT_DIR / new_folder / page_folder)

        cat["folderName"] = new_folder

    cat["name"] = body.name
    save_index(index)

    return {"ok": True, "renamed": renamed, "category": cat}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: str):
    """
    카테고리 삭제
    안에 메모가 있으면 hasPages: True 반환 (삭제 불가)
    하위 카테고리가 있으면 hasChildren: True 반환 (삭제 불가)
    삭제 성공 시 부모의 categoryChildOrder에서도 제거
    Python으로 치면: if children or pages: return error; shutil.rmtree(cat_dir)
    """
    # 🔒 UUID 검증
    validate_uuid(cat_id, "카테고리 ID")

    index = load_index()

    # 카테고리 찾기
    cat = next((c for c in index.get("categories", []) if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")

    # 1) 하위 카테고리가 있으면 삭제 불가
    # Python으로 치면: children = child_order.get(cat_id, [])
    children = index.get("categoryChildOrder", {}).get(cat_id, [])
    if children:
        return {"ok": False, "hasChildren": True, "count": len(children)}

    # 2) 카테고리 안에 페이지가 있으면 삭제 불가
    pages_in_cat = [pid for pid, cid in index.get("categoryMap", {}).items() if cid == cat_id]
    if pages_in_cat:
        return {"ok": False, "hasPages": True, "count": len(pages_in_cat)}

    # 실제 폴더 삭제 (비어있는 경우)
    cat_dir = VAULT_DIR / cat["folderName"]

    # 🔒 vault 탈출 방지
    assert_inside_vault(cat_dir)

    if cat_dir.exists():
        shutil.rmtree(cat_dir)

    # index에서 카테고리 제거
    index["categories"] = [c for c in index["categories"] if c["id"] != cat_id]

    # 최상위 순서에서 제거 (최상위 카테고리인 경우)
    index["categoryOrder"] = [cid for cid in index.get("categoryOrder", []) if cid != cat_id]

    # 부모의 childOrder에서 제거 (하위 카테고리인 경우)
    # Python으로 치면: parent_id = cat.get('parentId'); if parent_id: child_order[parent_id].remove(cat_id)
    parent_id = cat.get("parentId")
    if parent_id:
        child_order = index.get("categoryChildOrder", {})
        if parent_id in child_order:
            child_order[parent_id] = [cid for cid in child_order[parent_id] if cid != cat_id]
            # 자식 없어진 부모의 빈 리스트 제거
            if not child_order[parent_id]:
                del child_order[parent_id]

    # categoryChildOrder에서 이 카테고리 키 자체도 제거 (이미 빈 상태지만 정리)
    index.get("categoryChildOrder", {}).pop(cat_id, None)

    save_index(index)

    return {"ok": True, "hasPages": False}


@router.patch("/categories/{cat_id}/move")
def move_category(cat_id: str, body: MoveFolderBody):
    """
    카테고리(폴더)를 다른 부모로 이동
    body.parentId = None  → 최상위로 이동
    body.parentId = str   → 해당 카테고리의 자식으로 이동
    순환 참조(자신의 하위로 이동) 방지
    Python으로 치면: category.parentId = body.parentId; save()
    """
    # 🔒 UUID 검증
    validate_uuid(cat_id, "카테고리 ID")
    if body.parentId is not None:
        validate_uuid(body.parentId, "대상 부모 카테고리 ID")

    index = load_index()
    categories = index.get("categories", [])

    # 이동할 카테고리 찾기
    cat = next((c for c in categories if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")

    # 자기 자신으로 이동 불가
    if body.parentId == cat_id:
        raise HTTPException(status_code=400, detail="자기 자신의 자식으로 이동할 수 없습니다")

    # 🔒 순환 참조 방지: body.parentId가 cat_id의 하위 폴더면 거부
    # Python으로 치면: BFS로 cat_id 하위를 모두 탐색
    if body.parentId is not None:
        child_order = index.get("categoryChildOrder", {})
        queue = list(child_order.get(cat_id, []))
        while queue:
            descendant_id = queue.pop()
            if descendant_id == body.parentId:
                raise HTTPException(status_code=400, detail="폴더의 하위 폴더로 이동할 수 없습니다")
            queue.extend(child_order.get(descendant_id, []))

    # 새 부모 카테고리 존재 여부 확인
    if body.parentId is not None:
        parent_cat = next((c for c in categories if c["id"] == body.parentId), None)
        if not parent_cat:
            raise HTTPException(status_code=404, detail="대상 부모 카테고리를 찾을 수 없습니다")

    old_parent_id = cat.get("parentId")
    new_parent_id = body.parentId

    # 이미 같은 부모면 무시
    if old_parent_id == new_parent_id:
        return {"ok": True, "category": cat}

    child_order = index.setdefault("categoryChildOrder", {})

    # ── 기존 부모에서 제거 ────────────────────────────
    # Python으로 치면: old_parent.children.remove(cat_id)
    if old_parent_id is None:
        index["categoryOrder"] = [cid for cid in index.get("categoryOrder", []) if cid != cat_id]
    else:
        if old_parent_id in child_order:
            child_order[old_parent_id] = [cid for cid in child_order[old_parent_id] if cid != cat_id]
            if not child_order[old_parent_id]:
                del child_order[old_parent_id]

    # ── 새 부모에 추가 (맨 뒤) ──────────────────────
    # Python으로 치면: new_parent.children.append(cat_id)
    if new_parent_id is None:
        index.setdefault("categoryOrder", []).append(cat_id)
    else:
        child_order.setdefault(new_parent_id, []).append(cat_id)

    # 카테고리 parentId 업데이트
    cat["parentId"] = new_parent_id

    save_index(index)
    return {"ok": True, "category": cat}


@router.patch("/categories/reorder")
def reorder_categories(body: CategoryReorderBody):
    """
    최상위 카테고리 표시 순서 변경
    Python으로 치면: index['categoryOrder'] = body.order; save()
    """
    index = load_index()
    index["categoryOrder"] = body.order
    save_index(index)
    return {"ok": True}


@router.patch("/categories/{parent_id}/reorder-children")
def reorder_children(parent_id: str, body: CategoryReorderBody):
    """
    특정 카테고리의 하위 폴더 순서 변경
    Python으로 치면: index['categoryChildOrder'][parent_id] = body.order; save()
    """
    # 🔒 UUID 검증
    validate_uuid(parent_id, "부모 카테고리 ID")

    index = load_index()

    # 부모 카테고리 존재 확인
    parent = next((c for c in index.get("categories", []) if c["id"] == parent_id), None)
    if not parent:
        raise HTTPException(status_code=404, detail="부모 카테고리를 찾을 수 없습니다")

    # 하위 순서 업데이트
    index.setdefault("categoryChildOrder", {})[parent_id] = body.order
    save_index(index)
    return {"ok": True}
