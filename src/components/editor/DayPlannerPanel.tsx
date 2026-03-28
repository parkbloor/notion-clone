// =============================================
// src/components/editor/DayPlannerPanel.tsx
// 역할: Day Planner 우측 플로팅 패널 (B안)
//   - 에디터 옆에 항상 열어두고 본문 작성하면서 일정 확인
//   - 전체 페이지의 dayplanner 블록에서 해당 날짜 이벤트를 수집
//   - 이벤트 클릭 → 해당 페이지로 이동
//   - 빠른 이벤트 추가 → 현재 열린 페이지의 dayplanner 블록에 저장
//     (없으면 자동 생성)
// Python으로 치면: class DayPlannerPanel(QDockWidget): ...
// =============================================

'use client'

import { useState, useMemo, useCallback } from 'react'
import { usePageStore } from '@/store/pageStore'
import { X, ChevronLeft, ChevronRight, Plus, Check, Clock } from 'lucide-react'
import { PlanEvent, PlannerData } from './DayPlannerBlock'
import { useLocale } from '@/locales'

// ── 오늘 날짜 문자열 ─────────────────────────
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── 날짜 ± N일 ────────────────────────────────
function shiftDate(ds: string, delta: number): string {
  const d = new Date(ds + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── 날짜 레이블 포맷 ─────────────────────────
// dowLabels: 일요일=0 기준 요일 배열 (t.planner.monthly.dowLabels)
// Python으로 치면: def format_date(ds, dow_labels) -> str: ...
function formatDate(ds: string, dowLabels: string[]): string {
  const d = new Date(ds + 'T00:00:00')
  if (isNaN(d.getTime())) return ds
  const wd = dowLabels[d.getDay()] ?? ''
  return `${d.getMonth()+1}/${d.getDate()} (${wd})`
}

// ── 이벤트 컬러 dot 매핑 ─────────────────────
const COLOR_DOT: Record<string, string> = {
  blue:   'bg-blue-400',
  green:  'bg-emerald-400',
  orange: 'bg-orange-400',
  purple: 'bg-violet-400',
  red:    'bg-rose-400',
  teal:   'bg-teal-400',
}

// ── 이벤트 bar 배경색 매핑 ────────────────────
const COLOR_BAR: Record<string, string> = {
  blue:   'bg-blue-50 border-blue-200',
  green:  'bg-emerald-50 border-emerald-200',
  orange: 'bg-orange-50 border-orange-200',
  purple: 'bg-violet-50 border-violet-200',
  red:    'bg-rose-50 border-rose-200',
  teal:   'bg-teal-50 border-teal-200',
}
const COLOR_TEXT: Record<string, string> = {
  blue:   'text-blue-700',
  green:  'text-emerald-700',
  orange: 'text-orange-700',
  purple: 'text-violet-700',
  red:    'text-rose-700',
  teal:   'text-teal-700',
}

interface DayPlannerPanelProps {
  onClose: () => void
}

export default function DayPlannerPanel({ onClose }: DayPlannerPanelProps) {

  // ── 로케일 ────────────────────────────────
  // Python으로 치면: t = use_locale()
  const t = useLocale()

  const { pages, currentPageId, setCurrentPage, pushRecentPage, updateBlock, updateBlockType, addBlock } = usePageStore()

  // ── 현재 날짜 ────────────────────────────────
  const [date, setDate] = useState(todayStr())

  // ── 빠른 추가 폼 상태 ────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formStart, setFormStart] = useState('09:00')
  const [formEnd,   setFormEnd]   = useState('10:00')
  const [formColor, setFormColor] = useState('blue')

  // ── 전체 페이지에서 해당 날짜의 dayplanner 이벤트 수집 ──
  // Python으로 치면: events = [e for page in pages for block in page.blocks if block.type=='dayplanner'
  //                              for e in json.loads(block.content).events if data.date == target_date]
  const eventsForDate = useMemo(() => {
    const result: { event: PlanEvent; pageId: string; blockId: string; pageTitle: string; pageIcon: string }[] = []
    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        if (block.type !== 'dayplanner') continue
        try {
          const data: PlannerData = JSON.parse(block.content || '{}')
          if (data.date !== date) continue
          for (const ev of data.events ?? []) {
            result.push({
              event: ev,
              pageId: page.id,
              blockId: block.id,
              pageTitle: page.title || '제목 없음',
              pageIcon:  page.icon  || '📝',
            })
          }
        } catch { /* JSON 파싱 실패 무시 */ }
      }
    }
    // start 시간순 정렬
    return result.sort((a, b) => a.event.start.localeCompare(b.event.start))
  }, [pages, date])

  // ── 완료 토글 ────────────────────────────────
  // Python으로 치면: def toggle_done(page_id, block_id, event_id): ...
  const toggleDone = useCallback((pageId: string, blockId: string, eventId: string) => {
    const page  = pages.find(p => p.id === pageId)
    const block = page?.blocks?.find(b => b.id === blockId)
    if (!block) return
    try {
      const data: PlannerData = JSON.parse(block.content || '{}')
      const events = data.events.map(e => e.id === eventId ? { ...e, done: !e.done } : e)
      updateBlock(pageId, blockId, JSON.stringify({ ...data, events }))
    } catch { /* 무시 */ }
  }, [pages, updateBlock])

  // ── 빠른 추가: 현재 페이지의 dayplanner 블록에 이벤트 추가 ──
  // 현재 페이지에 dayplanner 블록이 없으면 자동 생성
  // Python으로 치면: def quick_add(title, start, end, color): ...
  const handleQuickAdd = useCallback(() => {
    if (!formTitle.trim()) return
    const newEvent: PlanEvent = {
      id:    crypto.randomUUID(),
      title: formTitle.trim(),
      start: formStart,
      end:   formEnd,
      color: formColor,
      done:  false,
    }

    // 현재 페이지에서 오늘 날짜의 dayplanner 블록 찾기
    const page = pages.find(p => p.id === currentPageId)
    const existingBlock = page?.blocks?.find(b => {
      if (b.type !== 'dayplanner') return false
      try {
        const d: PlannerData = JSON.parse(b.content || '{}')
        return d.date === date
      } catch { return false }
    })

    if (existingBlock && currentPageId) {
      // 기존 블록에 이벤트 추가
      try {
        const data: PlannerData = JSON.parse(existingBlock.content || '{}')
        updateBlock(currentPageId, existingBlock.id, JSON.stringify({
          ...data,
          events: [...data.events, newEvent],
        }))
      } catch { /* 무시 */ }
    } else if (currentPageId) {
      // 새 dayplanner 블록 추가: addBlock → 마지막 블록 ID 추적 → type + content 설정
      addBlock(currentPageId)
      // addBlock은 동기적으로 스토어를 업데이트하므로 즉시 마지막 블록 참조 가능
      const newBlocks = usePageStore.getState().pages.find(p => p.id === currentPageId)?.blocks ?? []
      const newBlockId = newBlocks[newBlocks.length - 1]?.id
      if (newBlockId) {
        updateBlockType(currentPageId, newBlockId, 'dayplanner')
        updateBlock(currentPageId, newBlockId, JSON.stringify({ date, events: [newEvent] }))
      }
    }

    setFormTitle('')
    setShowForm(false)
  }, [formTitle, formStart, formEnd, formColor, date, pages, currentPageId, updateBlock, addBlock])

  // ── 현재 시각 기준 진행 중 이벤트 판별 ──────
  // Python으로 치면: def is_ongoing(event): return start <= now <= end
  function isOngoing(ev: PlanEvent): boolean {
    const now    = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const s      = ev.start.split(':').map(Number)
    const e      = ev.end.split(':').map(Number)
    if (s.length < 2 || e.length < 2) return false
    return (s[0]*60+s[1]) <= nowMin && nowMin <= (e[0]*60+e[1])
  }

  const isToday  = date === todayStr()
  const doneCount = eventsForDate.filter(x => x.event.done).length

  return (
    <div className="w-64 flex flex-col border-l border-gray-200 bg-white shrink-0 h-full">

      {/* ── 헤더 ─────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2 shrink-0">
        <Clock size={14} className="text-blue-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700 flex-1">{t.planner.day.panelTitle}</span>
        <button type="button" onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* ── 날짜 네비게이션 ───────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1 shrink-0">
        <button type="button" onClick={() => setDate(d => shiftDate(d, -1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft size={13} />
        </button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-xs text-gray-700 bg-transparent border-none outline-none cursor-pointer flex-1 text-center"
        />
        <button type="button" onClick={() => setDate(d => shiftDate(d, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRight size={13} />
        </button>
      </div>

      {/* ── 날짜 레이블 + 오늘 버튼 ─────────── */}
      <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-gray-500 flex-1">{formatDate(date, t.planner.monthly.dowLabels)}</span>
        {isToday && <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">{t.planner.day.today}</span>}
        {!isToday && (
          <button type="button" onClick={() => setDate(todayStr())}
            className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors">
            {t.planner.day.goToday}
          </button>
        )}
        <span className="text-[10px] text-gray-400">{doneCount}/{eventsForDate.length}</span>
      </div>

      {/* ── 이벤트 목록 ─────────────────────── */}
      <div className="flex-1 overflow-auto">
        {eventsForDate.length === 0 && !showForm ? (
          <div className="text-center py-10 px-4">
            <p className="text-xs text-gray-400 mb-3">
              {isToday ? t.planner.day.noEventsToday : t.planner.day.noEventsDay}
            </p>
            <button type="button" onClick={() => setShowForm(true)}
              className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 mx-auto transition-colors">
              <Plus size={12} /> {t.planner.day.addEvent}
            </button>
          </div>
        ) : (
          <div className="py-1">
            {eventsForDate.map(({ event, pageId, blockId, pageTitle, pageIcon }, idx) => {
              const ongoing = isToday && isOngoing(event)
              const barCls  = COLOR_BAR[event.color]  ?? 'bg-blue-50 border-blue-200'
              const txtCls  = COLOR_TEXT[event.color] ?? 'text-blue-700'
              const dotCls  = COLOR_DOT[event.color]  ?? 'bg-blue-400'
              return (
                <div
                  key={`${blockId}-${event.id}-${idx}`}
                  className={[
                    'mx-2 my-1 rounded-lg border px-2.5 py-2 cursor-pointer transition-all',
                    barCls,
                    ongoing ? 'ring-2 ring-blue-300 ring-offset-1' : '',
                  ].join(' ')}
                  onClick={() => { setCurrentPage(pageId); pushRecentPage(pageId) }}
                >
                  <div className="flex items-start gap-2">
                    {/* 완료 토글 */}
                    <button type="button"
                      onClick={e => { e.stopPropagation(); toggleDone(pageId, blockId, event.id) }}
                      className={[
                        'shrink-0 w-3.5 h-3.5 rounded border mt-0.5 flex items-center justify-center transition-all',
                        event.done ? `${dotCls} border-transparent` : 'border-gray-300',
                      ].join(' ')}>
                      {event.done && <Check size={9} className="text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={[
                        'text-xs font-medium truncate',
                        txtCls,
                        event.done ? 'line-through opacity-50' : '',
                      ].join(' ')}>
                        {event.title}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-gray-400">
                          {event.start} – {event.end}
                        </span>
                        {ongoing && (
                          <span className="text-[9px] bg-blue-500 text-white px-1 py-0.5 rounded-full animate-pulse">
                            {t.planner.day.inProgress}
                          </span>
                        )}
                      </div>
                      {/* 출처 페이지 */}
                      <div className="text-[10px] text-gray-400 truncate mt-0.5">
                        {pageIcon} {pageTitle}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 빠른 추가 폼 ─────────────────── */}
        {showForm && (
          <div className="mx-2 my-2 p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder={t.planner.day.eventNamePlaceholder}
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); if (e.key === 'Escape') setShowForm(false) }}
              className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white w-full"
            />
            <div className="flex items-center gap-1">
              <input type="time" value={formStart} onChange={e => setFormStart(e.target.value)}
                className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" />
              <span className="text-[10px] text-gray-400">~</span>
              <input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)}
                className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 bg-white" />
            </div>
            {/* 색상 */}
            <div className="flex gap-1.5">
              {Object.entries(COLOR_DOT).map(([id, cls]) => (
                <button key={id} type="button" onClick={() => setFormColor(id)}
                  className={['w-4 h-4 rounded-full transition-all', cls, formColor === id ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''].join(' ')} />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={handleQuickAdd}
                className="flex-1 text-[11px] bg-blue-500 hover:bg-blue-600 text-white px-2 py-1.5 rounded transition-colors">
                {t.planner.day.addBtn}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded hover:bg-gray-200 transition-colors">
                {t.planner.day.cancelBtn}
              </button>
            </div>
            {!currentPageId && (
              <p className="text-[10px] text-amber-500">{t.planner.day.openPageFirst}</p>
            )}
          </div>
        )}
      </div>

      {/* ── 하단 빠른 추가 버튼 ─────────────── */}
      {!showForm && eventsForDate.length > 0 && (
        <div className="px-3 py-2.5 border-t border-gray-100 shrink-0">
          <button type="button" onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 py-1.5 rounded-lg hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-colors">
            <Plus size={13} /> {t.planner.day.addEvent}
          </button>
        </div>
      )}
    </div>
  )
}
