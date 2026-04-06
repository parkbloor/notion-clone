// =============================================
// src/components/editor/WeekPlannerBlock.tsx
// 역할: 멀티데이 주간 타임라인 블록
//   - 7컬럼 (또는 3/5일) 타임라인 그리드
//   - 각 컬럼 = DayPlannerBlock의 PlannerData에서 해당 날짜 이벤트 수집
//   - 드래그로 날짜 간 이벤트 이동 지원
//   - 현재 시각 표시선 (오늘 컬럼만)
//   - 헤더: 주 탐색 ← → + 날짜별 이벤트 수
// Python으로 치면: class WeekPlannerBlock(QWidget): ...
// =============================================

'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { PlanEvent } from '@/types/block'
import { PlannerData } from './DayPlannerBlock'

// ── 시간 유틸 (DayPlannerBlock과 동일 로직, 상수만 다름) ──
// Python으로 치면: def time_to_min(t): return int(t[:2])*60 + int(t[3:])
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return isNaN(h) ? -1 : h * 60 + m
}
function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

// ── 이벤트 px 계산 (WeekPlannerBlock 전용 HOUR_PX 기준) ──
// Python으로 치면: def event_px(ev): return (start_min - START_HOUR*60) * PX_PER_MIN
function eventPx(event: PlanEvent): { top: number; height: number } | null {
  const startMin = timeToMin(event.start)
  const endMin   = timeToMin(event.end)
  if (startMin < 0 || endMin <= startMin) return null
  const pxPerMin = HOUR_PX / 60
  return {
    top:    Math.max(0, (startMin - START_HOUR * 60) * pxPerMin),
    height: Math.max(14, (endMin - startMin) * pxPerMin),
  }
}

// ── 겹치는 이벤트 레이아웃 계산 ──────────────
interface LayoutEvent { event: PlanEvent; top: number; height: number; col: number; totalCols: number }
function layoutEvents(events: PlanEvent[]): LayoutEvent[] {
  const items = events
    .map(ev => { const px = eventPx(ev); return px ? { event: ev, ...px } : null })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.top - b.top)
  const columns: { event: PlanEvent; top: number; height: number; end: number }[][] = []
  for (const item of items) {
    let placed = false
    for (const col of columns) {
      if (col[col.length - 1].end <= item.top) {
        col.push({ ...item, end: item.top + item.height })
        placed = true; break
      }
    }
    if (!placed) columns.push([{ ...item, end: item.top + item.height }])
  }
  const result: LayoutEvent[] = []
  columns.forEach((col, colIdx) => {
    for (const item of col) {
      const overlapping = columns.filter(c => c.some(b => b.top < item.top + item.height && b.end > item.top)).length
      result.push({ event: item.event, top: item.top, height: item.height, col: colIdx, totalCols: overlapping })
    }
  })
  return result
}

// ── 타임라인 설정 ─────────────────────────────
// Python으로 치면: START_HOUR = 0; END_HOUR = 24; HOUR_PX = 48
const START_HOUR = 0
const END_HOUR   = 24
const HOUR_PX    = 48    // 주간 뷰는 일간보다 좁게

// ── 범위 옵션 ─────────────────────────────────
type RangeMode = '7' | '5' | '3'

// ── 이벤트 컬러 배경색 매핑 (DayPlannerBlock과 동일) ──
const COLOR_BG: Record<string, string> = {
  blue:    'bg-blue-400',    sky:     'bg-sky-400',
  cyan:    'bg-cyan-400',    teal:    'bg-teal-400',
  green:   'bg-emerald-400', lime:    'bg-lime-400',
  yellow:  'bg-yellow-400',  amber:   'bg-amber-400',
  orange:  'bg-orange-400',  red:     'bg-rose-400',
  pink:    'bg-pink-400',    fuchsia: 'bg-fuchsia-400',
  purple:  'bg-violet-400',  indigo:  'bg-indigo-400',
  slate:   'bg-slate-400',   gray:    'bg-gray-400',
}
function getBg(color: string): string {
  return COLOR_BG[color] ?? 'bg-blue-400'
}

// ── 날짜 문자열 유틸 ──────────────────────────
// Python으로 치면: def today_str(): return date.today().isoformat()
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// 기준 날짜 + 델타일 → 날짜 문자열
// Python으로 치면: def shift_date(ds, delta): return (date.fromisoformat(ds) + timedelta(delta)).isoformat()
function shiftDate(ds: string, delta: number): string {
  const d = new Date(ds + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// 해당 주 시작 날짜 문자열 반환 (startDay 기준)
// startDay: 0=일, 1=월(기본), 6=토
// Python으로 치면: def week_start_of(ds, start_day): d = date.fromisoformat(ds); return d - timedelta((d.weekday() - start_day + 7) % 7)
function weekStartOf(ds: string, startDay: number): string {
  const d = new Date(ds + 'T00:00:00')
  const dow  = d.getDay()  // 0=일~6=토
  const diff = (dow - startDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// 날짜 레이블 (MM/DD 요일)
// Python으로 치면: def date_label(ds): return ds.strftime('%m/%d (%a)')
const DOW_KO = ['일','월','화','수','목','금','토']
function dateLabel(ds: string): { mmdd: string; dow: string; isToday: boolean; isWeekend: boolean } {
  const d = new Date(ds + 'T00:00:00')
  return {
    mmdd:      `${d.getMonth()+1}/${d.getDate()}`,
    dow:       DOW_KO[d.getDay()],
    isToday:   ds === todayStr(),
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
  }
}

// ── WeekPlannerData JSON 구조 ─────────────────
// Python으로 치면: @dataclass class WeekPlannerData: weekStart, range
export interface WeekPlannerData {
  weekStart: string    // 'YYYY-MM-DD' (해당 주 월요일)
  range:     RangeMode // '7' | '5' | '3'
}

interface WeekPlannerBlockProps {
  block:  Block
  pageId: string
}

export default function WeekPlannerBlock({ block, pageId }: WeekPlannerBlockProps) {
  const { pages, updateBlock } = usePageStore()
  // 주간 시작 요일 — settingsStore.weekStartDay (0=일, 1=월, 6=토)
  // Python으로 치면: self.week_start_day = settings.week_start_day
  const weekStartDay = useSettingsStore(s => s.weekStartDay)

  // ── 콘텐츠 파싱 ──────────────────────────────
  // Python으로 치면: data = json.loads(block.content) if block.content else default
  const data: WeekPlannerData = useMemo(() => {
    try {
      const parsed = JSON.parse(block.content || '{}')
      return {
        weekStart: parsed.weekStart ?? weekStartOf(todayStr(), weekStartDay),
        range:     parsed.range     ?? '7',
      }
    } catch {
      return { weekStart: weekStartOf(todayStr(), weekStartDay), range: '7' }
    }
  }, [block.content, weekStartDay])

  // ── 콘텐츠 저장 ──────────────────────────────
  const save = useCallback((next: WeekPlannerData) => {
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 표시할 날짜 배열 생성 ─────────────────────
  // Python으로 치면: dates = [weekStart + timedelta(i) for i in range(range_days)]
  const days = useMemo(() => {
    const count = parseInt(data.range)
    return Array.from({ length: count }, (_, i) => shiftDate(data.weekStart, i))
  }, [data.weekStart, data.range])

  // ── 전체 페이지에서 날짜별 이벤트 수집 ──────
  // Python으로 치면: events_by_date = {date: [ev for page in pages for block ...]}
  const eventsByDate = useMemo(() => {
    const map: Record<string, { event: PlanEvent; pageId: string; blockId: string }[]> = {}
    for (const page of pages) {
      for (const b of page.blocks ?? []) {
        if (b.type !== 'dayplanner') continue
        try {
          const d: PlannerData = JSON.parse(b.content || '{}')
          // 새 구조: eventsByDate 맵에서 날짜별 이벤트 수집
          const evByDate = d.eventsByDate ?? {}
          for (const [date, dayEvs] of Object.entries(evByDate)) {
            if (!dayEvs.length) continue
            if (!map[date]) map[date] = []
            for (const ev of dayEvs) {
              map[date].push({ event: ev, pageId: page.id, blockId: b.id })
            }
          }
        } catch { /* JSON 파싱 실패 무시 */ }
      }
    }
    return map
  }, [pages])

  // ── 현재 시각 표시선 top (px) ─────────────────
  const [nowTop, setNowTop] = useState<number | null>(null)
  useEffect(() => {
    function update() {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const baseMin = START_HOUR * 60
      const endMin  = END_HOUR  * 60
      setNowTop(nowMin >= baseMin && nowMin <= endMin
        ? (nowMin - baseMin) * (HOUR_PX / 60)
        : null
      )
    }
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [])

  // ── 드래그: 날짜 간 이벤트 이동 ─────────────
  // Python으로 치면: self.drag_ref = None | { event, srcDate, srcBlockId, srcPageId, targetDate }
  interface CrossDayDrag {
    event:      PlanEvent
    srcDate:    string
    srcBlockId: string
    srcPageId:  string
    startX:     number
    startY:     number
    moved:      boolean
    targetDate: string | null
  }
  const crossDragRef  = useRef<CrossDayDrag | null>(null)
  const [crossDragging, setCrossDragging] = useState<{ id: string; date: string } | null>(null)
  const [hoverDate,     setHoverDate]     = useState<string | null>(null)
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const justCrossRef = useRef(false)

  // ── 이벤트 블록 mousedown → 날짜 간 드래그 시작 ──
  // Python으로 치면: def on_event_mousedown(e, ev, date, block_id, page_id): ...
  function startCrossDrag(
    e: React.MouseEvent,
    ev: PlanEvent,
    srcDate: string,
    srcBlockId: string,
    srcPageId: string
  ) {
    e.preventDefault()
    e.stopPropagation()
    crossDragRef.current = {
      event: ev, srcDate, srcBlockId, srcPageId,
      startX: e.clientX, startY: e.clientY,
      moved: false, targetDate: null,
    }
    setCrossDragging({ id: ev.id, date: srcDate })
  }

  // window mousemove/mouseup — 날짜 간 드래그 처리
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const dr = crossDragRef.current
      if (!dr) return
      if (Math.abs(e.clientX - dr.startX) > 5 || Math.abs(e.clientY - dr.startY) > 5) dr.moved = true
      if (!dr.moved) return
      // 현재 마우스 X 좌표가 어느 날짜 컬럼 위인지 판별
      let found: string | null = null
      for (const [date, el] of Object.entries(colRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right) { found = date; break }
      }
      if (found !== dr.targetDate) {
        dr.targetDate = found
        setHoverDate(found)
      }
    }

    function onMouseUp() {
      const dr = crossDragRef.current
      if (!dr) return
      crossDragRef.current = null
      setCrossDragging(null)
      setHoverDate(null)

      if (!dr.moved || !dr.targetDate || dr.targetDate === dr.srcDate) return

      // 이동: 원본 블록에서 이벤트 제거 → 대상 날짜 dayplanner 블록에 추가
      justCrossRef.current = true
      const srcPage  = pages.find(p => p.id === dr.srcPageId)
      const srcBlock = srcPage?.blocks?.find(b => b.id === dr.srcBlockId)
      if (!srcBlock) return

      try {
        const srcData: PlannerData = JSON.parse(srcBlock.content || '{}')
        // 원본 날짜에서 이벤트 제거 (eventsByDate 구조)
        const srcDayEvs = (srcData.eventsByDate?.[dr.srcDate] ?? []).filter(e => e.id !== dr.event.id)
        updateBlock(dr.srcPageId, dr.srcBlockId, JSON.stringify({
          eventsByDate: { ...(srcData.eventsByDate ?? {}), [dr.srcDate]: srcDayEvs },
        }))
      } catch { return }

      // 대상 날짜의 dayplanner 블록 찾기 — eventsByDate 구조로 추가
      for (const page of pages) {
        for (const b of page.blocks ?? []) {
          if (b.type !== 'dayplanner') continue
          try {
            const d: PlannerData = JSON.parse(b.content || '{}')
            const destDayEvs = d.eventsByDate?.[dr.targetDate!] ?? []
            updateBlock(page.id, b.id, JSON.stringify({
              eventsByDate: {
                ...(d.eventsByDate ?? {}),
                [dr.targetDate!]: [...destDayEvs, { ...dr.event, id: crypto.randomUUID() }],
              },
            }))
            return
          } catch { continue }
        }
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [pages, updateBlock])

  const totalHours  = END_HOUR - START_HOUR
  const totalHeight = totalHours * HOUR_PX

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden select-none w-full">

      {/* ── 헤더 ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        {/* 주 네비게이션 */}
        <button type="button" onClick={() => save({ ...data, weekStart: shiftDate(data.weekStart, -7) })}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-gray-700 flex-1">
          {data.weekStart} ~ {shiftDate(data.weekStart, parseInt(data.range) - 1)}
        </span>
        <button type="button" onClick={() => save({ ...data, weekStart: shiftDate(data.weekStart, 7) })}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronRight size={14} />
        </button>

        {/* 이번 주로 이동 */}
        <button type="button" onClick={() => save({ ...data, weekStart: weekStartOf(todayStr(), weekStartDay) })}
          className="text-[10px] text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded transition-colors">
          이번 주
        </button>

        {/* 범위 선택 */}
        {(['3','5','7'] as RangeMode[]).map(r => (
          <button key={r} type="button" onClick={() => save({ ...data, range: r })}
            className={[
              'text-[10px] px-2 py-0.5 rounded border transition-colors',
              data.range === r
                ? 'bg-blue-500 text-white border-blue-500'
                : 'text-gray-500 border-gray-200 hover:border-blue-300',
            ].join(' ')}>
            {r}일
          </button>
        ))}
      </div>

      {/* ── 그리드 본문 ──────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex" style={{ minWidth: `${days.length * 100 + 48}px` }}>

          {/* 시간 레이블 열 */}
          <div className="w-12 shrink-0 border-r border-gray-200 relative bg-gray-50" style={{ height: totalHeight + 36 }}>
            <div className="h-9" /> {/* 헤더 날짜 높이만큼 여백 */}
            <div className="relative" style={{ height: totalHeight }}>
              {Array.from({ length: totalHours + 1 }, (_, i) => (
                <div key={i} className="absolute text-[9px] text-gray-400 text-right pr-1.5 leading-none"
                  style={{ top: i === 0 ? 2 : i * HOUR_PX - 5, right: 0, width: '100%' }}>
                  {String(START_HOUR + i).padStart(2,'0')}
                </div>
              ))}
            </div>
          </div>

          {/* 날짜 컬럼들 */}
          {days.map(date => {
            const lbl       = dateLabel(date)
            const evEntries = eventsByDate[date] ?? []
            const planEvents = evEntries.map(x => x.event)
            const layout    = layoutEvents(planEvents)
            const isTodayCol = lbl.isToday
            const isDragTarget = hoverDate === date && crossDragging && crossDragging.date !== date

            return (
              <div key={date} className={[
                'flex-1 border-r border-gray-200 flex flex-col',
                lbl.isWeekend ? 'bg-gray-50/60' : 'bg-white',
                isDragTarget ? 'ring-2 ring-inset ring-blue-400' : '',
              ].join(' ')}>
                {/* 날짜 헤더 */}
                <div className={[
                  'h-9 flex items-center justify-center gap-1 border-b border-gray-200 sticky top-0 z-10',
                  isTodayCol ? 'bg-blue-50' : (lbl.isWeekend ? 'bg-gray-100' : 'bg-white'),
                ].join(' ')}>
                  <span className={['text-[11px] font-semibold', isTodayCol ? 'text-blue-600' : 'text-gray-600'].join(' ')}>
                    {lbl.mmdd}
                  </span>
                  <span className={['text-[10px]', lbl.isWeekend ? 'text-rose-400' : 'text-gray-400'].join(' ')}>
                    {lbl.dow}
                  </span>
                  {evEntries.length > 0 && (
                    <span className="text-[9px] bg-gray-200 text-gray-500 px-1 rounded-full">
                      {evEntries.length}
                    </span>
                  )}
                  {isTodayCol && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                </div>

                {/* 타임라인 */}
                <div
                  ref={el => { colRefs.current[date] = el }}
                  className="relative flex-1"
                  style={{ height: totalHeight }}
                >
                  {/* 시간 그리드 선 */}
                  {Array.from({ length: totalHours }, (_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: i * HOUR_PX }} />
                  ))}
                  {/* 30분 점선 */}
                  {Array.from({ length: totalHours }, (_, i) => (
                    <div key={`h-${i}`} className="absolute left-0 right-0 border-t border-dashed border-gray-50"
                      style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                  ))}

                  {/* 현재 시각 표시선 (오늘 컬럼만) */}
                  {isTodayCol && nowTop !== null && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{ top: nowTop }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 -ml-0.75 shrink-0" />
                      <div className="flex-1 border-t-2 border-red-400" />
                    </div>
                  )}

                  {/* 이벤트 블록 */}
                  {layout.map((li, idx) => {
                    const entry = evEntries.find(x => x.event.id === li.event.id)
                    const isDraggingThis = crossDragging?.id === li.event.id && crossDragging?.date === date
                    const widthPct = 100 / li.totalCols
                    const leftPct  = li.col * widthPct
                    return (
                      <div
                        key={idx}
                        onMouseDown={e => entry && startCrossDrag(e, li.event, date, entry.blockId, entry.pageId)}
                        style={{
                          position: 'absolute',
                          top:    li.top + 1,
                          height: Math.max(14, li.height - 2),
                          left:   `calc(${leftPct}% + 1px)`,
                          width:  `calc(${widthPct}% - 2px)`,
                          cursor: 'grab',
                          zIndex: 10,
                        }}
                        className={[
                          'rounded px-1 overflow-hidden text-white text-[9px] font-medium leading-tight shadow-sm',
                          getBg(li.event.color),
                          isDraggingThis ? 'opacity-30' : 'hover:brightness-110',
                          li.event.done ? 'opacity-50' : '',
                        ].join(' ')}
                      >
                        <div className="truncate mt-0.5">{li.event.title}</div>
                        {li.height > 20 && (
                          <div className="text-[8px] opacity-80">{li.event.start}–{li.event.end}</div>
                        )}
                        {/* 활성 클럭 인디케이터 */}
                        {li.event.clockIn && !li.event.clockOut && (
                          <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        )}
                      </div>
                    )
                  })}

                  {/* 드래그 대상 컬럼 안내 오버레이 */}
                  {isDragTarget && (
                    <div className="absolute inset-0 bg-blue-100/40 pointer-events-none z-30 flex items-center justify-center">
                      <Plus size={16} className="text-blue-400" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
