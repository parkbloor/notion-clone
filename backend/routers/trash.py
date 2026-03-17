# ==============================================
# backend/routers/trash.py
# 역할: 휴지통 CRUD — 목록 조회 / 복원 / 영구 삭제 / 전체 비우기
# Python으로 치면: Flask Blueprint('trash', ...)
# ==============================================

import shutil
import uuid

from fastapi import APIRouter, HTTPException

from backend.core import (
    VAULT_DIR,
    assert_inside_vault,
    get_page_dir,
    load_index,
    now_iso,
    save_index,
    validate_uuid,
)

router = APIRouter(prefix="/api", tags=["trash"])


# -----------------------------------------------
# 휴지통 목록 조회
# isTrashed=True인 페이지 + 카테고리 모두 반환
# Python으로 치면: def get_trash(): return [p for p in pages if p.is_trashed]
# -----------------------------------------------
@router.get("/trash")
def get_trash():
    index = load_index()

    # 삭제된 페이지 수집
    trashed_pages = [
        {**p, "itemType": "page"}
        for p in index.get("pages", [])
        if p.get("isTrashed")
    ]

    # 삭제된 카테고리 수집
    trashed_cats = [
        {**c, "itemType": "category"}
        for c in index.get("categories", [])
        if c.get("isTrashed")
    ]

    # trashedAt 기준 최신순 정렬
    # Python으로 치면: sorted(items, key=lambda x: x.get('trashedAt', ''), reverse=True)
    all_items = sorted(
        trashed_pages + trashed_cats,
        key=lambda x: x.get("trashedAt", ""),
        reverse=True,
    )

    return {"items": all_items}


# -----------------------------------------------
# 항목 복원 — 원위치 복원, 폴더 없으면 미분류
# trashGroupId가 있으면 같은 그룹 전체 복원
# Python으로 치면: def restore(item_id): item.is_trashed = False; item.group = None
# -----------------------------------------------
@router.patch("/trash/{item_id}/restore")
def restore_item(item_id: str):
    validate_uuid(item_id, "항목 ID")

    index = load_index()
    now = now_iso()

    # 페이지인지 카테고리인지 확인
    page = next((p for p in index.get("pages", []) if p["id"] == item_id), None)
    cat  = next((c for c in index.get("categories", []) if c["id"] == item_id), None)

    if not page and not cat:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")

    target = page or cat
    if not target.get("isTrashed"):
        raise HTTPException(status_code=400, detail="휴지통에 없는 항목입니다")

    group_id = target.get("trashGroupId")

    # ── 그룹 복원: 같은 trashGroupId를 가진 항목 전체 복원 ──
    # Python으로 치면: for item in items: if item.group_id == group_id: restore(item)
    if group_id:
        existing_cat_ids = {c["id"] for c in index.get("categories", []) if not c.get("isTrashed")}

        for p in index.get("pages", []):
            if p.get("trashGroupId") != group_id or not p.get("isTrashed"):
                continue
            orig_cat = p.get("originalCategoryId")
            # 원래 카테고리가 살아있으면 원위치, 없으면 미분류(None)
            p["categoryId"] = orig_cat if orig_cat in existing_cat_ids else None
            if p["categoryId"] and p["categoryId"] not in index.get("categoryMap", {}):
                index.setdefault("categoryMap", {})[p["id"]] = p["categoryId"]
            elif not p["categoryId"]:
                index.get("categoryMap", {}).pop(p["id"], None)
            p["isTrashed"] = False
            p["trashedAt"] = None
            p["trashGroupId"] = None
            p["originalCategoryId"] = None
            if p["id"] not in index.get("pageOrder", []):
                index.setdefault("pageOrder", []).append(p["id"])

        for c in index.get("categories", []):
            if c.get("trashGroupId") != group_id or not c.get("isTrashed"):
                continue
            orig_parent = c.get("originalParentId")
            # 원래 부모가 살아있으면 원위치, 없으면 최상위
            c["parentId"] = orig_parent if orig_parent in existing_cat_ids else None
            if c["parentId"]:
                child_order = index.setdefault("categoryChildOrder", {})
                if c["id"] not in child_order.setdefault(c["parentId"], []):
                    child_order[c["parentId"]].append(c["id"])
            else:
                if c["id"] not in index.get("categoryOrder", []):
                    index.setdefault("categoryOrder", []).append(c["id"])
            c["isTrashed"] = False
            c["trashedAt"] = None
            c["trashGroupId"] = None
            c["originalParentId"] = None

    else:
        # ── 단독 복원 (페이지 개별 삭제) ──
        existing_cat_ids = {c["id"] for c in index.get("categories", []) if not c.get("isTrashed")}

        if page:
            orig_cat = page.get("originalCategoryId")
            page["isTrashed"] = False
            page["trashedAt"] = None
            page["originalCategoryId"] = None
            restored_cat = orig_cat if orig_cat in existing_cat_ids else None
            if restored_cat:
                index.setdefault("categoryMap", {})[page["id"]] = restored_cat
            else:
                index.get("categoryMap", {}).pop(page["id"], None)
            if page["id"] not in index.get("pageOrder", []):
                index.setdefault("pageOrder", []).append(page["id"])

        elif cat:
            orig_parent = cat.get("originalParentId")
            cat["isTrashed"] = False
            cat["trashedAt"] = None
            cat["originalParentId"] = None
            restored_parent = orig_parent if orig_parent in existing_cat_ids else None
            cat["parentId"] = restored_parent
            if restored_parent:
                child_order = index.setdefault("categoryChildOrder", {})
                if cat["id"] not in child_order.setdefault(restored_parent, []):
                    child_order[restored_parent].append(cat["id"])
            else:
                if cat["id"] not in index.get("categoryOrder", []):
                    index.setdefault("categoryOrder", []).append(cat["id"])

    save_index(index)
    return {"ok": True}


# -----------------------------------------------
# 항목 영구 삭제 — 물리 파일 제거 + 인덱스에서 제거
# trashGroupId가 있으면 같은 그룹 전체 영구 삭제
# Python으로 치면: shutil.rmtree(path); index.remove(item)
# -----------------------------------------------
@router.delete("/trash/{item_id}")
def permanent_delete(item_id: str):
    validate_uuid(item_id, "항목 ID")

    index = load_index()

    page = next((p for p in index.get("pages", []) if p["id"] == item_id), None)
    cat  = next((c for c in index.get("categories", []) if c["id"] == item_id), None)

    if not page and not cat:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")

    target = page or cat
    group_id = target.get("trashGroupId")

    # 그룹 전체 영구 삭제
    if group_id:
        page_ids = [p["id"] for p in index.get("pages", []) if p.get("trashGroupId") == group_id]
        cat_ids  = [c["id"] for c in index.get("categories", []) if c.get("trashGroupId") == group_id]
    else:
        page_ids = [item_id] if page else []
        cat_ids  = [item_id] if cat  else []

    # 페이지 물리 파일 제거
    for pid in page_ids:
        page_dir = get_page_dir(pid, index)
        assert_inside_vault(page_dir)
        if page_dir.exists():
            shutil.rmtree(page_dir)

    # 카테고리 물리 폴더 제거 (비어있는 경우만 — 페이지는 이미 위에서 처리됨)
    for cid in cat_ids:
        c = next((x for x in index.get("categories", []) if x["id"] == cid), None)
        if c:
            cat_dir = VAULT_DIR / c.get("folderName", "")
            if cat_dir != VAULT_DIR:
                assert_inside_vault(cat_dir)
                if cat_dir.exists():
                    shutil.rmtree(cat_dir)

    # 인덱스에서 제거
    index["pages"] = [p for p in index.get("pages", []) if p["id"] not in page_ids]
    index["categories"] = [c for c in index.get("categories", []) if c["id"] not in cat_ids]
    index["pageOrder"] = [pid for pid in index.get("pageOrder", []) if pid not in page_ids]
    index["categoryOrder"] = [cid for cid in index.get("categoryOrder", []) if cid not in cat_ids]

    for pid in page_ids:
        index.get("folderMap", {}).pop(pid, None)
        index.get("categoryMap", {}).pop(pid, None)

    for cid in cat_ids:
        index.get("categoryChildOrder", {}).pop(cid, None)
        for parent_list in index.get("categoryChildOrder", {}).values():
            if cid in parent_list:
                parent_list.remove(cid)

    save_index(index)
    return {"ok": True}


# -----------------------------------------------
# 전체 비우기 — isTrashed=True인 모든 항목 영구 삭제
# Python으로 치면: for item in trash: permanent_delete(item)
# -----------------------------------------------
@router.delete("/trash")
def empty_trash():
    index = load_index()

    trashed_page_ids = [p["id"] for p in index.get("pages", []) if p.get("isTrashed")]
    trashed_cat_ids  = [c["id"] for c in index.get("categories", []) if c.get("isTrashed")]

    # 페이지 물리 파일 제거
    for pid in trashed_page_ids:
        page_dir = get_page_dir(pid, index)
        assert_inside_vault(page_dir)
        if page_dir.exists():
            shutil.rmtree(page_dir)

    # 카테고리 물리 폴더 제거
    for cid in trashed_cat_ids:
        c = next((x for x in index.get("categories", []) if x["id"] == cid), None)
        if c:
            cat_dir = VAULT_DIR / c.get("folderName", "")
            if cat_dir != VAULT_DIR:
                assert_inside_vault(cat_dir)
                if cat_dir.exists():
                    shutil.rmtree(cat_dir)

    # 인덱스 정리
    index["pages"] = [p for p in index.get("pages", []) if not p.get("isTrashed")]
    index["categories"] = [c for c in index.get("categories", []) if not c.get("isTrashed")]
    index["pageOrder"] = [pid for pid in index.get("pageOrder", []) if pid not in trashed_page_ids]
    index["categoryOrder"] = [cid for cid in index.get("categoryOrder", []) if cid not in trashed_cat_ids]

    for pid in trashed_page_ids:
        index.get("folderMap", {}).pop(pid, None)
        index.get("categoryMap", {}).pop(pid, None)

    for cid in trashed_cat_ids:
        index.get("categoryChildOrder", {}).pop(cid, None)
        for parent_list in index.get("categoryChildOrder", {}).values():
            if cid in parent_list:
                parent_list.remove(cid)

    save_index(index)
    return {"ok": True, "deleted": len(trashed_page_ids) + len(trashed_cat_ids)}
