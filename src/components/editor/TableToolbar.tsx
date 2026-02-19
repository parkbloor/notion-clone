// =============================================
// src/components/editor/TableToolbar.tsx
// 역할: 테이블 블록 전용 툴바 — 행/열 추가·삭제, 테이블 삭제
// 커서가 테이블 안에 있을 때만 표시됨
// Python으로 치면: class TableToolbar(Widget): ...
// =============================================

'use client'

import { Editor as TiptapEditor } from '@tiptap/react'
import { usePageStore } from '@/store/pageStore'
import { BlockType } from '@/types/block'

interface TableToolbarProps {
  editor: TiptapEditor
  pageId: string
  blockId: string
}

// -----------------------------------------------
// 툴바 버튼 하나를 위한 작은 컴포넌트
// Python으로 치면: def ToolbarButton(label, onClick, danger=False): ...
// -----------------------------------------------
function ToolbarBtn({
  label,
  onClick,
  danger = false,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  const cls = danger
    ? "px-2 py-0.5 text-xs rounded text-red-500 hover:bg-red-50 transition-colors"
    : "px-2 py-0.5 text-xs rounded text-gray-600 hover:bg-gray-100 transition-colors"
  return (
    <button onClick={onClick} className={cls}>
      {label}
    </button>
  )
}

// -----------------------------------------------
// 구분선 — 버튼 그룹 사이를 나누는 세로선
// -----------------------------------------------
function Divider() {
  return <span className="w-px h-4 bg-gray-200 mx-1 self-center" />
}

export default function TableToolbar({ editor, pageId, blockId }: TableToolbarProps) {
  const { updateBlockType, updateBlock } = usePageStore()

  // -----------------------------------------------
  // 테이블 삭제 — 에디터에서 테이블을 제거하고
  // 블록 타입을 paragraph로 되돌림
  // Python으로 치면:
  //   def delete_table():
  //       editor.delete_table()
  //       block.type = 'paragraph'
  //       block.content = ''
  // -----------------------------------------------
  function handleDeleteTable() {
    editor.chain().focus().deleteTable().run()
    // 블록 타입 복원: 테이블 삭제 후 paragraph로 돌아가야
    // 다음 렌더에서 applyBlockType이 새 테이블을 재삽입하는 것을 방지
    updateBlockType(pageId, blockId, 'paragraph' as BlockType)
    updateBlock(pageId, blockId, '')
  }

  return (
    // -----------------------------------------------
    // 툴바 컨테이너
    // 테이블 위에 한 줄로 표시, 스크롤 가능
    // Python으로 치면: render toolbar_container
    // -----------------------------------------------
    <div className="flex items-center gap-0.5 mb-1 px-1 py-0.5 bg-gray-50 border border-gray-200 rounded text-xs overflow-x-auto">

      {/* ── 행 조작 그룹 ──────────────────────────── */}
      <span className="text-gray-400 text-xs mr-1 shrink-0">행</span>
      <ToolbarBtn
        label="↑ 위에 추가"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      />
      <ToolbarBtn
        label="↓ 아래에 추가"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <ToolbarBtn
        label="행 삭제"
        onClick={() => editor.chain().focus().deleteRow().run()}
        danger
      />

      <Divider />

      {/* ── 열 조작 그룹 ──────────────────────────── */}
      <span className="text-gray-400 text-xs mr-1 shrink-0">열</span>
      <ToolbarBtn
        label="← 왼쪽 추가"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      />
      <ToolbarBtn
        label="오른쪽 추가 →"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />
      <ToolbarBtn
        label="열 삭제"
        onClick={() => editor.chain().focus().deleteColumn().run()}
        danger
      />

      <Divider />

      {/* ── 테이블 전체 삭제 ──────────────────────── */}
      <ToolbarBtn
        label="표 삭제"
        onClick={handleDeleteTable}
        danger
      />
    </div>
  )
}
