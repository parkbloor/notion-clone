# ==============================================
# backend/main.py
# 역할: FastAPI 백엔드 — 페이지/카테고리 데이터를 vault/ 폴더에 저장
# Python으로 치면: flask run 같은 웹 서버인데 더 빠르고 타입이 있음
#
# vault/ 폴더 구조:
#   vault/_index.json           ← 메타데이터 (순서, 카테고리 등)
#   vault/{pageFolder}/         ← 카테고리 없는 페이지
#   vault/{catFolder}/{pageFolder}/  ← 카테고리 있는 페이지
# ==============================================

import io
import json
import logging
import re
import uuid
import shutil
import zipfile
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


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

# 전역 메모리 핸들러 인스턴스
_mem_handler = MemoryLogHandler(maxlen=100)
_mem_handler.setFormatter(logging.Formatter("%(message)s"))

# 루트 로거에 핸들러 등록
logging.getLogger().addHandler(_mem_handler)
logging.getLogger("uvicorn.access").addHandler(_mem_handler)
logging.getLogger("uvicorn.error").addHandler(_mem_handler)

# ── FastAPI 앱 생성 ────────────────────────────
# Python으로 치면: app = Flask(__name__)
app = FastAPI(title="노션 클론 백엔드", version="2.0.0")

# ── CORS 설정 ──────────────────────────────────
# Next.js 개발 서버(localhost:3000)의 요청을 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── vault 디렉토리 설정 ────────────────────────
# 실제 파일이 저장되는 루트 폴더 (프로젝트 루트/vault)
VAULT_DIR = Path(__file__).parent.parent / "vault"
VAULT_DIR.mkdir(exist_ok=True)

# 페이지 순서·현재 페이지·폴더 매핑·카테고리를 기록하는 인덱스 파일
INDEX_FILE = VAULT_DIR / "_index.json"

# ── 정적 파일 서빙 ─────────────────────────────
# vault 폴더 안의 이미지를 /static/... 경로로 제공
app.mount("/static", StaticFiles(directory=str(VAULT_DIR)), name="static")


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
    # Python으로 치면: cover_position: Optional[int] = 50
    coverPosition: Optional[int] = 50
    # 태그 목록 — 새로고침 후에도 유지되도록 content.json에 저장
    # Python으로 치면: tags: list[str] = field(default_factory=list)
    tags: Optional[list[str]] = []
    # 즐겨찾기 여부 — True이면 목록 상단에 고정
    # Python으로 치면: starred: bool = False
    starred: Optional[bool] = False
    blocks: list[BlockModel]
    createdAt: str
    updatedAt: str


class CreatePageBody(BaseModel):
    """새 페이지 생성 요청 바디"""
    title: str = "새 페이지"
    icon: str = "📝"
    # 페이지를 생성할 카테고리 ID (None이면 미분류)
    # Python으로 치면: category_id: Optional[str] = None
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
    # Python으로 치면: category_id: Optional[str] = None
    categoryId: Optional[str] = None


class CategoryReorderBody(BaseModel):
    """카테고리 순서 변경 요청 바디"""
    order: list[str]  # category ID 목록 (새 순서)


class PageReorderBody(BaseModel):
    """페이지 순서 변경 요청 바디"""
    order: list[str]  # page ID 목록 (새 순서)


# -----------------------------------------------
# 폴더명 헬퍼
# -----------------------------------------------

def sanitize_title(title: str) -> str:
    """
    제목을 파일시스템 안전 문자열로 변환
    Windows 금지 문자 제거, 공백 → _, 최대 30자
    Python으로 치면: re.sub(r'[bad_chars]', '', title).replace(' ', '_')
    """
    title = title.strip() or "새_페이지"
    title = re.sub(r'[\\/:*?"<>|]', '', title)
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
        encoding="utf-8"
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
        encoding="utf-8"
    )


def now_iso() -> str:
    """현재 시각을 ISO 8601 문자열로 반환"""
    return datetime.now().isoformat()


# -----------------------------------------------
# API 엔드포인트 — 페이지
# Python으로 치면: @app.route(...)
# -----------------------------------------------

@app.get("/api/pages")
def get_pages():
    """
    모든 페이지를 순서대로 반환 + 카테고리 정보 포함
    Python으로 치면: return [load_page(p) for p in index['pageOrder']]
    """
    index = load_index()
    pages = []
    for page_id in index.get("pageOrder", []):
        page = load_page(page_id, index)
        if page:
            pages.append(page)
    return {
        "pages": pages,
        "currentPageId": index.get("currentPageId"),
        "categories": index.get("categories", []),
        "categoryMap": index.get("categoryMap", {}),
        "categoryOrder": index.get("categoryOrder", []),
    }


@app.get("/api/pages/{page_id}")
def get_page(page_id: str):
    """특정 페이지 반환"""
    index = load_index()
    page = load_page(page_id, index)
    if not page:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다")
    return page


@app.post("/api/pages", status_code=201)
def create_page(body: CreatePageBody):
    """
    새 페이지 생성 → 카테고리가 지정되면 해당 카테고리 폴더 아래에 저장
    Python으로 치면: pages.append(Page(title, icon)); save_index()
    """
    page_id = str(uuid.uuid4())
    block_id = str(uuid.uuid4())
    now = now_iso()
    folder_name = make_folder_name(body.title, now, page_id)

    page = {
        "id": page_id,
        "title": body.title,
        "icon": body.icon,
        "cover": None,
        "coverPosition": 50,
        # 새 페이지 기본값 — 태그 없음, 즐겨찾기 해제
        # Python으로 치면: tags=[], starred=False
        "tags": [],
        "starred": False,
        "blocks": [{
            "id": block_id,
            "type": "paragraph",
            "content": "",
            "createdAt": now,
            "updatedAt": now,
        }],
        "createdAt": now,
        "updatedAt": now,
    }

    index = load_index()

    # 카테고리 폴더 아래 또는 루트에 저장
    # Python으로 치면: dir = cat_dir / folder if cat else vault / folder
    cat_folder = get_category_folder_name(body.categoryId, index) if body.categoryId else None
    if cat_folder:
        save_page_to_disk(page, VAULT_DIR / cat_folder / folder_name)
    else:
        save_page_to_disk(page, VAULT_DIR / folder_name)

    index["pageOrder"].append(page_id)
    index.setdefault("folderMap", {})[page_id] = folder_name
    if body.categoryId:
        index.setdefault("categoryMap", {})[page_id] = body.categoryId
    if not index.get("currentPageId"):
        index["currentPageId"] = page_id
    save_index(index)

    return page


@app.put("/api/pages/{page_id}")
def save_page(page_id: str, page: PageModel):
    """
    페이지 저장 (upsert)

    제목 변경 시:
    1. 새 폴더명 계산
    2. 기존 폴더 → 새 폴더로 rename (카테고리 내부에서)
    3. 이미지 URL 업데이트
    4. renamed=True + 업데이트된 page 반환

    Python으로 치면:
        if new_folder != old_folder:
            shutil.move(old, new)
            replace_urls(blocks)
    """
    index = load_index()
    folder_map = index.setdefault("folderMap", {})

    old_folder = get_folder_name(page_id, index)
    page_data = page.model_dump()
    new_folder = make_folder_name(
        page_data["title"], page_data["createdAt"], page_id
    )

    # 현재 카테고리 정보 (URL 경로에 포함됨)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)

    renamed = False
    if old_folder != new_folder:
        # 카테고리 유무에 따라 올바른 경로 계산
        if cat_folder:
            old_path = VAULT_DIR / cat_folder / old_folder
            new_path = VAULT_DIR / cat_folder / new_folder
        else:
            old_path = VAULT_DIR / old_folder
            new_path = VAULT_DIR / new_folder

        # shutil.move: Windows에서 Path.rename()보다 안정적
        if old_path.exists():
            shutil.move(str(old_path), str(new_path))

        # 이미지 URL 교체 (카테고리 prefix 포함)
        # Python으로 치면: old_url = f".../{cat}/{old_page}/" if cat else f".../{old_page}/"
        old_prefix = get_image_url_prefix(old_folder, cat_folder)
        new_prefix = get_image_url_prefix(new_folder, cat_folder)
        replace_image_urls_in_page(page_data, old_prefix, new_prefix)

        folder_map[page_id] = new_folder
        save_index(index)
        renamed = True

    # content.json 저장
    if cat_folder:
        target_dir = VAULT_DIR / cat_folder / new_folder
    else:
        target_dir = VAULT_DIR / new_folder
    save_page_to_disk(page_data, target_dir)

    # pageOrder에 없으면 추가 (upsert)
    if page_id not in index.get("pageOrder", []):
        index["pageOrder"].append(page_id)
        save_index(index)

    if renamed:
        return {"ok": True, "renamed": True, "page": page_data}
    return {"ok": True, "renamed": False}


@app.delete("/api/pages/{page_id}")
def delete_page(page_id: str):
    """
    페이지 삭제 — 폴더째 삭제 + 인덱스 업데이트
    Python으로 치면: shutil.rmtree(path); index['pageOrder'].remove(page_id)
    """
    index = load_index()
    page_dir = get_page_dir(page_id, index)
    if page_dir.exists():
        shutil.rmtree(page_dir)

    index["pageOrder"] = [pid for pid in index["pageOrder"] if pid != page_id]
    index.get("folderMap", {}).pop(page_id, None)
    index.get("categoryMap", {}).pop(page_id, None)

    if index.get("currentPageId") == page_id:
        index["currentPageId"] = index["pageOrder"][0] if index["pageOrder"] else None

    save_index(index)
    return {"ok": True}


@app.patch("/api/current")
def set_current_page(body: dict):
    """
    현재 선택된 페이지 ID 저장
    Python으로 치면: index['currentPageId'] = page_id; save()
    """
    index = load_index()
    index["currentPageId"] = body.get("pageId")
    save_index(index)
    return {"ok": True}


@app.post("/api/pages/{page_id}/images")
async def upload_image(page_id: str, file: UploadFile = File(...)):
    """
    이미지 업로드 → vault/{경로}/images/{uuid}.ext 저장 → URL 반환
    카테고리 고려한 경로로 저장
    Python으로 치면: file.save(path); return {'url': url}
    """
    index = load_index()
    page_dir = get_page_dir(page_id, index)

    images_dir = page_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # 원본 확장자 유지 (없으면 .jpg)
    suffix = Path(file.filename or "").suffix or ".jpg"
    filename = f"{uuid.uuid4()}{suffix}"
    file_path = images_dir / filename

    content = await file.read()
    file_path.write_bytes(content)

    # URL 경로 계산 (카테고리 prefix 포함)
    # Python으로 치면: url = f"http://.../{cat}/{page}/images/{file}" if cat else ...
    page_folder = get_folder_name(page_id, index)
    cat_id = index.get("categoryMap", {}).get(page_id)
    cat_folder = get_category_folder_name(cat_id, index)
    prefix = get_image_url_prefix(page_folder, cat_folder)
    url = f"{prefix}images/{filename}"

    return {"url": url, "filename": filename}


# -----------------------------------------------
# API 엔드포인트 — 카테고리
# -----------------------------------------------

@app.get("/api/categories")
def get_categories():
    """카테고리 목록 반환"""
    index = load_index()
    return {
        "categories": index.get("categories", []),
        "categoryMap": index.get("categoryMap", {}),
        "categoryOrder": index.get("categoryOrder", []),
    }


@app.post("/api/categories", status_code=201)
def create_category(body: CreateCategoryBody):
    """
    새 카테고리 생성 → vault/{folderName}/ 폴더 생성
    Python으로 치면: os.mkdir(f'vault/{name}'); append_to_index()
    """
    cat_id = str(uuid.uuid4())
    folder_base = sanitize_category_name(body.name)

    index = load_index()

    # 중복 폴더명 방지 (숫자 suffix 추가)
    existing_folders = {c["folderName"] for c in index.get("categories", [])}
    folder_name = folder_base
    counter = 2
    while folder_name in existing_folders:
        folder_name = f"{folder_base}_{counter}"
        counter += 1

    # 실제 폴더 생성
    (VAULT_DIR / folder_name).mkdir(exist_ok=True)

    cat = {"id": cat_id, "name": body.name, "folderName": folder_name}
    index["categories"].append(cat)
    index["categoryOrder"].append(cat_id)
    save_index(index)

    return cat


@app.put("/api/categories/{cat_id}")
def rename_category(cat_id: str, body: RenameCategoryBody):
    """
    카테고리 이름 변경 → 폴더 rename + 내부 페이지 이미지 URL 일괄 교체
    Python으로 치면: shutil.move(old_dir, new_dir); update_urls()
    """
    index = load_index()

    # 카테고리 찾기
    cat = next((c for c in index.get("categories", []) if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")

    old_folder = cat["folderName"]
    new_folder_base = sanitize_category_name(body.name)

    # 중복 방지
    existing_folders = {c["folderName"] for c in index["categories"] if c["id"] != cat_id}
    new_folder = new_folder_base
    counter = 2
    while new_folder in existing_folders:
        new_folder = f"{new_folder_base}_{counter}"
        counter += 1

    renamed = old_folder != new_folder

    if renamed:
        old_path = VAULT_DIR / old_folder
        new_path = VAULT_DIR / new_folder
        if old_path.exists():
            shutil.move(str(old_path), str(new_path))

        # 이 카테고리에 속한 모든 페이지의 이미지 URL 업데이트
        # Python으로 치면: for page in category_pages: update_urls(page)
        for page_id, cid in index.get("categoryMap", {}).items():
            if cid != cat_id:
                continue
            page_folder = get_folder_name(page_id, index)
            content_file = VAULT_DIR / new_folder / page_folder / "content.json"
            if not content_file.exists():
                continue
            page_data = json.loads(content_file.read_text(encoding="utf-8"))
            old_prefix = f"http://localhost:8000/static/{old_folder}/{page_folder}/"
            new_prefix = f"http://localhost:8000/static/{new_folder}/{page_folder}/"
            replace_image_urls_in_page(page_data, old_prefix, new_prefix)
            content_file.write_text(
                json.dumps(page_data, ensure_ascii=False, indent=2),
                encoding="utf-8"
            )

        cat["folderName"] = new_folder

    cat["name"] = body.name
    save_index(index)

    return {"ok": True, "renamed": renamed, "category": cat}


@app.delete("/api/categories/{cat_id}")
def delete_category(cat_id: str):
    """
    카테고리 삭제
    안에 메모가 있으면 삭제 불가 → hasPages: True 반환
    Python으로 치면: if pages: return error; shutil.rmtree(cat_dir)
    """
    index = load_index()

    # 카테고리 찾기
    cat = next((c for c in index.get("categories", []) if c["id"] == cat_id), None)
    if not cat:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")

    # 카테고리 안에 페이지가 있으면 삭제 불가
    # Python으로 치면: pages_in_cat = [p for p, c in categoryMap.items() if c == cat_id]
    pages_in_cat = [pid for pid, cid in index.get("categoryMap", {}).items() if cid == cat_id]
    if pages_in_cat:
        return {"ok": False, "hasPages": True, "count": len(pages_in_cat)}

    # 실제 폴더 삭제 (비어있는 경우)
    cat_dir = VAULT_DIR / cat["folderName"]
    if cat_dir.exists():
        shutil.rmtree(cat_dir)

    index["categories"] = [c for c in index["categories"] if c["id"] != cat_id]
    index["categoryOrder"] = [cid for cid in index.get("categoryOrder", []) if cid != cat_id]
    save_index(index)

    return {"ok": True, "hasPages": False}


@app.patch("/api/pages/reorder")
def reorder_pages(body: PageReorderBody):
    """
    페이지 표시 순서 변경
    Python으로 치면: index['pageOrder'] = body.order; save()
    """
    index = load_index()
    valid_ids = set(index.get("pageOrder", []))

    # 요청에 포함된 ID 중 유효한 것만 새 순서로
    # Python으로 치면: new_order = [pid for pid in body.order if pid in valid_ids]
    new_order = [pid for pid in body.order if pid in valid_ids]

    # 혹시 누락된 ID는 뒤에 붙임 (안전 장치)
    for pid in index.get("pageOrder", []):
        if pid not in new_order:
            new_order.append(pid)

    index["pageOrder"] = new_order
    save_index(index)
    return {"ok": True}


@app.patch("/api/pages/{page_id}/category")
def move_page_to_category(page_id: str, body: MoveCategoryBody):
    """
    페이지를 다른 카테고리로 이동 (또는 미분류로)
    실제 폴더를 이동 + 이미지 URL 교체
    Python으로 치면: shutil.move(old_path, new_path); update_urls()
    """
    index = load_index()

    page = load_page(page_id, index)
    if not page:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다")

    old_cat_id = index.get("categoryMap", {}).get(page_id)
    new_cat_id = body.categoryId

    # 이미 같은 카테고리면 아무것도 안 함
    if old_cat_id == new_cat_id:
        return {"ok": True, "moved": False}

    page_folder = get_folder_name(page_id, index)
    old_cat_folder = get_category_folder_name(old_cat_id, index)
    new_cat_folder = get_category_folder_name(new_cat_id, index)

    # 실제 폴더 이동
    # Python으로 치면: old = cat/page if cat else page; shutil.move(old, new)
    if old_cat_folder:
        old_path = VAULT_DIR / old_cat_folder / page_folder
    else:
        old_path = VAULT_DIR / page_folder

    if new_cat_folder:
        new_path = VAULT_DIR / new_cat_folder / page_folder
        # 대상 카테고리 폴더가 없으면 생성
        (VAULT_DIR / new_cat_folder).mkdir(exist_ok=True)
    else:
        new_path = VAULT_DIR / page_folder

    if old_path.exists():
        shutil.move(str(old_path), str(new_path))

    # 이미지 URL 교체
    content_file = new_path / "content.json"
    updated_page = None
    if content_file.exists():
        page_data = json.loads(content_file.read_text(encoding="utf-8"))
        old_prefix = get_image_url_prefix(page_folder, old_cat_folder)
        new_prefix = get_image_url_prefix(page_folder, new_cat_folder)
        replace_image_urls_in_page(page_data, old_prefix, new_prefix)
        content_file.write_text(
            json.dumps(page_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        updated_page = page_data

    # categoryMap 업데이트
    # Python으로 치면: index['categoryMap'][page_id] = new_cat_id or del categoryMap[page_id]
    if new_cat_id:
        index.setdefault("categoryMap", {})[page_id] = new_cat_id
    else:
        index.get("categoryMap", {}).pop(page_id, None)

    save_index(index)

    return {"ok": True, "moved": True, "page": updated_page}


@app.patch("/api/categories/reorder")
def reorder_categories(body: CategoryReorderBody):
    """
    카테고리 표시 순서 변경
    Python으로 치면: index['categoryOrder'] = body.order; save()
    """
    index = load_index()
    index["categoryOrder"] = body.order
    save_index(index)
    return {"ok": True}


# ==============================================
# 내보내기 / 가져오기 / 설정 / 디버그 엔드포인트
# Python으로 치면: @app.route('/api/export/json', methods=['GET'])
# ==============================================

@app.get("/api/export/json")
def export_json():
    """
    전체 vault를 단일 JSON 파일로 내려받기
    Python으로 치면: return send_file(json_bytes, as_attachment=True)
    """
    # _index.json 로드
    index = load_index()
    pages_data = []

    # 모든 페이지 content.json 수집
    # Python으로 치면: for folder in vault.iterdir(): pages.append(load(folder))
    for page_id in index.get("pageOrder", []):
        page_folder = next(
            (p for p in index.get("pages", []) if p.get("id") == page_id),
            None
        )
        if not page_folder:
            continue
        folder_name = page_folder.get("folder", "")
        cat_id = index.get("categoryMap", {}).get(page_id)
        cat_folder = None
        if cat_id:
            cat_folder = next(
                (c.get("folder") for c in index.get("categories", []) if c.get("id") == cat_id),
                None
            )

        if cat_folder:
            content_path = VAULT_DIR / cat_folder / folder_name / "content.json"
        else:
            content_path = VAULT_DIR / folder_name / "content.json"

        if content_path.exists():
            pages_data.append(json.loads(content_path.read_text(encoding="utf-8")))

    export_obj = {
        "exportedAt": datetime.now().isoformat(),
        "version": "2.0",
        "index": index,
        "pages": pages_data,
    }

    json_bytes = json.dumps(export_obj, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"notion-clone-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export/markdown")
def export_markdown():
    """
    전체 vault를 마크다운 ZIP으로 내려받기
    Python으로 치면: zipfile.write(md_content); return send_file(zip)
    """
    index = load_index()
    zip_buffer = io.BytesIO()

    def blocks_to_markdown(blocks: list) -> str:
        """블록 배열 → 마크다운 텍스트 변환"""
        lines = []
        for block in blocks:
            btype = block.get("type", "paragraph")
            content = block.get("content", "")

            if btype == "heading1":
                lines.append(f"# {content}")
            elif btype == "heading2":
                lines.append(f"## {content}")
            elif btype == "heading3":
                lines.append(f"### {content}")
            elif btype == "bulletList":
                lines.append(f"- {content}")
            elif btype == "orderedList":
                lines.append(f"1. {content}")
            elif btype == "taskList":
                checked = "x" if block.get("checked") else " "
                lines.append(f"- [{checked}] {content}")
            elif btype == "quote":
                lines.append(f"> {content}")
            elif btype == "code":
                lines.append(f"```\n{content}\n```")
            elif btype == "divider":
                lines.append("---")
            elif btype == "kanban":
                lines.append("[칸반 보드]")
            else:
                lines.append(content)
            lines.append("")  # 빈 줄 구분
        return "\n".join(lines)

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for page_meta in index.get("pages", []):
            page_id = page_meta.get("id", "")
            folder_name = page_meta.get("folder", "")
            cat_id = index.get("categoryMap", {}).get(page_id)
            cat_folder = None
            if cat_id:
                cat_folder = next(
                    (c.get("folder") for c in index.get("categories", []) if c.get("id") == cat_id),
                    None
                )

            if cat_folder:
                content_path = VAULT_DIR / cat_folder / folder_name / "content.json"
                zip_path = f"{cat_folder}/{folder_name}.md"
            else:
                content_path = VAULT_DIR / folder_name / "content.json"
                zip_path = f"{folder_name}.md"

            if not content_path.exists():
                continue

            page_data = json.loads(content_path.read_text(encoding="utf-8"))
            title = page_data.get("title", "제목 없음")
            blocks = page_data.get("blocks", [])

            md_lines = [f"# {title}", ""]
            md_lines.append(blocks_to_markdown(blocks))
            md_content = "\n".join(md_lines)
            zf.writestr(zip_path, md_content.encode("utf-8"))

    zip_buffer.seek(0)
    filename = f"notion-clone-markdown-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class ImportBody(BaseModel):
    """JSON 백업 가져오기 요청 바디"""
    data: dict


@app.post("/api/import")
def import_json(body: ImportBody):
    """
    JSON 백업에서 vault 복구
    Python으로 치면: shutil.rmtree(vault); restore(backup_data)

    주의: 기존 vault를 완전히 덮어씀
    """
    data = body.data
    new_index = data.get("index", {})
    pages_list = data.get("pages", [])

    # 기존 vault 백업 (rollback 가능하도록)
    # Python으로 치면: shutil.copytree(vault, vault_bak)
    backup_dir = VAULT_DIR.parent / f"vault_bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if VAULT_DIR.exists():
        shutil.copytree(str(VAULT_DIR), str(backup_dir))

    try:
        # vault 초기화 (이미지 제외)
        for item in VAULT_DIR.iterdir():
            if item.name == "_index.json":
                continue
            if item.is_dir():
                shutil.rmtree(str(item))

        # index 저장
        save_index(new_index)

        # 각 페이지 content.json 복구
        for page_data in pages_list:
            folder_name = page_data.get("folder", "")
            page_id = page_data.get("id", "")
            cat_id = new_index.get("categoryMap", {}).get(page_id)
            cat_folder = None
            if cat_id:
                cat_folder = next(
                    (c.get("folder") for c in new_index.get("categories", []) if c.get("id") == cat_id),
                    None
                )

            if cat_folder:
                target_dir = VAULT_DIR / cat_folder / folder_name
            else:
                target_dir = VAULT_DIR / folder_name

            target_dir.mkdir(parents=True, exist_ok=True)
            content_path = target_dir / "content.json"
            content_path.write_text(
                json.dumps(page_data, ensure_ascii=False, indent=2),
                encoding="utf-8"
            )

        # 임시 백업 삭제 (성공 시)
        if backup_dir.exists():
            shutil.rmtree(str(backup_dir))

        return {"ok": True, "imported": len(pages_list)}

    except Exception as exc:
        # 실패 시 백업에서 롤백
        if backup_dir.exists():
            shutil.rmtree(str(VAULT_DIR))
            shutil.copytree(str(backup_dir), str(VAULT_DIR))
            shutil.rmtree(str(backup_dir))
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/settings/vault-path")
def get_vault_path():
    """
    현재 vault 경로와 통계 반환
    Python으로 치면: return {'path': str(VAULT_DIR), 'pages': len(pages), ...}
    """
    index = load_index()
    page_count = len(index.get("pages", []))
    category_count = len(index.get("categories", []))

    # vault 전체 디스크 사용량 계산 (bytes)
    # Python으로 치면: total = sum(f.stat().st_size for f in vault.rglob('*'))
    total_size = 0
    if VAULT_DIR.exists():
        for f in VAULT_DIR.rglob("*"):
            if f.is_file():
                total_size += f.stat().st_size

    return {
        "path":       str(VAULT_DIR.resolve()),
        "pages":      page_count,
        "categories": category_count,
        "sizeBytes":  total_size,
    }


@app.get("/api/debug/logs")
def get_debug_logs():
    """
    메모리에 보관 중인 최근 로그 반환 (최대 100개)
    Python으로 치면: return list(_mem_handler.records)
    """
    return {"logs": list(_mem_handler.records)}
