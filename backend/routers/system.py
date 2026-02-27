# ==============================================
# backend/routers/system.py
# 역할: 시스템 설정, 디버그 로그 API
# Python으로 치면: Flask Blueprint('system', ...)
# ==============================================

import asyncio
import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core import VAULT_DIR, CONFIG_FILE, load_index, mem_handler

# Python으로 치면: blueprint = Blueprint('system', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["system"])

# tkinter 다이얼로그는 반드시 단일 스레드에서 순차 실행 (GUI 이벤트 루프 충돌 방지)
# Python으로 치면: _executor = ThreadPoolExecutor(max_workers=1)
_tk_executor = ThreadPoolExecutor(max_workers=1)


# -----------------------------------------------
# vault 경로 + 사용 통계 반환
# Python으로 치면: def get_vault_path(): return {'vault_path': str(VAULT_DIR), ...}
# -----------------------------------------------
@router.get("/settings/vault-path")
def get_vault_path():
    """현재 vault 경로와 사용 현황 통계 반환"""
    index = load_index()
    # pageOrder 기준으로 페이지 수 계산
    # Python으로 치면: page_count = len(index.get('pageOrder', []))
    page_count = len(index.get("pageOrder", []))
    category_count = len(index.get("categories", []))

    # vault 전체 디스크 사용량 계산 (bytes → KB)
    # Python으로 치면: total = sum(f.stat().st_size for f in vault.rglob('*'))
    total_size = 0
    if VAULT_DIR.exists():
        for f in VAULT_DIR.rglob("*"):
            if f.is_file():
                total_size += f.stat().st_size

    return {
        "vault_path":    str(VAULT_DIR.resolve()),
        "total_pages":   page_count,
        "categories":    category_count,
        "total_size_kb": total_size // 1024,
    }


# -----------------------------------------------
# vault 경로 변경 요청 바디
# Python으로 치면: @dataclass class VaultPathBody: new_path: str; move_data: bool
# -----------------------------------------------
class VaultPathBody(BaseModel):
    new_path:  str
    # True이면 기존 vault 파일을 새 경로로 복사 (기본값)
    # Python으로 치면: move_data: bool = True
    move_data: bool = True


# -----------------------------------------------
# vault 경로 변경
# 1. 새 경로 검증 및 생성
# 2. move_data=True이면 기존 파일 모두 복사
# 3. vault_config.json 저장 → 서버 재시작 시 활성화
# Python으로 치면: def set_vault_path(body): validate → copy → save_config
# -----------------------------------------------
@router.post("/settings/vault-path")
def set_vault_path(body: VaultPathBody):
    """
    vault 경로 변경 —
    - vault_config.json에 새 경로 저장
    - move_data=True이면 기존 데이터를 새 위치로 복사 (원본 유지)
    - 서버 재시작 후 새 경로가 활성화됨
    """
    # 절대경로로 정규화
    # Python으로 치면: new_path = Path(body.new_path).resolve()
    try:
        new_path = Path(body.new_path.strip()).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="올바른 경로를 입력해 주세요")

    # 현재 경로와 동일하면 변경 불필요
    # Python으로 치면: if new_path == VAULT_DIR.resolve(): raise ...
    if new_path == VAULT_DIR.resolve():
        raise HTTPException(status_code=400, detail="현재 경로와 동일합니다")

    # 새 경로 생성 (상위 폴더까지 포함)
    # Python으로 치면: new_path.mkdir(parents=True, exist_ok=True)
    try:
        new_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"경로를 생성할 수 없습니다: {e}")

    # 기존 데이터 복사 (move_data=True이고 현재 vault가 존재할 때)
    # 복사 후 원본은 그대로 유지 (안전)
    # Python으로 치면:
    #   if move_data and VAULT_DIR.exists():
    #       for item in VAULT_DIR.iterdir(): shutil.copytree(item, new_path/item.name)
    moved = False
    if body.move_data and VAULT_DIR.exists():
        try:
            for item in VAULT_DIR.iterdir():
                dest = new_path / item.name
                if item.is_dir():
                    shutil.copytree(str(item), str(dest), dirs_exist_ok=True)
                else:
                    shutil.copy2(str(item), str(dest))
            moved = True
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"데이터 복사 중 오류: {e}")

    # vault_config.json 저장 → 다음 서버 시작 시 VAULT_DIR 결정에 사용
    # Python으로 치면: json.dump({'vault_path': str(new_path)}, open(CONFIG_FILE, 'w'))
    CONFIG_FILE.write_text(
        json.dumps({"vault_path": str(new_path)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "ok":              True,
        "new_path":        str(new_path),
        "moved":           moved,
        "requires_restart": True,
    }


# -----------------------------------------------
# 네이티브 폴더 선택 다이얼로그 (Windows 탐색기)
# tkinter.filedialog.askdirectory() → 선택된 절대경로 반환
# Python으로 치면: def browse_folder(): return tkinter_dialog.askdirectory()
# -----------------------------------------------
def _open_folder_dialog() -> Optional[str]:
    """
    tkinter 폴더 선택 다이얼로그를 열고 선택된 경로를 반환.
    취소하면 None 반환.
    Python으로 치면: root = Tk(); folder = askdirectory(); root.destroy(); return folder
    """
    try:
        import tkinter as tk
        from tkinter import filedialog
        # 메인 창 없이 다이얼로그만 표시
        root = tk.Tk()
        root.withdraw()                    # 빈 Tk 창 숨기기
        root.wm_attributes('-topmost', 1)  # 다이얼로그를 최상위로
        folder = filedialog.askdirectory(
            title="vault 폴더 선택",
            mustexist=False,               # 새 폴더도 입력 가능
        )
        root.destroy()
        # askdirectory는 취소 시 빈 문자열 반환
        return folder if folder else None
    except Exception:
        return None


@router.get("/settings/browse-folder")
async def browse_folder():
    """
    Windows 탐색기 폴더 선택 다이얼로그를 열고 선택된 경로 반환.
    tkinter GUI는 별도 스레드에서 실행 (메인 이벤트 루프 블로킹 방지).
    Python으로 치면: path = await run_in_executor(_open_folder_dialog)
    """
    loop = asyncio.get_event_loop()
    path = await loop.run_in_executor(_tk_executor, _open_folder_dialog)
    return {"path": path}


# -----------------------------------------------
# 디버그 로그 반환
# Python으로 치면: def get_debug_logs(): return list(mem_handler.records)
# -----------------------------------------------
@router.get("/debug/logs")
def get_debug_logs():
    """메모리에 보관 중인 최근 로그 반환 (최대 100개)"""
    return {"logs": list(mem_handler.records)}
