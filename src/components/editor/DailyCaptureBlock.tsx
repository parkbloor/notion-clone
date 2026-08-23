'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Block, createDailyCaptureContent, createDailyCaptureEntriesContent, type DailyCaptureData, type DailyCaptureEntry, isValidDailyCaptureDate, parseDailyCaptureContent } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import { useLocale } from '@/locales'
import { findBlockById } from '@/lib/blockTree'
import { captureTransferApi, type CrossVaultDestination } from '@/lib/api'
import { toast } from 'sonner'

interface DailyCaptureBlockProps {
  block: Block
  pageId: string
  readMode?: boolean
}

interface CaptureLineItem {
  line: string
  index: number
  entry: DailyCaptureEntry
}

interface CaptureLineGroup {
  items: CaptureLineItem[]
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

function contentWithBody(data: DailyCaptureData, date: string, body: string): string {
  if (data.version === 1) return createDailyCaptureContent(date, body)
  // 빈 textarea는 빈 문자열 항목 하나가 아니라 항목이 전혀 없는 상태다.
  // Python으로 치면: lines = [] if body == '' else body.split('\n')
  const nextLines = body === '' ? [] : body.split('\n')
  const oldEntries = [...data.entries]
  const used = new Set<string>()
  const entries: DailyCaptureEntry[] = nextLines.map((text, index) => {
    const atSameIndex = oldEntries[index]
    const match = atSameIndex?.text === text && !used.has(atSameIndex.id)
      ? atSameIndex
      : oldEntries.find(entry => entry.text === text && !used.has(entry.id))
    if (match) {
      used.add(match.id)
      return match
    }
    return { id: crypto.randomUUID(), text }
  })
  return createDailyCaptureEntriesContent(date, entries)
}

// 동일 문장이 여러 개이고 분류 상태가 섞여 있으면 textarea만으로 어느 ID를 삭제했는지 알 수 없다.
// Python으로 치면: ambiguous = deleted_count and has_transferred and has_pending
function hasAmbiguousDuplicateDeletion(data: DailyCaptureData, body: string): boolean {
  if (data.version === 1) return false
  const nextLines = body === '' ? [] : body.split('\n')
  if (nextLines.length >= data.entries.length) return false

  const nextCounts = new Map<string, number>()
  nextLines.forEach(line => nextCounts.set(line, (nextCounts.get(line) ?? 0) + 1))
  const entriesByText = new Map<string, DailyCaptureEntry[]>()
  data.entries.forEach(entry => entriesByText.set(entry.text, [...(entriesByText.get(entry.text) ?? []), entry]))
  return [...entriesByText.entries()].some(([text, entries]) => {
    const identityStates = new Set(entries.map(entry => entry.transfer?.transferId ?? 'pending'))
    return (nextCounts.get(text) ?? 0) < entries.length && identityStates.size > 1
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

// 신규 전송은 서버가 저장한 현지 날짜를 쓰고, 기존 기록은 ISO 시각을 사용자 현지 날짜로 변환한다.
// Python으로 치면: return transfer.classified_date or local_date(transfer.transferred_at)
function classifiedDateLabel(entry: DailyCaptureEntry): string {
  if (entry.transfer?.classifiedDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.transfer.classifiedDate)) {
    return entry.transfer.classifiedDate
  }
  const transferredAt = entry.transfer?.transferredAt
  if (!transferredAt) return ''
  const date = new Date(transferredAt)
  if (Number.isNaN(date.getTime())) return transferredAt.slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const TRANSFER_BADGE_CLASSES = [
  'bg-rose-50 text-rose-700 ring-rose-200',
  'bg-amber-50 text-amber-700 ring-amber-200',
  'bg-teal-50 text-teal-700 ring-teal-200',
  'bg-violet-50 text-violet-700 ring-violet-200',
  'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'bg-sky-50 text-sky-700 ring-sky-200',
  'bg-orange-50 text-orange-700 ring-orange-200',
  'bg-emerald-50 text-emerald-700 ring-emerald-200',
]

function transferBadgeIndex(destinationPageId: string): number {
  let hash = 2166136261
  for (const character of destinationPageId) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % TRANSFER_BADGE_CLASSES.length
}

// 설정된 목적지는 페이지 ID 순으로 빈 팔레트를 찾아 배정해 8개까지 서로 다른 색을 보장한다.
// Python으로 치면: while color in used: color = (color + 1) % len(palette)
function transferBadgeClass(destinationPageId: string, configuredPageIds: string[]): string {
  const assigned = new Map<string, number>()
  const used = new Set<number>()
  for (const pageId of [...new Set(configuredPageIds)].sort()) {
    let index = transferBadgeIndex(pageId)
    let attempts = 0
    while (used.has(index) && attempts < TRANSFER_BADGE_CLASSES.length) {
      index = (index + 1) % TRANSFER_BADGE_CLASSES.length
      attempts += 1
    }
    assigned.set(pageId, index)
    used.add(index)
  }
  return TRANSFER_BADGE_CLASSES[assigned.get(destinationPageId) ?? transferBadgeIndex(destinationPageId)]
}

function isCaptureContinuation(line: string): boolean {
  return Boolean(line.trim()) && (line.startsWith('\t') || line.startsWith('  '))
}

function isFirstNumberedChild(parentLine: string, line: string): boolean {
  return /^-\s+\S/.test(parentLine) && /^1[.)]\s+\S/.test(line)
}

// 포스트잇에서만 연속된 들여쓰기 줄을 바로 앞 상위 줄의 하위 내용으로 묶는다.
// Python으로 치면: groups[-1].append(line) if line.is_indented() else groups.append([line])
function groupCaptureLines(lines: string[], entries: DailyCaptureEntry[]): CaptureLineGroup[] {
  const groups: CaptureLineGroup[] = []
  lines.forEach((line, index) => {
    const item = { line, index, entry: entries[index] ?? { id: `legacy-${index}`, text: line } }
    const previousLine = lines[index - 1]
    const previousGroup = groups[groups.length - 1]
    const startsNumberedList = previousGroup?.items.length === 1
      && isFirstNumberedChild(previousGroup.items[0].line, line)
    if (((isCaptureContinuation(line) && Boolean(previousLine?.trim())) || startsNumberedList) && previousGroup) {
      previousGroup.items.push(item)
    } else {
      groups.push({ items: [item] })
    }
  })

  return groups.flatMap(group => {
    if (group.items.length === 1) return [group]
    const transfers = group.items.map(item => item.entry.transfer)
    const allPending = transfers.every(transfer => !transfer)
    const allSameDestinationBlock = transfers.every(transfer => transfer)
      && new Set(transfers.map(transfer => transfer?.destinationBlockId)).size === 1
    // 이전 버전에서 줄별로 따로 분류된 기록은 합쳐 보이지 않게 원래 표시를 유지한다.
    // Python으로 치면: return group if pending_or_same_transfer else singleton_groups
    return allPending || allSameDestinationBlock
      ? [group]
      : group.items.map(item => ({ items: [item] }))
  })
}

export default function DailyCaptureBlock({ block, pageId, readMode }: DailyCaptureBlockProps) {
  const t = useLocale()
  const { updateBlock, addBlock, pages, transferDailyCaptureEntry } = usePageStore()
  const configuredCaptureDestinations = useVaultPreferencesStore(state => state.preferences.planner.captureDestinations)
  // 새 필드가 없는 이전 백엔드 응답을 받아도 포스트잇 화면은 빈 분류함으로 계속 렌더링한다.
  const captureDestinations = Array.isArray(configuredCaptureDestinations) ? configuredCaptureDestinations : []
  const data = useMemo(() => parseDailyCaptureContent(block.content), [block.content])
  const [editing, setEditing] = useState(() => data.body.length === 0 && !readMode)
  const [destinationPickerEntryId, setDestinationPickerEntryId] = useState<string | null>(null)
  const [transferringEntryId, setTransferringEntryId] = useState<string | null>(null)
  const [crossVaultEntryId, setCrossVaultEntryId] = useState<string | null>(null)
  const [crossVaultLoading, setCrossVaultLoading] = useState(false)
  const [crossVaultDestinations, setCrossVaultDestinations] = useState<Array<{ name: string; destinations: CrossVaultDestination[] }>>([])
  const [crossVaultSelection, setCrossVaultSelection] = useState<{ entryId: string; vaultName: string; destination: CrossVaultDestination } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.max(112, textarea.scrollHeight)}px`
  }, [data.body, editing])

  function save(next: { date?: string; body?: string }, recordHistory = false) {
    if (next.body !== undefined && hasAmbiguousDuplicateDeletion(data, next.body)) {
      toast.error(t.planner.dailyCapture.ambiguousDuplicateDeleteError)
      return
    }
    updateBlock(
      pageId,
      block.id,
      contentWithBody(data, next.date ?? data.date, next.body ?? data.body),
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
    if (data.entries[lineIndex]?.transfer) return
    const lines = data.body.split('\n')
    const line = lines[lineIndex] ?? ''
    if (/^- \[ \]/.test(line)) lines[lineIndex] = line.replace(/^- \[ \]/, '- [x]')
    else if (/^- \[[xX]\]/.test(line)) lines[lineIndex] = line.replace(/^- \[[xX]\]/, '- [ ]')
    else return
    save({ body: lines.join('\n') }, true)
  }

  const lines = useMemo(() => data.body.split('\n'), [data.body])
  const captureGroups = useMemo(() => groupCaptureLines(lines, data.entries), [data.entries, lines])

  async function transferLine(entry: DailyCaptureEntry, destinationPageId: string, kind: 'task' | 'note', crossVault?: { name: string; revision: number }) {
    if (readMode || entry.transfer || transferringEntryId) return
    setTransferringEntryId(entry.id)
    try {
      const result = await transferDailyCaptureEntry({
        sourcePageId: pageId,
        sourceBlockId: block.id,
        sourceEntryId: entry.id,
        destinationPageId,
        kind,
        ...(crossVault ? { destinationVaultName: crossVault.name, destinationRevision: crossVault.revision } : {}),
      })
      setDestinationPickerEntryId(null)
      setCrossVaultEntryId(null)
      setCrossVaultSelection(null)
      toast.success(result.alreadyTransferred ? t.planner.dailyCapture.transferAlreadyDone : t.planner.dailyCapture.transferSuccess)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.dailyCapture.transferError)
    } finally {
      setTransferringEntryId(null)
    }
  }

  async function openCrossVaultPicker(entryId: string) {
    setCrossVaultEntryId(entryId)
    setCrossVaultSelection(null)
    setCrossVaultLoading(true)
    try {
      setCrossVaultDestinations(await captureTransferApi.getCrossVaultDestinations())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.planner.dailyCapture.crossVaultLoadError)
      setCrossVaultDestinations([])
    } finally {
      setCrossVaultLoading(false)
    }
  }

  async function copyLine(line: string) {
    try {
      await writeClipboard(line)
      toast.success(t.planner.dailyCapture.copySuccess)
    } catch {
      toast.error(t.planner.dailyCapture.clipboardError)
    }
  }

  async function cutLines(group: CaptureLineGroup) {
    if (readMode) return
    const requestedLines = group.items.map(item => item.line)
    const firstLineIndex = group.items[0]?.index
    if (firstLineIndex === undefined || !requestedLines.some(line => line.trim())) return

    try {
      await writeClipboard(requestedLines.join('\n'))
    } catch {
      toast.error(t.planner.dailyCapture.clipboardError)
      return
    }

    const page = usePageStore.getState().pages.find(item => item.id === pageId)
    const current = findBlockById(page?.blocks, block.id)
    const currentData = current ? parseDailyCaptureContent(current.content) : null
    const currentLines = currentData?.body.split('\n') ?? []
    const currentGroupLines = currentLines.slice(firstLineIndex, firstLineIndex + requestedLines.length)
    if (!currentData || currentGroupLines.some((line, index) => line !== requestedLines[index])) {
      toast.error(t.planner.dailyCapture.cutChangedError)
      return
    }

    const sourceBody = currentData.body
    const sourceDate = currentData.date
    const sourceEntries = currentData.entries
    currentLines.splice(firstLineIndex, requestedLines.length)
    const cutBody = currentLines.join('\n')
    const cutContent = currentData.version === 2
      ? createDailyCaptureEntriesContent(
        sourceDate,
        sourceEntries.filter((_, index) => index < firstLineIndex || index >= firstLineIndex + requestedLines.length),
      )
      : contentWithBody(currentData, sourceDate, cutBody)
    updateBlock(pageId, block.id, cutContent, true)
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
          const restoredContent = currentData.version === 2
            ? createDailyCaptureEntriesContent(sourceDate, sourceEntries)
            : contentWithBody(currentData, sourceDate, sourceBody)
          updateBlock(pageId, block.id, restoredContent, true)
        },
      },
    })
  }

  function lineActions(group: CaptureLineGroup) {
    const { line, entry } = group.items[0]
    if (!line.trim()) return null
    if (entry.transfer) {
      const destination = pages.find(page => page.id === entry.transfer?.destinationPageId)
      const classifiedDate = classifiedDateLabel(entry)
      const badgeClass = transferBadgeClass(
        entry.transfer.destinationPageId,
        captureDestinations.map(destination => destination.pageId),
      )
      return <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-5 ring-1 ring-inset ${badgeClass}`}>
        {t.planner.dailyCapture.transferredPrefix} {entry.transfer.destinationVaultName ? `${entry.transfer.destinationVaultName} · ` : ''}{entry.transfer.destinationPageTitle || destination?.title || t.planner.dailyCapture.captureDestinationMissing}{classifiedDate ? ` · ${classifiedDate}` : ''}
      </span>
    }
    return (
      <span className="ml-auto flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/line:opacity-100 sm:group-focus-within/line:opacity-100">
        {!readMode && <button
          type="button"
          title={t.planner.dailyCapture.transferLine}
          aria-label={t.planner.dailyCapture.transferLine}
          disabled={transferringEntryId !== null}
          onClick={event => { event.stopPropagation(); setDestinationPickerEntryId(current => current === entry.id ? null : entry.id) }}
          className="rounded px-1.5 py-0.5 text-[10px] leading-5 text-gray-400 hover:bg-white hover:text-emerald-700 disabled:cursor-wait"
        >
          {t.planner.dailyCapture.transfer}
        </button>}
        <button
          type="button"
          title={t.planner.dailyCapture.copyLine}
          aria-label={t.planner.dailyCapture.copyLine}
          onClick={event => { event.stopPropagation(); void copyLine(group.items.map(item => item.line).join('\n')) }}
          className="rounded px-1.5 py-0.5 text-[10px] leading-5 text-gray-400 hover:bg-white hover:text-amber-700"
        >
          {t.planner.dailyCapture.copy}
        </button>
        {!readMode && <button
          type="button"
          title={t.planner.dailyCapture.cutLine}
          aria-label={t.planner.dailyCapture.cutLine}
          onClick={event => { event.stopPropagation(); void cutLines(group) }}
          className="rounded px-1.5 py-0.5 text-[10px] leading-5 text-gray-400 hover:bg-white hover:text-red-600"
        >
          {t.planner.dailyCapture.cut}
        </button>}
      </span>
    )
  }

  function destinationPicker(entry: DailyCaptureEntry) {
    if (destinationPickerEntryId !== entry.id) return null
    return <div
      className="ml-6 mt-1 flex flex-wrap gap-1.5 rounded-lg border border-amber-200 bg-white p-2 shadow-sm"
      onClick={event => event.stopPropagation()}
    >
      {captureDestinations.length === 0 && (
        <p className="w-full text-[11px] text-gray-400">{t.planner.dailyCapture.captureShelfEmpty}</p>
      )}
      {captureDestinations.map(destination => {
        const page = pages.find(item => item.id === destination.pageId)
        const unavailable = !page || page.pageRole === 'postit-month'
        return <button
          key={destination.id}
          type="button"
          disabled={unavailable || transferringEntryId !== null}
          onClick={() => void transferLine(entry, destination.pageId, destination.kind)}
          className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true">{page?.icon || '📝'}</span>
          <span>{page?.title || t.planner.dailyCapture.captureDestinationMissing}</span>
          <span className="text-gray-400">{destination.kind === 'task' ? t.planner.dailyCapture.destinationTask : t.planner.dailyCapture.destinationNote}</span>
        </button>
      })}
      <button
        type="button"
        disabled={transferringEntryId !== null || crossVaultLoading}
        onClick={() => void openCrossVaultPicker(entry.id)}
        className="rounded border border-blue-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
      >
        {t.planner.dailyCapture.copyToOtherVault}
      </button>
      {crossVaultEntryId === entry.id && <div className="w-full border-t border-gray-100 pt-2">
        {crossVaultLoading ? (
          <p className="text-[11px] text-gray-400">{t.planner.dailyCapture.crossVaultLoading}</p>
        ) : crossVaultDestinations.length === 0 ? (
          <p className="text-[11px] text-gray-400">{t.planner.dailyCapture.crossVaultEmpty}</p>
        ) : <div className="space-y-2">
          {crossVaultDestinations.map(vault => <div key={vault.name}>
            <p className="mb-1 text-[10px] font-medium text-gray-500">{vault.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {vault.destinations.map(destination => <button
                key={destination.id}
                type="button"
                disabled={transferringEntryId !== null}
                onClick={() => setCrossVaultSelection({ entryId: entry.id, vaultName: vault.name, destination })}
                className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
              >
                <span aria-hidden="true">{destination.pageIcon || '📝'}</span>
                <span>{destination.pageTitle || t.planner.dailyCapture.captureDestinationMissing}</span>
                <span className="text-gray-400">{destination.kind === 'task' ? t.planner.dailyCapture.destinationTask : t.planner.dailyCapture.destinationNote}</span>
              </button>)}
            </div>
          </div>)}
          {crossVaultSelection?.entryId === entry.id && <div className="flex flex-wrap items-center gap-1.5 rounded bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">
            <span>{t.planner.dailyCapture.crossVaultConfirmPrefix} {crossVaultSelection.vaultName} · {crossVaultSelection.destination.pageTitle}</span>
            <button
              type="button"
              disabled={transferringEntryId !== null}
              onClick={() => void transferLine(entry, crossVaultSelection.destination.pageId, crossVaultSelection.destination.kind, {
                name: crossVaultSelection.vaultName,
                revision: crossVaultSelection.destination.revision,
              })}
              className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t.planner.dailyCapture.crossVaultConfirm}
            </button>
            <button type="button" onClick={() => setCrossVaultSelection(null)} className="rounded px-1.5 py-0.5 text-blue-700 hover:bg-white">
              {t.planner.dailyCapture.crossVaultCancel}
            </button>
          </div>}
        </div>}
      </div>}
    </div>
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
          <span className="ml-auto text-right text-[10px] leading-4 text-gray-400">{t.planner.dailyCapture.inputHint}</span>
        )}
      </div>

      {captureDestinations.length > 0 && <div className="mb-3 border-b border-amber-200/70 pb-3">
        <p className="mb-1.5 text-[10px] font-medium text-amber-700">{t.planner.dailyCapture.captureShelf}</p>
        <div className="flex flex-wrap gap-1.5">
          {captureDestinations.map(destination => {
            const page = pages.find(item => item.id === destination.pageId)
            return (
              <span
                key={destination.id}
                title={page?.title || t.planner.dailyCapture.captureDestinationMissing}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-amber-200 bg-white/80 px-2 py-1 text-[11px] text-amber-800"
              >
                <span aria-hidden="true">{page?.icon || '📝'}</span>
                <span className="max-w-36 truncate">{page?.title || t.planner.dailyCapture.captureDestinationMissing}</span>
                <span className="text-amber-500">{destination.kind === 'task' ? t.planner.dailyCapture.destinationTask : t.planner.dailyCapture.destinationNote}</span>
              </span>
            )
          })}
        </div>
      </div>}

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
          ) : captureGroups.map(group => {
            const { line, index, entry } = group.items[0]
            const childItems = group.items.slice(1)
            const children = childItems.length > 0 && (
              <div className="ml-6 border-l-2 border-amber-200/80 pl-3 text-gray-600">
                {childItems.map(child => (
                  <div key={child.entry.id} className="min-h-7 whitespace-pre-wrap">
                    {renderInlineMarkdown(child.line.trimStart())}
                  </div>
                ))}
              </div>
            )
            const task = line.match(/^- \[([ xX])\]\s?(.*)$/)
            if (task) {
              const checked = task[1].toLowerCase() === 'x'
              return (
                <div key={entry.id} className="group/line">
                  <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readMode || Boolean(entry.transfer)}
                    aria-label={task[2] || t.planner.dailyCapture.checkboxLabel}
                    onClick={event => event.stopPropagation()}
                    onChange={() => toggleCheckbox(index)}
                    className="mt-1.5 accent-amber-600"
                  />
                  <span className={`min-w-0 flex-1 ${checked ? 'text-gray-400 line-through' : ''}`}>{renderInlineMarkdown(task[2])}</span>
                  {lineActions(group)}
                  </div>
                  {children}
                  {destinationPicker(entry)}
                </div>
              )
            }
            const bullet = line.match(/^-\s+(.*)$/)
            if (bullet) return (
              <div key={entry.id} className="group/line">
                <div className="flex gap-2">
                <span>•</span>
                <span className="min-w-0 flex-1">{renderInlineMarkdown(bullet[1])}</span>
                {lineActions(group)}
                </div>
                {children}
                {destinationPicker(entry)}
              </div>
            )
            return (
              <div key={entry.id} className="group/line min-h-7 whitespace-pre-wrap">
                <div className="flex">
                <span className="min-w-0 flex-1">{renderInlineMarkdown(line)}</span>
                {lineActions(group)}
                </div>
                {children}
                {destinationPicker(entry)}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
