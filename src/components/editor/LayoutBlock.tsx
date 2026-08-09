// =============================================
// src/components/editor/LayoutBlock.tsx
// 역할: A4 용지 기준 다단 레이아웃 블록
//   1) 템플릿 피커: 세로/가로 A4 중 8가지 빌트인 + 커스텀 템플릿 선택
//   2) A4 그리드: 선택된 템플릿대로 슬롯 배치 + LayoutSlot 렌더링
//   3) 열 구분선 드래그: 슬롯 사이를 드래그해 열 너비 실시간 조절
//   4) 행 구분선 드래그: top-split/big-left에서 행 높이 실시간 조절
//   5) 전체 높이 핸들: 하단 드래그로 블록 전체 높이 조절
// Python으로 치면: class LayoutBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Block, createBlock } from '@/types/block'
import { useSettingsStore, CustomLayoutTemplate } from '@/store/settingsStore'
import LayoutSlot from './LayoutSlot'

// ── 타입 정의 ────────────────────────────────────────────────────
// Python으로 치면: BuiltinTemplateId = Literal['two-col', 'sidebar-left', ...]
type BuiltinTemplateId =
  | 'two-col'         // 세로 2단 균등 (50:50)
  | 'sidebar-left'    // 세로 사이드바 좌 (33:67)
  | 'sidebar-right'   // 세로 사이드바 우 (67:33)
  | 'three-col'       // 세로 3단 균등 (33:33:33)
  | 'top-split'       // 세로 상단 전체 + 하단 2열
  | 'big-left'        // 세로 큰 좌 + 우측 상하 분할 (67:33)
  | 'landscape-two'   // 가로 2단 균등 (50:50)
  | 'landscape-three' // 가로 3단 균등 (33:33:33)

type Orientation = 'portrait' | 'landscape'

// 레이아웃 블록 content JSON 포맷
// Python으로 치면: @dataclass class LayoutContent: template, orientation, slots, cols, rows, height
interface LayoutContent {
  template: string   // BuiltinTemplateId or 'custom:{uuid}'
  orientation: Orientation
  slots: {
    a: Block[]
    b: Block[]
    c?: Block[]   // 3슬롯 템플릿에만 존재
  }
  cols?: number[]    // 사용자 조정 열 비율 (없으면 getTemplateCols() 기본값 사용)
  rows?: number[]    // 사용자 조정 행 비율 (top-split, big-left 전용)
  height?: number    // 전체 블록 높이 px (없으면 aspect-ratio 사용)
}

interface LayoutBlockProps {
  blockId: string
  content: string
  onChange: (content: string) => void
}

// ── 빌트인 템플릿 목록 ───────────────────────────────────────────
const PORTRAIT_TEMPLATES: { id: BuiltinTemplateId; name: string; desc: string }[] = [
  { id: 'two-col',       name: '2단 균등',    desc: '50 : 50' },
  { id: 'sidebar-left',  name: '사이드바 좌',  desc: '33 : 67' },
  { id: 'sidebar-right', name: '사이드바 우',  desc: '67 : 33' },
  { id: 'three-col',     name: '3단 균등',    desc: '33 : 33 : 33' },
  { id: 'top-split',     name: '상단+하단 2열', desc: '상단 전체 + 하단 2열' },
  { id: 'big-left',      name: '큰 좌+우 분할', desc: '67 : 33 (우측 2행)' },
]
const LANDSCAPE_TEMPLATES: { id: BuiltinTemplateId; name: string; desc: string }[] = [
  { id: 'landscape-two',   name: '가로 2단', desc: '50 : 50' },
  { id: 'landscape-three', name: '가로 3단', desc: '33 : 33 : 33' },
]

// ── 템플릿 기본 열 비율 반환 ─────────────────────────────────────
// Python으로 치면: def get_template_cols(template, custom_templates) -> list[float]: ...
function getTemplateCols(template: string, customTemplates: CustomLayoutTemplate[]): number[] {
  if (template.startsWith('custom:')) {
    const id = template.slice(7)
    return customTemplates.find(t => t.id === id)?.cols ?? [50, 50]
  }
  switch (template as BuiltinTemplateId) {
    case 'two-col':
    case 'landscape-two':   return [50, 50]
    case 'sidebar-left':    return [33, 67]
    case 'sidebar-right':   return [67, 33]
    case 'three-col':
    case 'landscape-three': return [33, 33, 34]
    case 'top-split':       return [50, 50]
    case 'big-left':        return [67, 33]
    default:                return [50, 50]
  }
}

// ── 템플릿 기본 행 비율 반환 (top-split, big-left 전용) ────────────
// Python으로 치면: def get_template_rows(template) -> list[float]: ...
function getTemplateRows(template: string): number[] {
  switch (template as BuiltinTemplateId) {
    case 'top-split': return [33, 67]  // 원래 1fr 2fr → 33:67 근사
    case 'big-left':  return [50, 50]  // 원래 1fr 1fr → 50:50
    default:          return [50, 50]
  }
}

// ── 템플릿별 초기 슬롯 생성 ──────────────────────────────────────
// Python으로 치면: def create_slots(template, custom_templates=None) -> dict: ...
function createDefaultSlots(
  template: string,
  customTemplates?: CustomLayoutTemplate[],
): LayoutContent['slots'] {
  if (template.startsWith('custom:')) {
    const id = template.slice(7)
    const customTpl = customTemplates?.find(t => t.id === id)
    const slots: LayoutContent['slots'] = {
      a: [createBlock('paragraph')],
      b: [createBlock('paragraph')],
    }
    if (customTpl && customTpl.cols.length >= 3) slots.c = [createBlock('paragraph')]
    return slots
  }
  const needsC: BuiltinTemplateId[] = ['three-col', 'top-split', 'big-left', 'landscape-three']
  return {
    a: [createBlock('paragraph')],
    b: [createBlock('paragraph')],
    ...(needsC.includes(template as BuiltinTemplateId) ? { c: [createBlock('paragraph')] } : {}),
  }
}

// ── 열 구분선 드래그 컴포넌트 ────────────────────────────────────
// 두 슬롯 사이에 배치되는 4px 구분선 — 드래그하면 인접 두 열의 비율 조절
// Python으로 치면: class ResizeDivider(Widget): def on_drag(self, dx): adjust_cols()
interface ResizeDividerProps {
  dividerIdx: number                             // 0 = A|B 사이, 1 = B|C 사이
  currentCols: number[]                          // 현재 열 비율 배열
  gridRef: React.RefObject<HTMLDivElement | null> // 그리드 컨테이너 ref (너비 계산용)
  onDragging: (cols: number[]) => void           // mousemove: 로컬 state만 업데이트
  onCommit: (cols: number[]) => void             // mouseup: content JSON에 저장
  gridColumn?: number                            // 명시적 grid-column (복잡한 템플릿용)
  gridRow?: string                               // 명시적 grid-row (복잡한 템플릿용)
}

function ResizeDivider({
  dividerIdx,
  currentCols,
  gridRef,
  onDragging,
  onCommit,
  gridColumn,
  gridRow,
}: ResizeDividerProps) {
  const [isDragging, setIsDragging] = useState(false)
  // stale closure 방지: 마지막 계산된 cols를 ref로 보관 (mouseup에서 commit 시 사용)
  // Python으로 치면: self._last_cols = ref(current_cols)
  const lastCols = useRef<number[]>(currentCols)

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startCols = [...currentCols]
    const dividerCount = startCols.length - 1
    // 그리드 실제 너비에서 구분선 너비(4px × n) 제외 → 슬롯 영역 너비
    // Python으로 치면: container_w = grid.get_width() - divider_w * divider_count
    const containerWidth =
      (gridRef.current?.getBoundingClientRect().width ?? 400) - dividerCount * 4

    setIsDragging(true)
    lastCols.current = startCols

    function onMouseMove(ev: MouseEvent) {
      const deltaX = ev.clientX - startX
      // 픽셀 델타를 비율 델타로 변환 (전체 합계 기준)
      // Python으로 치면: delta_pct = (dx / container_w) * sum(cols)
      const total = startCols.reduce((s, c) => s + c, 0)
      const deltaPct = (deltaX / containerWidth) * total
      const minPct = total * 0.1  // 각 열 최소 10%

      const newCols = [...startCols]
      newCols[dividerIdx]     = Math.max(minPct, startCols[dividerIdx] + deltaPct)
      newCols[dividerIdx + 1] = Math.max(minPct, startCols[dividerIdx + 1] - deltaPct)

      lastCols.current = newCols
      onDragging(newCols)  // 로컬 state만 업데이트 (저장 없음)
    }

    function onMouseUp() {
      setIsDragging(false)
      onCommit(lastCols.current)  // content JSON에 최종 비율 저장
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // top-split, big-left처럼 명시적 grid 위치 지정이 필요한 경우
  // Python으로 치면: placement = {'grid-column': col, 'grid-row': row}
  const placementStyle: React.CSSProperties = {}
  if (gridColumn !== undefined) placementStyle.gridColumn = gridColumn
  if (gridRow     !== undefined) placementStyle.gridRow    = gridRow

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ cursor: 'col-resize', ...placementStyle }}
      className={isDragging
        ? "flex items-center justify-center bg-blue-300 select-none print-hide"
        : "flex items-center justify-center bg-gray-100 hover:bg-blue-200 group select-none transition-colors print-hide"
      }
      title="드래그하여 열 너비 조절"
    >
      {/* 중앙 핸들 도트 — 항상 표시, 호버 시 강조 */}
      <div className={isDragging
        ? "flex flex-col gap-0.5"
        : "flex flex-col gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity"
      }>
        {[0, 1, 2].map(i => (
          <div key={i} className={isDragging ? "w-0.5 h-1 bg-blue-600 rounded-full" : "w-0.5 h-1 bg-gray-400 rounded-full"} />
        ))}
      </div>
    </div>
  )
}

// ── 행 구분선 드래그 컴포넌트 ────────────────────────────────────
// top-split / big-left의 행 경계에 배치되는 4px 가로 구분선
// Python으로 치면: class HorizontalResizeDivider(Widget): def on_drag(self, dy): adjust_rows()
interface HorizontalResizeDividerProps {
  dividerIdx: number                             // 0 = 상단|하단 사이 (현재는 0만 존재)
  currentRows: number[]                          // 현재 행 비율 배열
  gridRef: React.RefObject<HTMLDivElement | null> // 그리드 컨테이너 ref (높이 계산용)
  onDragging: (rows: number[]) => void           // mousemove: 로컬 state만 업데이트
  onCommit: (rows: number[]) => void             // mouseup: content JSON에 저장
  gridColumn?: string                            // 명시적 grid-column
  gridRow?: number                               // 명시적 grid-row
}

function HorizontalResizeDivider({
  dividerIdx,
  currentRows,
  gridRef,
  onDragging,
  onCommit,
  gridColumn,
  gridRow,
}: HorizontalResizeDividerProps) {
  const [isDragging, setIsDragging] = useState(false)
  // stale closure 방지 — mouseup에서 최종 rows 참조 보장
  // Python으로 치면: self._last_rows = ref(current_rows)
  const lastRows = useRef<number[]>(currentRows)

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const startY = e.clientY
    const startRows = [...currentRows]
    const dividerCount = startRows.length - 1
    // 그리드 실제 높이에서 구분선 높이(4px × n) 제외 → 슬롯 영역 높이
    // Python으로 치면: container_h = grid.get_height() - divider_h * divider_count
    const containerHeight =
      (gridRef.current?.getBoundingClientRect().height ?? 300) - dividerCount * 4

    setIsDragging(true)
    lastRows.current = startRows

    function onMouseMove(ev: MouseEvent) {
      const deltaY = ev.clientY - startY
      // 픽셀 델타를 비율 델타로 변환
      // Python으로 치면: delta_pct = (dy / container_h) * sum(rows)
      const total = startRows.reduce((s, r) => s + r, 0)
      const deltaPct = (deltaY / containerHeight) * total
      const minPct = total * 0.1  // 각 행 최소 10%

      const newRows = [...startRows]
      newRows[dividerIdx]     = Math.max(minPct, startRows[dividerIdx] + deltaPct)
      newRows[dividerIdx + 1] = Math.max(minPct, startRows[dividerIdx + 1] - deltaPct)

      lastRows.current = newRows
      onDragging(newRows)
    }

    function onMouseUp() {
      setIsDragging(false)
      onCommit(lastRows.current)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // 명시적 grid 위치 (top-split: 1/-1 전체 폭, big-left: 3열만)
  // Python으로 치면: placement = {'grid-column': col, 'grid-row': row}
  const placementStyle: React.CSSProperties = {}
  if (gridColumn !== undefined) placementStyle.gridColumn = gridColumn
  if (gridRow    !== undefined) placementStyle.gridRow    = gridRow

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ cursor: 'row-resize', ...placementStyle }}
      className={isDragging
        ? "flex items-center justify-center bg-blue-300 select-none print-hide"
        : "flex items-center justify-center bg-gray-100 hover:bg-blue-200 group select-none transition-colors print-hide"
      }
      title="드래그하여 행 높이 조절"
    >
      {/* 가로 핸들 도트 — 항상 표시, 호버 시 강조 */}
      <div className={isDragging
        ? "flex gap-0.5"
        : "flex gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity"
      }>
        {[0, 1, 2].map(i => (
          <div key={i} className={isDragging ? "h-0.5 w-1 bg-blue-600 rounded-full" : "h-0.5 w-1 bg-gray-400 rounded-full"} />
        ))}
      </div>
    </div>
  )
}

// ── 전체 블록 높이 핸들 ──────────────────────────────────────────
// 블록 하단에 배치 — 드래그하여 전체 높이를 px 단위로 조절
// Python으로 치면: class HeightHandle(Widget): def on_drag(self, dy): adjust_height()
interface HeightHandleProps {
  innerRef: React.RefObject<HTMLDivElement | null>  // 높이 측정 대상 div
  onHeightDragging: (h: number) => void             // mousemove: 로컬 state만
  onHeightCommit: (h: number) => void               // mouseup: content JSON에 저장
}

function HeightHandle({ innerRef, onHeightDragging, onHeightCommit }: HeightHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  // stale closure 방지 — mouseup에서 최종 높이 참조 보장
  // Python으로 치면: self._last_height = ref(0)
  const lastHeight = useRef(300)

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const startY = e.clientY
    // 드래그 시작 시점의 실제 렌더링 높이 측정 (aspect-ratio 또는 고정 height)
    // Python으로 치면: start_h = inner_div.get_bounding_box().height
    const startH = innerRef.current?.getBoundingClientRect().height ?? 300

    setIsDragging(true)
    lastHeight.current = startH

    function onMouseMove(ev: MouseEvent) {
      const deltaY = ev.clientY - startY
      // 최소 높이 120px (너무 작아지면 사용 불가)
      // Python으로 치면: new_h = max(120, start_h + dy)
      const newH = Math.max(120, startH + deltaY)
      lastHeight.current = newH
      onHeightDragging(newH)
    }

    function onMouseUp() {
      setIsDragging(false)
      onHeightCommit(lastHeight.current)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className={isDragging
        ? "flex items-center justify-center h-3 cursor-ns-resize bg-blue-100 border-t border-blue-300 select-none rounded-b-xl print-hide"
        : "flex items-center justify-center h-3 cursor-ns-resize bg-gray-50 hover:bg-blue-50 border-t border-gray-100 select-none rounded-b-xl transition-colors print-hide"
      }
      title="드래그하여 블록 높이 조절"
    >
      {/* 가로 핸들 선 3개 — 항상 희미하게, 호버 시 강조 */}
      <div className={isDragging
        ? "flex gap-1"
        : "flex gap-1 opacity-30 hover:opacity-80 transition-opacity"
      }>
        {[0, 1, 2].map(i => (
          <div key={i} className={isDragging ? "h-0.5 w-3 bg-blue-500 rounded-full" : "h-0.5 w-3 bg-gray-400 rounded-full"} />
        ))}
      </div>
    </div>
  )
}

// ── 빌트인 템플릿 SVG 미리보기 ──────────────────────────────────
// Python으로 치면: def draw_builtin_preview(template_id, is_portrait) -> SVGElement
function TemplatePreview({ id, isPortrait }: { id: BuiltinTemplateId; isPortrait: boolean }) {
  const W = isPortrait ? 44 : 62
  const H = isPortrait ? 62 : 44
  const PAD = 3
  const GAP = 2
  const IW = W - PAD * 2
  const IH = H - PAD * 2

  type Rect = { x: number; y: number; w: number; h: number }
  let rects: Rect[] = []

  switch (id) {
    case 'two-col':
    case 'landscape-two': {
      const hw = (IW - GAP) / 2
      rects = [
        { x: PAD,            y: PAD, w: hw, h: IH },
        { x: PAD + hw + GAP, y: PAD, w: hw, h: IH },
      ]
      break
    }
    case 'sidebar-left': {
      const aw = IW / 3
      const bw = IW - aw - GAP
      rects = [
        { x: PAD,            y: PAD, w: aw, h: IH },
        { x: PAD + aw + GAP, y: PAD, w: bw, h: IH },
      ]
      break
    }
    case 'sidebar-right': {
      const bw = IW / 3
      const aw = IW - bw - GAP
      rects = [
        { x: PAD,            y: PAD, w: aw, h: IH },
        { x: PAD + aw + GAP, y: PAD, w: bw, h: IH },
      ]
      break
    }
    case 'three-col':
    case 'landscape-three': {
      const cw = (IW - GAP * 2) / 3
      rects = [
        { x: PAD,                    y: PAD, w: cw, h: IH },
        { x: PAD + cw + GAP,         y: PAD, w: cw, h: IH },
        { x: PAD + cw * 2 + GAP * 2, y: PAD, w: cw, h: IH },
      ]
      break
    }
    case 'top-split': {
      const topH = Math.round(IH / 3)
      const botH = IH - topH - GAP
      const hw   = (IW - GAP) / 2
      rects = [
        { x: PAD,            y: PAD,              w: IW, h: topH },
        { x: PAD,            y: PAD + topH + GAP, w: hw, h: botH },
        { x: PAD + hw + GAP, y: PAD + topH + GAP, w: hw, h: botH },
      ]
      break
    }
    case 'big-left': {
      const aw = Math.round(IW * 2 / 3)
      const bw = IW - aw - GAP
      const hh = (IH - GAP) / 2
      rects = [
        { x: PAD,            y: PAD,            w: aw, h: IH },
        { x: PAD + aw + GAP, y: PAD,            w: bw, h: hh },
        { x: PAD + aw + GAP, y: PAD + hh + GAP, w: bw, h: hh },
      ]
      break
    }
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x={0} y={0} width={W} height={H} rx={2} fill="#f3f4f6" stroke="#e5e7eb" strokeWidth={1} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={1} fill="#cbd5e1" />
      ))}
    </svg>
  )
}

// ── 커스텀 템플릿 SVG 미리보기 (cols[] 기반) ────────────────────
// Python으로 치면: def draw_custom_preview(cols, is_portrait) -> SVGElement
function CustomTemplatePreview({ cols, isPortrait }: { cols: number[]; isPortrait: boolean }) {
  const W = isPortrait ? 44 : 62
  const H = isPortrait ? 62 : 44
  const PAD = 3
  const GAP = 1
  const IW = W - PAD * 2 - GAP * (cols.length - 1)
  const IH = H - PAD * 2
  const total = cols.reduce((s, c) => s + c, 0) || 100

  const rects: { x: number; y: number; w: number; h: number }[] = []
  let curX = PAD
  cols.forEach(c => {
    const w = Math.round(IW * c / total)
    rects.push({ x: curX, y: PAD, w: Math.max(w, 1), h: IH })
    curX += w + GAP
  })

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x={0} y={0} width={W} height={H} rx={2} fill="#f3f4f6" stroke="#e5e7eb" strokeWidth={1} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={1} fill="#a78bfa" />
      ))}
    </svg>
  )
}

// ── 템플릿 선택 피커 ─────────────────────────────────────────────
// Python으로 치면: class TemplatePicker(Widget): def render(self): ...
function TemplatePicker({
  onSelect,
  customTemplates,
  defaultOrientation,
}: {
  onSelect: (template: string, orientation: Orientation) => void
  customTemplates: CustomLayoutTemplate[]
  defaultOrientation: Orientation
}) {
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientation)
  const builtinTemplates = orientation === 'portrait' ? PORTRAIT_TEMPLATES : LANDSCAPE_TEMPLATES
  const matchingCustom = customTemplates.filter(t => t.orientation === orientation)

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 space-y-4 bg-gray-50">
      <div className="flex items-center gap-2">
        <span className="text-xl">📐</span>
        <div>
          <p className="text-sm font-semibold text-gray-700">레이아웃 블록</p>
          <p className="text-xs text-gray-400">A4 용지 기준 다단 레이아웃을 선택하세요</p>
        </div>
      </div>

      {/* 방향 탭 */}
      <div className="flex gap-0.5 bg-gray-200 p-0.5 rounded-lg w-fit">
        {(['portrait', 'landscape'] as const).map(o => (
          <button
            key={o}
            type="button"
            onClick={() => setOrientation(o)}
            className={orientation === o
              ? "px-3 py-1.5 text-xs font-medium bg-white rounded-md shadow-sm text-gray-800 transition-all"
              : "px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"}
          >
            {o === 'portrait' ? '📄 세로 A4' : '🖥️ 가로 A4'}
          </button>
        ))}
      </div>

      {/* 빌트인 템플릿 그리드 */}
      <div className="grid grid-cols-3 gap-2">
        {builtinTemplates.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelect(tpl.id, orientation)}
            className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all text-center"
          >
            <TemplatePreview id={tpl.id} isPortrait={orientation === 'portrait'} />
            <div>
              <p className="text-xs font-semibold text-gray-700">{tpl.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{tpl.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 커스텀 템플릿 섹션 */}
      {matchingCustom.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">✏️ 커스텀 템플릿</p>
          <div className="grid grid-cols-3 gap-2">
            {matchingCustom.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onSelect(`custom:${tpl.id}`, orientation)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-purple-200 bg-white hover:border-purple-400 hover:bg-purple-50 active:scale-95 transition-all text-center"
              >
                <CustomTemplatePreview cols={tpl.cols} isPortrait={orientation === 'portrait'} />
                <div>
                  <p className="text-xs font-semibold text-gray-700">{tpl.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {tpl.cols.map((c, i) => `${String.fromCharCode(65 + i)}:${c}%`).join(' · ')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 그리드 렌더러 (열/행 구분선 포함) ────────────────────────────
// 각 템플릿별 CSS Grid + ResizeDivider + HorizontalResizeDivider 배치
// Python으로 치면: def render_grid(template, slots, cols, rows, ...callbacks, grid_ref): ...
function renderGrid(
  template: string,
  slots: LayoutContent['slots'],
  onSlotChange: (slotId: 'a' | 'b' | 'c', blocks: Block[]) => void,
  customTemplates: CustomLayoutTemplate[],
  cols: number[],
  onColsDragging: (cols: number[]) => void,
  onColsCommit: (cols: number[]) => void,
  rows: number[],
  onRowsDragging: (rows: number[]) => void,
  onRowsCommit: (rows: number[]) => void,
  gridRef: React.RefObject<HTMLDivElement | null>,
) {
  const a = slots.a ?? []
  const b = slots.b ?? []
  const c = slots.c ?? []

  // 열 비율 → gridTemplateColumns 문자열 생성 (4px 구분선 포함)
  // Python으로 치면: col_str = ' 4px '.join(f'{c}fr' for c in cols)
  function colsToTemplate(cs: number[]) {
    return cs.map((v, i) => (i < cs.length - 1 ? `${v}fr 4px` : `${v}fr`)).join(' ')
  }

  // 행 비율 → gridTemplateRows 문자열 (4px 구분선 포함)
  // Python으로 치면: row_str = ' 4px '.join(f'{r}fr' for r in rows)
  function rowsToTemplate(rs: number[]) {
    return rs.map((v, i) => (i < rs.length - 1 ? `${v}fr 4px` : `${v}fr`)).join(' ')
  }

  // 공통 열 구분선 생성
  function colDivider(idx: number, extraGC?: number, extraGR?: string) {
    return (
      <ResizeDivider
        key={`cdiv-${idx}`}
        dividerIdx={idx}
        currentCols={cols}
        gridRef={gridRef}
        onDragging={onColsDragging}
        onCommit={onColsCommit}
        gridColumn={extraGC}
        gridRow={extraGR}
      />
    )
  }

  // 공통 행 구분선 생성
  function rowDivider(idx: number, extraGC?: string, extraGR?: number) {
    return (
      <HorizontalResizeDivider
        key={`rdiv-${idx}`}
        dividerIdx={idx}
        currentRows={rows}
        gridRef={gridRef}
        onDragging={onRowsDragging}
        onCommit={onRowsCommit}
        gridColumn={extraGC}
        gridRow={extraGR}
      />
    )
  }

  // ── 커스텀 템플릿 처리 ─────────────────────────────────────────
  // Python으로 치면: if template.startswith('custom:'): render_custom(template)
  if (template.startsWith('custom:')) {
    const id = template.slice(7)
    const customTpl = customTemplates.find(t => t.id === id)
    if (!customTpl) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
          템플릿을 찾을 수 없습니다
        </div>
      )
    }
    const slotIds = (['a', 'b', 'c'] as const).slice(0, cols.length)
    const items: React.ReactNode[] = []
    slotIds.forEach((sid, i) => {
      items.push(
        <LayoutSlot
          key={sid}
          slotId={sid}
          blocks={slots[sid] ?? []}
          onChange={bs => onSlotChange(sid, bs)}
        />
      )
      if (i < slotIds.length - 1) {
        items.push(colDivider(i))
      }
    })
    return (
      <div
        ref={gridRef}
        className="absolute inset-0 grid p-1"
        style={{ gridTemplateColumns: colsToTemplate(cols) }}
      >
        {items}
      </div>
    )
  }

  // ── 빌트인 템플릿 switch ──────────────────────────────────────
  const c0 = cols[0] ?? 50
  const c1 = cols[1] ?? 50
  const c2 = cols[2] ?? 34

  switch (template as BuiltinTemplateId) {

    // ── 2단 균등: 세로/가로 공통 ─────────────────────────────────
    case 'two-col':
    case 'landscape-two':
      return (
        <div
          ref={gridRef}
          className="absolute inset-0 grid p-1"
          style={{ gridTemplateColumns: `${c0}fr 4px ${c1}fr` }}
        >
          <LayoutSlot slotId="a" blocks={a} onChange={bs => onSlotChange('a', bs)} />
          {colDivider(0)}
          <LayoutSlot slotId="b" blocks={b} onChange={bs => onSlotChange('b', bs)} />
        </div>
      )

    // ── 사이드바 좌 (33:67) ──────────────────────────────────────
    case 'sidebar-left':
      return (
        <div
          ref={gridRef}
          className="absolute inset-0 grid p-1"
          style={{ gridTemplateColumns: `${c0}fr 4px ${c1}fr` }}
        >
          <LayoutSlot slotId="a" blocks={a} onChange={bs => onSlotChange('a', bs)} />
          {colDivider(0)}
          <LayoutSlot slotId="b" blocks={b} onChange={bs => onSlotChange('b', bs)} />
        </div>
      )

    // ── 사이드바 우 (67:33) ──────────────────────────────────────
    case 'sidebar-right':
      return (
        <div
          ref={gridRef}
          className="absolute inset-0 grid p-1"
          style={{ gridTemplateColumns: `${c0}fr 4px ${c1}fr` }}
        >
          <LayoutSlot slotId="a" blocks={a} onChange={bs => onSlotChange('a', bs)} />
          {colDivider(0)}
          <LayoutSlot slotId="b" blocks={b} onChange={bs => onSlotChange('b', bs)} />
        </div>
      )

    // ── 3단 균등: 세로/가로 공통 ─────────────────────────────────
    case 'three-col':
    case 'landscape-three':
      return (
        <div
          ref={gridRef}
          className="absolute inset-0 grid p-1"
          style={{ gridTemplateColumns: `${c0}fr 4px ${c1}fr 4px ${c2}fr` }}
        >
          <LayoutSlot slotId="a" blocks={a} onChange={bs => onSlotChange('a', bs)} />
          {colDivider(0)}
          <LayoutSlot slotId="b" blocks={b} onChange={bs => onSlotChange('b', bs)} />
          {colDivider(1)}
          <LayoutSlot slotId="c" blocks={c} onChange={bs => onSlotChange('c', bs)} />
        </div>
      )

    // ── 상단 전체 + 하단 2열 ──────────────────────────────────────
    // gridTemplateRows: r0fr 4px r1fr (행 구분선 포함)
    // gridTemplateColumns: c0fr 4px c1fr (열 구분선 포함)
    // 슬롯 a: row1 전체 span / 행구분선: row2 전체 span / 슬롯 b,c: row3 좌우
    case 'top-split':
      return (
        <div
          ref={gridRef}
          className="absolute inset-0 grid p-1"
          style={{
            gridTemplateColumns: `${c0}fr 4px ${c1}fr`,
            gridTemplateRows: rowsToTemplate(rows),
          }}
        >
          {/* 슬롯 a: 1행 전체 (col 1 / -1 = 3개 열 모두 span) */}
          <div style={{ gridColumn: '1 / -1', gridRow: 1 }} className="min-h-0">
            <LayoutSlot slotId="a" blocks={a} onChange={bs => onSlotChange('a', bs)} className="h-full" />
          </div>
          {/* 행 구분선: 2행 전체 span */}
          {rowDivider(0, '1 / -1', 2)}
          {/* 슬롯 b: 3행, 1열 */}
          <div style={{ gridColumn: 1, gridRow: 3 }} className="min-h-0">
            <LayoutSlot slotId="b" blocks={b} onChange={bs => onSlotChange('b', bs)} className="h-full" />
          </div>
          {/* 열 구분선: 3행, 2열 */}
          {colDivider(0, 2, '3')}
          {/* 슬롯 c: 3행, 3열 */}
          <div style={{ gridColumn: 3, gridRow: 3 }} className="min-h-0">
            <LayoutSlot slotId="c" blocks={c} onChange={bs => onSlotChange('c', bs)} className="h-full" />
          </div>
        </div>
      )

    // ── 큰 좌 + 우측 상하 분할 ───────────────────────────────────
    // gridTemplateColumns: c0fr 4px c1fr (열 구분선 포함)
    // gridTemplateRows: r0fr 4px r1fr (행 구분선 포함)
    // 슬롯 a: 1열 전체 row-span / 열구분선: 2열 전체 row-span / 슬롯 b: 3열 1행 / 행구분선: 3열 2행 / 슬롯 c: 3열 3행
    case 'big-left':
      return (
        <div
          ref={gridRef}
          className="absolute inset-0 grid p-1"
          style={{
            gridTemplateColumns: `${c0}fr 4px ${c1}fr`,
            gridTemplateRows: rowsToTemplate(rows),
          }}
        >
          {/* 슬롯 a: 1열, 전체 행 span (1 / -1 = 1행 ~ 3행) */}
          <div style={{ gridColumn: 1, gridRow: '1 / -1' }} className="min-h-0">
            <LayoutSlot slotId="a" blocks={a} onChange={bs => onSlotChange('a', bs)} className="h-full" />
          </div>
          {/* 열 구분선: 2열, 전체 행 */}
          {colDivider(0, 2, '1 / -1')}
          {/* 슬롯 b: 3열, 1행 */}
          <div style={{ gridColumn: 3, gridRow: 1 }} className="min-h-0">
            <LayoutSlot slotId="b" blocks={b} onChange={bs => onSlotChange('b', bs)} className="h-full" />
          </div>
          {/* 행 구분선: 3열, 2행 */}
          {rowDivider(0, '3', 2)}
          {/* 슬롯 c: 3열, 3행 */}
          <div style={{ gridColumn: 3, gridRow: 3 }} className="min-h-0">
            <LayoutSlot slotId="c" blocks={c} onChange={bs => onSlotChange('c', bs)} className="h-full" />
          </div>
        </div>
      )

    default:
      return null
  }
}

// ── A4 그리드 컨테이너 ──────────────────────────────────────────
// Python으로 치면: class LayoutGrid(Widget): def render(self): ...
function LayoutGrid({
  parsed,
  onSlotChange,
  onChangeTpl,
  customTemplates,
  activeCols,
  onColsChange,
  activeRows,
  onRowsChange,
  activeHeight,
  onHeightChange,
}: {
  parsed: LayoutContent
  onSlotChange: (slotId: 'a' | 'b' | 'c', blocks: Block[]) => void
  onChangeTpl: () => void
  customTemplates: CustomLayoutTemplate[]
  activeCols: number[]         // content.cols 또는 템플릿 기본값
  onColsChange: (cols: number[]) => void
  activeRows: number[]         // content.rows 또는 템플릿 기본값
  onRowsChange: (rows: number[]) => void
  activeHeight: number | undefined   // content.height (없으면 aspect-ratio)
  onHeightChange: (h: number) => void
}) {
  const { template, orientation, slots } = parsed
  const isPortrait = orientation !== 'landscape'
  // 그리드 컨테이너 ref — ResizeDivider가 너비/높이 계산에 사용
  // Python으로 치면: self.grid_ref = ref(None)
  const gridRef = useRef<HTMLDivElement | null>(null)
  // 내부 콘텐츠 div ref — HeightHandle이 현재 높이 측정에 사용
  // Python으로 치면: self.inner_ref = ref(None)
  const innerRef = useRef<HTMLDivElement | null>(null)

  // 드래그 중 실시간 열 비율 — content JSON 저장 없이 즉각 렌더링
  // Python으로 치면: self.local_cols = copy(active_cols)
  const [localCols, setLocalCols] = useState<number[]>(activeCols)
  // 드래그 중 실시간 행 비율
  // Python으로 치면: self.local_rows = copy(active_rows)
  const [localRows, setLocalRows] = useState<number[]>(activeRows)
  // 드래그 중 실시간 높이 (undefined = aspect-ratio 유지)
  // Python으로 치면: self.local_height: int | None = active_height
  const [localHeight, setLocalHeight] = useState<number | undefined>(activeHeight)

  // activeCols/activeRows/activeHeight가 외부(content JSON)에서 바뀌면 동기화
  // Python으로 치면: def on_active_change(self): self.local_* = active_*
  useEffect(() => { setLocalCols(activeCols) }, [activeCols])
  useEffect(() => { setLocalRows(activeRows)  }, [activeRows])
  useEffect(() => { setLocalHeight(activeHeight) }, [activeHeight])

  const aspectStyle = isPortrait
    ? { aspectRatio: '210 / 297' }
    : { aspectRatio: '297 / 210' }

  // localHeight가 있으면 고정 height, 없으면 aspect-ratio
  // Python으로 치면: inner_style = {'height': f'{h}px'} if h else {'aspect_ratio': '...'}
  const innerStyle = localHeight !== undefined
    ? { height: `${localHeight}px` }
    : aspectStyle

  return (
    <div className="layout-block relative border border-gray-200 rounded-xl shadow-sm">
      {/* 내용 영역 — aspect-ratio 또는 고정 height */}
      <div ref={innerRef} className="relative bg-white rounded-t-xl overflow-hidden" style={innerStyle}>
        {/* 우상단 템플릿 변경 버튼 */}
        <div className="absolute top-2 right-2 z-10 print-hide">
          <button
            type="button"
            onClick={onChangeTpl}
            className="px-2 py-1 text-xs bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
            title="레이아웃 템플릿 변경"
          >
            📐 변경
          </button>
        </div>

        {/* 레이아웃 그리드 — localCols/localRows로 실시간 렌더링 */}
        {renderGrid(
          template,
          slots,
          onSlotChange,
          customTemplates,
          localCols,
          (cols) => setLocalCols(cols),   // onColsDragging
          onColsChange,                    // onColsCommit
          localRows,
          (rows) => setLocalRows(rows),   // onRowsDragging
          onRowsChange,                   // onRowsCommit
          gridRef,
        )}
      </div>

      {/* 하단 높이 조절 핸들 — overflow-hidden 바깥에 배치 */}
      <HeightHandle
        innerRef={innerRef}
        onHeightDragging={(h) => setLocalHeight(h)}
        onHeightCommit={onHeightChange}
      />
    </div>
  )
}

// ── 메인 LayoutBlock 컴포넌트 ───────────────────────────────────
// Python으로 치면: class LayoutBlock(Widget): def render(self): ...
export default function LayoutBlock({ content, onChange }: LayoutBlockProps) {
  const {
    layoutDefaultOrientation,
    layoutDefaultTemplate,
    customLayoutTemplates,
  } = useSettingsStore()

  // content JSON 파싱
  // Python으로 치면: parsed = json.loads(content) or {}
  const parsed = useMemo<Partial<LayoutContent>>(() => {
    try { return JSON.parse(content) } catch { return {} }
  }, [content])

  // 실제 활성 cols — content.cols 우선, 없으면 템플릿 기본값
  // Python으로 치면: active_cols = parsed.cols or get_template_cols(template)
  const activeCols = useMemo(() => {
    if (parsed.cols && parsed.cols.length >= 2) return parsed.cols
    return getTemplateCols(parsed.template ?? '', customLayoutTemplates)
  }, [parsed, customLayoutTemplates])

  // 실제 활성 rows — content.rows 우선, 없으면 템플릿 기본값
  // Python으로 치면: active_rows = parsed.rows or get_template_rows(template)
  const activeRows = useMemo(() => {
    if (parsed.rows && parsed.rows.length >= 2) return parsed.rows
    return getTemplateRows(parsed.template ?? '')
  }, [parsed])

  // 실제 활성 height — content.height (없으면 undefined → aspect-ratio)
  // Python으로 치면: active_height = parsed.height  # None이면 aspect-ratio
  const activeHeight = parsed.height

  const [showPicker, setShowPicker] = useState(!parsed.template)

  // 기본 템플릿 자동 적용 (마운트 시 1회)
  useEffect(() => {
    if (!content && layoutDefaultTemplate) {
      const slots = createDefaultSlots(layoutDefaultTemplate, customLayoutTemplates)
      onChange(JSON.stringify({
        template: layoutDefaultTemplate,
        orientation: layoutDefaultOrientation,
        slots,
      }))
      setShowPicker(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 템플릿 선택 → 슬롯 초기화 (cols/rows/height 없음 → 기본값 사용)
  // Python으로 치면: def on_template_select(self, tpl, orient): ...
  function handleSelect(template: string, orientation: Orientation) {
    const slots = createDefaultSlots(template, customLayoutTemplates)
    onChange(JSON.stringify({ template, orientation, slots }))
    setShowPicker(false)
  }

  // 슬롯 내 블록 변경 → cols/rows/height 유지하면서 content 업데이트
  // Python으로 치면: def on_slot_change(self, slot_id, blocks): ...
  function handleSlotChange(slotId: 'a' | 'b' | 'c', blocks: Block[]) {
    if (!parsed.template) return
    const updated: LayoutContent = {
      template: parsed.template,
      orientation: parsed.orientation ?? 'portrait',
      slots: { ...parsed.slots, [slotId]: blocks } as LayoutContent['slots'],
      ...(parsed.cols   ? { cols: parsed.cols }     : {}),
      ...(parsed.rows   ? { rows: parsed.rows }     : {}),
      ...(parsed.height ? { height: parsed.height } : {}),
    }
    onChange(JSON.stringify(updated))
  }

  // 드래그 완료 시 cols 저장 (mouseup)
  // Python으로 치면: def on_cols_commit(self, new_cols): save_to_json(new_cols)
  function handleColsChange(newCols: number[]) {
    if (!parsed.template) return
    const updated = { ...parsed, cols: newCols } as LayoutContent
    onChange(JSON.stringify(updated))
  }

  // 드래그 완료 시 rows 저장 (mouseup)
  // Python으로 치면: def on_rows_commit(self, new_rows): save_to_json(new_rows)
  function handleRowsChange(newRows: number[]) {
    if (!parsed.template) return
    const updated = { ...parsed, rows: newRows } as LayoutContent
    onChange(JSON.stringify(updated))
  }

  // 드래그 완료 시 height 저장 (mouseup)
  // Python으로 치면: def on_height_commit(self, new_height): save_to_json(new_height)
  function handleHeightChange(newHeight: number) {
    if (!parsed.template) return
    const updated = { ...parsed, height: newHeight } as LayoutContent
    onChange(JSON.stringify(updated))
  }

  if (showPicker || !parsed.template) {
    return (
      <TemplatePicker
        onSelect={handleSelect}
        customTemplates={customLayoutTemplates}
        defaultOrientation={layoutDefaultOrientation}
      />
    )
  }

  return (
    <LayoutGrid
      parsed={parsed as LayoutContent}
      onSlotChange={handleSlotChange}
      onChangeTpl={() => setShowPicker(true)}
      customTemplates={customLayoutTemplates}
      activeCols={activeCols}
      onColsChange={handleColsChange}
      activeRows={activeRows}
      onRowsChange={handleRowsChange}
      activeHeight={activeHeight}
      onHeightChange={handleHeightChange}
    />
  )
}
