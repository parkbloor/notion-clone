# ==============================================
# backend/routers/planner_recovery.py
# 역할: 모든 볼트의 Day Planner 원본 감사와 원본 보존 백업
# 데이터 이동·정규화·삭제는 이 라우터에서 수행하지 않는다.
# ==============================================

from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from fastapi import APIRouter, HTTPException

from backend.core import get_vaults_root, serialized_vault_write


router = APIRouter(prefix="/api/planner/recovery", tags=["planner-recovery"])

INDEX_FILE = "_index.nct"
CONTENT_FILE = "content.nct"
BACKUP_DIR = "_planner_recovery_backups"
PLANNER_META_FILES = (
    INDEX_FILE,
    "_planner_archive.json",
    "_planner_routines.json",
    "_vault_preferences.json",
)


def _vault_directories(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        (path for path in root.iterdir() if path.is_dir() and (path / INDEX_FILE).is_file()),
        key=lambda path: path.name.casefold(),
    )


def _iter_blocks(blocks: object) -> Iterator[dict[str, Any]]:
    if not isinstance(blocks, list):
        return
    for block in blocks:
        if not isinstance(block, dict):
            continue
        yield block
        yield from _iter_blocks(block.get("children"))


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _event_key(date_key: str, event: object) -> str:
    if isinstance(event, dict) and isinstance(event.get("id"), str) and event["id"]:
        return f"{date_key}:{event['id']}"
    normalized = json.dumps(event, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"{date_key}:sha256:{hashlib.sha256(normalized.encode('utf-8')).hexdigest()}"


def _planner_payload_summary(payload: object) -> tuple[str, dict[str, list[Any]], list[str]]:
    if not isinstance(payload, dict):
        return "invalid", {}, ["플래너 내용이 JSON 객체가 아닙니다."]

    current: dict[str, list[Any]] = {}
    issues: list[str] = []
    events_by_date = payload.get("eventsByDate")
    has_current = isinstance(events_by_date, dict)
    if events_by_date is not None and not has_current:
        issues.append("eventsByDate가 객체가 아닙니다.")
    if has_current:
        for date_key, events in events_by_date.items():
            if not isinstance(date_key, str) or not isinstance(events, list):
                issues.append("날짜 키 또는 일정 배열 형식이 잘못되었습니다.")
                continue
            current[date_key] = events

    legacy: dict[str, list[Any]] = {}
    legacy_date = payload.get("date")
    legacy_events = payload.get("events")
    has_legacy = isinstance(legacy_date, str) and isinstance(legacy_events, list)
    if legacy_date is not None or legacy_events is not None:
        if has_legacy:
            legacy[legacy_date] = legacy_events
        else:
            issues.append("구버전 date/events 형식이 완전하지 않습니다.")

    merged = {date_key: list(events) for date_key, events in legacy.items()}
    for date_key, events in current.items():
        combined = merged.get(date_key, [])
        positions = {
            event.get("id"): index
            for index, event in enumerate(combined)
            if isinstance(event, dict) and isinstance(event.get("id"), str) and event.get("id")
        }
        for event in events:
            event_id = event.get("id") if isinstance(event, dict) else None
            if isinstance(event_id, str) and event_id and event_id in positions:
                combined[positions[event_id]] = event
            else:
                if isinstance(event_id, str) and event_id:
                    positions[event_id] = len(combined)
                combined.append(event)
        merged[date_key] = combined
    if has_current and has_legacy:
        schema = "mixed"
    elif has_current:
        schema = "current"
    elif has_legacy:
        schema = "legacy"
    elif not issues:
        schema = "empty"
    else:
        schema = "invalid"
    return schema, merged, issues


def _load_preferences(vault: Path) -> dict[str, Any]:
    path = vault / "_vault_preferences.json"
    if not path.is_file():
        return {}
    try:
        data = _read_json(path)
        return data if isinstance(data, dict) else {}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}


def build_recovery_audit() -> dict[str, Any]:
    root = get_vaults_root()
    sources: list[dict[str, Any]] = []
    vault_summaries: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    event_occurrences = 0
    archive_occurrences = 0
    unique_event_keys: set[str] = set()
    duplicate_occurrences = 0

    for vault in _vault_directories(root):
        preferences = _load_preferences(vault)
        planner_preferences = preferences.get("planner") if isinstance(preferences.get("planner"), dict) else {}
        home_page_id = planner_preferences.get("homePageId") if isinstance(planner_preferences.get("homePageId"), str) else None
        planner_mode = planner_preferences.get("mode") if isinstance(planner_preferences.get("mode"), str) else "off"
        home_page_found = False
        home_planner_blocks = 0
        vault_block_count = 0
        vault_event_count = 0
        vault_date_keys: set[str] = set()

        for content_path in sorted(vault.rglob(CONTENT_FILE)):
            relative_path = content_path.relative_to(root).as_posix()
            try:
                page = _read_json(content_path)
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                errors.append({"vaultName": vault.name, "sourceFile": relative_path, "message": str(exc)})
                continue
            if not isinstance(page, dict):
                errors.append({"vaultName": vault.name, "sourceFile": relative_path, "message": "페이지 JSON이 객체가 아닙니다."})
                continue

            page_id = page.get("id") if isinstance(page.get("id"), str) else ""
            page_title = page.get("title") if isinstance(page.get("title"), str) else ""
            is_home = bool(home_page_id and page_id == home_page_id)
            if is_home:
                home_page_found = True

            for block in _iter_blocks(page.get("blocks")):
                if block.get("type") != "dayplanner":
                    continue
                vault_block_count += 1
                if is_home:
                    home_planner_blocks += 1
                block_id = block.get("id") if isinstance(block.get("id"), str) else ""
                try:
                    payload = json.loads(block.get("content") or "{}")
                    schema, events_by_date, issues = _planner_payload_summary(payload)
                except (TypeError, json.JSONDecodeError) as exc:
                    schema, events_by_date, issues = "invalid", {}, [str(exc)]

                source_event_count = 0
                source_duplicates = 0
                source_dates: list[str] = []
                for date_key, events in events_by_date.items():
                    source_dates.append(date_key)
                    vault_date_keys.add(date_key)
                    for event in events:
                        event_occurrences += 1
                        vault_event_count += 1
                        source_event_count += 1
                        key = _event_key(date_key, event)
                        if key in unique_event_keys:
                            duplicate_occurrences += 1
                            source_duplicates += 1
                        else:
                            unique_event_keys.add(key)

                source_dates.sort()
                sources.append({
                    "vaultName": vault.name,
                    "pageId": page_id,
                    "pageTitle": page_title,
                    "blockId": block_id,
                    "sourceFile": relative_path,
                    "location": "trash" if "_vault_trash" in content_path.parts else "active",
                    "isScheduleHome": is_home,
                    "schema": schema,
                    "dateCount": len(set(source_dates)),
                    "eventCount": source_event_count,
                    "duplicateEventCount": source_duplicates,
                    "firstDate": source_dates[0] if source_dates else None,
                    "lastDate": source_dates[-1] if source_dates else None,
                    "issues": issues,
                })

        archive_date_count = 0
        archive_event_count = 0
        archive_path = vault / "_planner_archive.json"
        if archive_path.is_file():
            try:
                archive = _read_json(archive_path)
                if not isinstance(archive, dict):
                    raise ValueError("아카이브 JSON이 객체가 아닙니다.")
                for date_key, events in archive.items():
                    if not isinstance(date_key, str) or not isinstance(events, list):
                        continue
                    archive_date_count += 1
                    for event in events:
                        archive_event_count += 1
                        archive_occurrences += 1
                        key = _event_key(date_key, event)
                        if key in unique_event_keys:
                            duplicate_occurrences += 1
                        else:
                            unique_event_keys.add(key)
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
                errors.append({
                    "vaultName": vault.name,
                    "sourceFile": archive_path.relative_to(root).as_posix(),
                    "message": str(exc),
                })

        vault_summaries.append({
            "vaultName": vault.name,
            "plannerMode": planner_mode,
            "scheduleHomeConfigured": bool(home_page_id),
            "scheduleHomeFound": home_page_found,
            "scheduleHomePlannerBlocks": home_planner_blocks,
            "plannerBlockCount": vault_block_count,
            "dateCount": len(vault_date_keys),
            "eventCount": vault_event_count,
            "archiveDateCount": archive_date_count,
            "archiveEventCount": archive_event_count,
        })

    relevant_vaults = [
        vault for vault in vault_summaries
        if vault["plannerMode"] == "daily"
        or vault["plannerBlockCount"] > 0
        or vault["archiveEventCount"] > 0
    ]
    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "vaultCount": len(relevant_vaults),
            "sourceCount": len(sources),
            "liveEventOccurrences": event_occurrences,
            "archiveEventOccurrences": archive_occurrences,
            "uniqueEventCount": len(unique_event_keys),
            "duplicateOccurrences": duplicate_occurrences,
            "errorCount": len(errors),
        },
        "vaults": relevant_vaults,
        "sources": sources,
        "errors": errors,
    }


def _backup_source_files(root: Path) -> list[Path]:
    paths: set[Path] = set()
    for vault in _vault_directories(root):
        paths.update(path for path in vault.rglob(CONTENT_FILE) if path.is_file())
        paths.update(vault / name for name in PLANNER_META_FILES if (vault / name).is_file())
    return sorted(paths, key=lambda path: path.relative_to(root).as_posix())


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def find_matching_verified_backup() -> dict[str, Any] | None:
    """Return the newest verified backup that exactly matches current planner sources."""
    root = get_vaults_root()
    backup_dir = root / BACKUP_DIR
    if not backup_dir.is_dir():
        return None
    current_files = _backup_source_files(root)
    current_hashes = {
        path.relative_to(root).as_posix(): _sha256(path.read_bytes())
        for path in current_files
    }
    for backup_path in sorted(backup_dir.glob("planner-recovery-*.zip"), reverse=True):
        try:
            with zipfile.ZipFile(backup_path, "r") as archive:
                if archive.testzip() is not None:
                    continue
                manifest = json.loads(archive.read("manifest.json"))
                entries = manifest.get("files", []) if isinstance(manifest, dict) else []
                backup_hashes = {
                    entry["relativePath"]: entry["sha256"]
                    for entry in entries
                    if isinstance(entry, dict)
                    and isinstance(entry.get("relativePath"), str)
                    and isinstance(entry.get("sha256"), str)
                }
                if backup_hashes != current_hashes:
                    continue
                if any(
                    _sha256(archive.read(f"vaults/{relative_path}")) != expected_hash
                    for relative_path, expected_hash in backup_hashes.items()
                ):
                    continue
            backup_bytes = backup_path.read_bytes()
            return {
                "backupFile": backup_path.name,
                "sha256": _sha256(backup_bytes),
                "createdAt": manifest.get("createdAt"),
                "fileCount": len(current_hashes),
            }
        except (OSError, KeyError, json.JSONDecodeError, zipfile.BadZipFile):
            continue
    return None


def create_recovery_backup() -> dict[str, Any]:
    root = get_vaults_root()
    backup_dir = root / BACKUP_DIR
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    final_path = backup_dir / f"planner-recovery-{timestamp}.zip"
    temp_path = backup_dir / f".{final_path.name}.tmp"
    audit = build_recovery_audit()
    manifest_entries: list[dict[str, Any]] = []

    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for source_path in _backup_source_files(root):
                relative_path = source_path.relative_to(root).as_posix()
                data = source_path.read_bytes()
                archive.writestr(f"vaults/{relative_path}", data)
                manifest_entries.append({
                    "relativePath": relative_path,
                    "sizeBytes": len(data),
                    "sha256": _sha256(data),
                })
            manifest = {
                "version": 1,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "auditTotals": audit["totals"],
                "files": manifest_entries,
            }
            archive.writestr(
                "manifest.json",
                json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            )

        with zipfile.ZipFile(temp_path, "r") as archive:
            bad_file = archive.testzip()
            if bad_file:
                raise OSError(f"백업 ZIP 검증 실패: {bad_file}")
            for entry in manifest_entries:
                archived = archive.read(f"vaults/{entry['relativePath']}")
                if _sha256(archived) != entry["sha256"]:
                    raise OSError(f"백업 해시 검증 실패: {entry['relativePath']}")
        temp_path.replace(final_path)
    except (OSError, zipfile.BadZipFile) as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"일정 복구 백업 생성 실패: {exc}") from exc

    backup_bytes = final_path.read_bytes()
    return {
        "status": "ok",
        "backupFile": final_path.name,
        "fileCount": len(manifest_entries),
        "sizeBytes": len(backup_bytes),
        "sha256": _sha256(backup_bytes),
        "auditTotals": audit["totals"],
    }


@router.get("/audit")
def get_recovery_audit() -> dict[str, Any]:
    return build_recovery_audit()


@router.post("/backup")
@serialized_vault_write
def backup_planner_sources() -> dict[str, Any]:
    return create_recovery_backup()
