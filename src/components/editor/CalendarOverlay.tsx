// =============================================
// src/components/editor/CalendarOverlay.tsx
// 역할: 전체 vault 캘린더 오버레이 (Ctrl+Shift+C)
//   - 월간 / 주간 / 일간 3탭 뷰
//   - date + time 속성 기반 타임 블록 시각화
//   - 빈 슬롯 클릭 → 날짜·시간 자동 설정된 새 페이지 생성
// Python으로 치면: class CalendarOverlay(QDialog): ...
// =============================================

'use client'

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { usePageStore } from '@/store/pageStore'
import { Page } from '@/types/block'
import { X, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Clock, Plus } from 'lucide-react'

// ── 뷰 탭 타입 ────────────────────────────────────
// Python으로 치면: ViewTab = Literal['month', 'week', 'day']
type ViewTab = 'month' | 'week' | 'day'

// ── 요일 레이블 ──────────────────────────────────
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// ── 한 시간 슬롯의 픽셀 높이 ───────────────────
// 타임 블록 위치·높이 계산의 기준값
// Python으로 치면: HOUR_PX = 64
const HOUR_PX = 64

// ── 날짜 → YYYY-MM-DD 포맷 변환 ────────────────
// Python으로 치면: def to_date_str(d): return d.strftime('%Y-%m-%d')
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── 월 달력 그리드 셀 배열 생성 ─────────────────
// 앞뒤 빈 칸(null) 포함한 7열 고정 그리드
// Python으로 치면: def make_cal_grid(year, month) -> list[date|None]: ...
function makeCalGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// ── 해당 주의 날짜 7개 반환 (일요일 시작) ─────────
// Python으로 치면: def week_dates(anchor): return [anchor - anchor.weekday() + i for i in range(7)]
function getWeekDates(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// ── 'HH:MM' 문자열 → 분(minutes) 변환 ──────────
// Python으로 치면: def time_to_min(t): h, m = map(int, t.split(':')); return h*60 + m
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return -1
  return h * 60 + m
}

// ── 'HH:MM-HH:MM' → { top, height } (px) 계산 ──
// HOUR_PX 기준으로 타임 블록의 절대 위치·높이 계산
// Python으로 치면: def time_range_to_px(val) -> dict: ...
function timeRangeToPx(val: string): { top: number; height: number } | null {
  if (!val?.includes('-')) return null
  const [start, end] = val.split('-')
  const startMin = timeToMin(start)
  const endMin   = timeToMin(end)
  if (startMin < 0 || endMin <= startMin) return null
  const pxPerMin = HOUR_PX / 60
  return {
    top:    startMin * pxPerMin,
    height: Math.max((endMin - startMin) * pxPerMin, 24), // 최소 24px
  }
}

// ── 겹치는 블록 레이아웃 계산 ────────────────────
// 같은 시간대에 겹치는 블록을 columns로 분배
// Python으로 치면: def layout_blocks(blocks) -> list[{block, col, total_cols}]: ...
interface LayoutBlock { page: Page; top: number; height: number; col: number; totalCols: number }
function layoutTimeBlocks(items: { page: Page; top: number; height: number }[]): LayoutBlock[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => a.top - b.top)
  const columns: { page: Page; top: number; height: number; end: number }[][] = []

  for (const item of sorted) {
    // 현재 아이템이 들어갈 수 있는 빈 컬럼 찾기
    let placed = false
    for (const col of columns) {
      const lastInCol = col[col.length - 1]
      if (lastInCol.end <= item.top) {
        col.push({ ...item, end: item.top + item.height })
        placed = true
        break
      }
    }
    if (!placed) columns.push([{ ...item, end: item.top + item.height }])
  }

  const result: LayoutBlock[] = []
  columns.forEach((col, colIdx) => {
    for (const item of col) {
      // totalCols: 이 아이템과 겹치는 최대 컬럼 수
      const overlapping = columns.filter(c =>
        c.some(b => b.top < item.top + item.height && b.end > item.top)
      ).length
      result.push({ page: item.page, top: item.top, height: item.height, col: colIdx, totalCols: overlapping })
    }
  })
  return result
}

// ── 현재 시각 표시선 위치 계산 ─────────────────
// Python으로 치면: def now_top_px(): return (now.hour * 60 + now.minute) * HOUR_PX / 60
function nowTopPx(): number {
  const now = new Date()
  return (now.getHours() * 60 + now.getMinutes()) * (HOUR_PX / 60)
}


// =============================================
// CalendarOverlay — 메인 오버레이 컴포넌트
// =============================================
interface CalendarOverlayProps {
  onClose: () => void
}

export default function CalendarOverlay({ onClose }: CalendarOverlayProps) {

  const { pages, setCurrentPage, pushRecentPage, addPage, setPageProperty } = usePageStore()

  // ── 뷰 탭 / 기준 날짜 ────────────────────────
  const [viewTab, setViewTab]   = useState<ViewTab>('month')
  const [anchor, setAnchor]     = useState(() => new Date())

  // ── 현재 시각 선 (1분마다 갱신) ──────────────
  // Python으로 치면: self.now_top = now_top_px(); timer.every(60, update)
  const [nowTop, setNowTop] = useState(nowTopPx)
  useEffect(() => {
    setNowTop(nowTopPx())
    const timer = setInterval(() => setNowTop(nowTopPx()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // ── 타임라인 스크롤: 현재 시각 근처로 자동 이동 ─
  // Python으로 치면: timeline_ref.scrollTop = nowTop - 200
  const timelineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if ((viewTab === 'week' || viewTab === 'day') && timelineRef.current) {
      timelineRef.current.scrollTop = Math.max(0, nowTop - 200)
    }
  }, [viewTab, nowTop])

  // ── Esc로 닫기 ────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // ── 페이지 클릭 → 이동 후 닫기 ──────────────
  const handlePageClick = useCallback((pageId: string) => {
    setCurrentPage(pageId); pushRecentPage(pageId); onClose()
  }, [setCurrentPage, pushRecentPage, onClose])

  // ── date 속성 기준 날짜별 페이지 맵 ─────────
  // Python으로 치면: date_map = defaultdict(list); [date_map[p.date].append(p) for p in pages]
  const pagesByDate = useMemo<Map<string, Page[]>>(() => {
    const map = new Map<string, Page[]>()
    for (const page of pages) {
      const dateProp = page.properties?.find(p => p.type === 'date' && p.value)
      if (!dateProp?.value) continue
      const key = dateProp.value.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(page)
    }
    return map
  }, [pages])

  // ── 날짜 없는 페이지 ──────────────────────────
  const noDatPages = useMemo(() =>
    pages.filter(p => !p.properties?.some(prop => prop.type === 'date' && prop.value)),
    [pages]
  )

  // ── 월간 그리드 ──────────────────────────────
  const calGrid = useMemo(() =>
    makeCalGrid(anchor.getFullYear(), anchor.getMonth()), [anchor])

  // ── 주간 날짜 배열 ────────────────────────────
  const weekDates = useMemo(() => getWeekDates(anchor), [anchor])

  // ── 이전/다음/오늘 이동 ──────────────────────
  function goPrev() {
    const d = new Date(anchor)
    if (viewTab === 'month')      d.setMonth(d.getMonth() - 1)
    else if (viewTab === 'week')  d.setDate(d.getDate() - 7)
    else                          d.setDate(d.getDate() - 1)
    setAnchor(d)
  }
  function goNext() {
    const d = new Date(anchor)
    if (viewTab === 'month')      d.setMonth(d.getMonth() + 1)
    else if (viewTab === 'week')  d.setDate(d.getDate() + 7)
    else                          d.setDate(d.getDate() + 1)
    setAnchor(d)
  }
  function goToday() { setAnchor(new Date()) }

  // ── 기간 레이블 ──────────────────────────────
  function periodLabel(): string {
    if (viewTab === 'month') return `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`
    if (viewTab === 'week') {
      const s = weekDates[0], e = weekDates[6]
      if (s.getMonth() === e.getMonth())
        return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}–${e.getDate()}일`
      return `${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`
    }
    return `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 ${anchor.getDate()}일 (${WEEKDAYS[anchor.getDay()]})`
  }

  const todayStr = toDateStr(new Date())

  // ── 빈 슬롯 클릭 → 새 페이지 생성 ───────────────
  // 클릭한 날짜 + 시간으로 date·time 속성 자동 설정
  // Python으로 치면: def on_slot_click(date_str, hour): create_page_with_time(date_str, hour)
  const handleSlotClick = useCallback(async (dateStr: string, hour: number) => {
    const startTime = `${String(hour).padStart(2, '0')}:00`
    const endTime   = `${String(hour + 1).padStart(2, '0')}:00`

    await addPage('새 일정', null)
    const newId = usePageStore.getState().currentPageId
    if (!newId) return

    // date 속성 추가
    setPageProperty(newId, {
      id: crypto.randomUUID(), name: '날짜', type: 'date', value: dateStr,
    })
    // time 속성 추가
    setPageProperty(newId, {
      id: crypto.randomUUID(), name: '시간 블록', type: 'time',
      value: `${startTime}-${endTime}`,
    })
    setCurrentPage(newId)
    onClose()
  }, [addPage, setPageProperty, setCurrentPage, onClose])

  // ── 타임 블록 데이터 계산 (날짜별) ─────────────
  // time 속성이 있는 페이지를 날짜별로 layoutTimeBlocks 계산
  // Python으로 치면: def get_layout_blocks(date_str) -> list[LayoutBlock]: ...
  function getLayoutBlocks(dateStr: string): LayoutBlock[] {
    const pagesOnDay = pagesByDate.get(dateStr) ?? []
    const items = pagesOnDay.flatMap(page => {
      const timeProp = page.properties?.find(p => p.type === 'time' && p.value)
      if (!timeProp) return []
      const px = timeRangeToPx(timeProp.value)
      if (!px) return []
      return [{ page, ...px }]
    })
    return layoutTimeBlocks(items)
  }

  // ── 하루 종일 일정 (time 속성 없는 페이지) ──────
  // Python으로 치면: def get_allday_pages(date_str) -> list[Page]: ...
  function getAllDayPages(dateStr: string): Page[] {
    return (pagesByDate.get(dateStr) ?? []).filter(
      p => !p.properties?.some(prop => prop.type === 'time' && prop.value)
    )
  }

  // ── 타임라인 공통 렌더 (일간·주간 공유) ────────
  // Python으로 치면: def render_timeline_column(date_str, show_now_line): ...
  function TimelineColumn({
    dateStr,
    showNowLine = false,
    onSlotClick,
  }: {
    dateStr: string
    showNowLine?: boolean
    onSlotClick: (hour: number) => void
  }) {
    const layoutBlocks = getLayoutBlocks(dateStr)

    return (
      <div className="relative" style={{ height: HOUR_PX * 24 }}>

        {/* 시간 슬롯 배경 (클릭 가능) */}
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={hour}
            onClick={() => onSlotClick(hour)}
            className="absolute w-full border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors group"
            style={{ top: hour * HOUR_PX, height: HOUR_PX }}
          >
            {/* hover 시 + 아이콘 표시 */}
            <Plus
              size={10}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        ))}

        {/* 타임 블록 — 절대 위치로 렌더링 */}
        {/* Python으로 치면: for block in layout_blocks: render_block(block) */}
        {layoutBlocks.map((lb, i) => {
          const widthPct   = 100 / lb.totalCols
          const leftPct    = lb.col * widthPct
          const timeProp   = lb.page.properties?.find(p => p.type === 'time')?.value ?? ''
          const [s, e]     = timeProp.includes('-') ? timeProp.split('-') : [timeProp, '']
          return (
            <button
              key={i}
              type="button"
              onClick={ev => { ev.stopPropagation(); handlePageClick(lb.page.id) }}
              title={`${lb.page.title || '제목 없음'} (${s}–${e})`}
              style={{
                position: 'absolute',
                top:    lb.top + 1,
                height: lb.height - 2,
                left:   `calc(${leftPct}% + 2px)`,
                width:  `calc(${widthPct}% - 4px)`,
              }}
              className="rounded bg-blue-400 hover:bg-blue-500 text-white text-left px-1.5 overflow-hidden flex flex-col justify-start transition-colors z-10 shadow-sm"
            >
              <span className="text-[10px] font-semibold truncate leading-tight mt-0.5">
                {lb.page.icon} {lb.page.title || '제목 없음'}
              </span>
              {lb.height > 32 && (
                <span className="text-[9px] opacity-80 leading-tight">
                  {s} – {e}
                </span>
              )}
            </button>
          )
        })}

        {/* 현재 시각 표시선 */}
        {showNowLine && (
          <div
            className="absolute left-0 right-0 z-20 pointer-events-none"
            style={{ top: nowTop }}
          >
            <div className="relative flex items-center">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1" />
              <div className="flex-1 border-t-2 border-red-400" />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-[92vw] max-w-6xl h-[90vh] overflow-hidden">

        {/* ── 헤더 ─────────────────────────────── */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-3 shrink-0">
          <CalendarDays size={18} className="text-blue-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-800">전체 캘린더</span>
          <span className="text-xs text-gray-400">— 날짜 속성이 있는 모든 페이지</span>
          <div className="flex-1" />

          {/* 뷰 탭 토글 */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([
              { tab: 'month' as ViewTab, label: '월간', Icon: CalendarDays },
              { tab: 'week'  as ViewTab, label: '주간', Icon: CalendarRange },
              { tab: 'day'   as ViewTab, label: '일간', Icon: Clock },
            ]).map(({ tab, label, Icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => setViewTab(tab)}
                className={[
                  'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors',
                  viewTab === tab ? 'bg-white shadow-sm text-gray-700 font-medium' : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="닫기 (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── 탐색 바 ─────────────────────────────── */}
        <div className="px-6 py-2.5 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <button type="button" onClick={goPrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={goToday}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            오늘
          </button>
          <button type="button" onClick={goNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700 ml-1">{periodLabel()}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">
            {Array.from(pagesByDate.values()).reduce((s, a) => s + a.length, 0)}개 일정
          </span>
        </div>

        {/* ── 콘텐츠 영역 ─────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* ============================================
              월간 뷰
              ============================================ */}
          {viewTab === 'month' && (
            <div className="flex-1 overflow-auto p-4">
              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((d, i) => (
                  <div key={d} className={[
                    'text-center text-[11px] font-medium py-2',
                    i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400',
                  ].join(' ')}>{d}</div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-1">
                {calGrid.map((date, idx) => {
                  const dateStr    = date ? toDateStr(date) : ''
                  const isToday    = dateStr === todayStr
                  const colIdx     = idx % 7
                  const pagesOnDay = date ? (pagesByDate.get(dateStr) ?? []) : []
                  return (
                    <div
                      key={idx}
                      onClick={() => date && setViewTab('day') && setAnchor(date)}
                      className={[
                        'min-h-24 rounded-xl border p-1.5 transition-colors',
                        !date ? 'bg-gray-50 border-transparent' : 'bg-white border-gray-100 hover:border-blue-200 cursor-pointer',
                      ].join(' ')}
                    >
                      {date && (
                        <>
                          <div className={[
                            'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 select-none',
                            isToday    ? 'bg-blue-500 text-white' : '',
                            !isToday && colIdx === 0 ? 'text-red-400' : '',
                            !isToday && colIdx === 6 ? 'text-blue-400' : '',
                            !isToday && colIdx > 0 && colIdx < 6 ? 'text-gray-600' : '',
                          ].join(' ')}>{date.getDate()}</div>
                          {pagesOnDay.slice(0, 3).map(page => {
                            const timeProp = page.properties?.find(p => p.type === 'time')?.value
                            const timeLabel = timeProp?.split('-')[0] ?? ''
                            return (
                              <button
                                key={page.id}
                                type="button"
                                onClick={ev => { ev.stopPropagation(); handlePageClick(page.id) }}
                                className="w-full text-left text-[10px] px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 truncate mb-0.5 transition-colors flex items-center gap-0.5"
                              >
                                {timeLabel && <span className="text-[9px] opacity-70 shrink-0">{timeLabel}</span>}
                                <span className="truncate">{page.icon} {page.title || '제목 없음'}</span>
                              </button>
                            )
                          })}
                          {pagesOnDay.length > 3 && (
                            <span className="text-[9px] text-gray-400 pl-1.5">+{pagesOnDay.length - 3}개 더</span>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 날짜 없는 페이지 */}
              {noDatPages.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 mb-2">날짜 없음 ({noDatPages.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {noDatPages.map(page => (
                      <button key={page.id} type="button"
                        onClick={() => handlePageClick(page.id)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors">
                        {page.icon || '📝'} {page.title || '제목 없음'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================
              주간 뷰 — 7열 × 타임라인 (타임 블록 포함)
              ============================================ */}
          {viewTab === 'week' && (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* 날짜 헤더 (sticky) */}
              <div className="grid shrink-0 border-b border-gray-200 bg-white z-10"
                style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
                <div className="border-r border-gray-100" />
                {weekDates.map((d, i) => {
                  const ds = toDateStr(d)
                  const isToday = ds === todayStr
                  const allDay = getAllDayPages(ds)
                  return (
                    <div key={i} className="border-r border-gray-100 last:border-r-0">
                      {/* 요일 + 날짜 */}
                      <div className="text-center py-1.5">
                        <div className={['text-[10px] font-medium', i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'].join(' ')}>
                          {WEEKDAYS[i]}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setViewTab('day'); setAnchor(d) }}
                          className={[
                            'text-sm font-semibold mx-auto w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                            isToday ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100',
                          ].join(' ')}
                        >
                          {d.getDate()}
                        </button>
                      </div>
                      {/* 하루 종일 일정 */}
                      {allDay.length > 0 && (
                        <div className="px-0.5 pb-1 flex flex-col gap-0.5">
                          {allDay.slice(0, 2).map(page => (
                            <button key={page.id} type="button"
                              onClick={() => handlePageClick(page.id)}
                              className="w-full text-left text-[10px] px-1 py-0.5 rounded bg-green-50 hover:bg-green-100 text-green-700 truncate transition-colors">
                              {page.icon} {page.title || '제목 없음'}
                            </button>
                          ))}
                          {allDay.length > 2 && <span className="text-[9px] text-gray-400 pl-1">+{allDay.length - 2}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 타임라인 스크롤 영역 */}
              <div ref={timelineRef} className="flex-1 overflow-auto">
                <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>

                  {/* 시간 레이블 열 */}
                  <div className="border-r border-gray-100">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="text-[10px] text-gray-400 text-right pr-2 pt-1 border-b border-gray-50"
                        style={{ height: HOUR_PX }}>
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* 날짜별 타임라인 열 */}
                  {weekDates.map((d, di) => {
                    const ds = toDateStr(d)
                    return (
                      <div key={di} className={[
                        'border-r border-gray-100 last:border-r-0 relative',
                        ds === todayStr ? 'bg-blue-50/20' : '',
                      ].join(' ')}>
                        <TimelineColumn
                          dateStr={ds}
                          showNowLine={ds === todayStr}
                          onSlotClick={hour => handleSlotClick(ds, hour)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================
              일간 뷰 — 타임라인 + 우측 하루 종일 패널
              ============================================ */}
          {viewTab === 'day' && (
            <div className="flex-1 flex overflow-hidden">

              {/* 타임라인 스크롤 영역 */}
              <div ref={timelineRef} className="flex-1 overflow-auto">

                {/* 하루 종일 일정 섹션 */}
                {getAllDayPages(toDateStr(anchor)).length > 0 && (
                  <div className="border-b border-gray-200 px-4 py-2 bg-gray-50">
                    <span className="text-[10px] text-gray-400 mr-2">하루 종일</span>
                    {getAllDayPages(toDateStr(anchor)).map(page => (
                      <button key={page.id} type="button"
                        onClick={() => handlePageClick(page.id)}
                        className="text-xs mr-1.5 px-2 py-0.5 rounded-full bg-green-50 hover:bg-green-100 text-green-700 transition-colors">
                        {page.icon} {page.title || '제목 없음'}
                      </button>
                    ))}
                  </div>
                )}

                {/* 24시간 타임라인 */}
                <div className="grid" style={{ gridTemplateColumns: '48px 1fr' }}>
                  {/* 시간 레이블 */}
                  <div className="border-r border-gray-100">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="text-[10px] text-gray-400 text-right pr-2 pt-1 border-b border-gray-50"
                        style={{ height: HOUR_PX }}>
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* 타임라인 컬럼 */}
                  <div className="relative">
                    <TimelineColumn
                      dateStr={toDateStr(anchor)}
                      showNowLine
                      onSlotClick={hour => handleSlotClick(toDateStr(anchor), hour)}
                    />
                  </div>
                </div>
              </div>

              {/* 우측: 당일 페이지 요약 패널 */}
              <div className="w-56 border-l border-gray-200 flex flex-col shrink-0">
                <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-500">
                  {anchor.getMonth() + 1}월 {anchor.getDate()}일 일정
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {(pagesByDate.get(toDateStr(anchor)) ?? []).length === 0 ? (
                    <div className="text-center mt-8">
                      <p className="text-xs text-gray-400 mb-2">이 날 일정이 없습니다</p>
                      <button
                        type="button"
                        onClick={() => handleSlotClick(toDateStr(anchor), 9)}
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mx-auto"
                      >
                        <Plus size={12} /> 일정 추가
                      </button>
                    </div>
                  ) : (pagesByDate.get(toDateStr(anchor)) ?? [])
                      .sort((a, b) => {
                        const at = a.properties?.find(p => p.type === 'time')?.value ?? 'zz'
                        const bt = b.properties?.find(p => p.type === 'time')?.value ?? 'zz'
                        return at.localeCompare(bt)
                      })
                      .map(page => {
                        const timeProp = page.properties?.find(p => p.type === 'time')?.value
                        const [s, e] = timeProp?.includes('-') ? timeProp.split('-') : ['', '']
                        return (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => handlePageClick(page.id)}
                            className="w-full text-left mb-1.5 p-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group"
                          >
                            <div className="text-xs font-medium text-gray-700 truncate">
                              {page.icon} {page.title || '제목 없음'}
                            </div>
                            {s && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                ⏰ {s}{e ? ` – ${e}` : ''}
                              </div>
                            )}
                          </button>
                        )
                      })
                  }
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
