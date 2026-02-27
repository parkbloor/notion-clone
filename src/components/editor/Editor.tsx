// =============================================
// src/components/editor/Editor.tsx
// 역할: Tiptap 에디터 + 슬래시 커맨드 메뉴 연결
// =============================================

'use client'

import { useEditor, EditorContent, Editor as TiptapEditor, ReactNodeViewRenderer } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
// ── 테이블 확장 ────────────────────────────────
// Python으로 치면: from tiptap import Table, TableRow, TableHeader, TableCell
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
// ── 코드 하이라이트 확장 ───────────────────────
// Python으로 치면: from tiptap import CodeBlockLowlight; from lowlight import common
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import CodeBlockView from './CodeBlockView'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Block, BlockType, Page } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import SlashCommand from './SlashCommand'
import BubbleMenuBar from './BubbleMenuBar'
import ImageBlock from './ImageBlock'
import TableToolbar from './TableToolbar'
import BlockMenu from './BlockMenu'
import ToggleBlock from './ToggleBlock'
import MentionPopup, { MentionItem } from './MentionPopup'
import KanbanBlock from './KanbanBlock'
import AdmonitionBlock from './AdmonitionBlock'
import CanvasBlock from './CanvasBlock'
import ExcalidrawBlock from './ExcalidrawBlock'
import VideoBlock from './VideoBlock'
import LayoutBlock from './LayoutBlock'

// ── dnd-kit 임포트 ────────────────────────────
// useSortable : 이 컴포넌트를 드래그 가능한 아이템으로 만드는 훅
// CSS         : transform 값을 CSS 문자열로 변환하는 유틸
// Python으로 치면: sortable_item 데코레이터 같은 역할
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface EditorProps {
  block: Block
  pageId: string
  isLast: boolean
}

// -----------------------------------------------
// lowlight 인스턴스 — common 번들 (~40개 주요 언어 포함)
// 모듈 레벨에서 한 번만 생성 (컴포넌트 렌더마다 재생성 방지)
// Python으로 치면: lowlight = create_lowlight(common_languages)
// -----------------------------------------------
const lowlight = createLowlight(common)

// -----------------------------------------------
// CustomCodeBlock: CodeBlockLowlight에 언어 선택 드롭다운 NodeView 추가
// Python으로 치면: CustomCodeBlock = CodeBlockLowlight.extend(node_view=CodeBlockView)
// -----------------------------------------------
const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: 'javascript' })

const blockTypeToLevel: Partial<Record<BlockType, 1 | 2 | 3>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
}

export default function Editor({ block, pageId, isLast }: EditorProps) {

  const { updateBlock, addBlock, deleteBlock, updateBlockType, pages, setCurrentPage } = usePageStore()

  // -----------------------------------------------
  // useSortable: 이 블록을 dnd-kit의 드래그 가능한 아이템으로 등록
  // id         : 각 블록의 고유 ID로 식별
  // setNodeRef : 드래그 대상 DOM 요소를 dnd-kit에 알려줌
  // listeners  : 드래그 핸들에만 붙이는 포인터 이벤트 핸들러
  // attributes : 접근성(aria) 속성
  // transform  : 드래그 중 위치 이동값 (CSS translate로 변환)
  // transition : 드롭 후 애니메이션
  // isDragging : 현재 이 블록이 드래그 중인지 여부
  // Python으로 치면: sortable_id, drag_ref, drag_events = useSortable(block.id)
  // -----------------------------------------------
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const [slashMenu, setSlashMenu] = useState({
    isOpen: false,
    position: { top: 0, left: 0 },
    searchQuery: '',
    from: 0,  // /query 시작 위치 — 외부 클릭 시 deleteRange에 사용
  })

  // ── @ 멘션 / [[ 페이지링크 상태 ─────────────
  // from    : 트리거 문자(@, [[) 위치 (deleteRange 시작점)
  // trigger : '@' 또는 '[[' — 삭제 범위 계산에 사용
  // Python으로 치면: self.mention_state = {'is_open': False, 'query': '', 'from': 0, 'trigger': '@', 'position': {...}}
  const [mentionMenu, setMentionMenu] = useState({
    isOpen: false,
    query: '',
    from: 0,
    trigger: '@' as '@' | '[[',
    position: { x: 0, y: 0 },
  })
  // stale closure 방지용 ref — useEditor 콜백 내에서 최신 상태를 읽기 위해 사용
  // Python으로 치면: self._mention_ref = self.mention_state
  const mentionMenuRef = useRef(mentionMenu)
  useEffect(() => { mentionMenuRef.current = mentionMenu }, [mentionMenu])

  const checkSlash = useCallback((editor: TiptapEditor) => {
    const { state } = editor
    const { from } = state.selection
    const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n')
    const slashMatch = textBefore.match(/\/(\w*)$/)

    if (slashMatch) {
      const coords = editor.view.coordsAtPos(from)
      const MENU_MAX_H = 380  // SlashCommand 최대 높이 (헤더+목록)
      const MENU_W = 288      // w-72

      // Y: 화면 절반 기준 — 위쪽이면 아래로, 아래쪽이면 위로 표시
      // Python으로 치면: top = bottom+8 if cursor_y < vh/2 else cursor_y - MENU_MAX_H
      const top = coords.top < window.innerHeight / 2
        ? coords.bottom + 8
        : Math.max(8, coords.top - MENU_MAX_H)

      // X: 오른쪽 잘림 방지
      // Python으로 치면: left = clamp(coords.left, 8, vw - MENU_W - 8)
      const left = Math.max(8, Math.min(coords.left, window.innerWidth - MENU_W - 8))

      setSlashMenu({
        isOpen: true,
        position: { top, left },
        searchQuery: slashMatch[1],
        from: from - slashMatch[0].length,  // /query 시작 위치 저장
      })
    } else {
      setSlashMenu(prev => ({ ...prev, isOpen: false }))
    }
  }, [])

  // -----------------------------------------------
  // @ 멘션 / [[ 페이지링크 감지 함수
  // cursor 앞 텍스트에서 @단어 또는 [[단어 패턴을 찾아 팝업 열기
  //
  // @ 트리거:  "@페이지이름"   → trigger='@',  from=@ 위치
  // [[ 트리거: "[[페이지이름"  → trigger='[[', from=[[ 위치
  //
  // Python으로 치면:
  //   def check_mention(editor):
  //       if re.search(r'@[\w가-힣]*$', text_before): open_popup(trigger='@')
  //       elif re.search(r'\[\[[\w가-힣\s]*$', text_before): open_popup(trigger='[[')
  // -----------------------------------------------
  const checkMention = useCallback((editor: TiptapEditor) => {
    const { state } = editor
    const { from } = state.selection
    const textBefore = state.doc.textBetween(Math.max(0, from - 40), from, '\n')

    // @ 트리거: @한글/영문/숫자 (슬래시 메뉴와 충돌하지 않게 / 앞 @ 제외)
    const atMatch = textBefore.match(/@([\w가-힣]*)$/)
    // [[ 트리거: [[한글/영문/숫자/공백
    const bracketMatch = textBefore.match(/\[\[([\w가-힣\s]*)$/)

    if (atMatch) {
      const query = atMatch[1]
      const atPos = from - query.length - 1  // @ 문자 위치
      const coords = editor.view.coordsAtPos(from)
      setMentionMenu({
        isOpen: true,
        query,
        from: atPos,
        trigger: '@',
        position: { x: coords.left, y: coords.bottom },
      })
    } else if (bracketMatch) {
      const query = bracketMatch[1]
      const bracketPos = from - query.length - 2  // [[ 시작 위치 (2글자)
      const coords = editor.view.coordsAtPos(from)
      setMentionMenu({
        isOpen: true,
        query,
        from: bracketPos,
        trigger: '[[',
        position: { x: coords.left, y: coords.bottom },
      })
    } else {
      setMentionMenu(prev => ({ ...prev, isOpen: false }))
    }
  }, [])

  const editor = useEditor({
    extensions: [
      // link: { openOnClick: false } → StarterKit 내장 Link를 설정
      // (별도 import 없이 StarterKit.configure로 제어)
      // codeBlock: false → StarterKit 내장 코드 블록 비활성화
      // CustomCodeBlock이 대체하므로 중복 등록 방지
      StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return '제목을 입력하세요'
          return "'/' 입력으로 명령어 사용"
        },
      }),
      Typography,
      // multicolor: true → 형광펜에 여러 색상 적용 가능 (기본은 노란색만)
      // Python으로 치면: highlight = Highlight(multicolor=True)
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      // ── 테이블 확장 등록 ─────────────────────────
      // Python으로 치면: extensions = [..., Table(), TableRow(), ...]
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // 언어별 문법 하이라이팅 + 언어 선택 드롭다운 포함
      // Python으로 치면: extensions.append(CustomCodeBlock)
      CustomCodeBlock,
    ],
    // 이미지·토글·칸반·Excalidraw·비디오 블록은 Tiptap이 직접 렌더링하지 않으므로 빈 문자열로 초기화
    // JSON content를 HTML로 파싱하는 오류 방지
    // Python으로 치면: content = '' if type in ('image', 'toggle', 'excalidraw', 'video') else block.content
    // 이미지·토글·레이아웃 등 비-Tiptap 블록은 Tiptap content를 빈 문자열로 초기화
    // Python으로 치면: content = '' if type in ('image', 'toggle', 'layout', ...) else block.content
    content: (block.type === 'image' || block.type === 'toggle' || block.type === 'kanban' || block.type === 'excalidraw' || block.type === 'video' || block.type === 'layout') ? '' : (block.content || ''),
    // setTimeout 0: ReactNodeViewRenderer가 flushSync를 렌더 사이클 중에 호출하는 것을 방지
    // onCreate를 현재 렌더 패스가 끝난 다음 마이크로태스크로 지연
    // Python으로 치면: asyncio.get_event_loop().call_soon(apply_block_type)
    onCreate: ({ editor }) => { setTimeout(() => applyBlockType(editor, block.type), 0) },
    onUpdate: ({ editor }) => {
      updateBlock(pageId, block.id, editor.getHTML())
      checkSlash(editor)
      checkMention(editor)
    },
    onSelectionUpdate: ({ editor }) => {
      checkSlash(editor)
      checkMention(editor)
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // 슬래시 메뉴가 열려있으면 방향키/Enter/Escape를 메뉴에 넘기고 에디터 동작 차단
        if (slashMenu.isOpen && ['Enter', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) {
          event.preventDefault()
          return true
        }
        // 멘션 팝업이 열려있으면 방향키/Enter/Escape를 팝업에 넘기고 에디터 동작 차단
        // MentionPopup이 capture 단계로 먼저 처리하므로 여기선 에디터만 차단
        // Python으로 치면: if mention_open and key in NAV_KEYS: return True
        if (mentionMenuRef.current.isOpen && ['Enter', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) {
          return true
        }

        // ── Tab / Shift+Tab: 들여쓰기 · 내어쓰기 ──────────────────────
        // Python으로 치면: if event.key == 'Tab': handle_indent(event.shiftKey)
        if (event.key === 'Tab') {
          const { $head } = view.state.selection
          const parentName = $head.node(-1)?.type.name

          // 테이블 셀/헤더 안에서는 Tiptap 기본 Tab 동작 유지 (다음/이전 셀 이동)
          // Python으로 치면: if in_table_cell: return False  # let Tiptap handle
          if (parentName === 'tableCell' || parentName === 'tableHeader') return false

          event.preventDefault()

          // 코드 블록 안: 스페이스 2개 삽입 (탭 들여쓰기 효과)
          // Shift+Tab이어도 코드 블록에서는 동일하게 스페이스 삽입
          // Python으로 치면: if in_code_block: insert('  ')
          if (editor && editor.isActive('codeBlock')) {
            editor.chain().focus().insertContent('  ').run()
            return true
          }

          if (event.shiftKey) {
            // Shift+Tab: 일반·번호 목록 내어쓰기 (한 단계 위로)
            // Python으로 치면: if in_list: lift_list_item()
            if (editor && (editor.isActive('bulletList') || editor.isActive('orderedList'))) {
              editor.chain().focus().liftListItem('listItem').run()
              return true
            }
            // Shift+Tab: 체크박스 목록 내어쓰기
            if (editor && editor.isActive('taskList')) {
              editor.chain().focus().liftListItem('taskItem').run()
              return true
            }
          } else {
            // Tab: 일반·번호 목록 들여쓰기 (한 단계 아래로)
            // Python으로 치면: if in_list: sink_list_item()
            if (editor && (editor.isActive('bulletList') || editor.isActive('orderedList'))) {
              editor.chain().focus().sinkListItem('listItem').run()
              return true
            }
            // Tab: 체크박스 목록 들여쓰기
            if (editor && editor.isActive('taskList')) {
              editor.chain().focus().sinkListItem('taskItem').run()
              return true
            }
          }

          // 그 외 (paragraph 등): Tab 기본 동작(포커스 이동) 방지만
          return true
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          // 테이블 셀/헤더 안에서는 Tiptap 기본 동작 유지 (셀 내 줄바꿈)
          // 새 블록을 추가하면 테이블이 두 블록으로 쪼개지기 때문
          // Python으로 치면: if parent in ('tableCell', 'tableHeader'): return False
          const { $head } = view.state.selection
          const parentName = $head.node(-1)?.type.name
          if (parentName === 'tableCell' || parentName === 'tableHeader') return false
          event.preventDefault()
          addBlock(pageId, block.id)
          return true
        }
        if (event.key === 'Backspace') {
          const isEmpty = view.state.doc.textContent.length === 0
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

  useEffect(() => {
    if (!editor) return
    applyBlockType(editor, block.type)
  }, [block.type, editor])

  function handleSlashSelect(type: BlockType) {
    if (!editor) return
    const { state } = editor
    const { from } = state.selection
    const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n')
    const slashMatch = textBefore.match(/\/(\w*)$/)
    if (slashMatch) {
      editor.chain().deleteRange({ from: from - slashMatch[0].length, to: from }).run()
    }
    updateBlockType(pageId, block.id, type)
    // 이미지 타입으로 전환 시 기존 텍스트 내용 초기화
    // 그래야 ImageBlock이 업로드 UI를 표시함
    // Python으로 치면: if type == 'image': block.content = ''
    if (type === 'image') {
      updateBlock(pageId, block.id, '')
    }
    // 토글 타입으로 전환 시 content를 JSON 포맷으로 초기화
    // Python으로 치면: if type == 'toggle': block.content = json.dumps({...})
    if (type === 'toggle') {
      updateBlock(pageId, block.id, JSON.stringify({ header: '', body: '' }))
    }
    // 칸반 타입으로 전환 시 기본 3열 JSON으로 초기화
    // Python으로 치면: if type == 'kanban': block.content = json.dumps({'columns': [...]})
    if (type === 'kanban') {
      updateBlock(pageId, block.id, JSON.stringify({
        columns: [
          { id: crypto.randomUUID(), title: '할 일',  color: '#f1f5f9', cards: [] },
          { id: crypto.randomUUID(), title: '진행 중', color: '#dbeafe', cards: [] },
          { id: crypto.randomUUID(), title: '완료',   color: '#dcfce7', cards: [] },
        ],
      }))
    }
    // 콜아웃 타입으로 전환 시 기본 팁 JSON으로 초기화
    // Python으로 치면: if type == 'admonition': block.content = json.dumps({'variant':'tip','text':''})
    if (type === 'admonition') {
      updateBlock(pageId, block.id, JSON.stringify({ variant: 'tip', text: '' }))
    }
    // 캔버스 타입으로 전환 시 빈 노드/엣지 배열로 초기화
    // Python으로 치면: if type == 'canvas': block.content = json.dumps({'nodes':[],'edges':[]})
    if (type === 'canvas') {
      updateBlock(pageId, block.id, JSON.stringify({ nodes: [], edges: [] }))
    }
    // Excalidraw 타입으로 전환 시 빈 elements/appState JSON으로 초기화
    // Python으로 치면: if type == 'excalidraw': block.content = json.dumps({'elements':[],'appState':{...}})
    if (type === 'excalidraw') {
      updateBlock(pageId, block.id, JSON.stringify({
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
      }))
    }
    // 레이아웃 타입으로 전환 시 빈 content로 초기화 → LayoutBlock 피커 표시
    // Python으로 치면: if type == 'layout': block.content = ''
    if (type === 'layout') {
      updateBlock(pageId, block.id, '')
    }
    setSlashMenu(prev => ({ ...prev, isOpen: false }))
    editor.commands.focus()
  }

  // -----------------------------------------------
  // @ 멘션 / [[ 페이지링크 선택 처리
  // 선택된 항목 종류에 따라 페이지 링크 또는 블록 링크를 삽입
  //
  // kind='page'  → href="#page-{pageId}" 형식
  // kind='block' → href="#block-{pageId}:{blockId}" 형식 (: 구분자)
  //
  // Python으로 치면:
  //   def handle_mention_select(item):
  //       delete_trigger_text()
  //       if item.kind == 'page': insert_page_link(item.page)
  //       else: insert_block_link(item.page, item.block)
  // -----------------------------------------------
  function handleMentionSelect(item: MentionItem) {
    if (!editor) return
    const cursorPos = editor.state.selection.from
    // 트리거(@query 또는 [[query) 범위 삭제
    const chain = editor.chain().focus().deleteRange({ from: mentionMenu.from, to: cursorPos })

    if (item.kind === 'page') {
      // ── 페이지 링크 삽입 ──
      // Python으로 치면: insert_text(f'{icon} {title}', href=f'#page-{id}')
      chain.insertContent({
        type: 'text',
        text: `${item.page.icon} ${item.page.title || '제목 없음'}`,
        marks: [{ type: 'link', attrs: { href: `#page-${item.page.id}` } }],
      }).run()
    } else {
      // ── 블록 링크 삽입 ──
      // href = "#block-{pageId}:{blockId}" (콜론으로 구분 — UUID의 하이픈과 혼동 방지)
      // 표시 텍스트: "페이지아이콘 페이지제목 › 블록내용 앞부분"
      // Python으로 치면: insert_text(f'{icon} {title} › {snippet}', href=f'#block-{pid}:{bid}')
      const snippet = item.plainText.slice(0, 30) + (item.plainText.length > 30 ? '…' : '')
      chain.insertContent({
        type: 'text',
        text: `${item.page.icon} ${item.page.title || '제목 없음'} › ${snippet || '(내용 없음)'}`,
        marks: [{ type: 'link', attrs: { href: `#block-${item.page.id}:${item.block.id}` } }],
      }).run()
    }
    setMentionMenu(prev => ({ ...prev, isOpen: false }))
  }

  function applyBlockType(editor: TiptapEditor, type: BlockType) {
    if (!editor) return
    // 이미지·토글·레이아웃 등 비-Tiptap 블록은 조기 반환
    // Python으로 치면: if type in ('image', 'toggle', 'layout', ...): return
    if (type === 'image' || type === 'toggle' || type === 'kanban' || type === 'admonition' || type === 'canvas' || type === 'excalidraw' || type === 'layout') return
    const level = blockTypeToLevel[type]
    if (level) {
      editor.chain().focus().setHeading({ level }).run()
    } else if (type === 'bulletList') {
      editor.chain().focus().toggleBulletList().run()
    } else if (type === 'orderedList') {
      editor.chain().focus().toggleOrderedList().run()
    } else if (type === 'taskList') {
      editor.chain().focus().toggleTaskList().run()
    } else if (type === 'code') {
      // toggleCodeBlock 대신 setCodeBlock 사용 — 이미 코드 블록이면 유지, 아니면 전환
      // Python으로 치면: editor.set_code_block(language='javascript')
      editor.chain().focus().setCodeBlock({ language: 'javascript' }).run()
    } else if (type === 'table') {
      // 에디터가 비어있을 때만 기본 3×3 테이블 삽입
      // 저장된 테이블 HTML이 있으면 content 로딩으로 이미 복원됨
      // Python으로 치면: if not editor.get_text(): editor.insert_table(3, 3)
      if (!editor.getText().trim()) {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      }
    } else {
      editor.chain().focus().setParagraph().run()
    }
  }

  // -----------------------------------------------
  // 이미지 블록은 Tiptap EditorContent 대신 ImageBlock 컴포넌트로 렌더링
  // 모든 훅(useSortable, useState, useCallback, useEditor, useEffect) 호출 후 분기
  // Python으로 치면: if block.type == 'image': return render_image_block()
  // -----------------------------------------------
  if (block.type === 'image') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        {/* + 블록 메뉴 버튼 */}
        <BlockMenu pageId={pageId} blockId={block.id} />
        {/* 드래그 핸들 — 이미지 블록도 동일하게 제공 */}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <ImageBlock block={block} pageId={pageId} />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // 토글 블록: ToggleBlock 컴포넌트로 렌더링
  // 드래그 핸들은 이미지 블록과 동일하게 제공
  // Python으로 치면: if block.type == 'toggle': return render(ToggleBlock)
  // -----------------------------------------------
  if (block.type === 'toggle') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <ToggleBlock block={block} pageId={pageId} isLast={isLast} />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // 칸반 블록: KanbanBlock 컴포넌트로 렌더링
  // content는 JSON 문자열로 열/카드 데이터 보관
  // Python으로 치면: if block.type == 'kanban': return render(KanbanBlock)
  // -----------------------------------------------
  if (block.type === 'kanban') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <KanbanBlock
            blockId={block.id}
            pageId={pageId}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // 콜아웃 블록: AdmonitionBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { variant: 'tip'|'info'|'warning'|'danger', text: string }
  // Python으로 치면: if block.type == 'admonition': return render(AdmonitionBlock)
  // -----------------------------------------------
  if (block.type === 'admonition') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <AdmonitionBlock
            blockId={block.id}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // 캔버스 블록: CanvasBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { nodes: CanvasNode[], edges: CanvasEdge[] }
  // Python으로 치면: if block.type == 'canvas': return render(CanvasBlock)
  // -----------------------------------------------
  if (block.type === 'canvas') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <CanvasBlock
            blockId={block.id}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // Excalidraw 블록: ExcalidrawBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { elements: [...], appState: { viewBackgroundColor: string } }
  // Python으로 치면: if block.type == 'excalidraw': return render(ExcalidrawBlock)
  // -----------------------------------------------
  if (block.type === 'excalidraw') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <ExcalidrawBlock
            blockId={block.id}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // 비디오 블록: VideoBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { src: "http://localhost:8000/static/.../videos/uuid.mp4" }
  // Python으로 치면: if block.type == 'video': return render(VideoBlock)
  // -----------------------------------------------
  if (block.type === 'video') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <VideoBlock block={block} pageId={pageId} />
        </div>
      </div>
    )
  }

  // -----------------------------------------------
  // 레이아웃 블록: LayoutBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { template, orientation, slots: { a, b, c? } }
  // 각 슬롯에는 Block[] 이 담겨 있으며 A4 비율 그리드로 표시됨
  // Python으로 치면: if block.type == 'layout': return render(LayoutBlock)
  // -----------------------------------------------
  if (block.type === 'layout') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="group relative flex items-start px-2 py-0.5"
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title="드래그하여 블록 이동"
        >
          ⠿
        </div>
        <div className="flex-1">
          <LayoutBlock
            blockId={block.id}
            content={block.content}
            onChange={newContent => updateBlock(pageId, block.id, newContent)}
          />
        </div>
      </div>
    )
  }

  return (
    // -----------------------------------------------
    // id          : #block- 링크에서 scrollIntoView() 앵커로 사용
    // setNodeRef  : dnd-kit이 이 DOM 요소를 드래그 아이템으로 추적
    // style       : 드래그 중 transform(위치 이동) + transition(애니메이션) 적용
    // opacity     : 드래그 중인 원본 블록을 반투명하게 표시
    // -----------------------------------------------
    <div
      id={block.id}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group relative flex items-start px-2 py-0.5"
    >
      {/* ── + 블록 메뉴 버튼 ─────────────────────── */}
      {/* BlockMenu: hover 시 + 버튼 표시 → 클릭하면 위/아래 추가·복제·삭제 메뉴 */}
      <BlockMenu pageId={pageId} blockId={block.id} />

      {/* ── 드래그 핸들 ─────────────────────────── */}
      {/* listeners : 이 요소에서만 드래그가 시작되게 함 (에디터 내 클릭과 충돌 방지) */}
      {/* group-hover:opacity-100 : 블록에 마우스 올릴 때만 보임 (노션과 동일한 UX) */}
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
        title="드래그하여 블록 이동"
      >
        ⠿
      </div>

      {/* Bubble Menu — editor가 준비됐을 때만 렌더링 */}
      {editor ? <BubbleMenuBar editor={editor} /> : null}

      {/* 테이블 블록: 커서가 테이블 안에 있을 때 툴바 표시 */}
      {/* Python으로 치면: if editor.is_active('table'): render(TableToolbar) */}
      {/* 내부 링크 클릭 처리 */}
      {/* #page-{id}  → 해당 페이지로 이동 */}
      {/* #block-{pageId}:{blockId} → 해당 페이지로 이동 후 블록으로 스크롤 */}
      {/* Python으로 치면: if link.startswith('#page-'): go(link[6:]); elif '#block-': go_and_scroll(link) */}
      <div
        className="flex-1"
        onClick={(e) => {
          const link = (e.target as HTMLElement).closest('a')
          if (link) {
            const href = link.getAttribute('href') ?? ''
            if (href.startsWith('#page-')) {
              e.preventDefault()
              setCurrentPage(href.slice(6))
            } else if (href.startsWith('#block-')) {
              e.preventDefault()
              // format: #block-{pageId}:{blockId}  콜론이 구분자
              // Python으로 치면: page_id, block_id = href[7:].split(':', 1)
              const rest = href.slice(7)
              const colonIdx = rest.indexOf(':')
              if (colonIdx !== -1) {
                const targetPageId = rest.slice(0, colonIdx)
                const targetBlockId = rest.slice(colonIdx + 1)
                setCurrentPage(targetPageId)
                // 페이지 전환 후 렌더링이 완료되면 블록으로 스크롤
                // Python으로 치면: await asyncio.sleep(0.15); element.scroll_into_view()
                setTimeout(() => {
                  document.getElementById(targetBlockId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }, 150)
              }
            }
          }
        }}
      >
        {editor && editor.isActive('table') && (
          <TableToolbar editor={editor} pageId={pageId} blockId={block.id} />
        )}
        <EditorContent editor={editor} className="outline-none" />
      </div>
      {editor && (
        <SlashCommand
          editor={editor}
          isOpen={slashMenu.isOpen}
          position={slashMenu.position}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu(prev => ({ ...prev, isOpen: false }))}
          onClickOutside={() => {
            // 외부 클릭: /query 텍스트 삭제 후 팝업 닫기
            // 삭제하지 않으면 checkSlash가 즉시 팝업을 다시 열어버림
            // Python으로 치면: editor.delete_range(from=slash_from, to=cursor); popup.close()
            const cursorPos = editor.state.selection.from
            editor.chain().deleteRange({ from: slashMenu.from, to: cursorPos }).run()
            setSlashMenu(prev => ({ ...prev, isOpen: false }))
          }}
          searchQuery={slashMenu.searchQuery}
        />
      )}
      {/* @ 멘션 / [[ 페이지링크 팝업 */}
      {editor && mentionMenu.isOpen && (
        <MentionPopup
          query={mentionMenu.query}
          pages={pages}
          position={mentionMenu.position}
          onSelect={handleMentionSelect}
          onClose={() => setMentionMenu(prev => ({ ...prev, isOpen: false }))}
          onClickOutside={() => {
            // 외부 클릭: @query / [[query 텍스트 삭제 후 팝업 닫기
            // 삭제하지 않으면 checkMention이 즉시 팝업을 다시 열어버림
            // Python으로 치면: editor.delete_range(from=mention_from, to=cursor); popup.close()
            const cursorPos = editor.state.selection.from
            editor.chain().deleteRange({ from: mentionMenu.from, to: cursorPos }).run()
            setMentionMenu(prev => ({ ...prev, isOpen: false }))
          }}
          trigger={mentionMenu.trigger}
        />
      )}
    </div>
  )
}