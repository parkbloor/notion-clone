// =============================================
// src/components/editor/PageList.tsx
// 역할: 가운데 패널 — 현재 카테고리의 페이지 목록 + 전문 검색
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
// HTML 태그 제거 — 순수 텍스트 추출
// Python으로 치면: def strip_html(html): return re.sub(r'<[^>]+>', ' ', html).strip()
// -----------------------------------------------
function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// -----------------------------------------------
// 페이지의 모든 블록 내용을 하나의 텍스트로 합치기
// 이미지 블록 제외, 토글 블록은 header+body 모두 추출
// Python으로 치면: def get_page_text(page): return ' '.join(block.text for block in page.blocks)
// -----------------------------------------------
function getPageSearchText(page: Page): string {
  const texts = page.blocks.map(block => {
    if (block.type === 'image') return ''
    if (block.type === 'toggle') {
      try {
        const parsed = JSON.parse(block.content)
        return stripHtml(parsed.header || '') + ' ' + stripHtml(parsed.body || '')
      } catch { return '' }
    }
    return stripHtml(block.content)
  })
  return texts.join(' ')
}

// -----------------------------------------------
// 검색어가 처음 등장하는 블록의 주변 텍스트를 스니펫으로 반환
// Python으로 치면: def get_snippet(page, query): idx = ...; return text[idx-15:idx+50]
// -----------------------------------------------
function getSnippet(page: Page, query: string): string {
  const q = query.toLowerCase()
  for (const block of page.blocks) {
    if (block.type === 'image') continue
    let text = ''
    if (block.type === 'toggle') {
      try {
        const parsed = JSON.parse(block.content)
        text = stripHtml(parsed.header || '') + ' ' + stripHtml(parsed.body || '')
      } catch { continue }
    } else {
      text = stripHtml(block.content)
    }
    const idx = text.toLowerCase().indexOf(q)
    if (idx !== -1) {
      const start = Math.max(0, idx - 15)
      const end = Math.min(text.length, idx + query.length + 45)
      const snippet = text.slice(start, end).trim()
      return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '')
    }
  }
  return ''
}

// -----------------------------------------------
// 제목 텍스트에서 검색어 부분을 노란 배경으로 강조
// Python으로 치면: def highlight(text, query): return text[:idx] + <mark> + ... + </mark> + ...
// -----------------------------------------------
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-200 rounded-sm">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}


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
  const { categories, categoryMap, movePageToCategory, deletePage, duplicatePage } = usePageStore()
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

      {/* 구분선 + 복제 + 삭제 */}
      <div className="border-t border-gray-100 mt-1 pt-1">
        {/* 복제: 현재 페이지 포함 블록 전체 복사 후 바로 아래에 삽입 */}
        {/* Python으로 치면: duplicate_page(page.id) */}
        <button
          onClick={() => { duplicatePage(page.id); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
        >
          <span>📋</span>
          <span>복제</span>
        </button>
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
// 검색 중: snippet + categoryName 표시 / 검색어 하이라이트
// Python으로 치면: class DraggablePageItem(Widget): ...
// -----------------------------------------------
interface PageItemProps {
  page: Page
  isSelected: boolean
  currentCategoryId: string | null
  onSelect: () => void
  // 검색 관련 (검색 중일 때만 전달)
  // Python으로 치면: search_query: str = '', snippet: str = '', category_name: str | None = None
  searchQuery?: string
  snippet?: string
  categoryName?: string | null
}

function PageItem({ page, isSelected, currentCategoryId, onSelect, searchQuery, snippet, categoryName }: PageItemProps) {
  // 컨텍스트 메뉴 표시 여부
  const [menuOpen, setMenuOpen] = useState(false)
  // 즐겨찾기 토글 액션
  const { togglePageStar } = usePageStore()

  // dnd-kit sortable: 목록 내 순서 변경 + 카테고리 크로스 패널 드래그 모두 지원
  // useSortable은 useDraggable을 포함하므로 카테고리 드롭도 그대로 동작
  // Python으로 치면: sortable = Sortable(id=page.id, data={'type': 'page'})
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    data: { type: 'page', pageId: page.id },
  })

  // 검색 중 여부
  // Python으로 치면: is_searching = bool(search_query)
  const isSearching = Boolean(searchQuery)

  const baseCls = "flex-1 min-w-0 flex items-start gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors"
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
        <span className="text-base shrink-0 mt-0.5">{page.icon}</span>

        {/* 제목 + 검색 결과 정보 */}
        <div className="min-w-0 flex-1">

          {/* 제목 행: 제목 + 카테고리 배지 (검색 중일 때) */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="truncate">
              {/* 검색 중이면 매칭 부분 노란 하이라이트 */}
              {isSearching && searchQuery
                ? <HighlightText text={page.title || '제목 없음'} query={searchQuery} />
                : (page.title || '제목 없음')
              }
            </span>
            {/* 카테고리 배지 — 검색 결과에서만 표시 */}
            {/* Python으로 치면: if is_searching and category_name: render_badge() */}
            {isSearching && categoryName && (
              <span className="shrink-0 text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                {categoryName}
              </span>
            )}
          </div>

          {/* 스니펫 — 블록 내용에서 매칭된 텍스트 미리보기 */}
          {/* Python으로 치면: if snippet: render_snippet() */}
          {isSearching && snippet && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-tight">
              {snippet}
            </p>
          )}

          {/* 태그 칩 목록 — 태그가 있을 때 항상 표시 */}
          {/* Python으로 치면: if page.tags: render_tag_chips() */}
          {(page.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(page.tags ?? []).map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0 text-xs rounded-full bg-gray-100 text-gray-400"
                >
                  <span>#</span>{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* ── 오른쪽 액션 버튼들 ─────────────────── */}
      <div className="flex items-center shrink-0">

        {/* 즐겨찾기 별 버튼 — starred이면 항상 표시, 아니면 hover 시만 */}
        {/* Python으로 치면: star_btn.visible = page.starred or hovered */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePageStar(page.id) }}
          className={page.starred
            ? "flex items-center justify-center w-6 h-6 rounded text-yellow-400 hover:text-yellow-500 hover:bg-yellow-50 transition-all text-sm"
            : "opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-300 hover:text-yellow-400 hover:bg-yellow-50 transition-all text-sm"}
          title={page.starred ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        >
          {page.starred ? '★' : '☆'}
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
        {/* ── 오른쪽 액션 버튼들 닫기 ── */}
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

  // 활성 태그 필터 (null = 필터 없음)
  // Python으로 치면: active_tag_filter: str | None = None
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)

  // 검색 입력창 DOM 참조 (포커스 제어용)
  // Python으로 치면: search_input_ref = None
  const searchInputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------
  // 현재 카테고리에 해당하는 페이지만 필터링 (검색 없을 때)
  // currentCategoryId가 null이면 전체보기 (모든 페이지)
  // Python으로 치면:
  //   if current_cat is None: return all_pages
  //   else: return [p for p in pages if categoryMap[p.id] == current_cat]
  // -----------------------------------------------
  const categoryPages = currentCategoryId === null
    ? pages
    : pages.filter(p => (categoryMap[p.id] ?? null) === currentCategoryId)

  // -----------------------------------------------
  // 검색어·태그 필터 순서로 페이지 목록 좁히기
  // 1) 검색어 있음 → 전체 pages 전문 검색
  //    없음 → 카테고리 필터 결과(categoryPages)
  // 2) activeTagFilter 있음 → 태그로 추가 필터링
  // Python으로 치면:
  //   base = search(all_pages, query) if query else category_pages
  //   if tag: base = [p for p in base if tag in (p.tags or [])]
  // -----------------------------------------------
  const filteredPages = (() => {
    let base = searchQuery.trim()
      ? pages.filter(p => {
          const q = searchQuery.toLowerCase()
          if (p.title.toLowerCase().includes(q)) return true
          return getPageSearchText(p).toLowerCase().includes(q)
        })
      : categoryPages
    if (activeTagFilter) {
      base = base.filter(p => (p.tags ?? []).includes(activeTagFilter))
    }
    // 검색·태그 필터가 없을 때만 즐겨찾기 상단 정렬
    // 검색 중에는 관련도 순서 유지 (정렬 안 함)
    // Python으로 치면: if not query and not tag: base.sort(key=lambda p: not p.starred)
    if (!searchQuery.trim() && !activeTagFilter) {
      base = [...base.filter(p => p.starred), ...base.filter(p => !p.starred)]
    }
    return base
  })()

  // -----------------------------------------------
  // 현재 뷰(categoryPages)에 존재하는 모든 고유 태그 수집
  // 태그 필터 칩 표시용
  // Python으로 치면: all_tags = sorted(set(tag for p in category_pages for tag in p.tags))
  // -----------------------------------------------
  const allTagsInView = Array.from(
    new Set(categoryPages.flatMap(p => p.tags ?? []))
  )

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
        <h1 className="text-sm font-semibold text-gray-700 truncate">
          {/* 검색 중이면 "검색 결과" 표시 */}
          {/* Python으로 치면: header = '검색 결과' if search_query else cat_name */}
          {searchQuery.trim() ? `검색 결과 (${filteredPages.length})` : currentCategoryName}
        </h1>
      </div>

      {/* ── 검색바 ────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-md focus-within:border-blue-400 transition-colors">
          <span className="text-gray-400 text-sm shrink-0">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Escape → 검색 초기화
              // Python으로 치면: if event.key == 'Escape': search_query = ''
              if (e.key === 'Escape') {
                setSearchQuery('')
                searchInputRef.current?.blur()
              }
            }}
            placeholder="전체 메모 검색..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
          />
          {/* 검색어 지우기 버튼 */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
              className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
              title="검색 지우기"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── 태그 필터 바 (태그가 하나라도 있을 때만 표시) ───
          각 태그를 클릭 가능한 칩으로 표시
          활성 태그: 파란색, 비활성 태그: 회색
          Python으로 치면: if all_tags: render_tag_filters() */}
      {allTagsInView.length > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-100 flex flex-wrap gap-1">
          {allTagsInView.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTagFilter(prev => prev === tag ? null : tag)}
              className={activeTagFilter === tag
                ? "inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium transition-colors"
                : "inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"}
              title={activeTagFilter === tag ? '태그 필터 해제' : `#${tag} 로 필터`}
            >
              <span className={activeTagFilter === tag ? "text-blue-400" : "text-gray-400"}>#</span>
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── 페이지 목록 ──────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">

        {/* 검색 결과 없을 때 안내 */}
        {filteredPages.length === 0 && (
          <div className="px-2 py-4 text-center">
            <p className="text-sm text-gray-400">
              {searchQuery.trim() ? `"${searchQuery}"` : ''}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {searchQuery.trim() ? '검색 결과가 없습니다' : '메모가 없습니다'}
            </p>
          </div>
        )}

        {/* 페이지 아이템 목록 — SortableContext로 목록 내 드래그 순서 변경 지원 */}
        {/* 외부 DndContext(page.tsx)를 그대로 사용, 별도 DndContext 불필요 */}
        {/* Python으로 치면: with SortableContext(items=page_ids): render_items() */}
        <SortableContext items={filteredPages.map(p => p.id)} strategy={verticalListSortingStrategy}>
          {filteredPages.map((page) => {
            // 검색 중이면 각 페이지의 스니펫과 카테고리 이름 계산
            // Python으로 치면: snippet, cat_name = compute_search_info(page, query) if query else ('', None)
            const snippet = searchQuery.trim() ? getSnippet(page, searchQuery) : ''
            const catId = categoryMap[page.id] ?? null
            const catName = searchQuery.trim()
              ? (catId ? (categories.find(c => c.id === catId)?.name ?? null) : '미분류')
              : null

            return (
              <PageItem
                key={page.id}
                page={page}
                isSelected={currentPageId === page.id}
                currentCategoryId={currentCategoryId}
                onSelect={() => setCurrentPage(page.id)}
                searchQuery={searchQuery.trim() || undefined}
                snippet={snippet || undefined}
                categoryName={catName}
              />
            )
          })}
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
