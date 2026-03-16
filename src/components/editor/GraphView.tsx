// =============================================
// src/components/editor/GraphView.tsx
// 역할: 페이지 간 [[링크]] 관계를 시각적 노드 그래프로 표시 (옵시디언 그래프 뷰 스타일)
// 외부 라이브러리 없이 직접 구현한 물리 시뮬레이션 사용 (반발력 + 스프링 + 중심력)
// Python으로 치면: class GraphView(QDialog): ...
// =============================================

'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { usePageStore } from '@/store/pageStore'
import { buildGraphData, GraphNode, GraphEdge } from '@/lib/graphData'
import { X, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react'

// -----------------------------------------------
// 시뮬레이션 노드 — GraphNode에 물리 상태(위치/속도/핀 여부) 추가
// Python으로 치면: @dataclass class SimNode(GraphNode): x, y, vx, vy, pinned
// -----------------------------------------------
interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

interface GraphViewProps {
  onClose: () => void
}

// -----------------------------------------------
// 카테고리 ID → 색상 (해시 기반, 항상 동일한 색 반환)
// Python으로 치면: COLORS[hash(cat_id) % len(COLORS)]
// -----------------------------------------------
const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]
function categoryColor(catId: string | null): string {
  if (!catId) return '#6b7280'
  const hash = catId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PALETTE[hash % PALETTE.length]
}

// -----------------------------------------------
// 노드 반지름 — degree 0: 6px, 최대 18px
// Python으로 치면: r = min(18, 6 + degree * 2.5)
// -----------------------------------------------
function nodeRadius(degree: number): number {
  return Math.min(18, 6 + degree * 2.5)
}

// -----------------------------------------------
// GraphView 컴포넌트
// Python으로 치면: class GraphView(Modal): def show(self): self.simulate(); self.draw()
// -----------------------------------------------
export default function GraphView({ onClose }: GraphViewProps) {
  const { pages, categoryMap, currentPageId, setCurrentPage } = usePageStore()

  // 그래프 데이터: pages/categoryMap 변경 시만 재계산
  // Python으로 치면: graph = build_graph(pages, category_map)
  const { nodes, edges } = useMemo(
    () => buildGraphData(pages, categoryMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages]
  )

  // SVG 참조
  const svgRef = useRef<SVGSVGElement>(null)

  // 뷰포트 변환 (팬 + 줌)
  // Python으로 치면: self.offset_x, self.offset_y, self.scale = 0, 0, 1
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })

  // 시뮬레이션 노드 배열 (ref: 매 프레임 변경되므로 state 대신 ref)
  const simRef = useRef<SimNode[]>([])

  // 렌더 트리거: 시뮬레이션 결과를 SVG에 반영할 때 증가
  const [tick, setTick] = useState(0)

  // 시뮬레이션 실행 플래그
  const runningRef = useRef(true)
  const rafRef = useRef(0)

  // edges를 ref에 보관 (시뮬레이션 루프 클로저에서 최신값 참조)
  const edgesRef = useRef<GraphEdge[]>(edges)
  useEffect(() => { edgesRef.current = edges }, [edges])

  // ── 시뮬레이션 초기화 (노드 원형 배치) ─────────────────────────
  // Python으로 치면: def init_positions(self): self.nodes = [Node(x=r*cos(a), y=r*sin(a)) ...]
  useEffect(() => {
    const svg = svgRef.current
    const W = svg?.clientWidth ?? 800
    const H = svg?.clientHeight ?? 600
    const cx = W / 2
    const cy = H / 2
    const R = Math.min(W, H) * 0.35

    simRef.current = nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, nodes.length)
      return {
        ...n,
        x: cx + R * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: cy + R * Math.sin(angle) + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        pinned: false,
      }
    })
    setTransform({ x: 0, y: 0, scale: 1 })
    runningRef.current = true
  }, [nodes])

  // ── 물리 시뮬레이션 루프 ────────────────────────────────────────
  // 힘: 반발력(모든 쌍) + 스프링(엣지) + 중심력
  // Python으로 치면:
  //   def tick(self):
  //       for i, j in pairs: apply_repulsion(i, j)
  //       for e in edges:    apply_spring(e)
  //       for n in nodes:    apply_center_force(n); update_velocity(n); update_pos(n)
  useEffect(() => {
    let alpha = 1.0
    let frame = 0

    const REPULSION = 3500
    const SPRING_K  = 0.05
    const REST_LEN  = 130
    const CENTER_K  = 0.018
    const DAMPING   = 0.74

    function tick() {
      if (!runningRef.current) return

      alpha *= 0.97
      if (alpha < 0.002) {
        // 수렴 완료 → 마지막 1회 렌더 후 종료
        setTick(t => t + 1)
        return
      }

      const SN = simRef.current
      const N = SN.length
      if (N === 0) { rafRef.current = requestAnimationFrame(tick); return }

      // 인덱스 맵 (매 프레임 생성이 부담이지만 N < 300이면 충분히 빠름)
      const idxMap: Record<string, number> = {}
      SN.forEach((n, i) => { idxMap[n.id] = i })

      const fx = new Float64Array(N)
      const fy = new Float64Array(N)

      // 1. 반발력 (Coulomb)
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = SN[j].x - SN[i].x
          const dy = SN[j].y - SN[i].y
          const d2 = dx * dx + dy * dy + 1
          const d = Math.sqrt(d2)
          const f = REPULSION / d2
          const ux = dx / d
          const uy = dy / d
          fx[i] -= ux * f; fy[i] -= uy * f
          fx[j] += ux * f; fy[j] += uy * f
        }
      }

      // 2. 스프링 인력 (Hooke, 엣지)
      for (const e of edgesRef.current) {
        const si = idxMap[e.sourceId]
        const ti = idxMap[e.targetId]
        if (si === undefined || ti === undefined) continue
        const dx = SN[ti].x - SN[si].x
        const dy = SN[ti].y - SN[si].y
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001
        const f = SPRING_K * (d - REST_LEN)
        const ux = dx / d; const uy = dy / d
        fx[si] += ux * f; fy[si] += uy * f
        fx[ti] -= ux * f; fy[ti] -= uy * f
      }

      // 3. 중심 인력 + 위치 업데이트
      const svg = svgRef.current
      const cx = (svg?.clientWidth ?? 800) / 2
      const cy = (svg?.clientHeight ?? 600) / 2
      for (let i = 0; i < N; i++) {
        if (SN[i].pinned) continue
        fx[i] += (cx - SN[i].x) * CENTER_K
        fy[i] += (cy - SN[i].y) * CENTER_K
        SN[i].vx = (SN[i].vx + fx[i] * alpha) * DAMPING
        SN[i].vy = (SN[i].vy + fy[i] * alpha) * DAMPING
        SN[i].x += SN[i].vx
        SN[i].y += SN[i].vy
      }

      frame++
      // 3프레임마다 렌더 (성능 최적화)
      if (frame % 3 === 0) setTick(t => t + 1)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { runningRef.current = false; cancelAnimationFrame(rafRef.current) }
  }, [nodes]) // nodes 변경 시 시뮬레이션 재시작

  // Escape 키 → 닫기
  const handleClose = useCallback(() => onClose(), [onClose])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  // ── 팬 드래그 ─────────────────────────────────────────────────
  // Python으로 치면: on_background_drag(dx, dy): self.offset += (dx, dy)
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  function onBgDown(e: React.MouseEvent) {
    panRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
  }

  // ── 노드 드래그 ───────────────────────────────────────────────
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const hasDraggedRef = useRef(false)  // 클릭과 드래그 구분

  function onNodeDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const n = simRef.current.find(n => n.id === id)
    if (!n) return
    n.pinned = true
    hasDraggedRef.current = false
    const svgRect = svgRef.current!.getBoundingClientRect()
    const svgX = (e.clientX - svgRect.left - transform.x) / transform.scale
    const svgY = (e.clientY - svgRect.top  - transform.y) / transform.scale
    dragRef.current = { id, ox: n.x - svgX, oy: n.y - svgY }
  }

  function onSvgMove(e: React.MouseEvent) {
    if (dragRef.current) {
      // 노드 드래그
      const n = simRef.current.find(n => n.id === dragRef.current!.id)
      if (n) {
        hasDraggedRef.current = true
        const svgRect = svgRef.current!.getBoundingClientRect()
        n.x = (e.clientX - svgRect.left - transform.x) / transform.scale + dragRef.current.ox
        n.y = (e.clientY - svgRect.top  - transform.y) / transform.scale + dragRef.current.oy
        setTick(t => t + 1)
      }
    } else if (panRef.current) {
      // 배경 팬
      setTransform(t => ({
        ...t,
        x: panRef.current!.tx + (e.clientX - panRef.current!.x),
        y: panRef.current!.ty + (e.clientY - panRef.current!.y),
      }))
    }
  }

  function onSvgUp() {
    if (dragRef.current) {
      const n = simRef.current.find(n => n.id === dragRef.current!.id)
      if (n) n.pinned = false
      dragRef.current = null
    }
    panRef.current = null
  }

  // ── 마우스 휠 → 줌 ──────────────────────────────────────────
  // Python으로 치면: on_wheel(delta): self.scale *= 1.1 if delta < 0 else 0.9
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 0.9
    setTransform(t => ({ ...t, scale: Math.max(0.15, Math.min(5, t.scale * factor)) }))
  }

  function resetView() { setTransform({ x: 0, y: 0, scale: 1 }) }
  function zoomIn()  { setTransform(t => ({ ...t, scale: Math.min(5, t.scale * 1.3) })) }
  function zoomOut() { setTransform(t => ({ ...t, scale: Math.max(0.15, t.scale * 0.77) })) }

  // ── 렌더 준비 ─────────────────────────────────────────────────
  const simNodes = simRef.current
  const idxMap: Record<string, number> = {}
  simNodes.forEach((n, i) => { idxMap[n.id] = i })

  // 다크 모드 감지 (SSR 안전)
  const isDark = typeof document !== 'undefined'
    && document.documentElement.classList.contains('dark')

  const labelColor = '#e5e7eb'
  const edgeColor = '#4b5563'
  const bgColor = isDark ? '#111827' : '#1f2937'

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 9999, backgroundColor: bgColor }}
      onMouseMove={onSvgMove}
      onMouseUp={onSvgUp}
      onMouseLeave={onSvgUp}
    >

      {/* ── 상단 헤더 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0 select-none">
        <span className="text-lg">🕸️</span>
        <span className="text-white font-semibold text-sm">그래프 뷰</span>
        <span className="text-gray-400 text-xs">
          {nodes.length}개 메모 · {edges.length}개 연결
        </span>
        <div className="flex-1" />

        {/* 줌 컨트롤 */}
        <button type="button" onClick={zoomOut} title="축소" className="text-gray-400 hover:text-white transition-colors p-1">
          <ZoomOut size={14} />
        </button>
        <span className="text-gray-500 text-xs w-10 text-center">
          {Math.round(transform.scale * 100)}%
        </span>
        <button type="button" onClick={zoomIn} title="확대" className="text-gray-400 hover:text-white transition-colors p-1">
          <ZoomIn size={14} />
        </button>
        <button type="button" onClick={resetView} title="뷰 초기화" className="text-gray-400 hover:text-white transition-colors p-1">
          <RefreshCw size={13} />
        </button>

        <div className="w-px h-4 bg-gray-700 mx-1" />

        <button
          type="button"
          onClick={handleClose}
          title="닫기 (Esc)"
          className="text-gray-400 hover:text-white transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── SVG 캔버스 ─────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        className="flex-1 w-full"
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={onBgDown}
        onWheel={onWheel}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>

          {/* 엣지 (연결선) */}
          {edges.map((e, i) => {
            const si = idxMap[e.sourceId]
            const ti = idxMap[e.targetId]
            if (si === undefined || ti === undefined) return null
            const sn = simNodes[si]
            const tn = simNodes[ti]
            if (!sn || !tn) return null
            return (
              <line
                key={i}
                x1={sn.x} y1={sn.y}
                x2={tn.x} y2={tn.y}
                stroke={edgeColor}
                strokeWidth={Math.max(0.5, 1 / transform.scale)}
                strokeOpacity={0.6}
              />
            )
          })}

          {/* 노드 (페이지 원) */}
          {simNodes.map(n => {
            const r = nodeRadius(n.degree)
            const color = categoryColor(n.categoryId)
            const isCurrent = n.id === currentPageId
            const isIsolated = n.degree === 0

            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: 'pointer' }}
                onMouseDown={(e) => onNodeDown(e, n.id)}
                onClick={(e) => {
                  e.stopPropagation()
                  // 드래그 후 마우스업은 클릭으로 처리하지 않음
                  if (!hasDraggedRef.current) {
                    setCurrentPage(n.id)
                    onClose()
                  }
                }}
              >
                {/* 현재 페이지 외곽 링 */}
                {isCurrent && (
                  <circle
                    r={r + 5}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={Math.max(1, 1.5 / transform.scale)}
                    strokeOpacity={0.9}
                  />
                )}

                {/* 메인 원 */}
                <circle
                  r={r}
                  fill={color}
                  fillOpacity={isIsolated ? 0.4 : 0.85}
                  stroke={isCurrent ? '#fff' : 'rgba(0,0,0,0.25)'}
                  strokeWidth={Math.max(0.5, (isCurrent ? 2 : 0.8) / transform.scale)}
                />

                {/* 아이콘 (원이 충분히 클 때만) */}
                {r >= 10 && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.round(r * 0.95)}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {n.icon}
                  </text>
                )}

                {/* 제목 라벨 */}
                <text
                  y={r + Math.max(10, 12 / transform.scale)}
                  textAnchor="middle"
                  fill={labelColor}
                  fontSize={Math.max(8, 11 / transform.scale)}
                  fontFamily="system-ui, sans-serif"
                  fillOpacity={isIsolated ? 0.5 : 0.9}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {n.title.length > 15 ? n.title.slice(0, 13) + '…' : n.title}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* ── 하단 도움말 ──────────────────────────────────────────── */}
      <div className="px-4 py-1 bg-gray-900 border-t border-gray-700 shrink-0 flex items-center gap-4 select-none">
        <span className="text-gray-500 text-[11px]">
          스크롤: 줌 · 배경 드래그: 이동 · 노드 클릭: 페이지 열기 · 노드 드래그: 위치 조정 · Esc: 닫기
        </span>
        {/* 연결 없는 노드 설명 */}
        {nodes.some(n => n.degree === 0) && (
          <span className="text-gray-600 text-[11px]">
            · 흐린 원: 링크 없는 메모
          </span>
        )}
      </div>
    </div>
  )
}
