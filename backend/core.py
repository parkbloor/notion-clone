# ==============================================
# backend/core.py
# 역할: 공유 상수, 보안 검증, 헬퍼 함수, Pydantic 모델
# Python으로 치면: utils.py / models.py 합본
# ==============================================

import json
import logging
import re
import shutil
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel


# ── vault 설정 파일 (사용자 지정 경로 저장) ─────────
# Python으로 치면: CONFIG_FILE = BASE_DIR / 'vault_config.json'
CONFIG_FILE = Path(__file__).parent / "vault_config.json"


def _load_vault_dir() -> Path:
    """
    vault_config.json에서 사용자 지정 경로를 읽어 VAULT_DIR 결정
    설정 파일 없거나 경로 이상하면 기본값(프로젝트 루트/vault) 반환
    Python으로 치면: def _get_vault_dir(): return json.load('config.json')['vault_path'] or DEFAULT
    """
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            custom = data.get("vault_path", "").strip()
            if custom:
                p = Path(custom)
                if p.is_absolute():
                    p.mkdir(parents=True, exist_ok=True)
                    return p
        except Exception:
            pass
    return Path(__file__).parent.parent / "vault"


# ── vault 디렉토리 설정 ────────────────────────
# Python으로 치면: VAULT_DIR = _get_vault_dir()
VAULT_DIR = _load_vault_dir()
VAULT_DIR.mkdir(exist_ok=True)

# 페이지 순서·카테고리를 기록하는 인덱스 파일
INDEX_FILE = VAULT_DIR / "_index.json"

# ── 이미지 업로드 제한 ──────────────────────────
# 허용 이미지 확장자 (소문자만)
# Python으로 치면: ALLOWED = frozenset({'.jpg', ...})
ALLOWED_IMAGE_EXTS = frozenset({'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'})

# 최대 파일 크기: 10MB
# Python으로 치면: MAX_SIZE = 10 * 1024 * 1024
MAX_IMAGE_SIZE = 10 * 1024 * 1024

# ── 비디오 업로드 제한 ──────────────────────────
# 허용 비디오 확장자 (소문자만)
# Python으로 치면: ALLOWED_VIDEO = frozenset({'.mp4', ...})
ALLOWED_VIDEO_EXTS = frozenset({'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'})

# 최대 비디오 파일 크기: 500MB
# Python으로 치면: MAX_VIDEO_SIZE = 500 * 1024 * 1024
MAX_VIDEO_SIZE = 500 * 1024 * 1024

# ── UUID 형식 검증 정규식 ──────────────────────
# Python으로 치면: re.compile(r'^[a-f0-9]{8}-...$')
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


# -----------------------------------------------
# 메모리 로그 핸들러 — 최근 100개 로그 항목 보관
# Python으로 치면: class MemoryLogHandler(logging.Handler): ...
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
# Pydantic 데이터 모델 (타입 검증 + 직렬화)
# Python으로 치면: @dataclass 또는 TypedDict
# -----------------------------------------------

class BlockModel(BaseModel):
    """블록 하나의 구조"""
    id: str
    type: str
    content: str
    createdAt: str
    updatedAt: str


class PageModel(BaseModel):
    """페이지 전체 구조 (메타 + 블록 목록)"""
    id: str
    title: str
    icon: str
    cover: Optional[str] = None
    # 커버 이미지 Y 위치 (0~100, 기본 50 = 가운데)
    coverPosition: Optional[int] = 50
    # 태그 목록
    tags: Optional[list[str]] = []
    # 즐겨찾기 여부
    starred: Optional[bool] = False
    blocks: list[BlockModel]
    createdAt: str
    updatedAt: str


class CreatePageBody(BaseModel):
    """새 페이지 생성 요청 바디"""
    title: str = "새 페이지"
    icon: str = "📝"
    # 페이지를 생성할 카테고리 ID (None이면 미분류)
    categoryId: Optional[str] = None


class CreateCategoryBody(BaseModel):
    """새 카테고리 생성 요청 바디"""
    name: str


class RenameCategoryBody(BaseModel):
    """카테고리 이름 변경 요청 바디"""
    name: str


class MoveCategoryBody(BaseModel):
    """페이지 카테고리 이동 요청 바디"""
    # None이면 미분류로 이동
    categoryId: Optional[str] = None


class CategoryReorderBody(BaseModel):
    """카테고리 순서 변경 요청 바디"""
    order: list[str]  # category ID 목록 (새 순서)


class PageReorderBody(BaseModel):
    """페이지 순서 변경 요청 바디"""
    order: list[str]  # page ID 목록 (새 순서)


class ImportBody(BaseModel):
    """JSON 백업 가져오기 요청 바디"""
    data: dict


# -----------------------------------------------
# 보안: ID 및 경로 검증
# -----------------------------------------------

def validate_uuid(value: str, label: str = "ID") -> None:
    """
    UUID 형식 검증 — 경로 트래버설 방지
    page_id / cat_id가 '../../../etc' 같은 값이면 즉시 400 반환

    Python으로 치면:
        if not re.match(UUID_PATTERN, value): raise ValueError(f"invalid {label}")
    """
    if not _UUID_RE.match(value):
        raise HTTPException(status_code=400, detail=f"잘못된 {label} 형식입니다")


def assert_inside_vault(path: Path) -> None:
    """
    경로가 vault 폴더 안에 있는지 확인 — 폴더 탈출 방지
    resolve()로 심볼릭 링크·'..'을 모두 펼친 뒤 비교

    Python으로 치면:
        assert path.resolve().is_relative_to(VAULT_DIR.resolve())
    """
    try:
        path.resolve().relative_to(VAULT_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="잘못된 파일 경로입니다")


# -----------------------------------------------
# 폴더명 헬퍼
# -----------------------------------------------

def sanitize_title(title: str) -> str:
    """
    제목을 파일시스템 안전 문자열로 변환
    Windows 금지 문자 제거, '..' 패턴 차단, 공백 → _, 최대 30자
    Python으로 치면: re.sub(r'[bad_chars]', '', title).replace(' ', '_')
    """
    title = title.strip() or "새_페이지"
    # Windows 금지 문자 제거
    title = re.sub(r'[\\/:*?"<>|]', '', title)
    # '.' 또는 '..' 만으로 이루어진 경로 이동 패턴 차단
    title = re.sub(r'^\.+$', '새_페이지', title)
    title = re.sub(r'\s+', '_', title)
    title = re.sub(r'_+', '_', title)
    title = title.strip('_')
    return title[:30] or "새_페이지"


def sanitize_category_name(name: str) -> str:
    """
    카테고리 이름을 파일시스템 안전 문자열로 변환 (최대 30자)
    Python으로 치면: re.sub(r'[bad_chars]', '', name)
    """
    name = name.strip() or "새_폴더"
    name = re.sub(r'[\\/:*?"<>|]', '', name)
    name = re.sub(r'^\.+$', '새_폴더', name)
    name = re.sub(r'\s+', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    return name[:30] or "새_폴더"


def make_folder_name(title: str, created_at: str, page_id: str) -> str:
    """
    폴더명 생성: {제목}_{생성일시}_{UUID앞8자리}
    Python으로 치면: f"{safe_title}_{date_str}_{page_id[:8]}"
    """
    safe_title = sanitize_title(title)
    try:
        dt = datetime.fromisoformat(created_at)
        date_str = dt.strftime("%Y%m%d-%H%M")
    except Exception:
        date_str = datetime.now().strftime("%Y%m%d-%H%M")
    return f"{safe_title}_{date_str}_{page_id[:8]}"


# -----------------------------------------------
# 인덱스(_index.json) 헬퍼
# -----------------------------------------------

def load_index() -> dict:
    """
    _index.json 로드 (없으면 기본값 반환)
    Python으로 치면: json.load(open('_index.json')) with 기본값
    """
    if INDEX_FILE.exists():
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        # 기존 버전 호환 — 없는 필드에 기본값 추가
        data.setdefault("folderMap", {})
        data.setdefault("categories", [])
        data.setdefault("categoryMap", {})
        data.setdefault("categoryOrder", [])
        return data
    return {
        "pageOrder": [],
        "currentPageId": None,
        "folderMap": {},
        "categories": [],
        "categoryMap": {},
        "categoryOrder": [],
    }


def save_index(data: dict) -> None:
    """_index.json 저장"""
    data.setdefault("folderMap", {})
    data.setdefault("categories", [])
    data.setdefault("categoryMap", {})
    data.setdefault("categoryOrder", [])
    INDEX_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# -----------------------------------------------
# 페이지/카테고리 경로 헬퍼
# -----------------------------------------------

def get_folder_name(page_id: str, index: dict) -> str:
    """
    page_id → 페이지 폴더명 조회
    Python으로 치면: index['folderMap'].get(page_id, page_id)
    """
    folder_name = index.get("folderMap", {}).get(page_id)
    if folder_name:
        return folder_name
    # 구 포맷 호환: vault/{uuid}/ 폴더가 있으면 그대로 사용
    if (VAULT_DIR / page_id).exists():
        return page_id
    return page_id


def get_category_folder_name(cat_id: Optional[str], index: dict) -> Optional[str]:
    """
    카테고리 ID → 카테고리 폴더명 조회
    Python으로 치면: next((c['folderName'] for c in cats if c['id'] == cat_id), None)
    """
    if not cat_id:
        return None
    for cat in index.get("categories", []):
        if cat["id"] == cat_id:
            return cat["folderName"]
    return None


def get_page_dir(page_id: str, index: dict) -> Path:
    """
    카테고리를 고려한 페이지 폴더 전체 경로 반환
    카테고리 있으면: vault/{catFolder}/{pageFolder}/
    없으면: vault/{pageFolder}/
    Python으로 치면: base / cat_folder / page_folder if cat else base / page_folder
    """
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)
    if cat_folder:
        return VAULT_DIR / cat_folder / page_folder
    return VAULT_DIR / page_folder


def get_image_url_prefix(page_folder: str, cat_folder: Optional[str]) -> str:
    """
    이미지 URL 접두사 계산 (카테고리 포함)
    Python으로 치면: f"http://.../{cat}/{page}/" if cat else f"http://.../{page}/"
    """
    if cat_folder:
        return f"http://localhost:8000/static/{cat_folder}/{page_folder}/"
    return f"http://localhost:8000/static/{page_folder}/"


# -----------------------------------------------
# URL 교체 헬퍼
# -----------------------------------------------

def replace_image_urls_in_page(page_data: dict, old_prefix: str, new_prefix: str) -> None:
    """
    page_data 내 모든 블록과 커버의 이미지 URL을 일괄 교체 (in-place)
    Python으로 치면: for b in blocks: b['content'] = b['content'].replace(old, new)
    """
    for block in page_data.get("blocks", []):
        if block.get("content"):
            block["content"] = block["content"].replace(old_prefix, new_prefix)
    if page_data.get("cover"):
        page_data["cover"] = page_data["cover"].replace(old_prefix, new_prefix)


# -----------------------------------------------
# 페이지 파일 헬퍼
# -----------------------------------------------

def load_page(page_id: str, index: dict) -> Optional[dict]:
    """
    vault/{경로}/content.json 로드
    Python으로 치면: json.load(open(f'{path}/content.json'))
    """
    content_file = get_page_dir(page_id, index) / "content.json"
    if not content_file.exists():
        return None
    return json.loads(content_file.read_text(encoding="utf-8"))


def save_page_to_disk(page_data: dict, page_dir: Path) -> None:
    """
    vault/{경로}/content.json 저장
    Python으로 치면: json.dump(page, open(path, 'w'))
    """
    page_dir.mkdir(parents=True, exist_ok=True)
    (page_dir / "content.json").write_text(
        json.dumps(page_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def now_iso() -> str:
    """현재 시각을 ISO 8601 문자열로 반환"""
    return datetime.now().isoformat()
