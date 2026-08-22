import type { Block, Page } from '@/types/block'
import { createDailyCaptureContent, isValidDailyCaptureDate, parseDailyCaptureContent } from '@/types/block'

export interface DailyCaptureAuditEntry {
  blockId: string
  date: string
  body: string
  depth: number
}

export interface DailyCaptureDuplicateGroup {
  date: string
  entries: DailyCaptureAuditEntry[]
}

export interface DailyCaptureAudit {
  entries: DailyCaptureAuditEntry[]
  nested: DailyCaptureAuditEntry[]
  wrongMonth: DailyCaptureAuditEntry[]
  invalidDate: DailyCaptureAuditEntry[]
  duplicates: DailyCaptureDuplicateGroup[]
}

export interface CrossPageCaptureEntry extends DailyCaptureAuditEntry {
  pageId: string
  pageTitle: string
}

export interface PostitPagesAudit {
  duplicatePeriods: Array<{ periodKey: string; pageIds: string[] }>
  crossPageDuplicates: Array<{ date: string; entries: CrossPageCaptureEntry[] }>
}

const POSTIT_MONTH_TITLE = /^(?:월간 노트|Monthly Note) (\d{4}-\d{2})$/

export function getPostitPagePeriod(page: Page): string | null {
  if (page.pageRole === 'postit-month' && /^\d{4}-\d{2}$/.test(page.periodKey ?? '')) {
    return page.periodKey ?? null
  }
  return POSTIT_MONTH_TITLE.exec(page.title)?.[1] ?? null
}

export function isPostitMonthPage(page: Page): boolean {
  if (page.pageRole === 'postit-month') return true
  return getPostitPagePeriod(page) !== null && collectEntries(page.blocks).length > 0
}

function collectEntries(blocks: readonly Block[] | undefined, depth = 0): DailyCaptureAuditEntry[] {
  const entries: DailyCaptureAuditEntry[] = []
  for (const block of blocks ?? []) {
    if (block.type === 'dailycapture') {
      const data = parseDailyCaptureContent(block.content)
      entries.push({ blockId: block.id, date: data.date, body: data.body, depth })
    }
    entries.push(...collectEntries(block.children, depth + 1))
  }
  return entries
}

export function auditPostitPage(page: Page): DailyCaptureAudit {
  const entries = collectEntries(page.blocks)
  const periodKey = getPostitPagePeriod(page)
  const byDate = new Map<string, DailyCaptureAuditEntry[]>()
  for (const entry of entries) {
    if (!entry.date) continue
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry])
  }
  return {
    entries,
    nested: entries.filter(entry => entry.depth > 0),
    wrongMonth: entries.filter(entry =>
      !!entry.date && !!periodKey && !entry.date.startsWith(`${periodKey}-`)
    ),
    invalidDate: entries.filter(entry => !isValidDailyCaptureDate(entry.date)),
    duplicates: [...byDate.entries()]
      .filter(([, matches]) => matches.length > 1)
      .map(([date, matches]) => ({ date, entries: matches })),
  }
}

export function auditPostitPages(pages: Page[]): PostitPagesAudit {
  const periodMap = new Map<string, string[]>()
  const dateMap = new Map<string, CrossPageCaptureEntry[]>()
  for (const page of pages) {
    const periodKey = getPostitPagePeriod(page)
    if (periodKey) periodMap.set(periodKey, [...(periodMap.get(periodKey) ?? []), page.id])
    for (const entry of collectEntries(page.blocks)) {
      if (!entry.date) continue
      dateMap.set(entry.date, [
        ...(dateMap.get(entry.date) ?? []),
        { ...entry, pageId: page.id, pageTitle: page.title },
      ])
    }
  }
  return {
    duplicatePeriods: [...periodMap.entries()]
      .filter(([, pageIds]) => pageIds.length > 1)
      .map(([periodKey, pageIds]) => ({ periodKey, pageIds })),
    crossPageDuplicates: [...dateMap.entries()]
      .filter(([, entries]) => new Set(entries.map(entry => entry.pageId)).size > 1)
      .map(([date, entries]) => ({ date, entries })),
  }
}

function removeBlockIds(blocks: readonly Block[], ids: ReadonlySet<string>): Block[] {
  const result: Block[] = []
  for (const block of blocks) {
    if (ids.has(block.id)) continue
    result.push({
      ...block,
      children: block.children ? removeBlockIds(block.children, ids) : block.children,
    })
  }
  return result
}

function findBlock(blocks: readonly Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) return block
    const child = findBlock(block.children ?? [], blockId)
    if (child) return child
  }
  return null
}

function insertCaptureByDate(blocks: Block[], capture: Block): Block[] {
  const date = parseDailyCaptureContent(capture.content).date
  const laterCaptureIndex = blocks.findIndex(block =>
    block.type === 'dailycapture' && parseDailyCaptureContent(block.content).date > date
  )
  const summaryIndex = blocks.findIndex(block =>
    block.type === 'heading2' && /월간 정리|월말 회고|Month/.test(block.content)
  )
  const boundaries = [laterCaptureIndex, summaryIndex].filter(index => index >= 0)
  const insertIndex = boundaries.length > 0 ? Math.min(...boundaries) : blocks.length
  const result = [...blocks]
  result.splice(insertIndex, 0, { ...capture, children: [] })
  return result
}

export function extractDailyCaptureToRoot(blocks: readonly Block[], blockId: string): Block[] {
  const capture = findBlock(blocks, blockId)
  if (!capture || capture.type !== 'dailycapture') return [...blocks]
  if (blocks.some(block => block.id === blockId)) return [...blocks]
  return insertCaptureByDate(removeBlockIds(blocks, new Set([blockId])), capture)
}

export function mergeDailyCapturesForDate(blocks: readonly Block[], date: string): Block[] {
  const matches = collectEntries(blocks).filter(entry => entry.date === date)
  if (matches.length < 2) return [...blocks]
  const primary = findBlock(blocks, matches[0].blockId)
  if (!primary) return [...blocks]

  // 원문 순서를 보존하고 같은 문장도 임의로 제거하지 않는다.
  const mergedBody = matches.map(entry => entry.body).filter(body => body.length > 0).join('\n')
  const merged: Block = {
    ...primary,
    content: createDailyCaptureContent(date, mergedBody),
    updatedAt: new Date().toISOString(),
    children: [],
  }
  const withoutDuplicates = removeBlockIds(blocks, new Set(matches.map(entry => entry.blockId)))
  return insertCaptureByDate(withoutDuplicates, merged)
}
