// =============================================
// src/components/editor/CanvasBlock.tsx
// 역할: 옵시디언 캔버스 스타일의 무한 캔버스 블록
// Python으로 치면: class CanvasBlock: 노드 + 엣지 + 뷰포트 관리
// =============================================

'use client'

import { useState, useRef, useCallback, useEffect, useId } from 'react'

// ──────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────
type Side = 'top' | 'bottom' | 'left' | 'right'
type NodeColor = '' | '1' | '2' | '3' | '4' | '5' | '6'
// 노드 타입: 헤딩 레벨 + 단락 (계층 구조 기준)
// Python으로 치면: NodeType = Literal['h1', 'h2', 'h3', 'paragraph']
type NodeType = 'h1' | 'h2' | 'h3' | 'paragraph'

// 접힌 자식 노드 정보: 부모 기준 상대 좌표 + 원본 노드 데이터
interface CollapsedChild {
  id: string
  relX: number   // 부모 x 기준 상대 좌표
  relY: number   // 부모 y 기준 상대 좌표
  node: CanvasNode
}

interface CanvasNode {
  id: string; x: number; y: number
  width: number; height: number
  text: string; color: NodeColor
  nodeType: NodeType           // 계층 타입 (기본값: 'paragraph')
  collapsed: boolean           // 접힘 여부
  collapsedChildren: CollapsedChild[]  // 접힐 때 저장되는 자식 목록
}

interface CanvasEdge {
  id: string
  fromNode: string; fromSide: Side
  toNode: string;   toSide: Side
}

interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

interface Viewport { x: number; y: number; scale: number }

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────
const SNAP_GRID = 20       // 그리드 스냅 단위 (px)
const SNAP_NODE_THR = 12   // 노드 스냅 감지 거리

// ──────────────────────────────────────────────
// 색상 테마
// ──────────────────────────────────────────────
const NODE_STYLES: Record<NodeColor, { bg: string; border: string; header: string }> = {
  '':  { bg: 'bg-white',     border: 'border-gray-200',   header: 'bg-gray-50'    },
  '1': { bg: 'bg-red-50',    border: 'border-red-200',    header: 'bg-red-100'    },
  '2': { bg: 'bg-orange-50', border: 'border-orange-200', header: 'bg-orange-100' },
  '3': { bg: 'bg-yellow-50', border: 'border-yellow-200', header: 'bg-yellow-100' },
  '4': { bg: 'bg-green-50',  border: 'border-green-200',  header: 'bg-green-100'  },
  '5': { bg: 'bg-cyan-50',   border: 'border-cyan-200',   header: 'bg-cyan-100'   },
  '6': { bg: 'bg-purple-50', border: 'border-purple-200', header: 'bg-purple-100' },
}

const COLOR_OPTIONS: NodeColor[] = ['', '1', '2', '3', '4', '5', '6']

// 노드 타입별 텍스트 스타일 (fontSize, fontWeight)
// Python으로 치면: NODE_TYPE_STYLE = {'h1': {'size': '1.1rem', 'weight': 700}, ...}
const NODE_TYPE_STYLE: Record<NodeType, { fontSize: string; fontWeight: number }> = {
  h1:        { fontSize: '1.1rem',  fontWeight: 700 },
  h2:        { fontSize: '0.95rem', fontWeight: 600 },
  h3:        { fontSize: '0.85rem', fontWeight: 600 },
  paragraph: { fontSize: '0.8rem',  fontWeight: 400 },
}
// 타입 선택 버튼 레이블
const NODE_TYPE_LABELS: Record<NodeType, string> = { h1:'H1', h2:'H2', h3:'H3', paragraph:'P' }
const NODE_TYPES: NodeType[] = ['h1', 'h2', 'h3', 'paragraph']

const DOT_CLASS: Record<NodeColor, string> = {
  '':  'bg-white border border-gray-300', '1': 'bg-red-400',   '2': 'bg-orange-400',
  '3': 'bg-yellow-400',                   '4': 'bg-green-400', '5': 'bg-cyan-400',
  '6': 'bg-purple-400',
}

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

// 노드 면의 연결 앵커 좌표 계산
function getAnchor(node: CanvasNode, side: Side) {
  const cx = node.x + node.width / 2, cy = node.y + node.height / 2
  if (side === 'top')    return { x: cx,                 y: node.y }
  if (side === 'bottom') return { x: cx,                 y: node.y + node.height }
  if (side === 'left')   return { x: node.x,             y: cy }
  /* right */            return { x: node.x + node.width, y: cy }
}

// 큐빅 베지어 SVG path
function bezier(from: {x:number;y:number}, fSide: Side, to: {x:number;y:number}, tSide: Side) {
  const C = 80
  const D: Record<Side,[number,number]> = { top:[0,-1], bottom:[0,1], left:[-1,0], right:[1,0] }
  const [fx,fy]=D[fSide], [tx,ty]=D[tSide]
  return `M ${from.x} ${from.y} C ${from.x+fx*C} ${from.y+fy*C},${to.x+tx*C} ${to.y+ty*C},${to.x} ${to.y}`
}

// 그리드 스냅
function snapG(v: number) { return Math.round(v / SNAP_GRID) * SNAP_GRID }

// 노드 스냅 — 다른 노드 정렬선에 맞추기
// Python으로 치면: def snap_to_nodes(id, nx, ny, nw, nh, nodes): → (x, y, guideX, guideY)
function snapNodes(
  id: string, nx: number, ny: number, nw: number, nh: number,
  all: CanvasNode[], thr: number
): { x: number; y: number; gx: number|null; gy: number|null } {
  let x = nx, y = ny, gx: number|null = null, gy: number|null = null
  for (const o of all) {
    if (o.id === id) continue
    for (const [sx, lx] of [
      [o.x,                      o.x],
      [o.x + o.width/2 - nw/2,  o.x + o.width/2],
      [o.x + o.width - nw,      o.x + o.width],
    ] as [number,number][]) {
      if (Math.abs(nx - sx) < thr) { x = sx; gx = lx; break }
    }
    for (const [sy, ly] of [
      [o.y,                       o.y],
      [o.y + o.height/2 - nh/2,  o.y + o.height/2],
      [o.y + o.height - nh,      o.y + o.height],
    ] as [number,number][]) {
      if (Math.abs(ny - sy) < thr) { y = sy; gy = ly; break }
    }
  }
  return { x, y, gx, gy }
}

// ──────────────────────────────────────────────
// 읽기 순서 정렬 — 위→아래, 왼쪽→오른쪽
// Python으로 치면: def reading_order_sort(nodes, row_gap=40): → sorted nodes
// ──────────────────────────────────────────────
const ROW_GAP = 40  // 같은 행으로 판단하는 Y 차이 임계값 (px)

// 노드 타입 → 계층 레벨 숫자 (낮을수록 상위)
// Python으로 치면: NODE_LEVEL = {'h1': 1, 'h2': 2, 'h3': 3, 'paragraph': 4}
const NODE_LEVEL: Record<NodeType, number> = { h1: 1, h2: 2, h3: 3, paragraph: 4 }

// 읽기 순서 정렬
// 1) Y 차이 < ROW_GAP 이면 같은 행으로 그룹핑
// 2) 행 내부: X 오름차순
// 3) 행 간: 행 대표 Y 오름차순
function readingOrderSort(nodes: CanvasNode[]): CanvasNode[] {
  if (nodes.length === 0) return []
  // Y 오름차순 1차 정렬
  const sorted = [...nodes].sort((a, b) => a.y - b.y)
  // 행 그룹핑
  const rows: CanvasNode[][] = []
  for (const node of sorted) {
    const lastRow = rows[rows.length - 1]
    if (!lastRow || Math.abs(node.y - lastRow[0].y) >= ROW_GAP) {
      rows.push([node])
    } else {
      lastRow.push(node)
    }
  }
  // 행 내부 X 오름차순
  for (const row of rows) row.sort((a, b) => a.x - b.x)
  return rows.flat()
}

// 정렬된 배열에서 targetId 노드의 직계 자식 목록 반환
// 계층: h1 > h2 > h3 > paragraph
// 자식 범위: target 다음 인덱스부터 같은 레벨 이상 노드 직전까지
// Python으로 치면: def get_children(target_id, nodes): → list[CanvasNode]
function getChildren(targetId: string, nodes: CanvasNode[]): CanvasNode[] {
  const idx = nodes.findIndex(n => n.id === targetId)
  if (idx === -1) return []
  const parentLevel = NODE_LEVEL[nodes[idx].nodeType]
  const children: CanvasNode[] = []
  for (let i = idx + 1; i < nodes.length; i++) {
    if (NODE_LEVEL[nodes[i].nodeType] <= parentLevel) break
    children.push(nodes[i])
  }
  return children
}

// JSON 파싱 — 기존 데이터에 nodeType/collapsed/collapsedChildren 기본값 보정
// Python으로 치면: def parse_canvas(s): return {**defaults, **parsed}
function parseCanvas(s: string): CanvasData {
  try {
    const p = JSON.parse(s)
    const nodes: CanvasNode[] = Array.isArray(p.nodes)
      ? p.nodes.map((n: Partial<CanvasNode>) => ({
          ...n,
          nodeType:          n.nodeType          ?? 'paragraph',
          collapsed:         n.collapsed         ?? false,
          collapsedChildren: n.collapsedChildren ?? [],
        }))
      : []
    return { nodes, edges: Array.isArray(p.edges) ? p.edges : [] }
  } catch { return { nodes: [], edges: [] } }
}

// ──────────────────────────────────────────────
// ConnectHandle — 모듈 레벨 컴포넌트
// (내부 정의 시 매 렌더마다 unmount/remount 발생 → 이벤트 누락 버그)
// Python으로 치면: class ConnectHandle(Component): side → position_style
// ──────────────────────────────────────────────
const HANDLE_POS: Record<Side, string> = {
  top:    'top-0    left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
  left:   'left-0  top-1/2  -translate-x-1/2 -translate-y-1/2',
  right:  'right-0 top-1/2   translate-x-1/2 -translate-y-1/2',
}

interface ConnectHandleProps {
  nodeId: string; side: Side
  onDown: (e: React.MouseEvent, nodeId: string, side: Side) => void
  onUp:   (e: React.MouseEvent, nodeId: string, side: Side) => void
}
function ConnectHandle({ nodeId, side, onDown, onUp }: ConnectHandleProps) {
  return (
    <div
      className={[
        'absolute w-3 h-3 rounded-full border-2 border-blue-500 bg-white z-20',
        'opacity-0 group-hover:opacity-100 cursor-crosshair transition-opacity hover:scale-125',
        HANDLE_POS[side],
      ].join(' ')}
      onMouseDown={(e) => onDown(e, nodeId, side)}
      onMouseUp={(e)   => onUp(e, nodeId, side)}
      title="드래그하여 연결"
    />
  )
}

// ──────────────────────────────────────────────
// ResizeHandle — 모듈 레벨 컴포넌트
// Python으로 치면: class ResizeHandle(Component): drag → update node size
// ──────────────────────────────────────────────
interface ResizeHandleProps {
  nodeId: string
  dataRef:      React.MutableRefObject<CanvasData>
  viewportRef:  React.MutableRefObject<Viewport>
  saveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  onChangeRef:  React.MutableRefObject<(s: string) => void>
  setData:      React.Dispatch<React.SetStateAction<CanvasData>>
}
function ResizeHandle({ nodeId, dataRef, viewportRef, saveTimerRef, onChangeRef, setData }: ResizeHandleProps) {
  const rr = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null)

  function onDown(e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault()
    const node = dataRef.current.nodes.find(n => n.id === nodeId)
    if (!node) return
    rr.current = { sx: e.clientX, sy: e.clientY, ow: node.width, oh: node.height }

    function onMove(ev: MouseEvent) {
      if (!rr.current) return
      const sc = viewportRef.current.scale
      const nw = Math.max(120, rr.current.ow + (ev.clientX - rr.current.sx) / sc)
      const nh = Math.max(60,  rr.current.oh + (ev.clientY - rr.current.sy) / sc)
      // setData 함수형 업데이트로 stale closure 방지
      setData(prev => {
        const nd = { ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, width: nw, height: nh } : n) }
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => onChangeRef.current(JSON.stringify(nd)), 200)
        return nd
      })
    }
    function onUp() {
      rr.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-60 transition-opacity z-10"
      onMouseDown={onDown}
      title="크기 조절"
      style={{ background: 'linear-gradient(135deg, transparent 50%, #94a3b8 50%)' }}
    />
  )
}

// ──────────────────────────────────────────────
// CanvasBlock — 메인 컴포넌트
// ──────────────────────────────────────────────
interface CanvasBlockProps {
  blockId: string
  content: string
  onChange: (s: string) => void
  readMode?: boolean  // 읽기/잠금 모드 — true면 팬/줌/편집 모두 비활성화
}

export default function CanvasBlock({ blockId: _blockId, content, onChange, readMode }: CanvasBlockProps) {
  // readMode ref — 렌더 시점에 직접 업데이트 (useEffect보다 빠름, stale closure 방지)
  // Python으로 치면: self._read_mode = read_mode  # 항상 최신값 보장
  const readModeRef = useRef(readMode)
  readModeRef.current = readMode

  const [data, setData]           = useState<CanvasData>(() => parseCanvas(content))
  const [viewport, setViewport]   = useState<Viewport>({ x: 0, y: 0, scale: 1.0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [snapGrid, setSnapGrid]   = useState(false)
  const [snapNode, setSnapNode]   = useState(false)
  const [guideX, setGuideX]       = useState<number | null>(null)
  const [guideY, setGuideY]       = useState<number | null>(null)
  const [showToc, setShowToc]     = useState(false)  // 미니 TOC 패널 표시 여부

  // ── 엣지 그리기 상태 ──
  // Python으로 치면: self.drawing_edge = None
  const [drawingEdge, setDrawingEdge] = useState<{
    fromNode: string; fromSide: Side; toX: number; toY: number
  } | null>(null)

  // ── Stale closure 방지 ref ──
  // Python으로 치면: self._data = data; self._viewport = viewport (always fresh)
  const dataRef       = useRef(data)
  const viewportRef   = useRef(viewport)
  const onChangeRef   = useRef(onChange)
  useEffect(() => { dataRef.current     = data      }, [data])
  useEffect(() => { viewportRef.current = viewport  }, [viewport])
  useEffect(() => { onChangeRef.current = onChange  }, [onChange])

  // 드래그 상태 ref (pan / node move)
  // childOffsets: 그룹 이동 시 자식 노드들의 원본 좌표
  // Python으로 치면: self.drag = {type, start, origin, child_offsets}
  const dragRef = useRef<{
    type: 'pan'|'node'; sx: number; sy: number; ox: number; oy: number; nodeId?: string
    childOffsets: { id: string; ox: number; oy: number }[]
  } | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const markerId = `arrow-${uid}`

  // ──────────────────────────────────────────────
  // 저장 (debounce 200ms)
  // ──────────────────────────────────────────────
  const saveData = useCallback((nd: CanvasData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => onChange(JSON.stringify(nd)), 200)
  }, [onChange])

  // ──────────────────────────────────────────────
  // 휠 줌 — non-passive 리스너 (React onWheel은 passive 기본값)
  // Python으로 치면: canvas.bind('<MouseWheel>', zoom_toward_cursor)
  // ──────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      // 읽기/잠금 모드에서는 휠 줌 비활성화
      if (readModeRef.current) return
      const f = e.deltaY < 0 ? 1.1 : 0.9
      const rect = el!.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setViewport(prev => {
        const s = Math.max(0.2, Math.min(3.0, prev.scale * f))
        return { x: mx - (mx - prev.x) * (s / prev.scale), y: my - (my - prev.y) * (s / prev.scale), scale: s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ──────────────────────────────────────────────
  // Delete 키 → 선택된 노드 삭제
  // ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 읽기/잠금 모드에서는 노드 삭제 비활성화
      if (readModeRef.current) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !editingId) {
        setData(prev => {
          const nd = {
            nodes: prev.nodes.filter(n => n.id !== selectedId),
            edges: prev.edges.filter(e => e.fromNode !== selectedId && e.toNode !== selectedId),
          }
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(() => onChangeRef.current(JSON.stringify(nd)), 200)
          return nd
        })
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, editingId])

  // ──────────────────────────────────────────────
  // 전역 mouseup — 드래그/엣지 그리기 종료 + 읽기 순서 재정렬
  // 노드 이동 후 배열을 읽기 순서(Y행 그룹핑→X)로 재정렬하여
  // 계층 구조가 시각적 배치와 일치하도록 유지
  // Python으로 치면: def on_mouseup(): sort_nodes(); save()
  // ──────────────────────────────────────────────
  useEffect(() => {
    const onUp = () => {
      const wasNodeDrag = dragRef.current?.type === 'node'
      dragRef.current = null
      setDrawingEdge(null)
      setGuideX(null); setGuideY(null)
      // 노드 드래그 후 읽기 순서로 배열 재정렬
      if (wasNodeDrag) {
        setData(prev => {
          const sorted = readingOrderSort(prev.nodes)
          const nd = { ...prev, nodes: sorted }
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(() => onChangeRef.current(JSON.stringify(nd)), 200)
          return nd
        })
      }
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  // ──────────────────────────────────────────────
  // 화면 → 캔버스 좌표 변환
  // ──────────────────────────────────────────────
  const toCanvas = useCallback((sx: number, sy: number, vp = viewportRef.current) => {
    const r = containerRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: (sx - r.left - vp.x) / vp.scale, y: (sy - r.top - vp.y) / vp.scale }
  }, [])

  // ──────────────────────────────────────────────
  // 노드 추가 (더블클릭)
  // ──────────────────────────────────────────────
  const addNode = useCallback((sx: number, sy: number) => {
    // 읽기/잠금 모드에서는 노드 추가 비활성화
    if (readModeRef.current) return
    const pos = toCanvas(sx, sy)
    const nn: CanvasNode = {
      id: crypto.randomUUID(), x: pos.x-90, y: pos.y-40,
      width: 180, height: 80, text: '', color: '',
      nodeType: 'paragraph', collapsed: false, collapsedChildren: [],
    }
    setData(prev => { const nd = { ...prev, nodes: [...prev.nodes, nn] }; saveData(nd); return nd })
    setSelectedId(nn.id); setEditingId(nn.id)
  }, [toCanvas, saveData])

  // ──────────────────────────────────────────────
  // 마우스 다운 — 팬 시작 (캔버스 빈 곳)
  // ──────────────────────────────────────────────
  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelectedId(null); setEditingId(null); setColorPickerId(null)
    // 읽기/잠금 모드에서는 팬 비활성화
    if (readModeRef.current) return
    dragRef.current = { type:'pan', sx:e.clientX, sy:e.clientY, ox:viewport.x, oy:viewport.y, childOffsets:[] }
    e.preventDefault()
  }, [viewport.x, viewport.y])

  // ──────────────────────────────────────────────
  // 마우스 다운 — 노드 이동 시작
  // ──────────────────────────────────────────────
  const onNodeDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelectedId(nodeId); setColorPickerId(null)
    // 읽기/잠금 모드에서는 노드 이동 비활성화
    if (readModeRef.current) return
    const sorted = readingOrderSort(dataRef.current.nodes)
    const node = sorted.find(n => n.id === nodeId)
    if (!node) return
    // 자식 노드 원본 좌표 캐싱 (그룹 이동용)
    const children = getChildren(nodeId, sorted)
    const childOffsets = children.map(c => ({ id: c.id, ox: c.x, oy: c.y }))
    dragRef.current = { type:'node', sx:e.clientX, sy:e.clientY, ox:node.x, oy:node.y, nodeId, childOffsets }
    e.preventDefault()
  }, [data.nodes])

  // ──────────────────────────────────────────────
  // 마우스 이동 — 팬 / 노드 드래그 / 엣지 선 업데이트
  //
  // ★ 핵심: drawingEdge 업데이트를 drag early-return 앞에 실행
  //   엣지 드래그 중 dragRef.current = null → 기존엔 early return으로 선 미갱신
  // Python으로 치면: def on_move(e): update_edge_line(); if drag: move_pan_or_node()
  // ──────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // 엣지 그리기 선 업데이트 — setDrawingEdge 함수형으로 drawingEdge 의존성 제거
    setDrawingEdge(prev => prev ? {
      ...prev,
      toX: (e.clientX - rect.left - viewportRef.current.x) / viewportRef.current.scale,
      toY: (e.clientY - rect.top  - viewportRef.current.y) / viewportRef.current.scale,
    } : null)

    const drag = dragRef.current
    if (!drag) return

    if (drag.type === 'pan') {
      setViewport(prev => ({ ...prev, x: drag.ox + (e.clientX-drag.sx), y: drag.oy + (e.clientY-drag.sy) }))
    } else if (drag.type === 'node' && drag.nodeId) {
      const sc = viewportRef.current.scale
      let nx = drag.ox + (e.clientX - drag.sx) / sc
      let ny = drag.oy + (e.clientY - drag.sy) / sc

      if (snapGrid) { nx = snapG(nx); ny = snapG(ny) }

      let newGx: number|null = null, newGy: number|null = null
      if (snapNode) {
        const node = dataRef.current.nodes.find(n => n.id === drag.nodeId)
        if (node) {
          const r = snapNodes(drag.nodeId!, nx, ny, node.width, node.height, dataRef.current.nodes, SNAP_NODE_THR)
          nx = r.x; ny = r.y; newGx = r.gx; newGy = r.gy
        }
      }
      setGuideX(newGx); setGuideY(newGy)

      // 부모 이동량 (delta) — sc는 위에서 이미 계산됨
      const dx = (e.clientX - drag.sx) / sc
      const dy = (e.clientY - drag.sy) / sc
      setData(prev => {
        const nd = {
          ...prev,
          nodes: prev.nodes.map(n => {
            if (n.id === drag.nodeId) return { ...n, x: nx, y: ny }
            // 자식 노드: 원본 좌표 + 부모와 동일한 delta
            const co = drag.childOffsets.find(c => c.id === n.id)
            if (co) return { ...n, x: co.ox + dx, y: co.oy + dy }
            return n
          }),
        }
        saveData(nd)
        return nd
      })
    }
  }, [snapGrid, snapNode, saveData])

  // ──────────────────────────────────────────────
  // 연결 핸들 DOWN — 엣지 그리기 시작
  // Python으로 치면: def on_handle_down(nid, side): start_draw(from_anchor)
  // ──────────────────────────────────────────────
  const onConnectStart = useCallback((e: React.MouseEvent, nodeId: string, side: Side) => {
    e.stopPropagation(); e.preventDefault()
    const node = dataRef.current.nodes.find(n => n.id === nodeId)
    if (!node) return
    const a = getAnchor(node, side)
    setDrawingEdge({ fromNode: nodeId, fromSide: side, toX: a.x, toY: a.y })
  }, [])

  // ──────────────────────────────────────────────
  // 연결 핸들 UP — 엣지 완성
  //
  // ★ drawingEdge를 deps에 포함해 closure에서 직접 읽기
  //   (ref 경유 시 useEffect 타이밍 문제로 null 읽힘)
  // Python으로 치면: def on_handle_up(nid, side): finish_edge(from_node, nid)
  // ──────────────────────────────────────────────
  const onConnectEnd = useCallback((e: React.MouseEvent, nodeId: string, side: Side) => {
    e.stopPropagation()
    if (!drawingEdge) return
    if (drawingEdge.fromNode === nodeId) { setDrawingEdge(null); return }
    const newEdge: CanvasEdge = {
      id: crypto.randomUUID(),
      fromNode: drawingEdge.fromNode, fromSide: drawingEdge.fromSide,
      toNode: nodeId, toSide: side,
    }
    setData(prev => {
      const dup = prev.edges.some(ex =>
        ex.fromNode === newEdge.fromNode && ex.fromSide === newEdge.fromSide &&
        ex.toNode   === newEdge.toNode   && ex.toSide   === newEdge.toSide
      )
      if (dup) return prev
      const nd = { ...prev, edges: [...prev.edges, newEdge] }
      saveData(nd)
      return nd
    })
    setDrawingEdge(null)
  }, [drawingEdge, saveData])

  // ──────────────────────────────────────────────
  // 전체 보기
  // ──────────────────────────────────────────────
  const fitView = useCallback(() => {
    if (data.nodes.length === 0) { setViewport({ x:0, y:0, scale:1 }); return }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const xs = data.nodes.flatMap(n => [n.x, n.x+n.width])
    const ys = data.nodes.flatMap(n => [n.y, n.y+n.height])
    const mnX=Math.min(...xs), mxX=Math.max(...xs), mnY=Math.min(...ys), mxY=Math.max(...ys)
    const P=60, s=Math.max(0.2,Math.min(1.5,Math.min(rect.width/(mxX-mnX+P*2),rect.height/(mxY-mnY+P*2))))
    setViewport({ x:(rect.width-(mxX-mnX)*s)/2-mnX*s, y:(rect.height-(mxY-mnY)*s)/2-mnY*s, scale:s })
  }, [data.nodes])

  // ──────────────────────────────────────────────
  // 노드 텍스트/색상 업데이트
  // ──────────────────────────────────────────────
  const updateText  = useCallback((id:string,text:string) =>
    setData(prev => { const nd={...prev,nodes:prev.nodes.map(n=>n.id===id?{...n,text}:n)}; saveData(nd); return nd }), [saveData])
  // 노드 타입 변경 (H1/H2/H3/단락)
  const updateNodeType = useCallback((id:string, nodeType:NodeType) =>
    setData(prev => { const nd={...prev,nodes:prev.nodes.map(n=>n.id===id?{...n,nodeType}:n)}; saveData(nd); return nd }), [saveData])
  const updateColor = useCallback((id:string,color:NodeColor) => {
    setData(prev => { const nd={...prev,nodes:prev.nodes.map(n=>n.id===id?{...n,color}:n)}; saveData(nd); return nd })
    setColorPickerId(null)
  }, [saveData])
  // ──────────────────────────────────────────────
  // 접기 — 자식 노드를 부모에 스택(숨김), 상대 좌표 저장
  // Python으로 치면: def collapse_node(id): save_children(); remove_from_canvas()
  // ──────────────────────────────────────────────
  const collapseNode = useCallback((id: string) => {
    setData(prev => {
      const sorted = readingOrderSort(prev.nodes)
      const parent = sorted.find(n => n.id === id)
      if (!parent) return prev
      const children = getChildren(id, sorted)
      if (children.length === 0) return prev
      const childIds = new Set(children.map(c => c.id))
      // 자식 상대 좌표 저장
      const collapsedChildren: CollapsedChild[] = children.map(c => ({
        id: c.id, relX: c.x - parent.x, relY: c.y - parent.y, node: c,
      }))
      const nd: CanvasData = {
        nodes: prev.nodes
          .filter(n => !childIds.has(n.id))
          .map(n => n.id === id ? { ...n, collapsed: true, collapsedChildren } : n),
        edges: prev.edges.filter(e => !childIds.has(e.fromNode) && !childIds.has(e.toNode)),
      }
      saveData(nd)
      return nd
    })
  }, [saveData])

  // ──────────────────────────────────────────────
  // 펼치기 — collapsedChildren 절대 좌표로 복원 → 읽기 순서 재정렬
  // Python으로 치면: def expand_node(id): restore_children(); sort_nodes()
  // ──────────────────────────────────────────────
  const expandNode = useCallback((id: string) => {
    setData(prev => {
      const parent = prev.nodes.find(n => n.id === id)
      if (!parent || !parent.collapsed) return prev
      // 자식 절대 좌표 복원 (부모 현재 위치 + 저장된 상대 좌표)
      const restored: CanvasNode[] = parent.collapsedChildren.map(cc => ({
        ...cc.node, x: parent.x + cc.relX, y: parent.y + cc.relY,
        collapsed: false, collapsedChildren: [],
      }))
      const updatedNodes = prev.nodes
        .map(n => n.id === id ? { ...n, collapsed: false, collapsedChildren: [] } : n)
        .concat(restored)
      const nd: CanvasData = { ...prev, nodes: readingOrderSort(updatedNodes) }
      saveData(nd)
      return nd
    })
  }, [saveData])

  const deleteNode  = useCallback((id:string) => {
    setData(prev => {
      const nd={ nodes:prev.nodes.filter(n=>n.id!==id), edges:prev.edges.filter(e=>e.fromNode!==id&&e.toNode!==id) }
      saveData(nd); return nd
    })
    setSelectedId(null); setEditingId(null)
  }, [saveData])
  const deleteEdge  = useCallback((id:string) =>
    setData(prev => { const nd={...prev,edges:prev.edges.filter(e=>e.id!==id)}; saveData(nd); return nd }), [saveData])

  // 도트 그리드 오프셋
  const gs = SNAP_GRID * viewport.scale
  const gox = viewport.x % gs, goy = viewport.y % gs

  // 스냅 가이드라인 → 화면 좌표로 변환
  // Python으로 치면: screen_x = canvas_x * scale + offset_x
  const screenGx = guideX !== null ? guideX * viewport.scale + viewport.x : null
  const screenGy = guideY !== null ? guideY * viewport.scale + viewport.y : null

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 select-none print-hide"
      style={{ height: '480px' }}
      ref={containerRef}
      onMouseDown={onCanvasDown}
      onMouseMove={onMouseMove}
      onMouseUp={() => { dragRef.current = null }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.canvas-node')) return
        addNode(e.clientX, e.clientY)
      }}
    >
      {/* ── 도트 그리드 배경 ────────────────────── */}
      <svg className="absolute inset-0 pointer-events-none" style={{width:'100%',height:'100%'}} aria-hidden>
        <defs>
          <pattern id={`g-${uid}`} x={gox} y={goy} width={gs} height={gs} patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#g-${uid})`} />
      </svg>

      {/* ── 스냅 가이드라인 오버레이 (화면 좌표 — transform 레이어 밖) ──
           SVG를 transform 레이어 안에 두면 overflow:hidden에 클리핑됨
           화면 좌표로 변환해 별도 렌더링
           Python으로 치면: draw_guide_line(screen_x, screen_y) */}
      {snapNode && (screenGx !== null || screenGy !== null) && (
        <svg className="absolute inset-0 pointer-events-none z-30" style={{width:'100%',height:'100%'}}>
          {screenGx !== null && (
            <line x1={screenGx} y1={0} x2={screenGx} y2={480} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 3" />
          )}
          {screenGy !== null && (
            <line x1={0} y1={screenGy} x2={2000} y2={screenGy} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 3" />
          )}
        </svg>
      )}

      {/* ── 변환 레이어 (팬/줌) ─────────────────── */}
      <div
        className="absolute inset-0"
        style={{ transform:`translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`, transformOrigin:'0 0' }}
      >
        {/* ── SVG 엣지 레이어 ──────────────────── */}
        {/* width:0/height:0은 일부 브라우저에서 overflow-visible 무시 → 100%로 수정 */}
        <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{width:'100%',height:'100%'}}>
          <defs>
            <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 z" fill="#9ca3af" />
            </marker>
          </defs>

          {/* 기존 엣지 */}
          {data.edges.map(edge => {
            const fn = data.nodes.find(n=>n.id===edge.fromNode)
            const tn = data.nodes.find(n=>n.id===edge.toNode)
            if (!fn || !tn) return null
            const d = bezier(getAnchor(fn,edge.fromSide), edge.fromSide, getAnchor(tn,edge.toSide), edge.toSide)
            return (
              <g key={edge.id}>
                <path d={d} stroke="transparent" strokeWidth="14" fill="none"
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e)=>{e.stopPropagation();deleteEdge(edge.id)}} aria-label="클릭하여 연결 삭제" />
                <path d={d} stroke="#9ca3af" strokeWidth="2" fill="none" markerEnd={`url(#${markerId})`}
                  className="pointer-events-none" />
              </g>
            )
          })}

          {/* 그리는 중인 임시 엣지 */}
          {drawingEdge && (() => {
            const fn = data.nodes.find(n=>n.id===drawingEdge.fromNode)
            if (!fn) return null
            const d = bezier(getAnchor(fn,drawingEdge.fromSide), drawingEdge.fromSide, {x:drawingEdge.toX,y:drawingEdge.toY}, 'left')
            return <path d={d} stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 3" fill="none"
              markerEnd={`url(#${markerId})`} className="pointer-events-none" />
          })()}
        </svg>

        {/* ── 노드 렌더링 ──────────────────────── */}
        {data.nodes.map(node => {
          const isSel  = selectedId === node.id
          const isEdit = editingId  === node.id
          const C = NODE_STYLES[node.color]
          return (
            <div key={node.id}
              className={['canvas-node absolute rounded-lg border shadow-sm group',C.bg,C.border,isSel?'ring-2 ring-blue-400 shadow-md':''].join(' ')}
              style={{ left:node.x, top:node.y, width:node.width, height:node.height, cursor:isEdit?'text':'grab' }}
              onMouseDown={(e) => onNodeDown(e, node.id)}
              onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(node.id); if (!readMode) setEditingId(node.id) }}
            >
              {/* 헤더: 색상 · 타입선택 · 접기 · 삭제 (readMode에서는 접기만 표시) */}
              <div className={['flex items-center gap-1 px-2 py-1 rounded-t-lg border-b',C.border,C.header].join(' ')} style={{fontSize:'10px'}}>
                {/* 색상 버튼 — readMode에서 숨김 */}
                {!readMode && (
                  <button type="button"
                    className="w-3 h-3 rounded-full border border-white/60 shadow-sm shrink-0"
                    onClick={(e)=>{e.stopPropagation();setColorPickerId(p=>p===node.id?null:node.id)}}
                    title="색상 변경"
                  >
                    {node.color && <span className={`block w-full h-full rounded-full ${NODE_STYLES[node.color].header}`} />}
                  </button>
                )}

                {/* 타입 선택 버튼 (H1/H2/H3/P) — readMode에서 숨김 */}
                {!readMode && (
                  <div className={['flex gap-0.5 transition-opacity',isSel?'opacity-100':'opacity-0 group-hover:opacity-70'].join(' ')}>
                    {NODE_TYPES.map(t => (
                      <button key={t} type="button"
                        className={['px-1 rounded leading-none font-medium transition-colors',
                          node.nodeType===t
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-500 hover:bg-gray-200'
                        ].join(' ')}
                        style={{fontSize:'9px'}}
                        onClick={(e)=>{e.stopPropagation();updateNodeType(node.id,t)}}
                        title={`타입: ${NODE_TYPE_LABELS[t]}`}
                      >{NODE_TYPE_LABELS[t]}</button>
                    ))}
                  </div>
                )}

                {/* 접기/펼치기 버튼 — H1/H2/H3만, readMode에서도 허용 */}
                {node.nodeType !== 'paragraph' && (
                  <button type="button"
                    className={['ml-auto transition-opacity text-gray-400 hover:text-blue-500 leading-none px-0.5',
                      isSel?'opacity-70':'opacity-0 group-hover:opacity-40'].join(' ')}
                    style={{fontSize:'10px'}}
                    onClick={(e)=>{
                      e.stopPropagation()
                      node.collapsed ? expandNode(node.id) : collapseNode(node.id)
                    }}
                    title={node.collapsed ? '펼치기' : '접기'}
                  >{node.collapsed ? '▶' : '▼'}</button>
                )}

                {/* 삭제 버튼 — readMode에서 숨김 */}
                {!readMode && (
                  <button type="button"
                    className={['transition-opacity text-gray-400 hover:text-red-500 leading-none',
                      node.nodeType==='paragraph'?'ml-auto':'',
                      isSel?'opacity-70':'opacity-0 group-hover:opacity-40'].join(' ')}
                    onClick={(e)=>{e.stopPropagation();deleteNode(node.id)}}
                    title="노드 삭제 (Delete)"
                  >×</button>
                )}
              </div>

              {/* 내용 — 타입별 폰트 스타일 적용 */}
              <div className="p-2 overflow-hidden" style={{height:`${node.height-30}px`}}>
                {isEdit && !readMode ? (
                  <textarea autoFocus
                    className="w-full h-full resize-none bg-transparent focus:outline-none text-gray-800"
                    style={NODE_TYPE_STYLE[node.nodeType]}
                    value={node.text}
                    onChange={(e)=>updateText(node.id,e.target.value)}
                    onBlur={()=>setEditingId(null)}
                    onMouseDown={(e)=>e.stopPropagation()}
                    onClick={(e)=>e.stopPropagation()}
                    placeholder="내용을 입력하세요..."
                  />
                ) : (
                  <p className="leading-snug whitespace-pre-wrap wrap-break-word overflow-hidden text-gray-700"
                    style={NODE_TYPE_STYLE[node.nodeType]}>
                    {node.text || (!readMode && <span className="text-gray-300 italic" style={{fontSize:'0.7rem'}}>더블클릭으로 편집</span>)}
                  </p>
                )}
              </div>

              {/* 연결 핸들 · 리사이즈 핸들 — readMode에서 숨김 */}
              {!readMode && (['top','bottom','left','right'] as Side[]).map(s => (
                <ConnectHandle key={s} nodeId={node.id} side={s} onDown={onConnectStart} onUp={onConnectEnd} />
              ))}
              {!readMode && (
                <ResizeHandle
                  nodeId={node.id}
                  dataRef={dataRef}
                  viewportRef={viewportRef}
                  saveTimerRef={saveTimerRef}
                  onChangeRef={onChangeRef}
                  setData={setData}
                />
              )}

              {/* 색상 피커 */}
              {colorPickerId === node.id && (
                <div
                  className="absolute left-0 top-7 z-30 flex gap-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5"
                  onMouseDown={(e)=>e.stopPropagation()}
                >
                  {COLOR_OPTIONS.map(c => (
                    <button key={c||'df'} type="button"
                      className={['w-5 h-5 rounded-full transition-transform hover:scale-110',DOT_CLASS[c],node.color===c?'ring-2 ring-blue-400 ring-offset-1':''].join(' ')}
                      onClick={(e)=>{e.stopPropagation();updateColor(node.id,c)}}
                      title={c?`색상 ${c}`:'기본색'}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 툴바 ─────────────────────────────────── */}
      <div
        className="absolute top-2 right-2 flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-2 py-1 shadow-sm z-20"
        onMouseDown={(e)=>e.stopPropagation()}
      >
        <button type="button"
          className={['text-xs px-1.5 py-0.5 rounded transition-colors font-medium',
            snapGrid?'bg-blue-100 text-blue-600':'text-gray-400 hover:text-gray-700 hover:bg-gray-100'].join(' ')}
          onClick={()=>setSnapGrid(p=>!p)} title={snapGrid?'그리드 스냅 끄기':'그리드에 맞추기'}
        >그리드</button>
        <button type="button"
          className={['text-xs px-1.5 py-0.5 rounded transition-colors font-medium',
            snapNode?'bg-blue-100 text-blue-600':'text-gray-400 hover:text-gray-700 hover:bg-gray-100'].join(' ')}
          onClick={()=>setSnapNode(p=>!p)} title={snapNode?'카드 스냅 끄기':'카드에 맞추기'}
        >카드</button>
        <span className="text-gray-200 text-xs">|</span>
        {/* TOC 토글 버튼 */}
        <button type="button"
          className={['text-xs px-1.5 py-0.5 rounded transition-colors font-medium',
            showToc?'bg-blue-100 text-blue-600':'text-gray-400 hover:text-gray-700 hover:bg-gray-100'].join(' ')}
          onClick={()=>setShowToc(p=>!p)} title="목차 보기">목차</button>
        <span className="text-gray-200 text-xs">|</span>
        <button type="button"
          className="text-xs text-gray-400 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors"
          onClick={fitView} title="전체 보기">⊞</button>
        <button type="button"
          className="text-xs text-gray-400 hover:text-gray-700 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
          onClick={()=>setViewport(p=>({...p,scale:Math.max(0.2,p.scale/1.25)}))}>−</button>
        <span className="text-xs text-gray-400 w-9 text-center tabular-nums">{Math.round(viewport.scale*100)}%</span>
        <button type="button"
          className="text-xs text-gray-400 hover:text-gray-700 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
          onClick={()=>setViewport(p=>({...p,scale:Math.min(3.0,p.scale*1.25)}))}>+</button>
      </div>

      {/* ── 미니 TOC 패널 (좌상단) ─────────────────
           읽기 순서 정렬 후 H1/H2/H3 노드만 추출하여 목차로 표시
           클릭 시 해당 노드가 화면 중앙으로 이동 (viewport 이동)
           Python으로 치면: toc = [n for n in sorted_nodes if n.type in ('h1','h2','h3')] */}
      {showToc && (
        <div
          className="absolute top-2 left-2 z-20 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm p-2 min-w-32 max-w-48 max-h-60 overflow-y-auto"
          onMouseDown={(e)=>e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-gray-500 mb-1.5 border-b border-gray-100 pb-1">목차</p>
          {(() => {
            // 읽기 순서로 정렬 후 헤딩만 필터
            const tocNodes = readingOrderSort(data.nodes).filter(n => n.nodeType !== 'paragraph')
            if (tocNodes.length === 0) return (
              <p className="text-xs text-gray-300 italic">헤딩 노드가 없습니다</p>
            )
            return tocNodes.map(n => {
              // 들여쓰기: h1=0, h2=8px, h3=16px
              const indent = { h1: 0, h2: 8, h3: 16, paragraph: 0 }[n.nodeType]
              return (
                <button key={n.id} type="button"
                  className="block w-full text-left text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors truncate"
                  style={{ paddingLeft: `${indent + 4}px`, fontWeight: n.nodeType==='h1'?600:400 }}
                  title={n.text || '(빈 노드)'}
                  onClick={() => {
                    // 해당 노드를 캔버스 중앙으로 viewport 이동
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (!rect) return
                    setViewport(prev => ({
                      ...prev,
                      x: rect.width  / 2 - (n.x + n.width  / 2) * prev.scale,
                      y: rect.height / 2 - (n.y + n.height / 2) * prev.scale,
                    }))
                    setSelectedId(n.id)
                  }}
                >
                  <span className="text-gray-300 mr-1" style={{fontSize:'8px'}}>
                    {n.nodeType.toUpperCase()}
                  </span>
                  {n.text || <span className="italic text-gray-300">빈 노드</span>}
                </button>
              )
            })
          })()}
        </div>
      )}

      {/* ── 빈 캔버스 안내 ───────────────────────── */}
      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-400">
            <div className="text-3xl mb-2">🖼️</div>
            <p className="text-sm font-medium">빈 캔버스</p>
            <p className="text-xs mt-1">더블클릭으로 카드를 추가하세요</p>
          </div>
        </div>
      )}

      {/* ── 상태 표시 (좌하단) ───────────────────── */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400 pointer-events-none flex items-center gap-2">
        <span>노드 {data.nodes.length}</span>
        <span className="text-gray-200">·</span>
        <span>연결 {data.edges.length}</span>
        {snapGrid && <span className="text-blue-400">그리드 ✓</span>}
        {snapNode && <span className="text-blue-400">카드 ✓</span>}
      </div>
    </div>
  )
}
