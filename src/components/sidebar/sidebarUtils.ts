// =============================================
// src/components/sidebar/sidebarUtils.ts
// 역할: 사이드바 공용 상수 + 유틸 함수
// Python으로 치면: sidebar_utils.py
// =============================================

import { Page } from '@/types/block'

// -----------------------------------------------
// 깊이별 색상 스키마 — 폴더 아이콘/텍스트/배경에 적용
// Python으로 치면: DEPTH_STYLES: list[dict] = [...]
// -----------------------------------------------
export const DEPTH_STYLES = [
  // depth 0: 최상위 — 모노크롬, 살짝 굵은 폰트
  { dot: '', folder: 'text-gray-400', normal: 'font-medium text-gray-700 hover:bg-gray-100', selected: 'bg-gray-200 text-gray-900 font-medium', over: 'bg-blue-50 text-blue-700' },
  // depth 1 — 모노크롬
  { dot: 'bg-gray-300', folder: 'text-gray-400', normal: 'text-gray-600 hover:bg-gray-100', selected: 'bg-gray-200 text-gray-900', over: 'bg-blue-50 text-blue-700' },
  // depth 2 — 모노크롬
  { dot: 'bg-gray-300', folder: 'text-gray-400', normal: 'text-gray-600 hover:bg-gray-100', selected: 'bg-gray-200 text-gray-900', over: 'bg-blue-50 text-blue-700' },
  // depth 3+ — 모노크롬
  { dot: 'bg-gray-300', folder: 'text-gray-400', normal: 'text-gray-600 hover:bg-gray-100', selected: 'bg-gray-200 text-gray-900', over: 'bg-blue-50 text-blue-700' },
] as const

// -----------------------------------------------
// 트리 가이드 라인 색상 — depth별 수직선 색
// Python으로 치면: GUIDE_COLORS = {0: gray, 1: gray, ...}
// -----------------------------------------------
export const GUIDE_COLORS = ['#d1d5db', '#d1d5db', '#d1d5db', '#d1d5db'] as const

// -----------------------------------------------
// 폴더 색상 팔레트 — 그룹별 구조 (기본 / 파스텔 / 형광)
// null = 기본 (depth 색상 자동 적용)
// Python으로 치면: FOLDER_COLOR_GROUPS = [{'id': 'colorGroupBasic', 'colors': [...]}, ...]
// -----------------------------------------------
export const FOLDER_COLOR_GROUPS: { id: string; colors: (string | null)[] }[] = [
  {
    id: 'colorGroupBasic',
    colors: [
      null,       // 기본 (depth 색상)
      '#6b7280',  // 회색
      '#ef4444',  // 빨강
      '#f97316',  // 주황
      '#eab308',  // 노랑
      '#22c55e',  // 초록
      '#3b82f6',  // 파랑
      '#8b5cf6',  // 보라
      '#ec4899',  // 핑크
    ],
  },
  {
    id: 'colorGroupPastel',
    colors: [
      '#fca5a5',  // 파스텔 빨강
      '#fdba74',  // 파스텔 주황
      '#fde68a',  // 파스텔 노랑
      '#86efac',  // 파스텔 초록
      '#93c5fd',  // 파스텔 파랑
      '#c4b5fd',  // 파스텔 보라
      '#f9a8d4',  // 파스텔 핑크
      '#d1d5db',  // 파스텔 회색
    ],
  },
  {
    id: 'colorGroupNeon',
    colors: [
      '#ff4d4d',  // 형광 빨강
      '#ff8c00',  // 형광 주황
      '#ffd700',  // 형광 노랑
      '#00e676',  // 형광 초록
      '#2979ff',  // 형광 파랑
      '#d500f9',  // 형광 보라
      '#ff4081',  // 형광 핑크
      '#00e5ff',  // 형광 청록
    ],
  },
]

// -----------------------------------------------
// HTML 태그 제거 + 엔티티 디코딩 — 페이지 검색/템플릿 저장용 텍스트 추출
// &amp; &lt; &gt; &nbsp; 등을 실제 문자로 변환
// Python으로 치면: def strip_html(html): return html2text(html).strip()
// -----------------------------------------------
export function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 페이지 블록 전체 텍스트 추출 (검색용)
// Python으로 치면: def get_page_text(page): return ' '.join(b.text for b in page.blocks)
export function getPageSearchText(page: Page): string {
  return page.blocks.map(b => {
    if (b.type === 'image') return ''
    if (b.type === 'toggle') {
      try {
        const p = JSON.parse(b.content)
        return stripHtml(p.header || '') + ' ' + stripHtml(p.body || '')
      } catch { return '' }
    }
    return stripHtml(b.content)
  }).join(' ')
}

// 페이지 블록 → 마크다운 (템플릿 저장용)
// Python으로 치면: def blocks_to_markdown(page): ...
export function blocksToMarkdown(page: Page): string {
  const lines: string[] = []
  for (const block of page.blocks) {
    // toggle 블록은 content가 JSON {"header":"...","body":"..."} 형식
    // Python으로 치면: if block.type == 'toggle': parse_json(block.content)
    if (block.type === 'toggle') {
      try {
        const parsed = JSON.parse(block.content)
        const header = (parsed.header || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        const body = (parsed.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        if (header) lines.push(`> ${header}`)
        if (body) lines.push(body)
      } catch {
        // JSON 파싱 실패 시 무시
      }
      continue
    }
    const text = block.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    switch (block.type) {
      case 'heading1':    lines.push(`# ${text}`); break
      case 'heading2':    lines.push(`## ${text}`); break
      case 'heading3':    lines.push(`### ${text}`); break
      case 'heading4':    lines.push(`#### ${text}`); break
      case 'heading5':    lines.push(`##### ${text}`); break
      case 'heading6':    lines.push(`###### ${text}`); break
      case 'divider':     lines.push('---'); break
      case 'code':        lines.push(`\`\`\`\n${text}\n\`\`\``); break
      case 'bulletList':   if (text) lines.push(`- ${text}`); break
      case 'orderedList':  if (text) lines.push(`1. ${text}`); break
      case 'admonition':   if (text) lines.push(`> 💡 ${text}`); break
      case 'taskList':     if (text) lines.push(`- [ ] ${text}`); break
      case 'paragraph':   if (text) lines.push(text); break
      default:            if (text) lines.push(text)
    }
  }
  return lines.join('\n\n')
}
