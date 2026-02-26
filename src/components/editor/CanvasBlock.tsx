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

interface CanvasNode {
  id: string; x: number; y: number
  width: number; height: number
  text: string; color: NodeColor
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

// JSON 파싱
function parseCanvas(s: string): CanvasData {
  try {
    const p = JSON.parse(s)
    return { nodes: Array.isArray(p.nodes) ? p.nodes : [], edges: Array.isArray(p.edges) ? p.edges : [] }
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
}

export default function CanvasBlock({ blockId: _blockId, content, onChange }: CanvasBlockProps) {

  const [data, setData]           = useState<CanvasData>(() => parseCanvas(content))
  const [viewport, setViewport]   = useState<Viewport>({ x: 0, y: 0, scale: 1.0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [snapGrid, setSnapGrid]   = useState(false)
  const [snapNode, setSnapNode]   = useState(false)
  const [guideX, setGuideX]       = useState<number | null>(null)
  const [guideY, setGuideY]       = useState<number | null>(null)

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
  const dragRef = useRef<{
    type: 'pan'|'node'; sx: number; sy: number; ox: number; oy: number; nodeId?: string
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
  // 전역 mouseup — 드래그/엣지 그리기 종료
  // ──────────────────────────────────────────────
  useEffect(() => {
    const onUp = () => {
      dragRef.current = null
      setDrawingEdge(null)
      setGuideX(null); setGuideY(null)
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
    const pos = toCanvas(sx, sy)
    const nn: CanvasNode = { id: crypto.randomUUID(), x: pos.x-90, y: pos.y-40, width: 180, height: 80, text: '', color: '' }
    setData(prev => { const nd = { ...prev, nodes: [...prev.nodes, nn] }; saveData(nd); return nd })
    setSelectedId(nn.id); setEditingId(nn.id)
  }, [toCanvas, saveData])

  // ──────────────────────────────────────────────
  // 마우스 다운 — 팬 시작 (캔버스 빈 곳)
  // ──────────────────────────────────────────────
  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelectedId(null); setEditingId(null); setColorPickerId(null)
    dragRef.current = { type:'pan', sx:e.clientX, sy:e.clientY, ox:viewport.x, oy:viewport.y }
    e.preventDefault()
  }, [viewport.x, viewport.y])

  // ──────────────────────────────────────────────
  // 마우스 다운 — 노드 이동 시작
  // ──────────────────────────────────────────────
  const onNodeDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelectedId(nodeId); setColorPickerId(null)
    const node = data.nodes.find(n => n.id === nodeId)
    if (!node) return
    dragRef.current = { type:'node', sx:e.clientX, sy:e.clientY, ox:node.x, oy:node.y, nodeId }
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

      setData(prev => {
        const nd = { ...prev, nodes: prev.nodes.map(n => n.id === drag.nodeId ? {...n,x:nx,y:ny} : n) }
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
  const updateColor = useCallback((id:string,color:NodeColor) => {
    setData(prev => { const nd={...prev,nodes:prev.nodes.map(n=>n.id===id?{...n,color}:n)}; saveData(nd); return nd })
    setColorPickerId(null)
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
              onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(node.id); setEditingId(node.id) }}
            >
              {/* 헤더 */}
              <div className={['flex items-center justify-between px-2 py-1 rounded-t-lg border-b',C.border,C.header].join(' ')} style={{fontSize:'10px'}}>
                <button type="button"
                  className="w-3 h-3 rounded-full border border-white/60 shadow-sm"
                  onClick={(e)=>{e.stopPropagation();setColorPickerId(p=>p===node.id?null:node.id)}}
                  title="색상 변경"
                >
                  {node.color && <span className={`block w-full h-full rounded-full ${NODE_STYLES[node.color].header}`} />}
                </button>
                <button type="button"
                  className={['transition-opacity text-gray-400 hover:text-red-500 leading-none',isSel?'opacity-70':'opacity-0 group-hover:opacity-40'].join(' ')}
                  onClick={(e)=>{e.stopPropagation();deleteNode(node.id)}}
                  title="노드 삭제 (Delete)"
                >×</button>
              </div>

              {/* 내용 */}
              <div className="p-2 overflow-hidden" style={{height:`${node.height-28}px`}}>
                {isEdit ? (
                  <textarea autoFocus
                    className="w-full h-full resize-none bg-transparent text-sm text-gray-800 focus:outline-none"
                    value={node.text}
                    onChange={(e)=>updateText(node.id,e.target.value)}
                    onBlur={()=>setEditingId(null)}
                    onMouseDown={(e)=>e.stopPropagation()}
                    onClick={(e)=>e.stopPropagation()}
                    placeholder="내용을 입력하세요..."
                  />
                ) : (
                  <p className="text-sm text-gray-700 leading-snug whitespace-pre-wrap wrap-break-word overflow-hidden">
                    {node.text || <span className="text-gray-300 italic text-xs">더블클릭으로 편집</span>}
                  </p>
                )}
              </div>

              {/* 연결 핸들 — 모듈 레벨 컴포넌트 (unmount/remount 없음) */}
              {(['top','bottom','left','right'] as Side[]).map(s => (
                <ConnectHandle key={s} nodeId={node.id} side={s} onDown={onConnectStart} onUp={onConnectEnd} />
              ))}

              {/* 리사이즈 핸들 — 모듈 레벨 컴포넌트 */}
              <ResizeHandle
                nodeId={node.id}
                dataRef={dataRef}
                viewportRef={viewportRef}
                saveTimerRef={saveTimerRef}
                onChangeRef={onChangeRef}
                setData={setData}
              />

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
