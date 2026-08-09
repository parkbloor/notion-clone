// =============================================
// src/components/editor/CanvasPageEditor.tsx
// 역할: 캔버스 모드 렌더러 — 점 그리드 위에 블록 절대 배치
//       드래그 이동 + 리사이즈 + ResizeObserver 자동 밀어내기
// 캔버스 너비는 본문에 고정, 블록 내용이 늘어나면 아래 블록 자동 이동
// Python으로 치면: class CanvasPageEditor: def render(self, page): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { GripHorizontal } from 'lucide-react'
import { usePageStore } from '@/store/pageStore'
import { Page, CanvasBox } from '@/types/block'
import Editor from './Editor'

// -----------------------------------------------
// 상수
// Python으로 치면: GRID_SIZE = 20; MIN_W = 200 등
// -----------------------------------------------
const GRID_SIZE = 20
const DEFAULT_W = 520
const DEFAULT_H = 120
const GAP = 20
const START_X = 40
const START_Y = 40
const MIN_W = 200
const MIN_H = 60
const EDGE_PADDING = 16

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

// -----------------------------------------------
// 블록 높이 추정 함수 — 캔버스 초기 배치 시 겹침 방지용
// 실제 높이는 렌더 후 ResizeObserver가 측정하여 보정
// Python으로 치면: def estimate_block_height(block): ...
// -----------------------------------------------
function estimateBlockHeight(block: { type: string; content: string }): number {
  switch (block.type) {
    case 'divider':    return 36
    // 이미지: 세로 이미지(4:3 portrait) 기준 520px 너비 → 약 700px 높이 + 여백
    // 가로 이미지는 실제 높이가 더 작아 ResizeObserver가 수정 불필요
    case 'image':      return 500
    // 영상: 16:9 기준 520px 너비 → 약 293px + 컨트롤바 + 여백
    case 'video':      return 360
    case 'embed':
    case 'mermaid':    return 320
    case 'canvas':
    case 'kanban':
    case 'excalidraw': return 420
    case 'layout':     return 360
    case 'math':       return 80
    case 'record':     return 72
    case 'heading1':   return 60
    case 'heading2':   return 52
    case 'heading3':   return 44
    default: {
      // 텍스트 길이 기반 추정: 한 줄 약 60자, 줄높이 28px, 패딩 40px
      // Python으로 치면: lines = max(1, ceil(len(text) / 60)); return max(DEFAULT_H, lines*28+40)
      const text = (block.content ?? '').replace(/<[^>]+>/g, '')
      const lines = Math.max(1, Math.ceil(text.length / 60))
      return Math.max(DEFAULT_H, lines * 28 + 40)
    }
  }
}

// -----------------------------------------------
// 두 블록의 사각형 영역이 겹치는지 확인
// Python으로 치면: def rects_overlap(a, b): return a.x < b.x+b.w and a.x+a.w > b.x and ...
// -----------------------------------------------
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  margin = 4  // 최소 여백 (px) — 딱 붙는 것도 겹침으로 간주
): boolean {
  return ax < bx + bw - margin && ax + aw > bx + margin &&
         ay < by + bh - margin && ay + ah > by + margin
}

// -----------------------------------------------
// 드롭 위치가 다른 블록과 겹칠 때 최근접 비충돌 위치를 반환
// 나선형으로 그리드 한 칸씩 확장하며 빈 자리 탐색
// Python으로 치면: def find_clear_pos(block_id, x, y, w, h, blocks): ...
// -----------------------------------------------
function findNonOverlappingPos(
  blockId: string, x: number, y: number, w: number, h: number,
  blocks: { id: string; canvasX?: number; canvasY?: number; canvasW?: number; canvasH?: number }[]
): { x: number; y: number } {
  const others = blocks.filter(b => b.id !== blockId && b.canvasX !== undefined)

  // Python으로 치면: def has_overlap(cx, cy): return any(rects_overlap(...) for b in others)
  const hasOverlap = (cx: number, cy: number): boolean =>
    others.some(b => rectsOverlap(
      cx, cy, w, h,
      b.canvasX!, b.canvasY!, b.canvasW ?? DEFAULT_W, b.canvasH ?? DEFAULT_H
    ))

  if (!hasOverlap(x, y)) return { x, y }

  // 나선형으로 탐색 (최대 30칸)
  // Python으로 치면: for r in range(1, 31): for (dx, dy) in ring(r): try pos
  for (let r = 1; r <= 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue  // 테두리만 탐색
        const nx = x + dx * GRID_SIZE
        const ny = y + dy * GRID_SIZE
        if (nx < 0 || ny < 0) continue
        if (!hasOverlap(nx, ny)) return { x: nx, y: ny }
      }
    }
  }
  return { x, y }  // 탐색 실패 시 원래 위치 반환
}

// -----------------------------------------------
// 드래그 상태 타입
// Python으로 치면: @dataclass class DragState: ...
// -----------------------------------------------
interface DragState {
  blockId: string
  startMouseX: number
  startMouseY: number
  startBlockX: number
  startBlockY: number
  blockW: number
  blockH: number
}

// -----------------------------------------------
// 리사이즈 상태 타입
// Python으로 치면: @dataclass class ResizeState: ...
// -----------------------------------------------
interface ResizeState {
  blockId: string
  handle: 'right' | 'bottom' | 'corner'
  startMouseX: number
  startMouseY: number
  startW: number
  startH: number
  blockX: number
}

// -----------------------------------------------
// 가상 박스 그리기 상태 타입
// 마우스 드래그로 빈 캔버스에 박스를 그리는 중의 임시 상태
// Python으로 치면: @dataclass class BoxDrawState: sx, sy, curX, curY
// -----------------------------------------------
interface BoxDrawState {
  startX: number    // 드래그 시작 X (캔버스 상대 좌표, snap 적용)
  startY: number    // 드래그 시작 Y
  curX: number      // 현재 마우스 X (실시간)
  curY: number      // 현재 마우스 Y
}

// -----------------------------------------------
// 가상 박스 드래그 이동 상태 타입
// Python으로 치면: @dataclass class BoxDragState: ...
// -----------------------------------------------
interface BoxDragState {
  boxId: string
  startMouseX: number
  startMouseY: number
  startBoxX: number   // 드래그 시작 시 박스의 X 좌표
  startBoxY: number   // 드래그 시작 시 박스의 Y 좌표
  boxW: number
  boxH: number
}

// -----------------------------------------------
// 가상 박스 리사이즈 상태 타입
// Python으로 치면: @dataclass class BoxResizeState: ...
// -----------------------------------------------
interface BoxResizeState {
  boxId: string
  handle: 'right' | 'bottom' | 'corner'
  startMouseX: number
  startMouseY: number
  startX: number    // 박스 원래 X (corner 리사이즈에서 left/top 이동 없음 — 고정)
  startY: number
  startW: number
  startH: number
}

interface CanvasPageEditorProps {
  page: Page
  readMode: boolean
  // 캔버스 편집 모드 — true: 드래그/리사이즈 핸들 표시, false: 위치만 고정 표시
  // Python으로 치면: edit_mode: bool = False
  editMode?: boolean
}

export default function CanvasPageEditor({ page, readMode, editMode = false }: CanvasPageEditorProps) {
  const { addBlock, updateBlockCanvas, addCanvasBox, updateCanvasBox, deleteCanvasBox } = usePageStore()

  // 컨테이너 너비 측정용 ref
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)
  // auto-layout effect가 canvasWidth를 클로저로 캡처하지 않도록 ref로 최신값 유지
  // Python으로 치면: self._canvas_width = 800
  const canvasWidthRef = useRef(800)

  // (layoutAppliedRef 제거 — page.blocks.length 의존성으로 대체)

  // ── 드래그 상태 ──────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)

  // ── 리사이즈 상태 ─────────────────────────────
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [resizeSize, setResizeSize] = useState<{ w: number; h: number } | null>(null)
  const resizeSizeRef = useRef<{ w: number; h: number } | null>(null)

  // ── 가상 박스 상태 ────────────────────────────
  // 그리기 중인 박스 미리보기
  const [drawingBox, setDrawingBox] = useState<BoxDrawState | null>(null)
  const drawingBoxRef = useRef<BoxDrawState | null>(null)
  // 박스 드래그 이동 상태
  const [boxDragState, setBoxDragState] = useState<BoxDragState | null>(null)
  const [boxDragPos, setBoxDragPos] = useState<{ x: number; y: number } | null>(null)
  const boxDragPosRef = useRef<{ x: number; y: number } | null>(null)
  // 박스 리사이즈 상태
  const [boxResizeState, setBoxResizeState] = useState<BoxResizeState | null>(null)
  const [boxResizeGeom, setBoxResizeGeom] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const boxResizeGeomRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  // 호버 중인 박스 ID
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null)
  // 캔버스 div의 클라이언트 좌표 기준을 얻기 위한 ref
  const canvasDivRef = useRef<HTMLDivElement>(null)

  // ── ResizeObserver 관련 ref ──────────────────
  // 블록 div 요소 컬렉션 (blockId → HTMLDivElement)
  // Python으로 치면: self.block_divs: dict[str, HTMLDivElement] = {}
  const blockDivRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())

  // 각 블록의 이전 높이 기록 (증가 감지용)
  // Python으로 치면: self.prev_heights: dict[str, float] = {}
  const prevHeightsRef = useRef<Map<string, number>>(new Map())

  // ResizeObserver 인스턴스 (전역 1개로 모든 블록 관찰)
  // Python으로 치면: self.observer = ResizeObserver(callback)
  const observerRef = useRef<ResizeObserver | null>(null)

  // 블록 ID별 안정적 ref 콜백 캐시
  // 인라인 ref={(el)=>fn(el)}은 렌더마다 새 함수 생성 → React가 null→el 순서로 콜백 호출
  // → null 호출 시 prevH가 삭제되어 ResizeObserver가 높이 변화를 감지 못함
  // 해결: blockId별 함수를 한 번만 생성해 캐시 → 리렌더 시 null 사이클 없음
  // Python으로 치면: self._ref_callbacks: dict[str, Callable] = {}
  const blockRefCallbacksRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map())

  // 최신 page.blocks를 ResizeObserver 콜백 내부에서 읽기 위한 ref
  // updateBlockCanvas는 minHeight만 바꾸므로 DOM 높이 변화 없음 → 무한 루프 없음
  // Python으로 치면: self._current_blocks = page.blocks
  const pageBlocksRef = useRef(page.blocks)
  useEffect(() => { pageBlocksRef.current = page.blocks }, [page.blocks])

  // ref 동기화
  useEffect(() => { dragPosRef.current = dragPos }, [dragPos])
  useEffect(() => { resizeSizeRef.current = resizeSize }, [resizeSize])
  useEffect(() => { drawingBoxRef.current = drawingBox }, [drawingBox])
  useEffect(() => { boxDragPosRef.current = boxDragPos }, [boxDragPos])
  useEffect(() => { boxResizeGeomRef.current = boxResizeGeom }, [boxResizeGeom])


  // -----------------------------------------------
  // 컨테이너 너비 측정 (ResizeObserver)
  // Python으로 치면: observer.observe(container, lambda: set_width(container.width))
  // -----------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) { setCanvasWidth(w); canvasWidthRef.current = w }
    })
    ro.observe(containerRef.current)
    const initW = containerRef.current.offsetWidth
    setCanvasWidth(initW)
    canvasWidthRef.current = initW
    return () => ro.disconnect()
  }, [])


  // -----------------------------------------------
  // ResizeObserver 생성 (page.id 바뀔 때마다 재생성)
  // 블록 div 높이 증가 감지 → canvasH 갱신 + 아래 블록 밀어내기
  // isPushingRef 제거: updateBlockCanvas는 minHeight만 바꾸므로
  //   DOM 높이가 변하지 않아 ResizeObserver가 재발화하지 않음 (무한 루프 없음)
  // Python으로 치면: def setup_observer(): observer = ResizeObserver(on_resize)
  // -----------------------------------------------
  useEffect(() => {
    observerRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const blockId = el.dataset.blockId
        if (!blockId) continue

        // 실제 렌더링 높이 (border-box 기준)
        // Python으로 치면: new_h = entry.border_box_size.block_size
        const newH = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        const prevH = prevHeightsRef.current.get(blockId)

        // prevH는 항상 최신으로 유지 (중간에 건너뛰지 않음)
        prevHeightsRef.current.set(blockId, newH)

        const blocks = pageBlocksRef.current
        const currentBlock = blocks.find(b => b.id === blockId)
        if (!currentBlock) continue

        // 비교 기준 높이: max(이전 관찰값, 저장된 canvasH)
        // → 이미지/영상 미디어 로드 전 prevH가 minHeight로 낮게 설정돼도
        //   canvasH(추정값)를 기준으로 delta를 계산하여 과다 push 방지
        // Python으로 치면: base_h = max(prev_h or 0, block.canvas_h or DEFAULT_H)
        const baseH = Math.max(prevH ?? 0, currentBlock.canvasH ?? DEFAULT_H)

        // 1px 미만 변화 → 무시
        if (newH <= baseH + 1) continue

        const deltaH = newH - baseH

        // canvasH 갱신 (minHeight 기준값 업데이트)
        // Python으로 치면: update_block(block_id, h=new_h)
        updateBlockCanvas(page.id, blockId, { h: Math.ceil(newH) })

        // 가로로 겹치는 아래 블록들 Y좌표 밀어내기
        // Python으로 치면:
        //   for other in blocks:
        //       if other.y > current.y and x_overlaps(current, other): other.y += delta_h
        const aL = currentBlock.canvasX ?? 0
        const aR = aL + (currentBlock.canvasW ?? DEFAULT_W)

        blocks.forEach((other) => {
          if (other.id === blockId) return
          if ((other.canvasY ?? 0) <= (currentBlock.canvasY ?? 0)) return

          const bL = other.canvasX ?? 0
          const bR = bL + (other.canvasW ?? DEFAULT_W)
          if (aL >= bR || aR <= bL) return  // 가로 겹침 없음 → 무시

          updateBlockCanvas(page.id, other.id, {
            y: snap((other.canvasY ?? 0) + deltaH),
          })
        })
      }
    })

    // 이미 등록된 블록 div 즉시 관찰 시작
    blockDivRefsMap.current.forEach((el) => observerRef.current?.observe(el))

    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [page.id]) // eslint-disable-line react-hooks/exhaustive-deps


  // -----------------------------------------------
  // blockId별 안정적 ref 콜백 반환 (캐시 히트 시 동일 함수 재사용)
  // 렌더마다 새 함수를 만들지 않으므로 React의 null→el 사이클이 발생하지 않음
  // → prevH가 렌더 사이에 삭제되지 않아 ResizeObserver가 높이 변화를 정확히 감지
  // Python으로 치면: def get_block_ref_callback(block_id): return self._ref_callbacks[block_id]
  // -----------------------------------------------
  function getBlockRefCallback(blockId: string): (el: HTMLDivElement | null) => void {
    if (!blockRefCallbacksRef.current.has(blockId)) {
      blockRefCallbacksRef.current.set(blockId, (el: HTMLDivElement | null) => {
        if (el) {
          blockDivRefsMap.current.set(blockId, el)
          el.dataset.blockId = blockId
          observerRef.current?.observe(el)
        } else {
          const prev = blockDivRefsMap.current.get(blockId)
          if (prev) {
            observerRef.current?.unobserve(prev)
            blockDivRefsMap.current.delete(blockId)
            // prevH는 삭제하지 않음 — 리렌더 후에도 이전 높이 유지해야 delta 계산 가능
            // Python으로 치면: # del self.prev_heights[block_id]  ← 의도적으로 생략
          }
          blockRefCallbacksRef.current.delete(blockId)
        }
      })
    }
    return blockRefCallbacksRef.current.get(blockId)!
  }


  // -----------------------------------------------
  // 위치 없는 블록 자동 배치
  // 캔버스 진입 시 + 새 블록 추가될 때마다 실행 (page.blocks.length 의존)
  // 이미 좌표 있는 블록은 건드리지 않고, 없는 블록만 배치
  // Python으로 치면: def auto_layout(): for b in unpositioned_blocks: assign_below_all()
  // -----------------------------------------------
  useEffect(() => {
    // ── 이미 배치된 이미지/영상 블록 중 canvasH가 DEFAULT_H인 것 → 추정값으로 교정 + 아래 블록 밀어내기 ──
    // canvasH만 업데이트하면 아래 블록이 겹침 → 아래 블록의 Y좌표도 함께 조정해야 함
    // canvasY 오름차순 정렬 후 위→아래 순서로 처리 (누적 push가 올바르게 반영됨)
    // Python으로 치면:
    //   corrected = sorted(image_video_blocks_with_default_h, key=lambda b: b.canvas_y)
    //   y_offsets = {}
    //   for b in corrected: delta = new_h - old_h; push_below(b, delta, y_offsets)
    const corrections = page.blocks
      .filter(b =>
        b.canvasX !== undefined && b.canvasY !== undefined &&
        (b.canvasH ?? DEFAULT_H) <= DEFAULT_H &&
        (b.type === 'image' || b.type === 'video')
      )
      .sort((a, b) => (a.canvasY ?? 0) - (b.canvasY ?? 0))

    if (corrections.length > 0) {
      // blockId → 누적 Y 이동량 (여러 위쪽 블록의 교정이 중첩될 수 있음)
      // Python으로 치면: y_offsets: dict[str, int] = {}
      const yOffsets = new Map<string, number>()

      corrections.forEach((block) => {
        const newH = estimateBlockHeight(block)
        const oldH = block.canvasH ?? DEFAULT_H
        const deltaH = newH - oldH
        if (deltaH <= 0) return

        // canvasH 교정
        updateBlockCanvas(page.id, block.id, { h: newH })

        // 아래쪽 + 가로로 겹치는 블록에 deltaH 누적
        // 이미 누적된 오프셋(y_offsets)을 반영한 실효 Y로 비교해야 이전 교정 결과가 반영됨
        // Python으로 치면: effective_y = b.canvas_y + y_offsets.get(b.id, 0)
        const blockY = block.canvasY ?? 0
        const aL = block.canvasX ?? 0
        const aR = aL + (block.canvasW ?? DEFAULT_W)

        page.blocks.forEach((other) => {
          if (other.id === block.id || other.canvasY === undefined) return
          const otherEffectiveY = (other.canvasY ?? 0) + (yOffsets.get(other.id) ?? 0)
          if (otherEffectiveY <= blockY) return
          const bL = other.canvasX ?? 0
          const bR = bL + (other.canvasW ?? DEFAULT_W)
          if (aL >= bR || aR <= bL) return  // 가로 겹침 없으면 무시
          yOffsets.set(other.id, (yOffsets.get(other.id) ?? 0) + deltaH)
        })
      })

      // 누적된 Y 오프셋 일괄 적용
      // Python으로 치면: for block_id, offset in y_offsets.items(): update_y(block_id, canvas_y + offset)
      yOffsets.forEach((offset, blockId) => {
        const block = page.blocks.find(b => b.id === blockId)
        if (!block || block.canvasY === undefined) return
        updateBlockCanvas(page.id, blockId, { y: snap((block.canvasY ?? 0) + offset) })
      })
    }

    // 위치 없는 블록이 없으면 조기 종료
    const unpositioned = page.blocks.filter(
      b => b.canvasX === undefined || b.canvasY === undefined
    )
    if (unpositioned.length === 0) return

    // 기존 배치된 블록의 최하단 Y 좌표 계산
    // Python으로 치면: max_y = max((b.canvas_y + b.canvas_h) for b in positioned_blocks, default=START_Y)
    const maxBottomY = page.blocks.reduce((max, b) => {
      if (b.canvasX === undefined || b.canvasY === undefined) return max
      return Math.max(max, (b.canvasY) + (b.canvasH ?? DEFAULT_H))
    }, START_Y - GAP)

    // 새 블록들을 기존 블록 아래에 순서대로 배치 (겹침 방지)
    // Python으로 치면: for block in unpositioned: place_below_all(block)
    const blockW = snap(Math.min(DEFAULT_W, canvasWidthRef.current - START_X - EDGE_PADDING))
    let currentY = snap(maxBottomY + GAP)
    // 이미 배치된 블록 목록 (겹침 체크용) — 배치하면서 실시간으로 추가
    // 이미 배치된 블록은 저장된 canvasH 사용, 없으면 estimateBlockHeight로 보정
    const placed = page.blocks
      .filter(b => b.canvasX !== undefined && b.canvasY !== undefined)
      .map(b => ({
        id: b.id, canvasX: b.canvasX, canvasY: b.canvasY, canvasW: b.canvasW,
        // canvasH가 DEFAULT_H(초기값)이면 추정값으로 보정 (실제 높이 반영)
        // Python으로 치면: canvas_h = b.canvas_h if b.canvas_h > DEFAULT_H else estimate_h(b)
        canvasH: (b.canvasH && b.canvasH > DEFAULT_H) ? b.canvasH : estimateBlockHeight(b),
      }))

    unpositioned.forEach((block) => {
      // 블록 타입/내용 기반 높이 추정 → 초기 배치 시 겹침 방지
      // Python으로 치면: estimated_h = estimate_block_height(block)
      const estimatedH = estimateBlockHeight(block)
      const resolved = findNonOverlappingPos(block.id, snap(START_X), currentY, blockW, estimatedH, placed)
      updateBlockCanvas(page.id, block.id, {
        x: resolved.x, y: resolved.y, w: blockW,
        // 추정 높이로 저장 → ResizeObserver 비교 기준이 더 정확해짐
        // Python으로 치면: h = max(DEFAULT_H, estimated_h)
        h: estimatedH,
      })
      // 방금 배치한 블록도 placed에 추가 (다음 블록 겹침 체크에 반영)
      placed.push({ id: block.id, canvasX: resolved.x, canvasY: resolved.y, canvasW: blockW, canvasH: estimatedH })
      currentY = snap(resolved.y + estimatedH + GAP)
    })
  // canvasWidth는 의존성에서 제외 — 창 크기 변경 시 이미 배치된 블록을 재배치하지 않기 위해
  // 미배치 블록이 있을 때(새 블록 추가, 캔버스 최초 진입)만 실행되면 충분
  // Python으로 치면: @observe(page.blocks.length, page.id)
  }, [page.blocks.length, page.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 페이지 전환 시 상태 리셋 (ref 콜백 캐시 + DOM ref 맵도 초기화)
  // Python으로 치면: def on_page_change(): self.prev_heights.clear(); self.block_divs.clear()
  useEffect(() => {
    prevHeightsRef.current.clear()
    blockRefCallbacksRef.current.clear()
    // 이전 페이지의 DOM 참조 누적 방지
    blockDivRefsMap.current.clear()
    setDragState(null); setDragPos(null)
    setResizeState(null); setResizeSize(null)
  }, [page.id])


  // -----------------------------------------------
  // 드래그 이동 이벤트 처리 (경계 내 clamp)
  // Python으로 치면: new_x = clamp(start_x + dx, 0, canvas_w - block_w)
  // -----------------------------------------------
  useEffect(() => {
    if (!dragState) return

    const onMouseMove = (e: MouseEvent) => {
      // 드래그 중 그리드 스냅 적용 → 꼭지점이 항상 점과 일치
      // Python으로 치면: new_x = snap(clamp(start_x + dx, 0, max_x))
      const newX = snap(Math.max(0, Math.min(
        canvasWidthRef.current - dragState.blockW - EDGE_PADDING,
        dragState.startBlockX + e.clientX - dragState.startMouseX
      )))
      const newY = snap(Math.max(0, dragState.startBlockY + e.clientY - dragState.startMouseY))
      const newPos = { x: newX, y: newY }
      setDragPos(newPos)
      dragPosRef.current = newPos
    }

    const onMouseUp = () => {
      const pos = dragPosRef.current
      if (pos) {
        // 드롭 위치에 다른 블록이 있으면 최근접 빈 자리로 이동
        // Python으로 치면: x, y = find_non_overlapping_pos(block_id, x, y, w, h, blocks)
        const resolved = findNonOverlappingPos(
          dragState.blockId, pos.x, pos.y,
          dragState.blockW, dragState.blockH,
          pageBlocksRef.current
        )
        updateBlockCanvas(page.id, dragState.blockId, { x: resolved.x, y: resolved.y })
      }
      setDragState(null); setDragPos(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragState]) // eslint-disable-line react-hooks/exhaustive-deps


  // -----------------------------------------------
  // 리사이즈 이벤트 처리 (경계 내 clamp)
  // Python으로 치면: new_w = clamp(start_w + dx, MIN_W, canvas_w - block_x)
  // -----------------------------------------------
  useEffect(() => {
    if (!resizeState) return

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeState.startMouseX
      const dy = e.clientY - resizeState.startMouseY
      const maxW = canvasWidthRef.current - resizeState.blockX - EDGE_PADDING
      // 리사이즈도 그리드 스냅 적용 → 꼭지점이 점과 일치
      // Python으로 치면: new_w = snap(clamp(start_w + dx, MIN_W, max_w))
      const newW = resizeState.handle !== 'bottom'
        ? snap(Math.max(MIN_W, Math.min(maxW, resizeState.startW + dx)))
        : resizeState.startW
      const newH = resizeState.handle !== 'right'
        ? snap(Math.max(MIN_H, resizeState.startH + dy))
        : resizeState.startH
      const newSize = { w: newW, h: newH }
      setResizeSize(newSize)
      resizeSizeRef.current = newSize
    }

    const onMouseUp = () => {
      const size = resizeSizeRef.current
      if (size) updateBlockCanvas(page.id, resizeState.blockId, { w: snap(size.w), h: snap(size.h) })
      setResizeState(null); setResizeSize(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [resizeState]) // eslint-disable-line react-hooks/exhaustive-deps


  // -----------------------------------------------
  // 가상 박스 드래그 이동 마우스 이벤트 처리
  // mousemove: snap 적용 후 미리보기 위치 업데이트
  // mouseup: 최종 위치 저장
  // Python으로 치면: def on_box_drag_move(e): update_pos(snap(start + delta))
  // -----------------------------------------------
  useEffect(() => {
    if (!boxDragState) return

    const onMouseMove = (e: MouseEvent) => {
      // 박스가 캔버스 오른쪽/아래 경계를 넘지 않도록 clamp
      // Python으로 치면: new_x = clamp(start_x + dx, 0, canvas_w - box_w)
      const newX = snap(Math.max(0, Math.min(
        canvasWidthRef.current - boxDragState.boxW - EDGE_PADDING,
        boxDragState.startBoxX + e.clientX - boxDragState.startMouseX
      )))
      const newY = snap(Math.max(0, boxDragState.startBoxY + e.clientY - boxDragState.startMouseY))
      const pos = { x: newX, y: newY }
      setBoxDragPos(pos)
      boxDragPosRef.current = pos
    }

    const onMouseUp = () => {
      const pos = boxDragPosRef.current
      if (pos) updateCanvasBox(page.id, boxDragState.boxId, { x: pos.x, y: pos.y })
      setBoxDragState(null); setBoxDragPos(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [boxDragState]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 가상 박스 그리기 마우스 이벤트 처리
  // mousemove: 현재 좌표 업데이트 → 미리보기 박스 크기 변경
  // mouseup: 최소 크기(40px) 이상이면 박스 생성, 아니면 일반 블록 추가
  // Python으로 치면: def on_box_draw_move(e): draw_state.cur = snap(e.pos - canvas.origin)
  // -----------------------------------------------
  useEffect(() => {
    if (!drawingBox) return

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasDivRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      // 캔버스 경계 내로 clamp (오른쪽/아래 여백 포함)
      const curX = snap(Math.max(0, Math.min(canvasWidthRef.current - EDGE_PADDING, e.clientX - rect.left)))
      const curY = snap(Math.max(0, e.clientY - rect.top))
      const updated = { ...drawingBoxRef.current!, curX, curY }
      setDrawingBox(updated)
      drawingBoxRef.current = updated
    }

    const onMouseUp = () => {
      const db = drawingBoxRef.current
      if (db) {
        const x = Math.min(db.startX, db.curX)
        const y = Math.min(db.startY, db.curY)
        const w = Math.abs(db.curX - db.startX)
        const h = Math.abs(db.curY - db.startY)
        if (w >= 40 && h >= 40) {
          // 충분히 드래그됨 → 박스 생성 (snap 이미 적용됨)
          // Python으로 치면: add_canvas_box(page_id, CanvasBox(id=uuid, x,y,w,h))
          addCanvasBox(page.id, {
            id: crypto.randomUUID(),
            x: snap(x), y: snap(y),
            w: snap(w), h: snap(h),
          })
        } else if (w < 10 && h < 10) {
          // 거의 움직이지 않음 → 일반 블록 추가
          addBlock(page.id)
        }
      }
      setDrawingBox(null)
      drawingBoxRef.current = null
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [drawingBox]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 가상 박스 리사이즈 마우스 이벤트 처리
  // Python으로 치면: def on_box_resize_move(e): update_geom(snap(...))
  // -----------------------------------------------
  useEffect(() => {
    if (!boxResizeState) return

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - boxResizeState.startMouseX
      const dy = e.clientY - boxResizeState.startMouseY
      // 박스 우측이 캔버스 경계를 넘지 않도록 maxW 제한
      // Python으로 치면: max_w = canvas_w - box_x - EDGE_PADDING
      const maxW = canvasWidthRef.current - boxResizeState.startX - EDGE_PADDING
      const newW = boxResizeState.handle !== 'bottom'
        ? snap(Math.max(40, Math.min(maxW, boxResizeState.startW + dx)))
        : boxResizeState.startW
      const newH = boxResizeState.handle !== 'right'
        ? snap(Math.max(40, boxResizeState.startH + dy))
        : boxResizeState.startH
      const updated = { x: boxResizeState.startX, y: boxResizeState.startY, w: newW, h: newH }
      setBoxResizeGeom(updated)
      boxResizeGeomRef.current = updated
    }

    const onMouseUp = () => {
      const g = boxResizeGeomRef.current
      if (g) updateCanvasBox(page.id, boxResizeState.boxId, { w: g.w, h: g.h })
      setBoxResizeState(null); setBoxResizeGeom(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [boxResizeState]) // eslint-disable-line react-hooks/exhaustive-deps

  // 드래그 핸들 mousedown
  function handleDragStart(
    e: React.MouseEvent, blockId: string,
    blockX: number, blockY: number, blockW: number, blockH: number
  ) {
    e.preventDefault(); e.stopPropagation()
    setDragState({ blockId, startMouseX: e.clientX, startMouseY: e.clientY, startBlockX: blockX, startBlockY: blockY, blockW, blockH })
  }

  // 리사이즈 핸들 mousedown
  function handleResizeStart(
    e: React.MouseEvent, blockId: string,
    handle: ResizeState['handle'], blockW: number, blockH: number, blockX: number
  ) {
    e.preventDefault(); e.stopPropagation()
    setResizeState({ blockId, handle, startMouseX: e.clientX, startMouseY: e.clientY, startW: blockW, startH: blockH, blockX })
  }


  // 캔버스 높이 계산 (블록 최하단 + 여백)
  const canvasHeight = page.blocks.reduce((maxY, block) => {
    const bY = dragState?.blockId === block.id && dragPos ? dragPos.y : (block.canvasY ?? START_Y)
    const bH = resizeState?.blockId === block.id && resizeSize ? resizeSize.h : (block.canvasH ?? DEFAULT_H)
    return Math.max(maxY, bY + bH)
  }, 600) + 200

  const isInteracting = !!dragState || !!resizeState

  return (
    // overflow-x:hidden(가로 고정), overflow-y:visible(세로 확장 허용)
    <div ref={containerRef} className="w-full" style={{ overflowX: 'hidden', overflowY: 'visible' }}>
      <div
        ref={canvasDivRef}
        className="relative"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          // 부모(page.tsx main)의 dot-grid-bg ::before 점들을 solid 배경으로 가림
          // 그 위에 이 컴포넌트 자체 점 그리드 레이어(아래 div)를 올림 → 점 겹침 방지
          // Python으로 치면: background_color = CANVAS_BG  # 항상 불투명
          backgroundColor: '#fcf9f8',
          cursor: dragState ? 'grabbing'
            : boxResizeState ? (boxResizeState.handle === 'right' ? 'ew-resize' : 'nwse-resize')
            : drawingBox ? 'crosshair'
            : resizeState?.handle === 'right' ? 'ew-resize'
            : resizeState ? 'nwse-resize'
            : 'default',
        }}
      >
        {/* 점 그리드 레이어 — 부모 배경과 겹치지 않도록 별도 div + filter:blur */}
        {/* Python으로 치면: if edit_mode: render dot grid layer */}
        {editMode && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, #c8bfb8 1px, transparent 1px)',
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
              backgroundPosition: '-10px -10px',
              filter: 'blur(0.7px)',
              zIndex: 0,
            }}
          />
        )}
        {/* 캔버스 배너 — 편집 모드면 보라색, 뷰 모드면 회색 */}
        <div className={editMode
          ? "absolute top-3 right-3 z-20 px-2.5 py-1 bg-purple-100 text-purple-600 text-xs rounded-full border border-purple-200 select-none pointer-events-none"
          : "absolute top-3 right-3 z-20 px-2.5 py-1 bg-gray-100 text-gray-400 text-xs rounded-full border border-gray-200 select-none pointer-events-none"
        }>
          {editMode ? '⊞ 캔버스 편집' : '⊞ 캔버스'}
        </div>

        {/* ── 가상 박스 렌더링 ─────────────────────── */}
        {/* 저장된 박스들: hover 시 점선 경계 표시 + 리사이즈 핸들 + 삭제 버튼 */}
        {/* Python으로 치면: for box in page.canvas_boxes: render_box(box) */}
        {!readMode && (page.canvasBoxes ?? []).map((box: CanvasBox) => {
          const isDraggingThis = editMode && boxDragState?.boxId === box.id
          const isResizingThis = editMode && boxResizeState?.boxId === box.id
          const posX = isDraggingThis && boxDragPos ? boxDragPos.x : box.x
          const posY = isDraggingThis && boxDragPos ? boxDragPos.y : box.y
          const geom = isResizingThis && boxResizeGeom ? boxResizeGeom : { ...box, x: posX, y: posY }
          const isHovered = editMode && hoveredBoxId === box.id
          return (
            <div
              key={box.id}
              className="absolute"
              style={{
                left: geom.x,
                top: geom.y,
                width: geom.w,
                height: geom.h,
                // 편집 모드: hover/드래그/리사이즈 시 진한 점선, 평소엔 반투명 점선
                // 뷰 모드: 항상 연한 실선으로 박스 구분 표시
                // Python으로 치면: border = DASHED_ACTIVE if hovered else DASHED_DIM if edit else SOLID_DIM
                border: !editMode
                  ? '1px solid rgba(167,139,250,0.25)'
                  : (isHovered || isDraggingThis || isResizingThis)
                    ? '1.5px dashed #a78bfa'
                    : '1.5px dashed rgba(167,139,250,0.3)',
                borderRadius: 6,
                // 박스는 블록보다 낮은 z-index (블록이 박스 위에 표시됨)
                zIndex: isDraggingThis ? 50 : 2,
                transition: isDraggingThis ? 'none' : 'border-color 0.15s',
                cursor: isDraggingThis ? 'grabbing' : 'default',
                // 뷰 모드에서는 박스가 블록 이벤트를 가로채지 않도록 pointerEvents 비활성
                pointerEvents: editMode ? 'all' : 'none',
              }}
              onMouseEnter={() => editMode && setHoveredBoxId(box.id)}
              onMouseLeave={() => { if (editMode && !isDraggingThis) setHoveredBoxId(null) }}
            >
              {/* 박스 레이블 (있을 때만) */}
              {box.label && (
                <span
                  className="absolute -top-5 left-0 text-xs text-purple-400 select-none pointer-events-none"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {box.label}
                </span>
              )}

              {/* 드래그 핸들 — hover 시 상단 중앙에 표시 */}
              {(isHovered || isDraggingThis) && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-3 flex items-center px-2 py-0.5 bg-white border border-purple-200 rounded-full shadow-sm z-10"
                  style={{ cursor: isDraggingThis ? 'grabbing' : 'grab', userSelect: 'none' }}
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    setBoxDragState({
                      boxId: box.id,
                      startMouseX: e.clientX, startMouseY: e.clientY,
                      startBoxX: box.x, startBoxY: box.y,
                      boxW: box.w, boxH: box.h,
                    })
                  }}
                  title="드래그하여 이동"
                >
                  <GripHorizontal size={12} className="text-purple-400" />
                </div>
              )}

              {/* 삭제 버튼 — hover 시만 표시 */}
              {isHovered && !isDraggingThis && (
                <button
                  className="absolute -top-3 -right-3 w-5 h-5 flex items-center justify-center bg-white border border-purple-200 rounded-full text-purple-400 hover:text-red-500 hover:border-red-300 shadow-sm z-10"
                  style={{ fontSize: 11, lineHeight: 1 }}
                  onMouseDown={(e) => { e.stopPropagation() }}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteCanvasBox(page.id, box.id)
                    setHoveredBoxId(null)
                  }}
                  title="박스 삭제"
                >
                  ×
                </button>
              )}

              {/* 오른쪽 리사이즈 핸들 */}
              {(isHovered || isResizingThis) && (
                <div
                  className="absolute top-2 bottom-2 -right-1 w-2 rounded-full bg-purple-300 hover:bg-purple-500"
                  style={{ cursor: 'ew-resize', zIndex: 10 }}
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    setBoxResizeState({
                      boxId: box.id, handle: 'right',
                      startMouseX: e.clientX, startMouseY: e.clientY,
                      startX: box.x, startY: box.y, startW: box.w, startH: box.h,
                    })
                  }}
                />
              )}

              {/* 아래쪽 리사이즈 핸들 */}
              {(isHovered || isResizingThis) && (
                <div
                  className="absolute left-2 right-2 -bottom-1 h-2 rounded-full bg-purple-300 hover:bg-purple-500"
                  style={{ cursor: 'ns-resize', zIndex: 10 }}
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    setBoxResizeState({
                      boxId: box.id, handle: 'bottom',
                      startMouseX: e.clientX, startMouseY: e.clientY,
                      startX: box.x, startY: box.y, startW: box.w, startH: box.h,
                    })
                  }}
                />
              )}

              {/* 코너 리사이즈 핸들 */}
              {(isHovered || isResizingThis) && (
                <div
                  className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-purple-400 hover:bg-purple-600"
                  style={{ cursor: 'nwse-resize', zIndex: 10 }}
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    setBoxResizeState({
                      boxId: box.id, handle: 'corner',
                      startMouseX: e.clientX, startMouseY: e.clientY,
                      startX: box.x, startY: box.y, startW: box.w, startH: box.h,
                    })
                  }}
                />
              )}
            </div>
          )
        })}

        {/* 그리기 중인 박스 미리보기 */}
        {drawingBox && (() => {
          const x = Math.min(drawingBox.startX, drawingBox.curX)
          const y = Math.min(drawingBox.startY, drawingBox.curY)
          const w = Math.abs(drawingBox.curX - drawingBox.startX)
          const h = Math.abs(drawingBox.curY - drawingBox.startY)
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: x, top: y, width: w, height: h,
                border: '1.5px dashed #a78bfa',
                borderRadius: 6,
                backgroundColor: 'rgba(167,139,250,0.06)',
                zIndex: 20,
              }}
            />
          )
        })()}

        {/* ── 블록 렌더링 ─────────────────────────── */}
        {page.blocks.map((block) => {
          if (block.canvasX === undefined || block.canvasY === undefined) return null

          const isDragging = dragState?.blockId === block.id
          const isResizing = resizeState?.blockId === block.id

          const posX = isDragging && dragPos ? dragPos.x : block.canvasX
          const posY = isDragging && dragPos ? dragPos.y : block.canvasY
          const blockW = isResizing && resizeSize ? resizeSize.w : (block.canvasW ?? DEFAULT_W)
          // 높이: 리사이즈 중이면 실시간 값, 아닌 경우 minHeight만 지정 (내용에 따라 자동 확장)
          const blockH = isResizing && resizeSize ? resizeSize.h : (block.canvasH ?? DEFAULT_H)

          return (
            <div
              key={block.id}
              // blockId별 안정적 ref 콜백 — 리렌더 시 동일 함수 재사용 (null 사이클 방지)
              // Python으로 치면: div.ref = self.get_block_ref_callback(block.id)
              ref={getBlockRefCallback(block.id)}
              className="absolute bg-white rounded-lg border border-gray-200 group canvas-mode-block"
              style={{
                left: posX,
                top: posY,
                width: blockW,
                // 리사이즈 중에만 height 고정, 평소엔 minHeight만 설정 (내용 따라 자동 확장)
                ...(isResizing
                  ? { height: blockH, overflow: 'auto' }
                  : { minHeight: blockH }),
                boxShadow: isDragging
                  ? '0 8px 24px rgba(0,0,0,0.15)'
                  : isResizing
                    ? '0 4px 12px rgba(139,92,246,0.2)'
                    : '0 1px 4px rgba(0,0,0,0.08)',
                // 블록은 박스(z:2)보다 높은 z-index로 항상 박스 위에 표시
                zIndex: isDragging ? 100 : isResizing ? 50 : 5,
                userSelect: isInteracting ? 'none' : 'auto',
                transition: isInteracting ? 'none' : 'box-shadow 0.15s',
                borderColor: isResizing ? '#8b5cf6' : undefined,
              }}
            >
              {/* 드래그 핸들 — 캔버스 편집 모드일 때만 표시 */}
              {!readMode && editMode && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onMouseDown={(e) => handleDragStart(e, block.id, block.canvasX!, block.canvasY!, blockW, blockH)}
                  style={{ cursor: 'grab' }}
                  title="드래그하여 이동"
                >
                  <div className="flex items-center px-2 py-0.5 bg-white border border-gray-300 rounded-full shadow-sm select-none">
                    <GripHorizontal size={12} className="text-gray-400" />
                  </div>
                </div>
              )}

              {/* 블록 내용 */}
              <Editor
                block={block}
                pageId={page.id}
                isLast={page.blocks.length === 1}
                hasSectionChildren={false}
                isSectionCollapsed={false}
                onToggleSectionCollapse={() => {}}
                readMode={readMode}
              />

              {/* 리사이즈 핸들 — 캔버스 편집 모드일 때만 표시 */}
              {!readMode && editMode && (
                <>
                  <div
                    className="absolute top-2 bottom-2 -right-1 w-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-gray-300 hover:bg-purple-400"
                    style={{ cursor: 'ew-resize' }}
                    onMouseDown={(e) => handleResizeStart(e, block.id, 'right', blockW, blockH, block.canvasX!)}
                    title="너비 조절"
                  />
                  <div
                    className="absolute left-2 right-2 -bottom-1 h-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-gray-300 hover:bg-purple-400"
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) => handleResizeStart(e, block.id, 'bottom', blockW, blockH, block.canvasX!)}
                    title="높이 조절"
                  />
                  <div
                    className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm bg-purple-400 hover:bg-purple-600"
                    style={{ cursor: 'nwse-resize' }}
                    onMouseDown={(e) => handleResizeStart(e, block.id, 'corner', blockW, blockH, block.canvasX!)}
                    title="크기 조절"
                  />
                </>
              )}
            </div>
          )
        })}

        {/* 빈 캔버스 mousedown → 박스 그리기 시작 (편집 모드에서만) */}
        {/* 짧은 클릭(드래그 거리 <10px)은 mouseup에서 addBlock 호출 */}
        {/* Python으로 치면: if edit_mode: canvas.on_mousedown = start_box_draw */}
        {!readMode && editMode && (
          <div
            className="absolute inset-0"
            style={{ zIndex: 1, cursor: drawingBox ? 'crosshair' : 'default' }}
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return
              e.preventDefault()
              const canvas = canvasDivRef.current
              if (!canvas) return
              const rect = canvas.getBoundingClientRect()
              const sx = snap(Math.max(0, e.clientX - rect.left))
              const sy = snap(Math.max(0, e.clientY - rect.top))
              setDrawingBox({ startX: sx, startY: sy, curX: sx, curY: sy })
            }}
          />
        )}
      </div>
    </div>
  )
}
