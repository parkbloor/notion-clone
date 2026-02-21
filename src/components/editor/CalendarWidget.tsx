// =============================================
// src/components/editor/CalendarWidget.tsx
// 역할: 미니 월간 달력 위젯 — 날짜별 페이지 존재 표시 + 날짜 필터
// Python으로 치면: class CalendarWidget(Widget): def render_month(self): ...
// =============================================

'use client'

import { useState } from 'react'
import { Page } from '@/types/block'

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
// Page.createdAt 타입은 Date이지만, 서버 JSON 역직렬화 시 문자열로 들어옴
// 두 경우를 모두 처리 (Date 객체 or ISO 문자열)
// Python으로 치면: def to_date_key(val): return str(val)[:10]
// -----------------------------------------------
function isoToLocalDateStr(val: Date | string | unknown): string {
  // Date 객체인 경우 → toDateStr() 변환
  if (val instanceof Date) return toDateStr(val)
  // 문자열인 경우 → 앞 10자리 (YYYY-MM-DD) 추출
  if (typeof val === 'string') return val.slice(0, 10)
  // 그 외 (null, undefined 등) → 빈 문자열
  return ''
}

export default function CalendarWidget({ pages, selectedDate, onSelectDate }: CalendarWidgetProps) {

  // 현재 보고있는 연·월 상태 (초기값: 오늘)
  // Python으로 치면: self.current_year, self.current_month = today.year, today.month
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  // -----------------------------------------------
  // 페이지 생성일 SET 계산 — 해당 월에 페이지가 있는 날짜만 추출
  // Python으로 치면: date_set = {iso_to_local_date(p.createdAt) for p in pages if p.createdAt}
  // -----------------------------------------------
  const pageDateSet = new Set(
    pages
      .filter(p => p.createdAt)
      .map(p => isoToLocalDateStr(p.createdAt))
      .filter(d => d.length === 10)  // 변환 실패한 빈 문자열 제거
  )

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
              title={hasPages ? `${dateStr} — 메모 있음` : dateStr}
            >
              {day}
              {/* 페이지 존재 점 표시 — 선택 상태 아닐 때만 */}
              {/* Python으로 치면: if has_pages and not is_selected: render_dot() */}
              {hasPages && !isSelected && (
                <span className={isToday ? "absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400" : "absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-300"} />
              )}
            </button>
          )
        })}
      </div>

      {/* ── 필터 해제 버튼 (날짜 선택 중일 때만 표시) ─── */}
      {/* Python으로 치면: if selected_date: render_clear_button() */}
      {selectedDate && (
        <button
          type="button"
          onClick={() => onSelectDate(null)}
          className="mt-1.5 w-full text-xs text-center text-blue-500 hover:text-blue-600 hover:bg-blue-50 py-0.5 rounded transition-colors"
        >
          {selectedDate} 필터 해제 ✕
        </button>
      )}
    </div>
  )
}
