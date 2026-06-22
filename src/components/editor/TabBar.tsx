// =============================================
// src/components/editor/TabBar.tsx
// 역할: 크롬 스타일 탭 바 — 열린 페이지를 가로 탭으로 표시
// openTabs 배열 순서대로 렌더링, 활성 탭 강조, × 닫기, ⊞ 분할, Ctrl+W 단축키
// Python으로 치면: class TabBar: def render(self, open_tabs, current_page_id): ...
// =============================================

'use client'

import { useEffect, useRef } from 'react'
import { X, Columns2, Save, Check, Loader2 } from 'lucide-react'
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
  const { openTabs, currentPageId, pages, setCurrentPage, closeTab, savePageNow, saveStatus } = usePageStore()

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
  // Ctrl+S 단축키 → 현재 페이지 즉시 저장
  // Python으로 치면:
  //   def on_key_down(e):
  //       if e.ctrl and e.key == 's': save_page_now(current_page_id)
  // -----------------------------------------------
  useEffect(() => {
    function handleSaveKey(e: KeyboardEvent) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (currentPageId) savePageNow(currentPageId)
      }
    }
    window.addEventListener('keydown', handleSaveKey)
    return () => window.removeEventListener('keydown', handleSaveKey)
  }, [currentPageId, savePageNow])

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
    <div className="flex items-end overflow-x-auto shrink-0 px-2 pt-1.5 print-hide border-b hairline"
         style={{ background: "var(--color-bg)", scrollbarWidth: "none", minHeight: 40, whiteSpace: "nowrap" }}>

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
            className={["ds-tab group min-w-20 max-w-45 shrink-0 select-none", isActive ? "active" : ""].join(" ")}
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
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all"
                style={isSplit
                  ? { opacity: 1, color: "var(--color-accent)", background: "var(--color-accent-soft)" }
                  : { opacity: 0, color: "var(--color-text-muted)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text)" }}
                onMouseLeave={e => { if (!isSplit) { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)" } }}
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
              className="shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all"
              style={{ opacity: isActive ? 0.6 : 0, color: "var(--color-text-muted)" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.opacity = "1"; el.style.background = "var(--color-hover)"; el.style.color = "var(--color-text)" }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.opacity = isActive ? "0.6" : "0"; el.style.background = ""; el.style.color = "var(--color-text-muted)" }}
            >
              <X size={10} />
            </button>
          </div>
        )
      })}

      {/* 탭 오른쪽 빈 공간 */}
      <div className="flex-1" />

      {/* 저장 상태 표시 영역 */}
      {currentPageId && (
        <div className="shrink-0 flex items-center px-2 pb-1" style={{ fontSize: 11.5 }}>
          {saveStatus === 'saving' ? (
            <span className="flex items-center gap-1 select-none" style={{ color: "var(--color-accent)" }}>
              <Loader2 size={13} className="animate-spin" />
              <span>저장 중</span>
            </span>
          ) : saveStatus === 'unsaved' ? (
            <button
              type="button"
              onClick={() => savePageNow(currentPageId)}
              title="저장 (Ctrl+S)"
              className="flex items-center gap-1 transition-colors"
              style={{ color: "var(--color-warn)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--color-warn)" }} />
              <Save size={13} />
              <span>저장</span>
            </button>
          ) : (
            <span className="flex items-center gap-1 select-none" style={{ color: "var(--color-text-faint)" }}>
              <Check size={13} />
              <span>저장됨</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
