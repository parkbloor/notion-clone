// =============================================
// src/components/editor/SqlitePlannerStats.tsx
// 역할: SQLite 일정 단일 원본의 공통 기간 통계 표시
// Python으로 치면: def render_planner_range_stats(events, routines, dates): ...
// =============================================

import type { StoredPlannerEvent, StoredPlannerRoutine } from '@/lib/plannerStore'
import { summarizeSqlitePlannerRange } from '@/lib/sqlitePlannerRange'

interface Props {
  dates: string[]
  events: StoredPlannerEvent[]
  routines: StoredPlannerRoutine[]
}

// =============================================
export default function SqlitePlannerStats({ dates, events, routines }: Props) {
  const summary = summarizeSqlitePlannerRange(events, routines, dates)
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
      <span>루틴 {summary.completed}/{summary.applicable}</span>
      <span>계획 {summary.plannedMinutes}분</span>
      <span>실제 {summary.completedMinutes}분</span>
      <span>활동 {summary.activityDays}일</span>
    </div>
  )
}
