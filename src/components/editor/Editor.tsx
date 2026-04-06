// =============================================
// src/components/editor/Editor.tsx
// 역할: Tiptap 에디터 + 슬래시 커맨드 메뉴 연결
// =============================================

'use client'

import { useEditor, EditorContent, Editor as TiptapEditor } from '@tiptap/react'
import { buildEditorExtensions } from '@/extensions/editorExtensions'

// ── 모듈 레벨 전역: 가장 최근에 포커스된 에디터 + 커서 위치 ──
// 페이지에 여러 Editor 인스턴스가 마운트되므로 모듈 변수로 공유
// ai-insert-text 이벤트는 이 에디터만 처리 (엉뚱한 블록 삽입 방지)
// Python으로 치면: 모든 Editor 인스턴스가 공유하는 class variable
const _aiInsertTarget: { editor: TiptapEditor | null; pos: number } = {
  editor: null,
  pos: 0,
}
import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditorMention } from '@/hooks/useEditorMention'
import { useEditorLatex } from '@/hooks/useEditorLatex'
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
import MathBlock from './MathBlock'
import EmbedBlock, { isEmbedUrl } from './EmbedBlock'
import MermaidBlock from './MermaidBlock'
import ChartBlock from './ChartBlock'
import GanttBlock from './GanttBlock'
import DayPlannerBlock from './DayPlannerBlock'
import WeekPlannerBlock from './WeekPlannerBlock'
import WeeklyPlannerBlock from './WeeklyPlannerBlock'
import RoutineMatrixBlock from './RoutineMatrixBlock'
import MonthlyCalendarBlock from './MonthlyCalendarBlock'
import QuarterlyPlannerBlock from './QuarterlyPlannerBlock'
import YearlyPlannerBlock from './YearlyPlannerBlock'
import MindmapBlock from './MindmapBlock'
import TocBlock from './TocBlock'
import FileBlock from './FileBlock'
import ContextMenu from './ContextMenu'
import type { ContextMenuSection } from './ContextMenu'
import { ChevronRight, ChevronDown, Plus, Check } from 'lucide-react'
// searchHighlightKey: 검색어 변경 시 Transaction 메타 키로 전달 (find-replace 기능에서 사용)
// Python으로 치면: from extensions import searchHighlightKey
import { searchHighlightKey } from '@/extensions/SearchHighlight'
import { useFindReplaceStore } from '@/store/findReplaceStore'
import { useLocale } from '@/locales'

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
  // 섹션 접기/펼치기 — heading 블록에서만 사용
  // Python으로 치면: self.is_section_collapsed = False
  isSectionCollapsed?: boolean
  hasSectionChildren?: boolean
  onToggleSectionCollapse?: () => void
  // 읽기 모드 — true이면 Tiptap 에디터 편집 불가
  // Python으로 치면: self.read_mode = False
  readMode?: boolean
  // 블록 일괄 선택 — true이면 파란 하이라이트
  // Python으로 치면: self.is_selected = False
  isSelected?: boolean
  // 선택 핸들 클릭 콜백 (MouseEvent 전달 → Shift 키 범위 선택 판단)
  // Python으로 치면: def on_select(event): ...
  onSelect?: (e: React.MouseEvent) => void
}

const blockTypeToLevel: Partial<Record<BlockType, 1 | 2 | 3 | 4 | 5 | 6>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 5,
  heading6: 6,
}

export default function Editor({ block, pageId, isLast, isSectionCollapsed, hasSectionChildren, onToggleSectionCollapse, readMode, isSelected, onSelect }: EditorProps) {

  const t = useLocale()

  const { updateBlock, addBlock, addBlockBefore, duplicateBlock, deleteBlock, updateBlockType, updateBlockBackground, pages, setCurrentPage } = usePageStore()

  // ── 일괄 선택 UI 공통 변수 ─────────────────────
  // 블록 래퍼 클래스 — 선택 시 파란 하이라이트, 아닐 때 기본 hover 스타일
  // Python으로 치면: wrapper_class = 'selected' if is_selected else 'default'
  const blockWrapperClass = "block-item group relative flex items-start px-2 py-0.5 rounded-xl transition-all"
    + (isSelected
      ? " bg-blue-100/60 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-300 dark:ring-blue-600"
      : " hover:bg-[#fcf9f8] dark:hover:bg-[#191919] hover:shadow-[0_1px_8px_rgba(0,0,0,0.06)]")

  // 선택 체크박스 — 드래그 핸들 왼쪽에 표시
  // hover 시 또는 선택 시 나타남, 클릭하면 onSelect 호출
  // Python으로 치면: selection_checkbox = CheckBox(visible=is_selected or hovered)
  const selectionCheckbox = (
    <div
      onClick={onSelect}
      className={"w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 mt-1.5 mr-0.5 transition-all select-none "
        + (isSelected
          ? "border-blue-500 bg-blue-500 opacity-100"
          : "border-gray-300 bg-white opacity-0 group-hover:opacity-60 hover:opacity-100!")}
      title="블록 선택 (Shift+클릭: 범위 선택)"
    >
      {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
    </div>
  )

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

  // @ 멘션 / [[ 페이지링크 상태 + 감지 함수 (useEditorMention.ts)
  // Python으로 치면: mention_state, check_mention = use_mention_state()
  const { mentionMenu, mentionMenuRef, checkMention, setMentionMenu } = useEditorMention()

  // 우클릭 컨텍스트 메뉴 위치 상태
  // null = 닫힘, { x, y } = 해당 viewport 좌표에 메뉴 표시
  // Python으로 치면: self.ctx_menu_pos: tuple | None = None
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // LaTeX 붙여넣기 감지 상태 (useEditorLatex.ts)
  // Python으로 치면: latex_candidate, set_latex = use_latex_state()
  const { latexCandidate, setLatexCandidate } = useEditorLatex()

  // 테이블 툴바 활성 상태 — 클릭으로 커서가 테이블 안에 들어올 때만 true
  // editor.isActive('table') 직접 사용 시 리렌더링 타이밍 문제가 있어
  // selectionUpdate 이벤트로 명시적으로 구독함
  // Python으로 치면: self.table_active: bool = False
  const [tableActive, setTableActive] = useState(false)

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

  const editor = useEditor({
    // buildEditorExtensions: Tiptap 확장 배열 조립 (src/extensions/editorExtensions.ts)
    // Python으로 치면: extensions = build_extensions(heading_placeholder)
    extensions: buildEditorExtensions(t.editor.headingPlaceholder),
    // 비-Tiptap 블록(이미지/비디오/캔버스/차트 등)은 Tiptap content를 빈 문자열로 초기화
    // JSON content가 Tiptap에 HTML로 파싱되는 오류 방지
    // Python으로 치면: content = '' if type in NON_TIPTAP_TYPES else block.content
    content: (block.type === 'image' || block.type === 'video' || block.type === 'embed' ||
      block.type === 'toggle' || block.type === 'kanban' || block.type === 'admonition' ||
      block.type === 'canvas' || block.type === 'excalidraw' || block.type === 'layout' ||
      block.type === 'math' || block.type === 'mermaid' || block.type === 'file' ||
      block.type === 'chart' || block.type === 'gantt' || block.type === 'mindmap') ? '' : (block.content || ''),
    // setTimeout 0: ReactNodeViewRenderer가 flushSync를 렌더 사이클 중에 호출하는 것을 방지
    // onCreate를 현재 렌더 패스가 끝난 다음 마이크로태스크로 지연
    // Python으로 치면: asyncio.get_event_loop().call_soon(apply_block_type)
    onCreate: ({ editor }) => { setTimeout(() => applyBlockType(editor, block.type), 0) },
    onUpdate: ({ editor }) => {
      // 비-Tiptap 블록(이미지·비디오·캔버스 등)은 content를 직접 JSON으로 관리하므로
      // Tiptap onUpdate를 무시 — 마운트/언마운트 시 <p></p>로 덮어쓰기 방지
      // Python으로 치면: if type in NON_TIPTAP_TYPES: return
      if (block.type === 'image' || block.type === 'video' || block.type === 'embed' ||
          block.type === 'toggle' || block.type === 'kanban' || block.type === 'admonition' ||
          block.type === 'canvas' || block.type === 'excalidraw' || block.type === 'layout' ||
          block.type === 'math' || block.type === 'mermaid' || block.type === 'file' ||
          block.type === 'chart' || block.type === 'gantt' || block.type === 'mindmap') return
      // --- 입력으로 Tiptap이 <hr>을 삽입하면 블록 타입을 'divider'로 자동 동기화
      // Python으로 치면: if editor.doc starts with hr node: update_block_type('divider')
      if (block.type !== 'divider' && editor.state.doc.firstChild?.type.name === 'horizontalRule') {
        updateBlockType(pageId, block.id, 'divider')
      }
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

              // ── 중첩 리스트 감지 ──────────────────────────────────────────
              // 커서 위치에서 위로 올라가며 listItem → list → 조부모 listItem 찾기
              // 조부모 listItem이 있으면 = 중첩 리스트 (orderedList inside bulletList 등)
              // Python으로 치면: grandparent_li = find_ancestor(cursor, 'listItem', skip=2)
              const { $from } = editor.state.selection
              const schema = editor.schema
              let listItemDepth = -1   // 현재 listItem depth
              let listDepth = -1       // 현재 listItem을 감싼 list depth
              let grandListItemDepth = -1  // 조부모 listItem depth

              for (let d = $from.depth; d >= 1; d--) {
                const n = $from.node(d)
                if (n.type === schema.nodes.listItem) {
                  if (listItemDepth === -1) {
                    listItemDepth = d
                  } else if (listDepth !== -1 && grandListItemDepth === -1) {
                    grandListItemDepth = d
                    break
                  }
                } else if (
                  (n.type === schema.nodes.bulletList || n.type === schema.nodes.orderedList) &&
                  listItemDepth !== -1 && listDepth === -1
                ) {
                  listDepth = d
                }
              }

              // ── 중첩 케이스: 커스텀 트랜잭션 ────────────────────────────
              // 표준 liftListItem은 중첩 시 depth 계산 오류로 전체가 풀려버림
              // 직접 tr로: 현재 항목 삭제 → 조부모 listItem 바로 뒤에 새 listItem 삽입
              // Python으로 치면: manual_lift(item, target_depth=grandparent_li_depth)
              if (grandListItemDepth !== -1) {
                editor.chain().focus().command(({ state, dispatch }) => {
                  if (!dispatch) return true
                  const { $from: $f } = state.selection
                  const tr = state.tr

                  // 현재 listItem 범위
                  const itemStart = $f.before(listItemDepth)
                  const itemEnd   = $f.after(listItemDepth)
                  const currentItem = state.doc.nodeAt(itemStart)
                  if (!currentItem) return false

                  // 부모 list 범위 (항목이 하나뿐일 때 list 자체를 삭제하기 위해)
                  const parentList  = $f.node(listDepth)
                  const listStart   = $f.before(listDepth)
                  const listEnd     = $f.after(listDepth)

                  // 조부모 listItem 끝 위치 = 새 listItem이 들어갈 위치
                  const grandItemEnd = $f.after(grandListItemDepth)

                  // 새로 삽입할 listItem — 기존 내용 그대로 유지
                  // Python으로 치면: new_item = ListItem(content=current_item.content)
                  const newItem = state.schema.nodes.listItem.create(
                    null,
                    currentItem.content
                  )

                  if (parentList.childCount === 1) {
                    // 부모 list에 항목이 하나뿐 → list 자체를 삭제
                    tr.delete(listStart, listEnd)
                    // 삭제 후 grandItemEnd 위치가 앞당겨지므로 보정
                    const insertPos = grandItemEnd - (listEnd - listStart)
                    tr.insert(insertPos, newItem)
                  } else {
                    // 현재 항목만 삭제 → 나머지 항목들은 자동으로 재번호 매김
                    tr.delete(itemStart, itemEnd)
                    // 삭제 후 grandItemEnd 보정
                    const insertPos = grandItemEnd - (itemEnd - itemStart)
                    tr.insert(insertPos, newItem)
                  }

                  dispatch(tr.scrollIntoView())
                  return true
                }).run()
                return true
              }

              // ── 최상위 리스트: 기존 동작 유지 ────────────────────────────
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

        // ── Shift+Enter: 리스트 안 → 새 list item, 그 외 → <br> 줄바꿈 ──────
        // 리스트에서 Shift+Enter를 누르면 같은 블록 안에 새 항목 추가
        // paragraph 등에서는 Tiptap 기본 HardBreak(<br>) 동작 유지
        // Python으로 치면: if shift+enter and in_list: split_list_item() else: hard_break()
        if (event.key === 'Enter' && event.shiftKey) {
          if (editor && (editor.isActive('bulletList') || editor.isActive('orderedList'))) {
            // 글머리·번호 목록: listItem 분리 → 새 항목
            event.preventDefault()
            editor.chain().focus().splitListItem('listItem').run()
            return true
          }
          if (editor && editor.isActive('taskList')) {
            // 체크박스 목록: taskItem 분리 → 새 항목
            event.preventDefault()
            editor.chain().focus().splitListItem('taskItem').run()
            return true
          }
          // 리스트 외 (paragraph 등): Tiptap HardBreak(<br>) 기본 동작 위임
          return false
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
      // ── URL / LaTeX 붙여넣기 처리 ──────────────────────────────
      // 우선순위: (1) embed URL → 자동 변환, (2) LaTeX 블록 수식 감지 → 사용자 확인
      // Python으로 치면: def handle_paste(view, event): ...
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        const trimmed = text.trim()
        const isEmpty = _view.state.doc.textContent.length === 0

        // (1) 빈 블록에 embed URL 붙여넣기 → 자동 변환
        if (isEmpty && isEmbedUrl(trimmed)) {
          updateBlockType(pageId, block.id, 'embed')
          updateBlock(pageId, block.id, JSON.stringify({ url: trimmed }))
          return true
        }

        // (2) LaTeX 블록 수식 감지: $$...$$  (멀티라인 포함)
        // \begin{...} 환경도 $$ 없이 붙여넣으면 $$ 래핑 후 제안
        // Python으로 치면: match = re.match(r'^\$\$([\s\S]+?)\$\$$', text.strip())
        const blockMathMatch = trimmed.match(/^\$\$([\s\S]+?)\$\$$/)
        const envMatch = !blockMathMatch && trimmed.match(/^\\begin\{[\s\S]+\\end\{[^}]+\}$/)

        if (blockMathMatch || envMatch) {
          // $$ 래퍼 제거 후 순수 LaTeX만 저장
          const latexInner = blockMathMatch
            ? blockMathMatch[1].trim()
            : trimmed

          // 붙여넣기는 정상 진행 (텍스트로 삽입), 변환 제안 UI만 띄움
          setLatexCandidate(latexInner)
          return false  // Tiptap 기본 붙여넣기 동작 허용 (텍스트 삽입)
        }

        return false
      },
      // ── 드롭 완전 차단 ───────────────────────────────────────────
      // dnd-kit 블록 드래그 중 Tiptap Table 확장이 ProseMirror 내부 노드 드래그를
      // 동시에 시작 → moved=true로 분류되므로 !moved 조건으로는 막히지 않음
      // 완전 차단(항상 true 반환)으로 테이블 1열1행 중첩 문제 해결
      // Python으로 치면: def handle_drop(*args): return True  # always block
      handleDrop: () => true,
      // ── ProseMirror 네이티브 dragstart 차단 ─────────────────────
      // Table 확장이 tableRow/tableCell 노드에 draggable 마크를 추가하여
      // 에디터 내부에서 HTML5 dragstart 이벤트를 발생시킴
      // dragstart 자체를 차단해 drop 이벤트의 발생 원천을 제거
      // 컬럼 리사이즈(mousedown+mousemove 방식)는 영향 없음
      // Python으로 치면: editor.on('dragstart', lambda e: e.preventDefault())
      handleDOMEvents: {
        dragstart: (_view, event) => {
          event.preventDefault()
          return true
        },
      },
    },
    immediatelyRender: false,
  })

  useEffect(() => {
    if (!editor) return
    applyBlockType(editor, block.type)
  }, [block.type, editor])

  // ── 테이블 툴바 활성화: selectionUpdate + blur 이벤트 구독 ──
  // selectionUpdate: 커서 이동마다 isActive('table') 체크 → tableActive 갱신
  // blur: 에디터 포커스를 잃으면 툴바 숨김
  //   (단, 툴바 버튼 클릭 시 chain().focus()로 즉시 포커스가 돌아오므로 깜빡임 없음)
  // Python으로 치면:
  //   editor.on('selectionUpdate', lambda: setTableActive(editor.isActive('table')))
  //   editor.on('blur', lambda: setTableActive(False))
  useEffect(() => {
    if (!editor) return
    const handleSelectionUpdate = () => {
      setTableActive(editor.isActive('table'))
    }
    const handleBlur = () => {
      setTableActive(false)
    }
    editor.on('selectionUpdate', handleSelectionUpdate)
    editor.on('blur', handleBlur)
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
      editor.off('blur', handleBlur)
    }
  }, [editor])

  // ── ArrowLayer 연결을 위한 에디터 참조 DOM에 저장 ──
  // ArrowLayer의 caretRangeFromPoint → posAtDOM 변환 시 에디터 인스턴스 필요
  // Python으로 치면: editor.view.dom.__tiptap_editor = editor
  useEffect(() => {
    if (!editor) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(editor.view.dom as any).__tiptapEditor = editor
  }, [editor])

  // ── 읽기 모드 변경 → Tiptap editable 업데이트 ──
  // Python으로 치면: if read_mode: editor.set_editable(False) else: editor.set_editable(True)
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readMode)
  }, [editor, readMode])

  // ── 포커스/블러/커서 이동 → _aiInsertTarget 갱신 ──
  // 모든 Editor 인스턴스 중 마지막으로 포커스된 것만 ai-insert-text를 처리
  // Python으로 치면: def on_focus(self): global_target = (self, self.cursor_pos)
  useEffect(() => {
    if (!editor) return
    function onFocus() {
      _aiInsertTarget.editor = editor
      _aiInsertTarget.pos = editor!.state.selection.from
      // 텍스트 블록 포커스 → 전역 AI에 블록 타입 자동 전달 (링 없이 텍스트 모드 전환)
      // Python으로 치면: window.emit('ai-block-select', {blockId, blockType})
      window.dispatchEvent(new CustomEvent('ai-block-select', {
        detail: { blockId: block.id, blockType: block.type }
      }))
    }
    function onBlur() {
      // 포커스 이탈 시 현재 커서 위치 저장 (AI 패널 클릭 후 복원용)
      if (_aiInsertTarget.editor === editor) {
        _aiInsertTarget.pos = editor!.state.selection.from
      }
    }
    function onSelectionUpdate() {
      if (_aiInsertTarget.editor === editor) {
        _aiInsertTarget.pos = editor!.state.selection.from
      }
    }
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
      editor.off('selectionUpdate', onSelectionUpdate)
      // 이 인스턴스가 등록된 상태였으면 해제
      if (_aiInsertTarget.editor === editor) _aiInsertTarget.editor = null
    }
  }, [editor])

  // ── 플로팅 AI 패널 → 저장된 커서 위치에 삽입 ──
  // _aiInsertTarget.editor 와 일치하는 인스턴스만 처리 → 엉뚱한 블록 삽입 방지
  // Python으로 치면: window.on('ai-insert-text', lambda e: if self is global_target: insert(e.detail))
  useEffect(() => {
    function handleAiInsert(e: Event) {
      // 이 인스턴스가 마지막 포커스 에디터가 아니면 무시
      if (_aiInsertTarget.editor !== editor || !editor || readMode) return
      const text = (e as CustomEvent<string>).detail
      if (!text) return
      // 저장된 커서 위치에 삽입 (포커스 이동 후에도 정확한 위치 보존)
      // Python으로 치면: editor.insert_at(saved_pos, text)
      editor.chain().focus().insertContentAt(_aiInsertTarget.pos, text).run()
    }
    window.addEventListener('ai-insert-text', handleAiInsert)
    return () => window.removeEventListener('ai-insert-text', handleAiInsert)
  }, [editor, readMode])

  // ── 찾기/바꾸기 스토어 구독 → 검색어 변경 시 각 에디터 플러그인에 전달 ──
  // Python으로 치면: def on_search_query_change(query, case): editor.dispatch(meta)
  const { query: searchQuery, caseSensitive: searchCase } = useFindReplaceStore()
  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(
      editor.view.state.tr.setMeta(searchHighlightKey, { term: searchQuery, caseSensitive: searchCase })
    )
  }, [editor, searchQuery, searchCase])

  // -----------------------------------------------
  // 우클릭 컨텍스트 메뉴 핸들러
  // Excalidraw는 내부 자체 컨텍스트 메뉴가 있으므로 가로채지 않음
  // Python으로 치면: def on_right_click(e): if excalidraw: return; show_menu(e.pos)
  // -----------------------------------------------
  function handleContextMenu(e: React.MouseEvent) {
    if (block.type === 'excalidraw') return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  // -----------------------------------------------
  // 컨텍스트 메뉴 섹션 빌더
  // sections 배열로 구성 — 새 기능 추가 시 여기에 section / action 추가
  // isTextBlock: Tiptap 기반 블록 여부 → true면 타입 변환 섹션 표시
  // Python으로 치면: def build_sections() -> list[Section]: ...
  // -----------------------------------------------
  function buildContextSections(): ContextMenuSection[] {
    const isTextBlock = ![
      'image', 'toggle', 'kanban', 'admonition',
      'canvas', 'excalidraw', 'video', 'layout', 'math', 'divider', 'mermaid', 'file',
    ].includes(block.type)

    const sections: ContextMenuSection[] = [
      // ── 블록 추가 ───────────────────────────────
      {
        id: 'add',
        actions: [
          {
            id: 'add-above',
            label: t.editor.addBlockAbove,
            icon: '↑',
            onClick: () => addBlockBefore(pageId, block.id),
          },
          {
            id: 'add-below',
            label: t.editor.addBlockBelow,
            icon: '↓',
            onClick: () => addBlock(pageId, block.id),
          },
        ],
      },
      // ── 블록 관리 ───────────────────────────────
      {
        id: 'block-ops',
        actions: [
          {
            id: 'duplicate',
            label: t.editor.duplicateBlock,
            icon: '⧉',
            onClick: () => duplicateBlock(pageId, block.id),
          },
          {
            id: 'delete',
            label: t.editor.deleteBlock,
            icon: '✕',
            danger: true,
            onClick: () => deleteBlock(pageId, block.id),
          },
        ],
      },
    ]

    // ── 블록 타입 변환 (Tiptap 텍스트 블록만) ────────
    // Python으로 치면: if is_text_block: sections.append(convert_section)
    if (isTextBlock) {
      sections.push({
        id: 'convert',
        title: t.editor.convertTitle,
        actions: [
          { id: 'to-para',    label: t.contextMenu.types.paragraph,    icon: 'T',   onClick: () => updateBlockType(pageId, block.id, 'paragraph') },
          { id: 'to-h1',     label: t.contextMenu.types.heading1,      icon: 'H1',  onClick: () => updateBlockType(pageId, block.id, 'heading1') },
          { id: 'to-h2',     label: t.contextMenu.types.heading2,      icon: 'H2',  onClick: () => updateBlockType(pageId, block.id, 'heading2') },
          { id: 'to-h3',     label: t.contextMenu.types.heading3,      icon: 'H3',  onClick: () => updateBlockType(pageId, block.id, 'heading3') },
          { id: 'to-bullet', label: t.contextMenu.types.bulletList,    icon: '•',   onClick: () => updateBlockType(pageId, block.id, 'bulletList') },
          { id: 'to-ol',     label: t.contextMenu.types.orderedList,   icon: '1.',  onClick: () => updateBlockType(pageId, block.id, 'orderedList') },
          { id: 'to-task',   label: t.contextMenu.types.taskList,      icon: '☐',   onClick: () => updateBlockType(pageId, block.id, 'taskList') },
          { id: 'to-code',   label: t.contextMenu.types.codeBlock,     icon: '</>',  onClick: () => updateBlockType(pageId, block.id, 'code') },
        ],
      })
    }

    // ── 블록 배경색 팔레트 ────────────────────────
    // customRender: 실제 색상 스와치를 격자로 표시 (텍스트 대신 색상 직접 확인 가능)
    // Python으로 치면: sections.append(bg_color_section_with_custom_render)
    const BG_COLORS = [
      { label: t.editor.colors.transparent, color: '' },
      { label: t.editor.colors.yellow,      color: '#fef9c3' },
      { label: t.editor.colors.orange,      color: '#fed7aa' },
      { label: t.editor.colors.red,         color: '#fee2e2' },
      { label: t.editor.colors.pink,        color: '#fce7f3' },
      { label: t.editor.colors.purple,      color: '#f3e8ff' },
      { label: t.editor.colors.blue,        color: '#dbeafe' },
      { label: t.editor.colors.sky,         color: '#cffafe' },
      { label: t.editor.colors.green,       color: '#dcfce7' },
      { label: t.editor.colors.gray,        color: '#f3f4f6' },
    ]
    sections.push({
      id: 'bg-color',
      title: t.editor.bgColorTitle,
      // actions는 비워두고 customRender로만 표시
      // Python으로 치면: section.custom_widget = ColorPaletteWidget(colors)
      actions: [],
      customRender: (
        <div className="px-3 pb-2.5">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {BG_COLORS.map(({ label, color }) => {
              const isActive = (block.backgroundColor ?? '') === color
              return (
                <button
                  key={color || 'none'}
                  type="button"
                  title={label}
                  onClick={() => {
                    updateBlockBackground(pageId, block.id, color)
                    // 색 선택 즉시 메뉴 닫기
                    setContextMenu(null)
                  }}
                  className={[
                    'w-6 h-6 rounded transition-all duration-100',
                    color === ''
                      // 투명: 바둑판 패턴으로 표시
                      ? 'bg-white border-2 border-dashed border-gray-300 hover:border-gray-500'
                      : 'border-2 hover:scale-110',
                    isActive
                      ? 'border-blue-500 ring-1 ring-blue-400 scale-110'
                      : 'border-gray-200 hover:border-gray-400',
                  ].join(' ')}
                  style={{ backgroundColor: color || undefined }}
                />
              )
            })}
          </div>
        </div>
      ),
    })

    return sections
  }

  function handleSlashSelect(type: BlockType) {
    if (!editor) return
    const { state } = editor
    const { from } = state.selection
    const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n')
    const slashMatch = textBefore.match(/\/(\w*)$/)
    if (slashMatch) {
      editor.chain().deleteRange({ from: from - slashMatch[0].length, to: from }).run()
    }

    // /ai 슬래시 커맨드 — 블록 타입 변경 없이 플로팅 AI 패널 열기
    // Python으로 치면: if type == 'ai': dispatch('open-ai-panel'); return
    if (type === 'ai' as BlockType) {
      window.dispatchEvent(new CustomEvent('open-ai-panel'))
      setSlashMenu(prev => ({ ...prev, isOpen: false }))
      return
    }

    updateBlockType(pageId, block.id, type)
    // 이미지·비디오 타입으로 전환 시 기존 텍스트 내용 초기화
    // 그래야 ImageBlock/VideoBlock이 업로드 UI를 표시함
    // 초기화 안 하면 Tiptap HTML(<p>...</p>)이 content로 남아
    // parseContent 실패 시 src = '<p>...</p>' → "재생 불가" 에러 발생
    // Python으로 치면: if type in ('image', 'video'): block.content = ''
    if (type === 'image' || type === 'video') {
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
          { id: crypto.randomUUID(), title: t.editor.kanbanDefault.todo,       color: '#f1f5f9', cards: [] },
          { id: crypto.randomUUID(), title: t.editor.kanbanDefault.inProgress, color: '#dbeafe', cards: [] },
          { id: crypto.randomUUID(), title: t.editor.kanbanDefault.done,       color: '#dcfce7', cards: [] },
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
    // 수식 타입으로 전환 시 빈 LaTeX 문자열로 초기화 → MathBlock 편집 모드 표시
    // Python으로 치면: if type == 'math': block.content = ''
    if (type === 'math') {
      updateBlock(pageId, block.id, '')
    }
    // 차트 타입으로 전환 시 기본 막대 차트 JSON으로 초기화
    // Python으로 치면: if type == 'chart': block.content = json.dumps({'chartType':'bar',...})
    if (type === 'chart') {
      updateBlock(pageId, block.id, JSON.stringify({
        chartType: 'bar',
        title: '',
        labels: [t.editor.chartDefault.label1, t.editor.chartDefault.label2, t.editor.chartDefault.label3],
        series: [{ name: t.editor.chartDefault.series, data: [0, 0, 0], color: '#3b82f6' }],
      }))
    }
    // 갠트 타입으로 전환 시 빈 content로 초기화 → GanttBlock 내부에서 기본 데이터 생성
    // Python으로 치면: if type == 'gantt': block.content = ''
    if (type === 'gantt') {
      updateBlock(pageId, block.id, '')
    }
    // 마인드맵 타입으로 전환 시 루트 노드 하나로 초기화
    // Python으로 치면: if type == 'mindmap': block.content = json.dumps({'nodes':[...],'chatHistory':[],'chatOpen':True})
    if (type === 'mindmap') {
      updateBlock(pageId, block.id, JSON.stringify({
        nodes: [{ id: 'root', text: t.editor.mindmapDefault, parentId: null, collapsed: false }],
        chatHistory: [],
        chatOpen: true,
      }))
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
        text: `${item.page.icon} ${item.page.title || t.common.untitled}`,
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
        text: `${item.page.icon} ${item.page.title || t.common.untitled} › ${snippet || t.editor.emptyContent}`,
        marks: [{ type: 'link', attrs: { href: `#block-${item.page.id}:${item.block.id}` } }],
      }).run()
    }
    setMentionMenu(prev => ({ ...prev, isOpen: false }))
  }

  // ── 리스트 타입 분리 변환 헬퍼 ──────────────────────────────────────
  // bulletList ↔ orderedList 전환 시 커서 앞 항목은 기존 타입 유지,
  // 커서부터 끝까지만 새 타입으로 분리 (옵션 B 동작)
  // Python으로 치면: def split_and_convert_list(editor, target_type): ...
  function convertListType(editor: TiptapEditor, targetType: 'bulletList' | 'orderedList'): boolean {
    return editor.chain().focus().command(({ state, dispatch }) => {
      const { $from } = state.selection
      const schema = state.schema

      // 커서에서 위로 올라가며 listItem → 부모 list 탐색
      // Python으로 치면: list_item_d, list_d = find_list_ancestors($from)
      let listItemDepth = -1
      let listDepth = -1

      for (let d = $from.depth; d >= 1; d--) {
        const n = $from.node(d)
        if (n.type === schema.nodes.listItem && listItemDepth === -1) {
          listItemDepth = d
        } else if (
          (n.type === schema.nodes.bulletList || n.type === schema.nodes.orderedList) &&
          listItemDepth !== -1 && listDepth === -1
        ) {
          listDepth = d
          break
        }
      }

      // 리스트 안에 없으면 → 기존 toggle 동작에 위임 (false 반환)
      if (listDepth === -1) return false

      const parentList = $from.node(listDepth)
      const targetListType = schema.nodes[targetType]

      // 이미 같은 타입이면 → toggle off 동작에 위임 (false 반환)
      if (parentList.type === targetListType) return false

      // 부모 list 안에서 현재 listItem의 인덱스
      // Python으로 치면: item_index = parent_list.index_of(current_item)
      const itemIndex = $from.index(listDepth)

      if (!dispatch) return true

      const tr = state.tr
      const listStart = $from.before(listDepth)
      const listEnd   = $from.after(listDepth)

      if (itemIndex === 0) {
        // 첫 항목(또는 유일 항목): 리스트 전체를 새 타입으로 변환
        // Python으로 치면: new_list = targetType(children=parent_list.children)
        const newList = targetListType.create(parentList.attrs, parentList.content)
        tr.replaceWith(listStart, listEnd, newList)
      } else {
        // 중간/끝 항목: 커서 앞은 기존 타입 유지, 커서부터 끝은 새 타입으로 분리
        // Python으로 치면: before, after = split_at(parent_list, item_index)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const beforeItems: any[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const afterItems: any[] = []

        parentList.forEach((child, _offset, index) => {
          if (index < itemIndex) beforeItems.push(child)
          else                   afterItems.push(child)
        })

        const beforeList = parentList.type.create(parentList.attrs, beforeItems)
        const afterList  = targetListType.create(null, afterItems)

        // 원래 list 하나를 두 list로 교체
        tr.replaceWith(listStart, listEnd, [beforeList, afterList])
      }

      dispatch(tr.scrollIntoView())
      return true
    }).run()
  }

  function applyBlockType(editor: TiptapEditor, type: BlockType) {
    if (!editor) return
    // 이미지·토글·레이아웃 등 비-Tiptap 블록은 조기 반환
    // Python으로 치면: if type in ('image', 'toggle', 'layout', ...): return
    // math 블록도 비-Tiptap 블록 — 조기 반환
    // Python으로 치면: if type in ('image', ..., 'math'): return
    // video, embed도 비-Tiptap 블록 — content를 JSON으로 직접 관리하므로 조기 반환
    // 빠트리면 setParagraph()가 호출돼 onUpdate → updateBlock('<p></p>') 로 content 덮어쓰기 위험
    if (type === 'image' || type === 'video' || type === 'embed' || type === 'toggle' || type === 'kanban' || type === 'admonition' || type === 'canvas' || type === 'excalidraw' || type === 'layout' || type === 'math' || type === 'mermaid' || type === 'file') return
    const level = blockTypeToLevel[type]
    if (level) {
      editor.chain().focus().setHeading({ level }).run()
    } else if (type === 'bulletList') {
      // 리스트 안에서 호출 시: 커서부터 끝만 분리 변환 (옵션 B)
      // 리스트 밖에서 호출 시: 기존 toggle 동작 (false 반환 → fallback)
      // Python으로 치면: converted = convert_list_type(editor, 'bulletList')
      if (!convertListType(editor, 'bulletList')) {
        editor.chain().focus().toggleBulletList().run()
      }
    } else if (type === 'orderedList') {
      if (!convertListType(editor, 'orderedList')) {
        editor.chain().focus().toggleOrderedList().run()
      }
    } else if (type === 'taskList') {
      editor.chain().focus().toggleTaskList().run()
    } else if (type === 'code') {
      // toggleCodeBlock 대신 setCodeBlock 사용 — 이미 코드 블록이면 유지, 아니면 전환
      // Python으로 치면: editor.set_code_block(language='javascript')
      editor.chain().focus().setCodeBlock({ language: 'javascript' }).run()
    } else if (type === 'table') {
      // 테이블 노드가 문서에 없을 때만 기본 3×3 테이블 삽입
      // getText()로 체크하면 셀이 비어있는 기존 테이블도 ''로 판정 →
      // 드래그 후 editor 재생성 시 첫 번째 셀 안에 중복 삽입 → 중첩 버그 발생
      // doc.content에서 table 노드 존재 여부를 직접 확인해서 방지
      // Python으로 치면: if not any(n.type == 'table' for n in doc.children): insert_table()
      const hasTable = editor.state.doc.content.content.some(
        n => n.type.name === 'table'
      )
      if (!hasTable) {
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        {/* + 블록 메뉴 버튼 */}
        <BlockMenu pageId={pageId} blockId={block.id} />
        {/* 드래그 핸들 — 이미지 블록도 동일하게 제공 */}
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <ImageBlock block={block} pageId={pageId} readMode={readMode} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <ToggleBlock block={block} pageId={pageId} isLast={isLast} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <KanbanBlock
            blockId={block.id}
            pageId={pageId}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <AdmonitionBlock
            blockId={block.id}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <CanvasBlock
            blockId={block.id}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
            readMode={readMode}
          />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <ExcalidrawBlock
            blockId={block.id}
            content={block.content}
            onChange={(newContent) => updateBlock(pageId, block.id, newContent)}
          />
        </div>
        {/* Excalidraw는 handleContextMenu에서 early return하므로 contextMenu가 null — 렌더링 없음 */}
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <VideoBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <LayoutBlock
            blockId={block.id}
            content={block.content}
            onChange={newContent => updateBlock(pageId, block.id, newContent)}
          />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 수식 블록: MathBlock 컴포넌트로 렌더링
  // content = raw LaTeX 문자열 (예: "\sqrt{x^2 + y^2}")
  // Python으로 치면: if block.type == 'math': return render(MathBlock)
  // -----------------------------------------------
  if (block.type === 'math') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <MathBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // Mermaid 다이어그램 블록: MermaidBlock 컴포넌트로 렌더링
  // content = raw Mermaid 코드 문자열
  // Python으로 치면: if block.type == 'mermaid': return render(MermaidBlock)
  // -----------------------------------------------
  if (block.type === 'mermaid') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <MermaidBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 차트 블록: ChartBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { chartType, title, labels, series }
  // Python으로 치면: if block.type == 'chart': return render(ChartBlock)
  // -----------------------------------------------
  if (block.type === 'chart') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <ChartBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // 갠트 블록: GanttBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { title, tasks: [{id,name,start,end,color,progress}] }
  // Python으로 치면: if block.type == 'gantt': return render(GanttBlock)
  // -----------------------------------------------
  if (block.type === 'gantt') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <GanttBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // Day Planner 블록: DayPlannerBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { date: 'YYYY-MM-DD', events: [{id,title,start,end,color,done}] }
  // Python으로 치면: if block.type == 'dayplanner': return render(DayPlannerBlock)
  // -----------------------------------------------
  if (block.type === 'dayplanner') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <DayPlannerBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // Week Planner 블록: WeekPlannerBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { weekStart: 'YYYY-MM-DD', range: '7'|'5'|'3' }
  // Python으로 치면: if block.type == 'weekplanner': return render(WeekPlannerBlock)
  // -----------------------------------------------
  if (block.type === 'weekplanner') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <WeekPlannerBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // Weekly Planner 블록: WeeklyPlannerBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { weekStart, days: {[date]: {weather?, tasks[]}}, location? }
  // Python으로 치면: if block.type == 'weeklyplanner': return render(WeeklyPlannerBlock)
  // -----------------------------------------------
  if (block.type === 'weeklyplanner') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <WeeklyPlannerBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 루틴 달성 매트릭스 블록: RoutineMatrixBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { weekStart: 'YYYY-MM-DD' }
  // Python으로 치면: if block.type == 'routinematrix': return render(RoutineMatrixBlock)
  // -----------------------------------------------
  if (block.type === 'routinematrix') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <RoutineMatrixBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 월간 캘린더 블록: MonthlyCalendarBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { year, month, memos: { 'YYYY-MM-DD': '메모' } }
  // Python으로 치면: if block.type == 'monthlycalendar': return render(MonthlyCalendarBlock)
  // -----------------------------------------------
  if (block.type === 'monthlycalendar') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <MonthlyCalendarBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 분기 플래너 블록: QuarterlyPlannerBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { year, quarter, objectives: [{id,title,keyResults:[{id,title,progress}]}] }
  // Python으로 치면: if block.type == 'quarterlyplanner': return render(QuarterlyPlannerBlock)
  // -----------------------------------------------
  if (block.type === 'quarterlyplanner') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <QuarterlyPlannerBlock
            block={block}
            pageId={pageId}
            onUpdate={content => updateBlock(pageId, block.id, content)}
          />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 연간 플래너 블록: YearlyPlannerBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { year, goals: [{id,category,title,done}] }
  // Python으로 치면: if block.type == 'yearlyplanner': return render(YearlyPlannerBlock)
  // -----------------------------------------------
  if (block.type === 'yearlyplanner') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <YearlyPlannerBlock
            block={block}
            pageId={pageId}
            onUpdate={content => updateBlock(pageId, block.id, content)}
          />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 마인드맵 블록: MindmapBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { nodes: MindNode[], chatHistory: ChatMsg[], chatOpen: boolean }
  // Python으로 치면: if block.type == 'mindmap': return render(MindmapBlock)
  // -----------------------------------------------
  if (block.type === 'mindmap') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <MindmapBlock block={block} pageId={pageId} readMode={readMode} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 인라인 목차 블록: TocBlock 컴포넌트로 렌더링
  // 현재 페이지의 헤딩(H1~H6)을 실시간으로 읽어 클릭 가능한 목록으로 표시
  // Python으로 치면: if block.type == 'toc': return render(TocBlock)
  // -----------------------------------------------
  if (block.type === 'toc') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <TocBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // -----------------------------------------------
  // 파일 첨부 블록: FileBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { url, name, size, ext }
  // Python으로 치면: if block.type == 'file': return render(FileBlock)
  // -----------------------------------------------
  if (block.type === 'file') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <FileBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
      </div>
    )
  }

  // 임베드 블록: EmbedBlock 컴포넌트로 렌더링
  // content는 JSON 문자열: { url: "https://..." }
  // Python으로 치면: if block.type == 'embed': return render(EmbedBlock)
  // -----------------------------------------------
  if (block.type === 'embed') {
    return (
      <div
        id={block.id}
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: block.backgroundColor || undefined,
          borderRadius: block.backgroundColor ? '4px' : undefined,
        }}
        className={blockWrapperClass}
        onContextMenu={handleContextMenu}
      >
        <BlockMenu pageId={pageId} blockId={block.id} />
        {selectionCheckbox}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
          title={t.editor.dragHandle}
        >
          ⠿
        </div>
        <div className="flex-1 min-w-0">
          <EmbedBlock block={block} pageId={pageId} />
        </div>
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
        )}
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
        backgroundColor: block.backgroundColor || undefined,
        borderRadius: block.backgroundColor ? '4px' : undefined,
      }}
      className={blockWrapperClass}
      onContextMenu={handleContextMenu}
    >
      {/* ── 섹션 접기/펼치기 버튼 (heading 블록 + 하위 블록이 있을 때만 표시) ──
          hover 시 나타남, 클릭 시 하위 섹션 전체 접힘/펼침
          Python으로 치면: if is_heading and has_children: render_collapse_btn() */}
      {hasSectionChildren && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSectionCollapse?.() }}
          title={isSectionCollapsed ? '섹션 펼치기' : '섹션 접기'}
          className="opacity-0 group-hover:opacity-100 shrink-0 flex items-center justify-center w-4 h-4 mt-1 mr-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
        >
          {isSectionCollapsed
            ? <ChevronRight size={12} />
            : <ChevronDown size={12} />
          }
        </button>
      )}

      {/* ── + 블록 메뉴 버튼 ─────────────────────── */}
      {/* BlockMenu: hover 시 + 버튼 표시 → 클릭하면 위/아래 추가·복제·삭제 메뉴 */}
      <BlockMenu pageId={pageId} blockId={block.id} />

      {/* ── 선택 체크박스 + 드래그 핸들 ──────────── */}
      {selectionCheckbox}
      {/* listeners : 이 요소에서만 드래그가 시작되게 함 (에디터 내 클릭과 충돌 방지) */}
      {/* group-hover:opacity-100 : 블록에 마우스 올릴 때만 보임 (노션과 동일한 UX) */}
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none mt-1 mr-1 transition-opacity shrink-0"
        title={t.editor.dragHandle}
      >
        ⠿
      </div>

      {/* ── 플로팅 테이블 툴바 ────────────────────────
          커서가 테이블 안에 있을 때만 표시
          absolute 포지션: 블록 래퍼(relative) 기준 -top-10 에 띄움
          Python으로 치면: if table_active: render FloatingTableToolbar() */}
      {editor && tableActive && (
        <TableToolbar editor={editor} pageId={pageId} blockId={block.id} />
      )}

      {/* Bubble Menu — editor가 준비됐을 때만 렌더링 */}
      {editor ? <BubbleMenuBar editor={editor} readMode={readMode} /> : null}

      {/* 내부 링크 클릭 처리 */}
      {/* #page-{id}  → 해당 페이지로 이동 */}
      {/* #block-{pageId}:{blockId} → 해당 페이지로 이동 후 블록으로 스크롤 */}
      {/* Python으로 치면: if link.startswith('#page-'): go(link[6:]); elif '#block-': go_and_scroll(link) */}
      <div
        className="flex-1 min-w-0"
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
        <EditorContent editor={editor} className="outline-none" />

        {/* ── 행 추가 버튼 (테이블 하단) ───────────────
            커서가 테이블 안에 있을 때 테이블 바로 아래에 표시
            클릭 시 마지막 행 아래에 새 행 추가
            Python으로 치면: if table_active: render AddRowBtn() */}
        {editor && tableActive && (
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="mt-1 ml-0.5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300 transition-colors px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Plus size={11} />
            <span>행 추가</span>
          </button>
        )}
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
      {/* 우클릭 컨텍스트 메뉴 — position:fixed이므로 DOM 위치와 무관 */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} sections={buildContextSections()} onClose={() => setContextMenu(null)} />
      )}

      {/* LaTeX 붙여넣기 감지 배너
          $$ ... $$ 또는 \begin{...} 패턴 감지 시 표시
          [수식 블록으로 변환] 클릭 → math 블록으로 전환하고 텍스트 삭제
          [텍스트 유지] 클릭 → 그대로 유지하고 닫기
          Python으로 치면: if latex_candidate: show_conversion_prompt()
      */}
      {latexCandidate && (
        <div className="absolute left-8 right-0 bottom-full mb-1 z-50 flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 shadow-md text-xs">
          <span className="text-amber-600">∑</span>
          <span className="flex-1 text-amber-800 font-medium">LaTeX 수식이 감지되었습니다</span>
          <button
            type="button"
            onClick={() => {
              // 현재 블록 내용을 모두 지우고 math 블록으로 변환
              // Python으로 치면: block.type = 'math'; block.content = latex_candidate
              editor?.commands.clearContent()
              updateBlockType(pageId, block.id, 'math')
              updateBlock(pageId, block.id, latexCandidate)
              setLatexCandidate(null)
            }}
            className="shrink-0 px-2 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
          >
            수식 변환
          </button>
          <button
            type="button"
            onClick={() => setLatexCandidate(null)}
            className="shrink-0 px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
          >
            텍스트 유지
          </button>
        </div>
      )}
    </div>
  )
}