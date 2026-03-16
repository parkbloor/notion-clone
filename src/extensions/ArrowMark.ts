// =============================================
// src/extensions/ArrowMark.ts
// 역할: 단어/문구에 화살표 마커를 부착하는 Tiptap Mark 확장
//
// 속성 (옵시디언 arrows 플러그인 문법 참고):
//   arrowId    : 화살표 식별자 — 같은 ID의 start/end 쌍이 연결됨 (1:N 분기 지원)
//   isStart    : true = 시작점, false = 끝점
//   color      : CSS 색상 (예: red, #ff0000, blue)
//   opacity    : 0~1 투명도 (기본 1)
//   arrowType  : 'margin' (여백 호) | 'diagonal' (대각 직선)  기본 margin
//   xPosition  : 0~30, margin 화살표 좌측 여백 위치 (기본 0)
//   startHead  : 시작점에도 화살촉 추가 여부 (기본 false)
//   endHead    : 끝점 화살촉 표시 여부 (기본 true)
//
// Python으로 치면: class ArrowMark(Mark): name = 'arrowMark'
// =============================================

import { Mark, mergeAttributes } from '@tiptap/core'

// -----------------------------------------------
// 화살표 색상 프리셋 (이름 → HEX)
// Python으로 치면: ARROW_COLORS: dict[str, str] = {...}
// -----------------------------------------------
export const ARROW_COLORS: Record<string, string> = {
  blue:   '#3b82f6',
  red:    '#ef4444',
  green:  '#16a34a',
  purple: '#a855f7',
  orange: '#f97316',
}

// 색상 이름 목록 (BubbleMenu 피커용)
export const ARROW_COLOR_NAMES = Object.keys(ARROW_COLORS) as Array<keyof typeof ARROW_COLORS>

// -----------------------------------------------
// ArrowMark — Tiptap Mark 확장
// BubbleMenuBar에서는 editor.chain().setMark('arrowMark', attrs)로 직접 호출
// Python으로 치면: class ArrowMark(Mark): name = 'arrowMark'
// -----------------------------------------------
export const ArrowMark = Mark.create({
  name: 'arrowMark',

  // 다른 mark와 공존 (bold, italic 등과 중복 적용 가능)
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      // ── 필수 속성 ─────────────────────────────
      // 화살표 식별자 — 같은 ID의 start/end가 한 쌍 (end는 여러 개 가능)
      arrowId: {
        default: null,
        parseHTML: el => el.getAttribute('data-arrow-id'),
        renderHTML: attrs => ({ 'data-arrow-id': attrs.arrowId }),
      },
      // 시작점 여부 (false = 끝점, 여러 끝점이 같은 arrowId 공유 가능)
      isStart: {
        default: false,
        parseHTML: el => el.getAttribute('data-arrow-start') === 'true',
        renderHTML: attrs => ({ 'data-arrow-start': String(attrs.isStart) }),
      },
      // CSS 색상 (이름 또는 HEX)
      // Python으로 치면: color: str = 'blue'
      color: {
        default: 'blue',
        parseHTML: el => el.getAttribute('data-arrow-color') ?? 'blue',
        renderHTML: attrs => ({ 'data-arrow-color': attrs.color }),
      },

      // ── 선택 속성 ─────────────────────────────
      // 투명도: 0~1 (기본 1)
      // Python으로 치면: opacity: float = 1.0
      opacity: {
        default: 1,
        parseHTML: el => parseFloat(el.getAttribute('data-arrow-opacity') ?? '1'),
        renderHTML: attrs => ({ 'data-arrow-opacity': String(attrs.opacity) }),
      },
      // 화살표 타입: 'margin' (여백 호) | 'diagonal' (대각 직선)
      // Python으로 치면: arrow_type: Literal['margin', 'diagonal'] = 'margin'
      arrowType: {
        default: 'margin',
        parseHTML: el => el.getAttribute('data-arrow-type') ?? 'margin',
        renderHTML: attrs => ({ 'data-arrow-type': attrs.arrowType }),
      },
      // 여백 x 위치: 0~30 (0=텍스트 가까운 여백, 30=더 왼쪽)
      // Python으로 치면: x_position: int = 0
      xPosition: {
        default: 0,
        parseHTML: el => parseInt(el.getAttribute('data-arrow-x') ?? '0', 10),
        renderHTML: attrs => ({ 'data-arrow-x': String(attrs.xPosition) }),
      },
      // 시작점에 화살촉 추가 (양방향 화살표)
      // Python으로 치면: start_head: bool = False
      startHead: {
        default: false,
        parseHTML: el => el.getAttribute('data-arrow-start-head') === 'true',
        renderHTML: attrs => ({ 'data-arrow-start-head': String(attrs.startHead) }),
      },
      // 끝점 화살촉 표시 여부 (no-arrow = false)
      // Python으로 치면: end_head: bool = True
      endHead: {
        default: true,
        parseHTML: el => el.getAttribute('data-arrow-end-head') !== 'false',
        renderHTML: attrs => ({ 'data-arrow-end-head': String(attrs.endHead) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-arrow-id]' }]
  },

  // -----------------------------------------------
  // HTML 렌더링: 색상 점선 밑줄 + data 속성 부착
  // Python으로 치면: def render_html(self): return ('span', attrs, 0)
  // -----------------------------------------------
  renderHTML({ HTMLAttributes }) {
    // 색상 해석: ARROW_COLORS 키이면 HEX로, 아니면 CSS 색상 직접 사용
    // Python으로 치면: color_hex = ARROW_COLORS.get(color, color)
    const colorRaw = HTMLAttributes['data-arrow-color'] as string ?? 'blue'
    const colorHex = ARROW_COLORS[colorRaw] ?? colorRaw
    const isStart = HTMLAttributes['data-arrow-start'] === 'true'
    const opacity = parseFloat(HTMLAttributes['data-arrow-opacity'] ?? '1')

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'arrow-marker',
        style: [
          `border-bottom: 2px dashed ${colorHex}`,
          `opacity: ${opacity}`,
          `--arrow-color: ${colorHex}`,
          'padding-bottom: 1px',
          'cursor: pointer',
          'position: relative',
        ].join(';'),
        'data-arrow-role': isStart ? 'start' : 'end',
      }),
      0,
    ]
  },
})

// BubbleMenuBar에서는 editor.chain().setMark('arrowMark', attrs)로 직접 호출
// (커스텀 커맨드 없이 Tiptap 내장 setMark/unsetMark 사용)
