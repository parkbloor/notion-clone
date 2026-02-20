// =============================================
// src/components/editor/ToggleBlock.tsx
// 역할: 토글 블록 — 헤더 클릭으로 내용 접고 펼치기
// Python으로 치면: class ToggleBlock(Widget): is_open = False; header = ""; body = ""
// =============================================

'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { useState, useRef } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

interface ToggleBlockProps {
  block: Block
  pageId: string
  isLast: boolean   // 마지막 블록 여부 (Backspace 삭제 방지용)
}

// -----------------------------------------------
// content 파싱 헬퍼
// 새 포맷: JSON { header: HTML, body: HTML }
// 구 포맷(legacy): plain text → header로 사용
// Python으로 치면: def parse_toggle(s): return json.loads(s) or {'header': s, 'body': ''}
// -----------------------------------------------
function parseToggle(content: string): { header: string; body: string } {
  if (!content) return { header: '', body: '' }
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed.header === 'string') return parsed
  } catch {}
  // 구 포맷: plain 문자열을 header로 간주
  return { header: content, body: '' }
}

export default function ToggleBlock({ block, pageId, isLast }: ToggleBlockProps) {
  const { updateBlock, deleteBlock } = usePageStore()

  // content 파싱 (초기값)
  const { header: initHeader, body: initBody } = parseToggle(block.content)

  // ── 상태 ──────────────────────────────────────
  // 토글 열림/닫힘 상태 (로컬 only, 저장 안 함)
  // Python으로 치면: self.is_open = False
  const [isOpen, setIsOpen] = useState(false)

  // 최신 HTML을 클로저 밖에서 읽기 위한 ref
  // Python으로 치면: self._header_html = init_header
  const headerRef = useRef(initHeader)
  const bodyRef = useRef(initBody)

  // 신규 블록 여부 — 헤더·바디 모두 빈 경우 헤더 에디터 자동 포커스
  // Python으로 치면: is_new = not init_header and not init_body
  const isNew = !initHeader && !initBody

  // -----------------------------------------------
  // header/body 중 하나가 변경될 때 block.content에 JSON으로 저장
  // Python으로 치면: def save(header=None, body=None): update_block(json.dumps({...}))
  // -----------------------------------------------
  function saveContent(newHeader?: string, newBody?: string) {
    if (newHeader !== undefined) headerRef.current = newHeader
    if (newBody !== undefined) bodyRef.current = newBody
    updateBlock(
      pageId,
      block.id,
      JSON.stringify({ header: headerRef.current, body: bodyRef.current })
    )
  }

  // ── 헤더 에디터 ────────────────────────────────
  // heading·list·code·blockquote 비활성화 → 단순 텍스트 서식만 허용
  // Python으로 치면: header_editor = Editor(extensions=[Paragraph, Bold, Italic, Strike])
  const headerEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
      }),
      Placeholder.configure({ placeholder: '토글' }),
    ],
    content: initHeader || '',
    // 신규 블록이면 헤더 에디터 자동 포커스
    autofocus: isNew ? 'end' : false,
    onUpdate: ({ editor }) => { saveContent(editor.getHTML(), undefined) },
    editorProps: {
      handleKeyDown: (_view, event) => {
        // Enter → 토글 열기 + body 에디터로 포커스 이동
        // Python으로 치면: if event.key == 'Enter': open(); body.focus()
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          setIsOpen(true)
          // setTimeout 0: 상태 업데이트(setIsOpen) 후 DOM이 갱신된 다음 포커스
          setTimeout(() => bodyEditor?.commands.focus('end'), 0)
          return true
        }
        // Backspace + 헤더 비어있음 → 블록 삭제 (마지막 블록은 삭제 방지)
        // Python으로 치면: if event.key == 'Backspace' and empty and not last: delete()
        if (event.key === 'Backspace') {
          const isEmpty = _view.state.doc.textContent.length === 0
          if (isEmpty && !isLast) {
            deleteBlock(pageId, block.id)
            return true
          }
        }
        return false
      },
    },
    immediatelyRender: false,
  })

  // ── 바디 에디터 ────────────────────────────────
  // heading 포함 풀 서식 지원
  // codeBlock: false → CustomCodeBlock이 없으므로 비활성화
  // Python으로 치면: body_editor = Editor(extensions=[StarterKit])
  const bodyEditor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      Placeholder.configure({ placeholder: '내용을 입력하세요...' }),
    ],
    content: initBody || '',
    onUpdate: ({ editor }) => { saveContent(undefined, editor.getHTML()) },
    immediatelyRender: false,
  })

  // ── 화살표 버튼 스타일 (열리면 90° 회전) ─────────
  // Python으로 치면: arrow_class = "rotate-90 ..." if is_open else "..."
  const arrowClass = isOpen
    ? "mt-1 shrink-0 text-gray-500 hover:text-gray-700 rotate-90 transition-transform duration-200"
    : "mt-1 shrink-0 text-gray-400 hover:text-gray-600 transition-transform duration-200"

  return (
    // 토글 전체 래퍼
    // Python으로 치면: class ToggleWidget(VBox): [header_row, body_area]
    <div className="w-full">

      {/* ── 헤더 행: 화살표 버튼 + 헤더 에디터 ────── */}
      <div className="flex items-start gap-1">

        {/* 화살표 버튼: 클릭 시 열기/닫기, 열리면 SVG가 90° 회전 */}
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={arrowClass}
          title={isOpen ? '접기' : '펼치기'}
        >
          {/* 오른쪽 방향 삼각형 SVG (rotate-90으로 아래 방향 변환) */}
          <svg viewBox="0 0 6 10" className="w-2.5 h-2.5 fill-current">
            <path d="M0 0 L6 5 L0 10 Z" />
          </svg>
        </button>

        {/* 헤더 Tiptap 에디터 — 토글 제목 */}
        <EditorContent editor={headerEditor} className="flex-1 outline-none font-medium" />
      </div>

      {/* ── 바디: 열려있을 때만 표시 ──────────────── */}
      {/* Python으로 치면: if is_open: body_area.show() */}
      {isOpen && (
        <div className="ml-5 pl-3 border-l-2 border-gray-100 mt-0.5">
          <EditorContent editor={bodyEditor} className="outline-none" />
        </div>
      )}

    </div>
  )
}
