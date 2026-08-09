// =============================================
// src/components/editor/TableToolbar.tsx
// 역할: 테이블 블록 전용 플로팅 툴바
//   - 커서가 테이블 안에 있을 때 테이블 위에 절대 위치로 표시
//   - 아이콘 전용 버튼 (툴팁으로 기능 안내)
//   - 행/열 추가·삭제, 테이블 삭제
// Python으로 치면: class TableToolbar(FloatingWidget): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { usePageStore } from '@/store/pageStore'
import { BlockType } from '@/types/block'
import {
  getSelectedColumnType,
  setSelectedColumnType,
  type TableColumnType,
} from '@/extensions/StatusTableCell'
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Check, Minus, Trash2,
} from 'lucide-react'

interface TableToolbarProps {
  editor: TiptapEditor
  pageId: string
  blockId: string
}

// -----------------------------------------------
// 아이콘 버튼 — 작은 정사각 버튼
// Python으로 치면: def IconBtn(title, onClick, danger=False, children): ...
// -----------------------------------------------
function IconBtn({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  const cls = danger
    ? "flex items-center justify-center w-6 h-6 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
    : "flex items-center justify-center w-6 h-6 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
  return (
    <button type="button" onClick={onClick} title={title} className={cls}>
      {children}
    </button>
  )
}

// -----------------------------------------------
// 그룹 구분선
// -----------------------------------------------
function Sep() {
  return <span className="w-px h-3.5 bg-gray-200 dark:bg-gray-700 mx-0.5 shrink-0" />
}

// -----------------------------------------------
// TableToolbar 메인 컴포넌트
// absolute -top-10 left-8: 테이블 위에 왼쪽 정렬로 띄움
// group-hover:opacity-100: 블록 hover 시 나타남
// Python으로 치면: class TableToolbar(AbsoluteWidget): top=-40, left=32
// -----------------------------------------------
export default function TableToolbar({ editor, pageId, blockId }: TableToolbarProps) {
  const { updateBlockType, updateBlock } = usePageStore()
  const [columnType, setColumnType] = useState<TableColumnType>(() => getSelectedColumnType(editor.state))
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const typeMenuRef = useRef<HTMLDivElement>(null)

  // 커서가 다른 열로 이동하거나 표 transaction이 발생하면 툴바 표시값을 갱신한다.
  // Python으로 치면: editor.on(['selection_update', 'transaction'], sync_column_type)
  useEffect(() => {
    function syncColumnType() {
      setColumnType(getSelectedColumnType(editor.state))
    }
    editor.on('selectionUpdate', syncColumnType)
    editor.on('transaction', syncColumnType)
    return () => {
      editor.off('selectionUpdate', syncColumnType)
      editor.off('transaction', syncColumnType)
    }
  }, [editor])

  // 열 타입 메뉴의 외부 클릭과 Escape 닫기를 처리한다.
  // Python으로 치면: def close_type_menu_on_outside(event): ...
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (!typeMenuRef.current?.contains(event.target as Node)) setTypeMenuOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setTypeMenuOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // 선택한 열 전체의 타입을 transaction 한 번으로 변경한다.
  // Python으로 치면: def change_column_type(cell_type): dispatch(transaction)
  function handleColumnTypeChange(cellType: TableColumnType) {
    const transaction = setSelectedColumnType(editor.state, cellType)
    if (transaction) editor.view.dispatch(transaction)
    setColumnType(cellType)
    setTypeMenuOpen(false)
    editor.commands.focus()
  }

  // 테이블 삭제 — Tiptap에서 테이블 제거 후 블록 타입을 paragraph로 복원
  // Python으로 치면: def delete_table(): editor.delete_table(); block.type = 'paragraph'
  function handleDeleteTable() {
    editor.chain().focus().deleteTable().run()
    updateBlockType(pageId, blockId, 'paragraph' as BlockType)
    updateBlock(pageId, blockId, '')
  }

  return (
    // -----------------------------------------------
    // 플로팅 pill 컨테이너
    // absolute: 블록 래퍼(position:relative) 기준으로 위치
    // -top-10: 테이블 위에 띄움
    // glass: white/95 + backdrop-blur + border
    // Python으로 치면: render FloatingPill(position='top-left')
    // -----------------------------------------------
    <div
      className="absolute -top-10 left-8 z-20 flex items-center gap-0.5 px-1.5 py-1 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200/70 dark:border-gray-700/80 rounded-xl shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >

      {/* ── 행 조작 그룹 ──────────────────────────── */}
      <IconBtn
        title="위에 행 추가"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        <ChevronUp size={12} />
      </IconBtn>
      <IconBtn
        title="아래에 행 추가"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <ChevronDown size={12} />
      </IconBtn>
      <IconBtn
        title="행 삭제"
        onClick={() => editor.chain().focus().deleteRow().run()}
        danger
      >
        <Minus size={12} />
      </IconBtn>

      <Sep />

      {/* ── 열 조작 그룹 ──────────────────────────── */}
      <IconBtn
        title="왼쪽에 열 추가"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        <ChevronLeft size={12} />
      </IconBtn>
      <IconBtn
        title="오른쪽에 열 추가"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <ChevronRight size={12} />
      </IconBtn>
      <IconBtn
        title="열 삭제"
        onClick={() => editor.chain().focus().deleteColumn().run()}
        danger
      >
        <Minus size={12} />
      </IconBtn>

      <Sep />

      {/* ── 선택 열 타입 ───────────────────────────── */}
      <div ref={typeMenuRef} className="relative">
        <button
          type="button"
          title="선택한 열의 타입 변경"
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          onMouseDown={event => event.preventDefault()}
          onClick={() => setTypeMenuOpen(open => !open)}
        >
          <span className="text-gray-400 dark:text-gray-500">열 타입:</span>
          <span>{columnType === 'status' ? '상태' : '텍스트'}</span>
          <ChevronDown size={10} />
        </button>
        {typeMenuOpen && (
          <div className="absolute left-0 top-7 z-30 w-28 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {(['text', 'status'] as const).map(type => (
              <button
                key={type}
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                onMouseDown={event => event.preventDefault()}
                onClick={() => handleColumnTypeChange(type)}
              >
                <span>{type === 'status' ? '상태' : '텍스트'}</span>
                {columnType === type && <Check size={12} className="text-blue-500" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <Sep />

      {/* ── 테이블 전체 삭제 ──────────────────────── */}
      <IconBtn
        title="표 삭제"
        onClick={handleDeleteTable}
        danger
      >
        <Trash2 size={12} />
      </IconBtn>

    </div>
  )
}
