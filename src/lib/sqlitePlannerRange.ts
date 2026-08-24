// =============================================
// src/lib/sqlitePlannerRange.ts
// 역할: SQLite 일정 범위 조회와 루틴 통계를 모든 장기 플래너에서 공유
// Python으로 치면: async def load_planner_range(start, end): ...
// =============================================

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  PLANNER_EVENTS_CHANGED_EVENT,
  PLANNER_ROUTINES_CHANGED_EVENT,
  plannerStoreApi,
  type StoredPlannerEvent,
  type StoredPlannerRoutine,
} from '@/lib/plannerStore'

export interface SqlitePlannerRange {
  events: StoredPlannerEvent[]
  routines: StoredPlannerRoutine[]
  loading: boolean
  error: string | null
}

export interface RoutineRangeSummary {
  applicable: number
  completed: number
  plannedMinutes: number
  completedMinutes: number
  activityDays: number
}

// YYYY-MM-DD 문자열을 브라우저 시간대에서 하루 단위로 더한다.
// Python으로 치면: return (date.fromisoformat(value) + timedelta(days=days)).isoformat()
export function shiftPlannerDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 활성 루틴이 날짜에 적용되는지 계산한다. 빈 요일 배열은 매일 반복이다.
// Python으로 치면: return routine.active and (not routine.days or weekday in routine.days)
export function isRoutineApplicable(routine: StoredPlannerRoutine, date: string): boolean {
  return routine.active && (routine.days.length === 0 || routine.days.includes(new Date(`${date}T00:00:00`).getDay()))
}

// SQLite 단일 원본의 범위 데이터만 읽고, 변경 이벤트가 오면 같은 범위를 다시 읽는다.
// Python으로 치면: @reactive_query(start, end) async def refresh(): return gather(events, routines)
export function useSqlitePlannerRange(enabled: boolean, start: string, end: string): SqlitePlannerRange {
  const [events, setEvents] = useState<StoredPlannerEvent[]>([])
  const [routines, setRoutines] = useState<StoredPlannerRoutine[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setEvents([])
      setRoutines([])
      setLoading(false)
      setError(null)
      return
    }

    let disposed = false
    const load = async () => {
      setLoading(true)
      try {
        const [nextEvents, nextRoutines] = await Promise.all([
          plannerStoreApi.listEvents(start, end),
          plannerStoreApi.listRoutines(),
        ])
        if (!disposed) {
          setEvents(nextEvents)
          setRoutines(nextRoutines)
          setError(null)
        }
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : '일정 통계를 불러오지 못했습니다.')
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void load()
    window.addEventListener(PLANNER_EVENTS_CHANGED_EVENT, load)
    window.addEventListener(PLANNER_ROUTINES_CHANGED_EVENT, load)
    return () => {
      disposed = true
      window.removeEventListener(PLANNER_EVENTS_CHANGED_EVENT, load)
      window.removeEventListener(PLANNER_ROUTINES_CHANGED_EVENT, load)
    }
  }, [enabled, end, start])

  return { events, routines, loading, error }
}

// 선택 범위의 계획·실제 시간과 루틴 완료량을 한 원본으로 집계한다.
// Python으로 치면: return summarize(events, routines, dates)
export function summarizeSqlitePlannerRange(
  events: StoredPlannerEvent[],
  routines: StoredPlannerRoutine[],
  dates: string[],
): RoutineRangeSummary {
  const dateSet = new Set(dates)
  const minutes = (event: StoredPlannerEvent) => {
    const [startHour, startMinute] = event.start.split(':').map(Number)
    const [endHour, endMinute] = event.end.split(':').map(Number)
    return Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute)
  }
  const rangeEvents = events.filter(event => dateSet.has(event.date))
  const routineEvents = rangeEvents.filter(event => event.routineId)
  const applicable = routines.reduce((total, routine) => total + dates.filter(date => isRoutineApplicable(routine, date)).length, 0)
  const completed = routineEvents.filter(event => event.done).length
  const plannedMinutes = rangeEvents.filter(event => event.scheduled !== false).reduce((total, event) => total + minutes(event), 0)
  const completedMinutes = rangeEvents.reduce((total, event) => total + (event.elapsed ?? (event.done ? minutes(event) : 0)), 0)
  const activityDays = new Set(rangeEvents.filter(event => event.done || event.elapsed).map(event => event.date)).size
  return { applicable, completed, plannedMinutes, completedMinutes, activityDays }
}

// 날짜별 루틴 달성률을 계산한다. 루틴 이벤트가 없으면 0, 적용 루틴이 없으면 -1이다.
// Python으로 치면: return done_routine_events / applicable_routines if applicable_routines else -1
export function sqliteRoutineRatioForDate(events: StoredPlannerEvent[], routines: StoredPlannerRoutine[], date: string): number {
  const applicable = routines.filter(routine => isRoutineApplicable(routine, date))
  if (applicable.length === 0) return -1
  const completed = applicable.filter(routine => events.some(event => event.date === date && event.routineId === routine.id && event.done)).length
  return completed / applicable.length
}

// 렌더링에서 매번 같은 7/91/371일 배열을 만들지 않도록 날짜 범위를 메모한다.
// Python으로 치면: return [start + timedelta(days=index) for index in range(length)]
export function usePlannerDates(start: string, length: number): string[] {
  return useMemo(() => Array.from({ length }, (_, index) => shiftPlannerDate(start, index)), [length, start])
}
