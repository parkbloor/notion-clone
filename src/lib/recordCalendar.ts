import type { Page } from '@/types/block'

export interface RecordCalendarEntry {
  date: string
  title: string
  kind: string
  pageId: string
  pageTitle: string
  pageIcon: string
  blockId: string
}

export type RecordSummaryPeriod = 'month' | 'quarter' | 'year'

export interface RecordPeriodSummary {
  period: RecordSummaryPeriod
  label: string
  startDate: string
  endDate: string
  totalRecords: number
  activeDays: number
  kindCounts: Array<{ kind: string; count: number }>
  dateGroups: Array<{ date: string; records: RecordCalendarEntry[] }>
}

export interface MonthlyRecordSummary extends RecordPeriodSummary {
  month: string
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function collectRecordCalendarEntries(pages: Page[]): RecordCalendarEntry[] {
  const entries: RecordCalendarEntry[] = []

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      if (block.type !== 'record') continue

      try {
        const data = JSON.parse(block.content || '{}') as Partial<Pick<RecordCalendarEntry, 'date' | 'title' | 'kind'>>
        if (typeof data.date !== 'string' || !DATE_KEY_PATTERN.test(data.date)) continue

        entries.push({
          date: data.date,
          title: typeof data.title === 'string' ? data.title.trim() : '',
          kind: typeof data.kind === 'string' ? data.kind.trim() : '',
          pageId: page.id,
          pageTitle: page.title,
          pageIcon: page.icon,
          blockId: block.id,
        })
      } catch {
        // 손상된 기록 헤더 하나가 전체 캘린더 집계를 막지 않게 건너뛴다.
      }
    }
  }

  return entries.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.pageTitle.localeCompare(b.pageTitle, 'ko')
  })
}

export function groupRecordCalendarEntriesByDate(
  entries: RecordCalendarEntry[],
): Map<string, RecordCalendarEntry[]> {
  const grouped = new Map<string, RecordCalendarEntry[]>()

  for (const entry of entries) {
    const records = grouped.get(entry.date)
    if (records) records.push(entry)
    else grouped.set(entry.date, [entry])
  }

  return grouped
}

export function summarizeRecordCalendarMonth(
  entries: RecordCalendarEntry[],
  month: string,
): MonthlyRecordSummary {
  const valid = /^\d{4}-\d{2}$/.test(month)
  const [year, monthNumber] = valid ? month.split('-').map(Number) : [0, 0]
  const summary = summarizeRecordCalendarPeriod(entries, year, monthNumber, 'month')
  return { ...summary, month }
}

export function summarizeRecordCalendarPeriod(
  entries: RecordCalendarEntry[],
  year: number,
  month: number,
  period: RecordSummaryPeriod,
): RecordPeriodSummary {
  const validAnchor = Number.isInteger(year) && year >= 1 && Number.isInteger(month) && month >= 1 && month <= 12
  const quarter = Math.ceil(month / 3)
  const startMonth = period === 'quarter' ? (quarter - 1) * 3 + 1 : period === 'year' ? 1 : month
  const endMonth = period === 'quarter' ? startMonth + 2 : period === 'year' ? 12 : month
  const startDate = validAnchor ? `${year}-${String(startMonth).padStart(2, '0')}-01` : ''
  const lastDay = validAnchor ? new Date(year, endMonth, 0).getDate() : 0
  const endDate = validAnchor ? `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` : ''
  const label = !validAnchor ? '' : period === 'quarter' ? `${year} Q${quarter}` : period === 'year' ? String(year) : `${year}-${String(month).padStart(2, '0')}`
  const periodEntries = validAnchor
    ? entries.filter(entry => entry.date >= startDate && entry.date <= endDate)
    : []
  const recordsByDate = groupRecordCalendarEntriesByDate(periodEntries)
  const kindMap = new Map<string, number>()

  for (const entry of periodEntries) {
    kindMap.set(entry.kind, (kindMap.get(entry.kind) ?? 0) + 1)
  }

  return {
    period,
    label,
    startDate,
    endDate,
    totalRecords: periodEntries.length,
    activeDays: recordsByDate.size,
    kindCounts: [...kindMap.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind, 'ko')),
    dateGroups: [...recordsByDate.entries()]
      .map(([date, records]) => ({ date, records }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  }
}
