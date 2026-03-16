# ==============================================
# backend/routers/export_import.py
# 역할: JSON 전체 내보내기, 마크다운 ZIP 내보내기, JSON 가져오기
# Python으로 치면: Flask Blueprint('export_import', ...)
# ==============================================

import base64
import html as _html_mod
import io
import json
import mimetypes
import re
import shutil
import urllib.parse
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.core import (
    CONTENT_EXT,
    VAULT_DIR,
    ImportBody,
    assert_inside_vault,
    load_index,
    resolve_content_file,
    save_index,
    save_page_to_disk,
    validate_uuid,
)

# Python으로 치면: blueprint = Blueprint('export_import', __name__, url_prefix='/api')
router = APIRouter(prefix="/api", tags=["export_import"])


# -----------------------------------------------
# 내보내기
# -----------------------------------------------

@router.get("/export/json")
def export_json():
    """
    전체 vault를 단일 JSON 파일로 내려받기
    Python으로 치면: return send_file(json_bytes, as_attachment=True)
    """
    index = load_index()
    pages_data = []

    # 모든 페이지 content.json 수집 (folderMap 기반)
    # Python으로 치면: for page_id in pageOrder: pages.append(load(folder))
    folder_map = index.get("folderMap", {})
    category_map = index.get("categoryMap", {})
    categories = {c["id"]: c["folderName"] for c in index.get("categories", [])}

    for page_id in index.get("pageOrder", []):
        folder_name = folder_map.get(page_id)
        if not folder_name:
            continue

        cat_id = category_map.get(page_id)
        cat_folder = categories.get(cat_id) if cat_id else None

        if cat_folder:
            content_path = resolve_content_file(VAULT_DIR / cat_folder / folder_name)
        else:
            content_path = resolve_content_file(VAULT_DIR / folder_name)

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


@router.get("/export/markdown")
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
            elif btype == "layout":
                # 레이아웃 블록: 슬롯 A→B→C 순서로 선형화 (--- 구분선 삽입)
                # Python으로 치면: for slot in ['a','b','c']: lines += blocks_to_md(slot_blocks)
                try:
                    layout_data = json.loads(content) if isinstance(content, str) else {}
                    slot_parts = []
                    for slot_id in ["a", "b", "c"]:
                        slot_blocks = layout_data.get("slots", {}).get(slot_id, [])
                        if slot_blocks:
                            slot_md = blocks_to_markdown(slot_blocks).strip()
                            if slot_md:
                                slot_parts.append(slot_md)
                    if slot_parts:
                        lines.append("\n\n---\n\n".join(slot_parts))
                    else:
                        lines.append("[레이아웃 블록]")
                except Exception:
                    lines.append("[레이아웃 블록]")
            else:
                lines.append(content)
            lines.append("")  # 빈 줄 구분
        return "\n".join(lines)

    folder_map = index.get("folderMap", {})
    category_map = index.get("categoryMap", {})
    categories = {c["id"]: c["folderName"] for c in index.get("categories", [])}

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for page_id in index.get("pageOrder", []):
            folder_name = folder_map.get(page_id)
            if not folder_name:
                continue

            cat_id = category_map.get(page_id)
            cat_folder = categories.get(cat_id) if cat_id else None

            if cat_folder:
                content_path = resolve_content_file(VAULT_DIR / cat_folder / folder_name)
                zip_path = f"{cat_folder}/{folder_name}.md"
            else:
                content_path = resolve_content_file(VAULT_DIR / folder_name)
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


# -----------------------------------------------
# HTML 내보내기 (단일 파일 + base64 임베딩)
# -----------------------------------------------

# localhost:8000/static/... URL에서 파일 경로 추출 정규식
# Python으로 치면: re.compile(r'http://localhost:8000/static/(.+)')
_STATIC_URL_RE = re.compile(r'http://localhost:8000/static/([^\s"\'<>]+)')


def _url_to_base64(static_path: str) -> Optional[str]:
    """
    static_path ('cat/page/images/uuid.ext') → base64 data URI 반환
    실패 시 None (원본 URL 유지)
    Python으로 치면: def url_to_base64(path): return f'data:{mime};base64,{b64}'
    """
    try:
        file_path = VAULT_DIR / static_path
        assert_inside_vault(file_path)
        if not file_path.exists():
            return None
        mime, _ = mimetypes.guess_type(str(file_path))
        mime = mime or 'application/octet-stream'
        data = base64.b64encode(file_path.read_bytes()).decode('ascii')
        return f"data:{mime};base64,{data}"
    except Exception:
        return None


def _embed_static_urls(text: str) -> str:
    """
    텍스트 내 http://localhost:8000/static/... URL을 base64 data URI로 교체
    Python으로 치면: re.sub(pattern, lambda m: to_base64(m.group(1)) or m.group(0), text)
    """
    def replacer(m: re.Match) -> str:
        b64 = _url_to_base64(m.group(1))
        return b64 if b64 else m.group(0)
    return _STATIC_URL_RE.sub(replacer, text)


def _blocks_to_html(blocks: list) -> str:
    """
    블록 배열 → HTML 문자열 변환 (재귀)
    Python으로 치면: def blocks_to_html(blocks): return '\\n'.join(render(b) for b in blocks)
    """
    parts = []
    for block in blocks:
        btype = block.get("type", "paragraph")
        content = block.get("content", "")

        if btype == "paragraph":
            parts.append(f'<p>{content}</p>')

        elif btype in ("heading1", "heading2", "heading3", "heading4", "heading5", "heading6"):
            # heading1 → h1, heading2 → h2 등
            # Python으로 치면: level = int(btype[-1])
            level = int(btype[-1])
            parts.append(f'<h{level}>{content}</h{level}>')

        elif btype == "bulletList":
            parts.append(f'<ul><li>{content}</li></ul>')

        elif btype == "orderedList":
            parts.append(f'<ol><li>{content}</li></ol>')

        elif btype == "taskList":
            checked = 'checked' if block.get("checked") else ''
            parts.append(
                f'<div class="task-item"><input type="checkbox" {checked} disabled> {content}</div>'
            )

        elif btype == "toggle":
            # Python으로 치면: <details><summary>header</summary>children_html</details>
            try:
                parsed = json.loads(content) if isinstance(content, str) and content.startswith('{') else {}
                header = parsed.get("header", content)
                children = parsed.get("children", block.get("children", []))
            except Exception:
                header = content
                children = block.get("children", [])
            inner = _blocks_to_html(children) if children else ''
            parts.append(f'<details><summary>{header}</summary>{inner}</details>')

        elif btype == "code":
            # Python으로 치면: <pre><code>content</code></pre>
            raw = _html_mod.unescape(re.sub(r'<[^>]+>', '', content))
            parts.append(f'<pre><code>{_html_mod.escape(raw)}</code></pre>')

        elif btype == "image":
            # content는 JSON: { "src": "http://localhost:8000/static/...", "caption": "..." }
            if not content.strip():
                parts.append('<p><em>[빈 이미지 블록]</em></p>')
            else:
                try:
                    data = json.loads(content) if isinstance(content, str) and content.startswith('{') else {}
                    src = data.get("src", content)
                    caption = data.get("caption", "")
                    width = data.get("width")
                except Exception:
                    src = content
                    caption = ""
                    width = None
                if not src:
                    parts.append('<p><em>[빈 이미지 블록]</em></p>')
                else:
                    static_match = re.search(r'http://localhost:8000/static/(.+)', src)
                    if static_match:
                        b64 = _url_to_base64(static_match.group(1))
                        if b64:
                            src = b64
                    width_attr = f' width="{width}"' if width else ' style="max-width:100%"'
                    img_tag = f'<img src="{src}"{width_attr} alt="{_html_mod.escape(caption)}">'
                    if caption:
                        parts.append(f'<figure>{img_tag}<figcaption>{_html_mod.escape(caption)}</figcaption></figure>')
                    else:
                        parts.append(img_tag)

        elif btype == "video":
            # Python으로 치면: data = json.loads(content); src, width = data['src'], data.get('width')
            try:
                data = json.loads(content) if isinstance(content, str) else {}
                src = data.get("src", "")
                vid_width = data.get("width")
            except Exception:
                src = content
                vid_width = None
            b64 = _url_to_base64(src.replace("http://localhost:8000/static/", "")) if src else None
            if b64:
                # 저장된 너비가 있으면 그 너비로, 없으면 본문 너비(100%)
                width_style = f"width:{vid_width}px;max-width:100%" if vid_width else "width:100%;max-width:100%"
                parts.append(
                    f'<video controls style="{width_style}"><source src="{b64}"></video>'
                )
            else:
                parts.append('<p><em>⚠️ 비디오 파일을 포함할 수 없습니다</em></p>')

        elif btype == "divider":
            parts.append('<hr>')

        elif btype == "admonition":
            # Python으로 치면: header/body JSON 파싱
            try:
                data = json.loads(content) if isinstance(content, str) else {}
                header = data.get("header", "")
                body = data.get("body", "")
            except Exception:
                header = ""
                body = content
            parts.append(
                f'<div class="admonition"><strong>{header}</strong><p>{body}</p></div>'
            )

        elif btype == "math":
            # KaTeX CDN으로 렌더링 (HTML에 class 부여, CDN 로드 필요)
            # Python으로 치면: <div class="math-block">content</div>
            parts.append(f'<div class="math-block">{content}</div>')

        elif btype == "mermaid":
            # content가 비어있으면 건너뜀 (빈 문자열을 mermaid가 파싱하면 Syntax error 발생)
            if not content.strip():
                parts.append('<p><em>[빈 다이어그램 블록]</em></p>')
            else:
                # content는 raw Mermaid 텍스트 (plain text)
                # JS textContent로 주입 — HTML 파서가 <, > 를 태그로 해석하는 문제 방지
                encoded = json.dumps(content.strip())
                parts.append(
                    f'<div class="mermaid"></div>'
                    f'<script>document.currentScript.previousElementSibling.textContent={encoded};</script>'
                )

        elif btype == "embed":
            # YouTube / iframe URL 그대로 유지
            if not content.strip():
                parts.append('<p><em>[빈 임베드 블록]</em></p>')
            else:
                try:
                    data = json.loads(content) if isinstance(content, str) else {}
                    url = data.get("url", content)
                except Exception:
                    url = content
                if not url:
                    parts.append('<p><em>[빈 임베드 블록]</em></p>')
                else:
                    parts.append(
                        f'<iframe src="{url}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>'
                    )

        elif btype == "table":
            # Tiptap 테이블 HTML 그대로 통과
            parts.append(content)

        elif btype == "layout":
            # 슬롯 A→B→C 컬럼 div로 변환
            # Python으로 치면: for slot in slots: div.append(blocks_to_html(slot_blocks))
            try:
                data = json.loads(content) if isinstance(content, str) else {}
                slots = data.get("slots", {})
                cols = []
                for slot_id in sorted(slots.keys()):
                    slot_html = _blocks_to_html(slots[slot_id])
                    cols.append(f'<div class="layout-col">{slot_html}</div>')
                parts.append(f'<div class="layout-row">{"".join(cols)}</div>')
            except Exception:
                parts.append(f'<div>{content}</div>')

        elif btype in ("canvas", "excalidraw"):
            parts.append('<p><em>⚠️ 캔버스/드로잉 블록은 HTML로 내보낼 수 없습니다</em></p>')

        elif btype == "kanban":
            # 카드 목록으로 단순화
            try:
                data = json.loads(content) if isinstance(content, str) else {}
                columns = data.get("columns", [])
                col_parts = []
                for col in columns:
                    cards_html = ''.join(
                        f'<li>{c.get("title","")}</li>' for c in col.get("cards", [])
                    )
                    col_parts.append(
                        f'<div class="kanban-col"><strong>{col.get("title","")}</strong><ul>{cards_html}</ul></div>'
                    )
                parts.append(f'<div class="kanban">{"".join(col_parts)}</div>')
            except Exception:
                parts.append(f'<div>[칸반 보드]</div>')

        else:
            parts.append(f'<p>{content}</p>')

        # 토글이 아닌 블록에 자식 블록이 있을 경우 재귀 렌더
        # Python으로 치면: if children and btype != 'toggle': append(blocks_to_html(children))
        if btype != "toggle" and block.get("children"):
            parts.append(f'<div class="block-children">{_blocks_to_html(block["children"])}</div>')

    return "\n".join(parts)


def _make_html_doc(title: str, icon: str, body_html: str,
                   has_math: bool, has_mermaid: bool) -> str:
    """
    완성된 HTML 문서 조립 (KaTeX/Mermaid CDN 조건부 포함)
    Python으로 치면: def make_html(title, body, has_math, has_mermaid): return template.format(...)
    """
    # KaTeX CDN (수식 있을 때만)
    katex_cdn = """
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body)"></script>""" if has_math else ""

    # Mermaid CDN (다이어그램 있을 때만) — body 끝에 배치 (UMD)
    # startOnLoad:false 후 mermaid.run() 명시 호출
    # → 이 시점엔 inline <script>로 설정한 textContent가 이미 DOM에 반영됨
    mermaid_cdn = """
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
    mermaid.run({ querySelector: '.mermaid' });
  </script>""" if has_mermaid else ""

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{icon} {title}</title>{katex_cdn}
  <style>
    body {{ font-family: -apple-system, 'Noto Sans KR', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }}
    h1 {{ font-size: 2em; margin-bottom: 0.3em; }}
    h2 {{ font-size: 1.5em; margin-top: 1.5em; }}
    h3 {{ font-size: 1.25em; margin-top: 1.2em; }}
    h4, h5, h6 {{ margin-top: 1em; }}
    p {{ margin: 0.6em 0; }}
    ul, ol {{ padding-left: 1.5em; }}
    li {{ margin: 0.3em 0; }}
    pre {{ background: #f5f5f5; border-radius: 6px; padding: 12px 16px; overflow-x: auto; font-size: 0.9em; }}
    code {{ background: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }}
    pre code {{ background: none; padding: 0; }}
    blockquote {{ border-left: 3px solid #d0d0d0; margin: 0; padding-left: 1em; color: #555; }}
    hr {{ border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }}
    img {{ max-width: 100%; border-radius: 6px; }}
    video {{ width: 100%; max-width: 100%; border-radius: 6px; }}
    iframe {{ border-radius: 6px; }}
    table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
    th, td {{ border: 1px solid #e0e0e0; padding: 8px 12px; text-align: left; }}
    th {{ background: #f8f8f8; font-weight: 600; }}
    details summary {{ cursor: pointer; font-weight: 600; padding: 4px 0; }}
    .task-item {{ display: flex; align-items: center; gap: 6px; margin: 4px 0; }}
    .admonition {{ border-left: 4px solid #7c3aed; background: #f5f3ff; border-radius: 4px; padding: 10px 14px; margin: 1em 0; }}
    .math-block {{ text-align: center; margin: 1em 0; }}
    .block-children {{ padding-left: 1.5em; border-left: 2px solid #e0e0e0; margin: 0.5em 0; }}
    .layout-row {{ display: flex; gap: 16px; margin: 1em 0; }}
    .layout-col {{ flex: 1; min-width: 0; }}
    .kanban {{ display: flex; gap: 16px; margin: 1em 0; overflow-x: auto; }}
    .kanban-col {{ min-width: 200px; background: #f8f8f8; border-radius: 8px; padding: 12px; }}
    .kanban-col ul {{ padding-left: 0; list-style: none; }}
    .kanban-col li {{ background: white; border-radius: 4px; padding: 6px 10px; margin: 6px 0; box-shadow: 0 1px 3px rgba(0,0,0,.08); }}
    figure {{ margin: 1em 0; }}
    figcaption {{ font-size: 0.85em; color: #888; text-align: center; margin-top: 4px; }}
  </style>
</head>
<body>
  <article>
    <h1>{icon} {title}</h1>
    {body_html}
  </article>{mermaid_cdn}
</body>
</html>"""


@router.get("/export/html/{page_id}")
def export_html(page_id: str):
    """
    단일 페이지를 자기완결형 HTML 파일로 내보내기
    이미지·비디오는 base64로 인라인 임베딩
    Python으로 치면: return send_file(html_bytes, filename='{title}.html')
    """
    validate_uuid(page_id, "page_id")

    # 페이지 파일 경로 조회
    index = load_index()
    folder_map = index.get("folderMap", {})
    category_map = index.get("categoryMap", {})
    categories = {c["id"]: c["folderName"] for c in index.get("categories", [])}

    folder_name = folder_map.get(page_id)
    if not folder_name:
        raise HTTPException(status_code=404, detail="페이지를 찾을 수 없습니다")

    cat_id = category_map.get(page_id)
    cat_folder = categories.get(cat_id) if cat_id else None

    if cat_folder:
        content_path = resolve_content_file(VAULT_DIR / cat_folder / folder_name)
    else:
        content_path = resolve_content_file(VAULT_DIR / folder_name)

    if not content_path.exists():
        raise HTTPException(status_code=404, detail="페이지 파일을 찾을 수 없습니다")

    page_data = json.loads(content_path.read_text(encoding="utf-8"))
    title = page_data.get("title", "제목 없음")
    icon = page_data.get("icon", "📝")
    blocks = page_data.get("blocks", [])

    # 블록 타입 스캔 — CDN 포함 여부 결정
    # Python으로 치면: has_math = any(b['type']=='math' for b in flatten_blocks(blocks))
    def _all_blocks(blist: list) -> list:
        result = []
        for b in blist:
            result.append(b)
            result.extend(_all_blocks(b.get("children", [])))
        return result

    all_blocks = _all_blocks(blocks)
    has_math = any(b.get("type") == "math" and b.get("content", "").strip() for b in all_blocks)
    # 내용이 있는 mermaid 블록이 하나라도 있을 때만 CDN 로드
    has_mermaid = any(b.get("type") == "mermaid" and b.get("content", "").strip() for b in all_blocks)

    body_html = _blocks_to_html(blocks)
    html_doc = _make_html_doc(title, icon, body_html, has_math, has_mermaid)
    html_bytes = html_doc.encode("utf-8")

    # 파일명: 특수문자 제거 후 RFC 5987 방식으로 인코딩 (한국어 지원)
    # latin-1로 인코딩 불가능한 문자(한국어 등)는 filename*=UTF-8''... 형식 사용
    # Python으로 치면: safe = re.sub(...); encoded = urllib.parse.quote(safe)
    safe_title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title).strip() or "export"
    filename = f"{safe_title}.html"
    encoded_filename = urllib.parse.quote(filename, safe='')
    content_disposition = f"attachment; filename*=UTF-8''{encoded_filename}"

    return StreamingResponse(
        io.BytesIO(html_bytes),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": content_disposition},
    )


# -----------------------------------------------
# 가져오기
# -----------------------------------------------

@router.post("/import")
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
    backup_dir = VAULT_DIR.parent / f"vault_bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if VAULT_DIR.exists():
        shutil.copytree(str(VAULT_DIR), str(backup_dir))

    try:
        # vault 초기화 (이미지 제외)
        for item in VAULT_DIR.iterdir():
            # 인덱스 파일(.nct / 구버전 .json) 보존
            if item.name in ("_index.nct", "_index.json"):
                continue
            if item.is_dir():
                shutil.rmtree(str(item))

        # index 저장
        save_index(new_index)

        # 각 페이지 content.json 복구 (folderMap 기반)
        folder_map = new_index.get("folderMap", {})
        category_map = new_index.get("categoryMap", {})
        categories = {c["id"]: c.get("folderName", "") for c in new_index.get("categories", [])}

        for page_data in pages_list:
            page_id = page_data.get("id", "")
            folder_name = folder_map.get(page_id, page_data.get("folder", ""))
            if not folder_name:
                continue

            cat_id = category_map.get(page_id)
            cat_folder = categories.get(cat_id) if cat_id else None

            if cat_folder:
                target_dir = VAULT_DIR / cat_folder / folder_name
            else:
                target_dir = VAULT_DIR / folder_name

            # 🔒 vault 탈출 방지
            assert_inside_vault(target_dir)

            # .nct로 저장 (save_page_to_disk가 구버전 .json 자동 삭제)
            save_page_to_disk(page_data, target_dir)

        # 임시 백업 삭제 (성공 시)
        if backup_dir.exists():
            shutil.rmtree(str(backup_dir))

        return {"ok": True, "imported": len(pages_list)}

    except HTTPException:
        # 보안 예외는 그대로 전파 (vault 복구 후)
        if backup_dir.exists():
            shutil.rmtree(str(VAULT_DIR))
            shutil.copytree(str(backup_dir), str(VAULT_DIR))
            shutil.rmtree(str(backup_dir))
        raise

    except Exception as exc:
        # 실패 시 백업에서 롤백
        if backup_dir.exists():
            shutil.rmtree(str(VAULT_DIR))
            shutil.copytree(str(backup_dir), str(VAULT_DIR))
            shutil.rmtree(str(backup_dir))
        raise HTTPException(status_code=500, detail=str(exc)) from exc
