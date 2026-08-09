// =============================================
// src/components/editor/TableStatusDropdown.tsx
// 역할: 상태형 표 셀을 클릭했을 때 상태 선택 메뉴를 portal로 표시
// Python으로 치면: class TableStatusDropdown(PopupMenu): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import {
  deleteStatusOption,
  getStatusConfigForCell,
  getSelectedStatusCellPositions,
  moveStatusOption,
  renameStatusOption,
  setStatusCellValues,
  setStatusOptionTone,
  type TableStatusTone,
} from '@/extensions/StatusTableCell'

interface TableStatusDropdownProps {
  editor: TiptapEditor
}

interface StatusMenuState {
  cellPos: number
  // Fast Refresh가 변경 전 메뉴 상태를 보존할 수 있어 런타임 호환을 위해 optional로 둔다.
  targetCellPositions?: number[]
  currentValue: string
  options: string[]
  tones?: Record<string, TableStatusTone>
  left: number
  top: number
}

const MENU_WIDTH = 256
const MENU_HEIGHT = 360
const VIEWPORT_GAP = 8

const STATUS_MENU_BADGE_CLASSES = [
  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
] as const
const STATUS_TONE_SWATCH_CLASSES = [
  'bg-gray-500',
  'bg-amber-400',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-blue-500',
] as const
const STATUS_TONE_NAMES = ['회색', '노랑', '초록', '빨강', '파랑'] as const

// 클릭한 td DOM에서 ProseMirror tableCell 노드 시작 위치를 찾는다.
// Python으로 치면: def cell_pos_from_dom(editor, cell_element): ...
function getCellPosition(editor: TiptapEditor, cellElement: HTMLTableCellElement): number | null {
  try {
    const insidePos = editor.view.posAtDOM(cellElement, 0)
    const $pos = editor.state.doc.resolve(insidePos)
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.spec.tableRole === 'cell') return $pos.before(depth)
    }
  } catch {
    return null
  }
  return null
}

// 셀 근처에 메뉴를 놓고 viewport 밖으로 나가지 않도록 좌표를 보정한다.
// Python으로 치면: def popup_position(rect, viewport): return clamp(left, top)
function getMenuPosition(rect: DOMRect): { left: number; top: number } {
  const left = Math.max(
    VIEWPORT_GAP,
    Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP),
  )
  const preferredTop = rect.bottom + 6
  const top = preferredTop + MENU_HEIGHT <= window.innerHeight - VIEWPORT_GAP
    ? preferredTop
    : Math.max(VIEWPORT_GAP, rect.top - MENU_HEIGHT - 6)
  return { left, top }
}

// 상태 셀 클릭 메뉴. 메뉴 DOM은 표 overflow의 영향을 받지 않도록 body에 붙인다.
// Python으로 치면: class TableStatusDropdown: mount_to(document.body)
export default function TableStatusDropdown({ editor }: TableStatusDropdownProps) {
  const [menu, setMenu] = useState<StatusMenuState | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [isManaging, setIsManaging] = useState(false)
  const [editingStatus, setEditingStatus] = useState<string | null>(null)
  const [statusDraft, setStatusDraft] = useState('')
  const [colorEditingStatus, setColorEditingStatus] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pendingSelectedCellPositionsRef = useRef<number[] | null>(null)

  // 저장된 열 목록에 상태를 추가하고 선택된 상태 셀에 즉시 적용한다.
  // Python으로 치면: def apply_status(value): dispatch(set_status_cell_values(...))
  function applyStatus(value: string) {
    if (!menu) return
    const targetCellPositions = menu.targetCellPositions?.length
      ? menu.targetCellPositions
      : [menu.cellPos]
    const transaction = setStatusCellValues(editor.state, targetCellPositions, value)
    if (!transaction) return
    editor.view.dispatch(transaction)
    setNewStatus('')
    setMenu(null)
    editor.commands.focus()
  }

  function refreshMenu(currentValue?: string) {
    if (!menu) return
    const config = getStatusConfigForCell(editor.state, menu.cellPos)
    setMenu(previous => previous ? {
      ...previous,
      ...config,
      currentValue: currentValue ?? previous.currentValue,
    } : previous)
  }

  function commitRename(status: string) {
    if (!menu) return
    const normalizedDraft = statusDraft.trim()
    if (!normalizedDraft || normalizedDraft === status) {
      setEditingStatus(null)
      return
    }
    const transaction = renameStatusOption(editor.state, menu.cellPos, status, normalizedDraft)
    if (!transaction) return
    editor.view.dispatch(transaction)
    refreshMenu(menu.currentValue === status ? normalizedDraft : menu.currentValue)
    setEditingStatus(null)
  }

  function removeStatus(status: string) {
    if (!menu) return
    const transaction = deleteStatusOption(editor.state, menu.cellPos, status)
    if (!transaction) return
    editor.view.dispatch(transaction)
    refreshMenu(menu.currentValue === status ? '' : menu.currentValue)
  }

  function moveStatus(status: string, direction: -1 | 1) {
    if (!menu) return
    const transaction = moveStatusOption(editor.state, menu.cellPos, status, direction)
    if (!transaction) return
    editor.view.dispatch(transaction)
    refreshMenu()
  }

  function changeStatusTone(status: string, tone: TableStatusTone) {
    if (!menu) return
    const transaction = setStatusOptionTone(editor.state, menu.cellPos, status, tone)
    if (!transaction) return
    editor.view.dispatch(transaction)
    refreshMenu()
  }

  useEffect(() => {
    const editorElement = editor.view.dom

    // 이미 선택된 셀을 다시 누르면 ProseMirror가 click 전에 선택을 풀 수 있어 범위를 미리 보존한다.
    // Python으로 치면: def remember_selection_before_click(event): ...
    function handleEditorMouseDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const cell = target.closest<HTMLTableCellElement>('td[data-cell-type="status"]')
      if (!cell || !editorElement.contains(cell)) {
        pendingSelectedCellPositionsRef.current = null
        return
      }
      const cellPos = getCellPosition(editor, cell)
      if (cellPos === null) return
      const selectedPositions = getSelectedStatusCellPositions(editor.state, cellPos)
      pendingSelectedCellPositionsRef.current = selectedPositions.length > 1
        ? selectedPositions
        : null
    }

    // 상태 셀 클릭 시 현재 값과 셀 위치를 캡처한다.
    // Python으로 치면: def on_editor_click(event): self.open(cell)
    function handleEditorClick(event: MouseEvent) {
      if (!editor.isEditable) return
      const target = event.target
      if (!(target instanceof Element)) return
      const cell = target.closest<HTMLTableCellElement>('td[data-cell-type="status"]')
      if (!cell || !editorElement.contains(cell)) return
      const cellPos = getCellPosition(editor, cell)
      if (cellPos === null) return
      const selectedPositions = getSelectedStatusCellPositions(editor.state, cellPos)
      const preservedPositions = pendingSelectedCellPositionsRef.current
      const targetCellPositions = selectedPositions.length > 1
        ? selectedPositions
        : preservedPositions?.includes(cellPos)
          ? preservedPositions
          : selectedPositions
      pendingSelectedCellPositionsRef.current = null
      setNewStatus('')
      setIsManaging(false)
      setEditingStatus(null)
      setColorEditingStatus(null)
      const config = getStatusConfigForCell(editor.state, cellPos)
      setMenu({
        cellPos,
        targetCellPositions,
        currentValue: cell.textContent?.trim() || '',
        options: config.options,
        tones: config.tones,
        ...getMenuPosition(cell.getBoundingClientRect()),
      })
    }

    // 외부 클릭과 Escape, 화면 이동 시 메뉴를 닫는다.
    // Python으로 치면: def close_on_outside_or_escape(event): ...
    function handleDocumentMouseDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    function handleViewportMove() {
      setMenu(null)
    }

    editorElement.addEventListener('mousedown', handleEditorMouseDown, true)
    editorElement.addEventListener('click', handleEditorClick)
    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleDocumentKeyDown)
    window.addEventListener('resize', handleViewportMove)
    window.addEventListener('scroll', handleViewportMove, true)
    return () => {
      editorElement.removeEventListener('mousedown', handleEditorMouseDown, true)
      editorElement.removeEventListener('click', handleEditorClick)
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      window.removeEventListener('resize', handleViewportMove)
      window.removeEventListener('scroll', handleViewportMove, true)
    }
  }, [editor])

  if (!menu || typeof document === 'undefined') return null
  const targetCellPositions = menu.targetCellPositions?.length
    ? menu.targetCellPositions
    : [menu.cellPos]

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label="표 셀 상태 선택"
      className="fixed z-[100] w-64 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-800"
      style={{ left: menu.left, top: menu.top }}
      onMouseDown={event => {
        if ((event.target as Element).closest('input')) {
          event.stopPropagation()
          return
        }
        event.preventDefault()
        event.stopPropagation()
      }}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {isManaging ? (
        <>
          <button
            type="button"
            className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            onClick={() => {
              setIsManaging(false)
              setEditingStatus(null)
            }}
          >
            <ArrowLeft size={13} />
            상태 관리
          </button>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {menu.options.map((status, index) => {
              const tone = menu.tones?.[status] ?? index % STATUS_MENU_BADGE_CLASSES.length
              return (
                <div key={status} className="rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <button
                      type="button"
                      aria-label={`${status} 색상 선택`}
                      title="색상 선택"
                      aria-expanded={colorEditingStatus === status}
                      className={`h-5 w-5 shrink-0 rounded-full ring-1 ring-black/10 ${STATUS_TONE_SWATCH_CLASSES[tone]}`}
                      onClick={() => setColorEditingStatus(current => current === status ? null : status)}
                      onContextMenu={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        setColorEditingStatus(status)
                      }}
                    />
                    {editingStatus === status ? (
                      <input
                        autoFocus
                        value={statusDraft}
                        maxLength={40}
                        aria-label={`${status} 이름 변경`}
                        className="min-w-0 flex-1 rounded border border-blue-300 bg-transparent px-1.5 py-1 text-xs text-gray-700 outline-none dark:border-blue-600 dark:text-gray-200"
                        onChange={event => setStatusDraft(event.target.value)}
                        onBlur={() => commitRename(status)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitRename(status)
                          }
                          if (event.key === 'Escape') setEditingStatus(null)
                        }}
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-200">{status}</span>
                    )}
                    <button type="button" title="이름 변경" className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200" onClick={() => {
                      setEditingStatus(status)
                      setStatusDraft(status)
                    }}><Pencil size={11} /></button>
                    <button type="button" title="위로 이동" disabled={index === 0} className="rounded p-1 text-gray-400 hover:bg-gray-200 disabled:opacity-25 dark:hover:bg-gray-700" onClick={() => moveStatus(status, -1)}><ChevronUp size={11} /></button>
                    <button type="button" title="아래로 이동" disabled={index === menu.options.length - 1} className="rounded p-1 text-gray-400 hover:bg-gray-200 disabled:opacity-25 dark:hover:bg-gray-700" onClick={() => moveStatus(status, 1)}><ChevronDown size={11} /></button>
                    <button type="button" title="상태 삭제" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40" onClick={() => removeStatus(status)}><Trash2 size={11} /></button>
                  </div>
                  {colorEditingStatus === status && (
                    <div role="group" aria-label={`${status} 색상 팔레트`} className="px-2 pb-2 pt-1">
                      <div className="flex items-center gap-2">
                        {STATUS_TONE_NAMES.map((toneName, toneIndex) => (
                          <button
                            key={toneName}
                            type="button"
                            aria-label={`${status} ${toneName} 색상`}
                            title={toneName}
                            aria-pressed={tone === toneIndex}
                            className={`h-7 w-7 rounded-full ring-offset-2 transition-transform hover:scale-110 ${STATUS_TONE_SWATCH_CLASSES[toneIndex]} ${tone === toneIndex ? 'ring-2 ring-blue-600 dark:ring-blue-300' : 'ring-1 ring-black/10'}`}
                            onClick={() => changeStatusTone(status, toneIndex as TableStatusTone)}
                          />
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                        현재 색상: {STATUS_TONE_NAMES[tone]}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="border-t border-gray-100 px-2 pt-1.5 text-[10px] text-gray-400 dark:border-gray-700">
            색상 원을 누른 뒤 팔레트에서 색상을 선택하세요.
          </p>
        </>
      ) : (
        <>
          {targetCellPositions.length > 1 && (
            <p className="px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-300">
              선택한 {targetCellPositions.length}개 셀에 적용
            </p>
          )}
          <div className="max-h-44 overflow-y-auto">
            {menu.options.length === 0 && (
              <p className="px-2 py-2 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
                아래에서 상태를 직접 입력해 추가하세요.
              </p>
            )}
            {menu.options.map((status, index) => {
              const tone = menu.tones?.[status] ?? index % STATUS_MENU_BADGE_CLASSES.length
              return (
                <button
                  key={status}
                  type="button"
                  role="option"
                  aria-selected={menu.currentValue === status}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={() => applyStatus(status)}
                >
                  <span className={`inline-flex max-w-44 truncate rounded-full px-2 py-0.5 font-medium ${STATUS_MENU_BADGE_CLASSES[tone]}`}>
                    {status}
                  </span>
                  {menu.currentValue === status && <Check size={13} className="shrink-0 text-blue-500" />}
                </button>
              )
            })}
          </div>
          <form
            className="mt-1 flex items-center gap-1 border-t border-gray-100 pt-1.5 dark:border-gray-700"
            onSubmit={event => {
              event.preventDefault()
              applyStatus(newStatus)
            }}
          >
            <input
              value={newStatus}
              maxLength={40}
              placeholder="새 상태 입력"
              aria-label="새 표 상태"
              className="min-w-0 flex-1 rounded-md border border-gray-200 bg-transparent px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 dark:border-gray-600 dark:text-gray-200"
              onChange={event => setNewStatus(event.target.value)}
            />
            <button
              type="submit"
              title="상태 추가"
              disabled={!newStatus.trim()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-blue-500 hover:bg-blue-50 disabled:text-gray-300 dark:hover:bg-blue-950/40 dark:disabled:text-gray-600"
            >
              <Plus size={13} />
            </button>
          </form>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-1.5 rounded-lg border-t border-gray-100 px-2 py-1.5 text-left text-[11px] text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={() => setIsManaging(true)}
          >
            <Settings2 size={12} />
            상태 관리
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
