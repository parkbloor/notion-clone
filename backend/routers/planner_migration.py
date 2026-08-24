"""Backup-gated, idempotent migration from Day Planner blocks to SQLite."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import get_vaults_root, serialized_vault_write
from backend.routers import planner_recovery, planner_store


router = APIRouter(prefix="/api/planner/migration", tags=["planner-migration"])


class MigrationPreviewBody(BaseModel):
    sourceVaults: list[str] = Field(default_factory=list)


class MigrationExecuteBody(MigrationPreviewBody):
    backupFile: str
    previewFingerprint: str
    confirmation: str


def _valid_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def _valid_time(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.strptime(value, "%H:%M")
        return True
    except ValueError:
        return False


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _source_key(date_key: str, event: Any) -> str:
    return planner_recovery._event_key(date_key, event)


def _normalized_event(date_key: str, event: Any) -> dict[str, Any] | None:
    if not _valid_date(date_key) or not isinstance(event, dict):
        return None
    title = event.get("title") if isinstance(event.get("title"), str) else ""
    return {
        "date": date_key,
        "title": title.strip() or "(제목 없음)",
        "start": event.get("start") if _valid_time(event.get("start")) else "00:00",
        "end": event.get("end") if _valid_time(event.get("end")) else "00:00",
        "color": event.get("color") if isinstance(event.get("color"), str) and event.get("color") else "blue",
        "done": bool(event.get("done")),
        "scheduled": event.get("scheduled") if isinstance(event.get("scheduled"), bool) else None,
        "clockIn": event.get("clockIn") if isinstance(event.get("clockIn"), str) else None,
        "clockOut": event.get("clockOut") if isinstance(event.get("clockOut"), str) else None,
        "elapsed": event.get("elapsed") if isinstance(event.get("elapsed"), int) and event.get("elapsed") >= 0 else None,
        "log": event.get("log") if isinstance(event.get("log"), str) else None,
        "subtasks": event.get("subtasks") if isinstance(event.get("subtasks"), list) else [],
        "energy": event.get("energy") if isinstance(event.get("energy"), int) else None,
        "source": event.get("source") if isinstance(event.get("source"), str) else None,
        "routineId": event.get("routineId") if isinstance(event.get("routineId"), str) else None,
    }


def _selected_vaults(names: list[str]) -> list[Path]:
    root = get_vaults_root()
    available = {path.name: path for path in planner_recovery._vault_directories(root)}
    selected_names = sorted(set(names), key=str.casefold) if names else sorted(available, key=str.casefold)
    missing = [name for name in selected_names if name not in available]
    if missing:
        raise HTTPException(status_code=422, detail=f"원본 볼트를 찾을 수 없습니다: {', '.join(missing)}")
    return [available[name] for name in selected_names]


def _collect_candidates(vaults: list[Path]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    root = get_vaults_root()
    events: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    invalid_events = 0
    for vault in vaults:
        preferences = planner_recovery._load_preferences(vault)
        planner = preferences.get("planner") if isinstance(preferences.get("planner"), dict) else {}
        home_id = planner.get("homePageId") if isinstance(planner.get("homePageId"), str) else None
        for content_path in sorted(vault.rglob(planner_recovery.CONTENT_FILE)):
            try:
                page = planner_recovery._read_json(content_path)
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(page, dict):
                continue
            is_home = bool(home_id and page.get("id") == home_id)
            is_trash = "_vault_trash" in content_path.parts
            for block in planner_recovery._iter_blocks(page.get("blocks")):
                if block.get("type") != "dayplanner":
                    continue
                try:
                    payload = json.loads(block.get("content") or "{}")
                except (TypeError, json.JSONDecodeError):
                    continue
                schema, events_by_date, _ = planner_recovery._planner_payload_summary(payload)
                rank = 40 if is_trash else 0 if is_home else 10 if schema in {"current", "mixed"} else 20
                source_file = content_path.relative_to(root).as_posix()
                for date_key, date_events in events_by_date.items():
                    for event in date_events:
                        normalized = _normalized_event(date_key, event)
                        if normalized is None:
                            invalid_events += 1
                            continue
                        events.append({
                            "key": _source_key(date_key, event), "event": normalized, "raw": event,
                            "vaultName": vault.name, "sourceFile": source_file, "rank": rank,
                        })
                review_by_date = payload.get("reviewByDate") if isinstance(payload, dict) else None
                if isinstance(review_by_date, dict):
                    for date_key, content in review_by_date.items():
                        if _valid_date(date_key) and isinstance(content, str):
                            reviews.append({
                                "key": date_key, "content": content, "vaultName": vault.name,
                                "sourceFile": source_file, "rank": rank,
                            })
        archive_path = vault / "_planner_archive.json"
        if archive_path.is_file():
            try:
                archive = planner_recovery._read_json(archive_path)
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                archive = {}
            if isinstance(archive, dict):
                for date_key, date_events in archive.items():
                    if not isinstance(date_events, list):
                        continue
                    for event in date_events:
                        normalized = _normalized_event(date_key, event)
                        if normalized is None:
                            invalid_events += 1
                            continue
                        events.append({
                            "key": _source_key(date_key, event), "event": normalized, "raw": event,
                            "vaultName": vault.name, "sourceFile": archive_path.relative_to(root).as_posix(), "rank": 30,
                        })
    return events, reviews, invalid_events


def _choose(candidates: list[dict[str, Any]], value_field: str) -> tuple[list[dict[str, Any]], int, int]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate["key"], []).append(candidate)
    winners: list[dict[str, Any]] = []
    conflicts = 0
    for key, occurrences in grouped.items():
        ordered = sorted(occurrences, key=lambda item: (item["rank"], item["sourceFile"]))
        winner = ordered[0]
        winner = {**winner, "occurrenceCount": len(occurrences)}
        distinct = {_canonical(item[value_field]) for item in occurrences}
        winner["conflict"] = len(distinct) > 1
        if winner["conflict"]:
            conflicts += 1
        winners.append(winner)
    return sorted(winners, key=lambda item: item["key"]), len(candidates) - len(winners), conflicts


def build_migration_preview(source_vaults: list[str]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    selected = _selected_vaults(source_vaults)
    event_candidates, review_candidates, invalid_events = _collect_candidates(selected)
    event_winners, duplicate_events, event_conflicts = _choose(event_candidates, "event")
    review_winners, duplicate_reviews, review_conflicts = _choose(review_candidates, "content")
    backup = planner_recovery.find_matching_verified_backup()
    target = planner_store._settings_response()
    fingerprint_data = {
        "sourceVaults": [vault.name for vault in selected],
        "backupSha256": backup["sha256"] if backup else None,
        "events": [{"key": item["key"], "event": item["event"]} for item in event_winners],
        "reviews": [{"key": item["key"], "content": item["content"]} for item in review_winners],
    }
    fingerprint = hashlib.sha256(_canonical(fingerprint_data).encode("utf-8")).hexdigest()
    preview = {
        "version": 1,
        "sourceVaults": [vault.name for vault in selected],
        "targetVaultName": target["plannerVaultName"],
        "targetReady": target["status"] == "ready",
        "backup": backup,
        "readyToMigrate": bool(backup) and target["status"] == "ready",
        "previewFingerprint": fingerprint,
        "totals": {
            "eventOccurrences": len(event_candidates), "uniqueEvents": len(event_winners),
            "duplicateEvents": duplicate_events, "eventConflicts": event_conflicts,
            "invalidEvents": invalid_events, "uniqueReviews": len(review_winners),
            "duplicateReviews": duplicate_reviews, "reviewConflicts": review_conflicts,
        },
        "conflicts": [
            {"kind": "event", "key": item["key"], "sourceFile": item["sourceFile"], "occurrenceCount": item["occurrenceCount"]}
            for item in event_winners if item["conflict"]
        ] + [
            {"kind": "review", "key": item["key"], "sourceFile": item["sourceFile"], "occurrenceCount": item["occurrenceCount"]}
            for item in review_winners if item["conflict"]
        ],
    }
    return preview, event_winners, review_winners


@router.post("/preview")
def preview_migration(body: MigrationPreviewBody):
    preview, _, _ = build_migration_preview(body.sourceVaults)
    return preview


@router.post("/execute")
@serialized_vault_write
def execute_migration(body: MigrationExecuteBody):
    if body.confirmation != "MIGRATE":
        raise HTTPException(status_code=422, detail="마이그레이션 확인 문구가 올바르지 않습니다")
    preview, events, reviews = build_migration_preview(body.sourceVaults)
    backup = preview["backup"]
    if not preview["readyToMigrate"] or backup is None:
        raise HTTPException(status_code=409, detail="현재 원본과 일치하는 검증 백업과 일정 데이터 볼트가 필요합니다")
    if backup["backupFile"] != body.backupFile or preview["previewFingerprint"] != body.previewFingerprint:
        raise HTTPException(status_code=409, detail="미리보기 이후 원본 또는 백업이 변경되었습니다. 다시 확인해 주세요")

    imported_events = 0
    imported_reviews = 0
    now = planner_store._now_iso()
    with planner_store._database() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS migration_events (
                source_key TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE,
                source_json TEXT NOT NULL, migrated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS migration_reviews (
                source_key TEXT PRIMARY KEY, migrated_at TEXT NOT NULL
            );
        """)
        for item in events:
            exists = connection.execute("SELECT 1 FROM migration_events WHERE source_key=?", (item["key"],)).fetchone()
            if exists:
                continue
            event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"notion-clone:planner:{item['key']}"))
            event = planner_store.PlannerEventBody(id=event_id, **item["event"])
            connection.execute(
                "INSERT OR IGNORE INTO events(id,date,title,start,end,color,done,scheduled,clock_in,clock_out,elapsed,log,subtasks_json,energy,source,routine_id,revision,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (event_id, *planner_store._event_values(event), now, now),
            )
            connection.execute(
                "INSERT INTO migration_events(source_key,event_id,source_json,migrated_at) VALUES(?,?,?,?)",
                (item["key"], event_id, _canonical(item["raw"]), now),
            )
            imported_events += 1
        for item in reviews:
            exists = connection.execute("SELECT 1 FROM migration_reviews WHERE source_key=?", (item["key"],)).fetchone()
            if exists:
                continue
            cursor = connection.execute(
                "INSERT OR IGNORE INTO reviews(date,content,revision,updated_at) VALUES(?,?,1,?)",
                (item["key"], item["content"], now),
            )
            connection.execute(
                "INSERT INTO migration_reviews(source_key,migrated_at) VALUES(?,?)", (item["key"], now)
            )
            imported_reviews += cursor.rowcount
        connection.execute(
            "INSERT INTO meta(key,value) VALUES('migration_complete','1') "
            "ON CONFLICT(key) DO UPDATE SET value='1'"
        )
        connection.execute(
            "INSERT INTO meta(key,value) VALUES('activation_mode','migration') "
            "ON CONFLICT(key) DO UPDATE SET value='migration'"
        )
    return {
        "status": "ok", "backupFile": backup["backupFile"],
        "importedEvents": imported_events, "importedReviews": imported_reviews,
        "preservedOriginals": True,
    }
