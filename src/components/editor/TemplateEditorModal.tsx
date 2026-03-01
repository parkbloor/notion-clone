// ==============================================
// src/components/editor/TemplateEditorModal.tsx
// 역할: Notion 스타일 비주얼 그리드 템플릿 에디터 모달
//   - 가변 칼럼 그리드 캔버스에 블록을 드래그·스냅 배치
//   - 가로/세로/대각선 리사이즈 핸들
//   - 기본 내용(defaultContent) 텍스트 입력
//   - 저장 시 content 필드에 JSON으로 직렬화
//
// ★ stale closure 방지:
//   - ctxRef: cells·ghost·CELL_W·viewCols를 매 렌더마다 최신값으로 갱신
//   - liveOverrideRef: liveOverride와 동기화된 ref
//   - wasDraggingRef: 드래그 종료 직후 click 이벤트 차단
//   - 글로벌 핸들러: useCallback([]) → 항상 동일 참조 유지
// Python으로 치면: class TemplateEditorModal(QDialog): ...
// ==============================================

'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { templateApi, Template } from '@/lib/api'
import {
  GRID_ROW_H,
  PALETTE_BLOCKS,
  TemplateCell,
  getPaletteBlock,
  hasCollision,
  GridTemplateContent,
} from '@/lib/templateGrid'
import { BlockType } from '@/types/block'

// ── Props ─────────────────────────────────────
interface TemplateEditorModalProps {
  initialTemplate?: Template
  onSave: (template: Template) => void
  onClose: () => void
}

// ── 드래그 상태 타입 ──────────────────────────
interface DragState {
  type: 'move' | 'resize-w' | 'resize-h' | 'resize-wh'
  cellId: string
  startMouseX: number
  startMouseY: number
  origGridX: number
  origGridY: number
  origGridW: number
  origGridH: number
}

type LiveOverride = { id: string; gridX: number; gridY: number; gridW: number; gridH: number } | null
type Ghost = { gridX: number; gridY: number; gridW: number; gridH: number; type: BlockType } | null

// 칼럼 수 옵션
// Python으로 치면: COL_OPTIONS = [2, 3, 4, 6, 8, 12, 16]
const COL_OPTIONS = [2, 3, 4, 6, 8, 12, 16]

// 초기 셀 파싱
function parseInitial(t?: Template): { cells: TemplateCell[]; gridCols: number } {
  if (!t?.content?.startsWith('{')) return { cells: [], gridCols: 12 }
  try {
    const p = JSON.parse(t.content) as GridTemplateContent
    if (p.type !== 'grid') return { cells: [], gridCols: 12 }
    return { cells: p.cells ?? [], gridCols: p.gridCols ?? 12 }
  } catch { return { cells: [], gridCols: 12 } }
}

export default function TemplateEditorModal({
  initialTemplate,
  onSave,
  onClose,
}: TemplateEditorModalProps) {

  const init = parseInitial(initialTemplate)

  const [templateName, setTemplateName] = useState(initialTemplate?.name ?? '')
  const [templateIcon, setTemplateIcon] = useState(initialTemplate?.icon ?? '📋')
  const [cells, setCells] = useState<TemplateCell[]>(init.cells)
  const [viewCols, setViewCols] = useState(init.gridCols)
  const [activePaletteType, setActivePaletteType] = useState<BlockType | null>(null)
  const [editingCellId, setEditingCellId] = useState<string | null>(null)
  const [liveOverride, setLiveOverride] = useState<LiveOverride>(null)
  const [ghost, setGhost] = useState<Ghost>(null)
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const paletteDragRef = useRef<BlockType | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(900)

  // ★ 최신 컨텍스트 ref (매 렌더마다 갱신, 글로벌 핸들러에서 읽음)
  const ctxRef = useRef<{ cells: TemplateCell[]; ghost: Ghost; CELL_W: number; viewCols: number }>({
    cells: [], ghost: null, CELL_W: 900 / 12, viewCols: 12,
  })
  // ★ liveOverride ref (setLiveOverride와 동기 갱신)
  const liveOverrideRef = useRef<LiveOverride>(null)
  // ★ 드래그 직후 click 이벤트 차단용 flag
  const wasDraggingRef = useRef(false)

  const CELL_W = canvasWidth / viewCols
  // 매 렌더마다 ctx 갱신
  ctxRef.current = { cells, ghost, CELL_W, viewCols }

  useLayoutEffect(() => {
    if (!canvasRef.current) return
    const obs = new ResizeObserver(e => {
      const w = e[0]?.contentRect.width
      if (w) setCanvasWidth(w)
    })
    obs.observe(canvasRef.current)
    setCanvasWidth(canvasRef.current.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [])

  // liveOverride를 state + ref에 동시 기록
  const updateLiveOverride = useCallback((val: LiveOverride) => {
    liveOverrideRef.current = val
    setLiveOverride(val)
  }, [])

  // 캔버스 높이: 배치된 셀 기준 최소 12행 + 여유 4행
  const canvasRows = Math.max(12, ...cells.map(c => c.gridY + c.gridH), 1) + 4
  const canvasHeight = canvasRows * GRID_ROW_H

  // 칼럼 수 변경 — 기존 셀 비율 유지
  // Python으로 치면: def change_view_cols(new_cols): scale cells proportionally
  function changeViewCols(newCols: number) {
    const ratio = newCols / viewCols
    setCells(prev => prev.map(c => {
      const newX = Math.min(Math.floor(c.gridX * ratio), newCols - 1)
      const newW = Math.max(1, Math.min(Math.round(c.gridW * ratio), newCols - newX))
      return { ...c, gridX: newX, gridW: newW }
    }))
    setViewCols(newCols)
  }

  // ── 글로벌 mousemove (stable ref) ────────────
  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const { CELL_W: cw, viewCols: vc } = ctxRef.current
    const ds = dragRef.current

    if (paletteDragRef.current) {
      // 팔레트 드래그 고스트 위치 계산
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const relX = e.clientX - rect.left
      const relY = e.clientY - rect.top + (canvasRef.current?.scrollTop ?? 0)
      const col = Math.max(0, Math.min(vc - 1, Math.floor(relX / cw)))
      const row = Math.max(0, Math.floor(relY / GRID_ROW_H))
      const paletteInfo = PALETTE_BLOCKS.find(p => p.type === paletteDragRef.current)
      const gw = Math.min(Math.ceil(vc / 2), vc)  // 기본 너비: 반폭, 최대 전체
      const gx = Math.min(col, vc - gw)           // ★ 우측 경계 초과 방지
      setGhost({ gridX: gx, gridY: row, gridW: gw, gridH: paletteInfo?.defaultH ?? 2, type: paletteDragRef.current! })
      return
    }

    if (!ds) return

    if (ds.type === 'move') {
      const deltaCols = Math.round((e.clientX - ds.startMouseX) / cw)
      const deltaRows = Math.round((e.clientY - ds.startMouseY) / GRID_ROW_H)
      const newX = Math.max(0, Math.min(vc - ds.origGridW, ds.origGridX + deltaCols))
      const newY = Math.max(0, ds.origGridY + deltaRows)
      updateLiveOverride({ id: ds.cellId, gridX: newX, gridY: newY, gridW: ds.origGridW, gridH: ds.origGridH })

    } else if (ds.type === 'resize-w') {
      const deltaCols = Math.round((e.clientX - ds.startMouseX) / cw)
      const newW = Math.max(1, Math.min(vc - ds.origGridX, ds.origGridW + deltaCols))
      updateLiveOverride({ id: ds.cellId, gridX: ds.origGridX, gridY: ds.origGridY, gridW: newW, gridH: ds.origGridH })

    } else if (ds.type === 'resize-h') {
      const deltaRows = Math.round((e.clientY - ds.startMouseY) / GRID_ROW_H)
      const newH = Math.max(1, ds.origGridH + deltaRows)
      updateLiveOverride({ id: ds.cellId, gridX: ds.origGridX, gridY: ds.origGridY, gridW: ds.origGridW, gridH: newH })

    } else if (ds.type === 'resize-wh') {
      // 대각선 핸들: 너비 + 높이 동시 조절
      const deltaCols = Math.round((e.clientX - ds.startMouseX) / cw)
      const deltaRows = Math.round((e.clientY - ds.startMouseY) / GRID_ROW_H)
      const newW = Math.max(1, Math.min(vc - ds.origGridX, ds.origGridW + deltaCols))
      const newH = Math.max(1, ds.origGridH + deltaRows)
      updateLiveOverride({ id: ds.cellId, gridX: ds.origGridX, gridY: ds.origGridY, gridW: newW, gridH: newH })
    }
  }, [updateLiveOverride])

  // ── 글로벌 mouseup (stable ref) ──────────────
  const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
    const { cells: cur, ghost: curGhost } = ctxRef.current
    const lo = liveOverrideRef.current

    // ★ 다음 click 이벤트 차단
    wasDraggingRef.current = true

    // 팔레트 드래그 종료
    if (paletteDragRef.current && curGhost) {
      const paletteInfo = PALETTE_BLOCKS.find(p => p.type === paletteDragRef.current)
      const candidate: TemplateCell = {
        id: crypto.randomUUID(),
        type: paletteDragRef.current!,
        gridX: curGhost.gridX,
        gridY: curGhost.gridY,
        gridW: curGhost.gridW,
        gridH: paletteInfo?.defaultH ?? curGhost.gridH,
        defaultContent: '',
      }
      const rect = canvasRef.current?.getBoundingClientRect()
      const overCanvas = rect &&
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      if (overCanvas) {
        if (!hasCollision(cur, candidate)) {
          setCells(prev => [...prev, candidate])
        } else {
          toast.error('해당 위치에 이미 블록이 있습니다.')
        }
      }
      paletteDragRef.current = null
      setGhost(null)
      document.removeEventListener('mousemove', handleGlobalMouseMove)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      return
    }

    // 셀 move/resize 종료
    const ds = dragRef.current
    if (ds && lo) {
      const candidate = { gridX: lo.gridX, gridY: lo.gridY, gridW: lo.gridW, gridH: lo.gridH }
      if (!hasCollision(cur, candidate, ds.cellId)) {
        setCells(prev => prev.map(c => c.id === ds.cellId ? { ...c, ...candidate } : c))
      }
    }

    dragRef.current = null
    updateLiveOverride(null)
    document.removeEventListener('mousemove', handleGlobalMouseMove)
    document.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseMove, updateLiveOverride])

  const addListeners = useCallback(() => {
    document.addEventListener('mousemove', handleGlobalMouseMove)
    document.addEventListener('mouseup', handleGlobalMouseUp)
  }, [handleGlobalMouseMove, handleGlobalMouseUp])

  // ── 드래그 시작 헬퍼 ─────────────────────────
  function beginDrag(e: React.MouseEvent, type: DragState['type'], cell: TemplateCell) {
    e.preventDefault()
    e.stopPropagation()
    if (type === 'move' && editingCellId === cell.id) return
    wasDraggingRef.current = false  // 드래그 시작 시 초기화
    dragRef.current = {
      type, cellId: cell.id,
      startMouseX: e.clientX, startMouseY: e.clientY,
      origGridX: cell.gridX, origGridY: cell.gridY,
      origGridW: cell.gridW, origGridH: cell.gridH,
    }
    addListeners()
  }

  // ── 캔버스 클릭: 팔레트 타입 선택 상태에서 블록 배치 ──
  function handleCanvasClick(e: React.MouseEvent) {
    // ★ 드래그 직후 click 차단
    if (wasDraggingRef.current) { wasDraggingRef.current = false; return }
    if (!activePaletteType) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = e.clientX - rect.left
    const relY = e.clientY - rect.top + (canvasRef.current?.scrollTop ?? 0)
    const col = Math.max(0, Math.min(viewCols - 1, Math.floor(relX / CELL_W)))
    const row = Math.max(0, Math.floor(relY / GRID_ROW_H))
    const paletteInfo = PALETTE_BLOCKS.find(p => p.type === activePaletteType)
    const gw = Math.min(Math.ceil(viewCols / 2), viewCols)  // ★ 기본 너비
    const gx = Math.min(col, viewCols - gw)                  // ★ 경계 초과 방지
    const candidate: TemplateCell = {
      id: crypto.randomUUID(),
      type: activePaletteType,
      gridX: gx, gridY: row,
      gridW: gw, gridH: paletteInfo?.defaultH ?? 2,
      defaultContent: '',
    }
    if (hasCollision(cells, candidate)) {
      toast.error('해당 위치에 이미 블록이 있습니다.')
      return
    }
    setCells(prev => [...prev, candidate])
  }

  // ── 팔레트 mousedown (드래그 시작) ──────────
  function handlePaletteMouseDown(e: React.MouseEvent, type: BlockType) {
    e.preventDefault()
    wasDraggingRef.current = false
    paletteDragRef.current = type
    setActivePaletteType(type)
    addListeners()
  }

  function handleCanvasMouseLeave() {
    if (paletteDragRef.current) setGhost(null)
  }

  function deleteCell(id: string) {
    setCells(prev => prev.filter(c => c.id !== id))
    if (editingCellId === id) setEditingCellId(null)
  }

  function updateContent(id: string, content: string) {
    setCells(prev => prev.map(c => c.id === id ? { ...c, defaultContent: content } : c))
  }

  // Esc 키
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (activePaletteType) { setActivePaletteType(null); setEditingCellId(null) }
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activePaletteType, onClose])

  // 저장
  async function handleSave() {
    if (!templateName.trim()) { toast.error('템플릿 이름을 입력해 주세요.'); return }
    if (cells.length === 0) { toast.error('블록을 하나 이상 배치해 주세요.'); return }

    const content: GridTemplateContent = { type: 'grid', gridCols: viewCols, cells }
    const data = {
      name: templateName.trim(),
      icon: templateIcon || '📋',
      description: '',
      content: JSON.stringify(content),
    }
    setSaving(true)
    try {
      const saved = initialTemplate?.id
        ? await templateApi.update(initialTemplate.id, data)
        : await templateApi.create(data)
      toast.success('템플릿이 저장됐습니다.')
      onSave(saved)
    } catch {
      toast.error('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 렌더링 위치 계산 (liveOverride 적용)
  function getRect(cell: TemplateCell) {
    const o = liveOverride?.id === cell.id ? liveOverride : null
    return {
      left: (o?.gridX ?? cell.gridX) * CELL_W,
      top: (o?.gridY ?? cell.gridY) * GRID_ROW_H,
      width: (o?.gridW ?? cell.gridW) * CELL_W,
      height: (o?.gridH ?? cell.gridH) * GRID_ROW_H,
    }
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-6">
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
        style={{ width: '92vw', height: '92vh' }}
      >

        {/* ── 상단 툴바 ─────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          {/* 아이콘 */}
          <input
            type="text"
            value={templateIcon}
            onChange={e => setTemplateIcon(e.target.value.slice(-2) || '📋')}
            className="w-9 h-9 text-center text-lg border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-gray-50"
            maxLength={2}
          />
          {/* 이름 */}
          <input
            type="text"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="템플릿 이름..."
            className="flex-1 text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
          />
          {/* 칼럼 수 선택 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-gray-400">칼럼</span>
            <select
              value={viewCols}
              onChange={e => changeViewCols(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-400 bg-white"
            >
              {COL_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          {/* 블록 수 */}
          <span className="text-xs text-gray-400 shrink-0">{cells.length}개 블록</span>
          {/* 저장 */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {/* 취소 */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          >
            취소
          </button>
        </div>

        {/* ── 본문: 팔레트 + 캔버스 ─────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* ── 좌측 팔레트 ─────────────────────── */}
          <div className="w-48 shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
              블록 타입
            </p>

            {activePaletteType && (
              <button
                type="button"
                onClick={() => setActivePaletteType(null)}
                className="w-full mb-2 text-xs text-blue-500 hover:text-blue-700 text-left px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
              >
                ✕ 선택 해제 (Esc)
              </button>
            )}

            <div className="flex flex-col gap-0.5">
              {PALETTE_BLOCKS.map(pb => (
                <div
                  key={pb.type}
                  onMouseDown={e => handlePaletteMouseDown(e, pb.type)}
                  onClick={() => setActivePaletteType(prev => prev === pb.type ? null : pb.type)}
                  className={[
                    'flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing select-none transition-colors',
                    activePaletteType === pb.type
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100',
                  ].join(' ')}
                >
                  {/* 블록 타입 아이콘 */}
                  <span className="text-xs font-bold w-6 text-center shrink-0 text-gray-400">
                    {pb.icon}
                  </span>
                  <span className="text-xs">{pb.label}</span>
                  {activePaletteType === pb.type && (
                    <span className="ml-auto text-blue-400 text-xs">●</span>
                  )}
                </div>
              ))}
            </div>

            {/* 사용 안내 */}
            <div className="mt-4 px-1 space-y-1">
              <p className="text-xs text-gray-300">블록을 드래그하거나</p>
              <p className="text-xs text-gray-300">클릭 후 캔버스를 클릭</p>
            </div>
          </div>

          {/* ── 우측 캔버스 영역 ─────────────────── */}
          <div className="flex-1 overflow-auto bg-white flex flex-col">

            {/* 캔버스 상단 안내 */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-2 flex items-center gap-3">
              {activePaletteType ? (
                <span className="text-xs text-blue-600">
                  <strong className="font-semibold">{PALETTE_BLOCKS.find(p => p.type === activePaletteType)?.label}</strong>
                  {' '}선택됨 — 빈 곳을 클릭하거나 드래그해서 배치
                </span>
              ) : (
                <span className="text-xs text-gray-400">
                  헤더 드래그로 이동 · 우측/하단 가장자리로 크기 조절 · 우측하단 모서리로 동시 조절
                </span>
              )}
              <span className="ml-auto text-xs text-gray-300">{viewCols}칼럼</span>
            </div>

            {/* 그리드 캔버스 */}
            <div
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseLeave={handleCanvasMouseLeave}
              className={[
                'relative flex-1',
                activePaletteType ? 'cursor-crosshair' : '',
              ].join(' ')}
              style={{
                width: '100%',
                minHeight: canvasHeight,
                // ★ 칼럼 수 기반 그리드 배경
                backgroundImage: `
                  linear-gradient(to right, #f0f0f0 1px, transparent 1px),
                  linear-gradient(to bottom, #f0f0f0 1px, transparent 1px)
                `,
                backgroundSize: `${CELL_W}px ${GRID_ROW_H}px`,
              }}
            >
              {/* 칼럼 번호 (상단) */}
              {Array.from({ length: viewCols }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-1 text-center text-xs text-gray-200 pointer-events-none select-none"
                  style={{ left: i * CELL_W, width: CELL_W }}
                >
                  {i + 1}
                </div>
              ))}

              {/* ── 팔레트 드래그 고스트 ── */}
              {ghost && (
                <div
                  className="absolute pointer-events-none rounded-md border-2 border-dashed border-blue-300 bg-blue-50 opacity-60"
                  style={{
                    left: ghost.gridX * CELL_W + 2,
                    top: ghost.gridY * GRID_ROW_H + 2,
                    width: ghost.gridW * CELL_W - 4,
                    height: ghost.gridH * GRID_ROW_H - 4,
                  }}
                />
              )}

              {/* ── 배치된 셀들 ── */}
              {cells.map(cell => {
                const pb = getPaletteBlock(cell.type)
                const rect = getRect(cell)
                const isEditing = editingCellId === cell.id
                const isDragging = liveOverride?.id === cell.id
                const dispW = liveOverride?.id === cell.id ? liveOverride.gridW : cell.gridW
                const dispH = liveOverride?.id === cell.id ? liveOverride.gridH : cell.gridH
                const PAD = 3  // 셀 간격 (px)

                return (
                  <div
                    key={cell.id}
                    className={[
                      'absolute flex flex-col rounded-md border bg-white overflow-hidden',
                      isDragging
                        ? 'border-blue-400 shadow-md z-20'
                        : 'border-gray-200 hover:border-gray-300 shadow-sm z-10',
                    ].join(' ')}
                    style={{
                      left:   rect.left   + PAD,
                      top:    rect.top    + PAD,
                      width:  rect.width  - PAD * 2,
                      height: rect.height - PAD * 2,
                    }}
                  >
                    {/* ── 블록 헤더 (드래그 핸들) ── */}
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-100 cursor-grab shrink-0 bg-gray-50/80 select-none"
                      onMouseDown={e => beginDrag(e, 'move', cell)}
                    >
                      {/* 6-dot 드래그 핸들 */}
                      <span className="text-gray-300 text-sm leading-none">⠿</span>
                      {/* 블록 타입 */}
                      <span className="text-xs text-gray-400 font-medium flex-1 truncate">{pb.label}</span>
                      {/* 크기 뱃지 */}
                      <span className="text-xs font-mono text-gray-300 shrink-0">{dispW}×{dispH}</span>
                      {/* 삭제 */}
                      <button
                        type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); deleteCell(cell.id) }}
                        className="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-400 text-xs rounded shrink-0 transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {/* ── 기본 내용 영역 ── */}
                    <div
                      className="flex-1 min-h-0 px-2.5 py-1.5 cursor-text"
                      onClick={e => { e.stopPropagation(); setEditingCellId(cell.id) }}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={cell.defaultContent}
                          onChange={e => updateContent(cell.id, e.target.value)}
                          onBlur={() => setEditingCellId(null)}
                          onClick={e => e.stopPropagation()}
                          placeholder="기본 내용을 입력하세요..."
                          className="w-full h-full resize-none text-xs text-gray-600 bg-transparent outline-none placeholder-gray-300"
                        />
                      ) : (
                        <p className="text-xs text-gray-400 line-clamp-2">
                          {cell.defaultContent || (
                            <span className="italic text-gray-300">내용 없음 — 클릭하여 입력</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* ── 우측 리사이즈 핸들 ── */}
                    <div
                      className="absolute top-6 right-0 w-2 cursor-ew-resize z-30 group"
                      style={{ height: 'calc(100% - 32px)' }}
                      onMouseDown={e => beginDrag(e, 'resize-w', cell)}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="w-full h-full rounded-r opacity-0 group-hover:opacity-100 bg-blue-400 transition-opacity" />
                    </div>

                    {/* ── 하단 리사이즈 핸들 ── */}
                    <div
                      className="absolute bottom-0 left-6 h-2 cursor-ns-resize z-30 group"
                      style={{ width: 'calc(100% - 40px)' }}
                      onMouseDown={e => beginDrag(e, 'resize-h', cell)}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="w-full h-full rounded-b opacity-0 group-hover:opacity-100 bg-blue-400 transition-opacity" />
                    </div>

                    {/* ── 우측하단 모서리 핸들 (W+H 동시) ── */}
                    <div
                      className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-40 flex items-end justify-end p-1"
                      onMouseDown={e => beginDrag(e, 'resize-wh', cell)}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-300 hover:bg-blue-500 transition-colors" />
                    </div>

                  </div>
                )
              })}

              {/* 빈 캔버스 안내 */}
              {cells.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-sm text-gray-300 font-medium">캔버스가 비어 있습니다</p>
                    <p className="text-xs text-gray-200 mt-1">왼쪽 팔레트에서 블록을 드래그하거나 클릭해서 추가하세요</p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── 하단 상태 표시줄 ─────────────────── */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 shrink-0">
          <span className="text-xs text-gray-400">
            같은 행의 2~3개 블록은 페이지 적용 시 다단 레이아웃으로 변환됩니다
          </span>
          <span className="ml-auto text-xs text-gray-300">
            {viewCols}칼럼 × {canvasRows}행
          </span>
        </div>

      </div>
    </div>
  )
}
