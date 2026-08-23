import type { PlanEvent } from '@/types/block'

export interface PlannerData {
  eventsByDate: Record<string, PlanEvent[]>
  reviewByDate?: Record<string, string>
}

export type PlannerDataSchema = 'current' | 'legacy' | 'mixed' | 'empty' | 'invalid'

export interface ParsedPlannerData {
  data: PlannerData
  schema: PlannerDataSchema
  writable: boolean
  issues: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergeEvents(legacy: PlanEvent[], current: PlanEvent[]): PlanEvent[] {
  const merged: PlanEvent[] = []
  const positions = new Map<string, number>()
  for (const event of [...legacy, ...current]) {
    const id = isRecord(event) && typeof event.id === 'string' ? event.id : ''
    if (id && positions.has(id)) {
      merged[positions.get(id)!] = event
      continue
    }
    if (id) positions.set(id, merged.length)
    merged.push(event)
  }
  return merged
}

// 구버전 일정은 읽기 호환으로 변환하되, 손상된 구조는 빈 값으로 덮어쓸 수 없게 잠근다.
export function parsePlannerData(content: unknown): ParsedPlannerData {
  let parsed: unknown
  try {
    parsed = typeof content === 'string' && content.trim() ? JSON.parse(content) : {}
  } catch {
    return {
      data: { eventsByDate: {}, reviewByDate: {} },
      schema: 'invalid',
      writable: false,
      issues: ['플래너 JSON을 읽을 수 없습니다.'],
    }
  }
  if (!isRecord(parsed)) {
    return {
      data: { eventsByDate: {}, reviewByDate: {} },
      schema: 'invalid',
      writable: false,
      issues: ['플래너 내용이 객체가 아닙니다.'],
    }
  }

  const issues: string[] = []
  const current: Record<string, PlanEvent[]> = {}
  const eventsByDate = parsed.eventsByDate
  const hasCurrent = isRecord(eventsByDate)
  if (eventsByDate !== undefined && !hasCurrent) issues.push('eventsByDate가 객체가 아닙니다.')
  if (hasCurrent) {
    for (const [date, events] of Object.entries(eventsByDate)) {
      if (!Array.isArray(events)) {
        issues.push(`${date} 일정이 배열이 아닙니다.`)
        continue
      }
      current[date] = events as PlanEvent[]
    }
  }

  const legacy: Record<string, PlanEvent[]> = {}
  const hasLegacyFields = parsed.date !== undefined || parsed.events !== undefined
  const hasLegacy = typeof parsed.date === 'string' && Array.isArray(parsed.events)
  if (hasLegacy) legacy[parsed.date as string] = parsed.events as PlanEvent[]
  else if (hasLegacyFields) issues.push('구버전 date/events 형식이 완전하지 않습니다.')

  const reviewByDate: Record<string, string> = {}
  if (parsed.reviewByDate !== undefined && !isRecord(parsed.reviewByDate)) {
    issues.push('reviewByDate가 객체가 아닙니다.')
  } else if (isRecord(parsed.reviewByDate)) {
    for (const [date, review] of Object.entries(parsed.reviewByDate)) {
      if (typeof review === 'string') reviewByDate[date] = review
      else issues.push(`${date} 회고가 문자열이 아닙니다.`)
    }
  }

  const combined: Record<string, PlanEvent[]> = { ...legacy }
  for (const [date, events] of Object.entries(current)) {
    combined[date] = mergeEvents(combined[date] ?? [], events)
  }

  const schema: PlannerDataSchema = issues.length > 0
    ? 'invalid'
    : hasCurrent && hasLegacy
      ? 'mixed'
      : hasCurrent
        ? 'current'
        : hasLegacy
          ? 'legacy'
          : 'empty'

  return {
    data: { eventsByDate: combined, reviewByDate },
    schema,
    writable: issues.length === 0,
    issues,
  }
}
