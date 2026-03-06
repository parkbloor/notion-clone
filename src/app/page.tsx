// =============================================
// src/app/page.tsx
// 역할: 앱의 진입점 — 3패널 레이아웃 (카테고리 | 페이지 목록 | 에디터)
// Python으로 치면: if __name__ == "__main__": main()
// =============================================

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore, applyTheme, applyEditorStyle, applyThemePreset } from '@/store/settingsStore'
import CategorySidebar from '@/components/editor/CategorySidebar'
import PageEditor from '@/components/editor/PageEditor'
import DatabaseView from '@/components/editor/DatabaseView'
import ShortcutModal from '@/components/editor/ShortcutModal'
import QuickAddModal from '@/components/editor/QuickAddModal'
import GlobalSearch from '@/components/editor/GlobalSearch'
import CommandPalette from '@/components/editor/CommandPalette'
import SettingsModal from '@/components/settings/SettingsModal'
import PomodoroWidget from '@/components/editor/PomodoroWidget'
import BottomBar from '@/components/editor/BottomBar'
import TabBar from '@/components/editor/TabBar'
import { X } from 'lucide-react'

// dnd-kit: 카테고리 정렬 + 페이지→카테고리 드래그를 하나의 DndContext로 관리
// Python으로 치면: from dnd import DndContext, arrayMove
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

export default function Home() {

  // 단축키 안내 모달 열림 여부
  // Python으로 치면: self.shortcut_modal_open = False
  const [shortcutOpen, setShortcutOpen] = useState(false)

  // 모바일 사이드바 열림 여부 — 햄버거 버튼으로 토글
  // Python으로 치면: self.sidebar_open = False
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 모바일에서 페이지 선택 시 사이드바 자동 닫기 콜백
  // Python으로 치면: def close_mobile_sidebar(self): self.sidebar_open = False
  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), [])

  // 설정 모달 열림 여부
  // Python으로 치면: self.settings_modal_open = False
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 빠른 노트 캡처 팝업 열림 여부
  // Python으로 치면: self.quick_add_open = False
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  // 전체 검색 팝업 열림 여부 (Ctrl+K)
  // Python으로 치면: self.search_open = False
  const [searchOpen, setSearchOpen] = useState(false)

  // 커맨드 팔레트 열림 여부 (Ctrl+P)
  // Python으로 치면: self.command_palette_open = False
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // 데이터베이스 테이블 뷰 활성 여부
  // true이면 에디터 대신 DatabaseView를 렌더링
  // Python으로 치면: self.db_view_active = False
  const [dbViewActive, setDbViewActive] = useState(false)

  // ── 스플릿 뷰 상태 ─────────────────────────────
  // splitPageId: 오른쪽 패널에 표시할 페이지 ID (null = 스플릿 없음)
  // splitRatio: 왼쪽:오른쪽 비율 (0.2~0.8, 기본 0.5)
  // Python으로 치면: self.split_page_id = None; self.split_ratio = 0.5
  const [splitPageId, setSplitPageId] = useState<string | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  // 플러그인 설정 + 집중 모드 상태/토글
  // Python으로 치면: plugins, is_focus_mode = settings.plugins, settings.is_focus_mode
  const { plugins, isFocusMode, toggleFocusMode } = useSettingsStore()

  // -----------------------------------------------
  // Ctrl+Alt+N 단축키 → 빠른 노트 팝업 열기
  // quickAdd 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'n': open_quick_add()
  // -----------------------------------------------
  useEffect(() => {
    function handleQuickAddKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'n' && plugins.quickAdd) {
        e.preventDefault()
        setQuickAddOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleQuickAddKey)
    return () => window.removeEventListener('keydown', handleQuickAddKey)
  }, [plugins.quickAdd])

  // -----------------------------------------------
  // Ctrl+K 단축키 → 전체 검색 팝업 열기/닫기
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.key == 'k': toggle_search()
  // -----------------------------------------------
  useEffect(() => {
    function handleSearchKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleSearchKey)
    return () => window.removeEventListener('keydown', handleSearchKey)
  }, [])

  // -----------------------------------------------
  // Ctrl+P 단축키 → 커맨드 팔레트 열기/닫기
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.key == 'p': toggle_command_palette()
  // -----------------------------------------------
  useEffect(() => {
    function handleCommandPaletteKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setCommandPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleCommandPaletteKey)
    return () => window.removeEventListener('keydown', handleCommandPaletteKey)
  }, [])

  // -----------------------------------------------
  // Ctrl+Shift+F 단축키 → 집중 모드 ON/OFF 토글
  // focusMode 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.shift and event.key == 'f': toggle_focus_mode()
  // -----------------------------------------------
  useEffect(() => {
    function handleFocusKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f' && plugins.focusMode) {
        e.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', handleFocusKey)
    return () => window.removeEventListener('keydown', handleFocusKey)
  }, [plugins.focusMode, toggleFocusMode])

  // -----------------------------------------------
  // 집중 모드 진입 시 스플릿 뷰 자동 해제
  // Python으로 치면: if is_focus_mode: self.split_page_id = None
  // -----------------------------------------------
  useEffect(() => {
    if (isFocusMode) setSplitPageId(null)
  }, [isFocusMode])

  // -----------------------------------------------
  // 스플릿 핸들 드래그로 좌우 비율 조절 (0.2~0.8 범위 제한)
  // Python으로 치면:
  //   def on_split_resize_start(e):
  //       self.is_resizing = True; attach_mousemove_handler()
  // -----------------------------------------------
  function handleSplitResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      const rect = splitContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      setSplitRatio(Math.max(0.2, Math.min(0.8, (ev.clientX - rect.left) / rect.width)))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMove)
    }, { once: true })
  }

  // -----------------------------------------------
  // 앱 초기화 시 저장된 테마 + 편집기 스타일 복원
  // localStorage에서 settingsStore가 복원한 값을 DOM에 적용
  // Python으로 치면: def on_start(self): apply_theme(self.settings.theme)
  // -----------------------------------------------
  const { theme, fontFamily, fontSize, lineHeight, editorMaxWidth, themePreset } = useSettingsStore()
  useEffect(() => {
    applyTheme(theme)
    // 색상 테마 프리셋 복원 — html[data-theme] 속성 설정
    // Python으로 치면: apply_theme_preset(self.settings.theme_preset)
    applyThemePreset(themePreset)
    // editorMaxWidth도 함께 전달 → --editor-max-width CSS 변수 초기화
    // Python으로 치면: apply_editor_style(font, size, lh, max_width)
    applyEditorStyle(fontFamily, fontSize, lineHeight, editorMaxWidth)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 스토어에서 필요한 상태와 액션 가져오기
  // -----------------------------------------------
  const {
    currentPageId,
    pages,
    openTabs,
    categoryOrder,
    categoryChildOrder,
    setCurrentPage,
    addPage,
    loadFromServer,
    movePageToCategory,
    reorderCategories,
    reorderChildCategories,
    moveCategoryToParent,
    reorderPages,
    undoPage,
    redoPage,
  } = usePageStore()

  // -----------------------------------------------
  // 오늘의 일간 노트를 열거나 없으면 새로 생성
  // 제목 형식: "일간 노트 YYYY-MM-DD"
  // Python으로 치면: def open_daily_note(self): ...
  // -----------------------------------------------
  function openDailyNote() {
    const today = new Date()
    const yy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const title = `일간 노트 ${yy}-${mm}-${dd}`

    // 기존 페이지 중 동일 제목 검색
    const existing = pages.find(p => p.title === title)
    if (existing) {
      setCurrentPage(existing.id)
    } else {
      // 없으면 새 페이지 생성 (addPage가 currentPageId를 새 페이지로 설정함)
      addPage(title, null)
    }
  }

  // -----------------------------------------------
  // Ctrl+Alt+D 단축키 → 오늘의 일간 노트 열기/생성 (Periodic Notes)
  // periodicNotes 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'd': open_daily_note()
  // -----------------------------------------------
  useEffect(() => {
    function handleDailyKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd' && plugins.periodicNotes) {
        e.preventDefault()
        openDailyNote()
      }
    }
    window.addEventListener('keydown', handleDailyKey)
    return () => window.removeEventListener('keydown', handleDailyKey)
  }, [plugins.periodicNotes, pages]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z → 블록 구조 undo/redo
  // contenteditable(Tiptap) 안에서는 Tiptap 자체 히스토리가 처리 → 무시
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.target.is_content_editable: return  # Tiptap에 위임
  //       if ctrl+z: undo_page(current_page_id)
  //       if ctrl+y or ctrl+shift+z: redo_page(current_page_id)
  // -----------------------------------------------
  useEffect(() => {
    function handleUndoRedo(e: KeyboardEvent) {
      if (!currentPageId) return
      // contenteditable 안에서는 Tiptap이 담당 → 여기서 처리 안 함
      if ((e.target as HTMLElement).isContentEditable) return

      const isUndo = e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z'
      const isRedo = e.ctrlKey && (
        e.key.toLowerCase() === 'y' ||
        (e.shiftKey && e.key.toLowerCase() === 'z')
      )

      if (isUndo) {
        e.preventDefault()
        undoPage(currentPageId)
      } else if (isRedo) {
        e.preventDefault()
        redoPage(currentPageId)
      }
    }
    window.addEventListener('keydown', handleUndoRedo)
    return () => window.removeEventListener('keydown', handleUndoRedo)
  }, [currentPageId, undoPage, redoPage])

  // -----------------------------------------------
  // 앱 첫 진입 시 FastAPI 서버에서 페이지+카테고리 목록 불러오기
  // Python으로 치면: asyncio.run(load_from_server())
  // -----------------------------------------------
  useEffect(() => {
    loadFromServer()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 서버 로드 후 currentPageId가 없으면 첫 번째 페이지 자동 선택
  // 렌더 중 직접 호출하면 React 경고 + API 에러 발생 → useEffect로 이동
  // Python으로 치면: asyncio.ensure_future(select_first_page_if_none())
  // -----------------------------------------------
  useEffect(() => {
    if (!currentPageId && pages.length > 0) {
      setCurrentPage(pages[0].id)
    }
  }, [currentPageId, pages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // Ctrl+\ 단축키 → 스플릿 뷰 토글
  // 스플릿 없음: 현재 탭 이외의 마지막 탭을 오른쪽 패널로 열기
  // 스플릿 있음: 스플릿 닫기
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.ctrl and e.code == 'Backslash': toggle_split()
  // -----------------------------------------------
  useEffect(() => {
    function handleSplitKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'Backslash') {
        e.preventDefault()
        setSplitPageId(prev => {
          if (prev) return null
          // 현재 페이지 이외의 마지막 탭을 오른쪽에 열기
          const others = openTabs.filter(id => id !== currentPageId)
          return others[others.length - 1] ?? null
        })
      }
    }
    window.addEventListener('keydown', handleSplitKey)
    return () => window.removeEventListener('keydown', handleSplitKey)
  }, [openTabs, currentPageId])

  // ── dnd-kit 드래그 센서 ───────────────────────────────────
  // PointerSensor: 데스크탑 마우스 — 8px 이상 이동해야 드래그 시작
  // TouchSensor: 모바일 터치 — 250ms 길게 누르면 드래그 시작 (오발동 방지)
  // Python으로 치면: sensors = [PointerSensor(min_distance=8), TouchSensor(delay=250)]
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // -----------------------------------------------
  // 드래그 완료 이벤트 처리
  //
  // 세 가지 경우를 처리:
  // 1. 페이지 → 카테고리: 페이지를 카테고리로 이동
  // 2. 카테고리 → 카테고리: 카테고리 순서 변경
  // 3. 페이지 → 페이지: 메모 목록 내 순서 변경
  //
  // Python으로 치면:
  //   def on_drag_end(active, over):
  //       if active.type == 'page' and over.type == 'category':
  //           move_page(active.id, over.category_id)
  //       elif active.type == 'category' and over.type == 'category':
  //           reorder_categories(active.id, over.id)
  //       elif active.type == 'page' and over.type == 'page':
  //           reorder_pages(active.id, over.id)
  // -----------------------------------------------
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeType = active.data.current?.type as string | undefined
    const overType = over.data.current?.type as string | undefined

    if (activeType === 'page' && overType === 'category') {
      // 페이지를 카테고리(또는 전체보기=null)로 이동
      const targetCategoryId = over.data.current?.categoryId as string | null
      const pageId = active.data.current?.pageId as string
      if (pageId !== undefined) {
        movePageToCategory(pageId, targetCategoryId)
      }
    } else if (activeType === 'category' && overType === 'category' && active.id !== over.id) {
      // 드래그한 폴더와 드롭 대상 폴더의 parentId 비교
      const activeParentId = (active.data.current?.parentId ?? null) as string | null
      const overParentId   = (over.data.current?.parentId   ?? null) as string | null

      if (activeParentId === overParentId) {
        // 같은 부모 → 순서 변경
        if (activeParentId === null) {
          // 최상위 레벨 순서 변경
          const oldIndex = categoryOrder.indexOf(active.id as string)
          const newIndex = categoryOrder.indexOf(over.id as string)
          if (oldIndex !== -1 && newIndex !== -1) {
            reorderCategories(arrayMove(categoryOrder, oldIndex, newIndex))
          }
        } else {
          // 하위 레벨 순서 변경 (같은 부모 내)
          // Python으로 치면: siblings = child_order[parent_id]; arrayMove(siblings, old, new)
          const siblings = categoryChildOrder[activeParentId] ?? []
          const oldIndex = siblings.indexOf(active.id as string)
          const newIndex = siblings.indexOf(over.id as string)
          if (oldIndex !== -1 && newIndex !== -1) {
            reorderChildCategories(activeParentId, arrayMove(siblings, oldIndex, newIndex))
          }
        }
      } else {
        // 다른 부모 → over 폴더의 자식으로 이동 (over.id = 새 부모)
        // Python으로 치면: move_category(active.id, new_parent_id=over.id)
        moveCategoryToParent(active.id as string, over.id as string)
      }
    } else if (activeType === 'page' && overType === 'page' && active.id !== over.id) {
      // 메모 목록 내 순서 변경
      reorderPages(active.id as string, over.id as string)
    }
  }

  return (
    // -----------------------------------------------
    // 최외곽 DndContext: CategorySidebar와 PageList를 모두 감싸서
    // 페이지→카테고리 드래그와 카테고리 순서 변경을 하나의 컨텍스트로 관리
    // Python으로 치면: with DndContext(on_drag_end=handle_drag_end): render(...)
    // -----------------------------------------------
    <DndContext
      id="dnd-main"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {/* 모바일 사이드바 오버레이 배경 — 탭하면 사이드바 닫힘
          md 이상(데스크탑)에서는 숨김
          Python으로 치면: if sidebar_open: render Overlay() */}
      {sidebarOpen && !isFocusMode && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* 전체 레이아웃: 3패널 가로 배치 */}
      {/* id="app-layout": @media print에서 flex→block으로 전환하여 인쇄 시 사이드바 공간 제거 */}
      <div id="app-layout" className="flex h-screen bg-white overflow-hidden relative">

        {/* ── 사이드바 패널 래퍼 ──────────────────────
            데스크탑(md+): 항상 인라인 flex로 표시
            모바일: 기본 숨김 → 햄버거 탭 시 fixed 드로어로 슬라이드
            집중 모드 시 완전 숨김
            Python으로 치면:
              if is_focus_mode: hide()
              elif mobile and not sidebar_open: hide()
              else: show() */}
        {!isFocusMode && (
          <div className={sidebarOpen ? "flex fixed inset-y-0 left-0 z-40 shadow-2xl md:relative md:z-auto md:shadow-none" : "hidden md:flex"}>
            {/* 통합 파일 사이드바: 폴더 트리 + 페이지 인라인 + 검색 + 캘린더 + 최근파일 */}
            <CategorySidebar
              onOpenSettings={() => setSettingsOpen(true)}
              onCloseMobile={closeMobileSidebar}
              dbViewActive={dbViewActive}
              onToggleDbView={() => setDbViewActive(v => !v)}
              onSplitPage={(id) => setSplitPageId(prev => prev === id ? null : id)}
            />
          </div>
        )}

        {/* ── 모바일 햄버거 버튼 ────────────────────
            md 이상(데스크탑)에서는 숨김
            집중 모드 시 숨김
            Python으로 치면: if not is_focus_mode and is_mobile: render HamburgerButton() */}
        {!isFocusMode && (
          <button
            type="button"
            onClick={() => setSidebarOpen(prev => !prev)}
            className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow border border-gray-200 text-gray-600 text-lg"
            title="메뉴 열기/닫기"
          >
            ☰
          </button>
        )}

        {/* ── 에디터 패널 ──────────────────────────
            flex-col: TabBar + 에디터 + BottomBar를 세로로 배치
            min-h-0: flex-col 자식이 넘치지 않도록 최소 높이 제한
            Python으로 치면: main_panel = VBox([tab_bar, scrollable_area, bottom_bar]) */}
        <main className="flex-1 flex flex-col min-h-0 pt-14 md:pt-0">
          {/* ── 크롬 스타일 탭 바 ───────────────────
              집중 모드 시 숨김 / 탭 없으면 자동 미표시
              onSplit: 탭의 ⊞ 버튼 클릭 시 스플릿 뷰 활성화
              Python으로 치면: if not is_focus_mode: render TabBar(on_split=set_split_page_id) */}
          {!isFocusMode && (
            <TabBar
              onSplit={(id) => setSplitPageId(prev => prev === id ? null : id)}
              splitPageId={splitPageId}
            />
          )}

          {/* ── 에디터 + 스플릿 컨테이너 ─────────────
              스플릿 없음: 왼쪽 패널만 전체 너비
              스플릿 있음: 왼쪽 + 1px 핸들 + 오른쪽 패널
              Python으로 치면: HBox([left_pane, handle?, right_pane?]) */}
          <div ref={splitContainerRef} className="flex-1 flex overflow-hidden min-h-0">

            {/* ── 왼쪽 패널 (항상 표시) ──────────── */}
            <div
              className="overflow-y-auto min-w-0"
              style={{ flex: splitPageId ? `${splitRatio * 100} 1 0%` : '1 1 0%' }}
            >
              {dbViewActive ? (
                <DatabaseView onClose={() => setDbViewActive(false)} />
              ) : currentPageId ? (
                <PageEditor pageId={currentPageId} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p>왼쪽에서 메모를 선택하세요</p>
                </div>
              )}
            </div>

            {/* ── 드래그 리사이즈 핸들 (스플릿 시만 표시) ── */}
            {/* Python으로 치면: if split_page_id: render ResizeHandle() */}
            {splitPageId && (
              <div
                onMouseDown={handleSplitResizeStart}
                className="w-px shrink-0 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors"
                title="드래그하여 크기 조절"
              />
            )}

            {/* ── 오른쪽 패널 (스플릿 시만 표시) ─── */}
            {/* Python으로 치면: if split_page_id: render RightPane(split_page_id) */}
            {splitPageId && (() => {
              const splitPage = pages.find(p => p.id === splitPageId)
              return (
                <div
                  className="flex flex-col min-w-0 border-l border-gray-200"
                  style={{ flex: `${(1 - splitRatio) * 100} 1 0%` }}
                >
                  {/* 오른쪽 패널 헤더: 페이지 제목 + 닫기 버튼 */}
                  {/* Python으로 치면: HBox([icon, title, close_btn]) */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0">
                    <span className="text-sm shrink-0">{splitPage?.icon || '📄'}</span>
                    <span className="text-xs font-medium text-gray-600 truncate flex-1">
                      {splitPage?.title || '제목 없음'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSplitPageId(null)}
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="분할 뷰 닫기 (Ctrl+\)"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {/* 오른쪽 패널 에디터 */}
                  <div className="flex-1 overflow-y-auto">
                    <PageEditor pageId={splitPageId} />
                  </div>
                </div>
              )
            })()}
          </div>

          {/* 하단 고정 바: 너비 슬라이더 + 단어수 (에디터 뷰 + 페이지 선택 시만 표시) */}
          {/* Python으로 치면: if not db_view_active and current_page_id: render BottomBar(current_page_id) */}
          {!dbViewActive && currentPageId && <BottomBar pageId={currentPageId} />}
        </main>

        {/* ── 포모도로 타이머 위젯 (pomodoro 플러그인 ON 시만 표시) ──
            fixed 포지션으로 화면 우측 하단에 플로팅
            Python으로 치면: if plugins.pomodoro: render PomodoroWidget() */}
        {plugins.pomodoro && <PomodoroWidget />}

        {/* ── ? 단축키 안내 버튼 (우측 하단 고정) ──────
            Pomodoro 위젯 위쪽에 위치 (bottom-5 vs bottom-16)
            Python으로 치면: self.help_btn = QPushButton('?'); self.help_btn.move(right, bottom) */}
        <button
          type="button"
          onClick={() => setShortcutOpen(true)}
          className="absolute bottom-12 right-5 w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-800 text-sm font-bold flex items-center justify-center shadow-sm transition-colors z-40"
          title="단축키 안내 (?)">
          ?
        </button>

        {/* ── 단축키 안내 모달 ───────────────────────── */}
        {shortcutOpen && (
          <ShortcutModal onClose={() => setShortcutOpen(false)} />
        )}

        {/* ── 설정 모달 ──────────────────────────────── */}
        {/* Python으로 치면: if settings_open: render(SettingsModal) */}
        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        )}

        {/* ── 빠른 노트 팝업 (Ctrl+Alt+N) ──────────────
            quickAdd 플러그인 ON 상태에서만 표시
            Python으로 치면: if quick_add_open and plugins.quick_add: render(QuickAddModal) */}
        {quickAddOpen && plugins.quickAdd && (
          <QuickAddModal onClose={() => setQuickAddOpen(false)} />
        )}

        {/* ── 전체 검색 팝업 (Ctrl+K) ────────────────────
            Python으로 치면: if search_open: render(GlobalSearch) */}
        {searchOpen && (
          <GlobalSearch onClose={() => setSearchOpen(false)} />
        )}

        {/* ── 커맨드 팔레트 (Ctrl+P) ─────────────────────
            페이지 이동 + 빠른 액션 클라이언트 사이드 검색
            Python으로 치면: if command_palette_open: render(CommandPalette) */}
        {commandPaletteOpen && (
          <CommandPalette
            onClose={() => setCommandPaletteOpen(false)}
            onOpenSettings={() => { setCommandPaletteOpen(false); setSettingsOpen(true) }}
            onOpenShortcuts={() => { setCommandPaletteOpen(false); setShortcutOpen(true) }}
            onOpenSearch={() => { setCommandPaletteOpen(false); setSearchOpen(true) }}
          />
        )}

      </div>
    </DndContext>
  )
}
