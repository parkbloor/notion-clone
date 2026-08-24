'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { PLANNER_EVENTS_CHANGED_EVENT, PLANNER_OPEN_DATE_EVENT, PlannerStoreRequestError, plannerStoreApi, type StoredPlannerEvent } from '@/lib/plannerStore'

function today(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function shift(date: string, days: number): string { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function weekStart(date: string): string { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) }
function monthStart(date: string): string { const d = new Date(`${date}T00:00:00`); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function monthEnd(start: string): string { const d = new Date(`${start}T00:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10) }
function label(date: string): string { const d = new Date(`${date}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}` }

export function SqliteWeekSchedule() {
  const [start, setStart] = useState(() => weekStart(today()))
  const [events, setEvents] = useState<StoredPlannerEvent[]>([])
  const end = useMemo(() => shift(start, 6), [start])
  const load = useCallback(async () => { try { setEvents(await plannerStoreApi.listEvents(start, end)) } catch (error) { toast.error(error instanceof Error ? error.message : '주간 일정을 불러오지 못했습니다.') } }, [end, start])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const refresh = () => void load(); window.addEventListener(PLANNER_EVENTS_CHANGED_EVENT, refresh); return () => window.removeEventListener(PLANNER_EVENTS_CHANGED_EVENT, refresh) }, [load])
  const move = useCallback(async (event: StoredPlannerEvent, date: string) => { if (event.date === date) return; try { const updated = await plannerStoreApi.updateEvent({ id: event.id, date, title: event.title, start: event.start, end: event.end, color: event.color, done: event.done, scheduled: event.scheduled, clockIn: event.clockIn, clockOut: event.clockOut, elapsed: event.elapsed, log: event.log, subtasks: event.subtasks, energy: event.energy, source: event.source, routineId: event.routineId }, event.revision); setEvents(current => current.map(item => item.id === updated.id ? updated : item)) } catch (error) { if (error instanceof PlannerStoreRequestError && error.status === 409) await load(); toast.error(error instanceof Error ? error.message : '일정 이동을 저장하지 못했습니다.') } }, [load])
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shift(start, index)), [start])
  return <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center gap-2"><button type="button" onClick={() => setStart(value => shift(value, -7))}><ChevronLeft size={15} /></button><strong className="flex-1 text-sm text-gray-700">SQLite 주간 타임라인 · {label(start)}–{label(end)}</strong><button type="button" onClick={() => setStart(value => shift(value, 7))}><ChevronRight size={15} /></button></div><div className="grid grid-cols-7 gap-1 overflow-x-auto">{dates.map(date => <div key={date} onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData('text/plain'); const found = events.find(item => item.id === id); if (found) void move(found, date) }} className="min-h-36 min-w-24 rounded-lg border border-gray-100 bg-gray-50 p-1.5"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent(PLANNER_OPEN_DATE_EVENT, { detail: date }))} className={`mb-1 text-[11px] font-semibold ${date === today() ? 'text-blue-600' : 'text-gray-500'}`}>{label(date)} ({['일','월','화','수','목','금','토'][new Date(`${date}T00:00:00`).getDay()]})</button>{events.filter(event => event.date === date).map(event => <div key={event.id} draggable onDragStart={drag => drag.dataTransfer.setData('text/plain', event.id)} className={`mb-1 cursor-grab rounded px-1.5 py-1 text-[10px] text-white ${event.done ? 'bg-gray-400 line-through' : 'bg-blue-400'}`}>{event.start} {event.title}</div>)}</div>)}</div><p className="mt-2 text-[10px] text-gray-400">카드를 다른 날짜로 끌면 날짜와 시간이 하나의 revision 저장으로 유지됩니다.</p></div>
}

export function SqliteMonthSchedule() {
  const [month, setMonth] = useState(() => monthStart(today()))
  const [events, setEvents] = useState<StoredPlannerEvent[]>([])
  const end = useMemo(() => monthEnd(month), [month])
  useEffect(() => { void plannerStoreApi.listEvents(month, end).then(setEvents).catch(() => toast.error('월간 일정을 불러오지 못했습니다.')) }, [end, month])
  const days = useMemo(() => { const first = new Date(`${month}T00:00:00`); const lead = first.getDay(); const total = Number(end.slice(-2)); return Array.from({ length: lead + total }, (_, index) => index < lead ? null : shift(month, index - lead)) }, [end, month])
  return <div className="rounded-xl border border-violet-200 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center gap-2"><button type="button" onClick={() => setMonth(value => monthStart(shift(value, -1)))}><ChevronLeft size={15} /></button><strong className="flex-1 text-sm text-gray-700">SQLite 월간 일정 · {month.slice(0, 7)}</strong><button type="button" onClick={() => setMonth(() => monthStart(shift(end, 1)))}><ChevronRight size={15} /></button></div><div className="grid grid-cols-7 gap-px rounded border border-gray-100 bg-gray-100">{['일','월','화','수','목','금','토'].map(day => <span key={day} className="bg-white px-1 py-1 text-center text-[10px] text-gray-400">{day}</span>)}{days.map((date, index) => <button key={date ?? `empty-${index}`} type="button" disabled={!date} onClick={() => date && window.dispatchEvent(new CustomEvent(PLANNER_OPEN_DATE_EVENT, { detail: date }))} className="min-h-16 bg-white p-1 text-left hover:bg-violet-50 disabled:hover:bg-white">{date && <><span className={`text-[10px] ${date === today() ? 'font-bold text-violet-600' : 'text-gray-500'}`}>{date.slice(-2)}</span><span className="ml-1 text-[9px] text-gray-400">{events.filter(event => event.date === date).length}개</span><div className="mt-1 flex gap-0.5">{events.filter(event => event.date === date).slice(0, 5).map(event => <i key={event.id} className={`h-1.5 w-1.5 rounded-full ${event.done ? 'bg-gray-300' : 'bg-violet-400'}`} />)}</div></>}</button>)}</div><p className="mt-2 text-[10px] text-gray-400">날짜를 누르면 같은 날짜의 우측 일정 패널을 엽니다. 점은 완료 여부를 구분합니다.</p></div>
}
