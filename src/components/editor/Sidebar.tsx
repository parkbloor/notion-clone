// =============================================
// src/components/editor/Sidebar.tsx
// 역할: 왼쪽 사이드바 — 페이지 목록·검색·삭제
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'

export default function Sidebar() {

  const { pages, currentPageId, setCurrentPage, addPage, deletePage } = usePageStore()

  // 검색어 상태
  // Python으로 치면: search_query = ''
  const [searchQuery, setSearchQuery] = useState('')

  // -----------------------------------------------
  // 검색어로 필터링된 페이지 목록
  // Python으로 치면: filtered = [p for p in pages if query in p.title.lower()]
  // -----------------------------------------------
  const filteredPages = searchQuery.trim()
    ? pages.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : pages

  // -----------------------------------------------
  // 페이지 삭제 — 확인 없이 즉시 삭제 (스토어가 빈 페이지 보호)
  // Python으로 치면: def on_delete(page_id): store.delete_page(page_id)
  // -----------------------------------------------
  function handleDelete(e: React.MouseEvent, pageId: string) {
    // 클릭 이벤트가 부모(페이지 선택 버튼)까지 전파되지 않게 차단
    e.stopPropagation()
    deletePage(pageId)
  }

  return (
    <aside className="w-60 h-screen bg-gray-50 border-r border-gray-200 flex flex-col">

      {/* ── 상단 헤더 ────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-sm font-semibold text-gray-700">내 노션</h1>
      </div>

      {/* ── 검색바 ────────────────────────────────
          페이지 제목을 실시간 필터링
          Python으로 치면: search_input.on_change = lambda q: set_query(q) */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-md">
          <span className="text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="페이지 검색..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
          />
          {/* 검색어 지우기 버튼 */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── 페이지 목록 ──────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 py-1 text-xs text-gray-400 font-medium">페이지</p>

        {/* 검색 결과가 없을 때 안내 문구 */}
        {filteredPages.length === 0 && (
          <p className="px-2 py-2 text-xs text-gray-400">일치하는 페이지 없음</p>
        )}

        {filteredPages.map((page) => (
          // -----------------------------------------------
          // group: hover 시 자식 요소(삭제 버튼)에 opacity 적용하기 위한 컨테이너
          // relative: 삭제 버튼의 absolute 기준점
          // Python으로 치면: HoverContainer(page_button + delete_button)
          // -----------------------------------------------
          <div key={page.id} className="group relative">
            <button
              onClick={() => setCurrentPage(page.id)}
              className={
                currentPageId === page.id
                  ? "w-full flex items-center gap-2 px-2 py-1.5 pr-8 rounded-md text-sm transition-colors text-left bg-gray-200 text-gray-900"
                  : "w-full flex items-center gap-2 px-2 py-1.5 pr-8 rounded-md text-sm transition-colors text-left text-gray-600 hover:bg-gray-100"
              }
            >
              <span className="text-base shrink-0">{page.icon}</span>
              <span className="truncate">{page.title || '제목 없음'}</span>
            </button>

            {/* ── 삭제 버튼 ────────────────────────────
                absolute right: 버튼 오른쪽에 겹침
                opacity-0 group-hover:opacity-100: hover 시에만 표시
                Python으로 치면: btn.visible = row.is_hovered */}
            <button
              type="button"
              onClick={(e) => handleDelete(e, page.id)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
              title="페이지 삭제"
            >
              🗑️
            </button>
          </div>
        ))}
      </nav>

      {/* ── 하단 새 페이지 버튼 ──────────────────── */}
      <div className="px-2 py-3 border-t border-gray-200">
        <button
          onClick={() => addPage()}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <span className="text-lg">+</span>
          <span>새 페이지</span>
        </button>
      </div>

    </aside>
  )
}
