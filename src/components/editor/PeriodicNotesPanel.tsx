// =============================================
// src/components/editor/PeriodicNotesPanel.tsx
// 역할: 사이드바 내 일간·주간 노트 목록 패널
// Python으로 치면: class PeriodicNotesPanel(Widget): ...
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { createBlock } from '@/types/block'
import type { Block } from '@/types/block'

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
// Python으로 치면: def make_daily_template(title) -> list[Block]: ...
// -----------------------------------------------
function makeDailyTemplate(title: string): Block[] {
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '오늘의 할 일' },
    createBlock('taskList'),
    { ...createBlock('heading2'), content: '메모' },
    createBlock('paragraph'),
  ]
}

// -----------------------------------------------
// 주간 노트 기본 템플릿 블록 생성
// Python으로 치면: def make_weekly_template(title) -> list[Block]: ...
// -----------------------------------------------
function makeWeeklyTemplate(title: string): Block[] {
  return [
    { ...createBlock('heading1'), content: title },
    createBlock('divider'),
    { ...createBlock('heading2'), content: '이번 주 목표' },
    createBlock('paragraph'),
    { ...createBlock('heading2'), content: '회고' },
    createBlock('paragraph'),
  ]
}

// -----------------------------------------------
// PeriodicNotesPanel — 일간/주간 탭 패널
// -----------------------------------------------
export default function PeriodicNotesPanel() {

  // 탭 상태: 'daily' | 'weekly'
  // Python으로 치면: self.active_tab = 'daily'
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily')

  const {
    pages,
    categories,
    currentPageId,
    setCurrentPage,
    addPage,
    updatePageIcon,
    setPageBlocks,
  } = usePageStore()

  // ── 오늘 기준 날짜 정보 ──────────────────────
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDateStr = `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const todayWeek = getISOWeek(today)
  const todayWeekStr = `${todayYear}-W${String(todayWeek).padStart(2, '0')}`

  // ── 일간 노트 목록 (이번 달만, 날짜 역순) ─────
  // Python으로 치면: [p for p in pages if p.title.startswith('일간 노트 YYYY-MM')]
  const dailyNotes = pages
    .filter(p => {
      const prefix = `일간 노트 ${todayYear}-${String(todayMonth).padStart(2, '0')}`
      return p.title.startsWith(prefix)
    })
    .sort((a, b) => b.title.localeCompare(a.title))

  // ── 주간 노트 목록 (올해만, 주차 역순) ─────────
  // Python으로 치면: [p for p in pages if p.title.startswith('주간 노트 YYYY-')]
  const weeklyNotes = pages
    .filter(p => p.title.startsWith(`주간 노트 ${todayYear}-W`))
    .sort((a, b) => b.title.localeCompare(a.title))

  // -----------------------------------------------
  // 오늘 일간 노트 열기/생성
  // 없으면 템플릿으로 새로 생성, 있으면 이동
  // Python으로 치면: async def open_daily_note(self): ...
  // -----------------------------------------------
  async function handleOpenDaily() {
    const title = `일간 노트 ${todayDateStr}`

    // 기존 페이지 검색
    const existing = pages.find(p => p.title === title)
    if (existing) {
      setCurrentPage(existing.id)
      return
    }

    // 전용 카테고리 찾기
    const cat = categories.find(c => c.name === '📅 일간 노트')

    // 새 페이지 생성 (addPage가 currentPageId를 새 페이지로 설정)
    await addPage(title, cat?.id ?? null)

    // 생성 직후 store에서 새 페이지 ID 가져오기
    // Python으로 치면: new_page_id = page_store.current_page_id
    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return

    // 아이콘 + 템플릿 블록 적용
    updatePageIcon(newId, '📅')
    setPageBlocks(newId, makeDailyTemplate(title))
  }

  // -----------------------------------------------
  // 이번 주 주간 노트 열기/생성
  // Python으로 치면: async def open_weekly_note(self): ...
  // -----------------------------------------------
  async function handleOpenWeekly() {
    const title = `주간 노트 ${todayWeekStr}`

    const existing = pages.find(p => p.title === title)
    if (existing) {
      setCurrentPage(existing.id)
      return
    }

    const cat = categories.find(c => c.name === '📆 주간 노트')
    await addPage(title, cat?.id ?? null)

    const { currentPageId: newId } = usePageStore.getState()
    if (!newId) return

    updatePageIcon(newId, '📆')
    setPageBlocks(newId, makeWeeklyTemplate(title))
  }

  return (
    <div className="border-t border-gray-100">
      {/* ── 탭 헤더 ─────────────────────────────── */}
      {/* Python으로 치면: self.tab_header = TabHeader(['일간', '주간']) */}
      <div className="flex items-center px-2 pt-2 pb-1 gap-1">
        <button
          type="button"
          onClick={() => setTab('daily')}
          className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${tab === 'daily' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          📅 일간
        </button>
        <button
          type="button"
          onClick={() => setTab('weekly')}
          className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${tab === 'weekly' ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          📆 주간
        </button>
      </div>

      {/* ── 일간 탭 ─────────────────────────────── */}
      {tab === 'daily' && (
        <div className="pb-1">
          {/* 오늘 버튼 */}
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={handleOpenDaily}
              className="w-full py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              오늘 열기
            </button>
          </div>
          {/* 이번 달 일간 노트 목록 */}
          {/* Python으로 치면: for note in daily_notes: render_row(note) */}
          <div className="max-h-32 overflow-y-auto">
            {dailyNotes.length === 0 ? (
              <p className="px-3 py-1 text-xs text-gray-400">이번 달 일간 노트 없음</p>
            ) : (
              dailyNotes.map(note => {
                // 제목에서 날짜 부분만 추출: "일간 노트 2026-03-24" → "03-24"
                // Python으로 치면: date_str = note.title.split()[-1][5:]
                const datePart = note.title.replace('일간 노트 ', '').slice(5) // "03-24"
                const isToday = note.title === `일간 노트 ${todayDateStr}`
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setCurrentPage(note.id)}
                    className={`w-full flex items-center gap-1.5 px-3 py-1 text-xs text-left transition-colors ${currentPageId === note.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <span className="text-blue-400">📅</span>
                    <span className="flex-1 truncate">{datePart}</span>
                    {isToday && (
                      <span className="shrink-0 px-1 py-0.5 text-[10px] bg-blue-100 text-blue-600 rounded">오늘</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── 주간 탭 ─────────────────────────────── */}
      {tab === 'weekly' && (
        <div className="pb-1">
          {/* 이번 주 버튼 */}
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={handleOpenWeekly}
              className="w-full py-1 text-xs bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors"
            >
              이번 주 열기
            </button>
          </div>
          {/* 올해 주간 노트 목록 */}
          {/* Python으로 치면: for note in weekly_notes: render_row(note) */}
          <div className="max-h-32 overflow-y-auto">
            {weeklyNotes.length === 0 ? (
              <p className="px-3 py-1 text-xs text-gray-400">올해 주간 노트 없음</p>
            ) : (
              weeklyNotes.map(note => {
                // "주간 노트 2026-W13" → "W13"
                const weekPart = note.title.replace(`주간 노트 ${todayYear}-`, '') // "W13"
                const isThisWeek = note.title === `주간 노트 ${todayWeekStr}`
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setCurrentPage(note.id)}
                    className={`w-full flex items-center gap-1.5 px-3 py-1 text-xs text-left transition-colors ${currentPageId === note.id ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <span className="text-violet-400">📆</span>
                    <span className="flex-1 truncate">{weekPart}</span>
                    {isThisWeek && (
                      <span className="shrink-0 px-1 py-0.5 text-[10px] bg-violet-100 text-violet-600 rounded">이번 주</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
