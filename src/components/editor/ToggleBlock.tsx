// =============================================
// src/components/editor/ToggleBlock.tsx
// 역할: 토글 블록 — 헤더 클릭으로 내용 접고 펼치기
//       isOpen 상태를 localStorage에 영속하여 리렌더/새로고침 후에도 유지
// Python으로 치면: class ToggleBlock(Widget): is_open = load_from_storage(); header = ""; body = ""
// =============================================

'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { useState, useRef, useEffect, memo } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useLocale } from '@/locales'
import { OPEN_TOGGLE_BLOCKS_EVENT } from '@/lib/blockReveal'

interface ToggleBlockProps {
  block: Block
  pageId: string
  isLast: boolean    // 마지막 블록 여부 (Backspace 삭제 방지)
  readMode?: boolean // 읽기 모드 — true이면 편집 불가
  // PageEditor에서 미리 렌더링된 자식 블록 (순환 의존성 방지용 slot 패턴)
  // Python으로 치면: self.children: ReactNode = None
  children?: React.ReactNode
}

// -----------------------------------------------
// localStorage 키 생성 헬퍼
// Python으로 치면: def storage_key(block_id): return f'toggle-open-{block_id}'
// -----------------------------------------------
function storageKey(blockId: string): string {
  return `toggle-open-${blockId}`
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
  return { header: content, body: '' }
}

// -----------------------------------------------
// localStorage에서 isOpen 초기값 읽기
// Python으로 치면: def load_open(block_id): return json.loads(storage.get(key)) or False
// -----------------------------------------------
function loadIsOpen(blockId: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey(blockId))
    if (raw !== null) return JSON.parse(raw) === true
  } catch {}
  return false
}

// -----------------------------------------------
// ToggleBlock 컴포넌트
// React.memo — block.id / block.content / readMode가 바뀌지 않으면 리렌더 생략
// Python으로 치면: @cached_property 패턴과 유사
// -----------------------------------------------
const ToggleBlock = memo(function ToggleBlock({ block, pageId, isLast, readMode, children }: ToggleBlockProps) {
  const { updateBlock, deleteBlock } = usePageStore()
  const t = useLocale()

  const { header: initHeader, body: initBody } = parseToggle(block.content)

  // ── 상태 ──────────────────────────────────────
  // isOpen: localStorage 초기값으로 복원 → 리렌더/새로고침 후에도 유지
  // Python으로 치면: self.is_open = load_from_storage(block_id)
  const [isOpen, setIsOpen] = useState<boolean>(() => loadIsOpen(block.id))

  // 최신 HTML을 클로저 밖에서 읽기 위한 ref
  const headerRef = useRef(initHeader)
  const bodyRef = useRef(initBody)

  // 신규 블록 여부 — 헤더·바디 모두 빈 경우 헤더 에디터 자동 포커스
  const isNew = !initHeader && !initBody

  // Enter 키로 토글을 열 때 바디 에디터 포커스 이동 트리거
  const [focusBodyOnOpen, setFocusBodyOnOpen] = useState(false)

  // ── isOpen 변경 시 localStorage 저장 ──────────
  // Python으로 치면: @is_open.setter: storage.set(key, value)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(block.id), JSON.stringify(isOpen))
    } catch {}
  }, [isOpen, block.id])

  // The planner panel can target a nested block.  React to its reveal request
  // when this toggle is already mounted; localStorage covers a page switch.
  useEffect(() => {
    const openRequestedToggles = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail
      if (Array.isArray(ids) && ids.includes(block.id)) setIsOpen(true)
    }
    window.addEventListener(OPEN_TOGGLE_BLOCKS_EVENT, openRequestedToggles)
    return () => window.removeEventListener(OPEN_TOGGLE_BLOCKS_EVENT, openRequestedToggles)
  }, [block.id])

  // -----------------------------------------------
  // header/body 변경 시 block.content에 JSON으로 저장
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
  // heading·list·code·blockquote 비활성화 → 단순 인라인 서식만 허용
  // Python으로 치면: header_editor = Editor(extensions=[Paragraph, Bold, Italic])
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
      Placeholder.configure({ placeholder: t.blocks.toggle.titlePlaceholder }),
    ],
    content: initHeader || '',
    autofocus: isNew ? 'end' : false,
    editable: !readMode,
    onUpdate: ({ editor }) => {
      if (!readMode) saveContent(editor.getHTML(), undefined)
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (readMode) return false
        // Enter → 토글 열기 + body 에디터로 포커스 이동
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          setIsOpen(true)
          setFocusBodyOnOpen(true)
          return true
        }
        // Backspace + 헤더 비어있음 → 블록 삭제 (마지막 블록은 삭제 방지)
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

  // readMode 변경 시 헤더 에디터 editable 동기화
  // Python으로 치면: @readMode.setter: header_editor.setEditable(not readMode)
  useEffect(() => {
    if (!headerEditor) return
    headerEditor.setEditable(!readMode)
  }, [headerEditor, readMode])

  // ── 바디 에디터 ────────────────────────────────
  // heading 포함 풀 서식 지원 (H1/H2/H3 모두 허용)
  // Python으로 치면: body_editor = Editor(extensions=[StarterKit])
  const bodyEditor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      Placeholder.configure({ placeholder: t.blocks.toggle.contentPlaceholder }),
    ],
    content: initBody || '',
    editable: !readMode,
    onUpdate: ({ editor }) => {
      if (!readMode) saveContent(undefined, editor.getHTML())
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (readMode) return false
        // Escape → 헤더 에디터로 포커스 복귀
        // Python으로 치면: if event.key == 'Escape': header_editor.focus()
        if (event.key === 'Escape') {
          headerEditor?.commands.focus('end')
          return true
        }
        return false
      },
    },
    immediatelyRender: false,
  })

  // readMode 변경 시 바디 에디터 editable 동기화
  useEffect(() => {
    if (!bodyEditor) return
    bodyEditor.setEditable(!readMode)
  }, [bodyEditor, readMode])

  // isOpen + focusBodyOnOpen 시 바디로 포커스
  // Python으로 치면: @observe(is_open, focus_body_on_open) def on_open(): body.focus()
  useEffect(() => {
    if (isOpen && focusBodyOnOpen && bodyEditor) {
      bodyEditor.commands.focus('end')
      setFocusBodyOnOpen(false)
    }
  }, [isOpen, focusBodyOnOpen, bodyEditor])

  // ── 화살표 버튼 스타일 (열리면 90° 회전) ─────────
  const arrowClass = isOpen
    ? "mt-0.5 shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rotate-90 transition-transform duration-200"
    : "mt-0.5 shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-transform duration-200"

  return (
    // 토글 전체 래퍼
    // Python으로 치면: class ToggleWidget(VBox): [header_row, body_area]
    <div className="w-full">

      {/* ── 헤더 행: 화살표 버튼 + 헤더 에디터 ────── */}
      <div className="flex items-start gap-1.5">

        {/* 화살표 버튼: 클릭 시 열기/닫기 토글 */}
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={arrowClass}
          title={isOpen ? t.blocks.toggle.collapseTitle : t.blocks.toggle.expandTitle}
        >
          {/* 오른쪽 방향 삼각형 SVG (rotate-90 으로 아래 방향 전환) */}
          <svg viewBox="0 0 6 10" className="w-2.5 h-2.5 fill-current">
            <path d="M0 0 L6 5 L0 10 Z" />
          </svg>
        </button>

        {/* 헤더 Tiptap 에디터 — 토글 제목 */}
        <EditorContent editor={headerEditor} className="flex-1 outline-none font-medium" />
      </div>

      {/* ── 바디: isOpen=true 일 때만 표시 ──────── */}
      {/* children(하위 블록)이 있으면 Tiptap body 대신 children 렌더링 */}
      {/* Python으로 치면: if is_open: body_area.show() */}
      {isOpen && (
        <div className="ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700 mt-0.5">
          {children
            ? (
              // 하위 블록 모드 — PageEditor에서 전달한 Editor 컴포넌트 목록
              // Python으로 치면: for child_block in children: render(child_block)
              <div className="space-y-0.5 py-0.5">
                {children}
              </div>
            )
            : (
              // 기존 Tiptap body 에디터 모드 (하위 블록 없을 때)
              <EditorContent editor={bodyEditor} className="outline-none" />
            )
          }
        </div>
      )}

    </div>
  )
})

export default ToggleBlock
