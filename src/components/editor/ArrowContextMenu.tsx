// =============================================
// src/components/editor/ArrowContextMenu.tsx
// 역할: 화살표 마커 원 우클릭 시 표시되는 설정 메뉴
//       arrowId로 모든 관련 마크를 일괄 업데이트/삭제
//
// arrowStore.contextMenu 구독 → 메뉴 표시
// 설정 변경 시: document.querySelectorAll('[data-arrow-id=X]') 순회
//               → ProseMirror 포지션 찾기 → setMark로 일괄 갱신
//
// Python으로 치면: class ArrowContextMenu(Component): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { useArrowStore } from '@/store/arrowStore'
import { ARROW_COLORS, ARROW_COLOR_NAMES } from '@/extensions/ArrowMark'

export default function ArrowContextMenu() {
  const contextMenu = useArrowStore(s => s.contextMenu)
  const clearContextMenu = useArrowStore(s => s.clearContextMenu)
  const menuRef = useRef<HTMLDivElement>(null)

  // 로컬 편집 상태 — contextMenu.attrs를 초기값으로 사용
  // Python으로 치면: self.local_attrs = copy(context_menu.attrs)
  const [color,     setColor]     = useState('blue')
  const [opacity,   setOpacity]   = useState(1)
  const [arrowType, setArrowType] = useState<'margin' | 'diagonal'>('margin')
  const [xPosition, setXPosition] = useState(0)
  const [startHead, setStartHead] = useState(false)
  const [endHead,   setEndHead]   = useState(true)

  // contextMenu가 열릴 때 attrs로 로컬 상태 초기화
  // Python으로 치면: def on_open(): self.local_attrs = context_menu.attrs
  useEffect(() => {
    if (!contextMenu) return
    setColor(contextMenu.attrs.color)
    setOpacity(contextMenu.attrs.opacity)
    setArrowType(contextMenu.attrs.arrowType)
    setXPosition(contextMenu.attrs.xPosition)
    setStartHead(contextMenu.attrs.startHead)
    setEndHead(contextMenu.attrs.endHead)
  }, [contextMenu])

  // -----------------------------------------------
  // 끝점 추가: 같은 arrowId로 연결 대기 모드 재진입
  // 시작 마커 우클릭 → "끝점 추가" 클릭 → 고무줄 선 다시 활성
  //
  // Python으로 치면: def add_endpoint(): re_enter_connecting_mode(arrow_id)
  // -----------------------------------------------
  const addEndpoint = () => {
    if (!contextMenu) return
    const arrowId = contextMenu.arrowId

    // 시작 마커 DOM에서 앵커 좌표 계산
    // Python으로 치면: anchor = start_marker.get_bounding_rect()
    const startEl = document.querySelector<HTMLElement>(
      `[data-arrow-id="${arrowId}"][data-arrow-start="true"]`
    )
    let anchorX = 0
    let anchorY = 0
    if (startEl) {
      const rect = startEl.getBoundingClientRect()
      anchorX = rect.left
      anchorY = rect.top + rect.height / 2
    }

    clearContextMenu()
    useArrowStore.getState().setConnecting({
      arrowId,
      color:     contextMenu.attrs.color,
      opacity:   contextMenu.attrs.opacity,
      arrowType: contextMenu.attrs.arrowType,
      xPosition: contextMenu.attrs.xPosition,
      startHead: contextMenu.attrs.startHead,
      endHead:   contextMenu.attrs.endHead,
      anchorX,
      anchorY,
    })
  }

  // 외부 클릭 시 메뉴 닫기
  // Python으로 치면: document.on_click(lambda e: close_if_outside(e))
  useEffect(() => {
    if (!contextMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        clearContextMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu, clearContextMenu])

  if (!contextMenu) return null

  // -----------------------------------------------
  // 같은 arrowId를 가진 모든 마크를 새 속성으로 일괄 갱신
  //
  // 방법: [data-arrow-id=X] DOM 요소 → ProseMirror posAtDOM → setMark 반복
  //
  // Python으로 치면:
  //   def bulk_update(arrow_id, new_attrs):
  //       for el in document.query_all(f'[data-arrow-id="{arrow_id}"]'):
  //           pos = editor.pos_at_dom(el)
  //           editor.set_mark_at(pos, 'arrowMark', new_attrs)
  // -----------------------------------------------
  // -----------------------------------------------
  // 단일 트랜잭션으로 같은 arrowId의 모든 마크 속성 갱신
  //
  // 이전 방식(chain().setMark().run() 반복)은 excludes:'' 설정 때문에
  // 기존 마크 위에 새 마크가 누적되어 원(::before)이 늘어나는 버그 발생.
  // 해결: tr.removeMark → tr.addMark 를 하나의 tr에서 처리 후 한 번만 dispatch
  //
  // Python으로 치면:
  //   def apply_changes(arrow_id, new_attrs):
  //       tr = state.tr
  //       for node, pos in doc.nodes_between(0, doc.size):
  //           if has_arrow_mark(node, arrow_id):
  //               tr.remove_mark(pos, pos+size, old_mark)
  //               tr.add_mark(pos, pos+size, new_mark)
  //       view.dispatch(tr)
  // -----------------------------------------------
  const applyChanges = (overrides: Partial<{
    color: string; opacity: number; arrowType: 'margin' | 'diagonal'
    xPosition: number; startHead: boolean; endHead: boolean
  }> = {}) => {
    const newAttrs = {
      color:     overrides.color     ?? color,
      opacity:   overrides.opacity   ?? opacity,
      arrowType: overrides.arrowType ?? arrowType,
      xPosition: overrides.xPosition ?? xPosition,
      startHead: overrides.startHead ?? startHead,
      endHead:   overrides.endHead   ?? endHead,
    }

    const arrowId = contextMenu.arrowId

    // 같은 arrowId를 가진 모든 에디터 인스턴스 수집 (중복 제거)
    // Python으로 치면: editors = set(find_editor(el) for el in elements)
    const elements = document.querySelectorAll<HTMLElement>(`[data-arrow-id="${arrowId}"]`)
    const editorSet = new Set<{ state: { doc: { nodeSize: number; nodesBetween: (...args: unknown[]) => void }; schema: { marks: Record<string, { create: (attrs: unknown) => unknown } > }; tr: unknown }; view: { dispatch: (tr: unknown) => void } }>()

    elements.forEach((el) => {
      const editorDom = el.closest('.ProseMirror')
      if (!editorDom) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = (editorDom as any).__tiptapEditor
      if (tiptapEditor?.schema?.marks?.['arrowMark']) editorSet.add(tiptapEditor)
    })

    // 각 에디터에서 단일 tr로 removeMark + addMark 처리
    // Python으로 치면: for editor in editors: one_transaction_update(editor)
    editorSet.forEach((tiptapEditor) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed = tiptapEditor as any
      const { state, view } = ed
      const markType = state.schema.marks['arrowMark']
      const tr = state.tr

      state.doc.nodesBetween(0, state.doc.nodeSize - 2, (
        node: { isText: boolean; nodeSize: number; marks: Array<{ type: { name: string }; attrs: { arrowId: string; isStart: boolean } }> },
        nodePos: number
      ) => {
        if (!node.isText) return true
        const existing = node.marks.find(
          (m) => m.type.name === 'arrowMark' && m.attrs.arrowId === arrowId
        )
        if (!existing) return true

        const from = nodePos
        const to   = nodePos + node.nodeSize
        // 특정 Mark 인스턴스만 제거 후 새 속성으로 추가
        // markType(MarkType)을 넘기면 같은 텍스트의 다른 arrowId 마크까지 전부 삭제되는 버그 발생
        // existing(Mark 인스턴스)을 넘겨야 해당 arrowId 마크만 정확히 제거됨
        // Python으로 치면: tr.remove_specific_mark(from, to, existing_mark_instance)
        tr.removeMark(from, to, existing)
        tr.addMark(from, to, markType.create({
          arrowId,
          isStart: existing.attrs.isStart,
          ...newAttrs,
        }))
        return true
      })

      view.dispatch(tr)
    })
  }

  // -----------------------------------------------
  // 이 arrowId의 모든 마크 삭제
  // Python으로 치면: def delete_arrow(): for el in elements: unset_mark(el)
  // -----------------------------------------------
  // -----------------------------------------------
  // 단일 트랜잭션으로 특정 arrowId 마크만 제거
  //
  // unsetMark('arrowMark')는 해당 범위의 모든 arrowMark를 삭제하므로
  // 같은 텍스트에 연결된 다른 화살표까지 지워지는 버그 발생.
  // 해결: nodesBetween으로 특정 arrowId 마크 인스턴스를 찾아 tr.removeMark에 인스턴스 전달
  //
  // Python으로 치면:
  //   def delete_arrow(arrow_id):
  //       tr = state.tr
  //       for node, pos in doc.nodes_between(0, doc.size):
  //           mark = find_mark(node, arrow_id)
  //           if mark: tr.remove_mark(pos, pos+size, mark)  # 인스턴스 지정
  //       view.dispatch(tr)
  // -----------------------------------------------
  const deleteArrow = () => {
    const arrowId = contextMenu.arrowId

    const elements = document.querySelectorAll<HTMLElement>(`[data-arrow-id="${arrowId}"]`)
    const editorSet = new Set<unknown>()
    elements.forEach((el) => {
      const editorDom = el.closest('.ProseMirror')
      if (!editorDom) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptapEditor = (editorDom as any).__tiptapEditor
      if (tiptapEditor) editorSet.add(tiptapEditor)
    })

    editorSet.forEach((tiptapEditor) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed = tiptapEditor as any
      const { state, view } = ed
      const tr = state.tr

      state.doc.nodesBetween(0, state.doc.nodeSize - 2, (
        node: { isText: boolean; nodeSize: number; marks: Array<{ type: { name: string }; attrs: { arrowId: string } }> },
        nodePos: number
      ) => {
        if (!node.isText) return true
        const existing = node.marks.find(
          (m) => m.type.name === 'arrowMark' && m.attrs.arrowId === arrowId
        )
        if (!existing) return true

        // 특정 Mark 인스턴스만 제거 — 다른 arrowId 마크는 보존됨
        tr.removeMark(nodePos, nodePos + node.nodeSize, existing)
        return true
      })

      view.dispatch(tr)
    })

    clearContextMenu()
  }

  const colorHex = ARROW_COLORS[color] ?? color

  return (
    // fixed 포지셔닝 — z-index: 10001로 ArrowLayer(9999) 위에 표시
    // Python으로 치면: menu.style = { position: 'fixed', top: y, left: x }
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: contextMenu.y,
        left: contextMenu.x,
        zIndex: 10001,
        minWidth: '180px',
      }}
      className="bg-gray-900 rounded-lg shadow-xl border border-gray-700 py-2 print-hide"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── 색상 선택 ─────────────────────────── */}
      <div className="px-3 pb-2">
        <p className="text-xs text-gray-400 mb-1.5">색상</p>
        <div className="flex gap-1.5">
          {ARROW_COLOR_NAMES.map((name) => (
            <button
              key={name}
              title={name}
              onClick={() => {
                setColor(name)
                applyChanges({ color: name })
              }}
              className="w-5 h-5 rounded-full transition-all"
              style={{
                background: ARROW_COLORS[name],
                border: color === name ? '2px solid white' : '2px solid transparent',
                outline: color === name ? `2px solid ${ARROW_COLORS[name]}` : 'none',
                outlineOffset: '1px',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── 투명도 ─────────────────────────────── */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-400">투명도</p>
          <span className="text-xs text-gray-300">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range" min={0.1} max={1} step={0.05}
          value={opacity}
          onChange={e => {
            const val = parseFloat(e.target.value)
            setOpacity(val)
            applyChanges({ opacity: val })
          }}
          className="w-full accent-blue-500 cursor-pointer"
          style={{ height: '4px' }}
        />
      </div>

      {/* ── 화살표 타입 ─────────────────────────── */}
      <div className="px-3 pb-2">
        <p className="text-xs text-gray-400 mb-1">타입</p>
        <div className="flex gap-1">
          {(['margin', 'diagonal'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setArrowType(t)
                applyChanges({ arrowType: t })
              }}
              className="flex-1 py-1 rounded text-xs transition-colors"
              style={{
                background: arrowType === t ? '#3b82f6' : '#374151',
                color: '#fff',
              }}
            >
              {t === 'margin' ? '◁ 여백' : '↗ 대각'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 곡선 깊이 (margin 타입만) ─────────── */}
      {arrowType === 'margin' && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">곡선 깊이</p>
            <span className="text-xs text-gray-300">{xPosition}</span>
          </div>
          <input
            type="range" min={0} max={30} step={1}
            value={xPosition}
            onChange={e => {
              const val = parseInt(e.target.value, 10)
              setXPosition(val)
              applyChanges({ xPosition: val })
            }}
            className="w-full accent-blue-500 cursor-pointer"
            style={{ height: '4px' }}
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>← 멀리</span><span>가까이 →</span>
          </div>
        </div>
      )}

      {/* ── 화살촉 옵션 ─────────────────────────── */}
      <div className="px-3 pb-2 flex gap-3">
        <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={startHead}
            onChange={e => {
              setStartHead(e.target.checked)
              applyChanges({ startHead: e.target.checked })
            }}
            className="accent-blue-500"
          />
          시작 촉
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={endHead}
            onChange={e => {
              setEndHead(e.target.checked)
              applyChanges({ endHead: e.target.checked })
            }}
            className="accent-blue-500"
          />
          끝 촉
        </label>
      </div>

      {/* ── 색상 미리보기 선 ─────────────────── */}
      <div className="px-3 pb-2">
        <svg width="100%" height="16" style={{ overflow: 'visible' }}>
          <line
            x1="0" y1="8" x2="100%" y2="8"
            stroke={colorHex}
            strokeWidth={1.8}
            strokeDasharray="5 3"
            opacity={opacity}
          />
        </svg>
      </div>

      {/* ── 구분선 ───────────────────────────── */}
      <div className="border-t border-gray-700 my-1" />

      {/* ── 끝점 추가 (시작 마커일 때만 표시) ── */}
      {/* 같은 arrowId로 연결 대기 모드 재진입 → 1:N 멀티 화살표 구성 가능 */}
      {/* Python으로 치면: if is_start: show_add_endpoint_btn() */}
      {contextMenu.isStart && (
        <button
          onClick={addEndpoint}
          className="w-full px-3 py-1.5 text-xs text-blue-400 hover:bg-gray-700 hover:text-blue-300 transition-colors text-left"
        >
          + 끝점 추가 (1:N)
        </button>
      )}

      {/* ── 삭제 버튼 ────────────────────────── */}
      {/* arrowId에 해당하는 start + end 마크 모두 제거 */}
      <button
        onClick={deleteArrow}
        className="w-full px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors text-left"
      >
        화살표 삭제
      </button>

      {/* ── 닫기 버튼 ────────────────────────── */}
      <button
        onClick={clearContextMenu}
        className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 transition-colors text-left"
      >
        닫기
      </button>
    </div>
  )
}
