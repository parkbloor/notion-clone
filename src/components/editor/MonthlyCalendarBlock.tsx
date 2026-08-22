// =============================================
// src/components/editor/MonthlyCalendarBlock.tsx
// 역할: 월간 캘린더 블록
//   - 5~6주 달력 그리드 (일~토)
//   - 날짜 클릭 → 해당 일간 노트로 이동 (없으면 자동 생성)
//   - 일간 노트 존재 시 하단 파란 점 인디케이터
//   - 날짜별 메모 (hover → 인라인 입력)
//   - 오늘 강조 / 주말 색상 / 당월 외 날짜 흐리게
// Python으로 치면: class MonthlyCalendarBlock(QWidget): ...
// =============================================

'use client'

import { useState, useMemo, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { ChevronLeft, ChevronRight, PenLine, X } from 'lucide-react'
import { useLocale } from '@/locales'
import { getDailyNoteDate, openOrCreateDailyNote } from '@/lib/dailyNotes'

// ── 날짜 유틸 ─────────────────────────────────
// Python으로 치면: def fmt_date(y, m, d): return f'{y:04d}-{m:02d}-{d:02d}'
function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayStr(): string {
  const d = new Date()
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// ── content JSON 구조 ─────────────────────────
// Python으로 치면: @dataclass class MonthlyCalData: year, month, memos
interface MonthlyCalData {
  year:  number                       // 표시 연도
  month: number                       // 표시 월 (1~12)
  memos: Record<string, string>       // { 'YYYY-MM-DD': '메모 텍스트' }
}

// ── 달력 셀 한 개의 정보 ──────────────────────
// Python으로 치면: @dataclass class CalCell: dateStr, day, isCurrentMonth
interface CalCell {
  dateStr:        string    // 'YYYY-MM-DD'
  day:            number    // 일 (1~31)
  isCurrentMonth: boolean   // 당월 여부
}

// =============================================
// MonthlyCalendarBlock — 메인 컴포넌트
// =============================================
interface Props { block: Block; pageId: string }

export default function MonthlyCalendarBlock({ block, pageId }: Props) {
  const t = useLocale()
  const updateBlock    = usePageStore(s => s.updateBlock)
  const pages          = usePageStore(s => s.pages)

  // ── content 파싱 ──────────────────────────────
  // Python으로 치면: data = json.loads(block.content) if block.content else default
  const data: MonthlyCalData = useMemo(() => {
    try {
      const p = JSON.parse(block.content || '{}')
      const now = new Date()
      return {
        year:  p.year  ?? now.getFullYear(),
        month: p.month ?? now.getMonth() + 1,
        memos: p.memos ?? {},
      }
    } catch {
      const now = new Date()
      return { year: now.getFullYear(), month: now.getMonth() + 1, memos: {} }
    }
  }, [block.content])

  const save = useCallback((next: MonthlyCalData) => {
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 월 이동 ───────────────────────────────────
  // Python으로 치면: def prev_month(): month -= 1; if month < 1: year -= 1; month = 12
  function prevMonth() {
    const m = data.month - 1
    save({ ...data, year: m < 1 ? data.year - 1 : data.year, month: m < 1 ? 12 : m })
  }
  function nextMonth() {
    const m = data.month + 1
    save({ ...data, year: m > 12 ? data.year + 1 : data.year, month: m > 12 ? 1 : m })
  }
  function goToday() {
    const now = new Date()
    save({ ...data, year: now.getFullYear(), month: now.getMonth() + 1 })
  }

  // ── 달력 셀 배열 생성 (6주 × 7일 = 42칸) ────
  // Python으로 치면: def build_cells(year, month) -> list[CalCell]: ...
  const cells: CalCell[] = useMemo(() => {
    const firstDay = new Date(data.year, data.month - 1, 1).getDay()  // 0=일
    const lastDate = new Date(data.year, data.month, 0).getDate()     // 당월 마지막 일

    // 이전 달 마지막 날
    const prevLastDate = new Date(data.year, data.month - 1, 0).getDate()

    const result: CalCell[] = []

    // 이전 달 채우기
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevLastDate - i
      const pm = data.month - 1
      const py = pm < 1 ? data.year - 1 : data.year
      const pMonth = pm < 1 ? 12 : pm
      result.push({ dateStr: fmtDate(py, pMonth, d), day: d, isCurrentMonth: false })
    }

    // 당월 채우기
    for (let d = 1; d <= lastDate; d++) {
      result.push({ dateStr: fmtDate(data.year, data.month, d), day: d, isCurrentMonth: true })
    }

    // 다음 달 채우기 (6주 고정 = 42칸)
    const remaining = 42 - result.length
    const nm = data.month + 1
    const ny = nm > 12 ? data.year + 1 : data.year
    const nMonth = nm > 12 ? 1 : nm
    for (let d = 1; d <= remaining; d++) {
      result.push({ dateStr: fmtDate(ny, nMonth, d), day: d, isCurrentMonth: false })
    }

    return result
  }, [data.year, data.month])

  // ── 일간 노트 존재 여부 Set ──────────────────
  // 한·영 기존 일간 노트 제목을 모두 인식한다.
  // Python으로 치면: daily_note_dates = {daily_note_date(p.title) for p in pages}
  const dailyNoteDates = useMemo(() => {
    const s = new Set<string>()
    pages.forEach(p => {
      const dateStr = getDailyNoteDate(p.title)
      if (dateStr) s.add(dateStr)
    })
    return s
  }, [pages])

  // ── 메모 편집 상태 ────────────────────────────
  // Python으로 치면: self.editing_memo: str | None = None
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [memoInput,   setMemoInput]   = useState('')

  function openMemoEdit(dateStr: string) {
    setEditingDate(dateStr)
    setMemoInput(data.memos[dateStr] ?? '')
  }
  function saveMemo(dateStr: string, text: string) {
    const memos = { ...data.memos }
    if (text.trim()) memos[dateStr] = text.trim()
    else             delete memos[dateStr]
    save({ ...data, memos })
    setEditingDate(null)
    setMemoInput('')
  }

  // ── 날짜 클릭 → 일간 노트 이동/생성 ─────────
  // Python으로 치면: async def on_date_click(date_str): open_or_create_daily_note(date_str)
  async function handleDateClick(dateStr: string) {
    // 메모 편집 중이면 클릭 무시
    if (editingDate) return

    await openOrCreateDailyNote(dateStr)
  }

  const today = todayStr()
  // 헤더 레이블 (예: 2026년 3월)
  const headerLabel = t.planner.monthly.yearMonthFmt.replace('{year}', String(data.year)).replace('{month}', String(data.month))

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white select-none w-full overflow-hidden"
      onContextMenu={e => e.stopPropagation()}
    >
      {/* ── 헤더 ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button type="button" onClick={prevMonth}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-bold text-gray-700 min-w-24 text-center">
          📅 {headerLabel}
        </span>
        <button type="button" onClick={nextMonth}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronRight size={14} />
        </button>
        <button type="button" onClick={goToday}
          className="text-[10px] text-blue-500 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors">
          {t.planner.monthly.thisMonth}
        </button>
        <div className="flex-1" />
        {/* 범례 */}
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            {t.planner.monthly.hasNote}
          </span>
          <span>클릭 → 노트 열기</span>
        </div>
      </div>

      {/* ── 요일 헤더 ─────────────────────────── */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {t.planner.monthly.dowLabels.map((label, i) => (
          <div key={label} className={[
            'text-center py-2 text-[11px] font-semibold',
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400',
          ].join(' ')}>
            {label}
          </div>
        ))}
      </div>

      {/* ── 달력 그리드 (6주 × 7일) ──────────── */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const isToday    = cell.dateStr === today
          const dow        = idx % 7           // 0=일, 6=토
          const isSun      = dow === 0
          const isSat      = dow === 6
          const hasDailyNote = dailyNoteDates.has(cell.dateStr)
          const memo       = data.memos[cell.dateStr]
          const isEditing  = editingDate === cell.dateStr

          return (
            <div
              key={cell.dateStr}
              className={[
                'relative border-r border-b border-gray-50 last:border-r-0',
                // 6번째 행 이후 border-b 제거
                idx >= 35 ? 'border-b-0' : '',
                // 오늘 배경
                isToday ? 'bg-blue-50/60' : '',
                // 당월 외 날짜
                !cell.isCurrentMonth ? 'bg-gray-50/50' : '',
              ].join(' ')}
              style={{ minHeight: '72px' }}
            >
              {/* 날짜 숫자 + 클릭 액션 */}
              <div className="p-1.5">
                <button
                  type="button"
                  onClick={() => handleDateClick(cell.dateStr)}
                  className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all',
                    // 오늘: 파란 원
                    isToday
                      ? 'bg-blue-500 text-white'
                      : [
                          // 당월 외: 흐리게
                          !cell.isCurrentMonth ? 'opacity-30 ' : '',
                          // 주말 색상
                          isSun ? 'text-red-400 hover:bg-red-50'
                          : isSat ? 'text-blue-400 hover:bg-blue-50'
                          : 'text-gray-700 hover:bg-gray-100',
                        ].join(''),
                  ].join(' ')}
                  title={t.planner.monthly.openOrCreate.replace('{date}', cell.dateStr).replace('{action}', hasDailyNote ? t.planner.monthly.openAction : t.planner.monthly.createAction)}
                >
                  {cell.day}
                </button>
              </div>

              {/* 메모 텍스트 */}
              {memo && !isEditing && (
                <div className="px-1.5 pb-0.5">
                  <span className="text-[10px] text-gray-500 leading-tight block truncate">
                    {memo}
                  </span>
                </div>
              )}

              {/* 메모 인라인 입력 */}
              {isEditing && (
                <div className="px-1.5 pb-1">
                  <input
                    autoFocus
                    type="text"
                    value={memoInput}
                    onChange={e => setMemoInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  saveMemo(cell.dateStr, memoInput)
                      if (e.key === 'Escape') { setEditingDate(null); setMemoInput('') }
                    }}
                    onBlur={() => saveMemo(cell.dateStr, memoInput)}
                    placeholder={t.planner.monthly.memoPlaceholderShort}
                    className="w-full text-[10px] border-b border-blue-300 outline-none bg-transparent text-gray-700 py-0.5"
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}

              {/* 하단 영역: 인디케이터 + 메모 버튼 */}
              <div className="absolute bottom-1 left-0 right-0 flex items-center justify-between px-1.5">
                {/* 일간 노트 인디케이터 점 */}
                {hasDailyNote ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title={t.planner.monthly.dailyNoteHasDot} />
                ) : (
                  <span />
                )}

                {/* 메모 편집 버튼 (hover 시 표시) */}
                {!isEditing && cell.isCurrentMonth && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); openMemoEdit(cell.dateStr) }}
                    title={t.planner.monthly.memoAddTitle}
                    className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-gray-300 hover:text-blue-400 transition-all"
                    style={{ opacity: memo ? 0.4 : undefined }}
                  >
                    <PenLine size={10} />
                  </button>
                )}
                {/* 메모 삭제 버튼 (메모 있을 때) */}
                {memo && !isEditing && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); saveMemo(cell.dateStr, '') }}
                    title={t.planner.monthly.memoDeleteTitle}
                    className="text-gray-200 hover:text-red-400 transition-colors"
                  >
                    <X size={9} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 하단 요약 ─────────────────────────── */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
        {/* 일간 노트 개수 */}
        {(() => {
          const count = cells.filter(c => c.isCurrentMonth && dailyNoteDates.has(c.dateStr)).length
          const total = cells.filter(c => c.isCurrentMonth).length
          return (
            <span>
              {t.planner.monthly.footerNote}{' '}
              <span className="text-blue-500 font-semibold">{count}</span>
              {t.planner.monthly.footerDays.replace('{total}', String(total))}
            </span>
          )
        })()}
        {/* 메모 개수 */}
        {(() => {
          const count = cells.filter(c => c.isCurrentMonth && data.memos[c.dateStr]).length
          return count > 0 ? (
            <span>{t.planner.monthly.footerMemo.replace('{count}', String(count))}</span>
          ) : null
        })()}
        <span className="flex-1" />
        <span>{t.planner.monthly.footerHint}</span>
      </div>
    </div>
  )
}
