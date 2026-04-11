// =============================================
// src/app/page.tsx
// 역할: 앱의 진입점 — 3패널 레이아웃 (카테고리 | 페이지 목록 | 에디터)
// Python으로 치면: if __name__ == "__main__": main()
// =============================================

'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { usePageStore } from '@/store/pageStore'
import { saveTimers } from '@/store/pageStoreHelpers'
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
import GraphView from '@/components/editor/GraphView'
import TrashPanel from '@/components/editor/TrashPanel'
import GlobalAIChatButton from '@/components/ai/GlobalAIChatButton'
import CalendarOverlay from '@/components/editor/CalendarOverlay'
import DayPlannerPanel from '@/components/editor/DayPlannerPanel'
import { X } from 'lucide-react'
import { useLocale } from '@/locales'

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

  // 로케일 훅
  const t = useLocale()

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

  // 그래프 뷰 오버레이 열림 여부 (Ctrl+G)
  // Python으로 치면: self.graph_view_open = False
  const [graphViewOpen, setGraphViewOpen] = useState(false)

  // 전체 캘린더 오버레이 열림 여부 (Ctrl+Shift+C)
  // Python으로 치면: self.calendar_open = False
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Day Planner 패널 열림 여부 (Ctrl+Shift+D)
  // Python으로 치면: self.day_planner_open = False
  const [dayPlannerOpen, setDayPlannerOpen] = useState(false)

  // 휴지통 패널 열림 여부
  // Python으로 치면: self.trash_open = False
  const [trashOpen, setTrashOpen] = useState(false)

  // ── 스플릿 뷰 상태 ─────────────────────────────
  // splitPageId: 오른쪽 패널에 표시할 페이지 ID (null = 스플릿 없음)
  // splitRatio: 왼쪽:오른쪽 비율 (0.2~0.8, 기본 0.5)
  // Python으로 치면: self.split_page_id = None; self.split_ratio = 0.5
  const [splitPageId, setSplitPageId] = useState<string | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  // 스플릿 드래그 중 mousemove 핸들러 ref — 언마운트 시 좀비 리스너 방지
  const splitMoveRef = useRef<((e: MouseEvent) => void) | null>(null)

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
    splitMoveRef.current = onMove  // 언마운트 cleanup용 참조 저장
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMove)
      splitMoveRef.current = null
    }, { once: true })
  }

  // 언마운트 시 스플릿 드래그 리스너 정리 — 드래그 중 페이지 이동 등으로 좀비 리스너 방지
  // Python으로 치면: def __del__(self): detach(self._split_move_handler)
  useEffect(() => () => {
    if (splitMoveRef.current) {
      document.removeEventListener('mousemove', splitMoveRef.current)
      splitMoveRef.current = null
    }
  }, [])

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
    categories,
    openTabs,
    categoryOrder,
    categoryChildOrder,
    setCurrentPage,
    setOpenTabs,
    addPage,
    updatePageIcon,
    setPageBlocks,
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
  // Web Notification 알림 스케줄러용 reminder 목록 메모이제이션
  // pages 전체 배열을 effect deps로 쓰면 매 저장마다 순회 발생 →
  // reminder=true 인 date 속성만 추출해 문자열로 직렬화 후 비교
  // Python으로 치면: reminder_keys = [(p.id, prop.id, prop.value) for p in pages for prop in p.properties if prop.reminder]
  // -----------------------------------------------
  const reminderKey = useMemo(() => {
    if (pages.length === 0) return ''
    return pages
      .flatMap(p =>
        (p.properties ?? [])
          .filter(prop => prop.type === 'date' && prop.reminder && prop.value)
          .map(prop => `${p.id}:${prop.id}:${prop.value}`)
      )
      .join('|')
  }, [pages])

  // -----------------------------------------------
  // Web Notification 알림 스케줄러
  // reminderKey 변경 시(=reminder 속성 추가/수정 시)만 실행 — 일반 편집 저장 시 불필요한 순회 방지
  // Python으로 치면: def schedule_reminders(self): ...
  // -----------------------------------------------
  useEffect(() => {
    if (!reminderKey) return

    // 브라우저 Notification API 지원 확인
    // Python으로 치면: if not hasattr(window, 'Notification'): return
    if (typeof Notification === 'undefined') return

    const todayStr = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
    // 이미 알림된 항목 ID 집합 (새로고침 후 중복 방지)
    // Python으로 치면: notified = set(json.loads(localStorage['notion-clone-notified']))
    const notifiedRaw = localStorage.getItem('notion-clone-notified')
    const notified = new Set<string>(notifiedRaw ? JSON.parse(notifiedRaw) : [])

    // reminder=true + 날짜가 오늘이거나 이미 지난 속성 탐색
    // Python으로 치면: targets = [(page, prop) for page in pages for prop in page.properties if prop.reminder and prop.value <= today]
    const targets: { pageTitle: string; propName: string; propId: string }[] = []
    for (const page of pages) {
      for (const prop of page.properties ?? []) {
        if (prop.type !== 'date' || !prop.reminder || !prop.value) continue
        if (prop.value > todayStr) continue // 미래 날짜는 건너뜀
        const notifyKey = `${page.id}:${prop.id}:${prop.value}`
        if (notified.has(notifyKey)) continue // 이미 알림됨
        targets.push({ pageTitle: page.title, propName: prop.name, propId: notifyKey })
      }
    }

    if (targets.length === 0) return

    // Notification 권한 요청 → 알림 발송
    // Python으로 치면: Notification.requestPermission().then(lambda p: send_if_granted(p))
    Notification.requestPermission().then(permission => {
      if (permission !== 'granted') return
      for (const t of targets) {
        new Notification(`📅 ${t.pageTitle}`, {
          body: `${t.propName} 알림`,
          icon: '/favicon.ico',
        })
        notified.add(t.propId)
      }
      // 알림된 항목 저장 (최대 500개 유지)
      const arr = [...notified].slice(-500)
      localStorage.setItem('notion-clone-notified', JSON.stringify(arr))
    })
  }, [reminderKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // ISO 8601 주차 계산 헬퍼 (1월 첫째 목요일이 속한 주 = 1주)
  // Python으로 치면: date.isocalendar()[1]
  // -----------------------------------------------
  function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7)
  }

  // -----------------------------------------------
  // 오늘의 일간 노트를 열거나 없으면 템플릿으로 생성
  // 제목 형식: "일간 노트 YYYY-MM-DD" / 아이콘: 📅
  // useCallback: categories/pages가 바뀔 때 핸들러 갱신 (스테일 클로저 방지)
  // Python으로 치면: async def open_daily_note(self): ...
  // -----------------------------------------------
  const openDailyNote = useCallback(async () => {
    const today = new Date()
    const yy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const title = `일간 노트 ${yy}-${mm}-${dd}`

    // 기존 페이지 중 동일 제목 검색
    const existing = pages.find(p => p.title === title)
    if (existing) {
      setCurrentPage(existing.id)
      return
    }

    // 전용 카테고리 찾기 (loadFromServer에서 자동 생성됨)
    const cat = categories.find(c => c.name === '📅 일간 노트')

    // 새 페이지 생성 (addPage가 currentPageId를 새 페이지로 설정)
    await addPage(title, cat?.id ?? null)

    // 생성 직후 store에서 새 페이지 ID 가져오기
    // Python으로 치면: new_page_id = page_store.current_page_id
    const newId = usePageStore.getState().currentPageId
    if (!newId) return

    // 아이콘 변경 + 템플릿 블록 적용
    updatePageIcon(newId, '📅')
    setPageBlocks(newId, [
      { id: crypto.randomUUID(), type: 'heading1', content: title, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'divider', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.dailyTodo, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'taskList', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.dailyMemo, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'paragraph', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ])
  }, [pages, categories, addPage, updatePageIcon, setPageBlocks, setCurrentPage, t]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 이번 주 주간 노트를 열거나 없으면 템플릿으로 생성
  // 제목 형식: "주간 노트 YYYY-WNN" / 아이콘: 📆
  // Python으로 치면: async def open_weekly_note(self): ...
  // -----------------------------------------------
  const openWeeklyNote = useCallback(async () => {
    const today = new Date()
    const yy = today.getFullYear()
    const ww = String(getISOWeek(today)).padStart(2, '0')
    const title = `주간 노트 ${yy}-W${ww}`

    const existing = pages.find(p => p.title === title)
    if (existing) {
      setCurrentPage(existing.id)
      return
    }

    const cat = categories.find(c => c.name === '📆 주간 노트')
    await addPage(title, cat?.id ?? null)

    const newId = usePageStore.getState().currentPageId
    if (!newId) return

    updatePageIcon(newId, '📆')
    setPageBlocks(newId, [
      { id: crypto.randomUUID(), type: 'heading1', content: title, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'divider', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.weeklyGoal, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'paragraph', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.weeklyReview, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'paragraph', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ])
  }, [pages, categories, addPage, updatePageIcon, setPageBlocks, setCurrentPage, t]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [plugins.periodicNotes, openDailyNote])

  // -----------------------------------------------
  // Ctrl+Alt+W 단축키 → 이번 주 주간 노트 열기/생성
  // periodicNotes 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'w': open_weekly_note()
  // -----------------------------------------------
  useEffect(() => {
    function handleWeeklyKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'w' && plugins.periodicNotes) {
        e.preventDefault()
        openWeeklyNote()
      }
    }
    window.addEventListener('keydown', handleWeeklyKey)
    return () => window.removeEventListener('keydown', handleWeeklyKey)
  }, [plugins.periodicNotes, openWeeklyNote])

  // -----------------------------------------------
  // 이번 달 월간 노트를 열거나 없으면 템플릿으로 생성
  // 제목 형식: "월간 노트 YYYY-MM" / 아이콘: 🗓️
  // Python으로 치면: async def open_monthly_note(self): ...
  // -----------------------------------------------
  const openMonthlyNote = useCallback(async () => {
    const today = new Date()
    const yy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const title = `월간 노트 ${yy}-${mm}`

    const existing = pages.find(p => p.title === title)
    if (existing) {
      setCurrentPage(existing.id)
      return
    }

    const cat = categories.find(c => c.name === '🗓️ 월간 노트')
    await addPage(title, cat?.id ?? null)

    const newId = usePageStore.getState().currentPageId
    if (!newId) return

    updatePageIcon(newId, '🗓️')
    setPageBlocks(newId, [
      { id: crypto.randomUUID(), type: 'heading1', content: title, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'divider', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.monthlyGoal, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'paragraph', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.monthlyNotes, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'paragraph', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'heading2', content: t.overlay.periodic.monthlyReview, children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: crypto.randomUUID(), type: 'paragraph', content: '', children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ])
  }, [pages, categories, addPage, updatePageIcon, setPageBlocks, setCurrentPage, t]) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // Ctrl+Alt+M 단축키 → 이번 달 월간 노트 열기/생성
  // periodicNotes 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'm': open_monthly_note()
  // -----------------------------------------------
  useEffect(() => {
    function handleMonthlyKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'm' && plugins.periodicNotes) {
        e.preventDefault()
        openMonthlyNote()
      }
    }
    window.addEventListener('keydown', handleMonthlyKey)
    return () => window.removeEventListener('keydown', handleMonthlyKey)
  }, [plugins.periodicNotes, openMonthlyNote])

  // -----------------------------------------------
  // Ctrl+Shift+R → 읽기 모드 토글 (PageEditor에 CustomEvent 발행)
  // Python으로 치면: def on_key_down(e): if ctrl+shift+r: emit('toggle-read-mode')
  // -----------------------------------------------
  useEffect(() => {
    function handleReadModeKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-read-mode'))
      }
    }
    window.addEventListener('keydown', handleReadModeKey)
    return () => window.removeEventListener('keydown', handleReadModeKey)
  }, [])

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
  // 탭 숨김/페이지 닫기 시 미저장 데이터 즉시 flush
  // HMR 전체 리로드 or 탭 닫기 시 500ms 디바운스 타이머 만료 전
  // 데이터가 유실되는 것을 방지 (DayPlannerBlock 등 이벤트 데이터 보호)
  // Python으로 치면: window.on('beforeunload', lambda: flush_all_saves())
  // -----------------------------------------------
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        // saveTimers에 대기 중인 pageId를 즉시 flush
        // Python으로 치면: for page_id in pending_timers: save_now(page_id)
        Array.from(saveTimers.keys()).forEach(pageId => {
          usePageStore.getState().savePageNow(pageId).catch(() => {})
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 세션 저장 — 탭/스플릿 상태 변경 시 localStorage에 기록
  // Python으로 치면: def on_state_change(): local_storage.save(session)
  // -----------------------------------------------
  useEffect(() => {
    if (openTabs.length === 0) return
    try {
      localStorage.setItem('notion-clone-session', JSON.stringify({
        openTabs,
        currentPageId,
        splitPageId,
        splitRatio,
      }))
    } catch {}
  }, [openTabs, currentPageId, splitPageId, splitRatio])

  // -----------------------------------------------
  // 세션 복원 — pages 최초 로드 후 1회 실행
  // 삭제된 페이지 ID는 필터링 후 유효한 것만 복원
  // Python으로 치면: def restore_session(): if not restored: load_from_storage()
  // -----------------------------------------------
  const sessionRestoredRef = useRef(false)
  useEffect(() => {
    if (pages.length === 0 || sessionRestoredRef.current) return
    sessionRestoredRef.current = true
    try {
      const raw = localStorage.getItem('notion-clone-session')
      if (!raw) return
      const session = JSON.parse(raw) as {
        openTabs: string[]
        currentPageId: string | null
        splitPageId: string | null
        splitRatio: number
      }
      const pageIds = new Set(pages.map(p => p.id))

      // 유효한 탭만 복원 (삭제된 페이지 제외)
      const validTabs = (session.openTabs ?? []).filter(id => pageIds.has(id))
      if (validTabs.length > 0) setOpenTabs(validTabs)

      // 마지막 활성 페이지 복원 — setOpenTabs 이후에 호출해야 중복 탭 방지
      // Python으로 치면: if session.current_page_id in page_ids: self.current_page = session.current_page_id
      if (session.currentPageId && pageIds.has(session.currentPageId)) {
        setCurrentPage(session.currentPageId)
      }

      // 스플릿 뷰 복원 — ?? 는 NaN을 통과시키므로 Number.isFinite로 명시 검사
      // Python으로 치면: ratio = r if isinstance(r, float) and r == r else 0.5
      if (session.splitPageId && pageIds.has(session.splitPageId)) {
        setSplitPageId(session.splitPageId)
        setSplitRatio(Number.isFinite(session.splitRatio) ? session.splitRatio : 0.5)
      }
    } catch {}
  }, [pages.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // Ctrl+G 단축키 → 그래프 뷰 오버레이 열기/닫기
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.ctrl and e.key == 'g': toggle_graph_view()
  // -----------------------------------------------
  useEffect(() => {
    function handleGraphKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setGraphViewOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleGraphKey)
    return () => window.removeEventListener('keydown', handleGraphKey)
  }, [])

  // -----------------------------------------------
  // Ctrl+Shift+C 단축키 → 전체 캘린더 오버레이 열기/닫기
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.ctrl and e.shift and e.key == 'c': toggle_calendar()
  // -----------------------------------------------
  useEffect(() => {
    function handleCalendarKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setCalendarOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleCalendarKey)
    return () => window.removeEventListener('keydown', handleCalendarKey)
  }, [])

  // -----------------------------------------------
  // Ctrl+Shift+D 단축키 → Day Planner 패널 ON/OFF
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.ctrl and e.shift and e.key == 'd': toggle_day_planner()
  // -----------------------------------------------
  useEffect(() => {
    function handleDayPlannerKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setDayPlannerOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleDayPlannerKey)
    return () => window.removeEventListener('keydown', handleDayPlannerKey)
  }, [])

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
      // pageId가 실제로 존재하는지 확인 (타입 단언 대신 런타임 검사)
      // Python으로 치면: if page_id := active.data.get('pageId'): move(page_id, target)
      const pageId = active.data.current?.pageId
      if (pageId) {
        movePageToCategory(pageId as string, targetCategoryId)
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
      <div id="app-layout" className="flex h-screen bg-[#fcf9f8] dark:bg-[#191919] overflow-hidden relative">

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
              onOpenGraphView={() => setGraphViewOpen(true)}
              onOpenTrash={() => setTrashOpen(true)}
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
            title={t.sidebar.menuToggle}
          >
            ☰
          </button>
        )}

        {/* ── 에디터 패널 ──────────────────────────
            flex-col: TabBar + 에디터 + BottomBar를 세로로 배치
            min-h-0: flex-col 자식이 넘치지 않도록 최소 높이 제한
            Python으로 치면: main_panel = VBox([tab_bar, scrollable_area, bottom_bar]) */}
        <main className="flex-1 flex flex-col min-h-0 pt-14 md:pt-0 bg-[#fcf9f8] dark:bg-[#191919]">
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
            {/* split-left-panel: @media print에서 전체 너비로 강제 확장 */}
            <div
              className="overflow-y-auto min-w-0 split-left-panel"
              style={{ flexGrow: splitPageId ? splitRatio * 100 : 1, flexShrink: 1, flexBasis: '0%' }}
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
                className="w-px shrink-0 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors print-hide"
                title={t.sidebar.splitViewResize}
              />
            )}

            {/* ── 오른쪽 패널 (스플릿 시만 표시) ─── */}
            {/* Python으로 치면: if split_page_id: render RightPane(split_page_id) */}
            {splitPageId && (() => {
              const splitPage = pages.find(p => p.id === splitPageId)
              return (
                <div
                  className="flex flex-col min-w-0 border-l border-gray-200 print-hide"
                  style={{ flex: `${(1 - splitRatio) * 100} 1 0%` }}
                >
                  {/* 오른쪽 패널 헤더: 페이지 제목 + 닫기 버튼 */}
                  {/* Python으로 치면: HBox([icon, title, close_btn]) */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0">
                    <span className="text-sm shrink-0">{splitPage?.icon || '📄'}</span>
                    <span className="text-xs font-medium text-gray-600 truncate flex-1">
                      {splitPage?.title || t.common.untitled}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSplitPageId(null)}
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title={t.sidebar.splitViewClose}
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

        {/* ── Day Planner 패널 (Ctrl+Shift+D) ──────────
            에디터 오른쪽에 나란히 붙는 인라인 패널
            본문 작성하면서 오늘 일정을 항상 확인 가능
            Python으로 치면: if day_planner_open: render(DayPlannerPanel) */}
        {dayPlannerOpen && !isFocusMode && (
          <DayPlannerPanel onClose={() => setDayPlannerOpen(false)} />
        )}

        {/* ── 포모도로 타이머 위젯 (pomodoro 플러그인 ON 시만 표시) ──
            fixed 포지션으로 화면 우측 하단에 플로팅
            Python으로 치면: if plugins.pomodoro: render PomodoroWidget() */}
        {plugins.pomodoro && <PomodoroWidget />}

        {/* ── 전역 AI 어시스턴트 플로팅 버튼 ────────────
            globalAiChat 플러그인 ON 시 우하단에 🤖 버튼 표시
            클릭 시 AIChatPanel(floating) 토글 — 현재 페이지 컨텍스트 자동 주입
            Python으로 치면: if plugins.global_ai_chat: render GlobalAIChatButton() */}
        {plugins.globalAiChat && <GlobalAIChatButton />}

        {/* ── ? 단축키 안내 버튼 (우측 하단 고정) ──────
            Pomodoro 위젯 위쪽에 위치 (bottom-5 vs bottom-16)
            Python으로 치면: self.help_btn = QPushButton('?'); self.help_btn.move(right, bottom) */}
        <button
          type="button"
          onClick={() => setShortcutOpen(true)}
          className="absolute bottom-12 right-5 w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-800 text-sm font-bold flex items-center justify-center shadow-sm transition-colors z-40"
          title={t.sidebar.shortcutHelp}>
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
            onOpenCalendar={() => { setCommandPaletteOpen(false); setCalendarOpen(true) }}
          />
        )}

        {/* ── 그래프 뷰 오버레이 (Ctrl+G) ──────────────
            전체 화면으로 페이지 링크 관계를 노드 그래프로 표시
            Python으로 치면: if graph_view_open: render(GraphView) */}
        {graphViewOpen && (
          <GraphView onClose={() => setGraphViewOpen(false)} />
        )}

        {/* ── 휴지통 패널 ────────────────────────────
            삭제된 페이지/폴더 목록 + 복원/영구삭제
            Python으로 치면: if trash_open: render(TrashPanel) */}
        {trashOpen && (
          <TrashPanel onClose={() => setTrashOpen(false)} />
        )}

        {/* ── 전체 캘린더 오버레이 (Ctrl+Shift+C) ─────
            vault 전체 date 속성 페이지를 월간/주간/일간 뷰로 표시
            Python으로 치면: if calendar_open: render(CalendarOverlay) */}
        {calendarOpen && (
          <CalendarOverlay onClose={() => setCalendarOpen(false)} />
        )}


      </div>
    </DndContext>
  )
}
