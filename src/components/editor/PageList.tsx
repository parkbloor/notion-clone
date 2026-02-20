// =============================================
// src/components/editor/PageList.tsx
// 역할: 가운데 패널 — 현재 카테고리의 페이지 목록
// Python으로 치면: class PageList(Widget): def render(self): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { Page } from '@/types/block'

// dnd-kit: 페이지 목록 정렬 + 카테고리로 드래그앤드롭
// useSortable: 목록 내 순서 변경 + 크로스 패널 드래그 모두 지원
// SortableContext: 목록 내 드래그 순서 변경을 위한 컨텍스트
// Python으로 치면: from dnd import Sortable, SortableContext
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'


// -----------------------------------------------
// 카테고리 이동 컨텍스트 메뉴 컴포넌트
// "..." 버튼 클릭 시 나타나는 드롭다운
// Python으로 치면: class ContextMenu(Widget): ...
// -----------------------------------------------
interface PageContextMenuProps {
  page: Page
  currentCategoryId: string | null  // 현재 보고있는 카테고리 (이 페이지의 카테고리가 아닐 수 있음)
  onClose: () => void
}

function PageContextMenu({ page, currentCategoryId: _currentCategoryId, onClose }: PageContextMenuProps) {
  const { categories, categoryMap, movePageToCategory, deletePage } = usePageStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // 메뉴 외부 클릭 시 닫기
  // Python으로 치면: document.addEventListener('click', close_if_outside)
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [onClose])

  // 이 페이지의 현재 카테고리
  const pageCategoryId = categoryMap[page.id] ?? null

  // 페이지를 특정 카테고리로 이동
  function handleMoveTo(targetCategoryId: string | null) {
    movePageToCategory(page.id, targetCategoryId)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 z-50 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
    >
      {/* 카테고리로 이동 섹션 */}
      <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">카테고리로 이동</div>

      {/* 미분류로 이동 (현재 카테고리가 있는 경우에만 표시) */}
      {pageCategoryId !== null && (
        <button
          onClick={() => handleMoveTo(null)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
        >
          <span>📋</span>
          <span>미분류</span>
        </button>
      )}

      {/* 카테고리 목록 */}
      {categories.map(cat => (
        // 현재 속한 카테고리는 체크 표시, 다른 카테고리는 이동 버튼
        <button
          key={cat.id}
          onClick={() => handleMoveTo(cat.id)}
          className={
            pageCategoryId === cat.id
              ? "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-blue-600 bg-blue-50"
              : "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
          }
        >
          <span>📁</span>
          <span className="truncate">{cat.name}</span>
          {/* 현재 카테고리 표시 체크 */}
          {pageCategoryId === cat.id && <span className="ml-auto text-blue-500 shrink-0">✓</span>}
        </button>
      ))}

      {/* 카테고리가 없을 때 안내 */}
      {categories.length === 0 && pageCategoryId === null && (
        <div className="px-3 py-1.5 text-xs text-gray-400">폴더가 없습니다</div>
      )}

      {/* 구분선 + 삭제 */}
      <div className="border-t border-gray-100 mt-1 pt-1">
        <button
          onClick={() => { deletePage(page.id); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-red-500 hover:bg-red-50"
        >
          <span>🗑️</span>
          <span>삭제</span>
        </button>
      </div>
    </div>
  )
}


// -----------------------------------------------
// 드래그 가능한 페이지 아이템 컴포넌트
// 드래그 핸들(⠿)로 카테고리 사이드바로 드래그앤드롭
// Python으로 치면: class DraggablePageItem(Widget): ...
// -----------------------------------------------
interface PageItemProps {
  page: Page
  isSelected: boolean
  currentCategoryId: string | null
  onSelect: () => void
}

function PageItem({ page, isSelected, currentCategoryId, onSelect }: PageItemProps) {
  // 컨텍스트 메뉴 표시 여부
  const [menuOpen, setMenuOpen] = useState(false)

  // dnd-kit sortable: 목록 내 순서 변경 + 카테고리 크로스 패널 드래그 모두 지원
  // useSortable은 useDraggable을 포함하므로 카테고리 드롭도 그대로 동작
  // Python으로 치면: sortable = Sortable(id=page.id, data={'type': 'page'})
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    data: { type: 'page', pageId: page.id },
  })

  const baseCls = "flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors"
  const selectedCls = baseCls + " bg-gray-200 text-gray-900"
  const normalCls = baseCls + " text-gray-600 hover:bg-gray-100"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="group relative flex items-center"
    >
      {/* 드래그 핸들 — hover 시만 표시 */}
      <span
        className="absolute left-0 shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs px-0.5 z-10"
        {...attributes}
        {...listeners}
        title="드래그로 폴더 이동"
      >
        ⠿
      </span>

      {/* 페이지 선택 버튼 */}
      <button
        onClick={onSelect}
        className={isSelected ? selectedCls : normalCls}
      >
        <span className="text-base shrink-0">{page.icon}</span>
        <span className="truncate">{page.title || '제목 없음'}</span>
      </button>

      {/* "..." 컨텍스트 메뉴 버튼 */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(prev => !prev) }}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all text-xs mr-1"
          title="옵션"
        >
          •••
        </button>

        {/* 컨텍스트 메뉴 드롭다운 */}
        {menuOpen && (
          <PageContextMenu
            page={page}
            currentCategoryId={currentCategoryId}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  )
}


// -----------------------------------------------
// PageList — 메인 컴포넌트
// -----------------------------------------------
export default function PageList() {

  const {
    pages,
    currentPageId,
    currentCategoryId,
    categoryMap,
    categories,
    setCurrentPage,
    addPage,
  } = usePageStore()

  // 검색어 상태
  // Python으로 치면: search_query = ''
  const [searchQuery, setSearchQuery] = useState('')

  // -----------------------------------------------
  // 현재 카테고리에 해당하는 페이지만 필터링
  // currentCategoryId가 null이면 전체보기 (모든 페이지)
  // Python으로 치면:
  //   if current_cat is None: return all_pages
  //   else: return [p for p in pages if categoryMap[p.id] == current_cat]
  // -----------------------------------------------
  const categoryPages = currentCategoryId === null
    ? pages  // 전체보기: 모든 페이지
    : pages.filter(p => (categoryMap[p.id] ?? null) === currentCategoryId)

  // 검색어 필터 추가 적용
  const filteredPages = searchQuery.trim()
    ? categoryPages.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : categoryPages

  // 현재 카테고리 이름 (헤더에 표시)
  // Python으로 치면: cat_name = cats[current_cat].name if current_cat else '전체보기'
  const currentCategoryName = currentCategoryId === null
    ? '전체보기'
    : categories.find(c => c.id === currentCategoryId)?.name ?? '전체보기'

  // 새 메모 추가 — 현재 보고있는 카테고리에 속하게 생성
  function handleAddPage() {
    addPage(undefined, currentCategoryId)
  }

  return (
    <aside className="w-60 h-screen bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">

      {/* ── 헤더: 현재 카테고리 이름 ──────────────── */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-sm font-semibold text-gray-700 truncate">{currentCategoryName}</h1>
      </div>

      {/* ── 검색바 ────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-md">
          <span className="text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="메모 검색..."
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

        {/* 메모 수 표시 */}
        <p className="px-2 py-1 text-xs text-gray-400 font-medium">
          {filteredPages.length}개의 메모
        </p>

        {/* 검색 결과 없을 때 안내 */}
        {filteredPages.length === 0 && (
          <p className="px-2 py-2 text-xs text-gray-400">
            {searchQuery ? '검색 결과 없음' : '메모가 없습니다'}
          </p>
        )}

        {/* 페이지 아이템 목록 — SortableContext로 목록 내 드래그 순서 변경 지원 */}
        {/* 외부 DndContext(page.tsx)를 그대로 사용, 별도 DndContext 불필요 */}
        {/* Python으로 치면: with SortableContext(items=page_ids): render_items() */}
        <SortableContext items={filteredPages.map(p => p.id)} strategy={verticalListSortingStrategy}>
          {filteredPages.map((page) => (
            <PageItem
              key={page.id}
              page={page}
              isSelected={currentPageId === page.id}
              currentCategoryId={currentCategoryId}
              onSelect={() => setCurrentPage(page.id)}
            />
          ))}
        </SortableContext>
      </nav>

      {/* ── 하단: 새 메모 버튼 ───────────────────── */}
      <div className="px-2 py-3 border-t border-gray-200">
        <button
          onClick={handleAddPage}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          <span>새 메모</span>
        </button>
      </div>

    </aside>
  )
}
