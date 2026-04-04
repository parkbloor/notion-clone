// =============================================
// src/components/editor/PeriodicNotesPanel.tsx
// 역할: 사이드바 내 일간·주간·월간 노트 목록 패널
// Python으로 치면: class PeriodicNotesPanel(Widget): ...
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { createBlock } from '@/types/block'
import type { Block } from '@/types/block'
import { useLocale } from '@/locales'

// -----------------------------------------------
// ISO 8601 주차 계산 (1월 첫째 목요일이 속한 주 = 1주)
// Python으로 치면: date.isocalendar()[1]
// -----------------------------------------------
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7)
}

// -----------------------------------------------
// 일간 노트 기본 템플릿 블록 생성
// Notion/Obsidian 일간 노트 베스트 프랙티스 반영:
//   집중 목표 → 일정표(DayPlannerBlock) → 할 일 → 메모 → 하루 돌아보기
// Python으로 치면: def make_daily_template(title, date_str) -> list[Block]: ...
// -----------------------------------------------
function makeDailyTemplate(title: string, dateStr: string): Block[] {
  // 요일 레이블
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  const dayLabel = ['일','월','화','수','목','금','토'][dow]

  // DayPlannerBlock 초기 콘텐츠 — 오늘 날짜, 빈 이벤트, 루틴 자동 적용 ON
  const plannerContent = JSON.stringify({
    date: dateStr, events: [], routines: [], autoApply: true,
  })

  return [
    // ── 제목 ────────────────────────────────────
    { ...createBlock('heading1'), content: `📅 ${dateStr} (${dayLabel})` },
    createBlock('divider'),

    // ── 오늘의 집중 목표 (3개 고정) ─────────────
    // 하루를 시작하기 전 가장 중요한 것 3가지 적기
    { ...createBlock('heading2'), content: '🎯 오늘의 집중 목표' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),

    createBlock('divider'),

    // ── 일정표 (DayPlannerBlock 자동 삽입) ───────
    // 오늘 날짜로 초기화, 루틴이 설정돼 있으면 자동 적용됨
    { ...createBlock('heading2'), content: '⏰ 일정표' },
    { ...createBlock('dayplanner'), content: plannerContent },

    createBlock('divider'),

    // ── 할 일 목록 ───────────────────────────────
    { ...createBlock('heading2'), content: '✅ 오늘 할 일' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),

    // ── 자유 메모 ────────────────────────────────
    { ...createBlock('heading2'), content: '📝 메모' },
    createBlock('paragraph'),
    createBlock('paragraph'),

    createBlock('divider'),

    // ── 하루 돌아보기 (저녁에 작성) ──────────────
    // 토글로 접어두면 아침엔 깔끔하게 보임
    { ...createBlock('heading2'), content: '🌙 하루 돌아보기' },
    { ...createBlock('toggle'), content: '✨ 잘 한 것' },
    { ...createBlock('toggle'), content: '🔧 개선할 점' },
    { ...createBlock('toggle'), content: '📌 내일 준비할 것' },
  ]
}

// -----------------------------------------------
// 주간 노트 기본 템플릿 블록 생성
// Notion/Obsidian 주간 노트 베스트 프랙티스 반영:
//   WeeklyPlannerBlock → 이번 주 목표 → 요일별 계획 → 주간 회고
// Python으로 치면: def make_weekly_template(title, week_start) -> list[Block]: ...
// -----------------------------------------------
function makeWeeklyTemplate(title: string, weekStart: string): Block[] {
  // WeeklyPlannerBlock 초기 content: weekStart만 설정, 나머지는 컴포넌트 내부에서 초기화
  // Python으로 치면: planner_content = json.dumps({'weekStart': week_start, 'days': {}, 'location': ''})
  const plannerContent  = JSON.stringify({ weekStart, days: {}, location: '' })
  const matrixContent   = JSON.stringify({ weekStart })
  const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    // 주간 캘린더 블록 (날씨 + 요일별 태스크)
    { ...createBlock('weeklyplanner'), content: plannerContent },
    createBlock('divider'),
    // 루틴 달성 매트릭스 블록 (DayPlannerBlock 루틴 집계)
    { ...createBlock('heading2'), content: '🔄 루틴 달성 현황' },
    { ...createBlock('routinematrix'), content: matrixContent },
    createBlock('divider'),
    // 이번 주 목표 섹션 (3개 태스크 기본 제공)
    { ...createBlock('heading2'), content: '🎯 이번 주 목표' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('divider'),
    // 요일별 계획 토글 (월~일)
    { ...createBlock('heading2'), content: '📋 요일별 계획' },
    ...DAY_NAMES.map(day => ({ ...createBlock('toggle'), content: `${day}요일` })),
    createBlock('divider'),
    // 주간 회고 섹션
    { ...createBlock('heading2'), content: '🌙 주간 회고' },
    { ...createBlock('toggle'), content: '✨ 잘 한 것' },
    { ...createBlock('toggle'), content: '🔧 개선할 점' },
    { ...createBlock('toggle'), content: '📌 다음 주 준비할 것' },
  ]
}

// -----------------------------------------------
// 월간 노트 기본 템플릿 블록 생성
// Notion/Obsidian 월간 노트 베스트 프랙티스 반영:
//   월간 캘린더 → 이번 달 목표 → 주차별 하이라이트
//   → 독서/학습 → 인사이트 → 월말 회고
// Python으로 치면: def make_monthly_template(title, year, month) -> list[Block]: ...
// -----------------------------------------------
function makeMonthlyTemplate(title: string, year: number, month: number): Block[] {
  // MonthlyCalendarBlock 초기 content: 해당 연/월로 초기화
  // Python으로 치면: cal_content = json.dumps({'year': year, 'month': month, 'memos': {}})
  const calContent = JSON.stringify({ year, month, memos: {} })

  // 주차별 하이라이트 토글 (해당 월의 주차 수만큼 생성)
  // Python으로 치면: week_count = ceil((first_day + last_date) / 7)
  const firstDow  = new Date(year, month - 1, 1).getDay()
  const lastDate  = new Date(year, month, 0).getDate()
  const weekCount = Math.ceil((firstDow + lastDate) / 7)
  const weekToggles = Array.from({ length: weekCount }, (_, i) =>
    ({ ...createBlock('toggle'), content: `${i + 1}주차` })
  )

  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),

    // 월간 캘린더 블록 — 날짜 그리드 + 일간 노트 연결 + 메모
    { ...createBlock('monthlycalendar'), content: calContent },
    createBlock('divider'),

    // 이번 달 목표 섹션 (5개 태스크)
    { ...createBlock('heading2'), content: '🎯 이번 달 목표' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('divider'),

    // 주차별 하이라이트 토글 (1주차~N주차)
    { ...createBlock('heading2'), content: '📅 주차별 하이라이트' },
    ...weekToggles,
    createBlock('divider'),

    // 독서 / 학습 기록
    { ...createBlock('heading2'), content: '📚 독서 / 학습 기록' },
    createBlock('paragraph'),
    createBlock('divider'),

    // 이달의 인사이트
    { ...createBlock('heading2'), content: '💡 이달의 인사이트' },
    createBlock('paragraph'),
    createBlock('paragraph'),
    createBlock('divider'),

    // 월말 회고 섹션
    { ...createBlock('heading2'), content: '🌙 월말 회고' },
    { ...createBlock('toggle'), content: '✨ 잘 한 것' },
    { ...createBlock('toggle'), content: '🔧 개선할 점' },
    { ...createBlock('toggle'), content: '📌 다음 달 준비할 것' },
  ]
}

// -----------------------------------------------
// 분기 노트 기본 템플릿 블록 생성
// QuarterlyPlannerBlock + 분기 회고 토글
// Python으로 치면: def make_quarterly_template(title, year, quarter) -> list[Block]: ...
// -----------------------------------------------
function makeQuarterlyTemplate(title: string, year: number, quarter: 1|2|3|4): Block[] {
  const plannerContent = JSON.stringify({ year, quarter, objectives: [] })
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '🎯 분기 OKR' },
    { ...createBlock('quarterlyplanner'), content: plannerContent },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '🌙 분기 회고' },
    { ...createBlock('toggle'), content: '✨ 잘 한 것' },
    { ...createBlock('toggle'), content: '🔧 개선할 점' },
    { ...createBlock('toggle'), content: '🔜 다음 분기 포커스' },
  ]
}

// -----------------------------------------------
// 연간 노트 기본 템플릿 블록 생성
// YearlyPlannerBlock + 연간 회고 토글
// Python으로 치면: def make_yearly_template(title, year) -> list[Block]: ...
// -----------------------------------------------
function makeYearlyTemplate(title: string, year: number): Block[] {
  const plannerContent = JSON.stringify({ year, goals: [] })
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '🌟 연간 플래너' },
    { ...createBlock('yearlyplanner'), content: plannerContent },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '💭 연간 회고' },
    { ...createBlock('toggle'), content: '올해의 한 단어' },
    { ...createBlock('toggle'), content: '가장 잘한 결정' },
    { ...createBlock('toggle'), content: '내년에 바꿀 한 가지' },
  ]
}

// -----------------------------------------------
// PeriodicNotesPanel — 일간/주간/월간 탭 패널
// -----------------------------------------------
export default function PeriodicNotesPanel() {
  // 로케일 훅
  const t = useLocale()

  // 단기/장기 뷰 모드 전환
  // Python으로 치면: self.view_mode = 'short'
  const [viewMode, setViewMode] = useState<'short' | 'long'>('short')

  // 단기 탭 상태: 'daily' | 'weekly' | 'monthly'
  // Python으로 치면: self.active_tab = 'daily'
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  // 장기 탭 상태: 'quarterly' | 'yearly'
  // Python으로 치면: self.long_tab = 'quarterly'
  const [longTab, setLongTab] = useState<'quarterly' | 'yearly'>('quarterly')

  // 장기 뷰 연도 (분기/연간 공통)
  // Python으로 치면: self.long_view_year = today.year
  const [longViewYear, setLongViewYear] = useState(() => new Date().getFullYear())

  // ── 뷰 기준 날짜 (과거 노트 탐색용) ──────────
  // Python으로 치면: self.view_month = '2026-03', self.view_year = 2026
  const [viewMonthStr, setViewMonthStr] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())

  // 월 이동 헬퍼 (delta: +1 또는 -1)
  // Python으로 치면: def shift_month(delta): ...
  function shiftViewMonth(delta: number) {
    const [y, m] = viewMonthStr.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setViewMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const {
    pages,
    categories,
    currentPageId,
    setCurrentPage,
    addPage,
    updatePageIcon,
    setPageBlocks,
    deletePage,
  } = usePageStore()

  // ── 오늘 기준 날짜 정보 ──────────────────────
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayMonthStr = `${todayYear}-${String(todayMonth).padStart(2, '0')}`
  const todayDateStr = `${todayMonthStr}-${String(today.getDate()).padStart(2, '0')}`
  const todayWeek = getISOWeek(today)
  const todayWeekStr = `${todayYear}-W${String(todayWeek).padStart(2, '0')}`

  // ── 일간 노트 목록 (뷰 기준 월, 날짜 역순) ─────
  // Python으로 치면: [p for p in pages if p.title.startswith(f'일간 노트 {viewMonthStr}')]
  const dailyNotes = pages
    .filter(p => p.title.startsWith(`일간 노트 ${viewMonthStr}`))
    .sort((a, b) => b.title.localeCompare(a.title))

  // ── 주간 노트 목록 (뷰 기준 연도, 주차 역순) ───
  // Python으로 치면: [p for p in pages if p.title.startswith(f'주간 노트 {viewYear}-W')]
  const weeklyNotes = pages
    .filter(p => p.title.startsWith(`주간 노트 ${viewYear}-W`))
    .sort((a, b) => b.title.localeCompare(a.title))

  // ── 월간 노트 목록 (뷰 기준 연도, 월 역순) ─────
  // Python으로 치면: [p for p in pages if p.title.startswith(f'월간 노트 {viewYear}-')]
  const monthlyNotes = pages
    .filter(p => p.title.startsWith(`월간 노트 ${viewYear}-`))
    .sort((a, b) => b.title.localeCompare(a.title))

  // -----------------------------------------------
  // 오늘 일간 노트 열기/생성
  // Python으로 치면: async def open_daily_note(self): ...
  // -----------------------------------------------
  async function handleOpenDaily() {
    setViewMonthStr(todayMonthStr)  // 뷰를 오늘 달로 이동
    const title = `일간 노트 ${todayDateStr}`
    const existing = pages.find(p => p.title === title)
    if (existing) { setCurrentPage(existing.id); return }

    const cat = categories.find(c => c.name === '📅 일간 노트')
    await addPage(title, cat?.id ?? null)

    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return
    updatePageIcon(newId, '📅')
    setPageBlocks(newId, makeDailyTemplate(title, todayDateStr))
  }

  // -----------------------------------------------
  // 이번 주 주간 노트 열기/생성
  // Python으로 치면: async def open_weekly_note(self): ...
  // -----------------------------------------------
  async function handleOpenWeekly() {
    setViewYear(todayYear)  // 뷰를 올해로 이동
    const title = `주간 노트 ${todayWeekStr}`
    const existing = pages.find(p => p.title === title)
    if (existing) { setCurrentPage(existing.id); return }

    // 이번 주 월요일 날짜 계산 (WeeklyPlannerBlock의 weekStart로 사용)
    // Python으로 치면: monday = today - timedelta(days=today.weekday())
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1  // 0=월, 6=일
    const monday = new Date(today)
    monday.setDate(today.getDate() - dayOfWeek)
    const weekStartStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

    const cat = categories.find(c => c.name === '📆 주간 노트')
    await addPage(title, cat?.id ?? null)

    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return
    updatePageIcon(newId, '📆')
    setPageBlocks(newId, makeWeeklyTemplate(title, weekStartStr))
  }

  // -----------------------------------------------
  // 이번 달 월간 노트 열기/생성
  // 제목 형식: "월간 노트 YYYY-MM", 아이콘: 🗓️
  // Python으로 치면: async def open_monthly_note(self): ...
  // -----------------------------------------------
  async function handleOpenMonthly() {
    setViewYear(todayYear)  // 뷰를 올해로 이동
    const title = `월간 노트 ${todayMonthStr}`
    const existing = pages.find(p => p.title === title)
    if (existing) { setCurrentPage(existing.id); return }

    const cat = categories.find(c => c.name === '🗓️ 월간 노트')
    await addPage(title, cat?.id ?? null)

    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return
    updatePageIcon(newId, '🗓️')
    setPageBlocks(newId, makeMonthlyTemplate(title, todayYear, todayMonth))
  }

  // -----------------------------------------------
  // 분기 노트 열기/생성 (연도+분기 파라미터로 특정 분기 노트)
  // 제목 형식: "분기 노트 2026-Q2", 아이콘: 📊
  // Python으로 치면: async def open_quarterly_note(year, quarter): ...
  // -----------------------------------------------
  async function handleOpenQuarterly(year: number, quarter: 1|2|3|4) {
    const title = `분기 노트 ${year}-Q${quarter}`
    const existing = pages.find(p => p.title === title)
    if (existing) { setCurrentPage(existing.id); return }

    const cat = categories.find(c => c.name === '📊 분기 노트')
    await addPage(title, cat?.id ?? null)

    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return
    updatePageIcon(newId, '📊')
    setPageBlocks(newId, makeQuarterlyTemplate(title, year, quarter))
  }

  // -----------------------------------------------
  // 연간 노트 열기/생성 (연도 파라미터로 특정 연도 노트)
  // 제목 형식: "연간 노트 2026", 아이콘: 🌟
  // Python으로 치면: async def open_yearly_note(year): ...
  // -----------------------------------------------
  async function handleOpenYearly(year: number) {
    const title = `연간 노트 ${year}`
    const existing = pages.find(p => p.title === title)
    if (existing) { setCurrentPage(existing.id); return }

    const cat = categories.find(c => c.name === '🌟 연간 노트')
    await addPage(title, cat?.id ?? null)

    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return
    updatePageIcon(newId, '🌟')
    setPageBlocks(newId, makeYearlyTemplate(title, year))
  }

  // 현재 분기 계산
  // Python으로 치면: current_quarter = ceil(today.month / 3)
  const todayCurQ = Math.ceil(todayMonth / 3) as 1|2|3|4

  return (
    <div className="border-t border-gray-100">

      {/* ── 단기/장기 뷰 모드 토글 ──────────────── */}
      {/* Python으로 치면: render_mode_toggle() */}
      <div className="flex items-center px-2 pt-2 pb-1 gap-1">
        <button
          type="button"
          onClick={() => setViewMode('short')}
          className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${viewMode === 'short' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
        >
          {t.overlay.periodic.viewShort}
        </button>
        <button
          type="button"
          onClick={() => setViewMode('long')}
          className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${viewMode === 'long' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
        >
          {t.overlay.periodic.viewLong}
        </button>
      </div>

      {/* ===================================================== */}
      {/* 단기 뷰: 일간 / 주간 / 월간                              */}
      {/* ===================================================== */}
      {viewMode === 'short' && (
        <>
          {/* ── 단기 탭 헤더 (일간/주간/월간) ─────── */}
          {/* Python으로 치면: self.tab_header = TabHeader(['일간', '주간', '월간']) */}
          <div className="flex items-center px-2 pb-1 gap-1">
            <button
              type="button"
              onClick={() => setTab('daily')}
              className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${tab === 'daily' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.overlay.periodic.tabDaily}
            </button>
            <button
              type="button"
              onClick={() => setTab('weekly')}
              className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${tab === 'weekly' ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.overlay.periodic.tabWeekly}
            </button>
            <button
              type="button"
              onClick={() => setTab('monthly')}
              className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${tab === 'monthly' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.overlay.periodic.tabMonthly}
            </button>
          </div>

          {/* ── 일간 탭 ─────────────────────────────── */}
          {tab === 'daily' && (
            <div className="pb-1">
              <div className="flex items-center justify-between px-2 py-1">
                <button type="button" onClick={() => shiftViewMonth(-1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">‹</button>
                <span className="text-xs font-medium text-gray-600">{viewMonthStr}</span>
                <button type="button" onClick={() => shiftViewMonth(1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">›</button>
              </div>
              <div className="px-2 pb-1">
                <button type="button" onClick={handleOpenDaily} className="w-full py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                  {t.overlay.periodic.openToday}
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto">
                {dailyNotes.length === 0 ? (
                  <p className="px-3 py-1 text-xs text-gray-400">{t.overlay.periodic.noDailyNotes.replace('{month}', viewMonthStr)}</p>
                ) : (
                  dailyNotes.map(note => {
                    const datePart = note.title.replace('일간 노트 ', '').slice(5)
                    const isToday = note.title === `일간 노트 ${todayDateStr}`
                    return (
                      <div key={note.id} className="group flex items-center">
                        <button type="button" onClick={() => setCurrentPage(note.id)}
                          className={`flex-1 flex items-center gap-1.5 px-3 py-1 text-xs text-left transition-colors ${currentPageId === note.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                          <span className="text-blue-400">📅</span>
                          <span className="flex-1 truncate">{datePart}</span>
                          {isToday && <span className="shrink-0 px-1 py-0.5 text-[10px] bg-blue-100 text-blue-600 rounded">{t.overlay.periodic.todayBadge}</span>}
                        </button>
                        <button type="button" onClick={() => deletePage(note.id)}
                          className="opacity-0 group-hover:opacity-100 pr-2 text-gray-300 hover:text-red-400 transition-opacity text-xs"
                          title="삭제"
                        >✕</button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* ── 주간 탭 ─────────────────────────────── */}
          {tab === 'weekly' && (
            <div className="pb-1">
              <div className="flex items-center justify-between px-2 py-1">
                <button type="button" onClick={() => setViewYear(y => y - 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">‹</button>
                <span className="text-xs font-medium text-gray-600">{t.overlay.periodic.yearSuffix.replace('{year}', String(viewYear))}</span>
                <button type="button" onClick={() => setViewYear(y => y + 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">›</button>
              </div>
              <div className="px-2 pb-1">
                <button type="button" onClick={handleOpenWeekly} className="w-full py-1 text-xs bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors">
                  {t.overlay.periodic.openThisWeek}
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto">
                {weeklyNotes.length === 0 ? (
                  <p className="px-3 py-1 text-xs text-gray-400">{t.overlay.periodic.noWeeklyNotes.replace('{year}', String(viewYear))}</p>
                ) : (
                  weeklyNotes.map(note => {
                    const weekPart = note.title.replace(`주간 노트 ${viewYear}-`, '')
                    const isThisWeek = note.title === `주간 노트 ${todayWeekStr}`
                    return (
                      <div key={note.id} className="group flex items-center">
                        <button type="button" onClick={() => setCurrentPage(note.id)}
                          className={`flex-1 flex items-center gap-1.5 px-3 py-1 text-xs text-left transition-colors ${currentPageId === note.id ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                          <span className="text-violet-400">📆</span>
                          <span className="flex-1 truncate">{weekPart}</span>
                          {isThisWeek && <span className="shrink-0 px-1 py-0.5 text-[10px] bg-violet-100 text-violet-600 rounded">{t.overlay.periodic.thisWeekBadge}</span>}
                        </button>
                        <button type="button" onClick={() => deletePage(note.id)}
                          className="opacity-0 group-hover:opacity-100 pr-2 text-gray-300 hover:text-red-400 transition-opacity text-xs"
                          title="삭제"
                        >✕</button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* ── 월간 탭 ─────────────────────────────── */}
          {tab === 'monthly' && (
            <div className="pb-1">
              <div className="flex items-center justify-between px-2 py-1">
                <button type="button" onClick={() => setViewYear(y => y - 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">‹</button>
                <span className="text-xs font-medium text-gray-600">{t.overlay.periodic.yearSuffix.replace('{year}', String(viewYear))}</span>
                <button type="button" onClick={() => setViewYear(y => y + 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">›</button>
              </div>
              <div className="px-2 pb-1">
                <button type="button" onClick={handleOpenMonthly} className="w-full py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors">
                  {t.overlay.periodic.openThisMonth}
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto">
                {monthlyNotes.length === 0 ? (
                  <p className="px-3 py-1 text-xs text-gray-400">{t.overlay.periodic.noMonthlyNotes.replace('{year}', String(viewYear))}</p>
                ) : (
                  monthlyNotes.map(note => {
                    const monthPart = note.title.replace(`월간 노트 ${viewYear}-`, '') + '월'
                    const isThisMonth = note.title === `월간 노트 ${todayMonthStr}`
                    return (
                      <div key={note.id} className="group flex items-center">
                        <button type="button" onClick={() => setCurrentPage(note.id)}
                          className={`flex-1 flex items-center gap-1.5 px-3 py-1 text-xs text-left transition-colors ${currentPageId === note.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                          <span className="text-emerald-400">🗓️</span>
                          <span className="flex-1 truncate">{monthPart}</span>
                          {isThisMonth && <span className="shrink-0 px-1 py-0.5 text-[10px] bg-emerald-100 text-emerald-600 rounded">{t.overlay.periodic.thisMonthBadge}</span>}
                        </button>
                        <button type="button" onClick={() => deletePage(note.id)}
                          className="opacity-0 group-hover:opacity-100 pr-2 text-gray-300 hover:text-red-400 transition-opacity text-xs"
                          title="삭제"
                        >✕</button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================== */}
      {/* 장기 뷰: 분기 / 연간                                     */}
      {/* Python으로 치면: if view_mode == 'long': render_long()   */}
      {/* ===================================================== */}
      {viewMode === 'long' && (
        <>
          {/* ── 장기 탭 헤더 (분기/연간) ───────────── */}
          <div className="flex items-center px-2 pb-1 gap-1">
            <button
              type="button"
              onClick={() => setLongTab('quarterly')}
              className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${longTab === 'quarterly' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.overlay.periodic.tabQuarterly}
            </button>
            <button
              type="button"
              onClick={() => setLongTab('yearly')}
              className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${longTab === 'yearly' ? 'bg-rose-100 text-rose-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.overlay.periodic.tabYearly}
            </button>
          </div>

          {/* ── 분기 탭 ─────────────────────────────── */}
          {/* 연도당 Q1~Q4, 각 분기 노트는 1개만 존재         */}
          {/* Python으로 치면: render_quarterly_tab()         */}
          {longTab === 'quarterly' && (
            <div className="pb-2">
              {/* 연도 네비게이션 */}
              <div className="flex items-center justify-between px-2 py-1">
                <button type="button" onClick={() => setLongViewYear(y => y - 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">‹</button>
                <span className="text-xs font-medium text-gray-600">{t.overlay.periodic.yearSuffix.replace('{year}', String(longViewYear))}</span>
                <button type="button" onClick={() => setLongViewYear(y => y + 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">›</button>
              </div>
              {/* Q1~Q4 2×2 그리드 — 각 분기 노트 열기/생성 */}
              {/* Python으로 치면: for q in [1,2,3,4]: render_quarter_btn(q) */}
              <div className="grid grid-cols-2 gap-1.5 px-2">
                {([1, 2, 3, 4] as const).map(q => {
                  const qTitle = `분기 노트 ${longViewYear}-Q${q}`
                  const note = pages.find(p => p.title === qTitle)
                  const isCurrentQ = longViewYear === todayYear && q === todayCurQ
                  const qRanges = t.overlay.periodic.quarterRanges
                  return (
                    <div key={q} className="group relative">
                      <button
                        type="button"
                        onClick={() => handleOpenQuarterly(longViewYear, q)}
                        className={`w-full flex flex-col items-center py-2.5 rounded-lg border text-xs transition-colors ${isCurrentQ ? 'border-amber-300 bg-amber-50 text-amber-700 font-semibold' : note ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100' : 'border-dashed border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-500'}`}
                      >
                        <span className="font-bold">Q{q}</span>
                        <span className="text-[10px] mt-0.5 opacity-70">{qRanges[q - 1]}</span>
                        {note && <span className="text-[9px] mt-1 text-emerald-500">{t.overlay.periodic.noteExists}</span>}
                        {!note && <span className="text-[9px] mt-1 opacity-50">{t.overlay.periodic.clickToCreate}</span>}
                      </button>
                      {note && (
                        <button type="button" onClick={() => deletePage(note.id)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[10px] text-gray-300 hover:text-red-400 transition-opacity leading-none"
                          title="삭제"
                        >✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 연간 탭 ─────────────────────────────── */}
          {/* 연도당 노트 1개만 존재                          */}
          {/* Python으로 치면: render_yearly_tab()            */}
          {longTab === 'yearly' && (
            <div className="pb-2">
              {/* 연도 네비게이션 */}
              <div className="flex items-center justify-between px-2 py-1">
                <button type="button" onClick={() => setLongViewYear(y => y - 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">‹</button>
                <span className="text-xs font-medium text-gray-600">{t.overlay.periodic.yearSuffix.replace('{year}', String(longViewYear))}</span>
                <button type="button" onClick={() => setLongViewYear(y => y + 1)} className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 rounded">›</button>
              </div>
              {/* 연간 노트 열기/생성 버튼 (단 1개) */}
              {/* Python으로 치면: render_yearly_btn(year) */}
              <div className="px-2">
                {(() => {
                  const yTitle = `연간 노트 ${longViewYear}`
                  const note = pages.find(p => p.title === yTitle)
                  const isCurrentYear = longViewYear === todayYear
                  return (
                    <div className="group relative">
                      <button
                        type="button"
                        onClick={() => handleOpenYearly(longViewYear)}
                        className={`w-full py-4 rounded-lg border text-sm font-medium transition-colors ${isCurrentYear ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100' : note ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'border-dashed border-gray-200 text-gray-400 hover:border-rose-300 hover:text-rose-500'}`}
                      >
                        <div className="text-2xl mb-1">🌟</div>
                        <div>{t.overlay.periodic.yearlyNoteLabel.replace('{year}', String(longViewYear))}</div>
                        <div className="text-xs mt-1 opacity-60">{note ? t.overlay.periodic.open : t.overlay.periodic.create}</div>
                      </button>
                      {note && (
                        <button type="button" onClick={() => deletePage(note.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs text-gray-300 hover:text-red-400 transition-opacity"
                          title="삭제"
                        >✕</button>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}
