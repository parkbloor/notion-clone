// =============================================
// src/components/editor/LayoutSlot.tsx
// 역할: 레이아웃 블록 안의 개별 슬롯 — 미니 Tiptap 에디터 목록
// 각 슬롯은 Block[] 을 입력받아 렌더링하고, 변경 시 onChange 로 알림
// Python으로 치면: class LayoutSlot(Widget): def render_blocks(self): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Block, createBlock } from '@/types/block'

// ── 슬롯 내 개별 블록의 미니 Tiptap 에디터 ───────────────────────
// Python으로 치면: class SlotBlockEditor(Widget): def __init__(self, block, ...): ...
interface SlotBlockEditorProps {
  block: Block
  onUpdate: (content: string) => void   // 내용 변경 시 콜백
  onAddBelow: () => void                 // Enter → 아래에 새 블록 추가
  onDelete: () => void                   // Backspace on empty → 현재 블록 삭제
  isLast: boolean                        // 마지막 블록이면 삭제 금지
  focusOnMount?: boolean                 // 마운트 즉시 포커스 (새 블록 추가 시)
}

function SlotBlockEditor({
  block,
  onUpdate,
  onAddBelow,
  onDelete,
  isLast,
  focusOnMount = false,
}: SlotBlockEditorProps) {
  // stale closure 방지 — useEditor 내부 콜백이 항상 최신 함수를 참조하도록 ref 사용
  // Python으로 치면: self._on_update = WeakRef(on_update)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const onAddBelowRef = useRef(onAddBelow)
  onAddBelowRef.current = onAddBelow
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete
  const isLastRef = useRef(isLast)
  isLastRef.current = isLast

  const editor = useEditor({
    extensions: [
      // 기본 StarterKit: 제목·굵기·기울임·코드 인라인·목록 포함
      // Python으로 치면: extensions = [StarterKit(heading_levels=[1,2,3])]
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: '내용 입력...',
      }),
    ],
    // 초기 내용 — Tiptap이 마운트 시 한 번만 읽음 (이후 변경은 onUpdate로 전달)
    // Python으로 치면: editor.set_content(block.content)
    content: block.content || '',
    onUpdate: ({ editor }) => {
      // 내용 변경 시 최신 콜백을 통해 부모에 알림
      // Python으로 치면: self._on_update(editor.get_html())
      onUpdateRef.current(editor.getHTML())
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        // Enter (Shift 없이): 현재 블록 아래에 새 블록 추가
        // Python으로 치면: if key == 'Enter' and not shift: add_below()
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onAddBelowRef.current()
          return true
        }
        // Backspace on empty: 현재 블록 삭제 (마지막 블록은 유지)
        // Python으로 치면: if key == 'Backspace' and is_empty and not is_last: delete()
        if (event.key === 'Backspace') {
          const isEmpty = _view.state.doc.textContent.length === 0
          if (isEmpty && !isLastRef.current) {
            onDeleteRef.current()
            return true
          }
        }
        return false
      },
    },
    immediatelyRender: false,
  })

  // 마운트 직후 포커스 (새로 추가된 블록에만 적용)
  // Python으로 치면: if focus_on_mount: asyncio.create_task(self.focus())
  useEffect(() => {
    if (focusOnMount && editor) {
      // setTimeout 0: React 렌더 완료 후 포커스 (flushSync 충돌 방지)
      setTimeout(() => editor.commands.focus('end'), 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <EditorContent
      editor={editor}
      className="outline-none text-sm leading-relaxed"
    />
  )
}

// ── LayoutSlot 메인 컴포넌트 ──────────────────────────────────────
// Python으로 치면: class LayoutSlot(Widget): def render(self): ...
interface LayoutSlotProps {
  slotId: 'a' | 'b' | 'c'   // 슬롯 식별자 (디버깅용)
  blocks: Block[]             // 슬롯 내 블록 목록 (controlled)
  onChange: (blocks: Block[]) => void  // 블록 목록 변경 콜백
  className?: string          // 추가 CSS 클래스 (flex-1, col-span-2 등)
}

export default function LayoutSlot({
  slotId: _slotId,
  blocks,
  onChange,
  className = '',
}: LayoutSlotProps) {
  // 마지막으로 추가된 블록 ID — 자동 포커스에 사용
  // Python으로 치면: self._last_added_id: Optional[str] = None
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)

  // 블록 내용 업데이트 — 특정 id의 블록 content 교체
  // Python으로 치면: def update_block(self, id, content): self.blocks[id].content = content
  function updateBlock(id: string, content: string) {
    onChange(
      blocks.map(b => b.id === id ? { ...b, content, updatedAt: new Date() } : b)
    )
  }

  // 특정 블록 아래에 새 빈 블록 삽입
  // Python으로 치면: def add_block(self, after_id): blocks.insert(idx+1, new_block)
  function addBlock(afterId: string) {
    const idx = blocks.findIndex(b => b.id === afterId)
    const newBlock = createBlock('paragraph')
    const newBlocks = [...blocks]
    newBlocks.splice(idx + 1, 0, newBlock)
    setLastAddedId(newBlock.id)   // 새 블록에 포커스 예약
    onChange(newBlocks)
  }

  // 블록 삭제 — 마지막 블록은 삭제하지 않음
  // Python으로 치면: def delete_block(self, id): if len(blocks) > 1: blocks.remove(id)
  function deleteBlock(id: string) {
    if (blocks.length <= 1) return
    const idx = blocks.findIndex(b => b.id === id)
    const newBlocks = blocks.filter(b => b.id !== id)
    // 삭제 후 이전 블록에 포커스
    const focusTarget = newBlocks[Math.max(0, idx - 1)]
    setLastAddedId(focusTarget?.id ?? null)
    onChange(newBlocks)
  }

  return (
    <div className={`layout-slot overflow-y-auto bg-white rounded border border-gray-100 p-2 ${className}`}>
      <div className="space-y-0.5">
        {blocks.map((block, _idx) => (
          <SlotBlockEditor
            key={block.id}
            block={block}
            onUpdate={content => updateBlock(block.id, content)}
            onAddBelow={() => addBlock(block.id)}
            onDelete={() => deleteBlock(block.id)}
            isLast={blocks.length === 1}
            focusOnMount={block.id === lastAddedId}
          />
        ))}
      </div>
    </div>
  )
}
