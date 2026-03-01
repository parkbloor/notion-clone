# =============================================
# backend/backend.spec
# 역할: PyInstaller 번들 설정 파일
# 실행 위치: 프로젝트 루트에서 실행
#   python -m PyInstaller backend/backend.spec --distpath dist-backend --workpath build-backend --noconfirm
# =============================================

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── collect_all: 패키지 전체(데이터+바이너리+서브모듈) 수집 ──────
# hiddenimports만으로는 fastapi/uvicorn 같은 복잡한 패키지를 놓치는 경우가 있음
# collect_all은 설치된 패키지 디렉토리를 통째로 스캔하여 빠짐없이 포함

fastapi_d,   fastapi_b,   fastapi_h   = collect_all('fastapi')
starlette_d, starlette_b, starlette_h = collect_all('starlette')
uvicorn_d,   uvicorn_b,   uvicorn_h   = collect_all('uvicorn')
pydantic_d,  pydantic_b,  pydantic_h  = collect_all('pydantic')
anyio_d,     anyio_b,     anyio_h     = collect_all('anyio')
h11_d,       h11_b,       h11_h       = collect_all('h11')
multipart_d, multipart_b, multipart_h = collect_all('multipart')

# ── 분석 단계: 의존성 탐색 ──────────────────────────────
a = Analysis(
    # 진입점: main.py (spec 파일과 같은 backend/ 폴더 기준 상대 경로)
    ['main.py'],

    # Python 경로: 프로젝트 루트를 모듈 검색 경로에 추가
    # → backend.core, backend.routers.X 등 절대경로 임포트 지원
    pathex=[str(Path('.').resolve())],

    binaries=fastapi_b + starlette_b + uvicorn_b + pydantic_b + anyio_b + h11_b + multipart_b,
    datas=fastapi_d + starlette_d + uvicorn_d + pydantic_d + anyio_d + h11_d + multipart_d,

    hiddenimports=(
        fastapi_h + starlette_h + uvicorn_h + pydantic_h + anyio_h + h11_h + multipart_h
        + [
            # uvicorn 동적 임포트
            'uvicorn.logging',
            'uvicorn.loops',
            'uvicorn.loops.auto',
            'uvicorn.loops.asyncio',
            'uvicorn.protocols',
            'uvicorn.protocols.http',
            'uvicorn.protocols.http.auto',
            'uvicorn.protocols.http.h11_impl',
            'uvicorn.protocols.websockets',
            'uvicorn.protocols.websockets.auto',
            'uvicorn.lifespan',
            'uvicorn.lifespan.on',
            'uvicorn.lifespan.off',
            'uvicorn.config',
            'uvicorn.main',
            # anyio 백엔드
            'anyio._backends._asyncio',
            # multipart (파일/비디오 업로드) — python-multipart 패키지
            'multipart',
            'multipart.multipart',
            # tkinter (폴더 선택 다이얼로그)
            'tkinter',
            'tkinter.filedialog',
            '_tkinter',
            # 백엔드 패키지 — main.py 가 'from backend.X import ...' 형태로 임포트
            # pathex=[project_root] 이므로 backend.X 형태로 명시
            'backend',
            'backend.core',
            'backend.routers',
            'backend.routers.pages',
            'backend.routers.categories',
            'backend.routers.export_import',
            'backend.routers.search',
            'backend.routers.system',
            'backend.routers.templates',
            'backend.routers.ai',
            # OpenAI SDK
            'openai',
            'openai.resources',
            'openai.resources.chat',
            'openai.resources.chat.completions',
            'httpx',
            # Anthropic (Claude) SDK
            'anthropic',
            'anthropic.resources',
            'anthropic.resources.messages',
            'anthropic._client',
            'anthropic.types',
        ]
    ),

    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'numpy', 'pandas', 'matplotlib', 'scipy',
        'PIL', 'cv2', 'torch', 'tensorflow',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # 프로덕션: 콘솔 창 숨김
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='backend',
)
