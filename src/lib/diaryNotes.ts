import { toast } from 'sonner'
import { useDiaryStore } from '@/store/diaryStore'
import { usePageStore } from '@/store/pageStore'
import { createBlock, type Block } from '@/types/block'
import { findDiaryByDate, getDiaryTitle, isValidDiaryDate } from '@/lib/diaryIdentity'

const pendingDiaryNotes = new Map<string, Promise<string | null>>()

export function makeDiaryBlocks(dateStr: string): Block[] {
  const date = new Date(`${dateStr}T00:00:00`)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return [
    { ...createBlock('heading1'), content: `${dateStr} (${weekday}) 일기` },
    createBlock('paragraph'),
  ]
}

function focusDiaryBody(pageId: string, attempts = 8): void {
  if (typeof document === 'undefined') return
  const focus = (remaining: number) => {
    const page = usePageStore.getState().pages.find(item => item.id === pageId)
    const bodyBlockId = page?.blocks[1]?.id
    const wrapper = bodyBlockId ? document.getElementById(bodyBlockId) : null
    const editor = wrapper?.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"], textarea')
    if (editor) {
      editor.focus()
      wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (remaining > 0) window.setTimeout(() => focus(remaining - 1), 50)
  }
  window.requestAnimationFrame(() => focus(attempts))
}

async function createDiary(dateStr: string): Promise<string | null> {
  const state = usePageStore.getState()
  const existing = findDiaryByDate(state.pages, dateStr)
  if (existing) return existing.id

  const pageId = await state.addPage(getDiaryTitle(dateStr), null)
  const latest = usePageStore.getState()
  if (!latest.pages.some(page => page.id === pageId)) return null

  latest.updatePageIcon(pageId, '📔')
  latest.setPageRole(pageId, 'diary-day', dateStr)
  latest.setPageBlocks(pageId, makeDiaryBlocks(dateStr))
  const saved = await latest.savePageNow(pageId)
  if (!saved) {
    toast.error('일기를 저장하지 못했습니다.')
    return null
  }
  return pageId
}

export async function openOrCreateDiary(dateStr: string): Promise<string | null> {
  if (!isValidDiaryDate(dateStr)) return null

  const pageState = usePageStore.getState()
  const diaryState = useDiaryStore.getState()
  if (
    diaryState.status !== 'ready'
    || !diaryState.diaryVaultName
    || pageState.currentVaultName !== diaryState.diaryVaultName
  ) {
    toast.error('지정된 일기 볼트에서만 일기를 만들 수 있습니다.')
    return null
  }

  const existing = findDiaryByDate(pageState.pages, dateStr)
  if (existing) {
    pageState.setCurrentPage(existing.id)
    return existing.id
  }

  const requestKey = `${diaryState.diaryVaultName}:${dateStr}`
  const active = pendingDiaryNotes.get(requestKey)
  if (active) return active

  const operation = createDiary(dateStr)
  pendingDiaryNotes.set(requestKey, operation)
  try {
    const pageId = await operation
    if (pageId) {
      usePageStore.getState().setCurrentPage(pageId)
      focusDiaryBody(pageId)
    }
    return pageId
  } finally {
    if (pendingDiaryNotes.get(requestKey) === operation) pendingDiaryNotes.delete(requestKey)
  }
}
