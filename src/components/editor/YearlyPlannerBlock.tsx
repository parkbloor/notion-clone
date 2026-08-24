// =============================================
// src/components/editor/YearlyPlannerBlock.tsx
// 역할: 연간 플래너 블록
//   - 연간 목표 (카테고리별, done/undone 토글)
//   - 12개월 그리드 → 월간 노트 링크
//   - 4분기 그리드 → 분기 노트 링크
//   - 52주 루틴 히트맵 (GitHub 잔디 스타일)
// Python으로 치면: class YearlyPlannerBlock(QWidget): ...
// =============================================

'use client'

import { useMemo, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckSquare, Square } from 'lucide-react'
import type { PlannerData } from './DayPlannerBlock'
import { useLocale } from '@/locales'
import { usePlannerStoreMode } from '@/lib/usePlannerStoreMode'
import { sqliteRoutineRatioForDate, usePlannerDates, useSqlitePlannerRange } from '@/lib/sqlitePlannerRange'
import SqlitePlannerStats from './SqlitePlannerStats'
import { PlannerStoreModeNotice } from './PlannerStoreModeNotice'

// ── 타입 정의 ─────────────────────────────────
// Python으로 치면: @dataclass class YearlyGoal / YearlyData
interface YearlyGoal {
  id: string
  category: string
  title: string
  done: boolean
}
interface YearlyData {
  year: number
  goals: YearlyGoal[]
}

// ── 날짜 유틸 ─────────────────────────────────
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// 1월 1일을 포함하는 주의 월요일 반환
function getMondayOf(d: Date): Date {
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  const m = new Date(d)
  m.setDate(d.getDate() - dow)
  return m
}

// ── 히트맵 셀 색상 ────────────────────────────
function heatColor(ratio: number, inYear: boolean): string {
  if (!inYear || ratio < 0) return 'bg-gray-100'
  if (ratio === 0) return 'bg-gray-200'
  if (ratio < 0.5) return 'bg-emerald-200'
  if (ratio < 0.8) return 'bg-emerald-400'
  return 'bg-emerald-600'
}

interface Props {
  block: Block
  pageId?: string
  readMode?: boolean
  onUpdate?: (content: string) => void
}

// =============================================
export default function YearlyPlannerBlock({ block, pageId, readMode, onUpdate }: Props) {
  const plannerStoreMode = usePlannerStoreMode()
  if (plannerStoreMode !== 'legacy' && plannerStoreMode !== 'sqlite') return <PlannerStoreModeNotice mode={plannerStoreMode} />
  return <YearlyPlannerContent block={block} pageId={pageId} readMode={readMode} onUpdate={onUpdate} plannerStoreMode={plannerStoreMode} />
}

function YearlyPlannerContent({ block, pageId, readMode, onUpdate, plannerStoreMode }: Props & { plannerStoreMode: 'legacy' | 'sqlite' }) {
  const t = useLocale()

  // ── content 파싱 ───────────────────────────
  const data: YearlyData = useMemo(() => {
    try {
      const p = JSON.parse(block.content || '{}')
      return {
        year:  p.year  ?? new Date().getFullYear(),
        goals: p.goals ?? [],
      }
    } catch {
      return { year: new Date().getFullYear(), goals: [] }
    }
  }, [block.content])

  // onUpdate가 있으면 사용, 없으면 pageId+updateBlock으로 직접 저장
  // Python으로 치면: def save(patch): (on_update or update_block)({ ...data, ...patch })
  const updateBlock = usePageStore(s => s.updateBlock)
  const save = useCallback((patch: Partial<YearlyData>) => {
    const json = JSON.stringify({ ...data, ...patch })
    if (onUpdate) onUpdate(json)
    else if (block.id && pageId) updateBlock(pageId, block.id, json)
  }, [data, onUpdate, updateBlock, block.id, pageId])

  // 루틴 프리셋 — settingsStore에서 직접 읽음
  const plannerRoutines = useSettingsStore(s => s.plannerRoutines)
  const { pages, setCurrentPage } = usePageStore()
  const sqliteRange = useMemo(() => ({
    start: `${data.year}-01-01`,
    end: `${data.year}-12-31`,
  }), [data.year])
  // SQLite 활성 시 연간 통계는 저장된 일정·루틴 범위만 집계한다.
  // Python으로 치면: events, routines = load_range_if_sqlite(year_start, year_end)
  const { events: sqliteEvents, routines: sqliteRoutines } = useSqlitePlannerRange(
    plannerStoreMode === 'sqlite', sqliteRange.start, sqliteRange.end,
  )
  const sqliteDates = usePlannerDates(sqliteRange.start, data.year % 4 === 0 && (data.year % 100 !== 0 || data.year % 400 === 0) ? 366 : 365)

  // ── 연도 네비게이션 ────────────────────────
  function goYear(delta: number) { save({ year: data.year + delta }) }

  // ── 목표 관리 ─────────────────────────────
  function addGoal(category: string) {
    const goal: YearlyGoal = { id: crypto.randomUUID(), category, title: t.planner.yearly.newGoalTitle, done: false }
    save({ goals: [...data.goals, goal] })
  }
  function toggleGoal(id: string) {
    save({ goals: data.goals.map(g => g.id === id ? { ...g, done: !g.done } : g) })
  }
  function updateGoalTitle(id: string, title: string) {
    save({ goals: data.goals.map(g => g.id === id ? { ...g, title } : g) })
  }
  function deleteGoal(id: string) {
    save({ goals: data.goals.filter(g => g.id !== id) })
  }

  const today = new Date()
  const todayStr = fmtDate(today)
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayCurQ = Math.ceil(todayMonth / 3)

  // ── 목표 달성 통계 ─────────────────────────
  const doneCount = data.goals.filter(g => g.done).length
  const totalCount = data.goals.length
  const pct = totalCount === 0 ? 0 : Math.round(doneCount / totalCount * 100)

  // ── 카테고리별 목표 그룹핑 ────────────────
  // Python으로 치면: goals_by_cat = {cat: [g for g in goals if g.category==cat] for cat in CATEGORIES}
  const goalsByCategory = useMemo(() => {
    const map = new Map<string, YearlyGoal[]>()
    for (const g of data.goals) {
      if (!map.has(g.category)) map.set(g.category, [])
      map.get(g.category)!.push(g)
    }
    return map
  }, [data.goals])

  // ── 12개월 노트 존재 여부 ─────────────────
  // Python으로 치면: monthly_notes = [find_page(f'월간 노트 {year}-{m:02}') for m in range(1,13)]
  const monthlyNotes = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const monthStr = `${data.year}-${String(i + 1).padStart(2, '0')}`
    return pages.find(p => p.title === `${t.planner.quarterly.monthlyNotePrefix} ${monthStr}`) ?? null
  }), [data.year, pages, t.planner.quarterly.monthlyNotePrefix])

  // ── 4분기 노트 존재 여부 ──────────────────
  // Python으로 치면: quarterly_notes = [find_page(f'{prefix} {year}-Q{q}') for q in range(1,5)]
  const quarterlyNotes = useMemo(() => [1,2,3,4].map(q =>
    pages.find(p => p.title === `${t.planner.yearly.quarterlyNotesLabel} ${data.year}-Q${q}`) ?? null
  ), [data.year, pages, t.planner.yearly.quarterlyNotesLabel])

  // ── 52주 루틴 히트맵 ──────────────────────
  // 1월 1일 기준 월요일부터 53주 × 7일
  // Python으로 치면: build_heatmap(year, pages)
  const heatmap = useMemo(() => {
    const jan1 = new Date(data.year, 0, 1)
    const monday = getMondayOf(jan1)
    const weeks: Array<Array<{ date: string; ratio: number; inYear: boolean }>> = []
    const cur = new Date(monday)

    for (let w = 0; w < 53; w++) {
      const week: Array<{ date: string; ratio: number; inYear: boolean }> = []
      for (let d = 0; d < 7; d++) {
        const dateStr = fmtDate(cur)
        const inYear = cur.getFullYear() === data.year
        let ratio = -1
        if (inYear) {
          if (plannerStoreMode === 'sqlite') {
            ratio = sqliteRoutineRatioForDate(sqliteEvents, sqliteRoutines, dateStr)
          } else {
            outer: for (const page of pages) {
              for (const b of page.blocks) {
                if (b.type !== 'dayplanner') continue
                try {
                  const pd: PlannerData = JSON.parse(b.content || '{}')
                  const dayEvents = pd.eventsByDate?.[dateStr] ?? []
                  if (!pd.eventsByDate?.[dateStr]) continue
                  const routineCount = plannerRoutines.length
                  if (routineCount === 0) { ratio = 0; break outer }
                  const doneCount = dayEvents.filter(ev =>
                    plannerRoutines.some(r => r.title === ev.title && r.start === ev.start) && ev.done
                  ).length
                  ratio = doneCount / routineCount
                  break outer
                } catch { /* skip */ }
              }
            }
          }
        }
        week.push({ date: dateStr, ratio, inYear })
        cur.setDate(cur.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }, [data.year, pages, plannerRoutines, plannerStoreMode, sqliteEvents, sqliteRoutines])

  // =============================================
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white" style={{ minWidth: '300px' }}>

      {/* ── 헤더: 연도 네비게이션 + 진행률 ──── */}
      {/* Python으로 치면: render_header() */}
      <div className="flex items-center gap-2 mb-4">
        {!readMode && (
          <button type="button" onClick={() => goYear(-1)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <ChevronLeft size={14} />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800">{t.planner.yearly.yearFmt.replace('{year}', String(data.year))}</span>
            {totalCount > 0 && (
              <span className="text-xs text-emerald-600 font-semibold ml-auto">{doneCount}/{totalCount} ({pct}%)</span>
            )}
          </div>
          {totalCount > 0 && (
            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        {!readMode && (
          <button type="button" onClick={() => goYear(1)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* ── 12개월 그리드 ───────────────────── */}
      {/* Python으로 치면: render_month_grid() */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t.planner.yearly.monthlyNotesLabel}</div>
        <div className="grid grid-cols-6 gap-1">
          {monthlyNotes.map((note, i) => {
            const m = i + 1
            const isCurrent = data.year === todayYear && m === todayMonth
            return (
              <button
                key={m}
                type="button"
                onClick={() => note && setCurrentPage(note.id)}
                className={`py-1.5 text-[10px] rounded border transition-colors leading-tight ${isCurrent ? 'border-blue-300 bg-blue-50 text-blue-700 font-bold' : note ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer' : 'border-dashed border-gray-200 text-gray-300 cursor-default'}`}
              >
                {t.planner.yearly.months[i]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 4분기 그리드 ────────────────────── */}
      {/* Python으로 치면: render_quarter_grid() */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t.planner.yearly.quarterlyNotesLabel}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {quarterlyNotes.map((note, i) => {
            const q = i + 1
            const isCurrent = data.year === todayYear && q === todayCurQ
            return (
              <button
                key={q}
                type="button"
                onClick={() => note && setCurrentPage(note.id)}
                className={`py-2 text-[10px] rounded border transition-colors leading-tight ${isCurrent ? 'border-violet-300 bg-violet-50 text-violet-700 font-bold' : note ? 'border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 cursor-pointer' : 'border-dashed border-gray-200 text-gray-300 cursor-default'}`}
              >
                Q{q}
                <span className="block text-[8px] mt-0.5 opacity-70">{t.planner.yearly.quarterRanges[i]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 연간 목표 (카테고리별) ──────────── */}
      {/* Python으로 치면: render_goals() */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t.planner.yearly.yearlyGoalsLabel}</div>
        {t.planner.yearly.categoriesEmoji.map(cat => {
          const catGoals = goalsByCategory.get(cat) ?? []
          return (
            <div key={cat} className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">{cat}</span>
                {!readMode && (
                  <button type="button" onClick={() => addGoal(cat)} className="text-gray-300 hover:text-blue-500 transition-colors">
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <div className="space-y-1 pl-1">
                {catGoals.map(goal => (
                  <div key={goal.id} className="flex items-center gap-1.5 group">
                    <button
                      type="button"
                      onClick={() => !readMode && toggleGoal(goal.id)}
                      className={`shrink-0 transition-colors ${goal.done ? 'text-emerald-500' : 'text-gray-300'}`}
                    >
                      {goal.done ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>
                    {readMode ? (
                      <span className={`text-xs flex-1 ${goal.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{goal.title}</span>
                    ) : (
                      <input
                        value={goal.title}
                        onChange={e => updateGoalTitle(goal.id, e.target.value)}
                        className={`text-xs flex-1 bg-transparent border-none outline-none ${goal.done ? 'line-through text-gray-400' : 'text-gray-700'}`}
                        placeholder={t.planner.yearly.goalPlaceholder}
                      />
                    )}
                    {!readMode && (
                      <button type="button" onClick={() => deleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 text-gray-200 hover:text-red-400 transition-all">
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
                {catGoals.length === 0 && (
                  <p className="text-[10px] text-gray-300 pl-1">{t.planner.yearly.noGoal}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 52주 루틴 히트맵 (GitHub 잔디) ───── */}
      {/* Python으로 치면: render_yearly_heatmap() */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t.planner.yearly.heatmapTitle}</div>
        <div className="flex gap-0.5 overflow-x-auto pb-1">
          {heatmap.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5 shrink-0">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={`${cell.date}${cell.ratio >= 0 ? ` (${Math.round(cell.ratio * 100)}%)` : ''}`}
                  className={`w-2.5 h-2.5 rounded-sm ${heatColor(cell.ratio, cell.inYear)} ${cell.date === todayStr ? 'ring-1 ring-blue-400' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
          <div className="w-2 h-2 rounded-sm bg-gray-100" /> {t.planner.yearly.noData}
          <div className="w-2 h-2 rounded-sm bg-emerald-200 ml-1" /> {t.planner.yearly.partial}
          <div className="w-2 h-2 rounded-sm bg-emerald-600 ml-1" /> {t.planner.yearly.done}
        </div>
        {plannerStoreMode === 'sqlite' && <SqlitePlannerStats dates={sqliteDates} events={sqliteEvents} routines={sqliteRoutines} />}
      </div>

    </div>
  )
}
