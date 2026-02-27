// =============================================
// src/components/editor/BubbleMenuBar.tsx
// 역할: 텍스트 드래그 선택 시 나타나는 인라인 툴바
//       글자 색상 / 배경 색상 피커 포함
// =============================================

'use client'

import { Editor as TiptapEditor } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'


// -----------------------------------------------
// 인라인 서식 버튼 목록
// Python으로 치면: FORMAT_BUTTONS: list[dict] = [...]
// -----------------------------------------------
const FORMAT_BUTTONS = [
  {
    label: 'B',
    title: '굵게 (Ctrl+B)',
    isActive: (editor: TiptapEditor) => editor.isActive('bold'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleBold().run(),
    className: 'font-bold',
  },
  {
    label: 'I',
    title: '기울임 (Ctrl+I)',
    isActive: (editor: TiptapEditor) => editor.isActive('italic'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleItalic().run(),
    className: 'italic',
  },
  {
    label: 'S',
    title: '취소선',
    isActive: (editor: TiptapEditor) => editor.isActive('strike'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleStrike().run(),
    className: 'line-through',
  },
  {
    label: '<>',
    title: '인라인 코드',
    isActive: (editor: TiptapEditor) => editor.isActive('code'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleCode().run(),
    className: 'font-mono text-red-400',
  },
]


// -----------------------------------------------
// 글자 색상 프리셋
// value: null → 색상 제거 (기본 텍스트 색상 복원)
// Python으로 치면: TEXT_COLORS: list[dict] = [{label, value}, ...]
// -----------------------------------------------
const TEXT_COLORS = [
  { label: '기본',  value: null },
  { label: '빨강',  value: '#ef4444' },
  { label: '주황',  value: '#f97316' },
  { label: '노랑',  value: '#ca8a04' },
  { label: '초록',  value: '#16a34a' },
  { label: '파랑',  value: '#3b82f6' },
  { label: '보라',  value: '#a855f7' },
  { label: '회색',  value: '#6b7280' },
]


// -----------------------------------------------
// 배경(형광펜) 색상 프리셋
// value: null → 형광펜 제거
// -----------------------------------------------
const HIGHLIGHT_COLORS = [
  { label: '없음',  value: null },
  { label: '노랑',  value: '#fef08a' },
  { label: '초록',  value: '#bbf7d0' },
  { label: '파랑',  value: '#bfdbfe' },
  { label: '보라',  value: '#e9d5ff' },
  { label: '분홍',  value: '#fecdd3' },
  { label: '주황',  value: '#fed7aa' },
  { label: '회색',  value: '#e5e7eb' },
]


// -----------------------------------------------
// 세로 구분선 컴포넌트 (반복 사용 줄이기)
// -----------------------------------------------
function Divider() {
  return <div className="w-px h-4 bg-gray-600 mx-1" />
}


interface BubbleMenuBarProps {
  editor: TiptapEditor
}

export default function BubbleMenuBar({ editor }: BubbleMenuBarProps) {

  const [visible, setVisible]       = useState(false)
  const [position, setPosition]     = useState({ top: 0, left: 0 })
  const [, forceUpdate]             = useState(0)

  // -----------------------------------------------
  // 현재 열려있는 색상 피커
  // 'text'      → 글자 색상 피커
  // 'highlight' → 배경 색상 피커
  // null        → 피커 닫힘
  // Python으로 치면: open_picker: Literal['text', 'highlight'] | None = None
  // -----------------------------------------------
  const [openPicker, setOpenPicker] = useState<'text' | 'highlight' | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  // 버튼 클릭 시 선택이 해제되므로 미리 저장
  const savedSelection = useRef<{ from: number; to: number } | null>(null)


  // -----------------------------------------------
  // 텍스트 선택 변화 감지 → 버블 메뉴 표시/숨김
  //
  // 핵심: 각 블록이 자체 BubbleMenuBar를 가지므로, document.selectionchange가
  // 모든 인스턴스를 동시에 활성화하는 문제가 있음.
  // → 선택 범위가 이 에디터의 DOM 내부에 있는지 반드시 확인
  // Python으로 치면: if selection_node not in self.editor.dom: return
  // -----------------------------------------------
  useEffect(() => {
    const handleSelectionChange = () => {
      setTimeout(() => {
        const selection = window.getSelection()

        if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
          if (menuRef.current?.matches(':hover')) return
          setVisible(false)
          setOpenPicker(null)  // 메뉴 닫힐 때 피커도 함께 닫음
          return
        }

        const range = selection.getRangeAt(0)

        // ─────────────────────────────────────────────
        // 선택 범위가 이 에디터 DOM 안에 있는지 확인
        // 다른 블록의 에디터를 선택했을 때 이 메뉴가 뜨지 않도록 막음
        // ─────────────────────────────────────────────
        const editorDom = editor.view.dom
        if (!editorDom.contains(range.commonAncestorContainer)) {
          if (!menuRef.current?.matches(':hover')) {
            setVisible(false)
            setOpenPicker(null)
          }
          return
        }

        const rect = range.getBoundingClientRect()
        if (rect.width === 0) return

        const { from, to } = editor.state.selection
        if (from !== to) {
          savedSelection.current = { from, to }
        }

        setPosition({
          top: rect.top + window.scrollY - 48,
          left: rect.left + window.scrollX + rect.width / 2,
        })
        setVisible(true)
        forceUpdate(n => n + 1)
      }, 10)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [editor])


  // -----------------------------------------------
  // 서식/색상 액션 실행 헬퍼
  // 1. 저장된 선택 범위 복원
  // 2. 액션 실행
  // 3. 강제 리렌더 (active 상태 반영)
  // -----------------------------------------------
  const handleAction = (action: (editor: TiptapEditor) => void) => {
    if (savedSelection.current) {
      editor.commands.setTextSelection(savedSelection.current)
    }
    action(editor)
    forceUpdate(n => n + 1)
  }


  if (!visible) return null

  // 현재 적용된 글자 색상 / 배경 색상 (버튼 인디케이터에 표시용)
  // Python으로 치면: current_text_color = editor.get_attr('textStyle').get('color')
  const currentTextColor: string | null = editor.getAttributes('textStyle').color ?? null
  const currentHighlightColor: string | null = editor.getAttributes('highlight').color ?? null


  return (
    // -----------------------------------------------
    // 메뉴 컨테이너
    // fixed: 스크롤과 무관하게 화면에 고정
    // -translate-x-1/2: 선택 텍스트 정중앙에 표시
    // flex flex-col: 툴바 행 + 피커 패널을 세로로 배치
    // -----------------------------------------------
    <div
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
      className="fixed z-50 -translate-x-1/2 bg-gray-900 rounded-lg shadow-xl"
    >

      {/* ── 메인 툴바 행 ────────────────────────── */}
      <div className="flex items-center gap-0.5 px-1 py-1">

        {/* 서식 버튼 (Bold / Italic / Strike / Code) */}
        {FORMAT_BUTTONS.map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleAction(btn.action)
            }}
            className={btn.isActive(editor)
              ? `px-2 py-2 rounded text-sm transition-colors bg-white text-gray-900 ${btn.className}`
              : `px-2 py-2 rounded text-sm transition-colors text-gray-300 hover:bg-gray-700 hover:text-white ${btn.className}`}
          >
            {btn.label}
          </button>
        ))}

        <Divider />

        {/* ── 글자 색상 버튼 ───────────────────── */}
        {/* 'A' 아래 밑줄 색상 = 현재 적용된 글자 색상 */}
        <button
          title="글자 색상"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // 토글 클릭 시 최신 selection 재캡처 (피커 열기 직전에 갱신)
            const { from, to } = editor.state.selection
            if (from !== to) savedSelection.current = { from, to }
            setOpenPicker(prev => prev === 'text' ? null : 'text')
          }}
          className={openPicker === 'text' ? 'px-2 py-2 rounded text-sm bg-gray-700 text-white' : 'px-2 py-2 rounded text-sm text-gray-300 hover:bg-gray-700 hover:text-white'}
        >
          <span style={{ borderBottom: `2px solid ${currentTextColor ?? '#9ca3af'}`, paddingBottom: '1px' }}>
            A
          </span>
        </button>

        {/* ── 배경 색상 버튼 ───────────────────── */}
        {/* '가' 글자 뒤 배경색 = 현재 적용된 형광펜 색상 */}
        <button
          title="배경 색상"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // 토글 클릭 시 최신 selection 재캡처
            const { from, to } = editor.state.selection
            if (from !== to) savedSelection.current = { from, to }
            setOpenPicker(prev => prev === 'highlight' ? null : 'highlight')
          }}
          className={openPicker === 'highlight' ? 'px-2 py-2 rounded text-sm bg-gray-700 text-white' : 'px-2 py-2 rounded text-sm text-gray-300 hover:bg-gray-700 hover:text-white'}
        >
          <span
            className="text-xs px-0.5 rounded-sm"
            style={{
              background: currentHighlightColor ?? 'transparent',
              color: currentHighlightColor ? '#1f2937' : 'currentColor',
            }}
          >
            가
          </span>
        </button>

        <Divider />

        {/* ── 링크 버튼 ────────────────────────── */}
        <button
          title="링크 삽입"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (savedSelection.current) {
              editor.commands.setTextSelection(savedSelection.current)
            }
            const url = window.prompt('링크 URL을 입력하세요')
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }}
          className={editor.isActive('link') ? 'px-2 py-2 rounded text-sm transition-colors bg-white text-gray-900' : 'px-2 py-2 rounded text-sm transition-colors text-gray-300 hover:bg-gray-700 hover:text-white'}
        >
          🔗
        </button>

        {/* 링크 제거 버튼 — 링크가 활성일 때만 표시 */}
        {editor.isActive('link') && (
          <button
            title="링크 제거"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleAction((editor) => editor.chain().focus().unsetLink().run())
            }}
            className="px-2 py-2 rounded text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        )}

      </div>

      {/* ── 색상 피커 패널 ──────────────────────── */}
      {/* openPicker가 설정된 경우에만 툴바 아래로 펼쳐짐 */}
      {/* Python으로 치면: if open_picker: render_color_panel() */}
      {openPicker && (
        <div className="px-2 pb-2 border-t border-gray-700">
          <p className="text-xs text-gray-400 mt-1.5 mb-1.5">
            {openPicker === 'text' ? '글자 색상' : '배경 색상'}
          </p>

          {/* 색상 스와치 그리드 */}
          <div className="flex gap-1 flex-wrap">
            {(openPicker === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS).map((color) => (
              <button
                key={color.value ?? 'default'}
                title={color.label}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()

                  // -----------------------------------------------
                  // e.preventDefault()로 에디터 포커스/셀렉션이 유지됨
                  // 셀렉션이 collapsed이면 savedSelection으로 복원 (fallback)
                  // Python으로 치면: sel = editor.sel or saved_sel
                  // -----------------------------------------------
                  const editorSel = editor.state.selection
                  const saved = savedSelection.current

                  if (editorSel.from === editorSel.to && saved && saved.from !== saved.to) {
                    editor.commands.setTextSelection(saved)
                  }

                  if (openPicker === 'text') {
                    if (color.value) editor.commands.setColor(color.value)
                    else editor.commands.unsetColor()
                  } else {
                    if (color.value) editor.commands.setHighlight({ color: color.value })
                    else editor.commands.unsetHighlight()
                  }

                  setOpenPicker(null)  // 색상 선택 후 피커 닫기
                  forceUpdate(n => n + 1)
                }}
                className="w-6 h-6 rounded hover:scale-110 transition-transform"
                style={{
                  // value가 null이면 "색상 없음"을 나타내는 대각선 스타일
                  background: color.value
                    ? color.value
                    : 'linear-gradient(135deg, #f9fafb 45%, #ef4444 45%, #ef4444 55%, #f9fafb 55%)',
                  border: '2px solid #4b5563',
                }}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
