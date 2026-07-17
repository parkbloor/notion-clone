# ==============================================
# backend/routers/system.py
# 역할: 시스템 설정, 볼트 관리, 디버그 로그 API
# Python으로 치면: Flask Blueprint('system', ...)
# ==============================================

import asyncio
import json
import re
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import logging

from backend.core import (
    CONFIG_FILE,
    get_vault_dir,
    get_vaults_root,
    set_vault_dir,
    set_vaults_root,
    list_vaults,
    load_index,
    save_index,
    scan_vault_for_pages,
    mem_handler,
)

_log = logging.getLogger(__name__)

# Python으로 치면: blueprint = Blueprint('system', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["system"])

# tkinter 다이얼로그는 반드시 단일 스레드에서 순차 실행 (GUI 이벤트 루프 충돌 방지)
_tk_executor = ThreadPoolExecutor(max_workers=1)


# -----------------------------------------------
# 볼트 목록 + 현재 볼트 통계 반환 (설정 탭 열 때마다 호출)
# vaults_root 하위 폴더를 스캔해 볼트 목록 반환
# Python으로 치면: def get_vault_info(): return {'vaults': scan_subfolders(), ...}
# -----------------------------------------------
@router.get("/settings/vault-info")
def get_vault_info():
    """
    현재 볼트 통계 + vaults_root 스캔 결과 반환
    설정 탭이 열릴 때마다 호출 → 탐색기에서 만든 폴더 자동 인식
    """
    index = load_index()
    page_count = len(index.get("pageOrder", []))
    category_count = len(index.get("categories", []))

    # 현재 볼트 디스크 사용량 계산
    total_size = 0
    vault = get_vault_dir()
    if vault.exists():
        for f in vault.rglob("*"):
            if f.is_file():
                total_size += f.stat().st_size

    return {
        "vaults_root":      str(get_vaults_root()),
        "current_vault":    vault.name,
        "current_vault_path": str(vault.resolve()),
        "total_pages":      page_count,
        "categories":       category_count,
        "total_size_kb":    total_size // 1024,
        "vaults":           list_vaults(),
    }


# 하위 호환: 구버전 StorageTab이 사용하던 vault-path 엔드포인트도 유지
@router.get("/settings/vault-path")
def get_vault_path():
    """구버전 호환 — vault-info로 리디렉션"""
    return get_vault_info()


# -----------------------------------------------
# 볼트 전환 (데이터 복사 없이 경로만 즉시 교체)
# Python으로 치면: def switch_vault(name): set_vault_dir(root/name); reload()
# -----------------------------------------------
class SwitchVaultBody(BaseModel):
    # 볼트 이름 (vaults_root 하위 폴더명)
    vault_name: str


def _resolve_vault_path(vault_name: str) -> tuple[str, Path]:
    """볼트 이름을 검증하고 vaults_root 바로 아래의 안전한 경로로 변환한다.
    Python으로 치면: def resolve_vault_path(name): validate(name); return root / name
    """
    name = vault_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="볼트 이름을 입력해 주세요")

    # Windows 폴더명 금지 문자와 경로 이동 문자를 차단
    if not re.match(r'^[^/\\:*?"<>|\x00]+$', name) or '..' in name or name == '.':
        raise HTTPException(status_code=400, detail="허용되지 않는 문자가 포함된 볼트 이름입니다")

    # Windows 예약 장치명은 확장자가 붙어도 폴더명으로 사용할 수 없음
    reserved_names = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    if name.split('.')[0].upper() in reserved_names:
        raise HTTPException(status_code=400, detail="Windows에서 사용할 수 없는 볼트 이름입니다")

    root = get_vaults_root().resolve()
    new_path = (root / name).resolve()
    try:
        new_path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="볼트 경로가 루트 폴더 밖을 벗어납니다") from exc

    if new_path == root:
        raise HTTPException(status_code=400, detail="볼트 이름을 확인해 주세요")

    return name, new_path


@router.post("/settings/vaults", status_code=201)
def create_vault(body: SwitchVaultBody):
    """vaults_root 아래에 빈 볼트 폴더만 생성한다. 현재 볼트는 전환하지 않는다.
    Python으로 치면: def create_vault(name): (vaults_root / name).mkdir()
    """
    vault_name, new_path = _resolve_vault_path(body.vault_name)
    if new_path.exists():
        raise HTTPException(status_code=409, detail="같은 이름의 볼트가 이미 있습니다")

    try:
        new_path.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"폴더를 만들 수 없습니다: {exc}") from exc

    _log.info("create_vault: 빈 볼트 폴더 생성 → %s", new_path)
    return {"ok": True, "vault_name": vault_name, "vault_path": str(new_path)}


class RenameVaultBody(BaseModel):
    # 변경할 새 볼트 폴더명
    new_name: str


@router.patch("/settings/vaults/{vault_name}")
def rename_vault(vault_name: str, body: RenameVaultBody):
    """볼트 폴더명을 같은 vaults_root 안에서 변경한다.
    Python으로 치면: def rename_vault(old, new): (root / old).rename(root / new)
    """
    old_name, old_path = _resolve_vault_path(vault_name)
    new_name, new_path = _resolve_vault_path(body.new_name)

    if old_path == new_path:
        raise HTTPException(status_code=400, detail="현재 이름과 동일합니다")
    if not old_path.is_dir():
        raise HTTPException(status_code=404, detail="볼트를 찾을 수 없습니다")
    if new_path.exists():
        raise HTTPException(status_code=409, detail="같은 이름의 볼트가 이미 있습니다")

    was_current = old_path.resolve() == get_vault_dir().resolve()
    try:
        old_path.rename(new_path)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"볼트 이름을 변경할 수 없습니다: {exc}") from exc

    # 현재 볼트의 폴더명을 바꾼 경우 런타임 경로와 vault_config.json도 즉시 갱신
    if was_current:
        set_vault_dir(new_path)

    _log.info("rename_vault: %s → %s", old_path, new_path)
    return {
        "ok": True,
        "old_name": old_name,
        "vault_name": new_name,
        "vault_path": str(new_path),
        "was_current": was_current,
    }


@router.post("/settings/switch-vault")
def switch_vault(body: SwitchVaultBody):
    """
    지정한 볼트로 즉시 전환 (재시작 불필요)
    - vaults_root / vault_name 경로로 _current_vault_dir 교체
    - _index.nct 없으면 빈 구조로 자동 초기화
    - vault_config.json 즉시 저장
    Python으로 치면: set_vault_dir(root / name); save_config()
    """
    vault_name, new_path = _resolve_vault_path(body.vault_name)

    if new_path.resolve() == get_vault_dir().resolve():
        raise HTTPException(status_code=400, detail="현재 볼트와 동일합니다")

    try:
        new_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"폴더를 만들 수 없습니다: {e}")

    # 메모리 즉시 교체 + vault_config.json 저장
    set_vault_dir(new_path)
    _log.info("switch_vault: 전환 완료 → %s", new_path)

    # _index.nct 없으면 폴더를 스캔해 자동 재구성
    # (탐색기에서 복사한 볼트, 구버전 볼트 등 대응)
    index_file = new_path / "_index.nct"
    recovered = 0
    if not index_file.exists():
        _log.info("switch_vault: _index.nct 없음 → 볼트 스캔 시작")
        new_index = scan_vault_for_pages(new_path)
        if new_index["pageOrder"]:
            # 복구된 페이지가 있을 때만 저장 (완전히 빈 볼트는 빈 페이지로 시작)
            save_index(new_index)
            recovered = len(new_index["pageOrder"])
            _log.info("switch_vault: %d개 페이지 복구 완료", recovered)

    return {
        "ok":           True,
        "vault_name":   vault_name,
        "vault_path":   str(new_path),
        "recovered":    recovered,  # 자동 복구된 페이지 수 (0 이면 복구 없음)
    }


# -----------------------------------------------
# vaults_root 변경
# Python으로 치면: def change_vaults_root(new_root): set_vaults_root(new_root)
# -----------------------------------------------
class ChangeRootBody(BaseModel):
    vaults_root: str


@router.post("/settings/vaults-root")
def change_vaults_root(body: ChangeRootBody):
    """
    볼트 루트 폴더 변경
    기존 볼트 데이터는 건드리지 않음 — 새 루트의 하위 폴더가 볼트 목록이 됨
    """
    try:
        new_root = Path(body.vaults_root.strip()).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="올바른 경로를 입력해 주세요")

    try:
        new_root.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"폴더를 만들 수 없습니다: {e}")

    set_vaults_root(new_root)
    return {"ok": True, "vaults_root": str(new_root)}


# -----------------------------------------------
# 고급: 데이터 복사 포함 vault 경로 변경 (레거시)
# Python으로 치면: def change_vault_path_with_copy(new_path, move_data): ...
# -----------------------------------------------
class VaultPathBody(BaseModel):
    new_path:  str
    move_data: bool = True


@router.post("/settings/vault-path")
def set_vault_path(body: VaultPathBody):
    """
    vault 경로 변경 + 선택적 데이터 복사 (고급 옵션)
    move_data=True이면 기존 파일을 새 위치로 복사
    """
    try:
        new_path = Path(body.new_path.strip()).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="올바른 경로를 입력해 주세요")

    if new_path == get_vault_dir().resolve():
        raise HTTPException(status_code=400, detail="현재 경로와 동일합니다")

    try:
        new_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"경로를 생성할 수 없습니다: {e}")

    moved = False
    if body.move_data and get_vault_dir().exists():
        try:
            for item in get_vault_dir().iterdir():
                dest = new_path / item.name
                if item.is_dir():
                    shutil.copytree(str(item), str(dest), dirs_exist_ok=True)
                else:
                    shutil.copy2(str(item), str(dest))
            moved = True
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"데이터 복사 중 오류: {e}")

    # 새 경로를 현재 볼트로 즉시 전환
    set_vault_dir(new_path)

    return {
        "ok":    True,
        "moved": moved,
    }


# -----------------------------------------------
# 네이티브 폴더 선택 다이얼로그 (Windows 탐색기)
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
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', 1)
        folder = filedialog.askdirectory(
            title="vault 폴더 선택",
            mustexist=False,
        )
        root.destroy()
        return folder if folder else None
    except Exception:
        return None


@router.get("/settings/browse-folder")
async def browse_folder():
    """
    Windows 탐색기 폴더 선택 다이얼로그를 열고 선택된 경로 반환.
    Python으로 치면: path = await run_in_executor(_open_folder_dialog)
    """
    loop = asyncio.get_event_loop()
    path = await loop.run_in_executor(_tk_executor, _open_folder_dialog)
    return {"path": path}


# -----------------------------------------------
# 현재 볼트 스캔 — 인덱스에 없는 page 폴더를 찾아 _index.nct에 병합
# "탐색기에서 폴더를 볼트에 붙여 넣었을 때" 사용
# Python으로 치면: def scan_and_merge(): new = scan(); index.update(new); save()
# -----------------------------------------------
@router.post("/settings/scan-vault")
def scan_current_vault():
    """
    현재 볼트를 스캔해 _index.nct에 없는 페이지를 자동으로 추가
    - content.nct / content.json 있는 폴더를 탐색
    - 기존 인덱스와 병합 (기존 데이터 보존)
    """
    vault = get_vault_dir()
    _log.info("scan_current_vault: %s", vault)

    # 기존 인덱스 로드 (없으면 빈 구조)
    existing = load_index()

    # 볼트 스캔
    scanned = scan_vault_for_pages(vault)

    # 병합: 스캔에서 발견된 페이지 중 기존 인덱스에 없는 것만 추가
    added = 0
    for page_id in scanned["pageOrder"]:
        if page_id not in existing["pageOrder"]:
            existing["pageOrder"].append(page_id)
            existing["folderMap"][page_id] = scanned["folderMap"][page_id]
            # 카테고리 정보가 있으면 함께 병합
            if page_id in scanned["categoryMap"]:
                existing["categoryMap"][page_id] = scanned["categoryMap"][page_id]
            added += 1

    # 스캔에서 발견된 카테고리 중 기존에 없는 것 추가
    existing_cat_ids = {c["id"] for c in existing["categories"]}
    for cat in scanned["categories"]:
        if cat["id"] not in existing_cat_ids:
            existing["categories"].append(cat)
            existing["categoryOrder"].append(cat["id"])
            # 하위 카테고리이면 부모의 categoryChildOrder에도 추가
            parent_id = cat.get("parentId")
            if parent_id:
                child_order = existing.setdefault("categoryChildOrder", {}).setdefault(parent_id, [])
                if cat["id"] not in child_order:
                    child_order.append(cat["id"])

    if added > 0:
        save_index(existing)
        _log.info("scan_current_vault: %d개 페이지 추가됨", added)

    return {
        "ok":    True,
        "added": added,
        "total": len(existing["pageOrder"]),
    }


# -----------------------------------------------
# 디버그 로그 반환
# -----------------------------------------------
@router.get("/debug/logs")
def get_debug_logs():
    """
    메모리에 보관 중인 최근 로그 반환 (최대 100개)
    PyInstaller 번들(프로덕션) 모드에서는 비활성화 — 내부 경로 노출 방지
    Python으로 치면: if frozen: raise 403; else: return logs
    """
    if getattr(sys, 'frozen', False):
        raise HTTPException(status_code=403, detail="디버그 로그는 개발 모드에서만 사용할 수 있습니다")
    return {"logs": list(mem_handler.records)}
