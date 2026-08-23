'use client'

import { useMemo } from 'react'
import { useLocale } from '@/locales'
import { getDailyNoteDate, openOrCreateDailyNote } from '@/lib/dailyNotes'
import { openOrCreateDiary } from '@/lib/diaryNotes'
import { toLocalDateKey } from '@/lib/diaryIdentity'
import { usePageStore } from '@/store/pageStore'

interface DiaryPanelProps {
  /** 새 전용 일기 설정 전에 만든 자유 일기 일간 노트를 그대로 이어서 보여준다. */
  legacyDailyNotes?: boolean
}

export default function DiaryPanel({ legacyDailyNotes = false }: DiaryPanelProps) {
  const t = useLocale()
  const pages = usePageStore(state => state.pages)
  const currentPageId = usePageStore(state => state.currentPageId)
  const setCurrentPage = usePageStore(state => state.setCurrentPage)
  const today = toLocalDateKey(new Date())
  const diaryPages = useMemo(() => pages
    .map(page => ({
      page,
      date: legacyDailyNotes ? getDailyNoteDate(page.title) : page.periodKey ?? null,
    }))
    .filter(entry => legacyDailyNotes
      ? entry.date !== null
      : entry.page.pageRole === 'diary-day' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? ''))
    .sort((left, right) => (right.date ?? '').localeCompare(left.date ?? '')), [legacyDailyNotes, pages])

  const openDiary = () => legacyDailyNotes
    ? openOrCreateDailyNote(today)
    : openOrCreateDiary(today)

  return (
    <div>
      <section className="border-b hairline px-2 py-2">
        <button
          type="button"
          onClick={() => void openDiary()}
          className="flex min-h-14 w-full flex-col items-start justify-center rounded-lg bg-amber-50 px-3 py-2 text-left text-amber-700 transition-colors hover:bg-amber-100"
        >
          <span className="text-base">📔</span>
          <span className="mt-0.5 text-[11px] font-semibold">{t.overlay.periodic.openTodayDiary}</span>
          <span className="text-[9px] opacity-70">{today}</span>
        </button>
      </section>

      <section className="py-2">
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {t.sidebar.diaryEntries}
        </div>
        <div className="max-h-80 overflow-y-auto px-2">
          {diaryPages.length === 0 ? (
            <p className="px-1 py-2 text-xs text-gray-400">{t.sidebar.diaryEmpty}</p>
          ) : diaryPages.map(({ page, date }) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setCurrentPage(page.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${currentPageId === page.id ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span>📔</span>
              <span className="flex-1 truncate">{page.title || page.periodKey}</span>
              <span className="shrink-0 text-[9px] text-gray-400">{date}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
