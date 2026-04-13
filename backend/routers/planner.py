# ==============================================
# backend/routers/planner.py
# 역할: Day Planner 아카이브 API
#   - GET  /api/planner/archive  → 전체 아카이브 읽기 (읽기 전용 열람)
#   - POST /api/planner/archive  → 90일 초과 이벤트 append 저장
#
# 저장 파일: {VAULT_DIR}/_planner_archive.json
# 형식: { "YYYY-MM-DD": [PlanEvent, ...], ... }
#
# 보안: assert_inside_vault()로 경로 트래버설 차단
# Python으로 치면: Flask Blueprint('planner', ...)
# ==============================================

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core import get_vault_dir, assert_inside_vault

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/planner", tags=["planner"])

# 아카이브 파일명 (vault 루트에 위치)
# Python으로 치면: ARCHIVE_FILE = '_planner_archive.json'
ARCHIVE_FILE   = "_planner_archive.json"

# 루틴 파일명 (vault 루트에 위치) — localStorage 대신 파일 시스템에 영속 저장
# Python으로 치면: ROUTINES_FILE = '_planner_routines.json'
ROUTINES_FILE  = "_planner_routines.json"


def _routines_path() -> Path:
    """루틴 파일의 절대 경로 반환. vault 하위 여부 검증 포함."""
    path = get_vault_dir() / ROUTINES_FILE
    assert_inside_vault(path)
    return path


def _load_routines() -> list[Any]:
    """루틴 파일 읽기. 없으면 빈 리스트 반환.
    Python으로 치면: json.load(f) if os.path.exists(path) else []
    """
    path = _routines_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as e:
        log.warning("루틴 파일 읽기 실패 (빈 리스트 반환): %s", e)
        return []


def _save_routines(routines: list[Any]) -> None:
    """루틴 파일 atomic write 저장.
    Python으로 치면: with open(path, 'w') as f: json.dump(routines, f, ensure_ascii=False)
    """
    path = _routines_path()
    tmp  = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(routines, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
    except OSError as e:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"루틴 저장 실패: {e}") from e


def _archive_path() -> Path:
    """아카이브 파일의 절대 경로를 반환. vault 하위 여부 검증 포함."""
    path = get_vault_dir() / ARCHIVE_FILE
    assert_inside_vault(path)
    return path


def _load_archive() -> dict[str, Any]:
    """아카이브 파일 읽기. 없으면 빈 dict 반환.
    Python으로 치면: json.load(f) if os.path.exists(path) else {}
    """
    path = _archive_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        log.warning("아카이브 파일 읽기 실패 (빈 dict 반환): %s", e)
        return {}


def _save_archive(data: dict[str, Any]) -> None:
    """아카이브 파일 atomic write 저장.
    Python으로 치면: with open(path, 'w') as f: json.dump(data, f, ensure_ascii=False)
    """
    path = _archive_path()
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
    except OSError as e:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"아카이브 저장 실패: {e}") from e


# ── Pydantic 요청 모델 ─────────────────────────
# Python으로 치면: @dataclass class ArchiveAppendBody: data: dict[str, list]
class ArchiveAppendBody(BaseModel):
    # { "YYYY-MM-DD": [PlanEvent dict, ...] }
    # FastAPI가 dict 자동 파싱 — Pydantic root model 대신 Any dict 사용
    class Config:
        extra = "allow"


# ── GET /api/planner/archive ──────────────────
# 전체 아카이브 반환 (읽기 전용 — 프론트 아카이브 뷰어용)
# Python으로 치면: def get_archive(): return json.load(archive_file)
@router.get("/archive")
async def get_archive() -> dict[str, Any]:
    """아카이브 전체 반환. 없으면 빈 dict."""
    return _load_archive()


# ── POST /api/planner/archive ─────────────────
# 90일 초과 이벤트를 기존 아카이브에 merge 저장 (덮어쓰기 아님)
# Python으로 치면: def append_archive(body): archive.update(body); save(archive)
@router.post("/archive")
async def append_archive(body: dict[str, Any]) -> dict[str, str]:
    """
    body: { "2025-10-01": [...events], "2025-10-02": [...events], ... }
    기존 아카이브에 merge (새 키 추가, 기존 키 유지).
    이미 존재하는 날짜 키는 덮어쓰지 않음 (읽기 전용 보장).
    """
    if not body:
        return {"status": "no-op"}

    archive = _load_archive()
    added = 0

    for date_key, events in body.items():
        # 날짜 키 기본 검증: 'YYYY-MM-DD' 형식만 허용 (경로 트래버설 방지)
        if len(date_key) != 10 or date_key[4] != "-" or date_key[7] != "-":
            log.warning("잘못된 날짜 키 무시: %s", date_key)
            continue
        if date_key not in archive:
            # 이미 존재하는 날짜는 건드리지 않음 (읽기 전용 보장)
            archive[date_key] = events
            added += 1

    if added > 0:
        _save_archive(archive)
        log.info("아카이브에 %d일치 데이터 추가됨", added)

    return {"status": "ok", "added": str(added)}


# ── GET /api/planner/routines ─────────────────
# 루틴 목록 반환 (localStorage 대신 파일 시스템에서 로드)
# Python으로 치면: def get_routines(): return json.load(routines_file)
@router.get("/routines")
async def get_routines() -> list[Any]:
    """루틴 목록 전체 반환. 파일 없으면 빈 리스트."""
    return _load_routines()


# ── PUT /api/planner/routines ─────────────────
# 루틴 목록 전체 저장 (전체 교체 방식 — 병합 아님)
# Python으로 치면: def save_routines(body): json.dump(body, routines_file)
@router.put("/routines")
async def save_routines(body: list[Any]) -> dict[str, str]:
    """루틴 목록 전체를 파일에 저장. 기존 파일 전체 교체."""
    _save_routines(body)
    log.info("루틴 %d개 저장됨", len(body))
    return {"status": "ok", "count": str(len(body))}
