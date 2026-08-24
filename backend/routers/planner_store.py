"""Dedicated SQLite storage for planner events and daily reviews.

P2 only exposes the new store. Existing Day Planner blocks are intentionally
not migrated or rewritten here; migration is a separate, backup-gated step.
"""

import csv
import hashlib
import html
import io
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.core import get_vaults_root, list_vaults, serialized_vault_write
from backend.routers import planner_recovery


router = APIRouter(prefix="/api", tags=["planner-store"])
CONFIG_FILENAME = ".planner_data_config.json"
STORE_DIRECTORY = "_planner"
DATABASE_FILENAME = "planner.sqlite3"
SCHEMA_VERSION = 2


class PlannerDataSettingsBody(BaseModel):
    plannerVaultName: str | None = None


class PlannerStoreActivationBody(BaseModel):
    # Fresh activation is deliberately an exact opt-in, not a generic reset.
    # Python으로 치면: confirmation: Literal['START_EMPTY']
    confirmation: Literal["START_EMPTY"]


class PlannerEventBody(BaseModel):
    id: str | None = None
    date: str
    title: str = Field(min_length=1, max_length=500)
    start: str
    end: str
    color: str = Field(default="blue", max_length=100)
    done: bool = False
    scheduled: bool | None = None
    clockIn: str | None = None
    clockOut: str | None = None
    elapsed: int | None = Field(default=None, ge=0)
    log: str | None = None
    subtasks: list[Any] = Field(default_factory=list)
    energy: int | None = None
    source: str | None = None
    routineId: str | None = None


class PlannerEventUpdateBody(PlannerEventBody):
    expectedRevision: int = Field(ge=1)


class PlannerEventDeleteBody(BaseModel):
    expectedRevision: int = Field(ge=1)


class PlannerEventClockBody(BaseModel):
    expectedRevision: int = Field(ge=1)


class PlannerReviewBody(BaseModel):
    content: str
    expectedRevision: int | None = Field(default=None, ge=1)


class PlannerRoutineBody(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=500)
    start: str
    end: str
    color: str = Field(default="blue", max_length=100)
    days: list[int] = Field(default_factory=list)
    active: bool = True


class PlannerRoutineUpdateBody(PlannerRoutineBody):
    expectedRevision: int = Field(ge=1)


class PlannerRoutinePolicyBody(BaseModel):
    autoApply: bool
    expectedRevision: int = Field(ge=1)


class PlannerRoutineLegacyImportBody(BaseModel):
    confirmation: Literal["COPY_LEGACY_ROUTINES"]


class PlannerPortableImportBody(BaseModel):
    # The browser reads a user-selected JSON file; the server never follows a client path.
    # Python으로 치면: payload: dict[str, Any]
    payload: dict[str, Any]


class PlannerPortableImportCommitBody(PlannerPortableImportBody):
    previewFingerprint: str = Field(min_length=64, max_length=64)


class PlannerBatchDeleteBody(BaseModel):
    id: str = Field(min_length=1, max_length=500)
    expectedRevision: int = Field(ge=1)


class PlannerBatchApplyBody(BaseModel):
    # The client sends the reviewed diff and the revisions from the same snapshot.
    # Python으로 치면: creates: list[PlannerEventBody]; deletes: list[RevisionedId]
    creates: list[PlannerEventBody] = Field(default_factory=list)
    deletes: list[PlannerBatchDeleteBody] = Field(default_factory=list)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _config_path() -> Path:
    return get_vaults_root() / CONFIG_FILENAME


def _load_planner_vault_name() -> str | None:
    path = _config_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    name = data.get("plannerVaultName") if isinstance(data, dict) else None
    return name.strip() if isinstance(name, str) and name.strip() else None


def _write_planner_vault_name(vault_name: str | None) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(path.name + ".tmp")
    try:
        temp_path.write_text(
            json.dumps({"version": 1, "plannerVaultName": vault_name}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temp_path.replace(path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def replace_planner_vault_name(old_name: str, new_name: str) -> None:
    if _load_planner_vault_name() == old_name:
        _write_planner_vault_name(new_name)


def _settings_response() -> dict[str, Any]:
    names = [vault["name"] for vault in list_vaults()]
    selected = _load_planner_vault_name()
    status = "unconfigured" if selected is None else "ready" if selected in names else "missing"
    return {
        "version": 1,
        "plannerVaultName": selected,
        "status": status,
        "availableVaults": names,
        "storage": "sqlite",
    }


def _selected_vault_path() -> Path:
    name = _load_planner_vault_name()
    if name is None:
        raise HTTPException(status_code=409, detail="일정 데이터 볼트를 먼저 지정해 주세요")
    root = get_vaults_root().resolve()
    path = (root / name).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="잘못된 일정 데이터 볼트 경로입니다") from exc
    if not path.is_dir():
        raise HTTPException(status_code=409, detail="지정된 일정 데이터 볼트를 찾을 수 없습니다")
    return path


def _database_path() -> Path:
    path = _selected_vault_path() / STORE_DIRECTORY / DATABASE_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_database_path(), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    _ensure_schema(connection)
    return connection


@contextmanager
def _database():
    connection = _connect()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _ensure_schema(connection: sqlite3.Connection) -> None:
    with connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                title TEXT NOT NULL,
                start TEXT NOT NULL,
                end TEXT NOT NULL,
                color TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                scheduled INTEGER,
                clock_in TEXT,
                clock_out TEXT,
                elapsed INTEGER,
                log TEXT,
                subtasks_json TEXT NOT NULL DEFAULT '[]',
                energy INTEGER,
                source TEXT,
                routine_id TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT
            );
            CREATE INDEX IF NOT EXISTS events_date_idx ON events(date, deleted_at);
            CREATE TABLE IF NOT EXISTS reviews (
                date TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS routines (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                start TEXT NOT NULL,
                end TEXT NOT NULL,
                color TEXT NOT NULL,
                days_json TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                revision INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS routine_policy (
                policy_key INTEGER PRIMARY KEY CHECK(policy_key = 1),
                auto_apply INTEGER NOT NULL DEFAULT 1,
                revision INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS migration_routines (
                source_id TEXT PRIMARY KEY,
                routine_id TEXT NOT NULL UNIQUE,
                source_json TEXT NOT NULL,
                migrated_at TEXT NOT NULL
            );
        """)
        connection.execute(
            "INSERT OR IGNORE INTO routine_policy(policy_key,auto_apply,revision,updated_at) VALUES(1,1,1,?)",
            (_now_iso(),),
        )
        connection.execute(
            "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (str(SCHEMA_VERSION),),
        )


def _validate_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="날짜는 YYYY-MM-DD 형식이어야 합니다") from exc


def _validate_time(value: str) -> str:
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="시간은 HH:MM 형식이어야 합니다") from exc
    return value


def _event_values(body: PlannerEventBody) -> tuple[Any, ...]:
    normalized_date = _validate_date(body.date)
    normalized_title = body.title.strip()
    normalized_start = _validate_time(body.start)
    normalized_end = _validate_time(body.end)
    # Zero-length and backwards events make both the list and the future timeline ambiguous.
    # Python으로 치면: if start_minutes >= end_minutes: raise ValidationError()
    if normalized_start >= normalized_end:
        raise HTTPException(status_code=422, detail="종료 시간은 시작 시간보다 늦어야 합니다")
    if not normalized_title:
        raise HTTPException(status_code=422, detail="일정 제목을 입력해 주세요")
    return (
        normalized_date, normalized_title, normalized_start, normalized_end,
        body.color, int(body.done), None if body.scheduled is None else int(body.scheduled),
        body.clockIn, body.clockOut, body.elapsed, body.log,
        json.dumps(body.subtasks, ensure_ascii=False), body.energy, body.source, body.routineId,
    )


def _event_response(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"], "date": row["date"], "title": row["title"],
        "start": row["start"], "end": row["end"], "color": row["color"],
        "done": bool(row["done"]),
        "scheduled": None if row["scheduled"] is None else bool(row["scheduled"]),
        "clockIn": row["clock_in"], "clockOut": row["clock_out"], "elapsed": row["elapsed"],
        "log": row["log"], "subtasks": json.loads(row["subtasks_json"]), "energy": row["energy"],
        "source": row["source"], "routineId": row["routine_id"], "revision": row["revision"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"], "deletedAt": row["deleted_at"],
    }


def _routine_values(body: PlannerRoutineBody) -> tuple[Any, ...]:
    title = body.title.strip()
    start = _validate_time(body.start)
    end = _validate_time(body.end)
    if not title:
        raise HTTPException(status_code=422, detail="루틴 제목을 입력해 주세요")
    if start >= end:
        raise HTTPException(status_code=422, detail="루틴 종료 시간은 시작 시간보다 늦어야 합니다")
    if any(isinstance(day, bool) or day < 0 or day > 6 for day in body.days):
        raise HTTPException(status_code=422, detail="루틴 요일은 0부터 6 사이여야 합니다")
    return title, start, end, body.color, json.dumps(sorted(set(body.days))), int(body.active)


def _routine_response(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"], "title": row["title"], "start": row["start"], "end": row["end"],
        "color": row["color"], "days": json.loads(row["days_json"]), "active": bool(row["active"]),
        "revision": row["revision"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def _routine_policy_response(row: sqlite3.Row) -> dict[str, Any]:
    return {"autoApply": bool(row["auto_apply"]), "revision": row["revision"], "updatedAt": row["updated_at"]}


def _portable_digest(payload: dict[str, Any]) -> str:
    """Hash portable JSON excluding its self-referential checksum field."""
    normalized = {key: value for key, value in payload.items() if key != "checksum"}
    encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _planner_portable_payload() -> dict[str, Any]:
    """Produce a versioned planner-only backup without touching legacy page sources."""
    with _database() as connection:
        events = [_event_response(row) for row in connection.execute("SELECT * FROM events ORDER BY date,start,id").fetchall()]
        reviews = [dict(row) for row in connection.execute("SELECT * FROM reviews ORDER BY date").fetchall()]
        routines = [_routine_response(row) for row in connection.execute("SELECT * FROM routines ORDER BY id").fetchall()]
        policy = _routine_policy_response(connection.execute("SELECT * FROM routine_policy WHERE policy_key=1").fetchone())
    payload: dict[str, Any] = {
        "format": "notion-clone-planner",
        "version": 1,
        "schemaVersion": SCHEMA_VERSION,
        "exportedAt": _now_iso(),
        "events": events,
        "reviews": reviews,
        "routines": routines,
        "routinePolicy": policy,
    }
    payload["checksum"] = _portable_digest(payload)
    return payload


def get_sqlite_period_export_items(start_date: str, end_date: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
    """Return the active SQLite schedule/reviews for HTML export, or None for legacy planner mode."""
    if get_store_status()["writeMode"] != "sqlite":
        return None
    start, end = _validate_date(start_date), _validate_date(end_date)
    with _database() as connection:
        events = [_event_response(row) for row in connection.execute(
            "SELECT * FROM events WHERE date>=? AND date<=? AND deleted_at IS NULL ORDER BY date,start,id", (start, end)
        ).fetchall()]
        reviews = [dict(row) for row in connection.execute(
            "SELECT * FROM reviews WHERE date>=? AND date<=? ORDER BY date", (start, end)
        ).fetchall()]
    return events, reviews


def _portable_event_key(event: dict[str, Any]) -> tuple[Any, ...]:
    """Compare schedule meaning and deletion state, not volatile revision/timestamp fields."""
    return tuple(event.get(key) for key in (
        "id", "date", "title", "start", "end", "color", "done", "scheduled", "clockIn", "clockOut",
        "elapsed", "log", "subtasks", "energy", "source", "routineId", "deletedAt",
    ))


def _portable_routine_key(routine: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(routine.get(key) for key in ("id", "title", "start", "end", "color", "days", "active"))


def _portable_revision(raw: dict[str, Any], item_name: str) -> int:
    """Accept only persisted positive integer revisions from a portable backup."""
    # Python으로 치면: revision = raw.get("revision", 1); assert type(revision) is int and revision > 0
    revision = raw.get("revision", 1)
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
        raise HTTPException(status_code=422, detail=f"일정 백업의 {item_name} revision이 올바르지 않습니다")
    return revision


def _validate_portable_payload(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate all import data before opening the write transaction."""
    if payload.get("format") != "notion-clone-planner" or payload.get("version") != 1:
        raise HTTPException(status_code=422, detail="지원하지 않는 일정 백업 형식입니다")
    checksum = payload.get("checksum")
    if not isinstance(checksum, str) or checksum != _portable_digest(payload):
        raise HTTPException(status_code=422, detail="일정 백업 검증값이 일치하지 않습니다")
    raw_events, raw_reviews, raw_routines = payload.get("events"), payload.get("reviews"), payload.get("routines")
    if not isinstance(raw_events, list) or not isinstance(raw_reviews, list) or not isinstance(raw_routines, list):
        raise HTTPException(status_code=422, detail="일정 백업의 events, reviews, routines는 배열이어야 합니다")

    events: list[dict[str, Any]] = []
    event_ids: set[str] = set()
    for raw in raw_events:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=422, detail="일정 백업에 잘못된 일정 항목이 있습니다")
        try:
            body = PlannerEventBody(**raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="일정 백업의 일정 항목이 올바르지 않습니다") from exc
        event_id = body.id.strip() if body.id else ""
        if not event_id or event_id in event_ids:
            raise HTTPException(status_code=422, detail="일정 백업의 일정 ID가 비어 있거나 중복됩니다")
        event_ids.add(event_id)
        values = _event_values(body)
        deleted_at = raw.get("deletedAt")
        if deleted_at is not None and not isinstance(deleted_at, str):
            raise HTTPException(status_code=422, detail="일정 백업의 삭제 시각이 올바르지 않습니다")
        events.append({
            "id": event_id, "values": values, "revision": _portable_revision(raw, "일정"),
            "createdAt": raw.get("createdAt") if isinstance(raw.get("createdAt"), str) else _now_iso(),
            "updatedAt": raw.get("updatedAt") if isinstance(raw.get("updatedAt"), str) else _now_iso(),
            "deletedAt": deleted_at,
            "portable": {**raw, "id": event_id, "subtasks": body.subtasks},
        })

    reviews: list[dict[str, Any]] = []
    review_dates: set[str] = set()
    for raw in raw_reviews:
        if not isinstance(raw, dict) or not isinstance(raw.get("date"), str) or not isinstance(raw.get("content"), str):
            raise HTTPException(status_code=422, detail="일정 백업에 잘못된 회고 항목이 있습니다")
        review_date = _validate_date(raw["date"])
        if review_date in review_dates:
            raise HTTPException(status_code=422, detail="일정 백업의 회고 날짜가 중복됩니다")
        review_dates.add(review_date)
        reviews.append({
            "date": review_date, "content": raw["content"], "revision": _portable_revision(raw, "회고"),
            "updated_at": raw.get("updated_at") if isinstance(raw.get("updated_at"), str) else _now_iso(),
        })

    routines: list[dict[str, Any]] = []
    routine_ids: set[str] = set()
    for raw in raw_routines:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=422, detail="일정 백업에 잘못된 루틴 항목이 있습니다")
        try:
            body = PlannerRoutineBody(**raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="일정 백업의 루틴 항목이 올바르지 않습니다") from exc
        routine_id = body.id.strip() if body.id else ""
        if not routine_id or routine_id in routine_ids:
            raise HTTPException(status_code=422, detail="일정 백업의 루틴 ID가 비어 있거나 중복됩니다")
        routine_ids.add(routine_id)
        routines.append({
            "id": routine_id, "values": _routine_values(body), "revision": _portable_revision(raw, "루틴"),
            "createdAt": raw.get("createdAt") if isinstance(raw.get("createdAt"), str) else _now_iso(),
            "updatedAt": raw.get("updatedAt") if isinstance(raw.get("updatedAt"), str) else _now_iso(),
            "portable": {**raw, "id": routine_id, "days": sorted(set(body.days))},
        })
    return events, reviews, routines


def _portable_import_preview(payload: dict[str, Any]) -> tuple[dict[str, Any], tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]]:
    """Classify additions, exact duplicates, and conflicts against one current SQLite snapshot."""
    events, reviews, routines = _validate_portable_payload(payload)
    with _database() as connection:
        existing_events = {row["id"]: _event_response(row) for row in connection.execute("SELECT * FROM events").fetchall()}
        existing_reviews = {row["date"]: dict(row) for row in connection.execute("SELECT * FROM reviews").fetchall()}
        existing_routines = {row["id"]: _routine_response(row) for row in connection.execute("SELECT * FROM routines").fetchall()}
    totals = {"additions": 0, "duplicates": 0, "conflicts": 0}
    by_kind: dict[str, dict[str, int]] = {kind: {"additions": 0, "duplicates": 0, "conflicts": 0} for kind in ("events", "reviews", "routines")}
    conflicts: list[dict[str, str]] = []

    def count(kind: str, state: str, key: str) -> None:
        totals[state] += 1
        by_kind[kind][state] += 1
        if state == "conflicts":
            conflicts.append({"kind": kind, "key": key})

    for item in events:
        existing = existing_events.get(item["id"])
        if existing is None:
            count("events", "additions", item["id"])
        elif _portable_event_key(existing) == _portable_event_key(item["portable"]):
            count("events", "duplicates", item["id"])
        else:
            count("events", "conflicts", item["id"])
    for item in reviews:
        existing = existing_reviews.get(item["date"])
        if existing is None:
            count("reviews", "additions", item["date"])
        elif existing["content"] == item["content"]:
            count("reviews", "duplicates", item["date"])
        else:
            count("reviews", "conflicts", item["date"])
    for item in routines:
        existing = existing_routines.get(item["id"])
        if existing is None:
            count("routines", "additions", item["id"])
        elif _portable_routine_key(existing) == _portable_routine_key(item["portable"]):
            count("routines", "duplicates", item["id"])
        else:
            count("routines", "conflicts", item["id"])

    state = {"events": existing_events, "reviews": existing_reviews, "routines": existing_routines}
    fingerprint = hashlib.sha256(f"{_portable_digest(payload)}:{json.dumps(state, ensure_ascii=False, sort_keys=True, default=str)}".encode("utf-8")).hexdigest()
    return {"version": 1, "totals": totals, "byKind": by_kind, "conflicts": conflicts, "previewFingerprint": fingerprint}, (events, reviews, routines)


@router.get("/settings/planner-data")
def get_planner_data_settings():
    return _settings_response()


@router.put("/settings/planner-data")
@serialized_vault_write
def put_planner_data_settings(body: PlannerDataSettingsBody):
    selected = body.plannerVaultName.strip() if body.plannerVaultName else None
    if selected is not None and selected not in {vault["name"] for vault in list_vaults()}:
        raise HTTPException(status_code=404, detail="일정 데이터 볼트를 찾을 수 없습니다")
    _write_planner_vault_name(selected)
    if selected is not None:
        connection = _connect()
        connection.close()
    return _settings_response()


@router.get("/planner/store/status")
def get_store_status():
    settings = _settings_response()
    if settings["status"] != "ready":
        return {
            **settings, "databaseReady": False, "schemaVersion": None, "eventCount": 0,
            "migrationComplete": False, "activationMode": None, "canStartFresh": False, "writeMode": "legacy",
        }
    with _database() as connection:
        count = connection.execute("SELECT COUNT(*) FROM events WHERE deleted_at IS NULL").fetchone()[0]
        total_event_count = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        review_count = connection.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        migration_row = connection.execute("SELECT value FROM meta WHERE key='migration_complete'").fetchone()
        migration_complete = migration_row is not None and migration_row["value"] == "1"
        activation_row = connection.execute("SELECT value FROM meta WHERE key='activation_mode'").fetchone()
        # Older successful P3 stores predate activation_mode; their completed migration is still migration-backed.
        activation_mode = activation_row["value"] if activation_row is not None else ("migration" if migration_complete else None)
    return {
        **settings, "databaseReady": True, "schemaVersion": SCHEMA_VERSION, "eventCount": count,
        "migrationComplete": migration_complete,
        "activationMode": activation_mode,
        "canStartFresh": not migration_complete and total_event_count == 0 and review_count == 0,
        "writeMode": "sqlite" if migration_complete else "legacy",
    }


@router.post("/planner/store/activate-empty")
@serialized_vault_write
def activate_empty_store(body: PlannerStoreActivationBody):
    # A configured vault is required, and _database() validates its existence before creating a store.
    # Python으로 치면: if events_or_reviews_exist: raise ConflictError()
    with _database() as connection:
        total_event_count = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        review_count = connection.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
        if total_event_count or review_count:
            raise HTTPException(status_code=409, detail="기존 일정 또는 회고가 있어 새 일정으로 시작할 수 없습니다")

        migration_row = connection.execute("SELECT value FROM meta WHERE key='migration_complete'").fetchone()
        activation_row = connection.execute("SELECT value FROM meta WHERE key='activation_mode'").fetchone()
        if migration_row is not None and migration_row["value"] == "1" and activation_row is not None and activation_row["value"] != "fresh":
            raise HTTPException(status_code=409, detail="이 저장소는 기존 일정 이전으로 이미 활성화되었습니다")

        connection.execute(
            "INSERT INTO meta(key,value) VALUES('migration_complete','1') "
            "ON CONFLICT(key) DO UPDATE SET value='1'"
        )
        connection.execute(
            "INSERT INTO meta(key,value) VALUES('activation_mode','fresh') "
            "ON CONFLICT(key) DO UPDATE SET value='fresh'"
        )
    return get_store_status()


@router.get("/planner/store/events")
def list_events(start_date: str | None = None, end_date: str | None = None, include_deleted: bool = False):
    clauses: list[str] = []
    values: list[Any] = []
    if start_date:
        clauses.append("date >= ?")
        values.append(_validate_date(start_date))
    if end_date:
        clauses.append("date <= ?")
        values.append(_validate_date(end_date))
    if not include_deleted:
        clauses.append("deleted_at IS NULL")
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with _database() as connection:
        rows = connection.execute(f"SELECT * FROM events{where} ORDER BY date, start, id", values).fetchall()
    return [_event_response(row) for row in rows]


@router.post("/planner/store/events", status_code=201)
def create_event(body: PlannerEventBody):
    event_id = body.id.strip() if body.id else str(uuid.uuid4())
    if not event_id:
        raise HTTPException(status_code=422, detail="일정 ID가 비어 있습니다")
    now = _now_iso()
    try:
        with _database() as connection:
            connection.execute(
                "INSERT INTO events(id,date,title,start,end,color,done,scheduled,clock_in,clock_out,elapsed,log,subtasks_json,energy,source,routine_id,revision,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (event_id, *_event_values(body), now, now),
            )
            row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="같은 ID의 일정이 이미 있습니다") from exc
    return _event_response(row)


@router.put("/planner/store/events/{event_id}")
def update_event(event_id: str, body: PlannerEventUpdateBody):
    now = _now_iso()
    with _database() as connection:
        if body.clockIn and not body.clockOut:
            active = connection.execute(
                "SELECT id FROM events WHERE id<>? AND clock_in IS NOT NULL AND clock_out IS NULL AND deleted_at IS NULL LIMIT 1",
                (event_id,),
            ).fetchone()
            if active:
                raise HTTPException(status_code=409, detail="다른 일정의 타이머가 실행 중입니다")
        cursor = connection.execute(
            "UPDATE events SET date=?,title=?,start=?,end=?,color=?,done=?,scheduled=?,clock_in=?,clock_out=?,elapsed=?,log=?,subtasks_json=?,energy=?,source=?,routine_id=?,revision=revision+1,updated_at=? "
            "WHERE id=? AND revision=? AND deleted_at IS NULL",
            (*_event_values(body), now, event_id, body.expectedRevision),
        )
        if cursor.rowcount != 1:
            exists = connection.execute("SELECT 1 FROM events WHERE id=? AND deleted_at IS NULL", (event_id,)).fetchone()
            raise HTTPException(status_code=409 if exists else 404, detail="일정이 다른 곳에서 변경되었거나 존재하지 않습니다")
        row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return _event_response(row)


def _elapsed_from_clock_in(clock_in: str, now: datetime) -> int:
    try:
        started = datetime.fromisoformat(clock_in.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="기존 타이머 시작 시각을 해석할 수 없습니다") from exc
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return max(0, round((now - started.astimezone(timezone.utc)).total_seconds() / 60))


@router.post("/planner/store/events/{event_id}/clock-in")
def clock_in_event(event_id: str, body: PlannerEventClockBody):
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    with _database() as connection:
        event = connection.execute("SELECT * FROM events WHERE id=? AND deleted_at IS NULL", (event_id,)).fetchone()
        if event is None:
            raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다")
        if event["revision"] != body.expectedRevision:
            raise HTTPException(status_code=409, detail="일정이 다른 곳에서 변경되었습니다")
        if event["done"]:
            raise HTTPException(status_code=409, detail="완료한 일정의 타이머는 시작할 수 없습니다")
        if event["clock_in"] and not event["clock_out"]:
            return _event_response(event)
        active = connection.execute(
            "SELECT id FROM events WHERE id<>? AND clock_in IS NOT NULL AND clock_out IS NULL AND deleted_at IS NULL LIMIT 1",
            (event_id,),
        ).fetchone()
        if active:
            raise HTTPException(status_code=409, detail="다른 일정의 타이머가 실행 중입니다")
        connection.execute(
            "UPDATE events SET clock_in=?,clock_out=NULL,revision=revision+1,updated_at=? WHERE id=?",
            (now_iso, now_iso, event_id),
        )
        row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return _event_response(row)


@router.post("/planner/store/events/{event_id}/clock-out")
def clock_out_event(event_id: str, body: PlannerEventClockBody):
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    with _database() as connection:
        event = connection.execute("SELECT * FROM events WHERE id=? AND deleted_at IS NULL", (event_id,)).fetchone()
        if event is None:
            raise HTTPException(status_code=404, detail="일정이 존재하지 않습니다")
        if event["revision"] != body.expectedRevision:
            raise HTTPException(status_code=409, detail="일정이 다른 곳에서 변경되었습니다")
        if not event["clock_in"] or event["clock_out"]:
            raise HTTPException(status_code=409, detail="실행 중인 타이머가 없습니다")
        elapsed = (event["elapsed"] or 0) + _elapsed_from_clock_in(event["clock_in"], now)
        connection.execute(
            "UPDATE events SET clock_out=?,elapsed=?,revision=revision+1,updated_at=? WHERE id=?",
            (now_iso, elapsed, now_iso, event_id),
        )
        row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return _event_response(row)


@router.delete("/planner/store/events/{event_id}")
def delete_event(event_id: str, body: PlannerEventDeleteBody):
    now = _now_iso()
    with _database() as connection:
        cursor = connection.execute(
            "UPDATE events SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL",
            (now, now, event_id, body.expectedRevision),
        )
        if cursor.rowcount != 1:
            exists = connection.execute("SELECT 1 FROM events WHERE id=? AND deleted_at IS NULL", (event_id,)).fetchone()
            raise HTTPException(status_code=409 if exists else 404, detail="일정이 다른 곳에서 변경되었거나 존재하지 않습니다")
        row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return _event_response(row)


@router.post("/planner/store/events/{event_id}/restore")
def restore_event(event_id: str, body: PlannerEventDeleteBody):
    now = _now_iso()
    with _database() as connection:
        cursor = connection.execute(
            "UPDATE events SET deleted_at=NULL,updated_at=?,revision=revision+1 "
            "WHERE id=? AND revision=? AND deleted_at IS NOT NULL",
            (now, event_id, body.expectedRevision),
        )
        if cursor.rowcount != 1:
            exists = connection.execute("SELECT 1 FROM events WHERE id=? AND deleted_at IS NOT NULL", (event_id,)).fetchone()
            raise HTTPException(status_code=409 if exists else 404, detail="삭제된 일정이 다른 곳에서 변경되었거나 존재하지 않습니다")
        row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    return _event_response(row)


@router.post("/planner/store/batch")
def apply_planner_batch(body: PlannerBatchApplyBody):
    """Apply a reviewed AI diff all at once, rejecting stale revisions before the first write."""
    delete_ids = [item.id.strip() for item in body.deletes]
    if any(not item_id for item_id in delete_ids) or len(delete_ids) != len(set(delete_ids)):
        raise HTTPException(status_code=422, detail="일괄 적용의 삭제 일정 ID가 비어 있거나 중복됩니다")
    create_ids = [(item.id or "").strip() for item in body.creates]
    if any(not item_id for item_id in create_ids) or len(create_ids) != len(set(create_ids)):
        raise HTTPException(status_code=422, detail="일괄 적용의 새 일정 ID가 비어 있거나 중복됩니다")
    create_values = [_event_values(item) for item in body.creates]
    now = _now_iso()
    with _database() as connection:
        # First prove the whole proposal still applies. Nothing is changed until every revision has matched.
        # Python으로 치면: assert all(current[id].revision == expected for id in deletes)
        for item in body.deletes:
            current = connection.execute("SELECT revision FROM events WHERE id=? AND deleted_at IS NULL", (item.id.strip(),)).fetchone()
            if current is None or current["revision"] != item.expectedRevision:
                raise HTTPException(status_code=409, detail="AI 제안 미리보기 이후 일정이 변경되었습니다. 다시 제안해 주세요")
        for event_id in create_ids:
            if connection.execute("SELECT 1 FROM events WHERE id=?", (event_id,)).fetchone() is not None:
                raise HTTPException(status_code=409, detail="AI 제안의 새 일정 ID가 이미 존재합니다")
        for item in body.deletes:
            connection.execute(
                "UPDATE events SET deleted_at=?,updated_at=?,revision=revision+1 WHERE id=?",
                (now, now, item.id.strip()),
            )
        created: list[dict[str, Any]] = []
        for event_id, values in zip(create_ids, create_values, strict=True):
            connection.execute(
                "INSERT INTO events(id,date,title,start,end,color,done,scheduled,clock_in,clock_out,elapsed,log,subtasks_json,energy,source,routine_id,revision,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (event_id, *values, now, now),
            )
            created.append(_event_response(connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()))
    return {"status": "ok", "created": created, "deleted": delete_ids}


@router.get("/planner/store/routines")
def list_routines():
    with _database() as connection:
        rows = connection.execute("SELECT * FROM routines ORDER BY title COLLATE NOCASE, id").fetchall()
    return [_routine_response(row) for row in rows]


@router.post("/planner/store/routines", status_code=201)
def create_routine(body: PlannerRoutineBody):
    routine_id = body.id.strip() if body.id else str(uuid.uuid4())
    if not routine_id:
        raise HTTPException(status_code=422, detail="루틴 ID가 비어 있습니다")
    now = _now_iso()
    try:
        with _database() as connection:
            connection.execute(
                "INSERT INTO routines(id,title,start,end,color,days_json,active,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
                (routine_id, *_routine_values(body), now, now),
            )
            row = connection.execute("SELECT * FROM routines WHERE id=?", (routine_id,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="같은 ID의 루틴이 이미 있습니다") from exc
    return _routine_response(row)


@router.put("/planner/store/routines/{routine_id}")
def update_routine(routine_id: str, body: PlannerRoutineUpdateBody):
    now = _now_iso()
    with _database() as connection:
        cursor = connection.execute(
            "UPDATE routines SET title=?,start=?,end=?,color=?,days_json=?,active=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
            (*_routine_values(body), now, routine_id, body.expectedRevision),
        )
        if cursor.rowcount != 1:
            exists = connection.execute("SELECT 1 FROM routines WHERE id=?", (routine_id,)).fetchone()
            raise HTTPException(status_code=409 if exists else 404, detail="루틴이 다른 곳에서 변경되었거나 존재하지 않습니다")
        row = connection.execute("SELECT * FROM routines WHERE id=?", (routine_id,)).fetchone()
    return _routine_response(row)


@router.delete("/planner/store/routines/{routine_id}")
def delete_routine(routine_id: str, body: PlannerEventDeleteBody):
    with _database() as connection:
        cursor = connection.execute("DELETE FROM routines WHERE id=? AND revision=?", (routine_id, body.expectedRevision))
        if cursor.rowcount != 1:
            exists = connection.execute("SELECT 1 FROM routines WHERE id=?", (routine_id,)).fetchone()
            raise HTTPException(status_code=409 if exists else 404, detail="루틴이 다른 곳에서 변경되었거나 존재하지 않습니다")
    return {"id": routine_id, "deleted": True}


@router.get("/planner/store/routine-policy")
def get_routine_policy():
    with _database() as connection:
        row = connection.execute("SELECT * FROM routine_policy WHERE policy_key=1").fetchone()
    return _routine_policy_response(row)


@router.put("/planner/store/routine-policy")
def update_routine_policy(body: PlannerRoutinePolicyBody):
    now = _now_iso()
    with _database() as connection:
        cursor = connection.execute(
            "UPDATE routine_policy SET auto_apply=?,revision=revision+1,updated_at=? WHERE policy_key=1 AND revision=?",
            (int(body.autoApply), now, body.expectedRevision),
        )
        if cursor.rowcount != 1:
            raise HTTPException(status_code=409, detail="루틴 자동 적용 설정이 다른 곳에서 변경되었습니다")
        row = connection.execute("SELECT * FROM routine_policy WHERE policy_key=1").fetchone()
    return _routine_policy_response(row)


def _routine_matches_date(routine: sqlite3.Row, target_date: str) -> bool:
    days = json.loads(routine["days_json"])
    weekday = datetime.strptime(target_date, "%Y-%m-%d").weekday() + 1
    weekday %= 7  # Python Monday=0 -> JavaScript Sunday=0
    return not days or weekday in days


@router.post("/planner/store/routines/apply/{target_date}")
@serialized_vault_write
def apply_routines(target_date: str, automatic: bool = False):
    target_date = _validate_date(target_date)
    with _database() as connection:
        policy = connection.execute("SELECT * FROM routine_policy WHERE policy_key=1").fetchone()
        if automatic and not bool(policy["auto_apply"]):
            return {"created": [], "skipped": "policy-disabled"}
        routines = connection.execute("SELECT * FROM routines WHERE active=1 ORDER BY id").fetchall()
        now = _now_iso()
        created: list[dict[str, Any]] = []
        for routine in routines:
            if not _routine_matches_date(routine, target_date):
                continue
            event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"notion-clone:routine:{routine['id']}:{target_date}"))
            exists = connection.execute(
                "SELECT 1 FROM events WHERE date=? AND routine_id=? AND deleted_at IS NULL",
                (target_date, routine["id"]),
            ).fetchone()
            if exists:
                continue
            cursor = connection.execute(
                "INSERT OR IGNORE INTO events(id,date,title,start,end,color,done,scheduled,subtasks_json,source,routine_id,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,0,1,'[]','routine',?,1,?,?)",
                (event_id, target_date, routine["title"], routine["start"], routine["end"], routine["color"], routine["id"], now, now),
            )
            if cursor.rowcount:
                row = connection.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
                created.append(_event_response(row))
    return {"created": created, "skipped": None}


@router.post("/planner/store/routines/import-legacy")
@serialized_vault_write
def import_legacy_routines(body: PlannerRoutineLegacyImportBody):
    # Source files are copied only after the existing recovery backup still matches.
    # Python으로 치면: assert verified_backup(); sqlite.insert_ignore(source); never write source_file
    backup = planner_recovery.find_matching_verified_backup()
    if backup is None:
        raise HTTPException(status_code=409, detail="현재 루틴 원본과 일치하는 검증 백업이 필요합니다")
    source_path = _selected_vault_path() / "_planner_routines.json"
    if not source_path.exists():
        return {"backupFile": backup["backupFile"], "imported": 0, "skipped": 0, "preservedOriginal": True}
    try:
        source = json.loads(source_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="기존 루틴 파일 형식이 올바르지 않습니다") from exc
    if not isinstance(source, list):
        raise HTTPException(status_code=422, detail="기존 루틴 파일은 배열이어야 합니다")
    bodies = [PlannerRoutineBody(**item) for item in source if isinstance(item, dict)]
    if len(bodies) != len(source):
        raise HTTPException(status_code=422, detail="기존 루틴 항목 형식이 올바르지 않습니다")
    now = _now_iso()
    imported = 0
    with _database() as connection:
        for body in bodies:
            routine_id = body.id.strip() if body.id else ""
            if not routine_id:
                raise HTTPException(status_code=422, detail="기존 루틴 ID가 비어 있습니다")
            cursor = connection.execute(
                "INSERT OR IGNORE INTO routines(id,title,start,end,color,days_json,active,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)",
                (routine_id, *_routine_values(body), now, now),
            )
            if cursor.rowcount:
                connection.execute(
                    "INSERT OR IGNORE INTO migration_routines(source_id,routine_id,source_json,migrated_at) VALUES(?,?,?,?)",
                    (routine_id, routine_id, json.dumps(body.model_dump(), ensure_ascii=False, sort_keys=True), now),
                )
                imported += 1
    return {"backupFile": backup["backupFile"], "imported": imported, "skipped": len(bodies) - imported, "preservedOriginal": True}


@router.get("/planner/store/reviews/{review_date}")
def get_review(review_date: str):
    key = _validate_date(review_date)
    with _database() as connection:
        row = connection.execute("SELECT * FROM reviews WHERE date=?", (key,)).fetchone()
    return None if row is None else dict(row)


@router.put("/planner/store/reviews/{review_date}")
def put_review(review_date: str, body: PlannerReviewBody):
    key = _validate_date(review_date)
    now = _now_iso()
    with _database() as connection:
        existing = connection.execute("SELECT revision FROM reviews WHERE date=?", (key,)).fetchone()
        if existing is None:
            if body.expectedRevision is not None:
                raise HTTPException(status_code=409, detail="회고가 다른 곳에서 변경되었습니다")
            connection.execute("INSERT INTO reviews(date,content,revision,updated_at) VALUES(?,?,1,?)", (key, body.content, now))
        else:
            if body.expectedRevision != existing["revision"]:
                raise HTTPException(status_code=409, detail="회고가 다른 곳에서 변경되었습니다")
            connection.execute("UPDATE reviews SET content=?,revision=revision+1,updated_at=? WHERE date=?", (body.content, now, key))
        row = connection.execute("SELECT * FROM reviews WHERE date=?", (key,)).fetchone()
    return dict(row)


@router.get("/planner/store/backup")
def export_planner_backup():
    """Return a checksummed, versioned JSON snapshot for a user-initiated download."""
    return _planner_portable_payload()


@router.post("/planner/store/import/preview")
def preview_planner_import(body: PlannerPortableImportBody):
    preview, _ = _portable_import_preview(body.payload)
    return preview


@router.post("/planner/store/import")
@serialized_vault_write
def commit_planner_import(body: PlannerPortableImportCommitBody):
    """Insert an all-new verified snapshot only after its preview still matches the current store."""
    preview, (events, reviews, routines) = _portable_import_preview(body.payload)
    if preview["previewFingerprint"] != body.previewFingerprint:
        raise HTTPException(status_code=409, detail="가져오기 미리보기 이후 일정 저장소가 변경되었습니다. 다시 확인해 주세요")
    if preview["totals"]["conflicts"]:
        raise HTTPException(status_code=409, detail="기존 일정과 충돌하는 항목이 있어 안전하게 가져오기를 중단했습니다")
    with _database() as connection:
        # _database commits this entire group together; any insert failure rolls back all additions.
        # Python으로 치면: with transaction: insert(events); insert(reviews); insert(routines)
        for item in events:
            connection.execute(
                "INSERT INTO events(id,date,title,start,end,color,done,scheduled,clock_in,clock_out,elapsed,log,subtasks_json,energy,source,routine_id,revision,created_at,updated_at,deleted_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (item["id"], *item["values"], item["revision"], item["createdAt"], item["updatedAt"], item["deletedAt"]),
            )
        for item in reviews:
            connection.execute(
                "INSERT INTO reviews(date,content,revision,updated_at) VALUES(?,?,?,?)",
                (item["date"], item["content"], item["revision"], item["updated_at"]),
            )
        for item in routines:
            connection.execute(
                "INSERT INTO routines(id,title,start,end,color,days_json,active,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (item["id"], *item["values"], item["revision"], item["createdAt"], item["updatedAt"]),
            )
        # A successful explicit restore is a verified SQLite activation, never an invisible P2-only store.
        connection.execute("INSERT INTO meta(key,value) VALUES('migration_complete','1') ON CONFLICT(key) DO UPDATE SET value='1'")
        connection.execute("INSERT INTO meta(key,value) VALUES('activation_mode','migration') ON CONFLICT(key) DO UPDATE SET value='migration'")
    return {"status": "ok", "imported": preview["byKind"], "preservedLegacySources": True}


@router.get("/planner/store/export.csv")
def export_planner_csv(start_date: str | None = None, end_date: str | None = None):
    """Export a bounded SQLite schedule range as UTF-8 CSV without reading page blocks."""
    clauses, values = ["deleted_at IS NULL"], []
    if start_date:
        clauses.append("date >= ?")
        values.append(_validate_date(start_date))
    if end_date:
        clauses.append("date <= ?")
        values.append(_validate_date(end_date))
    with _database() as connection:
        rows = connection.execute(f"SELECT * FROM events WHERE {' AND '.join(clauses)} ORDER BY date,start,id", values).fetchall()
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["date", "start", "end", "title", "done", "scheduled", "elapsedMinutes", "routineId", "log"])
    for row in rows:
        event = _event_response(row)
        writer.writerow([event["date"], event["start"], event["end"], event["title"], event["done"], event["scheduled"], event["elapsed"], event["routineId"], event["log"]])
    filename = f"planner-{start_date or 'all'}-{end_date or 'all'}.csv"
    return StreamingResponse(iter(["\ufeff" + output.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/planner/store/export.html")
def export_planner_html(start_date: str, end_date: str):
    """Export today/week schedule plus date-keyed SQLite reviews as a self-contained HTML record."""
    start, end = _validate_date(start_date), _validate_date(end_date)
    if start > end:
        raise HTTPException(status_code=422, detail="내보내기 종료일은 시작일보다 늦어야 합니다")
    with _database() as connection:
        events = [_event_response(row) for row in connection.execute("SELECT * FROM events WHERE date>=? AND date<=? AND deleted_at IS NULL ORDER BY date,start,id", (start, end)).fetchall()]
        reviews = [dict(row) for row in connection.execute("SELECT * FROM reviews WHERE date>=? AND date<=? ORDER BY date", (start, end)).fetchall()]
    event_items = "".join(f"<li><strong>{html.escape(event['date'])} {html.escape(event['start'])}–{html.escape(event['end'])}</strong> {html.escape(event['title'])} {'✓' if event['done'] else ''}</li>" for event in events) or "<li>일정 없음</li>"
    review_items = "".join(f"<section><h2>{html.escape(review['date'])} 회고</h2><pre>{html.escape(review['content'])}</pre></section>" for review in reviews)
    document = f"<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><title>일정 기록 {start}–{end}</title><style>body{{font-family:sans-serif;max-width:760px;margin:40px auto;line-height:1.5}}pre{{white-space:pre-wrap;background:#f6f6f6;padding:12px}}li{{margin:6px 0}}</style><h1>일정 기록</h1><p>{start} – {end}</p><h2>일정</h2><ul>{event_items}</ul>{review_items}</html>"
    return StreamingResponse(iter([document]), media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="planner-{start}-{end}.html"'})


@router.get("/planner/store/archive")
def list_planner_archive(start_date: str | None = None, end_date: str | None = None):
    """Browse soft-deleted SQLite schedules without exposing or changing old file archives."""
    clauses, values = ["deleted_at IS NOT NULL"], []
    if start_date:
        clauses.append("date >= ?")
        values.append(_validate_date(start_date))
    if end_date:
        clauses.append("date <= ?")
        values.append(_validate_date(end_date))
    with _database() as connection:
        rows = connection.execute(f"SELECT * FROM events WHERE {' AND '.join(clauses)} ORDER BY date DESC,start,id", values).fetchall()
    return [_event_response(row) for row in rows]
