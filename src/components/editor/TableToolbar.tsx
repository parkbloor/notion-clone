// =============================================
// src/components/editor/TableToolbar.tsx
// 역할: 테이블 블록 전용 플로팅 툴바
//   - 커서가 테이블 안에 있을 때 테이블 위에 절대 위치로 표시
//   - 아이콘 전용 버튼 (툴팁으로 기능 안내)
//   - 행/열 추가·삭제, 테이블 삭제
// Python으로 치면: class TableToolbar(FloatingWidget): ...
// =============================================

'use client'

import { Editor as TiptapEditor } from '@tiptap/react'
import { usePageStore } from '@/store/pageStore'
import { BlockType } from '@/types/block'
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Minus, Trash2,
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
    <div className="absolute -top-10 left-8 z-20 flex items-center gap-0.5 px-1.5 py-1 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200/70 dark:border-gray-700/80 rounded-xl shadow-md">

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
