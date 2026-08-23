"""Dedicated SQLite storage for planner events and daily reviews.

P2 only exposes the new store. Existing Day Planner blocks are intentionally
not migrated or rewritten here; migration is a separate, backup-gated step.
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import get_vaults_root, list_vaults, serialized_vault_write


router = APIRouter(prefix="/api", tags=["planner-store"])
CONFIG_FILENAME = ".planner_data_config.json"
STORE_DIRECTORY = "_planner"
DATABASE_FILENAME = "planner.sqlite3"
SCHEMA_VERSION = 1


class PlannerDataSettingsBody(BaseModel):
    plannerVaultName: str | None = None


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


class PlannerReviewBody(BaseModel):
    content: str
    expectedRevision: int | None = Field(default=None, ge=1)


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
        """)
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
    return (
        _validate_date(body.date), body.title.strip(), _validate_time(body.start), _validate_time(body.end),
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
        return {**settings, "databaseReady": False, "schemaVersion": None, "eventCount": 0, "migrationComplete": False, "writeMode": "legacy"}
    with _database() as connection:
        count = connection.execute("SELECT COUNT(*) FROM events WHERE deleted_at IS NULL").fetchone()[0]
        migration_row = connection.execute("SELECT value FROM meta WHERE key='migration_complete'").fetchone()
        migration_complete = migration_row is not None and migration_row["value"] == "1"
    return {
        **settings, "databaseReady": True, "schemaVersion": SCHEMA_VERSION, "eventCount": count,
        "migrationComplete": migration_complete,
        "writeMode": "sqlite" if migration_complete else "legacy",
    }


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
