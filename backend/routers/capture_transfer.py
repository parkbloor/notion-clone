# ==============================================
# backend/routers/capture_transfer.py
# 역할: 포스트잇 한 줄을 같은 볼트의 고정 메모로 중복 없이 복사
# ==============================================

import copy
import html
import json
import re
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import (
    CONTENT_EXT,
    get_vault_dir,
    get_vaults_root,
    get_page_dir,
    load_index,
    load_page,
    now_iso,
    save_page_to_disk,
    serialized_vault_write,
    validate_uuid,
)


router = APIRouter(prefix="/api/capture-transfers", tags=["capture-transfers"])


class CaptureTransferRequest(BaseModel):
    sourcePageId: str
    sourceBlockId: str
    sourceEntryId: str = Field(min_length=1, max_length=128)
    destinationPageId: str
    sourceRevision: int = Field(ge=0)
    destinationRevision: int = Field(ge=0)
    kind: Literal["task", "note"]


class CrossVaultCaptureTransferRequest(CaptureTransferRequest):
    destinationVaultName: str = Field(min_length=1, max_length=80)


def _walk_blocks(blocks: list[dict]):
    for block in blocks:
        if not isinstance(block, dict):
            continue
        yield block
        children = block.get("children")
        if isinstance(children, list):
            yield from _walk_blocks(children)


def _find_block(blocks: list[dict], block_id: str) -> dict | None:
    return next((block for block in _walk_blocks(blocks) if block.get("id") == block_id), None)


def _capture_data(block: dict) -> dict:
    try:
        data = json.loads(block.get("content", ""))
    except (json.JSONDecodeError, TypeError):
        data = None
    if not isinstance(data, dict) or data.get("version") != 2 or not isinstance(data.get("entries"), list):
        raise HTTPException(status_code=409, detail="포스트잇을 먼저 저장한 뒤 다시 분류해 주세요.")
    return data


def _entry_text(entry: dict) -> tuple[str, bool]:
    text = entry.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="빈 포스트잇은 분류할 수 없습니다.")
    task = re.match(r"^- \[([ xX])\]\s?(.*)$", text)
    if task:
        return task.group(2).strip(), task.group(1).lower() == "x"
    bullet = re.match(r"^-\s+(.*)$", text)
    return (bullet.group(1) if bullet else text).strip(), False


def _is_continuation_entry(entry: dict) -> bool:
    """탭 또는 공백 두 칸으로 시작하는 비어 있지 않은 줄만 하위 내용으로 본다."""
    text = entry.get("text")
    return isinstance(text, str) and bool(text.strip()) and (text.startswith("\t") or text.startswith("  "))


def _is_first_numbered_child(parent: dict, entry: dict) -> bool:
    """불릿 제목 바로 뒤의 1번 항목은 들여쓰기가 없어도 하위 목록의 시작으로 본다."""
    parent_text = parent.get("text")
    text = entry.get("text")
    return (
        isinstance(parent_text, str)
        and re.match(r"^-\s+\S", parent_text) is not None
        and isinstance(text, str)
        and re.match(r"^1[.)]\s+\S", text) is not None
    )


def _capture_entry_group(entries: list, source_entry_id: str) -> list[dict]:
    """선택한 상위 줄과 바로 뒤의 연속된 들여쓰기 줄을 하나의 묶음으로 반환한다."""
    entry_index = next((
        index for index, item in enumerate(entries)
        if isinstance(item, dict) and item.get("id") == source_entry_id
    ), None)
    if entry_index is None:
        raise HTTPException(status_code=404, detail="포스트잇 항목을 찾을 수 없습니다.")

    # 하위 줄이 직접 요청되어도 가장 가까운 상위 줄부터 같은 묶음으로 처리한다.
    # Python으로 치면: while current.is_child(): current = previous
    group_start = entry_index
    while group_start > 0:
        if _is_continuation_entry(entries[group_start]):
            previous_entry = entries[group_start - 1]
            previous_text = previous_entry.get("text") if isinstance(previous_entry, dict) else None
            # 빈 줄은 화면에서도 묶음을 끊으므로 서버 역시 그 경계를 넘어가지 않는다.
            # Python으로 치면: if not previous.text.strip(): break
            if not isinstance(previous_text, str) or not previous_text.strip():
                break
            group_start -= 1
            continue
        if _is_first_numbered_child(entries[group_start - 1], entries[group_start]):
            group_start -= 1
        break
    group = [entries[group_start]]
    for item in entries[group_start + 1:]:
        if not isinstance(item, dict):
            break
        if _is_continuation_entry(item) or (len(group) == 1 and _is_first_numbered_child(group[0], item)):
            group.append(item)
            continue
        break

    transfer_states = {
        item.get("transfer", {}).get("transferId") if isinstance(item.get("transfer"), dict) else "pending"
        for item in group
    }
    if len(transfer_states) > 1:
        # 화면은 분류 상태가 섞인 묶음을 줄별로 분리하므로 서버도 선택한 한 줄만 처리한다.
        # Python으로 치면: return [selected] if group.has_mixed_transfer_state() else group
        return [entries[entry_index]]
    return group


def _entry_lines(entries: list[dict]) -> tuple[list[str], bool]:
    """상위 줄의 할 일 상태를 보존하고 하위 줄은 들여쓰기만 제거한다."""
    parent_text, checked = _entry_text(entries[0])
    child_lines = [str(entry.get("text", "")).lstrip() for entry in entries[1:]]
    return [parent_text, *child_lines], checked


def _target_block(lines: list[str], checked: bool, kind: str, source: dict, now: str) -> dict:
    block_id = str(uuid.uuid4())
    source_date = source.get("sourceDate") or "날짜 없음"
    source_vault = source.get("sourceVaultName") or "볼트"
    source_page = source.get("sourcePageTitle") or "원본 메모"
    source_label = f"작성 {source_date} · 출처: {source_vault} · {source_page}"
    footnote = f'<span data-footnote="" data-text="{html.escape(source_label, quote=True)}">[^출처]</span>'
    line_content = "<br />".join(html.escape(line) for line in lines)
    if kind == "task":
        content = (
            '<ul data-type="taskList">'
            f'<li data-type="taskItem" data-checked="{str(checked).lower()}">'
            f'<label><input type="checkbox"{" checked" if checked else ""} /><span></span></label>'
            f'<div><p>{line_content} {footnote}</p></div></li></ul>'
        )
        block_type = "taskList"
    else:
        content = f"<p>{line_content} {footnote}</p>"
        block_type = "paragraph"
    return {
        "id": block_id,
        "type": block_type,
        "content": content,
        "children": [],
        "createdAt": now,
        "updatedAt": now,
        "captureSource": {**source, "destinationBlockId": block_id},
    }


def _classification_date() -> str:
    """사용자 컴퓨터의 현지 날짜를 분류 그룹 날짜로 사용한다."""
    return datetime.now().astimezone().date().isoformat()


def _group_header(classified_date: str, now: str) -> dict:
    """같은 날 분류된 항목을 모으는 눈에 보이는 제목 블록을 만든다."""
    return {
        "id": str(uuid.uuid4()),
        "type": "heading3",
        "content": f"<h3>📥 {html.escape(classified_date)} 분류</h3>",
        "children": [],
        "createdAt": now,
        "updatedAt": now,
        "captureTransferGroup": True,
        "captureTransferGroupDate": classified_date,
    }


def _append_to_classification_group(destination_page: dict, destination_block: dict, classified_date: str, now: str) -> None:
    """분류 날짜 제목을 재사용하고 출처 각주가 포함된 단일 항목 블록을 삽입한다."""
    blocks = destination_page.setdefault("blocks", [])
    destination_block["captureTransferGroupDate"] = classified_date
    group_index = next((
        index for index, block in enumerate(blocks)
        if isinstance(block, dict)
        and block.get("captureTransferGroup") is True
        and block.get("captureTransferGroupDate") == classified_date
    ), None)
    if group_index is None:
        blocks.append(_group_header(classified_date, now))
        blocks.append(destination_block)
        return

    insert_index = len(blocks)
    for index in range(group_index + 1, len(blocks)):
        block = blocks[index]
        if isinstance(block, dict) and block.get("captureTransferGroup") is True:
            insert_index = index
            break
    destination_block["captureTransferGroupDate"] = classified_date
    blocks.insert(insert_index, destination_block)


def _save_transfer_pages(
    destination_page: dict,
    destination_dir,
    source_page: dict,
    source_dir,
    destination_before: dict | None,
) -> None:
    """대상을 먼저 저장하고 원본 저장이 실패하면 대상을 직전 상태로 되돌린다."""
    if destination_before is not None:
        save_page_to_disk(destination_page, destination_dir)
    try:
        save_page_to_disk(source_page, source_dir)
    except Exception as source_error:
        if destination_before is not None:
            try:
                # Python으로 치면: save(destination_before) if save(source) failed
                save_page_to_disk(destination_before, destination_dir)
            except Exception as rollback_error:
                raise HTTPException(
                    status_code=500,
                    detail="원본 저장과 대상 메모 복구가 모두 실패했습니다. 두 메모를 직접 확인해 주세요.",
                ) from rollback_error
        raise source_error


def _vault_path(vault_name: str):
    name = vault_name.strip()
    if not re.match(r'^[^/\\:*?"<>|\x00]+$', name) or '..' in name or name == '.':
        raise HTTPException(status_code=400, detail="허용되지 않는 볼트 이름입니다.")
    root = get_vaults_root().resolve()
    vault = (root / name).resolve()
    try:
        vault.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="볼트 경로가 루트 밖을 벗어납니다.") from exc
    if not vault.is_dir():
        raise HTTPException(status_code=404, detail="대상 볼트를 찾을 수 없습니다.")
    return name, vault


def _load_external_index(vault) -> dict:
    for filename in ("_index.nct", "_index.json"):
        path = vault / filename
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (OSError, json.JSONDecodeError):
            break
    return {"pageOrder": [], "folderMap": {}, "categoryMap": {}, "categories": []}


def _external_page_dir(vault, page_id: str, index: dict):
    folder = index.get("folderMap", {}).get(page_id) or page_id
    category_id = index.get("categoryMap", {}).get(page_id)
    categories = {item.get("id"): item for item in index.get("categories", []) if isinstance(item, dict)}
    chain: list[str] = []
    visited: set[str] = set()
    while category_id and category_id not in visited:
        visited.add(category_id)
        category = categories.get(category_id)
        if not category or not isinstance(category.get("folderName"), str):
            break
        chain.append(category["folderName"])
        category_id = category.get("parentId")
    return vault.joinpath(*reversed(chain), folder)


def _load_external_page(vault, page_id: str, index: dict) -> dict | None:
    page_dir = _external_page_dir(vault, page_id, index)
    for filename in (f"content{CONTENT_EXT}", "content.json"):
        path = page_dir / filename
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except (OSError, json.JSONDecodeError):
            return None
    return None


def _external_capture_destinations(vault, index: dict) -> list[dict]:
    preferences_path = vault / "_vault_preferences.json"
    try:
        raw = json.loads(preferences_path.read_text(encoding="utf-8")) if preferences_path.exists() else {}
    except (OSError, json.JSONDecodeError):
        raw = {}
    planner = raw.get("planner", {}) if isinstance(raw, dict) else {}
    destinations = planner.get("captureDestinations", []) if isinstance(planner, dict) else []
    result: list[dict] = []
    seen_page_ids: set[str] = set()
    for item in destinations if isinstance(destinations, list) else []:
        if not isinstance(item, dict):
            continue
        destination_id, page_id, kind = item.get("id"), item.get("pageId"), item.get("kind")
        if not isinstance(destination_id, str) or not isinstance(page_id, str) or kind not in {"task", "note"} or page_id in seen_page_ids:
            continue
        page = _load_external_page(vault, page_id, index)
        if not page or page.get("pageRole") == "postit-month":
            continue
        result.append({
            "id": destination_id,
            "pageId": page_id,
            "kind": kind,
            "pageTitle": page.get("title") if isinstance(page.get("title"), str) else "",
            "pageIcon": page.get("icon") if isinstance(page.get("icon"), str) else "📝",
            "revision": int(page.get("revision", 0)),
        })
        seen_page_ids.add(page_id)
    return result


@router.get("/destinations")
def get_cross_vault_destinations():
    """Expose only user-pinned destination notes from other vaults, never their full page trees."""
    current = get_vault_dir().resolve()
    vaults: list[dict] = []
    try:
        entries = sorted(get_vaults_root().iterdir(), key=lambda item: item.name.casefold())
    except OSError:
        entries = []
    for vault in entries:
        if not vault.is_dir() or vault.resolve() == current:
            continue
        index = _load_external_index(vault)
        destinations = _external_capture_destinations(vault, index)
        if destinations:
            vaults.append({"name": vault.name, "destinations": destinations})
    return {"vaults": vaults}


@router.post("")
@serialized_vault_write
def transfer_capture_entry(body: CaptureTransferRequest):
    """Append one captured line then mark the source only after the target is durable."""
    for page_id, label in ((body.sourcePageId, "원본 페이지 ID"), (body.destinationPageId, "대상 페이지 ID")):
        validate_uuid(page_id, label)
    validate_uuid(body.sourceBlockId, "원본 블록 ID")
    if body.sourcePageId == body.destinationPageId:
        raise HTTPException(status_code=400, detail="포스트잇이 있는 메모에는 다시 분류할 수 없습니다.")

    index = load_index()
    source_page = load_page(body.sourcePageId, index)
    destination_page = load_page(body.destinationPageId, index)
    if not source_page or not destination_page:
        raise HTTPException(status_code=404, detail="원본 또는 대상 메모를 찾을 수 없습니다.")
    if destination_page.get("pageRole") == "postit-month":
        raise HTTPException(status_code=400, detail="월간 포스트잇 기록은 분류 대상이 될 수 없습니다.")
    if int(source_page.get("revision", 0)) != body.sourceRevision or int(destination_page.get("revision", 0)) != body.destinationRevision:
        raise HTTPException(status_code=409, detail="다른 창의 변경이 있어 최신 내용을 확인한 뒤 다시 분류해 주세요.")

    source_block = _find_block(source_page.get("blocks") or [], body.sourceBlockId)
    if not source_block or source_block.get("type") != "dailycapture":
        raise HTTPException(status_code=404, detail="원본 포스트잇 기록을 찾을 수 없습니다.")
    capture = _capture_data(source_block)
    entry_group = _capture_entry_group(capture["entries"], body.sourceEntryId)
    entry = entry_group[0]
    source_entry_id = entry["id"]

    transfer_id = f"{body.sourcePageId}:{body.sourceBlockId}:{source_entry_id}:{body.destinationPageId}"
    existing_transfers = [item.get("transfer") for item in entry_group]
    if any(isinstance(transfer, dict) for transfer in existing_transfers):
        if all(isinstance(transfer, dict) and transfer.get("transferId") == transfer_id for transfer in existing_transfers):
            return {"sourcePage": source_page, "destinationPage": destination_page, "alreadyTransferred": True}
        raise HTTPException(status_code=409, detail="이 포스트잇 묶음의 일부가 이미 다른 메모로 분류되었습니다.")

    now = now_iso()
    classified_date = _classification_date()
    lines, checked = _entry_lines(entry_group)
    source = {
        "transferId": transfer_id,
        "sourceVaultName": get_vault_dir().name,
        "sourcePageId": body.sourcePageId,
        "sourcePageTitle": source_page.get("title") if isinstance(source_page.get("title"), str) else "",
        "sourceBlockId": body.sourceBlockId,
        "sourceEntryId": source_entry_id,
        "sourceEntryIds": [item["id"] for item in entry_group],
        "sourceDate": capture.get("date") if isinstance(capture.get("date"), str) else "",
        "kind": body.kind,
        "classifiedDate": classified_date,
        "transferredAt": now,
    }
    destination_block = next(
        (block for block in _walk_blocks(destination_page.get("blocks") or [])
         if isinstance(block.get("captureSource"), dict) and block["captureSource"].get("transferId") == transfer_id),
        None,
    )
    destination_before = copy.deepcopy(destination_page) if destination_block is None else None
    if destination_block is None:
        destination_block = _target_block(lines, checked, body.kind, source, now)
        _append_to_classification_group(destination_page, destination_block, classified_date, now)
        destination_page["revision"] = int(destination_page.get("revision", 0)) + 1
        destination_page["updatedAt"] = now

    transfer = {
        "transferId": transfer_id,
        "destinationPageId": body.destinationPageId,
        "destinationBlockId": destination_block["id"],
        "kind": body.kind,
        "classifiedDate": classified_date,
        "transferredAt": now,
    }
    for grouped_entry in entry_group:
        grouped_entry["transfer"] = {**transfer}
    source_block["content"] = json.dumps(capture, ensure_ascii=False)
    source_block["updatedAt"] = now
    source_page["revision"] = int(source_page.get("revision", 0)) + 1
    source_page["updatedAt"] = now
    # 대상 저장 뒤 원본 저장이 실패하면 새 대상 블록도 함께 되돌린다.
    _save_transfer_pages(
        destination_page,
        get_page_dir(body.destinationPageId, index),
        source_page,
        get_page_dir(body.sourcePageId, index),
        destination_before,
    )
    return {"sourcePage": source_page, "destinationPage": destination_page, "alreadyTransferred": False}


@router.post("/cross-vault")
@serialized_vault_write
def transfer_capture_entry_to_other_vault(body: CrossVaultCaptureTransferRequest):
    """Copy only after the user explicitly selects a pinned note in another vault."""
    for page_id, label in ((body.sourcePageId, "원본 페이지 ID"), (body.destinationPageId, "대상 페이지 ID")):
        validate_uuid(page_id, label)
    validate_uuid(body.sourceBlockId, "원본 블록 ID")

    destination_vault_name, destination_vault = _vault_path(body.destinationVaultName)
    source_vault_name = get_vault_dir().name
    if destination_vault.resolve() == get_vault_dir().resolve():
        raise HTTPException(status_code=400, detail="같은 볼트 분류는 일반 분류함을 사용해 주세요.")

    source_index = load_index()
    source_page = load_page(body.sourcePageId, source_index)
    destination_index = _load_external_index(destination_vault)
    destination_page = _load_external_page(destination_vault, body.destinationPageId, destination_index)
    if not source_page or not destination_page:
        raise HTTPException(status_code=404, detail="원본 또는 대상 메모를 찾을 수 없습니다.")
    if destination_page.get("pageRole") == "postit-month":
        raise HTTPException(status_code=400, detail="월간 포스트잇 기록은 분류 대상이 될 수 없습니다.")
    if int(source_page.get("revision", 0)) != body.sourceRevision or int(destination_page.get("revision", 0)) != body.destinationRevision:
        raise HTTPException(status_code=409, detail="대상 메모가 변경되었습니다. 목적지를 다시 선택해 주세요.")

    source_block = _find_block(source_page.get("blocks") or [], body.sourceBlockId)
    if not source_block or source_block.get("type") != "dailycapture":
        raise HTTPException(status_code=404, detail="원본 포스트잇 기록을 찾을 수 없습니다.")
    capture = _capture_data(source_block)
    entry_group = _capture_entry_group(capture["entries"], body.sourceEntryId)
    entry = entry_group[0]
    source_entry_id = entry["id"]

    transfer_id = f"{source_vault_name}:{body.sourcePageId}:{body.sourceBlockId}:{source_entry_id}:{destination_vault_name}:{body.destinationPageId}"
    existing_transfers = [item.get("transfer") for item in entry_group]
    if any(isinstance(transfer, dict) for transfer in existing_transfers):
        if all(isinstance(transfer, dict) and transfer.get("transferId") == transfer_id for transfer in existing_transfers):
            return {"sourcePage": source_page, "destinationPage": destination_page, "alreadyTransferred": True}
        raise HTTPException(status_code=409, detail="이 포스트잇 묶음의 일부가 이미 다른 메모로 분류되었습니다.")

    now = now_iso()
    classified_date = _classification_date()
    lines, checked = _entry_lines(entry_group)
    source = {
        "transferId": transfer_id,
        "sourceVaultName": source_vault_name,
        "sourcePageId": body.sourcePageId,
        "sourcePageTitle": source_page.get("title") if isinstance(source_page.get("title"), str) else "",
        "sourceBlockId": body.sourceBlockId,
        "sourceEntryId": source_entry_id,
        "sourceEntryIds": [item["id"] for item in entry_group],
        "sourceDate": capture.get("date") if isinstance(capture.get("date"), str) else "",
        "kind": body.kind,
        "classifiedDate": classified_date,
        "transferredAt": now,
    }
    destination_block = next(
        (block for block in _walk_blocks(destination_page.get("blocks") or [])
         if isinstance(block.get("captureSource"), dict) and block["captureSource"].get("transferId") == transfer_id),
        None,
    )
    destination_before = copy.deepcopy(destination_page) if destination_block is None else None
    if destination_block is None:
        destination_block = _target_block(lines, checked, body.kind, source, now)
        _append_to_classification_group(destination_page, destination_block, classified_date, now)
        destination_page["revision"] = int(destination_page.get("revision", 0)) + 1
        destination_page["updatedAt"] = now

    transfer = {
        "transferId": transfer_id,
        "destinationVaultName": destination_vault_name,
        "destinationPageId": body.destinationPageId,
        "destinationPageTitle": destination_page.get("title") if isinstance(destination_page.get("title"), str) else "",
        "destinationBlockId": destination_block["id"],
        "kind": body.kind,
        "classifiedDate": classified_date,
        "transferredAt": now,
    }
    for grouped_entry in entry_group:
        grouped_entry["transfer"] = {**transfer}
    source_block["content"] = json.dumps(capture, ensure_ascii=False)
    source_block["updatedAt"] = now
    source_page["revision"] = int(source_page.get("revision", 0)) + 1
    source_page["updatedAt"] = now
    # 다른 볼트에서도 선택한 대상 메모만 저장하며, 원본 실패 시 그 변경을 복구한다.
    _save_transfer_pages(
        destination_page,
        _external_page_dir(destination_vault, body.destinationPageId, destination_index),
        source_page,
        get_page_dir(body.sourcePageId, source_index),
        destination_before,
    )
    return {"sourcePage": source_page, "destinationPage": destination_page, "alreadyTransferred": False}
