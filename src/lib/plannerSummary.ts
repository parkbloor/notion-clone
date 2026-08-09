import type { Page, PlanEvent } from '@/types/block'

export interface PlannerCalendarEntry {
  date: string
  event: PlanEvent
}

export interface PlannerPeriodSummary {
  totalEvents: number
  completedEvents: number
  completionRate: number
  plannedMinutes: number
  completedMinutes: number
  routineEvents: number
  completedRoutineEvents: number
  routineCompletionRate: number
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isPlanEvent(value: unknown): value is PlanEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<PlanEvent>
  return typeof event.id === 'string'
    && typeof event.title === 'string'
    && typeof event.start === 'string'
    && typeof event.end === 'string'
    && typeof event.done === 'boolean'
}

export function collectPlannerCalendarEntries(
  pages: Page[],
  archive: Record<string, PlanEvent[]> = {},
): PlannerCalendarEntry[] {
  const byIdentity = new Map<string, PlannerCalendarEntry>()

  function addEntries(date: string, values: unknown) {
    if (!DATE_KEY_PATTERN.test(date) || !Array.isArray(values)) return
    for (const value of values) {
      if (!isPlanEvent(value)) continue
      const key = `${date}:${value.id}`
      if (!byIdentity.has(key)) byIdentity.set(key, { date, event: value })
    }
  }

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      if (block.type !== 'dayplanner') continue
      try {
        const parsed = JSON.parse(block.content || '{}') as { eventsByDate?: unknown }
        if (!parsed.eventsByDate || typeof parsed.eventsByDate !== 'object') continue
        for (const [date, values] of Object.entries(parsed.eventsByDate)) addEntries(date, values)
      } catch {
        // 손상된 플래너 블록 하나가 전체 통계를 막지 않게 건너뛴다.
      }
    }
  }

  for (const [date, values] of Object.entries(archive)) addEntries(date, values)
  return [...byIdentity.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute !== 0)) return null
  return hour * 60 + minute
}

function eventDuration(event: PlanEvent): number {
  if (event.scheduled === false) return 0
  const start = timeToMinutes(event.start)
  const end = timeToMinutes(event.end)
  return start === null || end === null ? 0 : Math.max(0, end - start)
}

export function summarizePlannerPeriod(
  entries: PlannerCalendarEntry[],
  startDate: string,
  endDate: string,
): PlannerPeriodSummary {
  const periodEntries = DATE_KEY_PATTERN.test(startDate) && DATE_KEY_PATTERN.test(endDate)
    ? entries.filter(entry => entry.date >= startDate && entry.date <= endDate)
    : []
  const completedEntries = periodEntries.filter(entry => entry.event.done)
  const routineEntries = periodEntries.filter(entry => entry.event.source === 'routine')
  const completedRoutineEntries = routineEntries.filter(entry => entry.event.done)
  const plannedMinutes = periodEntries.reduce((total, entry) => total + eventDuration(entry.event), 0)
  const completedMinutes = completedEntries.reduce((total, entry) => total + eventDuration(entry.event), 0)

  return {
    totalEvents: periodEntries.length,
    completedEvents: completedEntries.length,
    completionRate: periodEntries.length > 0 ? Math.round((completedEntries.length / periodEntries.length) * 100) : 0,
    plannedMinutes,
    completedMinutes,
    routineEvents: routineEntries.length,
    completedRoutineEvents: completedRoutineEntries.length,
    routineCompletionRate: routineEntries.length > 0
      ? Math.round((completedRoutineEntries.length / routineEntries.length) * 100)
      : 0,
  }
}
