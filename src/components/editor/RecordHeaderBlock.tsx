// =============================================
// src/components/editor/RecordHeaderBlock.tsx
// 역할: 일반 메모 안에서 날짜별 기록의 시작 위치를 표시하는 헤더 블록
// 본문을 중첩하지 않고 뒤따르는 일반 블록과 같은 레벨에 놓인다.
// =============================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useLocale } from '@/locales'
import { BASE_URL } from '@/lib/api'

export interface RecordHeaderData {
  date: string
  title: string
  kind: string
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function createDefaultRecordHeaderData(): RecordHeaderData {
  return { date: localDateKey(), title: '', kind: '' }
}

export function parseRecordHeaderData(content: string): RecordHeaderData {
  const fallback = createDefaultRecordHeaderData()
  try {
    const parsed = JSON.parse(content || '{}') as Partial<RecordHeaderData>
    return {
      date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : fallback.date,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      kind: typeof parsed.kind === 'string' ? parsed.kind : '',
    }
  } catch {
    return fallback
  }
}

interface RecordHeaderBlockProps {
  block: Block
  pageId: string
  readOnly?: boolean
}

export default function RecordHeaderBlock({ block, pageId, readOnly = false }: RecordHeaderBlockProps) {
  const t = useLocale()
  const updateBlock = usePageStore(s => s.updateBlock)
  const [exporting, setExporting] = useState(false)
  const data = useMemo(() => parseRecordHeaderData(block.content), [block.content])

  const save = useCallback((patch: Partial<RecordHeaderData>) => {
    updateBlock(pageId, block.id, JSON.stringify({ ...data, ...patch }))
  }, [block.id, data, pageId, updateBlock])

  // 슬래시 명령으로 기존 빈 문단을 변환한 직후에도 날짜가 실제 content에 저장되게 한다.
  useEffect(() => {
    if (!block.content.trim()) {
      updateBlock(pageId, block.id, JSON.stringify(data))
    }
  }, [block.content, block.id, data, pageId, updateBlock])

  async function handleExportHtml() {
    if (exporting) return
    setExporting(true)
    try {
      const query = new URLSearchParams({ record_id: block.id, date: data.date })
      const res = await fetch(`${BASE_URL}/api/export/html/${pageId}?${query}`)
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail || `${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const recordName = (data.title || data.kind || '기록').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || '기록'
      anchor.href = url
      anchor.download = `${data.date}-${recordName}.html`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t.planner.record.exportHtmlSuccess)
    } catch (error) {
      console.error('기록 HTML 내보내기 오류:', error)
      toast.error(t.planner.record.exportHtmlError)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      data-record-date={data.date}
      className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
      style={{
        borderColor: 'var(--color-border-strong)',
        background: 'var(--color-sunken)',
        color: 'var(--color-text)',
      }}
    >
      <span className="shrink-0 text-base" aria-hidden="true">📅</span>
      <label className="sr-only" htmlFor={`record-date-${block.id}`}>{t.planner.record.dateLabel}</label>
      <input
        id={`record-date-${block.id}`}
        type="date"
        value={data.date}
        onChange={e => save({ date: e.target.value || localDateKey() })}
        disabled={readOnly}
        className="min-w-32 rounded border px-2 py-1 text-xs font-semibold outline-none disabled:opacity-70"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
      />
      <input
        type="text"
        value={data.kind}
        onChange={e => save({ kind: e.target.value })}
        readOnly={readOnly}
        aria-label={t.planner.record.kindLabel}
        placeholder={t.planner.record.kindPlaceholder}
        className="w-28 rounded-full border px-2.5 py-1 text-xs outline-none placeholder:text-gray-400"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
      />
      <input
        type="text"
        value={data.title}
        onChange={e => save({ title: e.target.value })}
        readOnly={readOnly}
        aria-label={t.planner.record.titleLabel}
        placeholder={t.planner.record.titlePlaceholder}
        className="min-w-40 flex-1 border-0 bg-transparent px-1 py-1 text-sm font-semibold outline-none placeholder:text-gray-400"
        style={{ color: 'var(--color-text)' }}
      />
      <button
        type="button"
        onClick={() => void handleExportHtml()}
        disabled={exporting}
        title={t.planner.record.exportHtml}
        aria-label={t.planner.record.exportHtml}
        className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/70 disabled:cursor-wait disabled:opacity-60"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        {exporting ? t.planner.record.exportingHtml : '⬇ HTML'}
      </button>
    </div>
  )
}
