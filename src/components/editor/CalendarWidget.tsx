// =============================================
// src/components/editor/CalendarWidget.tsx
// 역할: 미니 월간 달력 위젯 — 날짜별 페이지 존재 표시 + 날짜 필터
// Python으로 치면: class CalendarWidget(Widget): def render_month(self): ...
// =============================================

'use client'

import { useState, useMemo } from 'react'
import { Page } from '@/types/block'
import {
  collectRecordCalendarEntries,
  groupRecordCalendarEntriesByDate,
  type RecordCalendarEntry,
} from '@/lib/recordCalendar'

// -----------------------------------------------
// Props 타입 정의
// selectedDate: 'YYYY-MM-DD' 형식 또는 null (필터 없음)
// onSelectDate: 날짜 클릭 시 콜백 (같은 날짜 재클릭 → null로 필터 해제)
// Python으로 치면: @dataclass class CalendarProps: pages, selected_date, on_select_date
// -----------------------------------------------
interface CalendarWidgetProps {
  pages: Page[]
  selectedDate: string | null
  onSelectDate: (date: string | null) => void
  onOpenRecord?: (record: RecordCalendarEntry) => void
}

// -----------------------------------------------
// 요일 헤더 레이블 (일요일 시작)
// Python으로 치면: WEEKDAYS = ['일','월','화','수','목','금','토']
// -----------------------------------------------
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// -----------------------------------------------
// Date → 'YYYY-MM-DD' 문자열 변환 (로컬 타임존 기준)
// Python으로 치면: def to_date_str(d): return d.strftime('%Y-%m-%d')
// -----------------------------------------------
function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// -----------------------------------------------
// createdAt 값 → 'YYYY-MM-DD' 로컬 날짜 변환
// 서버는 UTC ISO 문자열을 반환하므로 앞 10자리를 자르면 KST 날짜가 하루 어긋날 수 있다.
// Python으로 치면: def to_date_key(val): return to_local_date(parse_iso(val))
// -----------------------------------------------
function isoToLocalDateStr(val: Date | string | unknown): string {
  const date = val instanceof Date ? val : typeof val === 'string' ? new Date(val) : null
  return date && !Number.isNaN(date.getTime()) ? toDateStr(date) : ''
}

export default function CalendarWidget({ pages, selectedDate, onSelectDate, onOpenRecord }: CalendarWidgetProps) {

  // 현재 보고있는 연·월 상태 (초기값: 오늘)
  // Python으로 치면: self.current_year, self.current_month = today.year, today.month
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  // -----------------------------------------------
  // 페이지 생성일 SET 계산 — 해당 월에 페이지가 있는 날짜만 추출
  // Python으로 치면: date_set = {iso_to_local_date(p.createdAt) for p in pages if p.createdAt}
  // pages 배열이 바뀔 때만 재계산 (매 렌더마다 전체 순회 방지)
  // -----------------------------------------------
  const pageDateSet = useMemo(() => new Set(
    pages
      .filter(p => p.createdAt)
      .map(p => isoToLocalDateStr(p.createdAt))
      .filter(d => d.length === 10)  // 변환 실패한 빈 문자열 제거
  ), [pages])

  // 일반 메모 안의 기록 헤더를 날짜별로 집계한다.
  const recordEntries = useMemo(() => collectRecordCalendarEntries(pages), [pages])
  const recordsByDate = useMemo(() => groupRecordCalendarEntriesByDate(recordEntries), [recordEntries])
  const selectedRecords = selectedDate ? (recordsByDate.get(selectedDate) ?? []) : []

  // -----------------------------------------------
  // 이전 달로 이동
  // Python으로 치면: def go_prev(self): self.month -= 1; if self.month < 0: self.month = 11; self.year -= 1
  // -----------------------------------------------
  function goPrev() {
    if (viewMonth === 0) {
      setViewYear(y => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  // -----------------------------------------------
  // 다음 달로 이동
  // Python으로 치면: def go_next(self): self.month += 1; if self.month > 11: self.month = 0; self.year += 1
  // -----------------------------------------------
  function goNext() {
    if (viewMonth === 11) {
      setViewYear(y => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  // -----------------------------------------------
  // 달력 날짜 배열 생성
  // 첫 날의 요일(0=일)부터 앞을 null로 채우고 1~말일까지
  // Python으로 치면:
  //   first_day = date(year, month, 1).weekday()  # 0=월요일이지만 여기선 0=일요일
  //   days = [None] * first_weekday + list(range(1, last_day+1))
  // -----------------------------------------------
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay() // 0=일
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  // null = 빈 칸, number = 날짜
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: lastDayOfMonth }, (_, i) => i + 1),
  ]

  // 오늘 날짜 문자열 (로컬)
  // Python으로 치면: today_str = date.today().isoformat()
  const todayStr = toDateStr(today)

  // -----------------------------------------------
  // 날짜 클릭 핸들러
  // 이미 선택된 날짜 재클릭 → 필터 해제 (null)
  // Python으로 치면: def on_click(d): selected = None if selected == d else d
  // -----------------------------------------------
  function handleDayClick(day: number) {
    const m = String(viewMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    const dateStr = `${viewYear}-${m}-${d}`
    onSelectDate(selectedDate === dateStr ? null : dateStr)
  }

  // 현재 보고있는 달에 페이지가 있는 날짜 수 (헤더 배지용)
  // Python으로 치면: count = sum(1 for d in date_set if d.startswith(f'{year}-{month:02d}'))
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  const pagesThisMonth = [...pageDateSet].filter(d => d.startsWith(monthPrefix)).length
  const recordsThisMonth = recordEntries.filter(record => record.date.startsWith(monthPrefix)).length

  return (
    <div className="px-2 py-2 border-b border-gray-200 shrink-0">

      {/* ── 헤더: 연월 + 이전/다음 버튼 ─── */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        {/* 이전 달 버튼 */}
        <button
          type="button"
          onClick={goPrev}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xs"
          title="이전 달"
        >
          ◀
        </button>

        {/* 연·월 표시 + 이번 달 페이지 수 배지 */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-gray-600">
            {viewYear}년 {viewMonth + 1}월
          </span>
          {/* 이번 달에 페이지가 있으면 개수 배지 표시 */}
          {/* Python으로 치면: if pages_this_month: render_badge(pages_this_month) */}
          {pagesThisMonth > 0 && (
            <span className="text-xs px-1 py-0 rounded-full bg-blue-100 text-blue-500 font-medium">
              {pagesThisMonth}
            </span>
          )}
          {recordsThisMonth > 0 && (
            <span
              className="text-xs px-1 py-0 rounded-full bg-amber-100 text-amber-600 font-medium"
              title={`이번 달 기록 ${recordsThisMonth}개`}
            >
              기록 {recordsThisMonth}
            </span>
          )}
        </div>

        {/* 다음 달 버튼 */}
        <button
          type="button"
          onClick={goNext}
          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xs"
          title="다음 달"
        >
          ▶
        </button>
      </div>

      {/* ── 요일 헤더 ─── */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS.map(w => (
          <div
            key={w}
            className={w === '일'
              ? "text-center text-xs text-red-400 font-medium py-0.5"
              : w === '토'
              ? "text-center text-xs text-blue-400 font-medium py-0.5"
              : "text-center text-xs text-gray-400 font-medium py-0.5"}
          >
            {w}
          </div>
        ))}
      </div>

      {/* ── 날짜 그리드 ─── */}
      <div className="grid grid-cols-7">
        {calendarCells.map((day, idx) => {
          if (day === null) {
            // 빈 칸 (첫 날 이전)
            return <div key={`empty-${idx}`} />
          }

          // 이 날짜의 'YYYY-MM-DD' 문자열
          const m = String(viewMonth + 1).padStart(2, '0')
          const d = String(day).padStart(2, '0')
          const dateStr = `${viewYear}-${m}-${d}`

          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const hasPages = pageDateSet.has(dateStr)
          const recordCount = recordsByDate.get(dateStr)?.length ?? 0
          // 일요일(0) 또는 토요일(6) 여부 — idx는 0부터 시작하나 요일은 firstDay로 offset
          const weekday = (firstDayOfMonth + day - 1) % 7

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => handleDayClick(day)}
              className={
                isSelected
                  ? "relative flex flex-col items-center justify-center h-6 rounded text-xs font-bold bg-blue-500 text-white"
                  : isToday
                  ? "relative flex flex-col items-center justify-center h-6 rounded text-xs font-bold bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                  : hasPages
                  ? "relative flex flex-col items-center justify-center h-6 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                  : weekday === 0
                  ? "relative flex flex-col items-center justify-center h-6 rounded text-xs text-red-300 hover:bg-gray-100 transition-colors"
                  : weekday === 6
                  ? "relative flex flex-col items-center justify-center h-6 rounded text-xs text-blue-300 hover:bg-gray-100 transition-colors"
                  : "relative flex flex-col items-center justify-center h-6 rounded text-xs text-gray-400 hover:bg-gray-100 transition-colors"
              }
              title={[
                dateStr,
                hasPages ? '메모 있음' : '',
                recordCount > 0 ? `기록 ${recordCount}개` : '',
              ].filter(Boolean).join(' — ')}
            >
              {day}
              {/* 페이지 존재 점 표시 — 선택 상태 아닐 때만 */}
              {/* Python으로 치면: if has_pages and not is_selected: render_dot() */}
              {hasPages && !isSelected && (
                <span className={isToday ? "absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400" : "absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-300"} />
              )}
              {recordCount > 0 && (
                <span
                  className={isSelected
                    ? "absolute -right-0.5 -top-0.5 min-w-3 h-3 px-0.5 rounded-full bg-white text-[8px] leading-3 text-amber-600 shadow-sm"
                    : "absolute -right-0.5 -top-0.5 min-w-3 h-3 px-0.5 rounded-full bg-amber-500 text-[8px] leading-3 text-white shadow-sm"}
                  aria-label={`기록 ${recordCount}개`}
                >
                  {recordCount > 9 ? '9+' : recordCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── 필터 해제 버튼 (날짜 선택 중일 때만 표시) ─── */}
      {/* Python으로 치면: if selected_date: render_clear_button() */}
      {selectedDate && (
        <>
          {selectedRecords.length > 0 && (
            <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
              <div className="mb-1 px-1 text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                {selectedDate} 기록 {selectedRecords.length}개
              </div>
              <div className="space-y-1">
                {selectedRecords.map(record => (
                  <button
                    key={`${record.pageId}-${record.blockId}`}
                    type="button"
                    onClick={() => onOpenRecord?.(record)}
                    disabled={!onOpenRecord}
                    className="w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-amber-50 disabled:cursor-default"
                    title={`${record.pageTitle}의 기록으로 이동`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-xs">{record.pageIcon || '📄'}</span>
                      {record.kind && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                          {record.kind}
                        </span>
                      )}
                      <span className="truncate text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>
                        {record.title || '제목 없는 기록'}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate pl-5 text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                      {record.pageTitle}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="mt-1.5 w-full text-xs text-center text-blue-500 hover:text-blue-600 hover:bg-blue-50 py-0.5 rounded transition-colors"
          >
            {selectedDate} 필터 해제 ✕
          </button>
        </>
      )}
    </div>
  )
}
