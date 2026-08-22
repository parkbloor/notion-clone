// =============================================
// src/components/editor/PeriodicNotesPanel.tsx
// 역할: 사이드바 내 일간·주간·월간 노트 목록 패널
// Python으로 치면: class PeriodicNotesPanel(Widget): ...
// =============================================

'use client'

import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { createBlock } from '@/types/block'
import type { Block } from '@/types/block'
import { useLocale } from '@/locales'
import { BASE_URL, templateApi } from '@/lib/api'
import { parseTemplateContent } from '@/lib/templateParser'
import { getDailyNoteDate, openOrCreateDailyNote } from '@/lib/dailyNotes'
import type { RecordCalendarEntry } from '@/lib/recordCalendar'
import MonthlyRecordSummary from './MonthlyRecordSummary'
import { revealBlockAncestors } from '@/lib/blockReveal'
import {
  auditPostitPages,
  auditPostitPage,
  extractDailyCaptureToRoot,
  getPostitPagePeriod,
  isPostitMonthPage,
  mergeDailyCapturesForDate,
  type DailyCaptureAuditEntry,
} from '@/lib/dailyCaptureAudit'

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

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
interface PeriodicNotesPanelProps {
  onOpenDayPlanner?: () => void
  postitMode?: boolean
  calendar?: ReactNode
  showReviews?: boolean
  showTimeline?: boolean
  showRoutines?: boolean
  onOpenRecord?: (record: RecordCalendarEntry) => void
}

export default function PeriodicNotesPanel({
  onOpenDayPlanner,
  postitMode = false,
  calendar,
  showReviews = true,
  showTimeline = true,
  showRoutines = true,
  onOpenRecord,
}: PeriodicNotesPanelProps) {
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

  // 사용 빈도가 낮은 주기 보기는 기본 접힘으로 보존한다.
  const [reviewOpen, setReviewOpen] = useState(false)
  const [captureAuditOpen, setCaptureAuditOpen] = useState(false)
  const [repairingPageIds, setRepairingPageIds] = useState<Set<string>>(() => new Set())
  const repairingPageIdsRef = useRef(new Set<string>())
  const [exportingPeriod, setExportingPeriod] = useState<'today' | 'week' | null>(null)

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
    .filter(p => getDailyNoteDate(p.title)?.startsWith(viewMonthStr))
    .sort((a, b) => (getDailyNoteDate(b.title) ?? '').localeCompare(getDailyNoteDate(a.title) ?? ''))

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
  const postitMonthlyNotes = pages
    .filter(isPostitMonthPage)
    .sort((a, b) => (getPostitPagePeriod(b) ?? '').localeCompare(getPostitPagePeriod(a) ?? ''))
  const postitAudits = postitMonthlyNotes.map(page => ({ page, audit: auditPostitPage(page) }))
  const postitPagesAudit = auditPostitPages(postitMonthlyNotes)
  const postitIssueCount = postitAudits.reduce((count, item) =>
    count + item.audit.nested.length + item.audit.wrongMonth.length
      + item.audit.invalidDate.length + item.audit.duplicates.length, 0)
    + postitPagesAudit.duplicatePeriods.length
    + postitPagesAudit.crossPageDuplicates.length

  function cloneBlocks(blocks: Block[]): Block[] {
    return JSON.parse(JSON.stringify(blocks)) as Block[]
  }

  function blocksMatch(left: Block[], right: Block[]): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
  }

  function setRepairing(pageId: string, repairing: boolean) {
    if (repairing) repairingPageIdsRef.current.add(pageId)
    else repairingPageIdsRef.current.delete(pageId)
    setRepairingPageIds(new Set(repairingPageIdsRef.current))
  }

  function replaceRepairIfUnchanged(pageId: string, expected: Block[], replacement: Block[]): boolean {
    const latestPage = usePageStore.getState().pages.find(page => page.id === pageId)
    if (!latestPage || latestPage.isLocked || !blocksMatch(latestPage.blocks, expected)) return false
    // 일반 Ctrl+Z는 이후 텍스트 편집까지 덮을 수 있으므로 점검 복구는 전용 안전 되돌리기만 사용한다.
    usePageStore.getState().setPageBlocks(pageId, cloneBlocks(replacement), false)
    return true
  }

  async function runRepair(
    pageId: string,
    transform: (blocks: Block[]) => Block[],
    successMessage: string,
  ) {
    if (repairingPageIdsRef.current.has(pageId)) return
    const page = usePageStore.getState().pages.find(item => item.id === pageId)
    if (!page) return
    if (page.isLocked) {
      toast.error(t.planner.dailyCapture.lockedError)
      return
    }

    const before = cloneBlocks(page.blocks)
    const after = transform(cloneBlocks(page.blocks))
    if (blocksMatch(before, after)) return

    setRepairing(pageId, true)
    try {
      usePageStore.getState().setPageBlocks(pageId, after, false)
      const saved = await usePageStore.getState().savePageNow(pageId)
      if (!saved) {
        const rolledBack = replaceRepairIfUnchanged(pageId, after, before)
        toast.error(rolledBack
          ? t.planner.dailyCapture.repairSaveError
          : t.planner.dailyCapture.repairSaveErrorChanged)
        return
      }

      toast.success(successMessage, {
        action: {
          label: t.planner.dailyCapture.undo,
          onClick: () => {
            void (async () => {
              if (repairingPageIdsRef.current.has(pageId)) return
              setRepairing(pageId, true)
              try {
                const restored = replaceRepairIfUnchanged(pageId, after, before)
                if (!restored) {
                  toast.error(t.planner.dailyCapture.repairUndoUnavailable)
                  return
                }
                const undoSaved = await usePageStore.getState().savePageNow(pageId)
                if (!undoSaved) {
                  replaceRepairIfUnchanged(pageId, before, after)
                  toast.error(t.planner.dailyCapture.repairUndoUnavailable)
                }
              } finally {
                setRepairing(pageId, false)
              }
            })()
          },
        },
      })
    } finally {
      setRepairing(pageId, false)
    }
  }

  function focusAuditEntry(pageId: string, entry: DailyCaptureAuditEntry) {
    const page = usePageStore.getState().pages.find(item => item.id === pageId)
    revealBlockAncestors(page, entry.blockId)
    setCurrentPage(pageId)
    const focus = (remaining: number) => {
      const wrapper = document.getElementById(entry.blockId)
      const input = wrapper?.querySelector<HTMLInputElement>('input[type="date"]')
      if (input) {
        input.focus()
        wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (remaining > 0) window.setTimeout(() => focus(remaining - 1), 50)
    }
    window.setTimeout(() => focus(8), 0)
  }

  // -----------------------------------------------
  // 오늘 일간 노트 열기/생성
  // Python으로 치면: async def open_daily_note(self): ...
  // -----------------------------------------------
  async function handleOpenDaily() {
    setViewMonthStr(todayMonthStr)  // 뷰를 오늘 달로 이동
    await openOrCreateDailyNote(todayDateStr)
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
    if (postitMode) {
      await openOrCreateDailyNote(todayDateStr)
      return
    }
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

  async function handleExportPeriod(period: 'today' | 'week') {
    if (exportingPeriod) return
    const start = new Date(today)
    const end = new Date(today)
    if (period === 'week') {
      const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay()
      start.setDate(today.getDate() + mondayOffset)
      end.setTime(start.getTime())
      end.setDate(start.getDate() + 6)
    }
    const startDate = localDateString(start)
    const endDate = localDateString(end)
    const label = period === 'today'
      ? t.overlay.periodic.todayHtmlTitle.replace('{date}', startDate)
      : t.overlay.periodic.weekHtmlTitle.replace('{start}', startDate).replace('{end}', endDate)

    setExportingPeriod(period)
    try {
      const query = new URLSearchParams({ start_date: startDate, end_date: endDate, label })
      const response = await fetch(`${BASE_URL}/api/export/planner-period?${query}`)
      if (!response.ok) throw new Error(await response.text().catch(() => String(response.status)))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${label}.html`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t.overlay.periodic.periodHtmlSuccess)
    } catch (error) {
      console.error('기간 HTML 내보내기 오류:', error)
      toast.error(t.overlay.periodic.periodHtmlError)
    } finally {
      setExportingPeriod(null)
    }
  }

  return (
    <div>
      {/* 오늘 — 가장 자주 쓰는 일정·루틴과 일간 노트 */}
      <section className="border-b hairline px-2 py-2">
        <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {postitMode ? t.overlay.periodic.sectionCapture : t.overlay.periodic.sectionToday}
        </div>
        <div className={postitMode ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
          {!postitMode && <button
            type="button"
            onClick={onOpenDayPlanner}
            disabled={!onOpenDayPlanner}
            className="flex min-h-14 flex-col items-start justify-center rounded-lg bg-blue-50 px-2.5 py-2 text-left text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base">🗓️</span>
            <span className="mt-0.5 text-[11px] font-semibold">{t.overlay.periodic.openDayPlanner}</span>
            <span className="text-[9px] opacity-70">{t.overlay.periodic.scheduleAndRoutines}</span>
          </button>}
          <button
            type="button"
            onClick={handleOpenDaily}
            className="flex min-h-14 flex-col items-start justify-center rounded-lg bg-amber-50 px-2.5 py-2 text-left text-amber-700 transition-colors hover:bg-amber-100"
          >
            <span className="text-base">{postitMode ? '📌' : '📅'}</span>
            <span className="mt-0.5 text-[11px] font-semibold">
              {postitMode ? t.overlay.periodic.openTodayRecord : t.overlay.periodic.openTodayNote}
            </span>
            <span className="text-[9px] opacity-70">{todayDateStr}</span>
          </button>
        </div>
        {!postitMode && <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => void handleExportPeriod('today')} disabled={exportingPeriod !== null}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-[10px] font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50">
            {exportingPeriod === 'today' ? t.overlay.periodic.exportingHtml : t.overlay.periodic.exportTodayHtml}
          </button>
          <button type="button" onClick={() => void handleExportPeriod('week')} disabled={exportingPeriod !== null}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-[10px] font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50">
            {exportingPeriod === 'week' ? t.overlay.periodic.exportingHtml : t.overlay.periodic.exportWeekHtml}
          </button>
        </div>}
      </section>

      {/* 계획하기 — 기존 주간 타임라인과 루틴 관리 진입점 */}
      {!postitMode && (showTimeline || showRoutines) && <section className="border-b hairline px-2 py-2">
        <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {t.overlay.periodic.sectionPlan}
        </div>
        <div className="space-y-1">
          {showTimeline && <button
            type="button"
            onClick={handleOpenWeekly}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
          >
            <span>📆</span>
            <span className="flex-1 font-medium">{t.overlay.periodic.openWeeklyTimeline}</span>
            <span className="text-gray-300">›</span>
          </button>}
          {showRoutines && <button
            type="button"
            onClick={onOpenDayPlanner}
            disabled={!onOpenDayPlanner}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>🔁</span>
            <span className="flex-1 font-medium">{t.overlay.periodic.manageRoutines}</span>
            <span className="text-gray-300">›</span>
          </button>}
        </div>
      </section>}

      {/* 살펴보기 — 월간 날짜 탐색과 이번 달 노트 */}
      <section className="border-b hairline py-2">
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {postitMode ? t.overlay.periodic.sectionRecordExplore : t.overlay.periodic.sectionExplore}
        </div>
        {!postitMode && calendar}
        {!postitMode && <MonthlyRecordSummary pages={pages} onOpenRecord={onOpenRecord} />}
        <div className="px-2 pt-1">
          <button
            type="button"
            onClick={handleOpenMonthly}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
          >
            <span>🗓️</span>
            <span className="flex-1 font-medium">
              {postitMode ? t.overlay.periodic.openMonthlyRecord : t.overlay.periodic.openMonthlyView}
            </span>
            <span className="text-gray-300">›</span>
          </button>
        </div>
      </section>

      {/* 포스트잇 기록 보관함 — 날짜별 페이지가 아니라 월간 컨테이너를 보여준다. */}
      {postitMode && <section className="border-b hairline py-2">
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {t.overlay.periodic.recordArchive}
        </div>
        <div className="max-h-40 overflow-y-auto px-2">
          {postitMonthlyNotes.length === 0 ? (
            <p className="px-1 py-1 text-xs text-gray-400">{t.overlay.periodic.noRecordMonths}</p>
          ) : postitMonthlyNotes.map(note => (
            <button
              key={note.id}
              type="button"
              onClick={() => setCurrentPage(note.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${currentPageId === note.id ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span>🗓️</span>
              <span className="flex-1 truncate">{getPostitPagePeriod(note) ?? note.title}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 border-t hairline px-2 pt-2">
          <button
            type="button"
            onClick={() => setCaptureAuditOpen(open => !open)}
            aria-expanded={captureAuditOpen}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-amber-50"
          >
            <span>{captureAuditOpen ? '▼' : '▶'}</span>
            <span className="flex-1 font-medium">{t.planner.dailyCapture.auditTitle}</span>
            <span className={postitIssueCount > 0 ? 'text-red-500' : 'text-emerald-600'}>
              {postitIssueCount > 0
                ? t.planner.dailyCapture.auditIssueCount.replace('{count}', String(postitIssueCount))
                : t.planner.dailyCapture.auditClean}
            </span>
          </button>

          {captureAuditOpen && postitIssueCount > 0 && (
            <div className="mt-1 max-h-72 space-y-2 overflow-y-auto pb-1">
              {postitPagesAudit.duplicatePeriods.map(group => (
                <div key={`period-${group.periodKey}`} className="rounded-md border border-red-200 bg-red-50/60 p-2 text-[10px] text-red-700">
                  <div className="mb-1 font-semibold">
                    {group.periodKey} · {t.planner.dailyCapture.duplicatePeriodIssue.replace('{count}', String(group.pageIds.length))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.pageIds.map((pageId, index) => (
                      <button
                        key={pageId}
                        type="button"
                        onClick={() => setCurrentPage(pageId)}
                        className="rounded bg-white px-1.5 py-0.5 hover:bg-red-100"
                      >
                        {t.planner.dailyCapture.openDuplicatePage.replace('{index}', String(index + 1))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {postitPagesAudit.crossPageDuplicates.map(group => (
                <div key={`cross-${group.date}`} className="rounded-md border border-red-200 bg-red-50/60 p-2 text-[10px] text-red-700">
                  <div className="mb-1 font-semibold">
                    {group.date} · {t.planner.dailyCapture.crossPageDuplicateIssue.replace('{count}', String(group.entries.length))}
                  </div>
                  {group.entries.map((entry, index) => (
                    <button
                      key={`${entry.pageId}-${entry.blockId}`}
                      type="button"
                      onClick={() => focusAuditEntry(entry.pageId, entry)}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-red-600 hover:bg-red-100"
                    >
                      {index + 1}. {entry.pageTitle} · {entry.body.split('\n').find(line => line.trim()) || '—'}
                    </button>
                  ))}
                </div>
              ))}

              {postitAudits.map(({ page, audit }) => {
                const hasIssues = audit.nested.length > 0 || audit.duplicates.length > 0
                  || audit.wrongMonth.length > 0 || audit.invalidDate.length > 0
                if (!hasIssues) return null
                return (
                  <div key={page.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page.id)}
                      className="mb-1 w-full truncate text-left text-[11px] font-semibold text-amber-800"
                    >
                      {getPostitPagePeriod(page) ?? page.title}
                    </button>

                    {audit.nested.map(entry => (
                      <div key={`nested-${entry.blockId}`} className="mb-1 rounded bg-white/80 p-1.5 text-[10px] text-gray-600">
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate">
                            {t.planner.dailyCapture.nestedIssue} · {entry.date || '—'} · {entry.body.split('\n').find(line => line.trim()) || '—'}
                          </span>
                          <button
                            type="button"
                            disabled={repairingPageIds.has(page.id)}
                            onClick={() => void runRepair(
                              page.id,
                              blocks => extractDailyCaptureToRoot(blocks, entry.blockId),
                              t.planner.dailyCapture.extractedSuccess,
                            )}
                            className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-200 disabled:cursor-wait disabled:opacity-50"
                          >
                            {t.planner.dailyCapture.extractToRoot}
                          </button>
                        </div>
                      </div>
                    ))}

                    {audit.duplicates.map(group => (
                      <div key={`duplicate-${group.date}`} className="mb-1 rounded bg-white/80 p-1.5 text-[10px] text-gray-600">
                        <div className="mb-1 flex items-center gap-1">
                          <span className="flex-1 font-medium text-red-600">
                            {group.date} · {t.planner.dailyCapture.duplicateIssue.replace('{count}', String(group.entries.length))}
                          </span>
                          <button
                            type="button"
                            disabled={repairingPageIds.has(page.id)}
                            onClick={() => void runRepair(
                              page.id,
                              blocks => mergeDailyCapturesForDate(blocks, group.date),
                              t.planner.dailyCapture.mergedSuccess,
                            )}
                            className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-600 hover:bg-red-100 disabled:cursor-wait disabled:opacity-50"
                          >
                            {t.planner.dailyCapture.mergeContents}
                          </button>
                        </div>
                        {group.entries.map((entry, index) => (
                          <div key={entry.blockId} className="truncate text-gray-400">
                            {index + 1}. {entry.body.split('\n').find(line => line.trim()) || '—'}
                          </div>
                        ))}
                      </div>
                    ))}

                    {[...audit.wrongMonth.map(entry => ({ entry, label: t.planner.dailyCapture.wrongMonthIssue })),
                      ...audit.invalidDate.map(entry => ({ entry, label: t.planner.dailyCapture.invalidDateIssue }))]
                      .map(({ entry, label }) => (
                        <div key={`date-${label}-${entry.blockId}`} className="mb-1 flex items-center gap-1 rounded bg-white/80 p-1.5 text-[10px] text-gray-600">
                          <span className="min-w-0 flex-1 truncate">{label} · {entry.date || '—'}</span>
                          <button
                            type="button"
                            onClick={() => focusAuditEntry(page.id, entry)}
                            className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 hover:bg-gray-200"
                          >
                            {t.planner.dailyCapture.editDate}
                          </button>
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>}

      {/* 돌아보기 — 계획형 볼트의 기존 단기/장기 주기 노트 */}
      {showReviews && !postitMode && <section>
        <button
          type="button"
          onClick={() => setReviewOpen(open => !open)}
          aria-expanded={reviewOpen}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-500 transition-colors hover:bg-gray-50"
        >
          <span className="text-[10px]">{reviewOpen ? '▼' : '▶'}</span>
          <span className="flex-1 font-semibold">{t.overlay.periodic.sectionReview}</span>
          <span className="text-[10px] text-gray-400">{t.overlay.periodic.reviewHint}</span>
        </button>

        {reviewOpen && (
          <div className="border-t hairline">

      {/* ── 단기/장기 뷰 모드 토글 — seg 스타일 ── */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex rounded-md p-0.5" style={{ background: "var(--color-sunken)" }}>
          <button
            type="button"
            onClick={() => setViewMode('short')}
            className="flex-1 py-1 text-[11.5px] rounded font-medium transition-colors"
            style={viewMode === 'short'
              ? { background: "var(--color-surface)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
              : { color: "var(--color-text-muted)" }}
          >
            {t.overlay.periodic.viewShort}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('long')}
            className="flex-1 py-1 text-[11.5px] rounded font-medium transition-colors"
            style={viewMode === 'long'
              ? { background: "var(--color-surface)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
              : { color: "var(--color-text-muted)" }}
          >
            {t.overlay.periodic.viewLong}
          </button>
        </div>
      </div>

      {/* ===================================================== */}
      {/* 단기 뷰: 일간 / 주간 / 월간                              */}
      {/* ===================================================== */}
      {viewMode === 'short' && (
        <>
          {/* ── 단기 탭 헤더 (일간/주간/월간) — seg 스타일 ── */}
          <div className="px-2 pb-1">
            <div className="flex rounded-md p-0.5" style={{ background: "var(--color-sunken)" }}>
              <button
                type="button"
                onClick={() => setTab('daily')}
                className="flex-1 py-1 text-[11.5px] rounded font-medium transition-colors"
                style={tab === 'daily'
                  ? { background: "var(--color-surface)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                  : { color: "var(--color-text-muted)" }}
              >
                {t.overlay.periodic.tabDaily}
              </button>
              <button
                type="button"
                onClick={() => setTab('weekly')}
                className="flex-1 py-1 text-[11.5px] rounded font-medium transition-colors"
                style={tab === 'weekly'
                  ? { background: "var(--color-surface)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                  : { color: "var(--color-text-muted)" }}
              >
                {t.overlay.periodic.tabWeekly}
              </button>
              <button
                type="button"
                onClick={() => setTab('monthly')}
                className="flex-1 py-1 text-[11.5px] rounded font-medium transition-colors"
                style={tab === 'monthly'
                  ? { background: "var(--color-surface)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                  : { color: "var(--color-text-muted)" }}
              >
                {t.overlay.periodic.tabMonthly}
              </button>
            </div>
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
                    const noteDate = getDailyNoteDate(note.title)
                    const datePart = noteDate?.slice(5) ?? note.title
                    const isToday = noteDate === todayDateStr
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
        )}
      </section>}
    </div>
  )
}
