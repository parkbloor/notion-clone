# ==============================================
# backend/main.py
# 역할: FastAPI 앱 생성, 미들웨어 설정, 라우터 등록
# Python으로 치면: app = Flask(__name__); app.register_blueprint(...)
#
# 실제 엔드포인트 로직은 routers/ 아래 각 파일 참조:
#   routers/pages.py          — 페이지 CRUD + 이미지 업로드
#   routers/categories.py     — 카테고리 CRUD
#   routers/export_import.py  — JSON/마크다운 내보내기·가져오기
#   routers/search.py         — 전문 검색
#   routers/system.py         — vault 경로, 디버그 로그
# ==============================================

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi import HTTPException

from backend.core import (
    get_vault_dir, get_vaults_root, mem_handler, assert_inside_vault,
    get_cat_dir, get_page_dir, get_trash_dir, load_index, load_trash_index,
    resolve_trash_name, save_index, save_trash_index, now_iso,
)
from backend.routers import categories, cloud_sync, export_import, history, pages, planner, search, system, templates, ai, trash

# ── 로깅 설정 ──────────────────────────────────
# Python으로 치면: logging.basicConfig(); handler = MemoryLogHandler()
logging.getLogger().addHandler(mem_handler)
logging.getLogger("uvicorn.access").addHandler(mem_handler)
logging.getLogger("uvicorn.error").addHandler(mem_handler)

# ── 시작 시 잔존 .tmp 파일 정리 ───────────────────
# atomic write 중 크래시로 남은 .tmp 파일 제거
# Python으로 치면: @app.before_first_request
def _cleanup_tmp_files() -> None:
    """볼트 전체에서 .tmp 파일 제거 (atomic write 잔존물)"""
    log = logging.getLogger(__name__)
    try:
        vault = get_vault_dir()
        removed = 0
        for tmp in vault.rglob("*.tmp"):
            tmp.unlink(missing_ok=True)
            removed += 1
        if removed:
            log.info("시작 시 .tmp 파일 %d개 정리 완료", removed)
    except Exception as e:
        log.warning("tmp 정리 실패: %s", e)


def _migrate_legacy_trash() -> None:
    """
    기존 isTrashed=True 항목을 _vault_trash/ 로 물리 이동 (최초 1회)
    이미 마이그레이션된 볼트는 _trashMigrated 플래그로 스킵
    Python으로 치면: if not migrated: for item in legacy_trash: shutil.move(...)
    """
    import shutil
    log = logging.getLogger(__name__)
    try:
        index = load_index()
        if index.get("_trashMigrated"):
            return

        trash_entries = load_trash_index()
        entry_ids = {e["id"] for e in trash_entries}
        changed = False

        # 레거시 isTrashed 페이지 이동
        for page in index.get("pages", []):
            if not page.get("isTrashed"):
                continue
            pid = page["id"]
            if pid in entry_ids:
                continue  # 이미 새 방식으로 기록된 경우 스킵

            # 물리 파일 위치 추정 — folderMap 또는 page_id 그대로
            folder_name = index.get("folderMap", {}).get(pid, pid)
            # 레거시: 카테고리 내부 or vault 루트
            orig_cat_id = page.get("originalCategoryId")
            if orig_cat_id:
                cat = next((c for c in index.get("categories", []) if c["id"] == orig_cat_id), None)
                src = get_vault_dir() / (cat["folderName"] if cat else "") / folder_name
            else:
                src = get_vault_dir() / folder_name

            trash_dir = get_trash_dir()
            dst_name = resolve_trash_name(folder_name, trash_dir)

            if src.exists():
                shutil.move(str(src), str(trash_dir / dst_name))
                log.info("레거시 트래시 마이그레이션 (페이지): %s → %s", src, dst_name)
            else:
                dst_name = folder_name

            trash_entries.append({
                "id":               pid,
                "type":             "page",
                "groupId":          None,
                "trashedAt":        page.get("trashedAt") or now_iso(),
                "title":            page.get("title", "제목 없음"),
                "icon":             page.get("icon", "📄"),
                "folderName":       folder_name,
                "trashedFolderName": dst_name,
                "originalCategoryId": orig_cat_id,
                "originalCategoryFolderName": None,
            })
            entry_ids.add(pid)
            changed = True

        # 레거시 isTrashed 카테고리 이동
        for cat in index.get("categories", []):
            if not cat.get("isTrashed"):
                continue
            cid = cat["id"]
            if cid in entry_ids:
                continue

            cat_dir = get_cat_dir(cid, index)
            folder_name = cat.get("folderName", "")
            trash_dir = get_trash_dir()
            dst_name = resolve_trash_name(folder_name, trash_dir)

            if cat_dir.exists():
                shutil.move(str(cat_dir), str(trash_dir / dst_name))
                log.info("레거시 트래시 마이그레이션 (카테고리): %s → %s", cat_dir, dst_name)
            else:
                dst_name = folder_name

            trash_entries.append({
                "id":                   cid,
                "type":                 "category",
                "groupId":              cat.get("trashGroupId"),
                "trashedAt":            cat.get("trashedAt") or now_iso(),
                "name":                 cat.get("name", ""),
                "folderName":           folder_name,
                "trashedFolderName":    dst_name,
                "originalParentId":     cat.get("originalParentId"),
                "originalParentFolderName": None,
                "children":             [],
            })
            entry_ids.add(cid)
            changed = True

        if changed:
            # _index.nct에서 isTrashed 항목 완전 제거
            index["pages"] = [p for p in index.get("pages", []) if not p.get("isTrashed")]
            index["categories"] = [c for c in index.get("categories", []) if not c.get("isTrashed")]
            save_trash_index(trash_entries)

        # 마이그레이션 완료 플래그
        index["_trashMigrated"] = True
        save_index(index)
        if changed:
            log.info("레거시 휴지통 마이그레이션 완료")
    except Exception as e:
        logging.getLogger(__name__).warning("레거시 트래시 마이그레이션 실패 (무시): %s", e)


@asynccontextmanager
async def lifespan(app):
    # 앱 시작 시 실행
    _cleanup_tmp_files()
    _migrate_legacy_trash()
    yield
    # 앱 종료 시 실행 (필요 시 추가)


# ── FastAPI 앱 생성 ────────────────────────────
# Python으로 치면: app = Flask(__name__)
app = FastAPI(title="노션 클론 백엔드", version="2.0.0", lifespan=lifespan)

# ── CORS 설정 ──────────────────────────────────
# Next.js 개발 서버 요청을 허용
# localhost, loopback, 사설망 개발 주소의 3000 포트를 허용
# 브라우저에서 PC의 LAN 주소(예: 172.30.1.57)로 열어도 API 요청이 CORS에 막히지 않게 함
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=(
        r"^http://(?:"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}"
        r"):3000$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 정적 파일 서빙 (동적 vault 경로 지원) ────────
# 볼트 전환 시 경로가 바뀌므로 StaticFiles 대신 커스텀 라우트 사용
# Python으로 치면: @app.route('/static/<path>') def serve(path): return send_file(vault/path)
@app.get("/static/{path:path}")
async def serve_static(path: str):
    # 현재 활성 볼트에서 파일 서빙
    file_path = get_vault_dir() / path
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    # 볼트 경계 검증 — 경로 트래버설로 볼트 밖 파일 노출 방지
    assert_inside_vault(file_path)
    return FileResponse(str(file_path))

# ── 라우터 등록 ────────────────────────────────
# Python으로 치면: app.register_blueprint(pages_bp)
app.include_router(pages.router)
app.include_router(categories.router)
app.include_router(export_import.router)
app.include_router(search.router)
app.include_router(system.router)
app.include_router(templates.router)
app.include_router(ai.router)
app.include_router(trash.router)
app.include_router(history.router)
app.include_router(cloud_sync.router)
app.include_router(planner.router)


# ── PyInstaller 번들 진입점 ─────────────────────────
# python main.py 로 직접 실행하거나 PyInstaller 번들로 실행될 때만 uvicorn 구동
# uvicorn backend.main:app 으로 실행할 때는 __name__ == 'backend.main' 이므로 스킵
# Python으로 치면: if __name__ == '__main__': uvicorn.run(app)
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000, log_level='info')
