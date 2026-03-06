// =============================================
// src/components/editor/TabBar.tsx
// 역할: 크롬 스타일 탭 바 — 열린 페이지를 가로 탭으로 표시
// openTabs 배열 순서대로 렌더링, 활성 탭 강조, × 닫기, ⊞ 분할, Ctrl+W 단축키
// Python으로 치면: class TabBar: def render(self, open_tabs, current_page_id): ...
// =============================================

'use client'

import { useEffect, useRef } from 'react'
import { X, Columns2 } from 'lucide-react'
import { usePageStore } from '@/store/pageStore'

// -----------------------------------------------
// TabBar props: 분할 뷰 콜백 + 현재 분할 중인 탭 ID
// Python으로 치면: @dataclass class TabBarProps: on_split: Callable | None = None
// -----------------------------------------------
interface TabBarProps {
  onSplit?: (pageId: string) => void
  splitPageId?: string | null
}

export default function TabBar({ onSplit, splitPageId }: TabBarProps) {
  // -----------------------------------------------
  // 스토어에서 탭 관련 상태 + 액션 가져오기
  // Python으로 치면: open_tabs, current_id, pages, set_page, close_tab = store
  // -----------------------------------------------
  const { openTabs, currentPageId, pages, setCurrentPage, closeTab } = usePageStore()

  // 활성 탭을 가시 영역 안으로 자동 스크롤하기 위한 ref
  // Python으로 치면: self.active_tab_ref = None
  const activeTabRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // Ctrl+W 단축키 → 현재 활성 탭 닫기
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.ctrl and e.key == 'w': close_tab(current_page_id)
  // -----------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
        // input/textarea 안에서는 무시
        const tag = (e.target as HTMLElement).tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea') return
        e.preventDefault()
        if (currentPageId) closeTab(currentPageId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPageId, closeTab])

  // -----------------------------------------------
  // 활성 탭이 바뀔 때 탭 바 안에서 자동 스크롤
  // Python으로 치면: if active_tab: active_tab.scroll_into_view(inline='nearest')
  // -----------------------------------------------
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: 'nearest', behavior: 'smooth' })
  }, [currentPageId])

  // 탭이 없으면 렌더링 안 함
  if (openTabs.length === 0) return null

  return (
    // ── 탭 바 컨테이너 ──────────────────────────
    // overflow-x-auto: 탭이 많으면 가로 스크롤
    // shrink-0: 세로 flex 부모 안에서 높이 고정
    // border-b: 탭 바 아래 구분선
    // Python으로 치면: HBox(overflow='scroll', border_bottom=True)
    <div className="flex items-stretch overflow-x-auto shrink-0 border-b border-gray-200 bg-gray-50" style={{ scrollbarWidth: 'none' }}>

      {/* 탭 목록 렌더링 */}
      {/* Python으로 치면: for tab_id in open_tabs: render_tab(tab_id) */}
      {openTabs.map(tabId => {
        const page = pages.find(p => p.id === tabId)
        if (!page) return null
        const isActive = tabId === currentPageId
        // 이 탭이 현재 분할 뷰 오른쪽 패널에 표시 중인지
        // Python으로 치면: is_split = tab_id == split_page_id
        const isSplit = splitPageId === tabId

        return (
          <div
            key={tabId}
            ref={isActive ? activeTabRef : undefined}
            onClick={() => setCurrentPage(tabId)}
            title={page.title || '제목 없음'}
            className={[
              // 탭 공통 스타일
              'group flex items-center gap-1 px-3 py-2 min-w-25 max-w-45 cursor-pointer',
              'border-b-2 shrink-0 select-none transition-colors',
              // 활성/비활성 스타일 분기
              // Python으로 치면: 'active' if is_active else 'inactive'
              isActive
                ? 'border-blue-500 bg-white text-gray-800 shadow-sm'
                : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700',
            ].join(' ')}
          >
            {/* 페이지 아이콘 */}
            {/* Python으로 치면: icon = page.icon or '📄' */}
            <span className="text-sm shrink-0 leading-none">{page.icon || '📄'}</span>

            {/* 페이지 제목 — 넘치면 잘림 */}
            {/* Python으로 치면: title_label = QLabel(page.title); title_label.setElideRight(True) */}
            <span className="text-xs truncate flex-1 min-w-0">
              {page.title || '제목 없음'}
            </span>

            {/* ⊞ 분할 뷰 버튼 — hover 시 표시, 현재 분할 중이면 항상 파란색 표시 */}
            {/* Python으로 치면: split_btn.highlight = is_split */}
            {onSplit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSplit(tabId) }}
                title={isSplit ? '분할 뷰 닫기 (Ctrl+\\)' : '분할 뷰로 열기'}
                className={[
                  'shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all',
                  isSplit
                    ? 'opacity-100 text-blue-500 bg-blue-50'
                    : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                ].join(' ')}
              >
                <Columns2 size={10} />
              </button>
            )}

            {/* × 닫기 버튼 — hover 시 표시 (활성 탭은 항상 표시) */}
            {/* Python으로 치면: close_btn.show_on_hover() */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); closeTab(tabId) }}
              title="탭 닫기 (Ctrl+W)"
              className={[
                'shrink-0 w-4 h-4 flex items-center justify-center rounded',
                'hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all',
                // 활성 탭: 항상 표시 / 비활성 탭: hover 시만 표시
                isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
              ].join(' ')}
            >
              <X size={10} />
            </button>
          </div>
        )
      })}

      {/* 탭 오른쪽 빈 공간 (탭 우측을 채워 배경 통일) */}
      <div className="flex-1 border-b-2 border-transparent" />
    </div>
  )
}
