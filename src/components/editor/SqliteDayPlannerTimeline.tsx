// =============================================
// src/components/editor/SqliteDayPlannerTimeline.tsx
// 역할: SQLite 일정 저장소를 단일 원본으로 사용하는 하루 타임라인
// Python으로 치면: class SqliteDayPlannerTimeline(QWidget): ...
// =============================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { type PlanEvent } from '@/types/block'
import { useLocale } from '@/locales'
import { useSettingsStore } from '@/store/settingsStore'
import {
  PLANNER_EVENTS_CHANGED_EVENT,
  PlannerStoreRequestError,
  plannerStoreApi,
  type PlannerBatchDelete,
  type PlannerEventInput,
  type StoredPlannerEvent,
} from '@/lib/plannerStore'
import PlannerTimeline, {
  END_HOUR,
  EVENT_COLORS,
  START_HOUR,
  eventPx,
  getColor,
  minToTime,
  timeToMin,
  yToTime,
} from '@/components/editor/planner/PlannerTimeline'
import { usePlannerEventDrag } from '@/components/editor/planner/usePlannerEventDrag'
import SqliteRoutineManager from './SqliteRoutineManager'

function todayStr(): string {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function shiftDate(value: string, delta: number): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function weatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️'
  if (code <= 77 || (code >= 85 && code <= 86)) return '❄️'
  return '⛈️'
}

function toPlanEvent(event: StoredPlannerEvent): PlanEvent {
  return {
    id: event.id, title: event.title, start: event.start, end: event.end, color: event.color,
    done: event.done, scheduled: event.scheduled ?? undefined, clockIn: event.clockIn ?? undefined,
    clockOut: event.clockOut ?? undefined, elapsed: event.elapsed ?? undefined,
    log: event.log ?? undefined, subtasks: event.subtasks as PlanEvent['subtasks'],
    energy: event.energy ?? undefined, source: event.source === 'routine' ? 'routine' : 'manual',
    routineId: event.routineId ?? undefined, revision: event.revision,
  }
}

function eventInput(event: StoredPlannerEvent): PlannerEventInput {
  return {
    id: event.id, date: event.date, title: event.title, start: event.start, end: event.end,
    color: event.color, done: event.done, scheduled: event.scheduled, clockIn: event.clockIn,
    clockOut: event.clockOut, elapsed: event.elapsed, log: event.log, subtasks: event.subtasks,
    energy: event.energy, source: event.source, routineId: event.routineId,
  }
}

function hasValidTimeRange(start: string, end: string): boolean {
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end
}

interface NewEventForm {
  start: string
  end: string
}

interface AiProposal {
  action: 'add' | 'replace'
  creates: PlannerEventInput[]
  deletes: PlannerBatchDelete[]
}

let activeSqliteTimelineId: string | null = null

// AI 텍스트에서 JSON 제안만 꺼내고, 현재 날짜·유효 시간·허용 색상만 통과시킨다.
// Python으로 치면: def parse_ai_proposal(text, date, snapshot): return reviewed_diff
function parseAiProposal(text: string, date: string, events: StoredPlannerEvent[]): AiProposal | null {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
    if (!match) return null
    const parsed = JSON.parse(match[1] ?? match[0]) as { action?: string; events?: Array<Partial<PlannerEventInput>> }
    const action = parsed.action === 'replace' ? 'replace' : 'add'
    const creates = (parsed.events ?? []).flatMap(item => {
      const title = item.title?.trim()
      const start = item.start ?? ''
      const end = item.end ?? ''
      if (!title || !hasValidTimeRange(start, end)) return []
      return [{
        id: crypto.randomUUID(), date, title, start, end,
        color: EVENT_COLORS.some(color => color.id === item.color) ? item.color! : 'blue',
        done: false, scheduled: true, source: 'ai',
      }]
    })
    if (!creates.length) return null
    // replace never removes routine-generated items; the user can manage those in the routine manager.
    const deletes = action === 'replace'
      ? events.filter(event => event.routineId === null).map(event => ({ id: event.id, expectedRevision: event.revision }))
      : []
    return { action, creates, deletes }
  } catch {
    return null
  }
}

export default function SqliteDayPlannerTimeline({ blockId = 'sqlite-day-planner' }: { blockId?: string }) {
  const t = useLocale()
  const plannerStartHour = useSettingsStore(state => state.plannerStartHour)
  const plannerEndHour = useSettingsStore(state => state.plannerEndHour)
  const plannerSnapMin = useSettingsStore(state => state.plannerSnapMin)
  const plannerZoom = useSettingsStore(state => state.plannerZoom)
  const plannerNotifyBefore = useSettingsStore(state => state.plannerNotifyBefore)
  const weatherLocation = useSettingsStore(state => state.weatherLocation)
  const [date, setDate] = useState(todayStr())
  const [events, setEvents] = useState<StoredPlannerEvent[]>([])
  const eventsRef = useRef<StoredPlannerEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [savingEventId, setSavingEventId] = useState<string | null>(null)
  const [nowTop, setNowTop] = useState<number | null>(null)
  const [newForm, setNewForm] = useState<NewEventForm | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null)
  const [weather, setWeather] = useState<{ icon: string; temp: string } | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const initialDateRef = useRef(true)

  const startHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, Math.floor(plannerStartHour)))
  const endHour = Math.max(startHour + 1, Math.min(END_HOUR, Math.floor(plannerEndHour)))

  const loadEvents = useCallback(async (targetDate: string) => {
    try {
      const loaded = await plannerStoreApi.listEvents(targetDate, targetDate)
      setEvents(loaded)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.day.timelineLoadError)
    }
  }, [t.planner.day.timelineLoadError])

  useEffect(() => { eventsRef.current = events }, [events])

  useEffect(() => {
    void loadEvents(date)
  }, [date, loadEvents])

  // 날씨는 독립 설정/API에서 읽는 보조 정보이며 SQLite 일정에는 저장하지 않는다.
  // Python으로 치면: weather = await get_weather(location, date) if location else None
  useEffect(() => {
    if (!weatherLocation) { setWeather(null); return }
    let disposed = false
    void fetch(`/api/weather/day?city=${encodeURIComponent(weatherLocation)}&date=${encodeURIComponent(date)}`)
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        const item = payload?.weather
        if (!disposed) setWeather(item ? { icon: weatherIcon(item.weathercode), temp: `${Math.round(item.tempMin)}°–${Math.round(item.tempMax)}°` } : null)
      })
      .catch(() => { if (!disposed) setWeather(null) })
    return () => { disposed = true }
  }, [date, weatherLocation])

  useEffect(() => {
    const refresh = () => { void loadEvents(date) }
    window.addEventListener(PLANNER_EVENTS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PLANNER_EVENTS_CHANGED_EVENT, refresh)
  }, [date, loadEvents])

  // 날짜를 이동할 때만 서버 정책에 따라 루틴을 보충한다. 최초 렌더링은
  // 사용자가 아직 선택하지 않은 날짜이므로 자동 생성하지 않는다.
  useEffect(() => {
    if (initialDateRef.current) {
      initialDateRef.current = false
      return
    }
    void plannerStoreApi.applyRoutines(date, true).then(result => {
      if (result.created.length) void loadEvents(date)
    }).catch(() => undefined)
  }, [date, loadEvents])

  // 현재 시각선은 오늘을 볼 때만 1분 주기로 갱신한다.
  // Python으로 치면: if date == today: now_top = minutes_now * px_per_min
  useEffect(() => {
    const update = () => {
      if (date !== todayStr()) {
        setNowTop(null)
        return
      }
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      setNowTop(minutes < startHour * 60 || minutes > endHour * 60 ? null : (minutes - startHour * 60) * (plannerZoom / 60))
    }
    update()
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [date, endHour, plannerZoom, startHour])

  // SQLite 일정도 기존 설정의 데스크톱 알림을 그대로 사용한다. 권한 요청은
  // 사용자 동작이 아니므로 여기서 하지 않고, 이미 허용된 경우에만 알린다.
  useEffect(() => {
    if (!plannerNotifyBefore || date !== todayStr() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const timers = events
      .filter(event => !event.done && event.scheduled !== false)
      .map(event => {
        const fireMin = timeToMin(event.start) - plannerNotifyBefore
        const delay = (fireMin - nowMin) * 60_000
        if (delay <= 0) return null
        return window.setTimeout(() => {
          new Notification(`📅 ${event.title}`, { body: `${event.start} 시작 — ${plannerNotifyBefore}분 후` })
        }, delay)
      })
      .filter((timer): timer is number => timer !== null)
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [date, events, plannerNotifyBefore])

  const persistEventUpdate = useCallback(async (event: StoredPlannerEvent, next: PlannerEventInput) => {
    if (!hasValidTimeRange(next.start, next.end)) {
      toast.error(t.planner.day.eventTimeOrderError)
      return
    }
    setSavingEventId(event.id)
    try {
      const updated = await plannerStoreApi.updateEvent(next, event.revision)
      setEvents(current => updated.date === date
        ? current.map(item => item.id === updated.id ? updated : item).sort((a, b) => a.start.localeCompare(b.start))
        : current.filter(item => item.id !== updated.id))
    } catch (error) {
      if (error instanceof PlannerStoreRequestError && error.status === 409) {
        await loadEvents(date)
        toast.error(t.planner.day.timelineConflict, {
          action: {
            label: t.planner.day.reapplyChange,
            onClick: () => {
              const latest = eventsRef.current.find(item => item.id === event.id)
              if (latest) void persistEventUpdate(latest, { ...next, id: latest.id })
              else toast.error(t.planner.day.eventConflictGone)
            },
          },
        })
      } else {
        toast.error(error instanceof Error ? error.message : t.planner.day.timelineSaveError, {
          action: { label: t.planner.day.retrySave, onClick: () => { void persistEventUpdate(event, next) } },
        })
      }
    } finally {
      setSavingEventId(null)
    }
  }, [date, loadEvents, t])

  const planEvents = useMemo(
    () => events.filter(event => !hideDone || !event.done).map(toPlanEvent),
    [events, hideDone],
  )

  const handleTimelineUpsert = useCallback((next: PlanEvent) => {
    const original = eventsRef.current.find(event => event.id === next.id)
    if (!original) return
    void persistEventUpdate(original, { ...eventInput(original), start: next.start, end: next.end })
  }, [persistEventUpdate])

  const {
    draggingId,
    dragPreviewTop,
    resizingId,
    resizePreviewHeight,
    startDrag,
    startResize,
    consumeDraggedClick,
  } = usePlannerEventDrag({
    hourPx: plannerZoom,
    startHour,
    endHour,
    snapMin: plannerSnapMin,
    onUpsertEvent: handleTimelineUpsert,
    onSelectEvent: setSelectedEventId,
  })

  // 빈 슬롯 클릭은 현재 스냅 설정을 적용한 한 시간짜리 새 일정만 준비한다.
  // Python으로 치면: form = {start: snap(click_y), end: start + 60}
  const handleTimelineClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (consumeDraggedClick() || (event.target as HTMLElement).closest('button') || newForm) return
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return
    const start = yToTime(event.clientY - rect.top, plannerZoom, startHour, endHour, plannerSnapMin)
    const end = minToTime(Math.min(timeToMin(start) + 60, endHour * 60))
    setNewForm({ start, end })
    setNewTitle('')
    setNewColor('blue')
  }, [consumeDraggedClick, endHour, newForm, plannerSnapMin, plannerZoom, startHour])

  const saveNewEvent = useCallback(async () => {
    if (!newForm || !newTitle.trim()) {
      toast.error(t.planner.day.eventTitleRequired)
      return
    }
    if (!hasValidTimeRange(newForm.start, newForm.end)) {
      toast.error(t.planner.day.eventTimeOrderError)
      return
    }
    const id = crypto.randomUUID()
    setSavingEventId(id)
    try {
      const created = await plannerStoreApi.createEvent({
        id, date, title: newTitle.trim(), start: newForm.start, end: newForm.end,
        color: newColor, done: false, scheduled: true, source: 'manual',
      })
      setEvents(current => [...current, created].sort((a, b) => a.start.localeCompare(b.start)))
      setNewForm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.day.timelineSaveError)
    } finally {
      setSavingEventId(null)
    }
  }, [date, newColor, newForm, newTitle, t])

  // 전역 AI의 "적용"은 SQLite에서 곧바로 쓰지 않고 검토 가능한 제안 diff를 만든다.
  // Python으로 치면: on('ai-apply-schedule', lambda text: set_preview(parse(text, snapshot)))
  useEffect(() => {
    activeSqliteTimelineId = blockId
    const receiveProposal = (event: Event) => {
      if (activeSqliteTimelineId !== blockId) return
      const proposal = parseAiProposal((event as CustomEvent<string>).detail, date, events)
      if (!proposal) {
        toast.error('AI 응답에서 적용할 유효한 일정 JSON을 찾지 못했습니다.')
        return
      }
      setAiProposal(proposal)
      toast.success('AI 일정 제안을 검토한 뒤 적용할 수 있습니다.')
    }
    window.addEventListener('ai-apply-schedule', receiveProposal)
    return () => {
      window.removeEventListener('ai-apply-schedule', receiveProposal)
      if (activeSqliteTimelineId === blockId) activeSqliteTimelineId = null
    }
  }, [blockId, date, events])

  const applyAiProposal = useCallback(async () => {
    if (!aiProposal) return
    try {
      await plannerStoreApi.applyBatch(aiProposal.creates, aiProposal.deletes)
      setAiProposal(null)
      await loadEvents(date)
      toast.success('AI 일정 제안을 모두 적용했습니다.')
    } catch (error) {
      setAiProposal(null)
      await loadEvents(date)
      toast.error(error instanceof Error ? error.message : 'AI 일정 제안을 적용하지 못했습니다.')
    }
  }, [aiProposal, date, loadEvents])

  const dragEvent = draggingId ? planEvents.find(event => event.id === draggingId) ?? null : null
  const resizeEvent = resizingId ? planEvents.find(event => event.id === resizingId) ?? null : null

  return (
    <div className="rounded-xl border border-blue-200 bg-white shadow-sm" data-ai-block="dayplanner" onClick={() => { activeSqliteTimelineId = blockId; window.dispatchEvent(new CustomEvent('ai-block-select', { detail: { blockId, blockType: 'dayplanner' } })) }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 px-4 py-3">
        <span className="text-sm font-semibold text-gray-700">{t.planner.day.sqliteTimelineTitle}</span>
        {weather && <span className="rounded bg-sky-50 px-2 py-1 text-[11px] text-sky-700" title={`${weatherLocation} 날씨`}>{weather.icon} {weather.temp}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setDate(value => shiftDate(value, -1))} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronLeft size={15} /></button>
          <input type="date" value={date} onChange={event => setDate(event.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-400" />
          <button type="button" onClick={() => setDate(value => shiftDate(value, 1))} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronRight size={15} /></button>
          <button type="button" onClick={() => setHideDone(value => !value)} title={hideDone ? t.planner.day.showCompleted : t.planner.day.hideCompleted} className="ml-1 rounded p-1.5 text-gray-500 hover:bg-gray-100">
            {hideDone ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>
      </div>

      <div className="h-[640px] overflow-y-auto p-3">
        <PlannerTimeline
          events={planEvents}
          hourPx={plannerZoom}
          startHour={startHour}
          endHour={endHour}
          nowTop={nowTop}
          timelineRef={timelineRef}
          onTimelineClick={handleTimelineClick}
          onEventMouseDown={startDrag}
          onResizeMouseDown={startResize}
          selectedEventId={selectedEventId}
          draggingId={draggingId}
          resizingId={resizingId}
          editable
        >
          {dragEvent && dragPreviewTop !== null && (() => {
            const px = eventPx(dragEvent, plannerZoom, startHour, endHour)
            if (!px) return null
            const duration = timeToMin(dragEvent.end) - timeToMin(dragEvent.start)
            const nextStart = Math.max(startHour * 60, Math.min(endHour * 60 - duration, Math.round(dragPreviewTop / (plannerZoom / 60) / plannerSnapMin) * plannerSnapMin + startHour * 60))
            const color = getColor(dragEvent.color)
            return <div style={{ position: 'absolute', top: dragPreviewTop + 1, height: px.height - 2, left: 2, right: 2, zIndex: 25 }} className={`pointer-events-none rounded-lg px-2 py-1 shadow-lg ring-2 ring-white/70 ${color.bg} ${color.text}`}><p className="text-[11px] font-semibold">{dragEvent.title}</p><p className="text-[9px]">{minToTime(nextStart)} – {minToTime(nextStart + duration)}</p></div>
          })()}
          {resizeEvent && resizePreviewHeight !== null && (() => {
            const px = eventPx(resizeEvent, plannerZoom, startHour, endHour)
            if (!px) return null
            const nextEnd = Math.min(endHour * 60, Math.max(timeToMin(resizeEvent.start) + plannerSnapMin, Math.round(resizePreviewHeight / (plannerZoom / 60) / plannerSnapMin) * plannerSnapMin + timeToMin(resizeEvent.start)))
            const color = getColor(resizeEvent.color)
            return <div style={{ position: 'absolute', top: px.top + 1, height: resizePreviewHeight - 2, left: 2, right: 2, zIndex: 25 }} className={`pointer-events-none rounded-lg px-2 py-1 shadow-lg ring-2 ring-white/70 ${color.bg} ${color.text}`}><p className="text-[11px] font-semibold">{resizeEvent.title}</p><p className="text-[9px]">{resizeEvent.start} – {minToTime(nextEnd)}</p></div>
          })()}
        </PlannerTimeline>
      </div>

      <div className="border-t border-gray-100 px-4 py-2 text-right text-[11px] text-gray-400">
        {savingEventId ? t.planner.day.eventSaving : t.planner.day.timelineHint}
      </div>

      {aiProposal && <div className="border-t border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-800"><Bot size={14} /> AI 제안: {aiProposal.action === 'replace' ? '기존 수동 일정 교체' : '일정 추가'}</div>
        <p className="mt-1 text-[11px] text-indigo-700">추가 {aiProposal.creates.length}개 · 삭제 {aiProposal.deletes.length}개. 적용 전에는 SQLite 일정이 바뀌지 않습니다.</p>
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-indigo-800">{aiProposal.creates.map(event => <li key={event.id}>+ {event.start}–{event.end} {event.title}</li>)}</ul>
        <div className="mt-2 flex gap-1.5"><button type="button" onClick={() => void applyAiProposal()} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"><Check size={12} /> 제안 적용</button><button type="button" onClick={() => setAiProposal(null)} className="rounded border border-indigo-200 bg-white px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100">취소</button></div>
      </div>}

      <SqliteRoutineManager date={date} />

      {newForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setNewForm(null)}>
          <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-700">{t.planner.day.timelineAddEvent}</h2><button type="button" onClick={() => setNewForm(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={15} /></button></div>
            <div className="flex flex-col gap-2">
              <input autoFocus value={newTitle} placeholder={t.planner.day.eventNamePlaceholder} onChange={event => setNewTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void saveNewEvent() }} className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:border-blue-400" />
              <div className="flex items-center gap-1.5"><input type="time" value={newForm.start} onChange={event => setNewForm(current => current ? { ...current, start: event.target.value } : current)} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs" /><span className="text-xs text-gray-400">~</span><input type="time" value={newForm.end} onChange={event => setNewForm(current => current ? { ...current, end: event.target.value } : current)} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs" /></div>
              <div className="flex flex-wrap gap-1.5">{EVENT_COLORS.map(color => <button key={color.id} type="button" title={color.id} onClick={() => setNewColor(color.id)} className={`h-4 w-4 rounded-full ${color.dot} ${newColor === color.id ? 'scale-110 ring-2 ring-gray-400 ring-offset-1' : ''}`} />)}</div>
              <button type="button" disabled={savingEventId !== null} onClick={() => void saveNewEvent()} className="mt-1 flex items-center justify-center gap-1 rounded-lg bg-blue-500 px-2.5 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"><Plus size={13} /> {t.planner.day.addBtn}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
