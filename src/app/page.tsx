// =============================================
// src/app/page.tsx
// 역할: 앱의 진입점 — 3패널 레이아웃 (카테고리 | 페이지 목록 | 에디터)
// Python으로 치면: if __name__ == "__main__": main()
// =============================================

'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { usePageStore } from '@/store/pageStore'
import { saveTimers } from '@/store/pageStoreHelpers'
import { useSettingsStore } from '@/store/settingsStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import CategorySidebar from '@/components/editor/CategorySidebar'
import VaultRail from '@/components/sidebar/VaultRail'
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
import { Folder, X } from 'lucide-react'
import { useLocale } from '@/locales'
import { openOrCreateDailyNote } from '@/lib/dailyNotes'
import type { CategoryDropPosition } from '@/components/sidebar/CategoryRow'

// dnd-kit: 카테고리 정렬 + 페이지→카테고리 드래그를 하나의 DndContext로 관리
// Python으로 치면: from dnd import DndContext
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  closestCenter,
} from '@dnd-kit/core'

function getCategoryDropPosition(event: DragOverEvent | DragEndEvent): CategoryDropPosition {
  const pointerEvent = event.activatorEvent as PointerEvent
  let startY = typeof pointerEvent.clientY === 'number' ? pointerEvent.clientY : null

  if (startY === null) {
    const touchEvent = event.activatorEvent as TouchEvent
    const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0]
    startY = touch?.clientY ?? null
  }

  if (startY === null || !event.over || event.over.rect.height <= 0) return 'inside'

  const pointerY = startY + event.delta.y
  const ratio = (pointerY - event.over.rect.top) / event.over.rect.height
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

function insertCategoryRelative(
  order: string[],
  activeId: string,
  overId: string,
  position: Exclude<CategoryDropPosition, 'inside'>,
): string[] {
  const nextOrder = order.filter(id => id !== activeId)
  const overIndex = nextOrder.indexOf(overId)
  if (overIndex === -1) return order
  nextOrder.splice(overIndex + (position === 'after' ? 1 : 0), 0, activeId)
  return nextOrder
}

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
  // mouseup 핸들러 ref — 드래그 도중 언마운트 시 document.mouseup 리스너도 함께 제거
  const splitMouseUpRef = useRef<(() => void) | null>(null)
  // 메인 에디터 스크롤 컨테이너 ref — 페이지 전환 시 스크롤 위치 복원에 사용
  // Python으로 치면: self.editor_scroll = QScrollArea()
  const editorScrollRef = useRef<HTMLDivElement>(null)
  // 페이지별 스크롤 위치 저장 맵 (세션 내 유지, 새로 방문하는 페이지는 0)
  // Python으로 치면: self._scroll_positions: dict[str, int] = {}
  const scrollPositions = useRef<Map<string, number>>(new Map())
  // 이전 pageId 추적 — 떠나기 전 scrollTop 저장용
  // Python으로 치면: self._prev_page_id: str | None = None
  const prevPageIdRef = useRef<string | null>(null)

  // 플러그인 설정 + 집중 모드 + 초기 스타일 복원용 값 — 단일 구독으로 통합
  // Python으로 치면: plugins, is_focus_mode, theme, ... = settings.__dict__
  const { plugins, isFocusMode, toggleFocusMode, loadRoutinesFromFile } = useSettingsStore()

  // 사이드바 메모 드래그 미리보기용 active page id
  // Python으로 치면: active_drag_page_id: str | None = None
  const [activeDragPageId, setActiveDragPageId] = useState<string | null>(null)
  const [activeDragPageCount, setActiveDragPageCount] = useState(1)
  const [activeDragCategoryId, setActiveDragCategoryId] = useState<string | null>(null)
  const [categoryDropIndicator, setCategoryDropIndicator] = useState<{
    categoryId: string
    position: CategoryDropPosition
  } | null>(null)

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
  // useCallback([]): splitContainerRef/splitMoveRef/splitMouseUpRef는 ref(stable), setSplitRatio는 setter(stable)
  // Python으로 치면: @cached_property def handle_split_resize_start(self): ...
  const handleSplitResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // 이전 드래그 중 mousedown이 재발생하면 이전 리스너 누출 방지 — 덮어쓰기 전 명시적 제거
    if (splitMoveRef.current) {
      document.removeEventListener('mousemove', splitMoveRef.current)
      splitMoveRef.current = null
    }
    if (splitMouseUpRef.current) {
      document.removeEventListener('mouseup', splitMouseUpRef.current)
      splitMouseUpRef.current = null
    }
    const onMove = (ev: MouseEvent) => {
      const rect = splitContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      setSplitRatio(Math.max(0.2, Math.min(0.8, (ev.clientX - rect.left) / rect.width)))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMove)
      splitMoveRef.current = null
      splitMouseUpRef.current = null
    }
    splitMoveRef.current = onMove          // mousemove cleanup용 참조 저장
    splitMouseUpRef.current = onMouseUp   // mouseup cleanup용 참조 저장
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onMouseUp, { once: true })
  }, [])

  // 언마운트 시 스플릿 드래그 리스너 정리 — 드래그 중 페이지 이동 등으로 좀비 리스너 방지
  // mouseup 리스너도 함께 제거해 { once: true } 콜백이 메모리에 남지 않도록 처리
  // Python으로 치면: def __del__(self): detach(self._split_move_handler); detach(self._split_mouseup_handler)
  useEffect(() => () => {
    if (splitMoveRef.current) {
      document.removeEventListener('mousemove', splitMoveRef.current)
      splitMoveRef.current = null
    }
    if (splitMouseUpRef.current) {
      document.removeEventListener('mouseup', splitMouseUpRef.current)
      splitMouseUpRef.current = null
    }
  }, [])

  // -----------------------------------------------
  // 앱 초기화 시 저장된 테마 + 편집기 스타일 복원
  // -----------------------------------------------
  // 클라이언트 마운트 시 localStorage에서 설정 복원 (skipHydration: true 사용 중)
  // SSR 환경에서 localStorage 접근을 막고 클라이언트에서만 명시적으로 hydrate
  // onRehydrateStorage 콜백이 DOM 적용까지 처리함
  // Python으로 치면: def on_mount(self): self.settings.load(); self.apply_settings()
  // -----------------------------------------------
  useEffect(() => {
    async function hydrateSettings() {
      // v1까지 localStorage에 저장되던 AI 키를 Electron의 OS 암호화 저장소로
      // 먼저 옮긴 뒤 v2 설정 마이그레이션이 평문 값을 제거하도록 한다.
      try {
        const raw = localStorage.getItem('notion-clone-settings')
        const legacyState = raw ? JSON.parse(raw)?.state : undefined
        const setSecret = window.electronAPI?.setSecret
        if (legacyState && setSecret) {
          const legacyOpenai = String(legacyState.openaiApiKey || legacyState.aiApiKey || '')
          const legacyAnthropic = String(legacyState.anthropicApiKey || '')
          if (legacyOpenai) await setSecret('openai', legacyOpenai)
          if (legacyAnthropic) await setSecret('anthropic', legacyAnthropic)
        }
      } catch {
        // 손상된 구 설정이나 사용할 수 없는 OS 저장소가 앱 시작을 막지 않게 한다.
      }

      await useSettingsStore.persist.rehydrate()

      const getSecret = window.electronAPI?.getSecret
      if (getSecret) {
        try {
          const [openaiApiKey, anthropicApiKey] = await Promise.all([
            getSecret('openai'),
            getSecret('anthropic'),
          ])
          useSettingsStore.setState({
            openaiApiKey: openaiApiKey ?? '',
            anthropicApiKey: anthropicApiKey ?? '',
            aiApiKey: '',
          })
        } catch {
          // 키 읽기 실패 시 빈 메모리 값으로 유지한다.
        }
      }
    }

    void hydrateSettings()
    // vault 파일에서 루틴 로드 (localStorage보다 파일 우선)
    // 백엔드 미실행 시 기존 localStorage 값 유지 (내부에서 catch 처리됨)
    // Python으로 치면: self.settings.load_routines_from_file()
  }, [])

  // -----------------------------------------------
  // 스토어에서 필요한 상태와 액션 가져오기
  // -----------------------------------------------
  const {
    currentVaultName,
    currentPageId,
    pages,
    categories,
    categoryMap,
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
  const isDailyPlannerVault = useVaultPreferencesStore(
    state => state.preferences.planner.mode === 'daily',
  )
  const isPostitRecordVault = useVaultPreferencesStore(
    state => state.preferences.planner.mode === 'daily'
      && state.preferences.planner.dailyNoteTemplate === 'postit',
  )

  // Routines are stored per vault, so reload them after the active vault is known.
  useEffect(() => {
    if (currentVaultName) void loadRoutinesFromFile()
  }, [currentVaultName, loadRoutinesFromFile])

  // 페이지 전환 시: 이전 페이지 스크롤 위치 저장 → 새 페이지 스크롤 위치 복원
  // 처음 방문하는 페이지는 0(맨 위), 이전에 읽던 페이지는 저장된 위치로 복원
  // Python으로 치면:
  //   def on_page_change(new_id):
  //     self._scroll_positions[prev_id] = self.editor_scroll.scrollTop()
  //     self.editor_scroll.scrollTo(self._scroll_positions.get(new_id, 0))
  useEffect(() => {
    // 이전 페이지 스크롤 위치 저장
    if (prevPageIdRef.current && editorScrollRef.current) {
      scrollPositions.current.set(prevPageIdRef.current, editorScrollRef.current.scrollTop)
    }
    prevPageIdRef.current = currentPageId

    if (!editorScrollRef.current || !currentPageId) return

    // 저장된 스크롤 위치 복원 (처음 방문이면 0)
    // 이중 RAF: 첫 번째 RAF는 React 리렌더 직후, 두 번째는 Tiptap 초기화 포함한 레이아웃 완료 후
    // 단일 RAF만 쓰면 key 교체 후 Tiptap이 아직 마운트되지 않아 scrollTop이 0으로 리셋될 수 있음
    const saved = scrollPositions.current.get(currentPageId) ?? 0
    let innerRafId = 0  // 0: outer RAF 캔슬 시 inner는 미실행 → cancelAnimationFrame(0)은 no-op
    const outerRafId = requestAnimationFrame(() => {
      innerRafId = requestAnimationFrame(() => {
        if (editorScrollRef.current) editorScrollRef.current.scrollTop = saved
      })
    })
    return () => {
      cancelAnimationFrame(outerRafId)
      cancelAnimationFrame(innerRafId)
    }
  }, [currentPageId])

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
    // JSON.parse 실패(손상된 localStorage) 시 빈 Set으로 폴백
    // Python으로 치면: notified = set(json.loads(raw)) if raw else set()
    let notified: Set<string>
    try {
      notified = new Set<string>(notifiedRaw ? JSON.parse(notifiedRaw) : [])
    } catch {
      notified = new Set<string>()
    }

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
    // target: 외부 스코프의 로케일 변수 t와 충돌하지 않도록 루프 변수명을 target으로 변경
    Notification.requestPermission().then(permission => {
      if (permission !== 'granted') return
      for (const target of targets) {
        new Notification(`📅 ${target.pageTitle}`, {
          body: t.property.reminderNotify.replace('{propName}', target.propName),
          icon: '/favicon.ico',
        })
        notified.add(target.propId)
      }
      // 알림된 항목 저장 (최대 500개 유지)
      const arr = [...notified].slice(-500)
      localStorage.setItem('notion-clone-notified', JSON.stringify(arr))
    })
  }, [reminderKey, t]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // 공통 생성 경로로 오늘의 일간 노트를 열거나 생성한다.
  // Python으로 치면: async def open_daily_note(self): ...
  // -----------------------------------------------
  const openDailyNote = useCallback(async () => {
    const today = new Date()
    const yy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    await openOrCreateDailyNote(`${yy}-${mm}-${dd}`)
  }, [])

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
  }, [pages, categories, addPage, updatePageIcon, setPageBlocks, setCurrentPage, t])

  // -----------------------------------------------
  // Ctrl+Alt+D 단축키 → 오늘의 일간 노트 열기/생성 (Periodic Notes)
  // periodicNotes 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'd': open_daily_note()
  // -----------------------------------------------
  useEffect(() => {
    function handleDailyKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd' && plugins.periodicNotes && isDailyPlannerVault) {
        e.preventDefault()
        openDailyNote()
      }
    }
    window.addEventListener('keydown', handleDailyKey)
    return () => window.removeEventListener('keydown', handleDailyKey)
  }, [plugins.periodicNotes, isDailyPlannerVault, openDailyNote])

  // -----------------------------------------------
  // Ctrl+Alt+W 단축키 → 이번 주 주간 노트 열기/생성
  // periodicNotes 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'w': open_weekly_note()
  // -----------------------------------------------
  useEffect(() => {
    function handleWeeklyKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'w' && plugins.periodicNotes && isDailyPlannerVault && !isPostitRecordVault) {
        e.preventDefault()
        openWeeklyNote()
      }
    }
    window.addEventListener('keydown', handleWeeklyKey)
    return () => window.removeEventListener('keydown', handleWeeklyKey)
  }, [plugins.periodicNotes, isDailyPlannerVault, isPostitRecordVault, openWeeklyNote])

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
  }, [pages, categories, addPage, updatePageIcon, setPageBlocks, setCurrentPage, t])

  // -----------------------------------------------
  // Ctrl+Alt+M 단축키 → 이번 달 월간 노트 열기/생성
  // periodicNotes 플러그인이 OFF이면 무시
  // Python으로 치면:
  //   def on_key_down(event):
  //       if event.ctrl and event.alt and event.key == 'm': open_monthly_note()
  // -----------------------------------------------
  useEffect(() => {
    function handleMonthlyKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'm' && plugins.periodicNotes && isDailyPlannerVault) {
        e.preventDefault()
        if (isPostitRecordVault) openDailyNote()
        else openMonthlyNote()
      }
    }
    window.addEventListener('keydown', handleMonthlyKey)
    return () => window.removeEventListener('keydown', handleMonthlyKey)
  }, [plugins.periodicNotes, isDailyPlannerVault, isPostitRecordVault, openDailyNote, openMonthlyNote])

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

      // Inputs own their undo history. Do not let their Ctrl+Z reach the
      // page-level structural undo handler.
      if (
        e.target instanceof HTMLElement && (
          e.target.isContentEditable ||
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
      ) return

      const isUndo = e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z'
      const isRedo = e.ctrlKey && (
        (!e.shiftKey && e.key.toLowerCase() === 'y') ||
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
  }, [loadFromServer])

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
  }, [])

  // -----------------------------------------------
  // 세션 저장 — 탭/스플릿 상태 변경 시 localStorage에 기록
  // Python으로 치면: def on_state_change(): local_storage.save(session)
  // -----------------------------------------------
  useEffect(() => {
    // openTabs도 없고 currentPageId도 없으면 아직 초기화 전 → 저장 스킵
    // openTabs가 비어있어도 currentPageId나 splitRatio 변경은 저장해야 함
    if (openTabs.length === 0 && !currentPageId) return
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
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd' && isDailyPlannerVault) {
        e.preventDefault()
        setDayPlannerOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleDayPlannerKey)
    return () => window.removeEventListener('keydown', handleDayPlannerKey)
  }, [isDailyPlannerVault])

  // 플래너 역할이 해제되면 열려 있던 전용 패널도 즉시 닫는다.
  // Python으로 치면: if not is_daily_planner_vault: self.day_planner_open = False
  useEffect(() => {
    if (!isDailyPlannerVault) setDayPlannerOpen(false)
  }, [isDailyPlannerVault])

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

  const activeDragPage = activeDragPageId
    ? pages.find(page => page.id === activeDragPageId) ?? null
    : null
  const activeDragCategory = activeDragCategoryId
    ? categories.find(category => category.id === activeDragCategoryId) ?? null
    : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeType = event.active.data.current?.type as string | undefined
    if (activeType === 'page') {
      const pageId = event.active.data.current?.pageId
      if (pageId) {
        setActiveDragPageId(pageId as string)
        const bulkPageIds = event.active.data.current?.bulkPageIds
        setActiveDragPageCount(Array.isArray(bulkPageIds) && bulkPageIds.length > 0 ? bulkPageIds.length : 1)
      }
    } else if (activeType === 'category') {
      const categoryId = event.active.data.current?.categoryId
      if (typeof categoryId === 'string') setActiveDragCategoryId(categoryId)
    }
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeType = event.active.data.current?.type
    const over = event.over
    const overType = over?.data.current?.type
    if (activeType !== 'category' || overType !== 'category' || !over || event.active.id === over.id) {
      setCategoryDropIndicator(null)
      return
    }

    const nextIndicator = {
      categoryId: over.id as string,
      position: getCategoryDropPosition(event),
    }
    setCategoryDropIndicator(current => (
      current?.categoryId === nextIndicator.categoryId && current.position === nextIndicator.position
        ? current
        : nextIndicator
    ))
  }, [])

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
  // useCallback([categoryOrder, categoryChildOrder]): indexOf 계산에 배열 클로저 필요
  // Zustand 액션들(movePageToCategory 등)은 stable reference → deps 불필요
  // Python으로 치면: @lru_cache(lambda self: (self.category_order, self.child_order))
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragPageId(null)
    setActiveDragPageCount(1)
    setActiveDragCategoryId(null)
    setCategoryDropIndicator(null)
    if (!over) return

    const activeType = active.data.current?.type as string | undefined
    const overType = over.data.current?.type as string | undefined

    if (activeType === 'page' && overType === 'category') {
      // 페이지를 카테고리(또는 미분류=null)로 이동
      const targetCategoryId = over.data.current?.categoryId as string | null
      // pageId가 실제로 존재하는지 확인 (타입 단언 대신 런타임 검사)
      // Python으로 치면: if page_id := active.data.get('pageId'): move(page_id, target)
      const pageId = active.data.current?.pageId
      if (pageId) {
        const rawBulkPageIds = active.data.current?.bulkPageIds
        const bulkPageIds = Array.isArray(rawBulkPageIds)
          ? rawBulkPageIds.filter((id): id is string => typeof id === 'string')
          : []
        const selectedPageIds = bulkPageIds.length > 0 ? bulkPageIds : [pageId as string]
        // 이미 대상 카테고리에 있는 메모는 실제 이동·성공/실패 집계에서 제외한다.
        // 특히 미분류(null) 묶음 이동에서 no-op 응답을 이동 성공으로 세지 않게 한다.
        const pageIdsToMove = selectedPageIds.filter(
          pageIdToMove => (categoryMap[pageIdToMove] ?? null) !== targetCategoryId
        )
        const onBulkMoveComplete = active.data.current?.onBulkMoveComplete
        let successCount = 0
        // 실제 폴더와 index를 함께 바꾸므로 다중 이동은 순차 처리한다.
        for (const pageIdToMove of pageIdsToMove) {
          if (await movePageToCategory(pageIdToMove, targetCategoryId)) successCount += 1
        }
        if (typeof onBulkMoveComplete === 'function') {
          onBulkMoveComplete(successCount, pageIdsToMove.length)
        }
      }
    } else if (activeType === 'category' && overType === 'category' && active.id !== over.id) {
      // 가운데는 대상 폴더의 하위 이동, 위·아래 가장자리는 형제 순서 이동
      const activeParentId = (active.data.current?.parentId ?? null) as string | null
      const overParentId   = (over.data.current?.parentId   ?? null) as string | null
      const activeId = active.id as string
      const overId = over.id as string
      const dropPosition = getCategoryDropPosition(event)

      if (dropPosition === 'inside') {
        if (activeParentId !== overId) await moveCategoryToParent(activeId, overId)
      } else {
        const targetOrder = overParentId === null
          ? categoryOrder
          : (categoryChildOrder[overParentId] ?? [])
        const nextOrder = insertCategoryRelative(targetOrder, activeId, overId, dropPosition)

        if (activeParentId !== overParentId) {
          await moveCategoryToParent(activeId, overParentId)
        }
        if (overParentId === null) {
          reorderCategories(nextOrder)
        } else {
          reorderChildCategories(overParentId, nextOrder)
        }
      }
    } else if (
      activeType === 'page'
      && overType === 'page'
      && active.id !== over.id
      && !Array.isArray(active.data.current?.bulkPageIds)
    ) {
      // 메모 목록 내 순서 변경
      reorderPages(active.id as string, over.id as string)
    }
  }, [categoryMap, categoryOrder, categoryChildOrder, movePageToCategory, reorderCategories, reorderChildCategories, moveCategoryToParent, reorderPages])

  const handleDragCancel = useCallback(() => {
    setActiveDragPageId(null)
    setActiveDragPageCount(1)
    setActiveDragCategoryId(null)
    setCategoryDropIndicator(null)
  }, [])

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
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* 모바일 사이드바 오버레이 배경 — 탭하면 사이드바 닫힘
          md 이상(데스크탑)에서는 숨김
          Python으로 치면: if sidebar_open: render Overlay() */}
      {sidebarOpen && !isFocusMode && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* 전체 레이아웃: 3패널 가로 배치 */}
      {/* id="app-layout": @media print에서 flex→block으로 전환하여 인쇄 시 사이드바 공간 제거 */}
      <div id="app-layout" className="flex h-screen overflow-hidden relative" style={{ background: "var(--color-bg)" }}>

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
            <VaultRail />
            <CategorySidebar
              onOpenSettings={() => setSettingsOpen(true)}
              onCloseMobile={closeMobileSidebar}
              dbViewActive={dbViewActive}
              onToggleDbView={() => setDbViewActive(v => !v)}
              onSplitPage={(id) => setSplitPageId(prev => prev === id ? null : id)}
              onOpenGraphView={() => setGraphViewOpen(true)}
              onOpenTrash={() => setTrashOpen(true)}
              onOpenDayPlanner={() => setDayPlannerOpen(true)}
              categoryDropIndicator={categoryDropIndicator}
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
            className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center rounded-lg shadow text-lg"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-strong)", color: "var(--color-text-muted)" }}
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
              ref={editorScrollRef}
              className="overflow-y-auto min-w-0 split-left-panel"
              style={{ flexGrow: splitPageId ? splitRatio * 100 : 1, flexShrink: 1, flexBasis: '0%' }}
            >
              {dbViewActive ? (
                <DatabaseView onClose={() => setDbViewActive(false)} />
              ) : currentPageId ? (
                <PageEditor key={currentPageId} pageId={currentPageId} />
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
                className="w-px shrink-0 cursor-col-resize transition-colors print-hide"
                style={{ background: "var(--color-border-strong)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-accent)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-border-strong)" }}
                title={t.sidebar.splitViewResize}
              />
            )}

            {/* ── 오른쪽 패널 (스플릿 시만 표시) ─── */}
            {/* Python으로 치면: if split_page_id: render RightPane(split_page_id) */}
            {splitPageId && (() => {
              const splitPage = pages.find(p => p.id === splitPageId)
              return (
                <div
                  className="flex flex-col min-w-0 border-l hairline print-hide"
                  style={{ flex: `${(1 - splitRatio) * 100} 1 0%` }}
                >
                  {/* 오른쪽 패널 헤더: 페이지 제목 + 닫기 버튼 */}
                  {/* Python으로 치면: HBox([icon, title, close_btn]) */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b hairline shrink-0"
                       style={{ background: "var(--color-surface)" }}>
                    <span className="text-sm shrink-0">{splitPage?.icon || '📄'}</span>
                    <span className="text-xs font-medium truncate flex-1" style={{ color: "var(--color-text-muted)" }}>
                      {splitPage?.title || t.common.untitled}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSplitPageId(null)}
                      className="icon-btn shrink-0 w-5 h-5"
                      title={t.sidebar.splitViewClose}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {/* 오른쪽 패널 에디터 */}
                  <div className="flex-1 overflow-y-auto">
                    <PageEditor key={splitPageId} pageId={splitPageId} />
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
        {isDailyPlannerVault && dayPlannerOpen && !isFocusMode && (
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
          className="fixed bottom-12 right-4 w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-800 text-sm font-bold flex items-center justify-center shadow-sm transition-colors z-40"
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
      <DragOverlay dropAnimation={null}>
        {activeDragPage && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm shadow-lg pointer-events-none"
            style={{
              width: 220,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text)",
              opacity: 0.96,
            }}
          >
            <span className="text-sm shrink-0">{activeDragPage.icon}</span>
            <span className="truncate flex-1 font-medium">{activeDragPage.title || t.common.untitled}</span>
            {activeDragPageCount > 1 && (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--color-accent)", color: "#fff" }}>
                {activeDragPageCount}
              </span>
            )}
          </div>
        )}
        {activeDragCategory && (
          <div
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm shadow-lg pointer-events-none cursor-grabbing"
            style={{
              width: 220,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text)",
              opacity: 0.9,
            }}
          >
            <Folder
              size={15}
              className="shrink-0"
              style={{ color: activeDragCategory.color ?? "var(--color-text-muted)" }}
              fill={activeDragCategory.color ?? "none"}
              strokeWidth={activeDragCategory.color ? 1.5 : 2}
            />
            <span className="truncate flex-1 font-medium">{activeDragCategory.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
