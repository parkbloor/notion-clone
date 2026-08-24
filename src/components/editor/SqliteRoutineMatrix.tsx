// =============================================
// src/components/editor/SqliteRoutineMatrix.tsx
// 역할: SQLite 단일 원본의 주간 루틴 완료 매트릭스
// Python으로 치면: class SqliteRoutineMatrix(QWidget): ...
// =============================================

'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  isRoutineApplicable,
  shiftPlannerDate,
  summarizeSqlitePlannerRange,
  usePlannerDates,
  useSqlitePlannerRange,
} from '@/lib/sqlitePlannerRange'

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monday(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return formatDate(date)
}

// =============================================
export default function SqliteRoutineMatrix() {
  const [start, setStart] = useState(() => monday(formatDate(new Date())))
  const end = useMemo(() => shiftPlannerDate(start, 6), [start])
  const dates = usePlannerDates(start, 7)
  const { events, routines, loading, error } = useSqlitePlannerRange(true, start, end)
  const activeRoutines = routines.filter(routine => routine.active)
  const summary = useMemo(() => summarizeSqlitePlannerRange(events, routines, dates), [dates, events, routines])

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <strong className="flex-1 text-sm text-gray-700">SQLite 루틴 매트릭스</strong>
        <button type="button" aria-label="이전 주" onClick={() => setStart(value => shiftPlannerDate(value, -7))} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronLeft size={15} /></button>
        <span className="text-xs text-gray-500">{start}–{end}</span>
        <button type="button" aria-label="다음 주" onClick={() => setStart(value => shiftPlannerDate(value, 7))} className="rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronRight size={15} /></button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : loading ? <p className="text-xs text-gray-400">루틴 통계를 불러오는 중…</p> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs">
              <thead><tr><th className="p-1 text-left text-gray-400">루틴</th>{dates.map(date => <th key={date} className="p-1 text-gray-400">{date.slice(-2)}</th>)}<th className="p-1 text-gray-400">달성</th></tr></thead>
              <tbody>{activeRoutines.map(routine => {
                const applicable = dates.filter(date => isRoutineApplicable(routine, date))
                const done = applicable.filter(date => events.some(event => event.date === date && event.routineId === routine.id && event.done)).length
                return <tr key={routine.id} className="border-t border-gray-100"><td className="p-1 text-left text-gray-600">{routine.title}</td>{dates.map(date => {
                  const event = events.find(item => item.date === date && item.routineId === routine.id)
                  const isApplicable = isRoutineApplicable(routine, date)
                  return <td key={date} className="p-1">{event ? event.done ? '✓' : '○' : isApplicable ? '–' : '·'}</td>
                })}<td className="p-1 text-emerald-700">{applicable.length ? Math.round(done / applicable.length * 100) : 0}%</td></tr>
              })}</tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-gray-500">루틴 {summary.completed}/{summary.applicable} · 계획 {summary.plannedMinutes}분 · 실제 {summary.completedMinutes}분 · 활동 {summary.activityDays}일</p>
        </>
      )}
    </div>
  )
}
