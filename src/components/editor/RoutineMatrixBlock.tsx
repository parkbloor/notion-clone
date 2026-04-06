// =============================================
// src/components/editor/RoutineMatrixBlock.tsx
// 역할: 루틴 달성 매트릭스 독립 블록
//   - 주간 이동 네비게이션
//   - 모든 페이지의 DayPlannerBlock을 스캔해 루틴 완료 여부 집계
//   - 요일별 ✅ / ✗ / ─ 표시 + 주간 달성률
// Python으로 치면: class RoutineMatrixBlock(QWidget): ...
// =============================================

'use client'

import { useMemo, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PlannerData } from './DayPlannerBlock'
import { useSettingsStore } from '@/store/settingsStore'
import { useLocale } from '@/locales'

// ── 날짜 유틸 ─────────────────────────────────
// Python으로 치면: def format_date(d): return d.strftime('%Y-%m-%d')
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}
function todayStr(): string { return fmtDate(new Date()) }

// 해당 날짜가 속한 주의 월요일 반환
// Python으로 치면: monday = today - timedelta(days=today.weekday())
function getMondayOf(ds: string): string {
  const d = new Date(ds + 'T00:00:00')
  const dow = d.getDay()               // 0=일 ~ 6=토
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return fmtDate(d)
}

// ── 데이터 타입 ───────────────────────────────
// content JSON: { weekStart: 'YYYY-MM-DD' }
// Python으로 치면: @dataclass class RoutineMatrixData: week_start: str
interface RoutineMatrixData {
  weekStart: string   // 월요일 기준 날짜
}

// =============================================
// RoutineMatrixBlock — 메인 컴포넌트
// =============================================
interface Props { block: Block; pageId: string }

export default function RoutineMatrixBlock({ block, pageId }: Props) {
  const t = useLocale()
  const updateBlock    = usePageStore(s => s.updateBlock)
  const pages          = usePageStore(s => s.pages)
  // 루틴 프리셋을 settingsStore에서 직접 읽음 (block.content와 분리됨)
  // Python으로 치면: routines = settings_store.planner_routines
  const plannerRoutines = useSettingsStore(s => s.plannerRoutines)

  // ── 콘텐츠 파싱 ──────────────────────────────
  // Python으로 치면: data = json.loads(block.content) if block.content else {}
  const data: RoutineMatrixData = useMemo(() => {
    try {
      const p = JSON.parse(block.content || '{}')
      return { weekStart: p.weekStart ?? getMondayOf(todayStr()) }
    } catch {
      return { weekStart: getMondayOf(todayStr()) }
    }
  }, [block.content])

  const save = useCallback((next: RoutineMatrixData) => {
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 이번 주 7개 날짜 ─────────────────────────
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(data.weekStart, i)),
    [data.weekStart]
  )

  // ── 주차 이동 ─────────────────────────────────
  const prevWeek = () => save({ weekStart: addDays(data.weekStart, -7) })
  const nextWeek = () => save({ weekStart: addDays(data.weekStart,  7) })
  const goToday  = () => save({ weekStart: getMondayOf(todayStr()) })

  // ── 주 범위 레이블 ────────────────────────────
  const weekLabel = useMemo(() => {
    const end = addDays(data.weekStart, 6)
    const s = new Date(data.weekStart + 'T00:00:00')
    const e = new Date(end            + 'T00:00:00')
    return t.planner.routine.weekLabelFmt
      .replace('{year}', String(s.getFullYear()))
      .replace('{start}', `${s.getMonth()+1}/${s.getDate()}`)
      .replace('{end}', `${e.getMonth()+1}/${e.getDate()}`)
  }, [data.weekStart, t])

  // ── 루틴 달성 매트릭스 집계 ───────────────────
  // 루틴 목록: settingsStore.plannerRoutines
  // 이벤트: 모든 DayPlannerBlock의 eventsByDate에서 이번 주 날짜 데이터 수집
  // Python으로 치면: def build_matrix(pages, week_dates, routines) -> dict: ...
  const matrix = useMemo(() => {
    // { routineTitle: { date: true(완료) | false(미완료) | undefined(데이터 없음) } }
    const map: Record<string, Record<string, boolean | undefined>> = {}

    pages.forEach(page => {
      page.blocks.forEach(b => {
        if (b.type !== 'dayplanner') return
        try {
          const d = JSON.parse(b.content || '{}') as PlannerData
          // 이번 주 날짜별로 루틴 완료 여부 수집
          weekDates.forEach(date => {
            const dayEvents = d.eventsByDate?.[date] ?? []
            dayEvents.forEach(ev => {
              const matched = plannerRoutines.find(r => r.title === ev.title && r.start === ev.start)
              if (!matched) return
              if (!map[matched.title]) map[matched.title] = {}
              const prev = map[matched.title][date]
              map[matched.title][date] = prev === true ? true : ev.done
            })
          })
        } catch {}
      })
    })

    const titles = plannerRoutines.map(r => r.title)
    return { titles, map }
  }, [pages, weekDates, plannerRoutines])

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white select-none w-full overflow-hidden"
      onContextMenu={e => e.stopPropagation()}
    >
      {/* ── 헤더 ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-bold text-gray-700">{t.planner.routine.header}</span>
        <div className="flex-1" />
        <button type="button" onClick={prevWeek}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-gray-500 font-medium">{weekLabel}</span>
        <button type="button" onClick={nextWeek}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronRight size={14} />
        </button>
        <button type="button" onClick={goToday}
          className="text-[10px] text-blue-500 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors">
          {t.planner.routine.thisWeek}
        </button>
      </div>

      {/* ── 매트릭스 본문 ─────────────────────── */}
      <div className="px-4 py-3">
        {matrix.titles.length === 0 ? (
          // 루틴이 없거나 이번 주 DayPlannerBlock 데이터 없음
          <div className="text-center py-6 text-sm text-gray-300">
            <div className="text-2xl mb-2">📋</div>
            <div>{t.planner.routine.noDataMsg}</div>
            <div className="text-xs text-gray-200 mt-1">{t.planner.routine.noDataHint}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {/* 루틴 이름 컬럼 헤더 */}
                  <th className="text-left text-xs text-gray-400 font-semibold pb-2 pr-4 min-w-28">{t.planner.routine.routineHeader}</th>
                  {/* 요일 헤더 */}
                  {weekDates.map((date, i) => {
                    const dow    = new Date(date + 'T00:00:00').getDay()
                    const isToday = date === todayStr()
                    return (
                      <th key={date} className={[
                        'text-center text-xs font-semibold pb-2 w-10',
                        isToday  ? 'text-blue-500'
                          : dow === 6 ? 'text-blue-400'
                          : dow === 0 ? 'text-red-400'
                          : 'text-gray-400',
                      ].join(' ')}>
                        <div>{t.planner.week.days[i]}</div>
                        {/* 날짜 숫자 (작게) */}
                        <div className={[
                          'text-[10px] font-normal mt-0.5',
                          isToday ? 'text-blue-400' : 'text-gray-300',
                        ].join(' ')}>
                          {new Date(date + 'T00:00:00').getDate()}
                        </div>
                      </th>
                    )
                  })}
                  {/* 달성률 컬럼 헤더 */}
                  <th className="text-center text-xs text-gray-400 font-semibold pb-2 pl-3 min-w-12">{t.planner.routine.achieveRateHeader}</th>
                </tr>
              </thead>
              <tbody>
                {matrix.titles.map(title => {
                  // 완료 수 / 데이터 있는 날 수 집계
                  const doneCount  = weekDates.filter(d => matrix.map[title]?.[d] === true).length
                  const totalSet   = weekDates.filter(d => matrix.map[title]?.[d] !== undefined).length
                  const pct        = totalSet > 0 ? Math.round(doneCount / totalSet * 100) : null

                  return (
                    <tr key={title} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      {/* 루틴 이름 */}
                      <td className="text-xs text-gray-700 font-medium pr-4 py-2 truncate max-w-32">
                        {title}
                      </td>
                      {/* 요일별 완료 여부 */}
                      {weekDates.map(date => {
                        const status = matrix.map[title]?.[date]
                        return (
                          <td key={date} className="text-center py-2">
                            {status === true  ? <span className="text-base leading-none">✅</span>
                           : status === false ? <span className="text-red-300 text-sm font-bold">✗</span>
                           :                    <span className="text-gray-200 text-sm">─</span>}
                          </td>
                        )
                      })}
                      {/* 달성률 배지 */}
                      <td className="text-center py-2 pl-3">
                        {pct === null ? (
                          <span className="text-xs text-gray-300">─</span>
                        ) : (
                          <span className={[
                            'text-xs font-bold px-2 py-0.5 rounded-full',
                            pct >= 80 ? 'bg-emerald-100 text-emerald-600'
                              : pct >= 50 ? 'bg-amber-100 text-amber-600'
                              : 'bg-red-100 text-red-500',
                          ].join(' ')}>
                            {pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* ── 하단 요약 행: 전체 달성률 ──────── */}
              {matrix.titles.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-100">
                    <td className="text-xs text-gray-400 font-semibold pt-2 pr-4">전체</td>
                    {weekDates.map(date => {
                      // 해당 날짜의 전체 루틴 중 완료 비율
                      const total = matrix.titles.filter(title => matrix.map[title]?.[date] !== undefined).length
                      const done  = matrix.titles.filter(title => matrix.map[title]?.[date] === true).length
                      return (
                        <td key={date} className="text-center pt-2">
                          {total === 0 ? (
                            <span className="text-gray-200 text-xs">─</span>
                          ) : (
                            <span className={[
                              'text-[10px] font-semibold',
                              done / total >= 0.8 ? 'text-emerald-500'
                                : done / total >= 0.5 ? 'text-amber-500'
                                : 'text-red-400',
                            ].join(' ')}>
                              {done}/{total}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
