# ==============================================
# backend/routers/history.py
# 역할: 페이지 버전 히스토리 API
#   - 자동 스냅샷: PUT /api/pages/{id} 저장 시 5분 간격으로 생성
#   - GET  /api/pages/{id}/history           — 버전 목록 (최신순)
#   - GET  /api/pages/{id}/history/{file}    — 특정 버전 전체 데이터
#   - POST /api/pages/{id}/history/restore/{file} — 해당 버전으로 복원
#
# 스냅샷 저장 위치: vault/{pageFolder}/_history/{YYYY-MM-DDTHH-MM-SS}.nct
# 파일명에 콜론(:) 대신 하이픈(-) 사용 — Windows 파일명 규칙
# Python으로 치면: class HistoryRouter(Blueprint): ...
# ==============================================

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.core import (
    CONTENT_EXT,
    assert_inside_vault,
    get_page_dir,
    load_index,
    resolve_content_file,
    save_page_to_disk,
    validate_uuid,
)

# Python으로 치면: blueprint = Blueprint('history', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["history"])

# 파일명 타임스탬프 형식 — 콜론 금지(Windows), 하이픈 사용
# Python으로 치면: TS_FORMAT = '%Y-%m-%dT%H-%M-%S'
TS_FORMAT = "%Y-%m-%dT%H-%M-%S"

# 스냅샷 최소 간격 (초) — 이 시간 이내 저장은 새 스냅샷 생성 안 함
# Python으로 치면: MIN_INTERVAL = 300  # 5분
MIN_SNAPSHOT_INTERVAL_SEC = 180

# 최대 보관 스냅샷 수 — 초과 시 오래된 것 자동 삭제
# Python으로 치면: MAX_SNAPSHOTS = 50
MAX_SNAPSHOTS = 50


# -----------------------------------------------
# 내부 헬퍼 함수
# -----------------------------------------------

def get_history_dir(page_dir: Path) -> Path:
    """
    페이지 폴더 내 _history 서브디렉토리 경로 반환
    Python으로 치면: def get_history_dir(page_dir): return page_dir / '_history'
    """
    return page_dir / "_history"


def save_snapshot(page_data: dict, page_dir: Path) -> bool:
    """
    조건 충족 시 스냅샷 저장 (5분 간격 체크 + 최대 50개 보관)
    pages.py의 PUT 핸들러에서 저장 직후 호출됨
    반환값: 스냅샷을 실제로 저장했으면 True, 간격 미달로 스킵하면 False
    Python으로 치면: def save_snapshot(page, page_dir) -> bool: ...
    """
    history_dir = get_history_dir(page_dir)
    history_dir.mkdir(exist_ok=True)
    assert_inside_vault(history_dir)

    now = datetime.utcnow()

    # 기존 스냅샷 목록 (최신순 정렬)
    # Python으로 치면: existing = sorted(history_dir.glob('*.nct'), reverse=True)
    existing = sorted(history_dir.glob(f"*{CONTENT_EXT}"), reverse=True)

    # 5분 간격 체크 — 마지막 스냅샷이 5분 미만이면 스킵
    if existing:
        try:
            last_ts_str = existing[0].stem  # 예: "2026-03-17T11-17-22"
            last_time = datetime.strptime(last_ts_str, TS_FORMAT)
            elapsed = (now - last_time).total_seconds()
            if elapsed < MIN_SNAPSHOT_INTERVAL_SEC:
                return False
        except ValueError:
            # 파일명 파싱 실패 → 스냅샷 생성 진행
            pass

    # 스냅샷 저장 — snapshotAt 메타 필드 추가
    ts = now.strftime(TS_FORMAT)
    snap_path = history_dir / f"{ts}{CONTENT_EXT}"
    snap_data = {**page_data, "snapshotAt": now.isoformat() + "Z"}
    snap_path.write_text(
        json.dumps(snap_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 최대 50개 초과 시 오래된 것부터 삭제
    # Python으로 치면: for old in all_snaps[50:]: old.unlink()
    all_snaps = sorted(history_dir.glob(f"*{CONTENT_EXT}"), reverse=True)
    for old in all_snaps[MAX_SNAPSHOTS:]:
        old.unlink(missing_ok=True)

    return True


# -----------------------------------------------
# 버전 목록 조회
# -----------------------------------------------

@router.get("/pages/{page_id}/history")
def list_history(page_id: str):
    """
    페이지의 버전 목록 반환 (최신순)
    각 항목: filename, snapshotAt, title, blockCount
    Python으로 치면: def list_history(page_id): return [summary(s) for s in snaps]
    """
    validate_uuid(page_id, "페이지 ID")

    index = load_index()
    page_dir = get_page_dir(page_id, index)
    history_dir = get_history_dir(page_dir)

    # 히스토리 폴더가 없으면 빈 목록 반환
    if not history_dir.exists():
        return {"versions": []}

    versions = []
    for snap in sorted(history_dir.glob(f"*{CONTENT_EXT}"), reverse=True):
        try:
            data = json.loads(snap.read_text(encoding="utf-8"))
            versions.append({
                "filename": snap.name,
                "snapshotAt": data.get("snapshotAt", snap.stem),
                "title": data.get("title", "제목 없음"),
                "blockCount": len(data.get("blocks", [])),
            })
        except Exception:
            # 파싱 실패 스냅샷은 목록에서 제외
            continue

    return {"versions": versions}


# -----------------------------------------------
# 특정 버전 전체 데이터 조회 (미리보기용)
# -----------------------------------------------

@router.get("/pages/{page_id}/history/{filename}")
def get_history_version(page_id: str, filename: str):
    """
    특정 스냅샷의 전체 페이지 데이터 반환
    프론트에서 읽기전용으로 미리보기할 때 사용
    Python으로 치면: def get_version(page_id, filename): return json.load(snap)
    """
    validate_uuid(page_id, "페이지 ID")

    # 🔒 경로 트래버설 방지 — 파일명에 슬래시·도트도트 금지
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다")

    index = load_index()
    page_dir = get_page_dir(page_id, index)
    snap_path = get_history_dir(page_dir) / filename
    assert_inside_vault(snap_path)

    if not snap_path.exists():
        raise HTTPException(status_code=404, detail="해당 버전을 찾을 수 없습니다")

    data = json.loads(snap_path.read_text(encoding="utf-8"))
    return data


# -----------------------------------------------
# 버전 복원
# -----------------------------------------------

@router.post("/pages/{page_id}/history/restore/{filename}")
def restore_history_version(page_id: str, filename: str):
    """
    선택한 버전으로 현재 페이지를 복원
    1. 현재 content.nct를 _history에 즉시 백업 (복원 전 상태 보존)
    2. 선택한 버전 스냅샷을 content.nct에 덮어쓰기
    3. 프론트는 응답 후 해당 페이지를 다시 로드

    Python으로 치면:
        def restore(page_id, filename):
            backup(current → history)
            current ← snapshot
    """
    validate_uuid(page_id, "페이지 ID")

    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다")

    index = load_index()
    page_dir = get_page_dir(page_id, index)
    history_dir = get_history_dir(page_dir)
    assert_inside_vault(history_dir)

    snap_path = history_dir / filename
    assert_inside_vault(snap_path)
    if not snap_path.exists():
        raise HTTPException(status_code=404, detail="해당 버전을 찾을 수 없습니다")

    # 1) 현재 content.nct → _history 즉시 백업
    current_file = resolve_content_file(page_dir)
    if current_file and current_file.exists():
        now_ts = datetime.utcnow().strftime(TS_FORMAT)
        backup_path = history_dir / f"{now_ts}{CONTENT_EXT}"
        current_data = json.loads(current_file.read_text(encoding="utf-8"))
        current_data["snapshotAt"] = datetime.utcnow().isoformat() + "Z"
        backup_path.write_text(
            json.dumps(current_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # 2) 선택한 버전을 content.nct에 복원 (snapshotAt 필드는 제거)
    snap_data = json.loads(snap_path.read_text(encoding="utf-8"))
    snap_data.pop("snapshotAt", None)
    save_page_to_disk(snap_data, page_dir)

    return {"ok": True, "restored": filename}
