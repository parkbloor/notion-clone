# ==============================================
# backend/routers/search.py
# 역할: 페이지 제목 + 블록 내용 전문 검색 API
# Python으로 치면: Flask Blueprint('search', ...)
# ==============================================

import re

from fastapi import APIRouter

from backend.core import load_index, load_page

# Python으로 치면: blueprint = Blueprint('search', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["search"])


def strip_html(html: str) -> str:
    """
    HTML 태그 제거 → 순수 텍스트 반환
    Python으로 치면: re.sub(r'<[^>]+>', '', html)
    """
    text = re.sub(r'<[^>]+>', ' ', html or '')
    # HTML 엔티티 기본 처리
    text = (
        text.replace('&nbsp;', ' ')
            .replace('&amp;', '&')
            .replace('&lt;', '<')
            .replace('&gt;', '>')
            .replace('&quot;', '"')
    )
    # 연속 공백 정리
    return re.sub(r'\s+', ' ', text).strip()


def make_snippet(text: str, keyword: str, radius: int = 60) -> str:
    """
    검색어 주변 radius자를 잘라 스니펫 생성
    Python으로 치면: text[max(0, idx-radius):idx+len(keyword)+radius]
    """
    lower_text = text.lower()
    lower_keyword = keyword.lower()
    idx = lower_text.find(lower_keyword)
    if idx == -1:
        # 키워드가 없으면 앞 120자 반환
        return text[:120] + ('...' if len(text) > 120 else '')
    start = max(0, idx - radius)
    end = min(len(text), idx + len(keyword) + radius)
    snippet = text[start:end]
    if start > 0:
        snippet = '...' + snippet
    if end < len(text):
        snippet = snippet + '...'
    return snippet


@router.get("/search")
def search_pages(q: str = ""):
    """
    전체 페이지 제목 + 블록 내용 전문 검색
    반환: [{ pageId, pageTitle, pageIcon, blockId, blockType, snippet, matchType }]
    Python으로 치면: results = [match for page in pages for match in search(page, q)]
    """
    q_stripped = q.strip()
    if not q_stripped:
        return {"results": []}

    index = load_index()
    results = []

    for page_id in index.get("pageOrder", []):
        page_data = load_page(page_id, index)
        if not page_data:
            continue

        title = page_data.get("title", "")
        icon = page_data.get("icon", "📝")
        q_lower = q_stripped.lower()

        # ── 제목 검색 ──
        if q_lower in title.lower():
            results.append({
                "pageId":    page_id,
                "pageTitle": title,
                "pageIcon":  icon,
                "blockId":   None,
                "blockType": None,
                "snippet":   make_snippet(title, q_stripped),
                "matchType": "title",
            })

        # ── 블록 내용 검색 ──
        for block in page_data.get("blocks", []):
            raw_content = block.get("content", "")
            plain_text = strip_html(raw_content)
            if q_lower in plain_text.lower():
                results.append({
                    "pageId":    page_id,
                    "pageTitle": title,
                    "pageIcon":  icon,
                    "blockId":   block.get("id"),
                    "blockType": block.get("type"),
                    "snippet":   make_snippet(plain_text, q_stripped),
                    "matchType": "content",
                })

            # 토글/콜아웃 등 자식 블록도 검색
            for child in block.get("children", []):
                child_text = strip_html(child.get("content", ""))
                if q_lower in child_text.lower():
                    results.append({
                        "pageId":    page_id,
                        "pageTitle": title,
                        "pageIcon":  icon,
                        "blockId":   child.get("id"),
                        "blockType": child.get("type"),
                        "snippet":   make_snippet(child_text, q_stripped),
                        "matchType": "content",
                    })

    # 결과는 최대 20개로 제한
    return {"results": results[:20]}
