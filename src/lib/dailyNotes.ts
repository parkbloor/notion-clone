// =============================================
// src/lib/dailyNotes.ts
// 역할: 일간 노트 제목 탐색·템플릿 선택·생성 경로의 단일 진실 공급원
// Python으로 치면: class DailyNoteService: ...
// =============================================

import { templateApi } from '@/lib/api'
import { getLocale } from '@/locales'
import { parseTemplateContent } from '@/lib/templateParser'
import { findBlockById, findBlocksByType } from '@/lib/blockTree'
import { revealBlockAncestors } from '@/lib/blockReveal'
import { getPostitPagePeriod, isPostitMonthPage } from '@/lib/dailyCaptureAudit'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import { createBlock, createDailyCaptureContent, parseDailyCaptureContent } from '@/types/block'
import type { Block, Page } from '@/types/block'
import { toast } from 'sonner'

const DAILY_NOTE_PREFIXES = ['일간 노트', 'Daily Note'] as const
const DAILY_NOTE_CATEGORY_NAMES = ['📅 일간 노트', '📅 Daily Notes', '일간 노트', 'Daily Notes'] as const
const MONTHLY_NOTE_CATEGORY_NAMES = ['🗓️ 월간 노트', '🗓️ Monthly Notes', '월간 노트', 'Monthly Notes'] as const

// 같은 볼트·날짜의 생성 요청은 하나의 Promise를 공유해 연속 클릭 중복을 막는다.
// Python으로 치면: pending: dict[tuple[str, str], Future[str | None]] = {}
const pendingDailyNotes = new Map<string, Promise<string | null>>()
const pendingPostitMonths = new Map<string, Promise<string | null>>()
const pendingPostitFocusBlocks = new Map<string, string>()

// 저장할 일간 노트 제목은 기존 한국어 형식을 유지한다.
// Python으로 치면: def daily_note_title(date): return f'일간 노트 {date}'
export function getDailyNoteTitle(dateStr: string): string {
  return `일간 노트 ${dateStr}`
}

// 달력에서 전달된 날짜가 실제 YYYY-MM-DD인지 확인한다.
// Python으로 치면: def is_valid_date_key(value): ...
function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match
  const parsed = new Date(`${value}T00:00:00`)
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === Number(year)
    && parsed.getMonth() + 1 === Number(month)
    && parsed.getDate() === Number(day)
}

// 한·영 기존 제목에서 날짜를 읽는다. 제목을 바꾸지는 않는다.
// Python으로 치면: def daily_note_date(title): return matched_date or None
export function getDailyNoteDate(title: string): string | null {
  for (const prefix of DAILY_NOTE_PREFIXES) {
    const marker = `${prefix} `
    if (!title.startsWith(marker)) continue
    const dateStr = title.slice(marker.length)
    return isValidDateKey(dateStr) ? dateStr : null
  }
  return null
}

// 같은 날짜가 여러 이름으로 있으면 현재 표준인 한국어 제목을 먼저 연다.
// Python으로 치면: def find_daily_note(pages, date): ...
export function findDailyNoteByDate(pages: Page[], dateStr: string): Page | null {
  for (const prefix of DAILY_NOTE_PREFIXES) {
    const found = pages.find(page => page.title === `${prefix} ${dateStr}`)
    if (found) return found
  }
  return null
}

// 신규 기본 일간 노트 템플릿. 일정은 일정 홈에만 저장하므로 Day Planner를 넣지 않는다.
// Python으로 치면: def make_daily_template(title, date_str) -> list[Block]: ...
export function makeDailyTemplate(_title: string, dateStr: string): Block[] {
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  const dayLabel = ['일','월','화','수','목','금','토'][dow]

  return [
    { ...createBlock('heading1'), content: `📅 ${dateStr} (${dayLabel}) 일간 노트` },
    { ...createBlock('paragraph'), content: '━━━ 🌅 미래 실행 계획 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { ...createBlock('heading2'), content: '🎯 목표 (MIT 3개)' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    { ...createBlock('heading2'), content: '🔥 Deep Work' },
    { ...createBlock('bulletList'), content: '작업명:' },
    { ...createBlock('bulletList'), content: '완료 기준: (수량으로 적기 — 예: 스케치 3컷 / 기능 X 구현)' },
    { ...createBlock('taskList'), content: '완료 여부' },
    { ...createBlock('heading2'), content: '🔄 변경점' },
    { ...createBlock('bulletList'), content: '무엇이 바뀌는지:' },
    { ...createBlock('bulletList'), content: '이유:' },
    { ...createBlock('paragraph'), content: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { ...createBlock('heading2'), content: '✅ 오늘 실제 한 것 (핵심 1~3개)' },
    createBlock('taskList'),
    createBlock('taskList'),
    createBlock('taskList'),
    { ...createBlock('heading2'), content: '🎯 Deep Work 회고' },
    { ...createBlock('bulletList'), content: '무엇을 했는지:' },
    { ...createBlock('bulletList'), content: '왜 잘됐는지:' },
    { ...createBlock('heading2'), content: '🕐 하루 흐름 (간단)' },
    { ...createBlock('bulletList'), content: '기억나는 흐름만, 시간 강박 X' },
    { ...createBlock('heading2'), content: '🎨 그림 연습 (핵심만)' },
    { ...createBlock('bulletList'), content: '연습 항목:' },
    { ...createBlock('bulletList'), content: '이론 (강의 / 시간):' },
    { ...createBlock('bulletList'), content: '오늘의 집중 포인트:' },
    { ...createBlock('bulletList'), content: '이전 대비 달라진 점:' },
    { ...createBlock('heading2'), content: '❓ 문제 → 원인 → 해결' },
    { ...createBlock('bulletList'), content: '문제:' },
    { ...createBlock('bulletList'), content: '원인:' },
    { ...createBlock('bulletList'), content: '해결 시도:' },
    { ...createBlock('heading2'), content: '📊 효율 (체감 기준)' },
    { ...createBlock('bulletList'), content: '좋음 / 보통 / 망함 + 이유:' },
    { ...createBlock('heading2'), content: '🧠 상태 체크' },
    { ...createBlock('bulletList'), content: '몸 상태:' },
    { ...createBlock('bulletList'), content: '집중도:' },
    { ...createBlock('bulletList'), content: '감정:' },
    { ...createBlock('heading2'), content: '🌿 깨달음 & 생각' },
  ]
}

// 하루 포스트잇 전체를 내부 자식 없이 블록 하나에 저장한다.
// Python으로 치면: def make_postit_daily_template(title, date_str) -> list[Block]: ...
export function makePostitDailyTemplate(_title: string, dateStr: string): Block[] {
  const block = createBlock('dailycapture')
  block.content = createDailyCaptureContent(dateStr)
  return [block]
}

// 질문이나 체크 항목을 넣지 않고, 생각나는 대로 쓸 수 있는 일기 본문만 연다.
// Python으로 치면: return [heading(date), blank_paragraph()]
export function makeDiaryTemplate(_title: string, dateStr: string): Block[] {
  const date = new Date(`${dateStr}T00:00:00`)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return [
    { ...createBlock('heading1'), content: `${dateStr} (${weekday}) 일기` },
    createBlock('paragraph'),
  ]
}

function usesMonthlyPostitWorkflow(): boolean {
  const planner = useVaultPreferencesStore.getState().preferences.planner
  return planner.mode === 'daily'
    && planner.dailyNoteTemplate === 'postit'
}

function getPostitMonthTitle(dateStr: string): string {
  return `월간 노트 ${dateStr.slice(0, 7)}`
}

function findPostitMonthPage(pages: Page[], dateStr: string): Page | null {
  const periodKey = dateStr.slice(0, 7)
  const candidates = pages.filter(page =>
    isPostitMonthPage(page) && getPostitPagePeriod(page) === periodKey
  )
  if (candidates.length > 1) {
    toast.warning(getLocale().planner.dailyCapture.duplicateMonthPagesWarning)
  }

  // 같은 달 페이지가 여러 개면 해당 날짜를 이미 보유한 페이지를 우선 열어 재중복을 막는다.
  return candidates.find(page => !!findDailyCapture(page.blocks, dateStr))
    ?? candidates.find(page => page.pageRole === 'postit-month')
    ?? candidates[0]
    ?? null
}

function findDailyCapture(blocks: Block[], dateStr: string): Block | null {
  const matches = findBlocksByType(blocks, 'dailycapture').filter(block =>
    parseDailyCaptureContent(block.content).date === dateStr
  )
  if (matches.length > 1) toast.warning(getLocale().planner.dailyCapture.existingDuplicateWarning)
  return matches[0] ?? null
}

function makePostitMonthlyTemplate(title: string, dateStr: string): Block[] {
  const capture = createBlock('dailycapture')
  capture.content = createDailyCaptureContent(dateStr)
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    capture,
    createBlock('divider'),
    { ...createBlock('heading2'), content: '🌙 월간 정리' },
    { ...createBlock('paragraph'), content: '이번 달에 남길 기록:' },
  ]
}

async function ensurePostitMonth(dateStr: string): Promise<string | null> {
  const initial = usePageStore.getState()
  const periodKey = dateStr.slice(0, 7)
  const title = getPostitMonthTitle(dateStr)
  const page = findPostitMonthPage(initial.pages, dateStr)

  if (!page) {
    const category = initial.categories.find(item =>
      MONTHLY_NOTE_CATEGORY_NAMES.includes(item.name as typeof MONTHLY_NOTE_CATEGORY_NAMES[number])
    )
    const pageId = await initial.addPage(title, category?.id ?? null)
    const latest = usePageStore.getState()
    if (!latest.pages.some(item => item.id === pageId)) return null
    const blocks = makePostitMonthlyTemplate(title, dateStr)
    latest.updatePageIcon(pageId, '🗓️')
    latest.setPageRole(pageId, 'postit-month', periodKey)
    latest.setPageBlocks(pageId, blocks)
    const saved = await latest.savePageNow(pageId)
    if (!saved) {
      pendingPostitFocusBlocks.delete(pageId)
      toast.error(getLocale().planner.dailyCapture.saveError)
      return null
    }
    pendingPostitFocusBlocks.set(pageId, blocks[2].id)
    return pageId
  }

  const existingCapture = findDailyCapture(page.blocks, dateStr)
  if (existingCapture) {
    if (page.pageRole !== 'postit-month' || page.periodKey !== periodKey) {
      initial.setPageRole(page.id, 'postit-month', periodKey)
    }
    const saved = await initial.savePageNow(page.id)
    if (!saved) {
      pendingPostitFocusBlocks.delete(page.id)
      toast.error(getLocale().planner.dailyCapture.saveError)
      return null
    }
    pendingPostitFocusBlocks.set(page.id, existingCapture.id)
    return page.id
  }

  if (page.isLocked) {
    toast.error(getLocale().planner.dailyCapture.lockedError)
    return null
  }

  const capture = createBlock('dailycapture')
  capture.content = createDailyCaptureContent(dateStr)
  const summaryIndex = page.blocks.findIndex(block =>
    block.type === 'heading2' && /월간 정리|월말 회고|Month/.test(block.content)
  )
  const laterCaptureIndex = page.blocks.findIndex(block =>
    block.type === 'dailycapture'
    && parseDailyCaptureContent(block.content).date > dateStr
  )
  const insertionBoundaries = [laterCaptureIndex, summaryIndex].filter(index => index >= 0)
  const insertIndex = insertionBoundaries.length > 0
    ? Math.min(...insertionBoundaries)
    : page.blocks.length
  const nextBlocks = [...page.blocks]
  nextBlocks.splice(insertIndex, 0, capture)
  initial.setPageBlocks(page.id, nextBlocks)
  if (page.pageRole !== 'postit-month' || page.periodKey !== periodKey) {
    initial.setPageRole(page.id, 'postit-month', periodKey)
  }
  const saved = await usePageStore.getState().savePageNow(page.id)
  if (!saved) {
    pendingPostitFocusBlocks.delete(page.id)
    toast.error(getLocale().planner.dailyCapture.saveError)
    return null
  }
  pendingPostitFocusBlocks.set(page.id, capture.id)
  return page.id
}

async function openOrCreatePostitMonth(dateStr: string): Promise<string | null> {
  const state = usePageStore.getState()
  const monthKey = `${state.currentVaultName ?? ''}:${dateStr.slice(0, 7)}`
  const previous = pendingPostitMonths.get(monthKey) ?? Promise.resolve(null)
  const operation = previous.catch(() => null).then(() => ensurePostitMonth(dateStr))
  pendingPostitMonths.set(monthKey, operation)
  try {
    const pageId = await operation
    if (pageId) {
      usePageStore.getState().setCurrentPage(pageId)
      const focusBlockId = pendingPostitFocusBlocks.get(pageId)
      if (focusBlockId) {
        pendingPostitFocusBlocks.delete(pageId)
        focusBlockWhenReady(focusBlockId)
      }
    }
    return pageId
  } finally {
    if (pendingPostitMonths.get(monthKey) === operation) pendingPostitMonths.delete(monthKey)
  }
}

interface DailyNoteBlocks {
  blocks: Block[]
  focusBlockId: string | null
}

// 사용자 템플릿 → 내장 수정값 → 신규 기본값 순서로 블록을 만든다.
// Python으로 치면: async def build_daily_blocks(title, date): ...
async function buildDailyNoteBlocks(title: string, dateStr: string): Promise<DailyNoteBlocks> {
  const settings = useSettingsStore.getState()
  const vaultPlanner = useVaultPreferencesStore.getState().preferences.planner
  const templateId = vaultPlanner.dailyCustomTemplateId ?? settings.periodicNoteTemplates.daily

  if (templateId) {
    try {
      const templates = await templateApi.getAll()
      const selected = templates.find(template => template.id === templateId)
      if (selected) return { blocks: parseTemplateContent(selected.content), focusBlockId: null }
    } catch {
      // 사용자 템플릿 조회 실패 시 저장된 내장 수정값 또는 기본값으로 안전하게 내려간다.
    }
  }

  if (vaultPlanner.mode === 'daily' && vaultPlanner.dailyNoteTemplate === 'postit') {
    const blocks = makePostitDailyTemplate(title, dateStr)
    return { blocks, focusBlockId: blocks[0]?.id ?? null }
  }

  if (vaultPlanner.mode === 'daily' && vaultPlanner.dailyNoteTemplate === 'diary') {
    const blocks = makeDiaryTemplate(title, dateStr)
    return { blocks, focusBlockId: blocks[1]?.id ?? null }
  }

  const override = settings.periodicBuiltinOverrides.daily
  if (override) {
    return {
      blocks: parseTemplateContent(override).map((block, index) =>
        index === 0 && block.type === 'heading1' ? { ...block, content: title } : block
      ),
      focusBlockId: null,
    }
  }

  return { blocks: makeDailyTemplate(title, dateStr), focusBlockId: null }
}

// 새 포스트잇 노트가 렌더된 뒤 첫 미처리 블록으로 포커스와 스크롤을 이동한다.
// Python으로 치면: def focus_block_when_ready(block_id, attempts=8): ...
function focusBlockWhenReady(blockId: string, attempts = 8): void {
  if (typeof document === 'undefined') return
  const page = usePageStore.getState().pages.find(item => !!findBlockById(item.blocks, blockId))
  revealBlockAncestors(page, blockId)
  const focus = (remaining: number) => {
    const wrapper = document.getElementById(blockId)
    const editor = wrapper?.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"], textarea')
    if (editor) {
      editor.focus()
      wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    wrapper?.querySelector<HTMLElement>('[data-ai-block="dailycapture"]')?.click()
    if (remaining > 0) window.setTimeout(() => focus(remaining - 1), 50)
  }
  window.requestAnimationFrame(() => focus(attempts))
}

// 페이지를 새로 만들고 ID를 직접 사용해 다른 페이지 선택과 템플릿 적용이 섞이지 않게 한다.
// Python으로 치면: async def create_daily_note(date): ...
async function createDailyNote(dateStr: string): Promise<string | null> {
  const initial = usePageStore.getState()
  const existing = findDailyNoteByDate(initial.pages, dateStr)
  if (existing) return existing.id

  const title = getDailyNoteTitle(dateStr)
  const category = initial.categories.find(item =>
    DAILY_NOTE_CATEGORY_NAMES.includes(item.name as typeof DAILY_NOTE_CATEGORY_NAMES[number])
  )
  const pageId = await initial.addPage(title, category?.id ?? null)
  const latest = usePageStore.getState()
  if (!latest.pages.some(page => page.id === pageId)) return null

  const built = await buildDailyNoteBlocks(title, dateStr)
  latest.updatePageIcon(pageId, '📅')
  latest.setPageBlocks(pageId, built.blocks)
  const saved = await latest.savePageNow(pageId)
  if (!saved) {
    pendingPostitFocusBlocks.delete(pageId)
    toast.error(getLocale().planner.dailyCapture.saveError)
    return null
  }
  if (built.focusBlockId) pendingPostitFocusBlocks.set(pageId, built.focusBlockId)
  return pageId
}

// 모든 UI 진입점이 호출하는 공개 함수다. 반복 호출은 기존 페이지 또는 같은 생성 Promise를 사용한다.
// Python으로 치면: async def open_or_create_daily_note(date): ...
export async function openOrCreateDailyNote(dateStr: string): Promise<string | null> {
  if (!isValidDateKey(dateStr)) return null

  if (usesMonthlyPostitWorkflow()) return openOrCreatePostitMonth(dateStr)

  const state = usePageStore.getState()
  const existing = findDailyNoteByDate(state.pages, dateStr)
  if (existing) {
    state.setCurrentPage(existing.id)
    return existing.id
  }

  const requestKey = `${state.currentVaultName ?? ''}:${dateStr}`
  const pending = pendingDailyNotes.get(requestKey)
  if (pending) {
    const pageId = await pending
    if (pageId) {
      usePageStore.getState().setCurrentPage(pageId)
      const focusBlockId = pendingPostitFocusBlocks.get(pageId)
      if (focusBlockId) {
        pendingPostitFocusBlocks.delete(pageId)
        focusBlockWhenReady(focusBlockId)
      }
    }
    return pageId
  }

  const creation = createDailyNote(dateStr)
  pendingDailyNotes.set(requestKey, creation)
  try {
    const pageId = await creation
    if (pageId) {
      usePageStore.getState().setCurrentPage(pageId)
      const focusBlockId = pendingPostitFocusBlocks.get(pageId)
      if (focusBlockId) {
        pendingPostitFocusBlocks.delete(pageId)
        focusBlockWhenReady(focusBlockId)
      }
    }
    return pageId
  } finally {
    if (pendingDailyNotes.get(requestKey) === creation) pendingDailyNotes.delete(requestKey)
  }
}
