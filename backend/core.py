# ==============================================
# backend/core.py
# 역할: 공유 상수, 보안 검증, 헬퍼 함수, Pydantic 모델
# Python으로 치면: utils.py / models.py 합본
# ==============================================

import json
import logging
import os
import re
import shutil
import sys
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict


# ── 앱 기본 디렉토리 결정 ────────────────────────────
# PyInstaller로 번들된 경우와 개발 모드를 구분
# Python으로 치면:
#   if frozen: _APP_BASE = AppData/NotionClone  else: _APP_BASE = project_root
if getattr(sys, 'frozen', False):
    # PyInstaller 번들 모드: %APPDATA%\NotionClone\ 사용
    _appdata = os.environ.get('APPDATA') or str(Path.home())
    _APP_BASE = Path(_appdata) / 'NotionClone'
    _APP_BASE.mkdir(parents=True, exist_ok=True)
else:
    # 개발 모드: 프로젝트 루트 (backend/ 의 상위)
    _APP_BASE = Path(__file__).parent.parent


# ── vault 설정 파일 ─────────────────────────────────
# Python으로 치면: CONFIG_FILE = _APP_BASE / 'vault_config.json'
CONFIG_FILE = _APP_BASE / "vault_config.json"

# ── 파일 확장자 ─────────────────────────────────────
# .nct (Notion Clone Template) — 내부 포맷은 UTF-8 JSON과 동일, 확장자만 다름
CONTENT_EXT = ".nct"

# ── 이미지/비디오/파일 업로드 제한 ──────────────────
ALLOWED_IMAGE_EXTS = frozenset({'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'})
MAX_IMAGE_SIZE = 10 * 1024 * 1024          # 10MB
ALLOWED_VIDEO_EXTS = frozenset({'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'})
MAX_VIDEO_SIZE = 500 * 1024 * 1024         # 500MB
ALLOWED_FILE_EXTS = frozenset({
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.md', '.csv', '.json', '.zip', '.rar', '.7z',
})
MAX_FILE_SIZE = 100 * 1024 * 1024          # 100MB

# ── UUID 형식 검증 정규식 ──────────────────────────
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


# -----------------------------------------------
# 멀티 볼트: 전역 가변 상태 (mutable container 패턴)
# global 키워드 대신 dict를 사용 — 모듈 임포트 후에도 참조가 동일 객체를 유지
# Python으로 치면:
#   _vault_state = {'dir': Path(...), 'root': Path(...)}
#   def get_vault_dir(): return _vault_state['dir']
# -----------------------------------------------

_vault_state: dict = {
    "dir":  None,   # 현재 활성 볼트 경로 (Path)
    "root": None,   # 모든 볼트의 루트 폴더 (Path)
}

_log = logging.getLogger(__name__)


def get_vault_dir() -> Path:
    """
    현재 활성 볼트 경로 반환 — 모든 라우터가 VAULT_DIR 대신 이 함수 호출
    Python으로 치면: def get_vault(): return _vault_state['dir']
    """
    return _vault_state["dir"]


def get_vaults_root() -> Path:
    """볼트 루트 폴더 반환"""
    return _vault_state["root"]


def set_vault_dir(new_path: Path) -> None:
    """
    런타임에 활성 볼트 교체 + vault_config.json 즉시 저장
    _vault_trash 폴더도 함께 생성 (볼트 전환 시 자동 준비)
    Python으로 치면: _vault_state['dir'] = new_path; mkdir(_vault_trash); save_config()
    """
    _vault_state["dir"] = new_path
    new_path.mkdir(parents=True, exist_ok=True)
    # _vault_trash 폴더 즉시 생성 — 삭제 전에도 폴더가 존재하도록 보장
    (new_path / "_vault_trash").mkdir(exist_ok=True)
    _persist_vault_config()
    _log.info("볼트 전환: %s", new_path)


def set_vaults_root(new_root: Path) -> None:
    """볼트 루트 폴더 변경"""
    _vault_state["root"] = new_root
    _persist_vault_config()


def _persist_vault_config() -> None:
    """
    현재 _current_vault_dir / _vaults_root 상태를 vault_config.json에 저장
    Python으로 치면: json.dump(config, open('vault_config.json', 'w'))
    """
    existing: dict = {}
    if CONFIG_FILE.exists():
        try:
            existing = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    existing["vaults_root"] = str(_vault_state["root"])
    existing["current_vault"] = _vault_state["dir"].name
    # recent_vaults 업데이트: 현재 볼트를 맨 앞으로, 중복 제거, 최대 10개
    recent: list = existing.get("recent_vaults", [])
    current_name = _vault_state["dir"].name
    recent = [r for r in recent if r != current_name]
    recent.insert(0, current_name)
    existing["recent_vaults"] = recent[:10]

    # 원자적 쓰기: 저장 중 크래시가 나도 vault_config.json 손상 방지
    _atomic_write(
        CONFIG_FILE,
        json.dumps(existing, ensure_ascii=False, indent=2),
    )


def _init_vault_config() -> tuple[Path, Path]:
    """
    앱 시작 시 vault_config.json 읽어서 (vaults_root, current_vault_path) 반환
    구버전(vault_path 단일 경로) → 신버전(vaults_root + current_vault)으로 자동 마이그레이션
    Python으로 치면:
        vaults_root, current = load_config()
        return vaults_root, vaults_root / current
    """
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

            # ── 신버전: vaults_root + current_vault ──
            if "vaults_root" in data and "current_vault" in data:
                vaults_root = Path(data["vaults_root"])
                vault_name = data["current_vault"].strip() or "기본"
                vault_path = vaults_root / vault_name
                vault_path.mkdir(parents=True, exist_ok=True)
                return vaults_root, vault_path

            # ── 구버전: vault_path 단일 경로 → 자동 마이그레이션 ──
            # Python으로 치면: old_path = data['vault_path']; migrate()
            old_path_str = data.get("vault_path", "").strip()
            if old_path_str:
                old_path = Path(old_path_str)
                if old_path.is_absolute():
                    old_path.mkdir(parents=True, exist_ok=True)
                    vaults_root = old_path.parent
                    vault_name = old_path.name
                    # 새 포맷으로 저장 (기존 키 보존 + 신규 키 추가)
                    data["vaults_root"] = str(vaults_root)
                    data["current_vault"] = vault_name
                    data["recent_vaults"] = [vault_name]
                    data.pop("vault_path", None)
                    data.pop("recent_vaults_paths", None)
                    CONFIG_FILE.write_text(
                        json.dumps(data, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    return vaults_root, old_path
        except Exception:
            pass

    # ── 기본값: _APP_BASE / vault / 기본 ──
    vaults_root = _APP_BASE / "vault"
    vault_path = vaults_root / "기본"
    vault_path.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(
        json.dumps({
            "vaults_root": str(vaults_root),
            "current_vault": "기본",
            "recent_vaults": ["기본"],
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return vaults_root, vault_path


# ── 앱 시작 시 vault 초기화 ──────────────────────────
# Python으로 치면: _vault_state['root'], _vault_state['dir'] = init_config()
_init_root, _init_dir = _init_vault_config()
_vault_state["root"] = _init_root
_vault_state["dir"]  = _init_dir
_init_dir.mkdir(exist_ok=True)


def list_vaults() -> list[dict]:
    """
    vaults_root 하위 폴더를 스캔해 볼트 목록 반환
    _index.nct 있으면 initialized=True + 페이지 수 포함
    Python으로 치면: [{'name': d.name, ...} for d in vaults_root.iterdir() if d.is_dir()]
    """
    result = []
    try:
        for entry in sorted(_vault_state["root"].iterdir()):
            if not entry.is_dir():
                continue
            index_file = entry / "_index.nct"
            initialized = index_file.exists()
            page_count = 0
            if initialized:
                try:
                    idx = json.loads(index_file.read_text(encoding="utf-8"))
                    page_count = len(idx.get("pageOrder", []))
                except Exception:
                    pass
            result.append({
                "name": entry.name,
                "path": str(entry),
                "initialized": initialized,
                "page_count": page_count,
                "is_current": entry.resolve() == _vault_state["dir"].resolve(),
            })
    except Exception:
        pass
    return result


# -----------------------------------------------
# 메모리 로그 핸들러 — 최근 100개 로그 항목 보관
# -----------------------------------------------
class MemoryLogHandler(logging.Handler):
    """마지막 100개 로그를 deque에 저장하는 핸들러"""

    def __init__(self, maxlen: int = 100):
        super().__init__()
        self.records: deque = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append({
            "level":   record.levelname,
            "time":    datetime.fromtimestamp(record.created).isoformat(),
            "logger":  record.name,
            "message": self.format(record),
        })


# 전역 메모리 핸들러 인스턴스 (system 라우터에서 읽음)
mem_handler = MemoryLogHandler(maxlen=100)
mem_handler.setFormatter(logging.Formatter("%(message)s"))


# -----------------------------------------------
# Pydantic 데이터 모델
# -----------------------------------------------

class BlockModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    type: str
    content: str
    createdAt: str
    updatedAt: str


class PageModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    title: str
    icon: str
    cover: Optional[str] = None
    coverPosition: Optional[int] = 50
    tags: Optional[list[str]] = []
    starred: Optional[bool] = False
    blocks: list[BlockModel]
    properties: Optional[list[dict]] = []
    createdAt: str
    updatedAt: str


class CreatePageBody(BaseModel):
    title: str = "새 페이지"
    icon: str = "📝"
    categoryId: Optional[str] = None


class CreateCategoryBody(BaseModel):
    name: str
    parentId: Optional[str] = None


class RenameCategoryBody(BaseModel):
    name: str


class MoveCategoryBody(BaseModel):
    categoryId: Optional[str] = None


class MoveFolderBody(BaseModel):
    parentId: Optional[str] = None


class UpdateCategoryColorBody(BaseModel):
    color: Optional[str] = None


class CategoryReorderBody(BaseModel):
    order: list[str]


class PageReorderBody(BaseModel):
    order: list[str]


class ImportBody(BaseModel):
    data: dict


class TrashRestoreBody(BaseModel):
    itemType: str  # 'page' | 'category'


class TrashPermanentDeleteBody(BaseModel):
    itemType: str  # 'page' | 'category'


# -----------------------------------------------
# 보안: ID 및 경로 검증
# -----------------------------------------------

def validate_uuid(value: str, label: str = "ID") -> None:
    """UUID 형식 검증 — 경로 트래버설 방지"""
    if not _UUID_RE.match(value):
        raise HTTPException(status_code=400, detail=f"잘못된 {label} 형식입니다")


def assert_inside_vault(path: Path) -> None:
    """
    경로가 현재 활성 vault 폴더 안에 있는지 확인 — 폴더 탈출 방지
    Python으로 치면: assert path.resolve().is_relative_to(get_vault_dir().resolve())
    """
    try:
        path.resolve().relative_to(get_vault_dir().resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다")


# -----------------------------------------------
# 폴더명 헬퍼
# -----------------------------------------------

def sanitize_title(title: str) -> str:
    """제목을 파일시스템 안전 문자열로 변환"""
    title = title.strip() or "새_페이지"
    title = re.sub(r'[\\/:*?"<>|]', '', title)
    title = re.sub(r'^\.+$', '새_페이지', title)
    title = re.sub(r'\s+', '_', title)
    title = re.sub(r'_+', '_', title)
    title = title.strip('_')
    return title[:30] or "새_페이지"


def sanitize_category_name(name: str) -> str:
    """카테고리 이름을 파일시스템 안전 문자열로 변환"""
    name = name.strip() or "새_폴더"
    name = re.sub(r'[\\/:*?"<>|]', '', name)
    name = re.sub(r'^\.+$', '새_폴더', name)
    name = re.sub(r'\s+', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    return name[:30] or "새_폴더"


def make_folder_name(title: str, created_at: str, page_id: str) -> str:
    """폴더명 생성: {제목}_{생성일시}_{UUID앞8자리}"""
    safe_title = sanitize_title(title)
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        date_str = dt.strftime("%Y%m%d-%H%M")
    except Exception:
        date_str = datetime.utcnow().strftime("%Y%m%d-%H%M")
    return f"{safe_title}_{date_str}_{page_id[:8]}"


# -----------------------------------------------
# 인덱스(_index.nct) 헬퍼 — get_vault_dir() 동적 참조
# -----------------------------------------------

def load_index() -> dict:
    """
    현재 활성 볼트의 _index.nct 로드
    (없으면 구버전 _index.json 폴백, 둘 다 없으면 기본값 반환)
    JSON 파싱 오류가 있어도 빈 구조 반환 (서버 500 방지)
    Python으로 치면: json.load(open(get_vault_dir() / '_index.nct'))
    """
    vault = get_vault_dir()
    _log.info("load_index: vault=%s", vault)
    index_file   = vault / "_index.nct"
    index_legacy = vault / "_index.json"

    src = index_file if index_file.exists() else (index_legacy if index_legacy.exists() else None)
    if src:
        try:
            data = json.loads(src.read_text(encoding="utf-8"))
        except Exception as e:
            _log.warning("_index 파싱 오류 (%s): %s — 빈 인덱스로 대체", src, e)
            data = {}
        data.setdefault("pageOrder", [])
        data.setdefault("currentPageId", None)
        data.setdefault("folderMap", {})
        data.setdefault("categories", [])
        data.setdefault("categoryMap", {})
        data.setdefault("categoryOrder", [])
        data.setdefault("categoryChildOrder", {})
        for cat in data.get("categories", []):
            cat.setdefault("parentId", None)
        return data
    return {
        "pageOrder": [],
        "currentPageId": None,
        "folderMap": {},
        "categories": [],
        "categoryMap": {},
        "categoryOrder": [],
        "categoryChildOrder": {},
    }


def auto_discover_new_folders(index: dict, vault_path: Path) -> bool:
    """
    GET /api/pages 호출 시마다 실행. 탐색기 폴더 구조 → 인덱스 동기화.
    핵심 원칙:
      - 이미 인덱싱된 카테고리도 내부를 항상 재스캔 (새 하위항목 감지)
      - 이미 인덱싱된 페이지 ID는 중복 추가하지 않음
    폴더 구조 최대 2단계 지원:
      볼트/카테고리/페이지/
      볼트/카테고리/하위카테고리/페이지/
    Python으로 치면: for every dir in vault: sync_with_index(dir)
    """
    import uuid as _uuid

    changed = False
    skip_dirs = {'_templates', '_history', '_trash'}

    # 이미 인덱싱된 page ID 집합 (중복 추가 방지용)
    known_page_ids: set = set(index.get("pageOrder", []))
    # folderName → category 객체 빠른 조회
    cat_by_folder: dict = {c["folderName"]: c for c in index.get("categories", [])}

    def ensure_cat(folder_name: str, parent_id=None) -> dict:
        """카테고리가 없으면 생성, 있으면 반환. Python으로 치면: dict.setdefault(key, new_obj())"""
        nonlocal changed
        if folder_name in cat_by_folder:
            return cat_by_folder[folder_name]
        cat_id = str(_uuid.uuid4())
        cat = {
            "id": cat_id,
            "name": folder_name,
            "folderName": folder_name,
            "color": None,
            "parentId": parent_id,
        }
        index.setdefault("categories", []).append(cat)
        index.setdefault("categoryOrder", []).append(cat_id)
        if parent_id:
            index.setdefault("categoryChildOrder", {}).setdefault(parent_id, []).append(cat_id)
        cat_by_folder[folder_name] = cat
        changed = True
        _log.info("auto_discover: 카테고리 추가 '%s' (parent=%s)", folder_name, parent_id)
        return cat

    def register_page(page_id: str, folder_name: str, cat_id=None) -> None:
        """
        페이지를 인덱스에 등록.
        이미 있는 경우: 하위 카테고리(더 구체적인 위치)가 주어지면 매핑 업데이트.
        Python으로 치면: index.setdefault(id, ...) but override if deeper path
        """
        nonlocal changed

        if page_id not in known_page_ids:
            # 신규 페이지 추가
            index.setdefault("folderMap", {})[page_id] = folder_name
            if cat_id:
                index.setdefault("categoryMap", {})[page_id] = cat_id
            index.setdefault("pageOrder", []).append(page_id)
            known_page_ids.add(page_id)
            changed = True
            _log.info("auto_discover: 페이지 추가 '%s'", folder_name)
            return

        # 이미 인덱스에 있음 — 하위 카테고리이면 매핑 갱신 (더 구체적인 위치 우선)
        if not cat_id:
            return
        current_cat_id = index.get("categoryMap", {}).get(page_id)
        if current_cat_id == cat_id:
            return
        # 새 카테고리가 하위 카테고리(parentId 있음)인지 확인
        new_cat = cat_by_folder.get(
            next((c["folderName"] for c in index.get("categories", []) if c["id"] == cat_id), ""),
            None,
        )
        if new_cat and new_cat.get("parentId"):
            index.setdefault("categoryMap", {})[page_id] = cat_id
            index.setdefault("folderMap", {})[page_id] = folder_name
            changed = True
            _log.info("auto_discover: 페이지 위치 갱신 '%s' → 하위카테고리", folder_name)

    try:
        for entry in sorted(vault_path.iterdir()):
            if not entry.is_dir():
                continue
            if entry.name.startswith('_') or entry.name.startswith('.') or entry.name in skip_dirs:
                continue

            # content.nct가 있으면 최상위 페이지 폴더
            content_file = entry / f"content{CONTENT_EXT}"
            if not content_file.exists():
                content_file = entry / "content.json"

            if content_file.exists():
                # 볼트/페이지/ 구조
                try:
                    page_data = json.loads(content_file.read_text(encoding="utf-8"))
                    page_id = page_data.get("id", "")
                    if _UUID_RE.match(page_id):
                        register_page(page_id, entry.name)
                except Exception as e:
                    _log.warning("auto_discover 최상위 페이지 오류 (%s): %s", entry, e)
            else:
                # 카테고리 폴더 — 이미 알려진 카테고리도 내부를 항상 재스캔
                for sub in sorted(entry.iterdir()):
                    if not sub.is_dir() or sub.name.startswith('_') or sub.name.startswith('.') or sub.name in skip_dirs:
                        continue

                    sub_content = sub / f"content{CONTENT_EXT}"
                    if not sub_content.exists():
                        sub_content = sub / "content.json"

                    if sub_content.exists():
                        # 볼트/카테고리/페이지/ 구조
                        try:
                            page_data = json.loads(sub_content.read_text(encoding="utf-8"))
                            page_id = page_data.get("id", "")
                            if _UUID_RE.match(page_id):
                                cat = ensure_cat(entry.name)
                                register_page(page_id, sub.name, cat["id"])
                        except Exception as e:
                            _log.warning("auto_discover 카테고리 페이지 오류 (%s): %s", sub, e)
                    else:
                        # 볼트/카테고리/하위카테고리/페이지/ 구조
                        for subsub in sorted(sub.iterdir()):
                            if not subsub.is_dir() or subsub.name.startswith('_') or subsub.name.startswith('.'):
                                continue
                            subsub_content = subsub / f"content{CONTENT_EXT}"
                            if not subsub_content.exists():
                                subsub_content = subsub / "content.json"
                            if not subsub_content.exists():
                                continue
                            try:
                                page_data = json.loads(subsub_content.read_text(encoding="utf-8"))
                                page_id = page_data.get("id", "")
                                if _UUID_RE.match(page_id):
                                    parent_cat = ensure_cat(entry.name)
                                    sub_cat = ensure_cat(sub.name, parent_cat["id"])
                                    register_page(page_id, subsub.name, sub_cat["id"])
                            except Exception as e:
                                _log.warning("auto_discover 하위카테고리 오류 (%s): %s", subsub, e)
    except Exception as e:
        _log.error("auto_discover 전체 오류: %s", e)

    return changed


def scan_vault_for_pages(vault_path: Path) -> dict:
    """
    _index.nct 없는 볼트 폴더를 스캔해 페이지 인덱스를 재구성
    - 최상위 폴더에 content.nct / content.json 있으면 → 일반 페이지
    - 최상위 폴더 하위 폴더에 content.nct 있으면 → 카테고리 내 페이지
    Python으로 치면:
        pages = [load_page(f) for f in vault.iterdir() if (f/'content.nct').exists()]
        return build_index(pages)
    """
    import uuid as _uuid

    index: dict = {
        "pageOrder": [],
        "currentPageId": None,
        "folderMap": {},
        "categories": [],
        "categoryMap": {},
        "categoryOrder": [],
        "categoryChildOrder": {},
    }

    # 스캔용 카테고리 조회/생성 — 루프 밖에서 한 번만 정의 (매 반복 재생성 방지)
    # Python으로 치면: def get_or_create_cat(name, parent=None): ...
    def _scan_get_or_create_cat(folder_name: str, parent_id=None):
        """스캔용 카테고리 조회/생성"""
        existing = next(
            (c for c in index["categories"] if c["folderName"] == folder_name),
            None,
        )
        if not existing:
            cat_id = str(_uuid.uuid4())
            existing = {
                "id": cat_id,
                "name": folder_name,
                "folderName": folder_name,
                "color": None,
                "parentId": parent_id,
            }
            index["categories"].append(existing)
            index["categoryOrder"].append(cat_id)
            if parent_id:
                index["categoryChildOrder"].setdefault(parent_id, []).append(cat_id)
        return existing

    try:
        for entry in sorted(vault_path.iterdir()):
            # 숨김 폴더·파일, 인덱스 파일 제외
            if not entry.is_dir() or entry.name.startswith('_') or entry.name.startswith('.'):
                continue

            # ── 최상위에 content.nct / content.json 있으면 일반 페이지 ──
            content_file = entry / f"content{CONTENT_EXT}"
            if not content_file.exists():
                content_file = entry / "content.json"

            if content_file.exists():
                try:
                    page_data = json.loads(content_file.read_text(encoding="utf-8"))
                    page_id = page_data.get("id", "")
                    if _UUID_RE.match(page_id):
                        index["folderMap"][page_id] = entry.name
                        if page_id not in index["pageOrder"]:
                            index["pageOrder"].append(page_id)
                except Exception as e:
                    _log.warning("스캔 오류 (최상위 %s): %s", entry, e)
                continue

            # ── content.nct 없으면 카테고리 폴더 가능성 → 하위 탐색 (최대 2단계) ──
            for sub in sorted(entry.iterdir()):
                if not sub.is_dir():
                    continue
                sub_content = sub / f"content{CONTENT_EXT}"
                if not sub_content.exists():
                    sub_content = sub / "content.json"

                if sub_content.exists():
                    # 직접 페이지 (볼트/카테고리/페이지/)
                    try:
                        page_data = json.loads(sub_content.read_text(encoding="utf-8"))
                        page_id = page_data.get("id", "")
                        if not _UUID_RE.match(page_id):
                            continue
                        cat = _scan_get_or_create_cat(entry.name)
                        index["folderMap"][page_id] = sub.name
                        index["categoryMap"][page_id] = cat["id"]
                        if page_id not in index["pageOrder"]:
                            index["pageOrder"].append(page_id)
                    except Exception as e:
                        _log.warning("스캔 오류 (카테고리 내 %s): %s", sub, e)
                else:
                    # 하위 카테고리 가능성 (볼트/카테고리/하위카테고리/페이지/)
                    for subsub in sorted(sub.iterdir()):
                        if not subsub.is_dir():
                            continue
                        subsub_content = subsub / f"content{CONTENT_EXT}"
                        if not subsub_content.exists():
                            subsub_content = subsub / "content.json"
                        if not subsub_content.exists():
                            continue
                        try:
                            page_data = json.loads(subsub_content.read_text(encoding="utf-8"))
                            page_id = page_data.get("id", "")
                            if not _UUID_RE.match(page_id):
                                continue
                            parent_cat = _scan_get_or_create_cat(entry.name)
                            sub_cat = _scan_get_or_create_cat(sub.name, parent_cat["id"])
                            index["folderMap"][page_id] = subsub.name
                            index["categoryMap"][page_id] = sub_cat["id"]
                            if page_id not in index["pageOrder"]:
                                index["pageOrder"].append(page_id)
                        except Exception as e:
                            _log.warning("스캔 오류 (하위카테고리 내 %s): %s", subsub, e)

    except Exception as e:
        _log.error("볼트 스캔 실패 (%s): %s", vault_path, e)

    _log.info("볼트 스캔 완료: %s개 페이지 발견 (%s)", len(index["pageOrder"]), vault_path)
    return index


def save_index(data: dict) -> None:
    """현재 활성 볼트의 _index.nct 저장 — 원자적 쓰기로 손상 방지"""
    vault = get_vault_dir()
    index_file = vault / "_index.nct"
    index_legacy = vault / "_index.json"

    data.setdefault("folderMap", {})
    data.setdefault("categories", [])
    data.setdefault("categoryMap", {})
    data.setdefault("categoryOrder", [])
    data.setdefault("categoryChildOrder", {})
    _atomic_write(index_file, json.dumps(data, ensure_ascii=False, indent=2))
    if index_legacy.exists():
        index_legacy.unlink()


# -----------------------------------------------
# _vault_trash 헬퍼 — 실물 파일 이동 기반 휴지통
# Python으로 치면: import trash_utils; trash_utils.get_dir(), trash_utils.load(), ...
# -----------------------------------------------

def get_trash_dir() -> Path:
    """
    _vault_trash 폴더 경로 반환. 없으면 자동 생성
    Python으로 치면: os.makedirs(path, exist_ok=True); return Path(path)
    """
    d = get_vault_dir() / "_vault_trash"
    d.mkdir(exist_ok=True)
    return d


def load_trash_index() -> list:
    """
    _vault_trash/index.json 로드. 없거나 파싱 오류 시 빈 리스트 반환
    Python으로 치면: json.load(open(...)) or []
    """
    f = get_trash_dir() / "index.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            _log.warning("trash index.json 파싱 오류: %s — 빈 리스트로 대체", e)
    return []


def save_trash_index(entries: list) -> None:
    """
    _vault_trash/index.json 원자적 저장
    Python으로 치면: json.dump(entries, open(..., 'w'), ensure_ascii=False)
    """
    f = get_trash_dir() / "index.json"
    _atomic_write(f, json.dumps(entries, ensure_ascii=False, indent=2))


def resolve_trash_name(base_name: str, target_dir: Path) -> str:
    """
    target_dir 안에서 충돌 없는 이름 반환
    my-folder → my-folder_1 → my-folder_2 → ...
    Python으로 치면: while (target/name).exists(): name += f'_{counter}'
    """
    name = base_name
    counter = 1
    while (target_dir / name).exists():
        name = f"{base_name}_{counter}"
        counter += 1
    return name


# -----------------------------------------------
# 페이지/카테고리 경로 헬퍼
# -----------------------------------------------

def get_folder_name(page_id: str, index: dict) -> str:
    """page_id → 페이지 폴더명 조회"""
    folder_name = index.get("folderMap", {}).get(page_id)
    if folder_name:
        return folder_name
    # 구 포맷 호환: vault/{uuid}/ 폴더가 있으면 그대로 사용
    if (get_vault_dir() / page_id).exists():
        return page_id
    return page_id


def get_category_folder_name(cat_id: Optional[str], index: dict) -> Optional[str]:
    """카테고리 ID → 카테고리 폴더명 조회"""
    if not cat_id:
        return None
    for cat in index.get("categories", []):
        if cat["id"] == cat_id:
            return cat["folderName"]
    return None


def get_page_dir(page_id: str, index: dict) -> Path:
    """
    카테고리 계층을 고려한 페이지 폴더 전체 경로 반환
    하위 카테고리 지원: vault/{부모카테고리}/{하위카테고리}/{pageFolder}/
    최상위 페이지:      vault/{pageFolder}/
    Python으로 치면: os.path.join(vault, *cat_chain, page_folder)
    """
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)

    if not cat_id:
        return get_vault_dir() / page_folder

    # 카테고리 ID → 객체 빠른 조회
    cat_by_id = {c["id"]: c for c in index.get("categories", [])}

    # 현재 카테고리부터 루트까지 부모 체인을 역순으로 쌓기
    # Python으로 치면: while cat: chain.append(cat); cat = cat.parent
    chain: list[str] = []
    visited: set = set()
    cur_id = cat_id
    while cur_id and cur_id not in visited:
        visited.add(cur_id)
        cat = cat_by_id.get(cur_id)
        if not cat:
            break
        chain.append(cat["folderName"])
        cur_id = cat.get("parentId")

    # chain이 [하위카테고리, 상위카테고리] 순이므로 뒤집어서 경로 조합
    chain.reverse()
    return get_vault_dir().joinpath(*chain, page_folder)


def get_cat_dir(cat_id: str, index: dict) -> Path:
    """
    카테고리 폴더의 vault 내 전체 경로 반환 (부모 체인 포함)
    하위 카테고리 지원: vault/{부모}/{하위카테고리}/
    Python으로 치면: os.path.join(vault, *parent_chain, cat_folder)
    """
    cat_by_id = {c["id"]: c for c in index.get("categories", [])}
    cat = cat_by_id.get(cat_id)
    if not cat:
        return get_vault_dir()

    chain: list[str] = []
    visited: set = set()
    cur = cat
    while cur and cur["id"] not in visited:
        visited.add(cur["id"])
        chain.append(cur["folderName"])
        parent_id = cur.get("parentId")
        cur = cat_by_id.get(parent_id) if parent_id else None

    chain.reverse()
    return get_vault_dir().joinpath(*chain)


def get_image_url_prefix(page_folder: str, cat_folder: Optional[str]) -> str:
    """이미지 URL 접두사 계산 — 127.0.0.1 사용 (Windows에서 localhost → ::1 IPv6 해석 문제 방지)"""
    if cat_folder:
        return f"http://127.0.0.1:8000/static/{cat_folder}/{page_folder}/"
    return f"http://127.0.0.1:8000/static/{page_folder}/"


# -----------------------------------------------
# URL 교체 헬퍼
# -----------------------------------------------

def replace_image_urls_in_page(page_data: dict, old_prefix: str, new_prefix: str) -> None:
    """page_data 내 모든 블록과 커버의 이미지 URL을 일괄 교체 (in-place)"""
    for block in page_data.get("blocks", []):
        if block.get("content"):
            block["content"] = block["content"].replace(old_prefix, new_prefix)
    if page_data.get("cover"):
        page_data["cover"] = page_data["cover"].replace(old_prefix, new_prefix)


# -----------------------------------------------
# 페이지 파일 헬퍼
# -----------------------------------------------

def resolve_content_file(page_dir: Path) -> Path:
    """.nct 파일 우선, 없으면 구버전 .json 폴백"""
    nct = page_dir / f"content{CONTENT_EXT}"
    if nct.exists():
        return nct
    json_path = page_dir / "content.json"
    if json_path.exists():
        return json_path
    return nct


def _migrate_localhost_urls(page_data: dict) -> bool:
    """
    기존에 localhost:8000으로 저장된 이미지/비디오 URL을 127.0.0.1:8000으로 자동 교정
    변경이 있으면 True 반환 (디스크 재저장 필요)
    Python으로 치면: changed = any('localhost' in b.get('content','') for b in page['blocks'])
    """
    changed = False
    for block in page_data.get("blocks", []):
        content = block.get("content", "")
        if isinstance(content, str) and "localhost:8000" in content:
            block["content"] = content.replace(
                "http://localhost:8000/", "http://127.0.0.1:8000/"
            )
            changed = True
    return changed


def load_page(page_id: str, index: dict) -> Optional[dict]:
    """vault/{경로}/content.nct 로드 + localhost URL 자동 마이그레이션"""
    page_dir = get_page_dir(page_id, index)
    content_file = resolve_content_file(page_dir)
    if not content_file.exists():
        return None
    page_data = json.loads(content_file.read_text(encoding="utf-8"))
    # 구버전 localhost:8000 URL → 127.0.0.1:8000 자동 교정 (1회성 마이그레이션)
    if _migrate_localhost_urls(page_data):
        save_page_to_disk(page_data, page_dir)
    return page_data


def _atomic_write(target: Path, text: str) -> None:
    """
    원자적 쓰기: .tmp에 먼저 쓴 뒤 rename으로 교체
    쓰기 중 크래시가 나도 기존 파일은 손상되지 않음
    Python으로 치면: write(tmp); os.replace(tmp, target)
    """
    tmp = target.with_suffix(".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(target)  # NTFS 레벨 원자적 교체
    except Exception:
        # rename 실패 시 .tmp 정리 후 예외 전파
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


def save_page_to_disk(page_data: dict, page_dir: Path) -> None:
    """vault/{경로}/content.nct 저장 — 원자적 쓰기로 손상 방지"""
    page_dir.mkdir(parents=True, exist_ok=True)
    nct_path = page_dir / f"content{CONTENT_EXT}"
    _atomic_write(nct_path, json.dumps(page_data, ensure_ascii=False, indent=2))
    json_path = page_dir / "content.json"
    if json_path.exists():
        json_path.unlink()


def now_iso() -> str:
    """현재 시각을 UTC ISO 8601 문자열로 반환"""
    now = datetime.utcnow()
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"