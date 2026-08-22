'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Block, createDailyCaptureContent, isValidDailyCaptureDate, parseDailyCaptureContent } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useLocale } from '@/locales'
import { findBlockById } from '@/lib/blockTree'
import { toast } from 'sonner'

interface DailyCaptureBlockProps {
  block: Block
  pageId: string
  readMode?: boolean
}

function containsCaptureDate(blocks: Block[] | undefined, date: string, excludedId: string): boolean {
  for (const candidate of blocks ?? []) {
    if (
      candidate.id !== excludedId
      && candidate.type === 'dailycapture'
      && parseDailyCaptureContent(candidate.content).date === date
    ) return true
    if (containsCaptureDate(candidate.children, date, excludedId)) return true
  }
  return false
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|~~[^~]+~~|#[\p{L}\p{N}_-]+)/gu)
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={index}>{token.slice(2, -2)}</strong>
    }
    if (token.startsWith('~~') && token.endsWith('~~')) {
      return <del key={index} className="text-gray-400">{token.slice(2, -2)}</del>
    }
    if (token.startsWith('#')) {
      return <span key={index} className="rounded bg-amber-100 px-1 text-amber-700">{token}</span>
    }
    return <span key={index}>{token}</span>
  })
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Electron/브라우저 권한이 막힌 경우 아래의 선택 복사 방식으로 한 번 더 시도한다.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('clipboard copy failed')
}

export default function DailyCaptureBlock({ block, pageId, readMode }: DailyCaptureBlockProps) {
  const t = useLocale()
  const { updateBlock, addBlock } = usePageStore()
  const data = useMemo(() => parseDailyCaptureContent(block.content), [block.content])
  const [editing, setEditing] = useState(() => data.body.length === 0 && !readMode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.max(112, textarea.scrollHeight)}px`
  }, [data.body, editing])

  function save(next: { date?: string; body?: string }, recordHistory = false) {
    updateBlock(
      pageId,
      block.id,
      createDailyCaptureContent(next.date ?? data.date, next.body ?? data.body),
      recordHistory,
    )
  }

  function changeDate(nextDate: string) {
    const page = usePageStore.getState().pages.find(item => item.id === pageId)
    if (!isValidDailyCaptureDate(nextDate)) {
      toast.error(t.planner.dailyCapture.invalidDateError)
      return
    }
    if (page?.pageRole === 'postit-month' && page.periodKey && !nextDate.startsWith(`${page.periodKey}-`)) {
      toast.error(t.planner.dailyCapture.wrongMonthError)
      return
    }
    if (containsCaptureDate(page?.blocks, nextDate, block.id)) {
      toast.error(t.planner.dailyCapture.duplicateDateError)
      return
    }
    save({ date: nextDate }, true)
  }

  function toggleCheckbox(lineIndex: number) {
    if (readMode) return
    const lines = data.body.split('\n')
    const line = lines[lineIndex] ?? ''
    if (/^- \[ \]/.test(line)) lines[lineIndex] = line.replace(/^- \[ \]/, '- [x]')
    else if (/^- \[[xX]\]/.test(line)) lines[lineIndex] = line.replace(/^- \[[xX]\]/, '- [ ]')
    else return
    save({ body: lines.join('\n') }, true)
  }

  const lines = data.body.split('\n')

  async function copyLine(line: string) {
    try {
      await writeClipboard(line)
      toast.success(t.planner.dailyCapture.copySuccess)
    } catch {
      toast.error(t.planner.dailyCapture.clipboardError)
    }
  }

  async function cutLine(lineIndex: number) {
    if (readMode) return
    const requestedLine = data.body.split('\n')[lineIndex]
    const line = requestedLine
    if (!line?.trim()) return

    try {
      await writeClipboard(line)
    } catch {
      toast.error(t.planner.dailyCapture.clipboardError)
      return
    }

    const page = usePageStore.getState().pages.find(item => item.id === pageId)
    const current = findBlockById(page?.blocks, block.id)
    const currentData = current ? parseDailyCaptureContent(current.content) : null
    const currentLines = currentData?.body.split('\n') ?? []
    if (!currentData || currentLines[lineIndex] !== requestedLine) {
      toast.error(t.planner.dailyCapture.cutChangedError)
      return
    }

    const sourceBody = currentData.body
    const sourceDate = currentData.date
    currentLines.splice(lineIndex, 1)
    const cutBody = currentLines.join('\n')
    updateBlock(pageId, block.id, createDailyCaptureContent(sourceDate, cutBody), true)
    toast.success(t.planner.dailyCapture.cutSuccess, {
      action: {
        label: t.planner.dailyCapture.undo,
        onClick: () => {
          const page = usePageStore.getState().pages.find(item => item.id === pageId)
          const current = findBlockById(page?.blocks, block.id)
          const currentData = current ? parseDailyCaptureContent(current.content) : null
          if (!currentData || currentData.date !== sourceDate || currentData.body !== cutBody) {
            toast.error(t.planner.dailyCapture.undoUnavailable)
            return
          }
          updateBlock(pageId, block.id, createDailyCaptureContent(sourceDate, sourceBody), true)
        },
      },
    })
  }

  function lineActions(line: string, lineIndex: number) {
    if (!line.trim()) return null
    return (
      <span className="ml-auto flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/line:opacity-100 sm:group-focus-within/line:opacity-100">
        <button
          type="button"
          title={t.planner.dailyCapture.copyLine}
          aria-label={t.planner.dailyCapture.copyLine}
          onClick={event => { event.stopPropagation(); void copyLine(line) }}
          className="rounded px-1.5 py-0.5 text-[10px] leading-5 text-gray-400 hover:bg-white hover:text-amber-700"
        >
          {t.planner.dailyCapture.copy}
        </button>
        {!readMode && <button
          type="button"
          title={t.planner.dailyCapture.cutLine}
          aria-label={t.planner.dailyCapture.cutLine}
          onClick={event => { event.stopPropagation(); void cutLine(lineIndex) }}
          className="rounded px-1.5 py-0.5 text-[10px] leading-5 text-gray-400 hover:bg-white hover:text-red-600"
        >
          {t.planner.dailyCapture.cut}
        </button>}
      </span>
    )
  }

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 shadow-sm"
      data-ai-block="dailycapture"
      onClick={() => { if (!readMode && !editing) setEditing(true) }}
    >
      <div className="mb-2 flex items-center gap-2 border-b border-amber-200/70 pb-2">
        <span aria-hidden="true">📌</span>
        <input
          type="date"
          value={data.date}
          disabled={readMode}
          aria-label={t.planner.dailyCapture.dateLabel}
          onClick={event => event.stopPropagation()}
          onChange={event => changeDate(event.target.value)}
          className="rounded border-0 bg-transparent text-sm font-semibold text-gray-700 outline-none disabled:cursor-default"
        />
        {!readMode && (
          <span className="ml-auto text-[10px] text-gray-400">{t.planner.dailyCapture.inputHint}</span>
        )}
      </div>

      {editing && !readMode ? (
        <textarea
          ref={textareaRef}
          autoFocus
          value={data.body}
          placeholder={t.planner.dailyCapture.placeholder}
          aria-label={t.planner.dailyCapture.bodyLabel}
          onChange={event => save({ body: event.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              setEditing(false)
              addBlock(pageId, block.id)
            } else if (event.key === 'Escape') {
              event.currentTarget.blur()
            }
          }}
          className="block min-h-28 w-full resize-none overflow-hidden bg-transparent font-mono text-sm leading-7 text-gray-700 outline-none placeholder:text-gray-400"
        />
      ) : (
        <div className="min-h-16 cursor-text space-y-1 text-sm leading-7 text-gray-700">
          {data.body.length === 0 ? (
            <p className="text-gray-400">{t.planner.dailyCapture.placeholder}</p>
          ) : lines.map((line, index) => {
            const task = line.match(/^- \[([ xX])\]\s?(.*)$/)
            if (task) {
              const checked = task[1].toLowerCase() === 'x'
              return (
                <div key={index} className="group/line flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readMode}
                    aria-label={task[2] || t.planner.dailyCapture.checkboxLabel}
                    onClick={event => event.stopPropagation()}
                    onChange={() => toggleCheckbox(index)}
                    className="mt-1.5 accent-amber-600"
                  />
                  <span className={`min-w-0 flex-1 ${checked ? 'text-gray-400 line-through' : ''}`}>{renderInlineMarkdown(task[2])}</span>
                  {lineActions(line, index)}
                </div>
              )
            }
            const bullet = line.match(/^-\s+(.*)$/)
            if (bullet) return (
              <div key={index} className="group/line flex gap-2">
                <span>•</span>
                <span className="min-w-0 flex-1">{renderInlineMarkdown(bullet[1])}</span>
                {lineActions(line, index)}
              </div>
            )
            return (
              <div key={index} className="group/line flex min-h-7 whitespace-pre-wrap">
                <span className="min-w-0 flex-1">{renderInlineMarkdown(line)}</span>
                {lineActions(line, index)}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
