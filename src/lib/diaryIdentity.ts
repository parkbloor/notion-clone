import type { Page } from '@/types/block'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDiaryDate(dateStr: string): boolean {
  if (!DATE_KEY_PATTERN.test(dateStr)) return false
  const date = new Date(`${dateStr}T00:00:00`)
  return !Number.isNaN(date.getTime()) && toLocalDateKey(date) === dateStr
}

export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getDiaryTitle(dateStr: string): string {
  return `일기 ${dateStr}`
}

export function findDiaryByDate(pages: readonly Page[], dateStr: string): Page | null {
  return pages.find(page => page.pageRole === 'diary-day' && page.periodKey === dateStr) ?? null
}
