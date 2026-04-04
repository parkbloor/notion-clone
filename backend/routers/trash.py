# ==============================================
# backend/routers/trash.py
# 역할: 휴지통 CRUD — _vault_trash/ 실물 폴더 기반
#   GET    /api/trash            — 목록 조회
#   PATCH  /api/trash/{id}/restore — 복원
#   DELETE /api/trash/{id}       — 영구 삭제
#   DELETE /api/trash            — 전체 비우기
#
# 이전 방식 (isTrashed 플래그) 폐기.
# 삭제 = 물리 이동, 복원 = 물리 역이동, 영구삭제 = shutil.rmtree
# Python으로 치면: Flask Blueprint('trash', ...)
# ==============================================

import shutil

from fastapi import APIRouter, HTTPException

from backend.core import (
    assert_inside_vault,
    get_cat_dir,
    get_trash_dir,
    get_vault_dir,
    load_index,
    load_trash_index,
    resolve_trash_name,
    save_index,
    save_trash_index,
    validate_uuid,
)

router = APIRouter(prefix="/api", tags=["trash"])


# -----------------------------------------------
# 휴지통 목록 조회
# _vault_trash/index.json 읽어서 반환
# Python으로 치면: def get_trash(): return json.load(open(trash_index))
# -----------------------------------------------
@router.get("/trash")
def get_trash():
    entries = load_trash_index()

    # 프론트엔드 TrashItem 형태로 변환
    # Python으로 치면: [_to_item(e) for e in entries sorted by trashedAt desc]
    items = []
    for e in sorted(entries, key=lambda x: x.get("trashedAt", ""), reverse=True):
        item = {
            "id":          e["id"],
            "itemType":    "page" if e["type"] == "page" else "category",
            "trashedAt":   e.get("trashedAt", ""),
        }
        if e["type"] == "page":
            item.update({
                "title":              e.get("title"),
                "icon":               e.get("icon"),
                "originalCategoryId": e.get("originalCategoryId"),
                "childCount":         0,
            })
        else:
            item.update({
                "name":             e.get("name"),
                "icon":             e.get("icon"),
                "originalParentId": e.get("originalParentId"),
                # children 배열 길이를 childCount로 노출 (패널의 그룹 배지용)
                "childCount": len(e.get("children", [])),
            })
        items.append(item)

    return {"items": items}


# -----------------------------------------------
# 항목 복원
# type="page"  → 단독 페이지 원위치 이동
# type="category" → 폴더 통째로 원위치 이동 + 하위 메타 _index.nct 재건
# Python으로 치면: def restore(id): shutil.move(trash/item, original_path)
# -----------------------------------------------
@router.patch("/trash/{item_id}/restore")
def restore_item(item_id: str):
    validate_uuid(item_id, "항목 ID")

    trash_entries = load_trash_index()
    entry = next((e for e in trash_entries if e["id"] == item_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="휴지통에 없는 항목입니다")

    index = load_index()
    trash_dir = get_trash_dir()
    trashed_path = trash_dir / entry["trashedFolderName"]

    if entry["type"] == "page":
        _restore_page(entry, index, trashed_path)
    else:
        _restore_category(entry, index, trashed_path)

    # 휴지통 인덱스에서 제거
    trash_entries = [e for e in trash_entries if e["id"] != item_id]
    save_trash_index(trash_entries)
    save_index(index)
    return {"ok": True}


def _restore_page(entry: dict, index: dict, trashed_path) -> None:
    """
    페이지 단독 복원
    원본 카테고리가 살아있으면 원위치, 없으면 vault 루트(미분류)
    Python으로 치면: shutil.move(trashed_path, dst); update_index(...)
    """
    page_id = entry["id"]
    orig_cat_id = entry.get("originalCategoryId")

    # 원본 카테고리 활성 여부 확인
    active_cat_ids = {c["id"] for c in index.get("categories", [])}
    if orig_cat_id and orig_cat_id in active_cat_ids:
        # 카테고리 내 원위치 복원 — 부모 체인 포함 경로 계산
        dst_parent = get_cat_dir(orig_cat_id, index)
        restored_cat_id = orig_cat_id
    else:
        # 원본 카테고리가 없으면 vault 루트에 미분류로 복원
        dst_parent = get_vault_dir()
        restored_cat_id = None

    # 이름 충돌 해결
    # Python으로 치면: dst_name = base_name + ('_1' if conflict else '')
    folder_name = entry["folderName"]
    dst_name = resolve_trash_name(folder_name, dst_parent)

    # 물리 이동
    if trashed_path.exists():
        dst_parent.mkdir(parents=True, exist_ok=True)
        assert_inside_vault(dst_parent)
        shutil.move(str(trashed_path), str(dst_parent / dst_name))

    # _index.nct 복원 (isTrashed 없이 깔끔하게)
    index.setdefault("folderMap", {})[page_id] = dst_name
    if restored_cat_id:
        index.setdefault("categoryMap", {})[page_id] = restored_cat_id
    else:
        index.get("categoryMap", {}).pop(page_id, None)
    if page_id not in index.get("pageOrder", []):
        index.setdefault("pageOrder", []).append(page_id)
    # 레거시 isTrashed 잔존 항목 정리
    index["pages"] = [p for p in index.get("pages", []) if p["id"] != page_id]


def _restore_category(entry: dict, index: dict, trashed_path) -> None:
    """
    카테고리 폴더 통째 복원
    원본 부모가 살아있으면 원위치, 없으면 vault 루트(최상위)로 복원
    Python으로 치면: shutil.move(trashed_path, dst); rebuild_index(entry.children)
    """
    cat_id = entry["id"]
    orig_parent_id = entry.get("originalParentId")

    # 원본 부모 카테고리 활성 여부 확인
    active_cat_ids = {c["id"] for c in index.get("categories", [])}
    if orig_parent_id and orig_parent_id in active_cat_ids:
        dst_parent = get_cat_dir(orig_parent_id, index)
        restored_parent_id = orig_parent_id
    else:
        dst_parent = get_vault_dir()
        restored_parent_id = None

    # 이름 충돌 해결
    folder_name = entry["folderName"]
    dst_name = resolve_trash_name(folder_name, dst_parent)

    # 물리 이동
    if trashed_path.exists():
        dst_parent.mkdir(parents=True, exist_ok=True)
        assert_inside_vault(dst_parent)
        shutil.move(str(trashed_path), str(dst_parent / dst_name))

    # ── _index.nct 재건: 대표 카테고리 등록 ────────────────
    cats_list = index.setdefault("categories", [])
    # 기존에 같은 ID가 없으면 추가 (레거시 isTrashed 항목은 제거 후 새로 추가)
    cats_list = [c for c in cats_list if c["id"] != cat_id]
    cats_list.append({
        "id":        cat_id,
        "name":      entry.get("name", ""),
        "folderName": dst_name,         # 충돌 시 변경된 이름 반영
        "parentId":  restored_parent_id,
        "icon":      entry.get("icon"),
        "color":     entry.get("color"),
    })
    index["categories"] = cats_list

    # categoryOrder / categoryChildOrder 갱신
    if restored_parent_id:
        child_order = index.setdefault("categoryChildOrder", {})
        if cat_id not in child_order.setdefault(restored_parent_id, []):
            child_order[restored_parent_id].append(cat_id)
    else:
        if cat_id not in index.get("categoryOrder", []):
            index.setdefault("categoryOrder", []).append(cat_id)

    # ── 하위 항목(children) 재건 ────────────────────────────
    # Python으로 치면: for child in entry.children: rebuild_index(child)
    for child in entry.get("children", []):
        if child["type"] == "category":
            _rebuild_sub_category(child, index)
        else:
            _rebuild_page(child, index)

    # 레거시 isTrashed 잔존 항목 정리
    restored_cat_ids = {cat_id} | {
        c["id"] for c in entry.get("children", []) if c["type"] == "category"
    }
    restored_page_ids = {
        c["id"] for c in entry.get("children", []) if c["type"] == "page"
    }
    index["pages"] = [p for p in index.get("pages", []) if p["id"] not in restored_page_ids]


def _rebuild_sub_category(child: dict, index: dict) -> None:
    """하위 카테고리를 _index.nct에 재등록"""
    cid = child["id"]
    cats_list = [c for c in index.get("categories", []) if c["id"] != cid]
    cats_list.append({
        "id":        cid,
        "name":      child.get("name", ""),
        "folderName": child.get("folderName", ""),
        "parentId":  child.get("originalParentId"),
    })
    index["categories"] = cats_list

    parent_id = child.get("originalParentId")
    if parent_id:
        child_order = index.setdefault("categoryChildOrder", {})
        if cid not in child_order.setdefault(parent_id, []):
            child_order[parent_id].append(cid)
    else:
        if cid not in index.get("categoryOrder", []):
            index.setdefault("categoryOrder", []).append(cid)


def _rebuild_page(child: dict, index: dict) -> None:
    """하위 페이지를 _index.nct에 재등록"""
    pid = child["id"]
    index.setdefault("folderMap", {})[pid] = child.get("folderName", pid)
    cat_id = child.get("originalCategoryId")
    if cat_id:
        index.setdefault("categoryMap", {})[pid] = cat_id
    else:
        index.get("categoryMap", {}).pop(pid, None)
    if pid not in index.get("pageOrder", []):
        index.setdefault("pageOrder", []).append(pid)


# -----------------------------------------------
# 영구 삭제 — _vault_trash 에서 물리 제거
# Python으로 치면: shutil.rmtree(trash/item); entries.remove(item)
# -----------------------------------------------
@router.delete("/trash/{item_id}")
def permanent_delete(item_id: str):
    validate_uuid(item_id, "항목 ID")

    trash_entries = load_trash_index()
    entry = next((e for e in trash_entries if e["id"] == item_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="휴지통에 없는 항목입니다")

    trash_path = get_trash_dir() / entry["trashedFolderName"]
    if trash_path.exists():
        assert_inside_vault(trash_path)
        shutil.rmtree(trash_path)

    trash_entries = [e for e in trash_entries if e["id"] != item_id]
    save_trash_index(trash_entries)
    return {"ok": True}


# -----------------------------------------------
# 전체 비우기 — 모든 항목 물리 삭제 + index.json 초기화
# Python으로 치면: for e in entries: shutil.rmtree(trash/e); entries = []
# -----------------------------------------------
@router.delete("/trash")
def empty_trash():
    trash_entries = load_trash_index()
    trash_dir = get_trash_dir()
    deleted = 0

    for entry in trash_entries:
        trash_path = trash_dir / entry["trashedFolderName"]
        if trash_path.exists():
            assert_inside_vault(trash_path)
            shutil.rmtree(trash_path)
            deleted += 1

    save_trash_index([])
    return {"ok": True, "deleted": deleted}
