// ==============================================
// src/components/editor/CommandPalette.tsx
// 역할: Ctrl+P로 여는 커맨드 팔레트
//   - 최근 페이지 + 전체 페이지 클라이언트 사이드 검색
//   - 빠른 액션 (새 페이지, 설정, 단축키, 내용 검색)
//   - ↑↓ 키보드 탐색, Enter 실행, Esc 닫기
// Python으로 치면: class CommandPaletteDialog(QDialog): ...
// ==============================================

'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useLocale } from '@/locales'

// ── 팔레트 아이템 타입 유니온 ──
// Python으로 치면: PageItem | ActionItem (dataclass)
type PaletteItem =
  | { kind: 'page'; id: string; title: string; icon: string; section: string }
  | { kind: 'action'; id: string; label: string; desc: string; icon: string; run: () => void }

// CommandPalette 컴포넌트 props
// Python으로 치면: def CommandPalette(on_close, on_open_settings, on_open_shortcuts, on_open_search, on_open_calendar): ...
interface CommandPaletteProps {
  onClose: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onOpenSearch: () => void
  onOpenCalendar: () => void
}

export default function CommandPalette({
  onClose,
  onOpenSettings,
  onOpenShortcuts,
  onOpenSearch,
  onOpenCalendar,
}: CommandPaletteProps) {

  // 번역 훅
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 검색어 입력 상태
  // Python으로 치면: self.query = ''
  const [query, setQuery] = useState('')

  // 현재 키보드로 선택된 항목 인덱스
  // Python으로 치면: self.selected_index = 0
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 검색 입력창 ref (자동 포커스용)
  const inputRef = useRef<HTMLInputElement>(null)

  // 결과 항목 ref 배열 (키보드 스크롤용)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // 페이지 목록 + 최근 페이지 IDs + 액션
  // Python으로 치면: store = get_store()
  const { pages, recentPageIds, setCurrentPage, addPage } = usePageStore()

  // ── 컴포넌트 마운트 시 입력창에 자동 포커스 ──
  // Python으로 치면: self.input.setFocus()
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── 빠른 액션 목록 정의 ──
  // Python으로 치면: ACTIONS = [{'label': '새 페이지', 'run': add_page}, ...]
  const actions: PaletteItem[] = useMemo(() => [
    {
      kind: 'action',
      id: 'action-new-page',
      label: t.overlay.commandPalette.actionNewPage,
      desc: t.overlay.commandPalette.actionNewPageDesc,
      icon: '✏️',
      run: () => {
        addPage(t.sidebar.newPage, null)
        onClose()
      },
    },
    {
      kind: 'action',
      id: 'action-settings',
      label: t.overlay.commandPalette.actionSettings,
      desc: t.overlay.commandPalette.actionSettingsDesc,
      icon: '⚙️',
      run: () => onOpenSettings(),
    },
    {
      kind: 'action',
      id: 'action-shortcuts',
      label: t.overlay.commandPalette.actionShortcuts,
      desc: t.overlay.commandPalette.actionShortcutsDesc,
      icon: '❓',
      run: () => onOpenShortcuts(),
    },
    {
      kind: 'action',
      id: 'action-search',
      label: t.overlay.commandPalette.actionSearch,
      desc: t.overlay.commandPalette.actionSearchDesc,
      icon: '🔍',
      run: () => onOpenSearch(),
    },
    {
      kind: 'action',
      id: 'action-calendar',
      label: t.overlay.commandPalette.actionCalendar,
      desc: t.overlay.commandPalette.actionCalendarDesc,
      icon: '📅',
      run: () => onOpenCalendar(),
    },
  ], [t, addPage, onClose, onOpenSettings, onOpenShortcuts, onOpenSearch, onOpenCalendar])

  // ── 표시할 아이템 목록 계산 ──
  // 쿼리 없음: 최근 페이지 + 전체 액션
  // 쿼리 있음: 페이지 제목 필터 + 액션 라벨 필터
  // Python으로 치면: def compute_items(query, pages, actions): ...
  const items: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      // 최근 페이지 (최대 5개)
      const recentItems: PaletteItem[] = recentPageIds
        .slice(0, 5)
        .map(id => pages.find(p => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map(p => ({
          kind: 'page' as const,
          id: p.id,
          title: p.title || t.common.untitled,
          icon: p.icon || '📝',
          section: t.overlay.commandPalette.recentPages,
        }))

      return [...recentItems, ...actions]
    }

    // 페이지 제목으로 클라이언트 필터링
    // Python으로 치면: filtered = [p for p in pages if q in p.title.lower()]
    const filteredPages: PaletteItem[] = pages
      .filter(p => (p.title || '').toLowerCase().includes(q))
      .slice(0, 10)
      .map(p => ({
        kind: 'page' as const,
        id: p.id,
        title: p.title || t.common.untitled,
        icon: p.icon || '📝',
        section: t.sidebar.allPages,
      }))

    // 액션 라벨로 필터링
    // Python으로 치면: filtered_actions = [a for a in actions if q in a.label.lower()]
    const filteredActions = actions.filter(
      a => a.kind === 'action' && (
        a.label.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q)
      )
    )

    return [...filteredPages, ...filteredActions]
  }, [query, pages, recentPageIds, actions, t.common.untitled, t.overlay.commandPalette.recentPages, t.sidebar.allPages])

  // ── 아이템 선택 인덱스 클램프: items 길이에 맞게 ──
  // Python으로 치면: self.selected_index = clamp(self.selected_index, 0, len(items)-1)
  useEffect(() => {
    setSelectedIndex(0)
    itemRefs.current = []
  }, [items.length])

  // ── 아이템 실행 ──
  // Python으로 치면: def run_item(item): if page → navigate; if action → item.run()
  const runItem = useCallback((item: PaletteItem) => {
    if (item.kind === 'page') {
      setCurrentPage(item.id)
      onClose()
    } else {
      item.run()
    }
  }, [setCurrentPage, onClose])

  // ── 키보드 탐색 처리 ──
  // ↑↓: 선택 인덱스 이동, Enter: 실행, Esc: 닫기
  // Python으로 치면: def on_key_press(key): ...
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => {
        const next = Math.min(prev + 1, items.length - 1)
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => {
        const next = Math.max(prev - 1, 0)
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
      return
    }
    if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault()
      runItem(items[selectedIndex])
    }
  }

  // ── 섹션 헤더 표시 여부 계산 ──
  // 동일 section의 첫 번째 항목에만 헤더 렌더
  // Python으로 치면: def should_show_section(i, items): return i == 0 or items[i-1].section != items[i].section
  function shouldShowSection(i: number): string | null {
    const item = items[i]
    const section = item.kind === 'page' ? item.section : t.overlay.commandPalette.actions
    const prevItem = items[i - 1]
    const prevSection = prevItem ? (prevItem.kind === 'page' ? prevItem.section : t.overlay.commandPalette.actions) : null
    if (section !== prevSection) return section
    return null
  }

  return (
    // ── 오버레이 배경 (클릭 시 닫기) ──
    // Python으로 치면: self.overlay.mousePressEvent = lambda: self.close()
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* ── 팔레트 박스 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">

        {/* ── 검색 입력창 ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          {/* 돋보기 아이콘 */}
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            placeholder={t.overlay.commandPalette.placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 outline-none text-base text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-transparent"
          />

          {/* Esc 힌트 */}
          <kbd className="text-xs text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 font-mono shrink-0">Esc</kbd>
        </div>

        {/* ── 결과 목록 ── */}
        <div className="max-h-[60vh] overflow-y-auto">

          {/* 결과 없음 */}
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              <span className="font-medium text-gray-600 dark:text-gray-300">&quot;{query}&quot;</span>{' '}{t.overlay.commandPalette.noResults}
            </div>
          )}

          {/* 아이템 목록 */}
          {items.map((item, i) => {
            const sectionLabel = shouldShowSection(i)
            const isSelected = i === selectedIndex

            return (
              <div key={item.id}>
                {/* 섹션 헤더 */}
                {sectionLabel && (
                  <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">
                    {sectionLabel}
                  </div>
                )}

                {/* 아이템 버튼 */}
                <button
                  ref={el => { itemRefs.current[i] = el }}
                  type="button"
                  onClick={() => runItem(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={
                    isSelected
                      ? "w-full text-left px-4 py-3 flex items-center gap-3 bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500"
                      : "w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                  }
                >
                  {/* 아이콘 */}
                  <span className="text-xl leading-none shrink-0">
                    {item.kind === 'page' ? item.icon : item.icon}
                  </span>

                  {/* 텍스트 영역 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {item.kind === 'page' ? item.title : item.label}
                    </div>
                    {item.kind === 'action' && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                        {item.desc}
                      </div>
                    )}
                  </div>

                  {/* 페이지 배지 */}
                  {item.kind === 'page' && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded px-1.5 py-0.5 shrink-0">
                      {t.overlay.commandPalette.recentPages}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* ── 하단 키 안내 ── */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
          <span>
            <kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 font-mono">↑↓</kbd> {t.overlay.commandPalette.move}
          </span>
          <span>
            <kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 font-mono">Enter</kbd> {t.overlay.commandPalette.run}
          </span>
          <span>
            <kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 font-mono">Esc</kbd> {t.common.close}
          </span>
          <span className="ml-auto">{items.length}{t.overlay.commandPalette.itemCount}</span>
        </div>

      </div>
    </div>
  )
}
