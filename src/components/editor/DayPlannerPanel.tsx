// =============================================
// src/components/editor/DayPlannerPanel.tsx
// 역할: Day Planner 우측 플로팅 패널 (B안)
//   - 에디터 옆에 항상 열어두고 본문 작성하면서 일정 확인
//   - 지정된 일정 홈의 dayplanner 블록에서 해당 날짜 이벤트를 수집
//   - 이벤트 클릭 → 해당 페이지로 이동
//   - 빠른 이벤트 추가 → 지정된 일정 홈 메모의 dayplanner 블록에 저장
//     (없으면 사용자가 빠른 추가를 누른 시점에만 생성)
// Python으로 치면: class DayPlannerPanel(QDockWidget): ...
// =============================================

'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import { X, ChevronLeft, ChevronRight, Plus, Check, Clock, Pencil, Trash2, Undo2, RefreshCw, Timer, Zap } from 'lucide-react'
import { PlanEvent } from '@/types/block'
import type { PlannerData } from '@/lib/plannerData'
import { useLocale } from '@/locales'
import { findBlockById, findBlocksByType } from '@/lib/blockTree'
import { revealBlockAncestors } from '@/lib/blockReveal'
import { parsePlannerData } from '@/lib/plannerData'
import { toast } from 'sonner'
import { PLANNER_EVENTS_CHANGED_EVENT, PLANNER_OPEN_DATE_EVENT, PlannerStoreRequestError, plannerStoreApi, type PlannerEventInput, type StoredPlannerEvent, type StoredPlannerReview } from '@/lib/plannerStore'
import { usePlannerStoreMode } from '@/lib/usePlannerStoreMode'

// ── 오늘 날짜 문자열 ─────────────────────────
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── 날짜 ± N일 ────────────────────────────────
function shiftDate(ds: string, delta: number): string {
  const d = new Date(ds + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── 날짜 레이블 포맷 ─────────────────────────
// dowLabels: 일요일=0 기준 요일 배열 (t.planner.monthly.dowLabels)
// Python으로 치면: def format_date(ds, dow_labels) -> str: ...
function formatDate(ds: string, dowLabels: string[]): string {
  const d = new Date(ds + 'T00:00:00')
  if (isNaN(d.getTime())) return ds
  const wd = dowLabels[d.getDay()] ?? ''
  return `${d.getMonth()+1}/${d.getDate()} (${wd})`
}

// ── 이벤트 컬러 dot 매핑 ─────────────────────
const COLOR_DOT: Record<string, string> = {
  blue:   'bg-blue-400',
  green:  'bg-emerald-400',
  orange: 'bg-orange-400',
  purple: 'bg-violet-400',
  red:    'bg-rose-400',
  teal:   'bg-teal-400',
}

// ── 이벤트 bar 배경색 매핑 ────────────────────
const COLOR_BAR: Record<string, string> = {
  blue:   'bg-blue-50 border-blue-200',
  green:  'bg-emerald-50 border-emerald-200',
  orange: 'bg-orange-50 border-orange-200',
  purple: 'bg-violet-50 border-violet-200',
  red:    'bg-rose-50 border-rose-200',
  teal:   'bg-teal-50 border-teal-200',
}
const COLOR_TEXT: Record<string, string> = {
  blue:   'text-blue-700',
  green:  'text-emerald-700',
  orange: 'text-orange-700',
  purple: 'text-violet-700',
  red:    'text-rose-700',
  teal:   'text-teal-700',
}

// SQLite event payloads retain fields that P10 will surface, even when P7 edits only the basics.
// Python으로 치면: def event_input(event): return PlannerEventInput(...)
function eventInput(event: StoredPlannerEvent): PlannerEventInput {
  return {
    id: event.id, date: event.date, title: event.title, start: event.start, end: event.end,
    color: event.color, done: event.done, scheduled: event.scheduled,
    clockIn: event.clockIn, clockOut: event.clockOut, elapsed: event.elapsed,
    log: event.log, subtasks: event.subtasks, energy: event.energy,
    source: event.source, routineId: event.routineId,
  }
}

// Start and end inputs are HTML time values, so lexical comparison is safe after format validation.
// Python으로 치면: return start < end
function isValidTimeRange(start: string, end: string): boolean {
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end
}

type PlannerSubtask = { id: string; text: string; done: boolean }

function normalizedSubtasks(value: unknown[]): PlannerSubtask[] {
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Partial<PlannerSubtask>
    return typeof raw.id === 'string' && typeof raw.text === 'string'
      ? [{ id: raw.id, text: raw.text, done: Boolean(raw.done) }]
      : []
  })
}

function elapsedLabel(event: StoredPlannerEvent, now: number): string {
  const saved = event.elapsed ?? 0
  if (!event.clockIn || event.clockOut) return `${saved}m`
  const started = Date.parse(event.clockIn)
  const live = Number.isNaN(started) ? 0 : Math.max(0, Math.floor((now - started) / 60_000))
  const total = saved + live
  return total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total}m`
}

interface DayPlannerPanelProps {
  onClose: () => void
}

type PendingConflict = {
  action: 'update' | 'delete' | 'restore'
  eventId: string
  draft?: PlannerEventInput
}

export default function DayPlannerPanel({ onClose }: DayPlannerPanelProps) {

  // ── 로케일 ────────────────────────────────
  // Python으로 치면: t = use_locale()
  const t = useLocale()

  const { pages, setCurrentPage, pushRecentPage, updateBlock, updateBlockType, addBlock, savePageNow } = usePageStore()
  const plannerHomePageId = useVaultPreferencesStore(state => state.preferences.planner.homePageId)
  const plannerHomePage = useMemo(
    () => pages.find(page => page.id === plannerHomePageId) ?? null,
    [pages, plannerHomePageId],
  )
  const plannerStoreMode = usePlannerStoreMode()
  const [sqliteEvents, setSqliteEvents] = useState<StoredPlannerEvent[]>([])
  const [deletedSqliteEvents, setDeletedSqliteEvents] = useState<StoredPlannerEvent[]>([])
  const [editingSqliteEvent, setEditingSqliteEvent] = useState<StoredPlannerEvent | null>(null)
  const [savingEventId, setSavingEventId] = useState<string | null>(null)
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null)
  const [timerNow, setTimerNow] = useState(() => Date.now())
  const [sqliteReview, setSqliteReview] = useState<StoredPlannerReview | null>(null)
  const [reviewDraft, setReviewDraft] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [pendingReviewDraft, setPendingReviewDraft] = useState<string | null>(null)

  // ── 현재 날짜 ────────────────────────────────
  const [date, setDate] = useState(todayStr())

  // ── 빠른 추가 폼 상태 ────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formStart, setFormStart] = useState('09:00')
  const [formEnd,   setFormEnd]   = useState('10:00')
  const [formColor, setFormColor] = useState('blue')

  const loadSqliteEvents = useCallback(async (targetDate: string) => {
    try {
      const [active, all, review] = await Promise.all([
        plannerStoreApi.listEvents(targetDate, targetDate),
        plannerStoreApi.listEvents(targetDate, targetDate, true),
        plannerStoreApi.getReview(targetDate),
      ])
      setSqliteEvents(active)
      setDeletedSqliteEvents(all.filter(event => event.deletedAt !== null))
      setSqliteReview(review)
      setReviewDraft(review?.content ?? '')
      setPendingReviewDraft(null)
    } catch {
      toast.error('전용 일정 저장소에서 일정을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    if (plannerStoreMode === 'sqlite') void loadSqliteEvents(date)
  }, [date, loadSqliteEvents, plannerStoreMode])

  useEffect(() => {
    if (!editingSqliteEvent?.clockIn || editingSqliteEvent.clockOut) return
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [editingSqliteEvent?.clockIn, editingSqliteEvent?.clockOut])

  useEffect(() => {
    const refresh = () => { if (plannerStoreMode === 'sqlite') void loadSqliteEvents(date) }
    window.addEventListener(PLANNER_EVENTS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PLANNER_EVENTS_CHANGED_EVENT, refresh)
  }, [date, loadSqliteEvents, plannerStoreMode])

  useEffect(() => {
    const openDate = (event: Event) => {
      const value = (event as CustomEvent<string>).detail
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setDate(value)
    }
    window.addEventListener(PLANNER_OPEN_DATE_EVENT, openDate)
    return () => window.removeEventListener(PLANNER_OPEN_DATE_EVENT, openDate)
  }, [])

  const persistPage = useCallback(async function persist(targetPageId: string): Promise<void> {
    const toastId = `planner-panel-save-${targetPageId}`
    const saved = await savePageNow(targetPageId)
    if (saved) {
      toast.dismiss(toastId)
      return
    }
    toast.error('일정을 서버에 저장하지 못했습니다.', {
      id: toastId,
      duration: Infinity,
      description: '입력한 일정은 아직 미저장 상태입니다.',
      action: { label: '다시 시도', onClick: () => { void persist(targetPageId) } },
    })
  }, [savePageNow])

  // ── 일정 홈 메모에서 해당 날짜의 dayplanner 이벤트 수집 ──
  // Python으로 치면: events = [e for page in [planner_home] for block in page.blocks if block.type=='dayplanner'
  //                              for e in json.loads(block.content).events if data.date == target_date]
  const eventsForDate = useMemo(() => {
    const result: { event: PlanEvent; pageId: string; blockId: string; pageTitle: string; pageIcon: string }[] = []
    if (plannerStoreMode === 'loading' || plannerStoreMode === 'unavailable') return result
    if (plannerStoreMode === 'sqlite') {
      for (const event of sqliteEvents) {
        result.push({
          event: {
            id: event.id, title: event.title, start: event.start, end: event.end,
            color: event.color, done: event.done, scheduled: event.scheduled ?? undefined,
            clockIn: event.clockIn ?? undefined, clockOut: event.clockOut ?? undefined,
            elapsed: event.elapsed ?? undefined, log: event.log ?? undefined,
            subtasks: event.subtasks as PlanEvent['subtasks'], energy: event.energy ?? undefined,
            source: event.source === 'routine' ? 'routine' : event.source === 'manual' ? 'manual' : undefined,
            routineId: event.routineId ?? undefined, revision: event.revision,
          },
          pageId: '', blockId: '', pageTitle: '전용 일정 저장소', pageIcon: '🗄️',
        })
      }
      return result.sort((a, b) => a.event.start.localeCompare(b.event.start))
    }
    if (!plannerHomePage) return result
    for (const page of [plannerHomePage]) {
      for (const block of findBlocksByType(page.blocks, 'dayplanner')) {
        try {
          const data = parsePlannerData(block.content).data
          const dayEvents: PlanEvent[] = data.eventsByDate[date] ?? []
          for (const ev of dayEvents) {
            result.push({
              event: ev,
              pageId: page.id,
              blockId: block.id,
              pageTitle: page.title || '제목 없음',
              pageIcon:  page.icon  || '📝',
            })
          }
        } catch { /* JSON 파싱 실패 무시 */ }
      }
    }
    // start 시간순 정렬
    return result.sort((a, b) => a.event.start.localeCompare(b.event.start))
  }, [plannerHomePage, date, plannerStoreMode, sqliteEvents])

  // ── SQLite CRUD: server-confirmed updates only ──────────────────
  // Python으로 치면: async def save_sqlite_event(event, payload): await api.update(..., event.revision)
  const saveSqliteEvent = useCallback(async (event: StoredPlannerEvent, payload: PlannerEventInput) => {
    if (!payload.title.trim()) {
      toast.error(t.planner.day.eventTitleRequired)
      return
    }
    if (!isValidTimeRange(payload.start, payload.end)) {
      toast.error(t.planner.day.eventTimeOrderError)
      return
    }
    setSavingEventId(event.id)
    setPendingConflict(null)
    try {
      const updated = await plannerStoreApi.updateEvent(payload, event.revision)
      setSqliteEvents(current => updated.date === date
        ? current.map(item => item.id === updated.id ? updated : item).sort((a, b) => a.start.localeCompare(b.start))
        : current.filter(item => item.id !== updated.id))
      setEditingSqliteEvent(null)
      toast.success(t.planner.day.eventSaved)
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) {
        await loadSqliteEvents(date)
        setPendingConflict({ action: 'update', eventId: event.id, draft: payload })
        toast.error(t.planner.day.eventConflict)
      } else {
        toast.error(error instanceof Error ? error.message : t.planner.day.eventSaveError)
      }
    } finally {
      setSavingEventId(null)
    }
  }, [date, loadSqliteEvents, t])

  // Timer endpoints use the backend clock so a restart can reconstruct elapsed time.
  // Python으로 치면: updated = await api.clock_in_or_out(event.id, event.revision)
  const updateTimer = useCallback(async (event: StoredPlannerEvent, action: 'in' | 'out') => {
    setSavingEventId(event.id)
    try {
      const updated = action === 'in'
        ? await plannerStoreApi.clockInEvent(event.id, event.revision)
        : await plannerStoreApi.clockOutEvent(event.id, event.revision)
      setSqliteEvents(current => current.map(item => item.id === updated.id ? updated : item))
      setEditingSqliteEvent(current => current?.id === updated.id ? updated : current)
      setTimerNow(Date.now())
      toast.success(action === 'in' ? t.planner.day.timerStarted : t.planner.day.timerStopped)
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) await loadSqliteEvents(date)
      toast.error(error instanceof Error ? error.message : t.planner.day.timerError)
    } finally {
      setSavingEventId(null)
    }
  }, [date, loadSqliteEvents, t])

  // Soft-delete keeps the server response so the toast action can restore the exact revision.
  // Python으로 치면: deleted = await api.delete(event.id, event.revision); toast(undo=lambda: restore(deleted))
  const deleteSqliteEvent = useCallback(async (event: StoredPlannerEvent) => {
    setSavingEventId(event.id)
    setPendingConflict(null)
    try {
      const deleted = await plannerStoreApi.deleteEvent(event.id, event.revision)
      setSqliteEvents(current => current.filter(item => item.id !== event.id))
      setDeletedSqliteEvents(current => [...current.filter(item => item.id !== event.id), deleted])
      setEditingSqliteEvent(null)
      toast.success(t.planner.day.eventDeleted, {
        action: {
          label: t.planner.day.undoDelete,
          onClick: () => {
            void plannerStoreApi.restoreEvent(deleted.id, deleted.revision)
              .then(restored => {
                setDeletedSqliteEvents(current => current.filter(item => item.id !== restored.id))
                if (restored.date === date) {
                  setSqliteEvents(current => [...current.filter(item => item.id !== restored.id), restored].sort((a, b) => a.start.localeCompare(b.start)))
                }
                toast.success(t.planner.day.eventRestored)
              })
              .catch(error => {
                void loadSqliteEvents(date)
                if (error instanceof PlannerStoreRequestError && error.status === 409) {
                  setPendingConflict({ action: 'restore', eventId: deleted.id })
                  toast.error(t.planner.day.eventConflict)
                } else {
                  toast.error(error instanceof Error ? error.message : t.planner.day.eventRestoreError)
                }
              })
          },
        },
      })
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) {
        await loadSqliteEvents(date)
        setPendingConflict({ action: 'delete', eventId: event.id })
        toast.error(t.planner.day.eventConflict)
      } else {
        toast.error(error instanceof Error ? error.message : t.planner.day.eventDeleteError)
      }
    } finally {
      setSavingEventId(null)
    }
  }, [date, loadSqliteEvents, t])

  // A restore uses the latest soft-delete revision and moves the event back into the active date list.
  // Python으로 치면: restored = await api.restore(event.id, event.revision)
  const restoreSqliteEvent = useCallback(async (event: StoredPlannerEvent) => {
    setSavingEventId(event.id)
    setPendingConflict(null)
    try {
      const restored = await plannerStoreApi.restoreEvent(event.id, event.revision)
      setDeletedSqliteEvents(current => current.filter(item => item.id !== event.id))
      if (restored.date === date) {
        setSqliteEvents(current => [...current.filter(item => item.id !== event.id), restored].sort((a, b) => a.start.localeCompare(b.start)))
      }
      toast.success(t.planner.day.eventRestored)
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) {
        await loadSqliteEvents(date)
        setPendingConflict({ action: 'restore', eventId: event.id })
        toast.error(t.planner.day.eventConflict)
      } else {
        toast.error(error instanceof Error ? error.message : t.planner.day.eventRestoreError)
      }
    } finally {
      setSavingEventId(null)
    }
  }, [date, loadSqliteEvents, t])

  // Reapply is explicit after a 409: reload first, then use the latest server revision.
  // Python으로 치면: latest = find_latest(event_id); retry(latest, pending_change)
  const retryPendingConflict = useCallback(() => {
    if (!pendingConflict) return
    const current = pendingConflict.action === 'restore'
      ? deletedSqliteEvents.find(event => event.id === pendingConflict.eventId)
      : sqliteEvents.find(event => event.id === pendingConflict.eventId)
    if (!current) {
      setPendingConflict(null)
      toast.error(t.planner.day.eventConflictGone)
      return
    }
    if (pendingConflict.action === 'update' && pendingConflict.draft) {
      void saveSqliteEvent(current, { ...pendingConflict.draft, id: current.id })
    } else if (pendingConflict.action === 'delete') {
      void deleteSqliteEvent(current)
    } else {
      void restoreSqliteEvent(current)
    }
  }, [deleteSqliteEvent, deletedSqliteEvents, pendingConflict, restoreSqliteEvent, saveSqliteEvent, sqliteEvents, t])

  const saveSqliteReview = useCallback(async (content: string, revision = sqliteReview?.revision) => {
    setReviewSaving(true)
    try {
      const saved = await plannerStoreApi.saveReview(date, content, revision)
      setSqliteReview(saved)
      setReviewDraft(saved.content)
      setPendingReviewDraft(null)
      toast.success(t.planner.day.reviewSaved)
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) {
        const latest = await plannerStoreApi.getReview(date)
        setSqliteReview(latest)
        setReviewDraft(latest?.content ?? '')
        setPendingReviewDraft(content)
        toast.error(t.planner.day.reviewConflict)
      } else {
        toast.error(error instanceof Error ? error.message : t.planner.day.reviewSaveError)
      }
    } finally {
      setReviewSaving(false)
    }
  }, [date, sqliteReview?.revision, t])

  // ── 완료 토글 ────────────────────────────────
  // Python으로 치면: def toggle_done(page_id, block_id, event_id): ...
  const toggleDone = useCallback(async (pageId: string, blockId: string, eventId: string) => {
    if (plannerStoreMode === 'sqlite') {
      const event = sqliteEvents.find(item => item.id === eventId)
      if (!event) return
      await saveSqliteEvent(event, { ...eventInput(event), done: !event.done })
      return
    }
    const page  = usePageStore.getState().pages.find(p => p.id === pageId)
    const block = findBlockById(page?.blocks, blockId)
    if (!block) return
    try {
      const parsed = parsePlannerData(block.content)
      if (!parsed.writable) {
        toast.error('손상된 일정 원본은 덮어쓸 수 없습니다. 복구 센터에서 먼저 백업해 주세요.')
        return
      }
      const data: PlannerData = parsed.data
      const dayEvents = (data.eventsByDate[date] ?? []).map(
        e => e.id === eventId ? { ...e, done: !e.done } : e
      )
      updateBlock(pageId, blockId, JSON.stringify({
        eventsByDate: { ...(data.eventsByDate ?? {}), [date]: dayEvents },
        reviewByDate: data.reviewByDate ?? {},
      }), true)
      void persistPage(pageId)
    } catch { /* 무시 */ }
  }, [date, updateBlock, persistPage, plannerStoreMode, saveSqliteEvent, sqliteEvents])

  const revealPlanner = useCallback((pageId: string, blockId: string) => {
    const page = usePageStore.getState().pages.find(p => p.id === pageId)
    revealBlockAncestors(page, blockId)
    setCurrentPage(pageId)
    window.setTimeout(() => {
      document.getElementById(blockId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }, [setCurrentPage])

  // ── 빠른 추가: 일정 홈 메모의 dayplanner 블록에 이벤트 추가 ──
  // 일정 홈 안에 블록이 없으면 사용자가 빠른 추가를 누른 시점에만 생성한다.
  // Python으로 치면: def quick_add(title, start, end, color): ...
  const handleQuickAdd = useCallback(async () => {
    if (!formTitle.trim()) return
    if (plannerStoreMode === 'loading' || plannerStoreMode === 'unavailable') return
    if (!isValidTimeRange(formStart, formEnd)) {
      toast.error(t.planner.day.eventTimeOrderError)
      return
    }
    const newEvent: PlanEvent = {
      id:    crypto.randomUUID(),
      title: formTitle.trim(),
      start: formStart,
      end:   formEnd,
      color: formColor,
      done:  false,
      source: 'manual',
    }

    if (plannerStoreMode === 'sqlite') {
      try {
        const created = await plannerStoreApi.createEvent({ ...newEvent, date })
        setSqliteEvents(current => [...current, created].sort((a, b) => a.start.localeCompare(b.start)))
        setFormTitle('')
        setShowForm(false)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '일정을 저장하지 못했습니다.')
      }
      return
    }
    if (!plannerHomePage) return

    // 일정 홈에서 dayplanner 블록 찾기 (날짜 무관 — 블록 타입으로 검색)
    const targetPageId = plannerHomePage.id
    const page = usePageStore.getState().pages.find(p => p.id === targetPageId)
    const existingBlock = findBlocksByType(page?.blocks, 'dayplanner')[0]

    if (existingBlock) {
      // 기존 블록에 이벤트 추가 (새 eventsByDate 구조)
      try {
        const parsed = parsePlannerData(existingBlock.content)
        if (!parsed.writable) {
          toast.error('손상된 일정 원본은 덮어쓸 수 없습니다. 복구 센터에서 먼저 백업해 주세요.')
          return
        }
        const data: PlannerData = parsed.data
        const dayEvs = data.eventsByDate[date] ?? []
        updateBlock(targetPageId, existingBlock.id, JSON.stringify({
          eventsByDate: { ...(data.eventsByDate ?? {}), [date]: [...dayEvs, newEvent] },
          reviewByDate: data.reviewByDate ?? {},
        }), true)
        void persistPage(targetPageId)
      } catch { /* 무시 */ }
    } else {
      // 새 dayplanner 블록 추가
      addBlock(targetPageId)
      const newBlocks = usePageStore.getState().pages.find(p => p.id === targetPageId)?.blocks ?? []
      const newBlockId = newBlocks[newBlocks.length - 1]?.id
      if (newBlockId) {
        updateBlockType(targetPageId, newBlockId, 'dayplanner')
        updateBlock(targetPageId, newBlockId, JSON.stringify({ eventsByDate: { [date]: [newEvent] } }), true)
        void persistPage(targetPageId)
      }
    }

    setFormTitle('')
    setShowForm(false)
  }, [formTitle, formStart, formEnd, formColor, date, plannerHomePage, updateBlock, updateBlockType, addBlock, persistPage, plannerStoreMode, t])

  // ── 현재 시각 기준 진행 중 이벤트 판별 ──────
  // Python으로 치면: def is_ongoing(event): return start <= now <= end
  function isOngoing(ev: PlanEvent): boolean {
    const now    = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const s      = ev.start.split(':').map(Number)
    const e      = ev.end.split(':').map(Number)
    if (s.length < 2 || e.length < 2) return false
    return (s[0]*60+s[1]) <= nowMin && nowMin < (e[0]*60+e[1])
  }

  const isToday  = date === todayStr()
  const doneCount = eventsForDate.filter(x => x.event.done).length
  const plannedMinutes = eventsForDate.reduce((total, entry) => {
    const [startHour, startMinute] = entry.event.start.split(':').map(Number)
    const [endHour, endMinute] = entry.event.end.split(':').map(Number)
    return total + Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute))
  }, 0)
  const actualMinutes = eventsForDate.reduce((total, entry) => total + (entry.event.elapsed ?? 0), 0)

  return (
    <div className="w-64 flex flex-col border-l border-gray-200 bg-white shrink-0 h-full">

      {/* ── 헤더 ─────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2 shrink-0">
        <Clock size={14} className="text-blue-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700 flex-1">{t.planner.day.panelTitle}</span>
        <button type="button" onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {plannerStoreMode === 'legacy' && !plannerHomePage && (
        <div className="px-3 py-2 border-b border-amber-100 bg-amber-50 text-[10px] leading-4 text-amber-700">
          {t.settings.vaultFeatures.homePageNotSet}
        </div>
      )}
      {plannerStoreMode === 'unavailable' && (
        <div className="px-3 py-2 border-b border-red-100 bg-red-50 text-[10px] leading-4 text-red-700">
          {t.settings.vaultFeatures.plannerStoreUnavailable}
        </div>
      )}

      {/* ── 날짜 네비게이션 ───────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1 shrink-0">
        <button type="button" onClick={() => setDate(d => shiftDate(d, -1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft size={13} />
        </button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-xs text-gray-700 bg-transparent border-none outline-none cursor-pointer flex-1 text-center"
        />
        <button type="button" onClick={() => setDate(d => shiftDate(d, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRight size={13} />
        </button>
      </div>

      {/* ── 날짜 레이블 + 오늘 버튼 ─────────── */}
      <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-gray-500 flex-1">{formatDate(date, t.planner.monthly.dowLabels)}</span>
        {isToday && <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">{t.planner.day.today}</span>}
        {!isToday && (
          <button type="button" onClick={() => setDate(todayStr())}
            className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors">
            {t.planner.day.goToday}
          </button>
        )}
        <span className="text-[10px] text-gray-400">{doneCount}/{eventsForDate.length}</span>
      </div>

      {/* ── 이벤트 목록 ─────────────────────── */}
      <div className="flex-1 overflow-auto">
        {eventsForDate.length === 0 && !showForm ? (
          <div className="text-center py-10 px-4">
            <p className="text-xs text-gray-400 mb-3">
              {isToday ? t.planner.day.noEventsToday : t.planner.day.noEventsDay}
            </p>
            <button type="button" onClick={() => setShowForm(true)} disabled={plannerStoreMode === 'loading' || plannerStoreMode === 'unavailable' || (plannerStoreMode !== 'sqlite' && !plannerHomePage)}
              className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mx-auto transition-colors">
              <Plus size={12} /> {t.planner.day.addEvent}
            </button>
          </div>
        ) : (
          <div className="py-1">
            {eventsForDate.map(({ event, pageId, blockId, pageTitle, pageIcon }, idx) => {
              const ongoing = isToday && isOngoing(event)
              const sqliteEvent = plannerStoreMode === 'sqlite'
                ? sqliteEvents.find(item => item.id === event.id) ?? null
                : null
              const barCls  = COLOR_BAR[event.color]  ?? 'bg-blue-50 border-blue-200'
              const txtCls  = COLOR_TEXT[event.color] ?? 'text-blue-700'
              const dotCls  = COLOR_DOT[event.color]  ?? 'bg-blue-400'
              return (
                <div
                  key={`${blockId}-${event.id}-${idx}`}
                  className={[
                    'mx-2 my-1 rounded-lg border px-2.5 py-2 cursor-pointer transition-all',
                    barCls,
                    ongoing ? 'ring-2 ring-blue-300 ring-offset-1' : '',
                  ].join(' ')}
                  onClick={() => {
                    if (sqliteEvent) setEditingSqliteEvent(sqliteEvent)
                    else if (pageId && blockId) { revealPlanner(pageId, blockId); pushRecentPage(pageId) }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {/* 완료 토글 */}
                    <button type="button"
                      onClick={e => { e.stopPropagation(); void toggleDone(pageId, blockId, event.id) }}
                      className={[
                        'shrink-0 w-3.5 h-3.5 rounded border mt-0.5 flex items-center justify-center transition-all',
                        event.done ? `${dotCls} border-transparent` : 'border-gray-300',
                      ].join(' ')}>
                      {event.done && <Check size={9} className="text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={[
                        'text-xs font-medium truncate',
                        txtCls,
                        event.done ? 'line-through opacity-50' : '',
                      ].join(' ')}>
                        {event.title}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-gray-400">
                          {event.start} – {event.end}
                        </span>
                        {ongoing && (
                          <span className="text-[9px] bg-blue-500 text-white px-1 py-0.5 rounded-full animate-pulse">
                            {t.planner.day.inProgress}
                          </span>
                        )}
                      </div>
                      {/* 출처 페이지 */}
                      <div className="text-[10px] text-gray-400 truncate mt-0.5">
                        {pageIcon} {pageTitle}
                      </div>
                    </div>
                    {sqliteEvent && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          title={t.planner.day.editEvent}
                          onClick={e => { e.stopPropagation(); setEditingSqliteEvent(sqliteEvent) }}
                          className="rounded p-1 text-gray-400 hover:bg-white/70 hover:text-gray-700"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          title={t.planner.day.deleteEvent}
                          disabled={savingEventId === sqliteEvent.id}
                          onClick={e => { e.stopPropagation(); void deleteSqliteEvent(sqliteEvent) }}
                          className="rounded p-1 text-gray-400 hover:bg-white/70 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  {savingEventId === event.id && <p className="mt-1 text-[10px] text-gray-400">{t.planner.day.eventSaving}</p>}
                </div>
              )
            })}
          </div>
        )}

        {/* ── 빠른 추가 폼 ─────────────────── */}
        {showForm && (
          <div className="mx-2 my-2 p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder={t.planner.day.eventNamePlaceholder}
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleQuickAdd(); if (e.key === 'Escape') setShowForm(false) }}
              className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white w-full"
            />
            <div className="flex items-center gap-1">
              <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)}
                className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" />
              <span className="text-[10px] text-gray-400">~</span>
              <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)}
                className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" />
            </div>
            {/* 색상 */}
            <div className="flex gap-1.5">
              {Object.entries(COLOR_DOT).map(([id, cls]) => (
                <button key={id} type="button" onClick={() => setFormColor(id)}
                  className={['w-4 h-4 rounded-full transition-all', cls, formColor === id ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''].join(' ')} />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void handleQuickAdd()} disabled={plannerStoreMode === 'loading' || plannerStoreMode === 'unavailable' || (plannerStoreMode !== 'sqlite' && !plannerHomePage)}
                className="flex-1 text-[11px] bg-blue-500 hover:bg-blue-600 text-white px-2 py-1.5 rounded transition-colors">
                {t.planner.day.addBtn}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded hover:bg-gray-200 transition-colors">
                {t.planner.day.cancelBtn}
              </button>
            </div>
            {plannerStoreMode !== 'sqlite' && !plannerHomePage && (
              <p className="text-[10px] text-amber-500">{t.settings.vaultFeatures.homePageNotSet}</p>
            )}
          </div>
        )}

        {plannerStoreMode === 'sqlite' && deletedSqliteEvents.length > 0 && (
          <section className="mx-2 my-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="mb-1.5 text-[10px] font-medium text-gray-500">{t.planner.day.deletedEvents}</p>
            <div className="flex flex-col gap-1">
              {deletedSqliteEvents.map(event => (
                <div key={event.id} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="min-w-0 flex-1 truncate line-through">{event.title}</span>
                  <button
                    type="button"
                    disabled={savingEventId === event.id}
                    onClick={() => void restoreSqliteEvent(event)}
                    className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[10px] text-blue-600 hover:bg-white disabled:opacity-50"
                  >
                    <Undo2 size={11} /> {t.planner.day.restoreEvent}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {plannerStoreMode === 'sqlite' && (
          <section className="mx-2 my-3 rounded-lg border border-violet-100 bg-violet-50 p-2.5">
            <div className="mb-1.5 flex items-center justify-between"><p className="text-[11px] font-semibold text-violet-800">{t.planner.day.dailyReview}</p><span className="text-[9px] text-violet-600">{t.planner.day.reviewStats.replace('{done}', String(doneCount)).replace('{total}', String(eventsForDate.length)).replace('{planned}', String(plannedMinutes)).replace('{actual}', String(actualMinutes))}</span></div>
            <textarea value={reviewDraft} onChange={event => setReviewDraft(event.target.value)} placeholder={t.planner.day.dailyReviewPlaceholder} rows={3} className="w-full resize-none rounded border border-violet-100 bg-white px-2 py-1.5 text-[11px] text-gray-700 outline-none focus:border-violet-300" />
            <div className="mt-1.5 flex items-center gap-1.5"><button type="button" disabled={reviewSaving} onClick={() => void saveSqliteReview(reviewDraft)} className="rounded bg-violet-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-700 disabled:opacity-50">{reviewSaving ? t.planner.day.eventSaving : t.planner.day.reviewSave}</button>{pendingReviewDraft !== null && <button type="button" disabled={reviewSaving} onClick={() => void saveSqliteReview(pendingReviewDraft, sqliteReview?.revision)} className="rounded bg-violet-200 px-2 py-1 text-[10px] font-medium text-violet-800 hover:bg-violet-300 disabled:opacity-50">{t.planner.day.reviewReapply}</button>}</div>
          </section>
        )}
      </div>

      {pendingConflict && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">
          <div className="flex items-start gap-1.5">
            <RefreshCw size={12} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.planner.day.eventConflict}</span>
            <button type="button" onClick={retryPendingConflict} className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-medium hover:bg-amber-300">
              {t.planner.day.reapplyChange}
            </button>
          </div>
        </div>
      )}

      {/* ── 하단 빠른 추가 버튼 ─────────────── */}
      {!showForm && eventsForDate.length > 0 && (
        <div className="px-3 py-2.5 border-t border-gray-100 shrink-0">
          <button type="button" onClick={() => setShowForm(true)} disabled={plannerStoreMode === 'loading' || plannerStoreMode === 'unavailable' || (plannerStoreMode !== 'sqlite' && !plannerHomePage)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 py-1.5 rounded-lg hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-colors">
            <Plus size={13} /> {t.planner.day.addEvent}
          </button>
        </div>
      )}

      {editingSqliteEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditingSqliteEvent(null)}>
          <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">{t.planner.day.editEvent}</h2>
              <button type="button" onClick={() => setEditingSqliteEvent(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X size={15} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={editingSqliteEvent.title}
                placeholder={t.planner.day.eventNamePlaceholder}
                onChange={event => setEditingSqliteEvent(current => current ? { ...current, title: event.target.value } : current)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-blue-400"
              />
              <input
                type="date"
                value={editingSqliteEvent.date}
                aria-label={t.planner.day.editDate}
                onChange={event => setEditingSqliteEvent(current => current ? { ...current, date: event.target.value } : current)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-blue-400"
              />
              <div className="flex items-center gap-1.5">
                <input type="time" value={editingSqliteEvent.start} onChange={event => setEditingSqliteEvent(current => current ? { ...current, start: event.target.value } : current)} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
                <span className="text-xs text-gray-400">~</span>
                <input type="time" value={editingSqliteEvent.end} onChange={event => setEditingSqliteEvent(current => current ? { ...current, end: event.target.value } : current)} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400" />
              </div>
              <div className="flex gap-1.5">
                {Object.entries(COLOR_DOT).map(([id, cls]) => (
                  <button key={id} type="button" title={id} onClick={() => setEditingSqliteEvent(current => current ? { ...current, color: id } : current)} className={['h-4 w-4 rounded-full transition-all', cls, editingSqliteEvent.color === id ? 'scale-110 ring-2 ring-gray-400 ring-offset-1' : ''].join(' ')} />
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={editingSqliteEvent.scheduled !== false} onChange={event => setEditingSqliteEvent(current => current ? { ...current, scheduled: event.target.checked } : current)} /> {t.planner.day.detailScheduled}</label>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2">
                <div className="flex items-center gap-2"><Timer size={14} className="text-emerald-600" /><span className="flex-1 text-xs font-medium text-emerald-800">{editingSqliteEvent.clockIn && !editingSqliteEvent.clockOut ? t.planner.day.timerRunning.replace('{elapsed}', elapsedLabel(editingSqliteEvent, timerNow)) : t.planner.day.timerStoppedLabel.replace('{elapsed}', elapsedLabel(editingSqliteEvent, timerNow))}</span>{editingSqliteEvent.clockIn && !editingSqliteEvent.clockOut ? <button type="button" disabled={savingEventId === editingSqliteEvent.id} onClick={() => void updateTimer(editingSqliteEvent, 'out')} className="rounded bg-emerald-600 px-2 py-1 text-[11px] text-white disabled:opacity-50">{t.planner.day.timerStop}</button> : <button type="button" disabled={editingSqliteEvent.done || savingEventId === editingSqliteEvent.id} onClick={() => void updateTimer(editingSqliteEvent, 'in')} className="rounded bg-emerald-600 px-2 py-1 text-[11px] text-white disabled:opacity-50">{t.planner.day.timerStart}</button>}</div>
                {editingSqliteEvent.clockIn && <p className="mt-1 text-[10px] text-emerald-700">{t.planner.day.timerServerTime}</p>}
              </div>
              <div className="rounded-lg border border-gray-100 p-2.5">
                <div className="mb-1.5 flex items-center gap-1 text-xs text-gray-600"><Zap size={13} className="text-amber-500" /> {t.planner.day.detailEnergy}</div>
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" onClick={() => setEditingSqliteEvent(current => current ? { ...current, energy: current.energy === value ? null : value } : current)}><Zap size={14} className={value <= (editingSqliteEvent.energy ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} /></button>)}</div>
              </div>
              <textarea value={editingSqliteEvent.log ?? ''} placeholder={t.planner.day.detailLogPlaceholder} onChange={event => setEditingSqliteEvent(current => current ? { ...current, log: event.target.value } : current)} className="min-h-20 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-blue-400" />
              <div className="rounded-lg border border-gray-100 p-2.5">
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-600"><span>{t.planner.day.detailSubtasks}</span><button type="button" onClick={() => setEditingSqliteEvent(current => current ? { ...current, subtasks: [...normalizedSubtasks(current.subtasks), { id: crypto.randomUUID(), text: '', done: false }] } : current)} className="text-blue-600"><Plus size={13} /></button></div>
                <div className="space-y-1.5">{normalizedSubtasks(editingSqliteEvent.subtasks).map(subtask => <div key={subtask.id} className="flex items-center gap-1"><input type="checkbox" checked={subtask.done} onChange={() => setEditingSqliteEvent(current => current ? { ...current, subtasks: normalizedSubtasks(current.subtasks).map(item => item.id === subtask.id ? { ...item, done: !item.done } : item) } : current)} /><input value={subtask.text} placeholder={t.planner.day.detailSubtaskPlaceholder} onChange={event => setEditingSqliteEvent(current => current ? { ...current, subtasks: normalizedSubtasks(current.subtasks).map(item => item.id === subtask.id ? { ...item, text: event.target.value } : item) } : current)} className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-[11px]" /><button type="button" onClick={() => setEditingSqliteEvent(current => current ? { ...current, subtasks: normalizedSubtasks(current.subtasks).filter(item => item.id !== subtask.id) } : current)} className="text-gray-400 hover:text-red-500"><X size={12} /></button></div>)}</div>
              </div>
              <div className="mt-1 flex gap-1.5">
                <button type="button" disabled={savingEventId === editingSqliteEvent.id} onClick={() => void saveSqliteEvent(editingSqliteEvent, eventInput(editingSqliteEvent))} className="flex-1 rounded-lg bg-blue-500 px-2.5 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                  {savingEventId === editingSqliteEvent.id ? t.planner.day.eventSaving : t.planner.day.saveChanges}
                </button>
                <button type="button" disabled={savingEventId === editingSqliteEvent.id} onClick={() => void deleteSqliteEvent(editingSqliteEvent)} className="rounded-lg border border-red-200 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
