// =============================================
// src/components/editor/PeriodicNotesPanel.tsx
// 역할: 사이드바 내 일간·주간·월간 노트 목록 패널
// Python으로 치면: class PeriodicNotesPanel(Widget): ...
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { createBlock } from '@/types/block'
import type { Block } from '@/types/block'
import { useLocale } from '@/locales'
import { templateApi } from '@/lib/api'
import { parseTemplateContent } from '@/lib/templateParser'

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
// 구조: 미래 실행 계획 (목표·Deep Work·타임라인·변경점) → 회고 (실행결과·흐름·그림·문제·효율·상태·깨달음)
// Python으로 치면: def make_daily_template(title, date_str) -> list[Block]: ...
// -----------------------------------------------
export function makeDailyTemplate(_title: string, dateStr: string): Block[] {
  // 요일 레이블
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  const dayLabel = ['일','월','화','수','목','금','토'][dow]

  // DayPlannerBlock 초기 콘텐츠 — 오늘 날짜, 빈 이벤트, 루틴 자동 적용 ON
  const plannerContent = JSON.stringify({
    date: dateStr, events: [], routines: [], autoApply: true,
  })

  return [
    // ── 제목 ────────────────────────────────────
    { ...createBlock('heading1'), content: `📅 ${dateStr} (${dayLabel}) 일간 노트` },

    // ══════════════════════════════════════════
    // 🌅 미래 실행 계획 섹션 (계획 수립 후 실행)
    // ══════════════════════════════════════════
    { ...createBlock('paragraph'), content: '━━━ 🌅 미래 실행 계획 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },

    // ── 목표 (MIT 3개) ───────────────────────────
    // MIT = Most Important Tasks — 반드시 완료할 핵심 3개
    { ...createBlock('heading2'), content: '🎯 목표 (MIT 3개)' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),

    // ── Deep Work ────────────────────────────────
    // 하루 중 가장 집중해야 할 핵심 작업 1개 — 수량으로 완료 기준 명시
    { ...createBlock('heading2'), content: '🔥 Deep Work' },
    { ...createBlock('bulletList'), content: '작업명:' },
    { ...createBlock('bulletList'), content: '완료 기준: (수량으로 적기 — 예: 스케치 3컷 / 기능 X 구현)' },
    { ...createBlock('taskList'), content: '완료 여부' },

    // ── Daily Timeline ───────────────────────────
    // 📌 특수 블록: :::dayplanner — 오늘 날짜로 초기화, 루틴 자동 적용
    { ...createBlock('heading2'), content: '⏰ Daily Timeline' },
    { ...createBlock('dayplanner'), content: plannerContent },

    // ── 변경점 ───────────────────────────────────
    // 전 계획 대비 달라진 것 + 이유 — 계획 실행 후 피드백을 보며 조금씩 조정
    { ...createBlock('heading2'), content: '🔄 변경점' },
    { ...createBlock('bulletList'), content: '무엇이 바뀌는지:' },
    { ...createBlock('bulletList'), content: '이유:' },

    // ══════════════════════════════════════════
    // 📝 회고 섹션 (하루 끝에 작성)
    // ══════════════════════════════════════════
    { ...createBlock('paragraph'), content: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },

    // ── 오늘 실제 한 것 ──────────────────────────
    // 이모지 ✅ — 🔥와 중복 회피
    { ...createBlock('heading2'), content: '✅ 오늘 실제 한 것 (핵심 1~3개)' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),

    // ── Deep Work 회고 ───────────────────────────
    // 이모지 🎯 — ⏰와 중복 회피 (하루 흐름에 🕐 사용)
    { ...createBlock('heading2'), content: '🎯 Deep Work 회고' },
    { ...createBlock('bulletList'), content: '무엇을 했는지:' },
    { ...createBlock('bulletList'), content: '왜 잘됐는지:' },

    // ── 하루 흐름 ────────────────────────────────
    // 이모지 🕐 — ⏰와 중복 회피
    { ...createBlock('heading2'), content: '🕐 하루 흐름 (간단)' },
    { ...createBlock('bulletList'), content: '기억나는 흐름만, 시간 강박 X' },

    // ── 그림 연습 ────────────────────────────────
    { ...createBlock('heading2'), content: '🎨 그림 연습 (핵심만)' },
    { ...createBlock('bulletList'), content: '연습 항목:' },
    { ...createBlock('bulletList'), content: '이론 (강의 / 시간):' },
    { ...createBlock('bulletList'), content: '오늘의 집중 포인트:' },
    { ...createBlock('bulletList'), content: '이전 대비 달라진 점:' },

    // ── 문제 → 원인 → 해결 ───────────────────────
    { ...createBlock('heading2'), content: '❓ 문제 → 원인 → 해결' },
    { ...createBlock('bulletList'), content: '문제:' },
    { ...createBlock('bulletList'), content: '원인:' },
    { ...createBlock('bulletList'), content: '해결 시도:' },

    // ── 효율 ─────────────────────────────────────
    { ...createBlock('heading2'), content: '📊 효율 (체감 기준)' },
    { ...createBlock('bulletList'), content: '좋음 / 보통 / 망함 + 이유:' },

    // ── 상태 체크 ─────────────────────────────────
    { ...createBlock('heading2'), content: '🧠 상태 체크' },
    { ...createBlock('bulletList'), content: '몸 상태:' },
    { ...createBlock('bulletList'), content: '집중도:' },
    { ...createBlock('bulletList'), content: '감정:' },

    // ── 깨달음 & 생각 ─────────────────────────────
    { ...createBlock('heading2'), content: '🌿 깨달음 & 생각' },
  ]
}

// -----------------------------------------------
// 주간 노트 기본 템플릿 블록 생성
// Notion/Obsidian 주간 노트 베스트 프랙티스 반영:
//   WeeklyPlannerBlock → 이번 주 목표 → 요일별 계획 → 주간 회고
// Python으로 치면: def make_weekly_template(title, week_start) -> list[Block]: ...
// -----------------------------------------------
export function makeWeeklyTemplate(title: string, weekStart: string): Block[] {
  // WeeklyPlannerBlock 초기 content: weekStart만 설정, 나머지는 컴포넌트 내부에서 초기화
  // Python으로 치면: planner_content = json.dumps({'weekStart': week_start, 'days': {}, 'location': ''})
  const plannerContent  = JSON.stringify({ weekStart, days: {}, location: '' })
  const matrixContent   = JSON.stringify({ weekStart })
  const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    // 주간 캘린더 블록 (날씨 + 요일별 태스크)
    // 📌 특수 블록: :::weeklyplanner
    { ...createBlock('weeklyplanner'), content: plannerContent },
    createBlock('divider'),
    // 루틴 달성 매트릭스 블록 (DayPlannerBlock 루틴 집계)
    // 📌 특수 블록: :::routinematrix
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
export function makeMonthlyTemplate(title: string, year: number, month: number): Block[] {
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
    // 📌 특수 블록: :::monthlycalendar
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
export function makeQuarterlyTemplate(title: string, year: number, quarter: 1|2|3|4): Block[] {
  const plannerContent = JSON.stringify({ year, quarter, objectives: [] })
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '🎯 분기 OKR' },
    // 📌 특수 블록: :::quarterlyplanner
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
export function makeYearlyTemplate(title: string, year: number): Block[] {
  const plannerContent = JSON.stringify({ year, goals: [] })
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '🌟 연간 플래너' },
    // 📌 특수 블록: :::yearlyplanner
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
    setViewYear(d.getFullYear())  // 연도 경계 이동 시 주간·월간 노트 필터도 함께 갱신
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

  // 주기 노트 기본 템플릿 설정 — Python으로 치면: self.periodic_templates = settings.periodic_note_templates
  const periodicNoteTemplates    = useSettingsStore(s => s.periodicNoteTemplates)
  // 내장 기본 템플릿 오버라이드 — Python: self.builtin_overrides = settings.periodic_builtin_overrides
  const periodicBuiltinOverrides = useSettingsStore(s => s.periodicBuiltinOverrides)

  // 사용자 지정 템플릿 ID로 Block[] 빌드, 없으면 null 반환
  // Python으로 치면: async def build_blocks_from_template(id) -> list[Block] | None: ...
  async function buildBlocksFromTemplate(templateId: string): Promise<Block[] | null> {
    if (!templateId) return null
    try {
      const all = await templateApi.getAll()
      const tmpl = all.find(t => t.id === templateId)
      if (!tmpl) return null
      return parseTemplateContent(tmpl.content)
    } catch {
      return null
    }
  }

  // 내장 오버라이드 마크다운 → Block[], 첫 heading1을 실제 제목으로 교체
  // Python으로 치면: def build_blocks_from_builtin_override(md, title) -> list[Block]: ...
  function buildBlocksFromBuiltinOverride(markdown: string, actualTitle: string): Block[] {
    const blocks = parseTemplateContent(markdown)
    return blocks.map((b, i) =>
      i === 0 && b.type === 'heading1' ? { ...b, content: actualTitle } : b
    )
  }

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
    // 사용자 지정 템플릿 우선, 없으면 하드코딩 기본값 사용
    // Python으로 치면: blocks = await build_blocks_from_template(...) or make_daily_template(...)
    const customBlocks  = await buildBlocksFromTemplate(periodicNoteTemplates.daily)
    const builtinBlocks = periodicBuiltinOverrides.daily
      ? buildBlocksFromBuiltinOverride(periodicBuiltinOverrides.daily, title)
      : null
    setPageBlocks(newId, customBlocks ?? builtinBlocks ?? makeDailyTemplate(title, todayDateStr))
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
    // 사용자 지정 템플릿 우선, 없으면 하드코딩 기본값 사용
    const customBlocks  = await buildBlocksFromTemplate(periodicNoteTemplates.weekly)
    const builtinBlocks = periodicBuiltinOverrides.weekly
      ? buildBlocksFromBuiltinOverride(periodicBuiltinOverrides.weekly, title)
      : null
    setPageBlocks(newId, customBlocks ?? builtinBlocks ?? makeWeeklyTemplate(title, weekStartStr))
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
    // 사용자 지정 템플릿 우선, 없으면 하드코딩 기본값 사용
    const customBlocks  = await buildBlocksFromTemplate(periodicNoteTemplates.monthly)
    const builtinBlocks = periodicBuiltinOverrides.monthly
      ? buildBlocksFromBuiltinOverride(periodicBuiltinOverrides.monthly, title)
      : null
    setPageBlocks(newId, customBlocks ?? builtinBlocks ?? makeMonthlyTemplate(title, todayYear, todayMonth))
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
    // 사용자 지정 템플릿 우선, 없으면 하드코딩 기본값 사용
    const customBlocks  = await buildBlocksFromTemplate(periodicNoteTemplates.quarterly)
    const builtinBlocks = periodicBuiltinOverrides.quarterly
      ? buildBlocksFromBuiltinOverride(periodicBuiltinOverrides.quarterly, title)
      : null
    setPageBlocks(newId, customBlocks ?? builtinBlocks ?? makeQuarterlyTemplate(title, year, quarter))
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
    // 사용자 지정 템플릿 우선, 없으면 하드코딩 기본값 사용
    const customBlocks  = await buildBlocksFromTemplate(periodicNoteTemplates.yearly)
    const builtinBlocks = periodicBuiltinOverrides.yearly
      ? buildBlocksFromBuiltinOverride(periodicBuiltinOverrides.yearly, title)
      : null
    setPageBlocks(newId, customBlocks ?? builtinBlocks ?? makeYearlyTemplate(title, year))
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
