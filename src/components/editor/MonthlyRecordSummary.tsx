'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '@/locales'
import { plannerApi } from '@/lib/api'
import {
  collectPlannerCalendarEntries,
  summarizePlannerPeriod,
} from '@/lib/plannerSummary'
import { usePageStore } from '@/store/pageStore'
import type { Page, PlanEvent } from '@/types/block'
import { PLANNER_EVENTS_CHANGED_EVENT, plannerStoreApi, type StoredPlannerEvent } from '@/lib/plannerStore'
import { usePlannerStoreMode } from '@/lib/usePlannerStoreMode'
import {
  collectRecordCalendarEntries,
  summarizeRecordCalendarPeriod,
  type RecordCalendarEntry,
  type RecordSummaryPeriod,
} from '@/lib/recordCalendar'

interface MonthlyRecordSummaryProps {
  pages: Page[]
  onOpenRecord?: (record: RecordCalendarEntry) => void
}

interface PeriodAnchor {
  year: number
  month: number
}

function currentPeriodAnchor(): PeriodAnchor {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function shiftPeriod(anchor: PeriodAnchor, period: RecordSummaryPeriod, delta: number): PeriodAnchor {
  const monthStep = period === 'quarter' ? 3 : period === 'year' ? 12 : 1
  const next = new Date(anchor.year, anchor.month - 1 + monthStep * delta, 1)
  return { year: next.getFullYear(), month: next.getMonth() + 1 }
}

function formatMinutes(minutes: number, hourUnit: string, minuteUnit: string, zeroText: string): string {
  if (minutes <= 0) return zeroText
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return [hours > 0 ? `${hours}${hourUnit}` : '', remainder > 0 ? `${remainder}${minuteUnit}` : '']
    .filter(Boolean)
    .join(' ')
}

export default function MonthlyRecordSummary({ pages, onOpenRecord }: MonthlyRecordSummaryProps) {
  const t = useLocale()
  const currentVaultName = usePageStore(state => state.currentVaultName)
  const [anchor, setAnchor] = useState(currentPeriodAnchor)
  const [period, setPeriod] = useState<RecordSummaryPeriod>('month')
  const [open, setOpen] = useState(true)
  const [plannerArchive, setPlannerArchive] = useState<Record<string, PlanEvent[]>>({})
  const [storedPlannerEvents, setStoredPlannerEvents] = useState<StoredPlannerEvent[]>([])
  const plannerStoreMode = usePlannerStoreMode()
  const entries = useMemo(() => collectRecordCalendarEntries(pages), [pages])
  const summary = useMemo(
    () => summarizeRecordCalendarPeriod(entries, anchor.year, anchor.month, period),
    [anchor.month, anchor.year, entries, period],
  )
  const plannerEntries = useMemo(() => {
    if (plannerStoreMode === 'legacy') return collectPlannerCalendarEntries(pages, plannerArchive)
    if (plannerStoreMode !== 'sqlite') return []
    return storedPlannerEvents.map(stored => ({
      date: stored.date,
      event: {
        id: stored.id, title: stored.title, start: stored.start, end: stored.end,
        color: stored.color, done: stored.done, scheduled: stored.scheduled ?? undefined,
        elapsed: stored.elapsed ?? undefined,
        source: stored.source === 'routine' ? 'routine' : stored.source === 'manual' ? 'manual' : undefined,
        routineId: stored.routineId ?? undefined,
      } as PlanEvent,
    }))
  }, [pages, plannerArchive, plannerStoreMode, storedPlannerEvents])
  const plannerSummary = useMemo(
    () => summarizePlannerPeriod(plannerEntries, summary.startDate, summary.endDate),
    [plannerEntries, summary.endDate, summary.startDate],
  )
  const periodTabs: Array<{ key: RecordSummaryPeriod; label: string }> = [
    { key: 'month', label: t.overlay.periodic.summaryMonthly },
    { key: 'quarter', label: t.overlay.periodic.summaryQuarterly },
    { key: 'year', label: t.overlay.periodic.summaryYearly },
  ]

  useEffect(() => {
    let cancelled = false
    setPlannerArchive({})
    if (!currentVaultName || plannerStoreMode !== 'legacy') return () => { cancelled = true }
    plannerApi.getArchive()
      .then(archive => { if (!cancelled) setPlannerArchive(archive) })
      .catch(() => { if (!cancelled) setPlannerArchive({}) })
    return () => { cancelled = true }
  }, [currentVaultName, plannerStoreMode])

  useEffect(() => {
    if (plannerStoreMode !== 'sqlite') {
      setStoredPlannerEvents([])
      return
    }
    let cancelled = false
    const load = () => {
      void plannerStoreApi.listEvents(summary.startDate, summary.endDate)
        .then(events => { if (!cancelled) setStoredPlannerEvents(events) })
        .catch(() => { if (!cancelled) setStoredPlannerEvents([]) })
    }
    load()
    window.addEventListener(PLANNER_EVENTS_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(PLANNER_EVENTS_CHANGED_EVENT, load)
    }
  }, [plannerStoreMode, summary.endDate, summary.startDate])

  const completedTime = formatMinutes(
    plannerSummary.completedMinutes,
    t.overlay.periodic.hourShort,
    t.overlay.periodic.minuteShort,
    t.overlay.periodic.noPlannedTime,
  )
  const plannedTime = formatMinutes(
    plannerSummary.plannedMinutes,
    t.overlay.periodic.hourShort,
    t.overlay.periodic.minuteShort,
    t.overlay.periodic.noPlannedTime,
  )

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
      <div className="flex items-center gap-1 px-2 py-2">
        <button type="button" onClick={() => setAnchor(value => shiftPeriod(value, period, -1))}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-amber-600 hover:bg-amber-100"
          aria-label={t.overlay.periodic.previousSummaryPeriod}>‹</button>
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
          className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[11px] font-semibold text-amber-800">
            📊 {summary.label} {t.overlay.periodic.recordSummary}
          </span>
          <span className="block text-[9px] text-amber-600">
            {t.overlay.periodic.monthlySummaryCounts
              .replace('{days}', String(summary.activeDays))
              .replace('{records}', String(summary.totalRecords))}
          </span>
        </button>
        <button type="button" onClick={() => setAnchor(value => shiftPeriod(value, period, 1))}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-amber-600 hover:bg-amber-100"
          aria-label={t.overlay.periodic.nextSummaryPeriod}>›</button>
        <button type="button" onClick={() => setOpen(value => !value)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] text-amber-500 hover:bg-amber-100"
          aria-label={open ? t.overlay.periodic.collapseSummary : t.overlay.periodic.expandSummary}>
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <div className="border-t border-amber-200 px-2 pb-2 pt-2">
          <div className="mb-2 flex rounded-md bg-amber-100/70 p-0.5">
            {periodTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPeriod(tab.key)}
                aria-pressed={period === tab.key}
                className={`flex-1 rounded py-1 text-[9px] font-medium transition-colors ${
                  period === tab.key ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-600 hover:text-amber-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-2 space-y-1 rounded-md border border-amber-100 bg-white/70 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[9px]">
              <span className="font-medium text-gray-500">{t.overlay.periodic.scheduleStats}</span>
              <span className="font-semibold text-gray-700">
                {plannerSummary.completedEvents}/{plannerSummary.totalEvents} · {plannerSummary.completionRate}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[9px]">
              <span className="font-medium text-gray-500">{t.overlay.periodic.plannedTimeStats}</span>
              <span className="text-right font-semibold text-gray-700">
                {completedTime} / {plannedTime}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[9px]">
              <span className="font-medium text-gray-500">{t.overlay.periodic.routineStats}</span>
              {plannerSummary.routineEvents > 0 ? (
                <span className="font-semibold text-gray-700">
                  {plannerSummary.completedRoutineEvents}/{plannerSummary.routineEvents} · {plannerSummary.routineCompletionRate}%
                </span>
              ) : (
                <span className="text-right text-[8px] text-gray-400">{t.overlay.periodic.routineStatsPending}</span>
              )}
            </div>
          </div>

          {summary.kindCounts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {summary.kindCounts.map(item => (
                <span key={item.kind || '__uncategorized__'}
                  className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                  {item.kind || t.overlay.periodic.uncategorizedRecord} {item.count}
                </span>
              ))}
            </div>
          )}

          {summary.dateGroups.length === 0 ? (
            <p className="py-3 text-center text-[10px] text-gray-400">{t.overlay.periodic.noPeriodRecords}</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
              {summary.dateGroups.map(group => (
                <div key={group.date}>
                  <div className="mb-0.5 text-[9px] font-semibold text-gray-400">{group.date}</div>
                  <div className="space-y-0.5">
                    {group.records.map(record => (
                      <button key={`${record.pageId}-${record.blockId}`} type="button"
                        onClick={() => onOpenRecord?.(record)} disabled={!onOpenRecord}
                        className="w-full rounded-md bg-white/80 px-2 py-1.5 text-left transition-colors hover:bg-white disabled:cursor-default"
                        title={t.overlay.periodic.openOriginalRecord}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 text-xs">{record.pageIcon || '📄'}</span>
                          {record.kind && <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[8px] text-amber-700">{record.kind}</span>}
                          <span className="truncate text-[10px] font-medium text-gray-700">
                            {record.title || t.overlay.periodic.untitledRecord}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate pl-5 text-[8px] text-gray-400">{record.pageTitle}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
