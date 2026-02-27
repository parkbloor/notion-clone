# =============================================
# backend/backend.spec
# 역할: PyInstaller 번들 설정 파일
# 실행 위치: 프로젝트 루트에서 실행
#   cd <project_root>
#   pyinstaller backend/backend.spec --distpath dist-backend --workpath build-backend
# =============================================

import sys
from pathlib import Path

block_cipher = None

# ── 분석 단계: 의존성 탐색 ──────────────────────────────
a = Analysis(
    # 진입점: backend/main.py (프로젝트 루트 기준 상대 경로)
    ['backend/main.py'],

    # Python 경로: backend/ 폴더를 모듈 검색 경로에 추가
    pathex=[str(Path('backend').resolve())],

    binaries=[],
    datas=[],

    # ── hiddenimports: PyInstaller가 자동 감지 못하는 의존성 ──
    # uvicorn/fastapi는 동적 임포트를 많이 사용 → 명시 필요
    hiddenimports=[
        # uvicorn 핵심 모듈
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'uvicorn.config',
        'uvicorn.main',

        # anyio (uvicorn 비동기 백엔드)
        'anyio',
        'anyio._backends._asyncio',
        'anyio._backends._trio',

        # fastapi / starlette 플러그인
        'fastapi',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.responses',

        # pydantic
        'pydantic',
        'pydantic.v1',

        # h11 (HTTP/1.1 파서)
        'h11',

        # multipart (파일 업로드)
        'multipart',
        'python_multipart',

        # tkinter (폴더 선택 다이얼로그)
        'tkinter',
        'tkinter.filedialog',
        '_tkinter',

        # 표준 라이브러리 (누락 가능)
        'email.mime.text',
        'email.mime.multipart',
    ],

    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 불필요한 무거운 패키지 제외
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
    console=False,  # 콘솔 창 숨김 (True로 바꾸면 디버그 창 표시)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# ── COLLECT: 모든 파일을 dist-backend/backend/ 폴더에 모음 ──
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
