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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.core import VAULT_DIR, mem_handler
from backend.routers import categories, export_import, pages, search, system, templates

# ── 로깅 설정 ──────────────────────────────────
# Python으로 치면: logging.basicConfig(); handler = MemoryLogHandler()
logging.getLogger().addHandler(mem_handler)
logging.getLogger("uvicorn.access").addHandler(mem_handler)
logging.getLogger("uvicorn.error").addHandler(mem_handler)

# ── FastAPI 앱 생성 ────────────────────────────
# Python으로 치면: app = Flask(__name__)
app = FastAPI(title="노션 클론 백엔드", version="2.0.0")

# ── CORS 설정 ──────────────────────────────────
# Next.js 개발 서버 요청을 허용
# 127.0.0.1:3000과 localhost:3000을 모두 허용 (브라우저는 두 주소를 다른 origin으로 취급함)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 정적 파일 서빙 ─────────────────────────────
# vault 폴더 안의 이미지를 /static/... 경로로 제공
app.mount("/static", StaticFiles(directory=str(VAULT_DIR)), name="static")

# ── 라우터 등록 ────────────────────────────────
# Python으로 치면: app.register_blueprint(pages_bp)
app.include_router(pages.router)
app.include_router(categories.router)
app.include_router(export_import.router)
app.include_router(search.router)
app.include_router(system.router)
app.include_router(templates.router)


# ── PyInstaller 번들 진입점 ─────────────────────────
# python main.py 로 직접 실행하거나 PyInstaller 번들로 실행될 때만 uvicorn 구동
# uvicorn backend.main:app 으로 실행할 때는 __name__ == 'backend.main' 이므로 스킵
# Python으로 치면: if __name__ == '__main__': uvicorn.run(app)
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000, log_level='info')
