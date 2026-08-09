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
    get_vault_dir,
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
            content_path = resolve_content_file(get_vault_dir() / cat_folder / folder_name)
        else:
            content_path = resolve_content_file(get_vault_dir() / folder_name)

        if content_path.exists():
            pages_data.append(json.loads(content_path.read_text(encoding="utf-8")))

    export_obj = {
        "exportedAt": datetime.now().isoformat(),
        "version": "2.0",
        "index": index,
        "pages": pages_data,
    }

    json_bytes = json.dumps(export_obj, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"notion-clone-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.nct"

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
                content_path = resolve_content_file(get_vault_dir() / cat_folder / folder_name)
                zip_path = f"{cat_folder}/{folder_name}.md"
            else:
                content_path = resolve_content_file(get_vault_dir() / folder_name)
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

# 127.0.0.1:8000/static/... URL에서 파일 경로 추출 정규식 (localhost도 호환)
# Python으로 치면: re.compile(r'http://(127\.0\.0\.1|localhost):8000/static/(.+)')
_STATIC_URL_RE = re.compile(r'http://(?:127\.0\.0\.1|localhost):8000/static/([^\s"\'<>]+)')


def _url_to_base64(static_path: str) -> Optional[str]:
    """
    static_path ('cat/page/images/uuid.ext') → base64 data URI 반환
    실패 시 None (원본 URL 유지)
    Python으로 치면: def url_to_base64(path): return f'data:{mime};base64,{b64}'
    """
    try:
        file_path = get_vault_dir() / static_path
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


def _dayplanner_to_html(content: str, target_date: str = '') -> str:
    """
    DayPlanner 블록 JSON → 시각적 타임테이블 HTML 변환
    Python으로 치면: def render_planner(data: PlannerData, target_date: str) -> str: ...
    앱과 동일한 레이아웃: 좌측 시간 레이블 + 우측 절대좌표 이벤트 블록 + 우측 이벤트 목록
    target_date: 'YYYY-MM-DD' — 지정 시 해당 날짜만 렌더 (일간 노트 HTML 내보내기)
                               미지정 시 전체 날짜 렌더 (일반 블록 내보내기)
    """
    try:
        data = json.loads(content) if isinstance(content, str) else {}
    except Exception:
        return '<p><em>[일정표 데이터 오류]</em></p>'

    # ── 구 포맷 호환 처리 (date + events → eventsByDate 로 정규화) ──
    # Python으로 치면: if 'date' in data: data = {'eventsByDate': {data['date']: data['events']}}
    events_by_date: dict = data.get("eventsByDate", {})
    if not events_by_date and data.get("date") and isinstance(data.get("events"), list):
        events_by_date = {data["date"]: data["events"]}

    if not events_by_date:
        return '<p><em>[일정표 — 등록된 일정 없음]</em></p>'

    # ── target_date 필터링: 지정된 날짜만 렌더 ──────────────────────
    # Python으로 치면: if target_date: events_by_date = {target_date: events_by_date.get(target_date, [])}
    if target_date:
        events_for_date: list = events_by_date.get(target_date, [])
        if not events_for_date:
            return '<p><em>[일정표 — 해당 날짜에 등록된 일정 없음]</em></p>'
        events_by_date = {target_date: events_for_date}

    # 색상 팔레트 (Tailwind 400 계열 hex 값)
    # Python으로 치면: COLOR_MAP: dict[str, tuple[str, str]] = {...}  → (bg, text)
    COLOR_MAP: dict = {
        'blue':    ('#60a5fa', '#fff'),
        'sky':     ('#38bdf8', '#fff'),
        'cyan':    ('#22d3ee', '#fff'),
        'teal':    ('#2dd4bf', '#fff'),
        'green':   ('#34d399', '#fff'),
        'lime':    ('#a3e635', '#1f2937'),
        'yellow':  ('#facc15', '#1f2937'),
        'amber':   ('#fbbf24', '#fff'),
        'orange':  ('#fb923c', '#fff'),
        'red':     ('#fb7185', '#fff'),
        'pink':    ('#f472b6', '#fff'),
        'fuchsia': ('#e879f9', '#fff'),
        'purple':  ('#a78bfa', '#fff'),
        'indigo':  ('#818cf8', '#fff'),
        'slate':   ('#94a3b8', '#fff'),
        'gray':    ('#9ca3af', '#fff'),
    }

    HOUR_PX   = 48      # 1시간당 픽셀 높이 (앱 기본 줌과 동일)
    START_H   = 0       # 표시 시작 시각
    END_H     = 24      # 표시 종료 시각
    TOTAL_H   = END_H - START_H
    TOTAL_PX  = TOTAL_H * HOUR_PX

    def time_to_min(t: str) -> int:
        """HH:MM → 분 단위 정수. Python: int(h)*60+int(m)"""
        try:
            h, m = t.split(':')
            return int(h) * 60 + int(m)
        except Exception:
            return -1

    def event_top_height(ev: dict) -> tuple[float, float] | None:
        """이벤트 top/height px 계산. Python: top=(start-base)*px_per_min"""
        s = time_to_min(ev.get('start', ''))
        e = time_to_min(ev.get('end', ''))
        if s < 0 or e <= s:
            return None
        base = START_H * 60
        px_per_min = HOUR_PX / 60.0
        top    = (s - base) * px_per_min
        height = (e - s) * px_per_min
        return (top, max(height, 20))

    # 날짜 정렬 후 각 날짜별 타임테이블 렌더
    # Python으로 치면: for date in sorted(events_by_date): render_date(date)
    sections: list[str] = []

    for date_key in sorted(events_by_date.keys()):
        events: list = events_by_date[date_key]
        if not events:
            continue

        # ── 이벤트 레이아웃 계산 (겹침 컬럼 분할) ──────────────────
        # Python으로 치면: items = sorted(events, key=lambda e: time_to_min(e['start']))
        items_with_pos: list[dict] = []
        for ev in sorted(events, key=lambda e: time_to_min(e.get('start', '00:00'))):
            pos = event_top_height(ev)
            if pos:
                items_with_pos.append({'ev': ev, 'top': pos[0], 'height': pos[1], 'col': 0, 'total_cols': 1})

        # 겹치는 이벤트 컬럼 분할
        for i, cur in enumerate(items_with_pos):
            cols_used: list[int] = []
            for prev in items_with_pos[:i]:
                ps = time_to_min(prev['ev'].get('start', ''))
                pe = time_to_min(prev['ev'].get('end', ''))
                cs = time_to_min(cur['ev'].get('start', ''))
                ce = time_to_min(cur['ev'].get('end', ''))
                if ps < ce and pe > cs:
                    cols_used.append(prev['col'])
            col = 0
            while col in cols_used:
                col += 1
            cur['col'] = col
        max_cols = max((it['col'] for it in items_with_pos), default=0) + 1
        for it in items_with_pos:
            it['total_cols'] = max_cols

        # ── 이벤트 블록 HTML ────────────────────────────────────────
        event_blocks_html: list[str] = []
        for it in items_with_pos:
            ev       = it['ev']
            bg, fg   = COLOR_MAP.get(ev.get('color', 'blue'), ('#60a5fa', '#fff'))
            w_pct    = 100 / it['total_cols']
            l_pct    = it['col'] * w_pct
            done     = ev.get('done', False)
            opacity  = 'opacity:0.45;' if done else ''
            strike   = 'text-decoration:line-through;' if done else ''
            h_px     = it['height']
            title_style = f'font-size:11px;font-weight:600;line-height:1.2;margin:0;{strike}'
            time_html   = (
                f'<span style="font-size:9px;opacity:0.8;line-height:1.2;">'
                f'{ev.get("start","")}&ndash;{ev.get("end","")}</span>'
            ) if h_px > 32 else ''

            event_blocks_html.append(
                f'<div style="position:absolute;top:{it["top"]+1:.1f}px;height:{h_px-2:.1f}px;'
                f'left:calc({l_pct:.1f}% + 2px);width:calc({w_pct:.1f}% - 4px);'
                f'background:{bg};color:{fg};border-radius:8px;padding:3px 6px;'
                f'overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;'
                f'box-shadow:0 1px 3px rgba(0,0,0,.12);{opacity}">'
                f'<p style="{title_style}">{_html_mod.escape(ev.get("title",""))}</p>'
                f'{time_html}'
                f'</div>'
            )

        # ── 시간 레이블 ─────────────────────────────────────────────
        hour_labels_html: list[str] = []
        for i in range(TOTAL_H + 1):
            top_px = i * HOUR_PX - 6 if i > 0 else 2
            hour_labels_html.append(
                f'<div style="position:absolute;top:{top_px}px;right:0;width:100%;'
                f'text-align:right;padding-right:8px;font-size:10px;color:#9ca3af;line-height:1;">'
                f'{str(START_H + i).zfill(2)}:00</div>'
            )

        # ── 그리드 선 ───────────────────────────────────────────────
        grid_lines_html: list[str] = []
        for i in range(TOTAL_H):
            grid_lines_html.append(
                f'<div style="position:absolute;left:0;right:0;top:{i*HOUR_PX}px;'
                f'border-top:1px solid #f3f4f6;"></div>'
                f'<div style="position:absolute;left:0;right:0;top:{i*HOUR_PX+HOUR_PX//2}px;'
                f'border-top:1px dashed #f9fafb;"></div>'
            )

        # ── 우측 이벤트 목록 ────────────────────────────────────────
        # ── 우측 이벤트 목록 (details/summary로 상세 정보 펼치기) ───
        # Python으로 치면: for ev in sorted_events: render_list_item(ev)
        list_items_html: list[str] = []
        for ev in sorted(events, key=lambda e: time_to_min(e.get('start', '00:00'))):
            bg, _  = COLOR_MAP.get(ev.get('color', 'blue'), ('#60a5fa', '#fff'))
            done   = ev.get('done', False)
            strike = 'text-decoration:line-through;' if done else ''
            title  = _html_mod.escape(ev.get('title', ''))

            # 상세 데이터 수집 — or '' 로 null(None) 방어
            # Python으로 치면: clock_in = ev.get('clockIn') or '' (None 방어)
            clock_in   = ev.get('clockIn')  or ''
            clock_out  = ev.get('clockOut') or ''
            elapsed    = ev.get('elapsed')          # 분 단위 int|None
            log_text   = (ev.get('log') or '').strip()   # 자유 텍스트 기록
            subtasks   = ev.get('subtasks') or []   # [{text, done}]
            energy     = ev.get('energy')           # 1~5|None

            # 상세 내용이 하나라도 있으면 details 사용, 없으면 단순 div
            has_detail = bool(clock_in or clock_out or log_text or subtasks or energy)
            # 앱과 동일: log 또는 subtasks 있으면 주황 dot 표시
            # Python으로 치면: has_record = bool(log_text or subtasks)
            has_record = bool(log_text or subtasks)

            # ── 상세 블록 조립 ──────────────────────────────────────
            detail_parts: list[str] = []

            # 실제 시각 + 경과 시간
            if clock_in or clock_out or elapsed is not None:
                ci  = clock_in[:5]  if clock_in  else '–'   # HH:MM:SS → HH:MM
                co  = clock_out[:5] if clock_out else '–'
                el  = f'{elapsed}분' if elapsed is not None else ''
                detail_parts.append(
                    f'<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">'
                    f'<span style="font-size:10px;">⏱</span>'
                    f'<span style="font-size:10px;color:#6b7280;">{ci} – {co}'
                    f'{(" (" + el + ")") if el else ""}</span></div>'
                )

            # 집중도 (에너지 레벨 ★ 표시)
            if energy:
                stars = '★' * int(energy) + '☆' * (5 - int(energy))
                detail_parts.append(
                    f'<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">'
                    f'<span style="font-size:10px;">⚡</span>'
                    f'<span style="font-size:11px;color:#f59e0b;">{stars}</span></div>'
                )

            # 실제 수행 기록 (자유 텍스트)
            if log_text:
                log_escaped = _html_mod.escape(log_text).replace('\n', '<br>')
                detail_parts.append(
                    f'<div style="margin-bottom:4px;">'
                    f'<div style="font-size:10px;font-weight:600;color:#9ca3af;margin-bottom:2px;">📝 기록</div>'
                    f'<div style="font-size:11px;color:#374151;line-height:1.5;'
                    f'background:#f9fafb;border-radius:6px;padding:6px 8px;">'
                    f'{log_escaped}</div></div>'
                )

            # 서브태스크 체크리스트
            if subtasks:
                done_count = sum(1 for s in subtasks if s.get('done'))
                sub_items = ''.join(
                    f'<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">'
                    f'<span style="font-size:12px;color:{"#10b981" if s.get("done") else "#d1d5db"};">'
                    f'{"☑" if s.get("done") else "☐"}</span>'
                    f'<span style="font-size:11px;color:#374151;'
                    f'{"text-decoration:line-through;opacity:0.5;" if s.get("done") else ""}">'
                    f'{_html_mod.escape(s.get("text",""))}</span></div>'
                    for s in subtasks
                )
                detail_parts.append(
                    f'<div>'
                    f'<div style="font-size:10px;font-weight:600;color:#9ca3af;margin-bottom:2px;">'
                    f'☑ 서브태스크 ({done_count}/{len(subtasks)})</div>'
                    f'{sub_items}</div>'
                )

            detail_html = ''.join(detail_parts)

            # ── 헤더 (summary) 공통 부분 ───────────────────────────
            header_html = (
                f'<div style="display:flex;align-items:center;gap:8px;">'
                f'<div style="width:10px;height:10px;border-radius:50%;background:{bg};'
                f'flex-shrink:0;margin-top:1px;"></div>'
                f'<div style="flex:1;min-width:0;">'
                f'<div style="font-size:12px;font-weight:600;color:#374151;{strike}'
                f'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{title}</div>'
                f'<div style="font-size:10px;color:#9ca3af;">'
                f'{ev.get("start","")} – {ev.get("end","")}</div>'
                f'</div></div>'
            )

            # 항상 <details>로 렌더 — 상세 데이터 없을 시 "기록 없음" 표시
            # Python으로 치면: detail_html = detail_html or '<p>기록 없음</p>'
            if not has_detail:
                detail_html = (
                    f'<div style="font-size:11px;color:#9ca3af;font-style:italic;">기록 없음</div>'
                )

            # 헤더 우측 ▸ 표시 — 클릭 가능함을 시각적으로 안내
            # has_record 시 앱과 동일하게 제목 옆 주황 dot 렌더
            record_dot_html = (
                '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;'
                'background:#fb923c;flex-shrink:0;vertical-align:middle;margin-left:4px;"></span>'
            ) if has_record else ''
            header_html_clickable = (
                f'<div style="display:flex;align-items:center;gap:8px;">'
                f'<div style="width:10px;height:10px;border-radius:50%;background:{bg};'
                f'flex-shrink:0;margin-top:1px;"></div>'
                f'<div style="flex:1;min-width:0;">'
                f'<div style="display:flex;align-items:center;gap:4px;">'
                f'<span style="font-size:12px;font-weight:600;color:#374151;{strike}'
                f'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{title}</span>'
                f'{record_dot_html}'
                f'</div>'
                f'<div style="font-size:10px;color:#9ca3af;">'
                f'{ev.get("start","")} – {ev.get("end","")}</div>'
                f'</div>'
                f'<span style="font-size:10px;color:#d1d5db;flex-shrink:0;">▸</span>'
                f'</div>'
            )

            list_items_html.append(
                f'<details style="border-bottom:1px solid #f3f4f6;padding:5px 0;">'
                f'<summary style="list-style:none;cursor:pointer;'
                f'-webkit-appearance:none;-moz-appearance:none;outline:none;'
                f'user-select:none;">'
                f'{header_html_clickable}'
                f'</summary>'
                f'<div style="margin:6px 0 4px 18px;padding:8px;'
                f'background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">'
                f'{detail_html}'
                f'</div>'
                f'</details>'
            )

        sections.append(f'''
<div class="dp-section" style="margin-bottom:32px;">
  <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">
    {_html_mod.escape(date_key)}
  </div>
  <div style="display:flex;height:680px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;">
    <!-- 타임라인 영역 -->
    <div style="flex:1;overflow-y:auto;display:flex;">
      <!-- 시간 레이블 열 -->
      <div style="width:48px;flex-shrink:0;position:relative;height:{TOTAL_PX}px;">
        {"".join(hour_labels_html)}
      </div>
      <!-- 그리드 + 이벤트 -->
      <div style="flex:1;position:relative;border-left:1px solid #e5e7eb;height:{TOTAL_PX}px;">
        {"".join(grid_lines_html)}
        {"".join(event_blocks_html)}
      </div>
    </div>
    <!-- 이벤트 목록 (우측, 독립 스크롤) -->
    <div style="width:220px;flex-shrink:0;border-left:1px solid #e5e7eb;overflow-y:auto;padding:12px;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;">일정 목록</div>
      {"".join(list_items_html) if list_items_html else '<p style="font-size:12px;color:#9ca3af;">일정 없음</p>'}
    </div>
  </div>
</div>''')

    return "\n".join(sections) if sections else '<p><em>[일정표 — 등록된 일정 없음]</em></p>'


def _blocks_to_html(blocks: list, page_date: str = '') -> str:
    """
    블록 배열 → HTML 문자열 변환 (재귀)
    Python으로 치면: def blocks_to_html(blocks, page_date='') -> str: ...
    page_date: 'YYYY-MM-DD' — 일간 노트 제목에서 추출, dayPlanner 날짜 필터에 사용
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
            inner = _blocks_to_html(children, page_date) if children else ''
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
                    width = data.get("width") if isinstance(data, dict) else None
                    if isinstance(data, dict) and isinstance(data.get("images"), list):
                        image_items = data["images"]
                    else:
                        image_items = [{
                            "src": data.get("src", content) if isinstance(data, dict) else content,
                            "caption": data.get("caption", "") if isinstance(data, dict) else "",
                        }]
                except Exception:
                    width = None
                    image_items = [{"src": content, "caption": ""}]

                rendered_images = []
                for item in image_items:
                    if not isinstance(item, dict):
                        continue
                    src = item.get("src", "")
                    caption = item.get("caption", "")
                    if not isinstance(src, str) or not src:
                        continue
                    if not isinstance(caption, str):
                        caption = ""

                    static_match = re.search(r'http://(?:127\.0\.0\.1|localhost):8000/static/(.+)', src)
                    if static_match:
                        b64 = _url_to_base64(static_match.group(1))
                        if b64:
                            src = b64
                    width_attr = f' width="{width}"' if width else ' style="max-width:100%"'
                    img_tag = f'<img src="{src}"{width_attr} alt="{_html_mod.escape(caption)}">'
                    if caption:
                        rendered_images.append(
                            f'<figure>{img_tag}<figcaption>{_html_mod.escape(caption)}</figcaption></figure>'
                        )
                    else:
                        rendered_images.append(img_tag)

                if not rendered_images:
                    parts.append('<p><em>[빈 이미지 블록]</em></p>')
                else:
                    parts.extend(rendered_images)

        elif btype == "video":
            # Python으로 치면: data = json.loads(content); src, width = data['src'], data.get('width')
            try:
                data = json.loads(content) if isinstance(content, str) else {}
                src = data.get("src", "")
                vid_width = data.get("width")
            except Exception:
                src = content
                vid_width = None
            b64 = _url_to_base64(re.sub(r'http://(?:127\.0\.0\.1|localhost):8000/static/', '', src)) if src else None
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

        elif btype == "record":
            # 날짜 기록 헤더 — 아래 일반 블록과 같은 문서 흐름을 유지
            try:
                data = json.loads(content) if isinstance(content, str) else {}
            except Exception:
                data = {}
            date_text = _html_mod.escape(str(data.get("date", "")))
            kind_text = _html_mod.escape(str(data.get("kind", "")))
            title_text = _html_mod.escape(str(data.get("title", "")))
            meta = " · ".join(part for part in (date_text, kind_text) if part)
            title_html = f'<strong>{title_text}</strong>' if title_text else ''
            block_id = _html_mod.escape(str(block.get("id", "")))
            parts.append(
                f'<div class="record-header" id="record-{block_id}">'
                f'<span class="record-meta">📅 {meta}</span>{title_html}</div>'
            )

        elif btype in ("dayPlanner", "dayplanner"):
            # page_date 전달 → 해당 날짜만 렌더 (일간 노트 내보내기)
            # Python으로 치면: parts.append(render_planner(content, page_date))
            parts.append(_dayplanner_to_html(content, target_date=page_date))

        else:
            parts.append(f'<p>{content}</p>')

        # 토글이 아닌 블록에 자식 블록이 있을 경우 재귀 렌더
        # Python으로 치면: if children and btype != 'toggle': append(blocks_to_html(children))
        if btype != "toggle" and block.get("children"):
            parts.append(f'<div class="block-children">{_blocks_to_html(block["children"], page_date)}</div>')

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
    .record-header {{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border: 1px solid #e0e0e0; background: #f8f8f8; border-radius: 8px; padding: 10px 12px; margin: 1.2em 0 0.6em; }}
    .record-meta {{ color: #666; font-size: 0.9em; }}
    .period-summary {{ display:flex; justify-content:space-between; gap:12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 12px; margin:1em 0; color:#9a3412; }}
    .period-day {{ margin:2em 0; }}
    .record-source {{ border-top:1px solid #e5e7eb; margin-top:1.5em; padding-top:.8em; }}
    .record-source > h3 {{ color:#6b7280; font-size:1em; margin:.2em 0 .8em; }}
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


def _slice_blocks_for_record(blocks: list, record_id: str) -> Optional[list]:
    """선택한 최상위 기록 헤더부터 다음 기록 헤더 직전까지 반환한다."""
    start_index = next(
        (
            index for index, block in enumerate(blocks)
            if block.get("type") == "record" and block.get("id") == record_id
        ),
        None,
    )
    if start_index is None:
        return None

    end_index = next(
        (
            index for index in range(start_index + 1, len(blocks))
            if blocks[index].get("type") == "record"
        ),
        len(blocks),
    )
    return blocks[start_index:end_index]


def _collect_period_export_items(
    pages: list[dict], start_date: str, end_date: str,
) -> tuple[dict[str, list], list[dict]]:
    """볼트 페이지에서 기간 내 일정과 기록 범위를 읽기 전용으로 집계한다."""
    events_by_identity: dict[str, dict] = {}
    records: list[dict] = []

    for page in pages:
        blocks = page.get("blocks", [])
        for block in blocks:
            if block.get("type") in ("dayPlanner", "dayplanner"):
                try:
                    planner_data = json.loads(block.get("content", "{}"))
                except Exception:
                    planner_data = {}
                events_by_date = planner_data.get("eventsByDate", {})
                if not events_by_date and planner_data.get("date") and isinstance(planner_data.get("events"), list):
                    events_by_date = {planner_data["date"]: planner_data["events"]}
                for date_key, events in events_by_date.items():
                    if not (start_date <= date_key <= end_date) or not isinstance(events, list):
                        continue
                    for event in events:
                        if not isinstance(event, dict) or not isinstance(event.get("id"), str):
                            continue
                        identity = f'{date_key}:{event["id"]}'
                        events_by_identity.setdefault(identity, {"date": date_key, "event": event})

            if block.get("type") != "record":
                continue
            try:
                record_data = json.loads(block.get("content", "{}"))
            except Exception:
                record_data = {}
            date_key = record_data.get("date", "")
            if not isinstance(date_key, str) or not (start_date <= date_key <= end_date):
                continue
            record_blocks = _slice_blocks_for_record(blocks, block.get("id", ""))
            if record_blocks is None:
                continue
            records.append({
                "date": date_key,
                "pageId": page.get("id", ""),
                "pageTitle": page.get("title", "제목 없음"),
                "pageIcon": page.get("icon", "📝"),
                "blocks": record_blocks,
            })

    events_by_date: dict[str, list] = {}
    for item in events_by_identity.values():
        events_by_date.setdefault(item["date"], []).append(item["event"])
    for events in events_by_date.values():
        events.sort(key=lambda event: (event.get("start", ""), event.get("title", "")))
    records.sort(key=lambda record: (record["date"], record["pageTitle"], record["pageId"]))
    return events_by_date, records


def _load_all_export_pages() -> list[dict]:
    index = load_index()
    folder_map = index.get("folderMap", {})
    category_map = index.get("categoryMap", {})
    categories = {category["id"]: category["folderName"] for category in index.get("categories", [])}
    pages: list[dict] = []
    for page_id in index.get("pageOrder", []):
        folder_name = folder_map.get(page_id)
        if not folder_name:
            continue
        cat_folder = categories.get(category_map.get(page_id))
        page_dir = get_vault_dir() / cat_folder / folder_name if cat_folder else get_vault_dir() / folder_name
        content_path = resolve_content_file(page_dir)
        if not content_path.exists():
            continue
        try:
            pages.append(json.loads(content_path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            continue
    return pages


@router.get("/export/planner-period")
def export_planner_period(start_date: str, end_date: str, label: str = ''):
    """현재 볼트의 일정과 기록을 최대 31일 범위의 단일 HTML로 출력한다."""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD여야 합니다") from exc
    if end < start or (end - start).days > 30:
        raise HTTPException(status_code=400, detail="출력 범위는 1일부터 31일까지 가능합니다")

    pages = _load_all_export_pages()
    events_by_date, records = _collect_period_export_items(pages, start_date, end_date)
    records_by_date: dict[str, list[dict]] = {}
    for record in records:
        records_by_date.setdefault(record["date"], []).append(record)

    dates = sorted(set(events_by_date) | set(records_by_date))
    body_parts = [
        f'<div class="period-summary"><strong>{_html_mod.escape(start_date)} – {_html_mod.escape(end_date)}</strong>',
        f'<span>일정 {sum(len(events) for events in events_by_date.values())}개 · 기록 {len(records)}개</span></div>',
    ]
    for date_key in dates:
        body_parts.append(f'<section class="period-day"><h2>{_html_mod.escape(date_key)}</h2>')
        if events_by_date.get(date_key):
            planner_content = json.dumps({"eventsByDate": {date_key: events_by_date[date_key]}}, ensure_ascii=False)
            body_parts.append(_dayplanner_to_html(planner_content, target_date=date_key))
        for record in records_by_date.get(date_key, []):
            source = f'{record["pageIcon"]} {record["pageTitle"]}'
            body_parts.append(
                f'<section class="record-source"><h3>{_html_mod.escape(source)}</h3>'
                f'{_blocks_to_html(record["blocks"], date_key)}</section>'
            )
        body_parts.append('</section>')
    if not dates:
        body_parts.append('<p><em>이 기간에 일정이나 기록이 없습니다.</em></p>')

    exported_blocks = [block for record in records for block in record["blocks"]]
    has_math = any(block.get("type") == "math" and block.get("content", "").strip() for block in exported_blocks)
    has_mermaid = any(block.get("type") == "mermaid" and block.get("content", "").strip() for block in exported_blocks)
    title = label.strip() or (start_date if start_date == end_date else f"{start_date} ~ {end_date}")
    html_doc = _make_html_doc(
        _html_mod.escape(title), "📅", "\n".join(body_parts), has_math, has_mermaid,
    )
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title).strip() or "planner-period"
    encoded_filename = urllib.parse.quote(f"{filename}.html", safe='')
    return StreamingResponse(
        io.BytesIO(html_doc.encode("utf-8")),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )


@router.get("/export/html/{page_id}")
def export_html(page_id: str, date: str = '', record_id: str = ''):
    """
    단일 페이지를 자기완결형 HTML 파일로 내보내기
    이미지·비디오는 base64로 인라인 임베딩
    date: 'YYYY-MM-DD' — 프론트엔드가 전달하는 DayPlanner 표시 날짜 필터
    record_id: 지정 시 해당 최상위 기록 헤더부터 다음 기록 헤더 직전까지만 출력
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
        content_path = resolve_content_file(get_vault_dir() / cat_folder / folder_name)
    else:
        content_path = resolve_content_file(get_vault_dir() / folder_name)

    if not content_path.exists():
        raise HTTPException(status_code=404, detail="페이지 파일을 찾을 수 없습니다")

    page_data = json.loads(content_path.read_text(encoding="utf-8"))
    title = page_data.get("title", "제목 없음")
    icon = page_data.get("icon", "📝")
    blocks = page_data.get("blocks", [])

    if record_id:
        record_blocks = _slice_blocks_for_record(blocks, record_id)
        if record_blocks is None:
            raise HTTPException(status_code=404, detail="기록 헤더를 찾을 수 없습니다")
        blocks = record_blocks

        # 직접 API를 호출해 date를 생략해도 선택한 기록 날짜의 일정이 출력되게 한다.
        if not date:
            try:
                record_data = json.loads(blocks[0].get("content", "{}"))
                record_date = record_data.get("date", "")
                if isinstance(record_date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", record_date):
                    date = record_date
            except Exception:
                pass

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

    # 쿼리 파라미터 date 우선, 없으면 제목에서 추출 (폴백)
    # Python으로 치면: page_date = date or re.search(r'\d{4}-\d{2}-\d{2}', title).group(1) or ''
    if date:
        page_date: str = date
    else:
        _m = re.search(r'(\d{4}-\d{2}-\d{2})', title)
        page_date = _m.group(1) if _m else ''

    body_html = _blocks_to_html(blocks, page_date)
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
# PDF 내보내기 (xhtml2pdf — 서버사이드)
# -----------------------------------------------

def _find_korean_font() -> "Path | None":
    """
    한국어 TTF 폰트 파일 경로 탐색 (OS별)
    Python으로 치면: next((p for p in candidates if p.exists()), None)
    """
    candidates = [
        Path("C:/Windows/Fonts/malgun.ttf"),                                       # Windows — 맑은 고딕
        Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),                        # macOS
        Path("/System/Library/Fonts/AppleGothic.ttf"),                             # macOS 구버전
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),            # Linux (Ubuntu)
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),            # Linux (Debian)
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _patch_xhtml2pdf_named_tmp_file() -> None:
    """
    Windows에서 NamedTemporaryFile(delete=True) 잠금 문제 패치
    xhtml2pdf의 get_named_tmp_file이 임시 TTF 파일을 열어둔 채 ReportLab에 전달하면
    Windows는 같은 파일을 두 번 열 수 없어 PermissionError 발생
    → delete=False + close() 로 잠금 해제 후 ReportLab이 열 수 있게 함
    Python으로 치면: monkeypatch(BaseFile.get_named_tmp_file)
    """
    import sys
    if sys.platform != "win32":
        return
    try:
        import tempfile as _tempfile
        from xhtml2pdf import files as _xfiles

        def _win32_get_named_tmp_file(self):
            # Python으로 치면: def get_named_tmp_file(self): ...
            data = self.get_data()
            # delete=False: 파일 닫은 뒤에도 존재 → ReportLab이 이름으로 열 수 있음
            tmp = _tempfile.NamedTemporaryFile(suffix=self.suffix, delete=False)
            if data:
                tmp.write(data)
                tmp.flush()
            tmp.close()  # 닫아야 ReportLab이 같은 경로를 open() 할 수 있음
            _xfiles.files_tmp.append(tmp)
            if self.path is None:
                self.path = tmp.name
            return tmp

        _xfiles.BaseFile.get_named_tmp_file = _win32_get_named_tmp_file
    except Exception:
        pass  # 패치 실패해도 계속 진행 (폰트만 깨질 뿐 PDF는 생성됨)


def _sanitize_css_for_pdf(html_str: str) -> str:
    """
    xhtml2pdf가 처리할 수 없는 CSS 함수(calc, min, max 등)를 제거/치환
    Python으로 치면: def sanitize_css(html): re.sub(...)
    — calc(X% ± Ypx) → X%  /  나머지 calc() → 프로퍼티 통째 제거
    """
    # calc(숫자% 연산자 ...) → 숫자%  예: width:calc(33.3% - 4px) → width:33.3%
    html_str = re.sub(
        r'([\w-]+)\s*:\s*calc\((\d+(?:\.\d+)?)%[^)]*\)',
        lambda m: f"{m.group(1)}:{m.group(2)}%",
        html_str,
    )
    # 그 외 남은 calc() 표현식 — 속성 전체 제거
    html_str = re.sub(r'[\w-]+\s*:\s*calc\([^)]*\)\s*;?', '', html_str)
    # min-width:0 / min-width:0px — xhtml2pdf 파서가 건너뜀; 제거
    html_str = re.sub(r'min-width\s*:\s*0\w*\s*;?', '', html_str)
    return html_str


def _make_pdf_html(title: str, icon: str, body_html: str, font_path: "Path | None" = None) -> str:
    """
    xhtml2pdf 전용 간소화 HTML 생성
    — @font-face src에 폰트 파일 경로 직접 명시 (패치 후 temp 파일 없이 로드됨)
    Python으로 치면: def make_pdf_html(title, body): return f'<html>...'
    """
    if font_path:
        # Windows 경로를 CSS url()에 쓰려면 슬래시로 변환
        font_path_str = font_path.as_posix()
        font_face_css = f"@font-face {{ font-family: 'KR'; src: url('{font_path_str}'); }}"
        body_font_family = "'KR', Arial, sans-serif"
    else:
        font_face_css = ""
        body_font_family = "Arial, sans-serif"

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <style>
    {font_face_css}
    @page {{ margin: 1.5cm 2cm; }}
    body {{
      font-family: {body_font_family};
      font-size: 11pt;
      line-height: 1.7;
      color: #1a1a1a;
    }}
    h1 {{ font-size: 22pt; margin-bottom: 8pt; }}
    h2 {{ font-size: 16pt; margin-top: 14pt; }}
    h3 {{ font-size: 13pt; margin-top: 11pt; }}
    h4, h5, h6 {{ font-size: 11pt; margin-top: 9pt; font-weight: bold; }}
    p {{ margin: 5pt 0; }}
    ul, ol {{ padding-left: 18pt; }}
    li {{ margin: 3pt 0; }}
    pre {{
      background: #f5f5f5;
      border: 1pt solid #ddd;
      border-radius: 4pt;
      padding: 8pt 10pt;
      font-size: 9pt;
      font-family: 'Courier New', monospace;
    }}
    blockquote {{
      border-left: 3pt solid #ccc;
      margin: 0;
      padding-left: 10pt;
      color: #555;
    }}
    hr {{ border: none; border-top: 1pt solid #ddd; margin: 10pt 0; }}
    img {{ max-width: 100%; }}
    table {{ border-collapse: collapse; width: 100%; margin: 8pt 0; }}
    th, td {{ border: 1pt solid #ddd; padding: 5pt 8pt; text-align: left; }}
    th {{ background: #f0f0f0; font-weight: bold; }}
    .admonition {{ border-left: 3pt solid #7c3aed; background: #f5f3ff; padding: 8pt 10pt; margin: 8pt 0; }}
    .block-children {{ padding-left: 14pt; border-left: 2pt solid #e0e0e0; margin: 4pt 0; }}
    .layout-row {{ margin: 8pt 0; }}
    .layout-col {{ margin-bottom: 6pt; }}
    .kanban-col {{ margin-bottom: 8pt; }}
    .task-item {{ margin: 3pt 0; }}
    details summary {{ font-weight: bold; }}
  </style>
</head>
<body>
  <h1>{icon} {title}</h1>
  {body_html}
</body>
</html>"""


@router.get("/export/pdf/{page_id}")
def export_pdf(page_id: str):
    """
    단일 페이지를 서버사이드 PDF로 내보내기 (xhtml2pdf)
    이미지는 base64로 인라인 임베딩
    Python으로 치면: return send_file(pdf_bytes, filename='{title}.pdf')
    """
    # xhtml2pdf 임포트 — 미설치 시 503 반환
    # Python으로 치면: try: import pisa except ImportError: raise HTTPException(503)
    try:
        from xhtml2pdf import pisa  # type: ignore
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="xhtml2pdf 패키지가 설치되지 않았습니다. pip install xhtml2pdf 후 재시작하세요."
        )

    validate_uuid(page_id, "page_id")

    # 페이지 파일 경로 조회
    # Python으로 치면: folder = index['folderMap'][page_id]
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
        content_path = resolve_content_file(get_vault_dir() / cat_folder / folder_name)
    else:
        content_path = resolve_content_file(get_vault_dir() / folder_name)

    if not content_path.exists():
        raise HTTPException(status_code=404, detail="페이지 파일을 찾을 수 없습니다")

    page_data = json.loads(content_path.read_text(encoding="utf-8"))
    title = page_data.get("title", "제목 없음")
    icon = page_data.get("icon", "📝")
    blocks = page_data.get("blocks", [])

    # Windows NamedTemporaryFile 잠금 패치 적용 (폰트 로딩용)
    # Python으로 치면: monkeypatch_xhtml2pdf()
    _patch_xhtml2pdf_named_tmp_file()
    font_path = _find_korean_font()

    # HTML 생성 (기존 _blocks_to_html 재사용)
    # Python으로 치면: body = blocks_to_html(blocks)
    body_html = _blocks_to_html(blocks)
    html_str = _make_pdf_html(title, icon, body_html, font_path)
    # xhtml2pdf 미지원 CSS 함수(calc 등) 제거
    html_str = _sanitize_css_for_pdf(html_str)

    # xhtml2pdf로 HTML → PDF 변환
    # Python으로 치면: pisa.CreatePDF(html, dest=pdf_buffer)
    pdf_buffer = io.BytesIO()
    result = pisa.CreatePDF(
        src=html_str,
        dest=pdf_buffer,
        encoding="utf-8",
    )

    if result.err:
        raise HTTPException(status_code=500, detail=f"PDF 변환 오류: {result.err}")

    pdf_buffer.seek(0)

    # 파일명 RFC 5987 인코딩 (한국어 지원)
    # Python으로 치면: encoded = urllib.parse.quote(f'{title}.pdf')
    safe_title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', title).strip() or "export"
    encoded_filename = urllib.parse.quote(f"{safe_title}.pdf", safe='')
    content_disposition = f"attachment; filename*=UTF-8''{encoded_filename}"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
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
    backup_dir = get_vault_dir().parent / f"vault_bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if get_vault_dir().exists():
        shutil.copytree(str(get_vault_dir()), str(backup_dir))

    try:
        # vault 초기화 (이미지 제외)
        for item in get_vault_dir().iterdir():
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
                target_dir = get_vault_dir() / cat_folder / folder_name
            else:
                target_dir = get_vault_dir() / folder_name

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
            shutil.rmtree(str(get_vault_dir()))
            shutil.copytree(str(backup_dir), str(get_vault_dir()))
            shutil.rmtree(str(backup_dir))
        raise

    except Exception as exc:
        # 실패 시 백업에서 롤백
        if backup_dir.exists():
            shutil.rmtree(str(get_vault_dir()))
            shutil.copytree(str(backup_dir), str(get_vault_dir()))
            shutil.rmtree(str(backup_dir))
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# -----------------------------------------------
# 병합 가져오기 — 기존 데이터 유지하면서 새 페이지만 추가
# -----------------------------------------------

@router.post("/import/merge")
def import_merge(body: ImportBody):
    """
    다른 컴퓨터의 백업 JSON을 현재 vault에 병합
    - 동일한 page ID가 이미 있으면 스킵 (로컬 버전 유지)
    - 새 페이지만 추가
    - 카테고리도 ID 기준으로 병합 (없는 것만 추가)
    Python으로 치면: for page in backup: if page.id not in local: add(page)
    """
    data = body.data
    imported_index = data.get("index", {})
    imported_pages = data.get("pages", [])

    # 현재 vault 인덱스 로드
    # Python으로 치면: current = json.load(open('_index.nct'))
    current_index = load_index()

    current_folder_map: dict = current_index.get("folderMap", {})
    current_page_order: list = current_index.get("pageOrder", [])
    current_category_map: dict = current_index.get("categoryMap", {})
    current_categories: list = current_index.get("categories", [])
    current_category_ids = {c["id"] for c in current_categories}

    imported_folder_map: dict = imported_index.get("folderMap", {})
    imported_category_map: dict = imported_index.get("categoryMap", {})
    imported_categories: list = imported_index.get("categories", [])

    added_pages = 0
    skipped_pages = 0
    added_categories = 0

    # ── 1. 새 카테고리 병합 ──────────────────────────
    # Python으로 치면: for cat in imported: if cat.id not in current: add(cat)
    for cat in imported_categories:
        cat_id = cat.get("id", "")
        if not cat_id or cat_id in current_category_ids:
            continue
        cat_folder = cat.get("folderName", "")
        if not cat_folder:
            continue
        # 카테고리 폴더 생성 (없으면)
        cat_dir = get_vault_dir() / cat_folder
        assert_inside_vault(cat_dir)
        cat_dir.mkdir(parents=True, exist_ok=True)
        current_categories.append(cat)
        current_category_ids.add(cat_id)
        added_categories += 1

    # ── 2. 새 페이지 병합 ───────────────────────────
    # Python으로 치면: for page in imported_pages: if page.id not in current_folder_map: add(page)
    for page_data in imported_pages:
        page_id = page_data.get("id", "")
        if not page_id:
            continue

        # 이미 존재하는 페이지면 스킵 (로컬 버전 유지)
        # Python으로 치면: if page_id in current_folder_map: continue
        if page_id in current_folder_map:
            skipped_pages += 1
            continue

        folder_name = imported_folder_map.get(page_id, page_data.get("folder", ""))
        if not folder_name:
            skipped_pages += 1
            continue

        cat_id = imported_category_map.get(page_id)
        cat_folder = None
        if cat_id:
            # 병합된 카테고리 목록에서 폴더명 조회
            # Python으로 치면: cat_folder = next(c['folderName'] for c in current_categories if c['id'] == cat_id)
            for c in current_categories:
                if c["id"] == cat_id:
                    cat_folder = c.get("folderName")
                    break

        if cat_folder:
            target_dir = get_vault_dir() / cat_folder / folder_name
        else:
            target_dir = get_vault_dir() / folder_name

        # 🔒 vault 탈출 방지
        assert_inside_vault(target_dir)

        # 페이지 파일 저장
        save_page_to_disk(page_data, target_dir)

        # 인덱스에 추가
        current_folder_map[page_id] = folder_name
        current_page_order.append(page_id)
        if cat_id:
            current_category_map[page_id] = cat_id
        added_pages += 1

    # ── 3. 업데이트된 인덱스 저장 ────────────────────
    # Python으로 치면: json.dump(updated_index, open('_index.nct', 'w'))
    current_index["folderMap"] = current_folder_map
    current_index["pageOrder"] = current_page_order
    current_index["categoryMap"] = current_category_map
    current_index["categories"] = current_categories
    save_index(current_index)

    return {
        "ok": True,
        "added_pages": added_pages,
        "skipped_pages": skipped_pages,
        "added_categories": added_categories,
    }
