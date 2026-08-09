// =============================================
// src/components/editor/QuarterlyPlannerBlock.tsx
// 역할: 분기 플래너 블록
//   - OKR (목표 + 핵심 결과, 진행률 슬라이더)
//   - 해당 분기 3개월 미니 링크 (월간 노트 연결)
//   - 13주 루틴 히트맵 (DayPlannerBlock 루틴 데이터 집계)
//   - 분기 네비게이션 (← Q1 / Q2 / Q3 / Q4 →)
// Python으로 치면: class QuarterlyPlannerBlock(QWidget): ...
// =============================================

'use client'

import { useMemo, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { PlannerData } from './DayPlannerBlock'
import { useLocale } from '@/locales'


// ── 분기별 월 목록 ─────────────────────────────
// Python으로 치면: QUARTER_MONTHS = {1: [1,2,3], ...}
const QUARTER_MONTHS: Record<number, number[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
}

// ── OKR 타입 정의 ─────────────────────────────
// Python으로 치면: @dataclass class KeyResult / Objective
interface KeyResult {
  id: string
  title: string
  progress: number  // 0–100
}
interface Objective {
  id: string
  title: string
  keyResults: KeyResult[]
}
interface QuarterlyData {
  year: number
  quarter: 1 | 2 | 3 | 4
  objectives: Objective[]
}

// ── 날짜 유틸 ─────────────────────────────────
// Python으로 치면: def fmt_date(d): return d.strftime('%Y-%m-%d')
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// 해당 날짜가 포함된 주의 월요일 반환
// Python으로 치면: def get_monday(d): return d - timedelta(days=d.weekday())
function getMondayOf(d: Date): Date {
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  const m = new Date(d)
  m.setDate(d.getDate() - dow)
  return m
}

// ── 히트맵 셀 색상 ────────────────────────────
// Python으로 치면: def heat_color(ratio): ...
function heatColor(ratio: number): string {
  if (ratio < 0) return 'bg-gray-100'
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
export default function QuarterlyPlannerBlock({ block, pageId, readMode, onUpdate }: Props) {
  const t = useLocale()

  // ── content 파싱 ───────────────────────────
  // Python으로 치면: data = json.loads(block.content) or default
  const data: QuarterlyData = useMemo(() => {
    try {
      const p = JSON.parse(block.content || '{}')
      const today = new Date()
      const m = today.getMonth() + 1
      const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4
      return {
        year:       p.year       ?? today.getFullYear(),
        quarter:    p.quarter    ?? q,
        objectives: p.objectives ?? [],
      }
    } catch {
      const today = new Date()
      const m = today.getMonth() + 1
      const q = (m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4) as 1|2|3|4
      return { year: today.getFullYear(), quarter: q, objectives: [] }
    }
  }, [block.content])

  // ── 저장 헬퍼 ─────────────────────────────
  // onUpdate가 있으면 사용, 없으면 pageId+updateBlock으로 직접 저장
  // Python으로 치면: def save(patch): (on_update or update_block)({ ...data, ...patch })
  const updateBlock = usePageStore(s => s.updateBlock)
  const save = useCallback((patch: Partial<QuarterlyData>) => {
    const json = JSON.stringify({ ...data, ...patch })
    if (onUpdate) onUpdate(json)
    else if (block.id && pageId) updateBlock(pageId, block.id, json)
  }, [data, onUpdate, updateBlock, block.id, pageId])

  // 루틴 프리셋 — settingsStore에서 직접 읽음
  const plannerRoutines = useSettingsStore(s => s.plannerRoutines)
  const { pages, setCurrentPage } = usePageStore()

  // ── 분기 네비게이션 ────────────────────────
  // Python으로 치면: def go_quarter(delta): ...
  function goQuarter(delta: number) {
    let q = (data.quarter as number) + delta
    let y = data.year
    if (q > 4) { q = 1; y++ }
    if (q < 1) { q = 4; y-- }
    save({ quarter: q as 1|2|3|4, year: y })
  }

  // ── OKR 관리 ──────────────────────────────
  function addObjective() {
    const obj: Objective = { id: crypto.randomUUID(), title: t.planner.quarterly.newObjectiveTitle, keyResults: [] }
    save({ objectives: [...data.objectives, obj] })
  }
  function updateObjTitle(id: string, title: string) {
    save({ objectives: data.objectives.map(o => o.id === id ? { ...o, title } : o) })
  }
  function deleteObj(id: string) {
    save({ objectives: data.objectives.filter(o => o.id !== id) })
  }
  function addKR(objId: string) {
    const kr: KeyResult = { id: crypto.randomUUID(), title: t.planner.quarterly.newKrTitle, progress: 0 }
    save({ objectives: data.objectives.map(o =>
      o.id === objId ? { ...o, keyResults: [...o.keyResults, kr] } : o
    )})
  }
  function updateKR(objId: string, krId: string, patch: Partial<KeyResult>) {
    save({ objectives: data.objectives.map(o =>
      o.id === objId ? { ...o, keyResults: o.keyResults.map(kr =>
        kr.id === krId ? { ...kr, ...patch } : kr
      )} : o
    )})
  }
  function deleteKR(objId: string, krId: string) {
    save({ objectives: data.objectives.map(o =>
      o.id === objId ? { ...o, keyResults: o.keyResults.filter(kr => kr.id !== krId) } : o
    )})
  }

  // ── 전체 진행률 ───────────────────────────
  // Python으로 치면: overall = mean([kr.progress for o in objectives for kr in o.key_results])
  const overallProgress = useMemo(() => {
    const allKRs = data.objectives.flatMap(o => o.keyResults)
    if (allKRs.length === 0) return 0
    return Math.round(allKRs.reduce((s, kr) => s + kr.progress, 0) / allKRs.length)
  }, [data.objectives])

  // ── 13주 루틴 히트맵 ──────────────────────
  // 분기 시작일의 월요일부터 13주 × 7일 격자 생성
  // Python으로 치면: heatmap = [[{date, ratio} for _ in range(7)] for _ in range(13)]
  const heatmap = useMemo(() => {
    const qStart = new Date(data.year, (data.quarter - 1) * 3, 1)
    const monday = getMondayOf(qStart)
    const weeks: Array<Array<{ date: string; ratio: number }>> = []
    const cur = new Date(monday)

    for (let w = 0; w < 13; w++) {
      const week: Array<{ date: string; ratio: number }> = []
      for (let d = 0; d < 7; d++) {
        const dateStr = fmtDate(cur)
        let ratio = -1
        for (const page of pages) {
          for (const b of page.blocks) {
            if (b.type !== 'dayplanner') continue
            try {
              const pd: PlannerData = JSON.parse(b.content || '{}')
              const dayEvents = pd.eventsByDate?.[dateStr] ?? []
              if (!dayEvents.length && !pd.eventsByDate?.[dateStr]) continue
              const routineCount = plannerRoutines.length
              if (routineCount === 0) { ratio = 0; break }
              // 루틴과 제목+시작시간이 일치하는 이벤트 중 done인 것 카운트
              const doneCount = dayEvents.filter(ev =>
                plannerRoutines.some(r => r.title === ev.title && r.start === ev.start) && ev.done
              ).length
              ratio = doneCount / routineCount
              break
            } catch { /* skip */ }
          }
          if (ratio >= 0) break
        }
        week.push({ date: dateStr, ratio })
        cur.setDate(cur.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }, [data.year, data.quarter, pages, plannerRoutines])

  const todayStr = fmtDate(new Date())
  const quarterMonths = QUARTER_MONTHS[data.quarter]

  // =============================================
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white" style={{ minWidth: '300px' }}>

      {/* ── 헤더: 분기 네비게이션 + 진행률 ──── */}
      {/* Python으로 치면: render_header() */}
      <div className="flex items-center gap-2 mb-3">
        {!readMode && (
          <button type="button" onClick={() => goQuarter(-1)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <ChevronLeft size={14} />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800">{t.planner.quarterly.yearQuarterFmt.replace('{year}', String(data.year)).replace('{quarter}', String(data.quarter))}</span>
            <span className="text-xs text-gray-400">{t.planner.quarterly.monthRanges[data.quarter - 1]}</span>
            <span className="ml-auto text-xs font-semibold text-emerald-600">{overallProgress}%</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>
        {!readMode && (
          <button type="button" onClick={() => goQuarter(1)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* ── 3개월 미니 링크 ─────────────────── */}
      {/* Python으로 치면: for m in quarter_months: render_month_pill(m) */}
      <div className="flex gap-2 mb-4">
        {quarterMonths.map(m => {
          const monthStr = `${data.year}-${String(m).padStart(2, '0')}`
          const note = pages.find(p => p.title === `${t.planner.quarterly.monthlyNotePrefix} ${monthStr}`)
          return (
            <button
              key={m}
              type="button"
              onClick={() => note && setCurrentPage(note.id)}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${note ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer' : 'border-dashed border-gray-200 text-gray-300 cursor-default'}`}
            >
              {t.planner.quarterly.months[m - 1]}
              {note && <span className="block text-[9px] mt-0.5 text-emerald-400">{t.planner.quarterly.hasNote}</span>}
            </button>
          )
        })}
      </div>

      {/* ── OKR 섹션 ────────────────────────── */}
      {/* Python으로 치면: render_okr_section() */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">OKR</span>
          {!readMode && (
            <button type="button" onClick={addObjective} className="flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-600">
              <Plus size={12} /> {t.planner.quarterly.addObjectiveBtn}
            </button>
          )}
        </div>

        {data.objectives.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">{t.planner.quarterly.noObjective}</p>
        ) : (
          <div className="space-y-3">
            {data.objectives.map(obj => {
              const objPct = obj.keyResults.length === 0 ? 0
                : Math.round(obj.keyResults.reduce((s, kr) => s + kr.progress, 0) / obj.keyResults.length)
              return (
                <div key={obj.id} className="border border-gray-100 rounded-lg p-2.5">
                  {/* Objective 행 */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-blue-600 shrink-0">O</span>
                    {readMode ? (
                      <span className="text-xs font-medium text-gray-800 flex-1">{obj.title}</span>
                    ) : (
                      <input
                        value={obj.title}
                        onChange={e => updateObjTitle(obj.id, e.target.value)}
                        className="text-xs font-medium text-gray-800 flex-1 bg-transparent border-none outline-none"
                        placeholder={t.planner.quarterly.objectivePlaceholder}
                      />
                    )}
                    <span className="text-[10px] text-blue-500 font-semibold shrink-0">{objPct}%</span>
                    {!readMode && (
                      <button type="button" onClick={() => deleteObj(obj.id)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  {/* Objective 진행률 바 */}
                  <div className="h-1 bg-gray-100 rounded-full mb-2.5 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${objPct}%` }} />
                  </div>
                  {/* Key Results */}
                  <div className="space-y-2 pl-3">
                    {obj.keyResults.map(kr => (
                      <div key={kr.id} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-violet-500 shrink-0">KR</span>
                        {readMode ? (
                          <span className="text-[11px] text-gray-600 flex-1">{kr.title}</span>
                        ) : (
                          <input
                            value={kr.title}
                            onChange={e => updateKR(obj.id, kr.id, { title: e.target.value })}
                            className="text-[11px] text-gray-600 flex-1 bg-transparent border-none outline-none"
                            placeholder={t.planner.quarterly.krPlaceholder}
                          />
                        )}
                        <input
                          type="range" min={0} max={100} step={5}
                          value={kr.progress}
                          disabled={readMode}
                          onChange={e => updateKR(obj.id, kr.id, { progress: Number(e.target.value) })}
                          className="w-16 accent-violet-500"
                        />
                        <span className="text-[10px] text-violet-500 w-7 text-right shrink-0">{kr.progress}%</span>
                        {!readMode && (
                          <button type="button" onClick={() => deleteKR(obj.id, kr.id)} className="text-gray-300 hover:text-red-400">
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                    {!readMode && (
                      <button type="button" onClick={() => addKR(obj.id)} className="flex items-center gap-0.5 text-[10px] text-violet-400 hover:text-violet-600">
                        <Plus size={10} /> {t.planner.quarterly.addKrBtn}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 13주 루틴 히트맵 ─────────────────── */}
      {/* Python으로 치면: render_heatmap(weeks=13) */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t.planner.quarterly.heatmapTitle}</div>
        <div className="flex gap-0.5">
          {heatmap.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={`${cell.date}${cell.ratio >= 0 ? ` (${Math.round(cell.ratio * 100)}%)` : ''}`}
                  className={`w-3 h-3 rounded-sm ${heatColor(cell.ratio)} ${cell.date === todayStr ? 'ring-1 ring-blue-400' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
          <div className="w-2 h-2 rounded-sm bg-gray-100" /> {t.planner.quarterly.noData}
          <div className="w-2 h-2 rounded-sm bg-emerald-200 ml-1" /> {t.planner.quarterly.partial}
          <div className="w-2 h-2 rounded-sm bg-emerald-600 ml-1" /> {t.planner.quarterly.done}
        </div>
      </div>

    </div>
  )
}
