// =============================================
// src/components/editor/CategorySidebar.tsx
// 역할: 통합 파일 사이드바 — 폴더 트리 + 페이지 인라인 (옵시디언 스타일)
// 기존 CategorySidebar + PageList 통합 버전
// - 마우스 드래그로 너비 조절 + 접기/펼치기
// - 폴더 행 클릭 → 하위 페이지 인라인 표시
// - 검색바, 캘린더, 최근 파일 포함
// Python으로 치면: class UnifiedFileSidebar(Widget): ...
// =============================================

'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useLocale } from '@/locales'
import { Category, Page } from '@/types/block'
import CalendarWidget from './CalendarWidget'
import PeriodicNotesPanel from './PeriodicNotesPanel'
import NewPageDialog from './NewPageDialog'
import { GUIDE_COLORS, getPageSearchText } from '@/components/sidebar/sidebarUtils'
import { SortableCategoryRow, DroppableCategoryRow, CollapsedFolderIcon } from '@/components/sidebar/CategoryRow'
import DraggablePageRow from '@/components/sidebar/DraggablePageRow'

// dnd-kit: 폴더 정렬 + 페이지→폴더 드래그 이동
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
// 테이블 뷰 아이콘
import { Table2, ChevronsDown, ChevronsUp, GitFork } from 'lucide-react'


// -----------------------------------------------
// 주기적 노트 상수 — 컴포넌트 밖에 정의해 매 렌더마다 재생성 방지
// Python으로 치면: PERIODIC_CAT_NAMES: frozenset = frozenset([...])
// -----------------------------------------------
const PERIODIC_CAT_NAMES = new Set([
  '📅 일간 노트', '📆 주간 노트', '🗓️ 월간 노트', '📊 분기 노트', '🌟 연간 노트',
])
const PERIODIC_PAGE_PREFIXES = ['일간 노트 ', '주간 노트 ', '월간 노트 ', '분기 노트 ', '연간 노트 ']

// -----------------------------------------------
// 사이드바 props 인터페이스
// PageList가 받던 props를 통합
// Python으로 치면: @dataclass class SidebarProps: ...
// -----------------------------------------------
export interface CategorySidebarProps {
  // 설정 모달 열기 콜백 (PageList에서 받던 것)
  onOpenSettings?: () => void
  // 모바일에서 페이지 선택 시 드로어 닫기 콜백
  onCloseMobile?: () => void
  // 데이터베이스 테이블 뷰 활성 여부
  dbViewActive?: boolean
  // 데이터베이스 테이블 뷰 토글 콜백
  onToggleDbView?: () => void
  // 분할 뷰: Ctrl+클릭 시 오른쪽 패널에 열기
  // Python으로 치면: def on_split_page(self, page_id): ...
  onSplitPage?: (pageId: string) => void
  // 그래프 뷰 오버레이 열기 콜백
  // Python으로 치면: def on_open_graph(self): ...
  onOpenGraphView?: () => void
  // 휴지통 패널 열기 콜백
  onOpenTrash?: () => void
}


// -----------------------------------------------
// CategorySidebar (통합 파일 사이드바) — 메인 컴포넌트
// -----------------------------------------------
export default function CategorySidebar({
  onOpenSettings, onCloseMobile, dbViewActive, onToggleDbView, onSplitPage, onOpenGraphView, onOpenTrash,
}: CategorySidebarProps) {

  // ── 페이지 스토어 ────────────────────────────
  const {
    categories,
    pages,
    currentPageId,
    currentCategoryId,
    categoryMap,
    categoryOrder,
    categoryChildOrder,
    recentPageIds,
    setCurrentPage,
    setCurrentCategory,
    addPage,
    addCategory,
    renameCategory,
    deleteCategory,
    deletePage,
    duplicatePage,
    pushRecentPage,
    updateCategoryColor,
    currentVaultName,
  } = usePageStore()

  // ── 설정 스토어 ─────────────────────────────
  const {
    plugins,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
  } = useSettingsStore()

  // 번역 훅
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // ── 컴포넌트 상태 ────────────────────────────
  // 펼쳐진 폴더 ID 집합 — localStorage에서 복원, 변경 시 자동 저장
  // Python으로 치면: expanded_folder_ids: set[str] = load_from_storage()
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())

  // 마운트 시 localStorage에서 복원 (typeof window 체크 없이 useEffect로 안전하게)
  // Python으로 치면: def on_mount(self): self.expanded = storage.load('expanded_folders')
  useEffect(() => {
    try {
      const raw = localStorage.getItem('notion-clone-expanded-folders')
      if (raw) setExpandedFolderIds(new Set(JSON.parse(raw) as string[]))
    } catch {}
  }, [])

  // expandedFolderIds 변경 시 localStorage에 저장
  // Python으로 치면: def on_expanded_change(self): storage.save('expanded_folders', list(self.expanded))
  useEffect(() => {
    try {
      localStorage.setItem('notion-clone-expanded-folders', JSON.stringify([...expandedFolderIds]))
    } catch {}
  }, [expandedFolderIds])

  // 검색어 — 입력 시 전체 페이지 전문 검색
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 캘린더 날짜 필터 (YYYY-MM-DD 또는 null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 태그 필터 — 선택된 태그 집합 (비어있으면 필터 없음)
  // Python으로 치면: selected_tags: set[str] = set()
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())

  // 최상위 폴더 추가 인풋
  const [isAddingTopFolder, setIsAddingTopFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // 하위 폴더 추가 인풋
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null)
  const [childFolderName, setChildFolderName] = useState('')

  // 특정 폴더에 페이지 인라인 추가 (폴더 행의 📄 버튼)
  // Python으로 치면: adding_page_in_cat: str | None = None
  const [addingPageInCat, setAddingPageInCat] = useState<string | null>(null)
  const [newPageName, setNewPageName] = useState('')

  // 폴더 삭제 오류 메시지 (잠시 표시 후 자동 사라짐)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 새 페이지 다이얼로그 (템플릿 선택 포함)
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false)

  // 사이드바 상단 탭: 노트 / 계획
  // Python으로 치면: self.sidebar_tab = 'notes'
  const [sidebarTab, setSidebarTab] = useState<'notes' | 'plan'>('notes')

  // SSR hydration 안전 마운트 플래그 (최근 파일 섹션용)
  // Python으로 치면: self.mounted = False; def on_mount(self): self.mounted = True
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ── 리사이즈 핸들 ────────────────────────────
  // 사이드바 오른쪽 가장자리를 드래그하여 너비 조절
  // Python으로 치면: def on_resize_start(event): ...
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(160, Math.min(480, startWidth + (ev.clientX - startX)))
      setSidebarWidth(newWidth)
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // ── "전체보기" 드롭 대상 (미분류로 페이지 이동) ──
  const { setNodeRef: setAllRef, isOver: isOverAll } = useDroppable({
    id: 'uncategorized',
    data: { type: 'category', categoryId: null },
  })

  // ── category id → Category 오브젝트 빠른 조회용 맵 ─────────────
  // renderFolder에서 categories.find(O(n)) 대신 O(1) 접근
  // Python으로 치면: category_by_id = {c.id: c for c in categories}
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c])) as Record<string, Category>,
    [categories]
  )

  // ── 모든 페이지의 태그 + 페이지 수 집계 (페이지 수 내림차순) ───────
  // Python으로 치면: all_tags = sorted({t: count for p in pages for t in p.tags}.items(), key=lambda x: -x[1])
  const allTagsWithCount = useMemo(() => {
    const countMap: Record<string, number> = {}
    for (const page of pages) {
      for (const tag of page.tags ?? []) {
        countMap[tag] = (countMap[tag] ?? 0) + 1
      }
    }
    return Object.entries(countMap).sort((a, b) => b[1] - a[1])
  }, [pages])

  // 즐겨찾기 페이지 목록 — 매 렌더마다 이중 filter 방지
  // Python으로 치면: starred_pages = [p for p in pages if p.starred]
  const starredPages = useMemo(() => pages.filter(p => p.starred), [pages])

  // 태그 브라우저 섹션 접힘 상태 (기본값 열림)
  // Python으로 치면: self.tag_section_open = True
  const [tagSectionOpen, setTagSectionOpen] = useState(true)

  // ── 검색 결과 ────────────────────────────────
  // 검색어가 있을 때만 전체 페이지 필터링 (null이면 검색 모드 아님)
  // Python으로 치면: filtered = None if not query else [p for p in pages if ...]
  const filteredSearchPages = searchQuery.trim()
    ? pages.filter(p => {
        const q = searchQuery.toLowerCase()
        if (selectedDate) {
          // 날짜 필터와 검색 조합 지원
          // createdAt은 ISO 문자열 — 앞 10자리가 YYYY-MM-DD
          const dateStr = String(p.createdAt || '').slice(0, 10)
          if (dateStr !== selectedDate) return false
        }
        return p.title.toLowerCase().includes(q) || getPageSearchText(p).toLowerCase().includes(q)
      })
    : selectedDate
      // 날짜만 필터링 (검색어 없을 때)
      ? pages.filter(p => {
          // createdAt은 ISO 문자열 — 앞 10자리가 YYYY-MM-DD
          const dateStr = String(p.createdAt || '').slice(0, 10)
          return dateStr === selectedDate
        })
      : null

  // ── 주기적 노트 제목 판별 (모듈 상수 PERIODIC_PAGE_PREFIXES 사용) ──
  // Python으로 치면: is_periodic = lambda t: any(t.startswith(p) for p in PERIODIC_PAGE_PREFIXES)
  const isPeriodicNote = (title: string) => PERIODIC_PAGE_PREFIXES.some(p => title.startsWith(p))

  // ── 태그 필터 적용 ────────────────────────────
  // selectedTags가 있으면 검색/날짜 결과(또는 전체)에 추가 필터 적용 (OR 조건: 어느 한 태그라도 포함)
  // 주기적 노트는 결과에서 제외 (계획 탭 전용)
  // Python으로 치면: if selected_tags: base = [p for p in base if any(t in p.tags for t in selected_tags)]
  const displayPages: Page[] | null = selectedTags.size > 0
    ? (filteredSearchPages ?? pages)
        .filter(p => !isPeriodicNote(p.title))
        .filter(p => [...selectedTags].some(tag => (p.tags ?? []).includes(tag)))
    : filteredSearchPages?.filter(p => !isPeriodicNote(p.title)) ?? null

  // 검색/날짜/태그 필터 활성 여부
  const isFiltering = displayPages !== null

  // ── 폴더 내 페이지 목록 헬퍼 ──────────────────
  // 특정 카테고리에 속하는 페이지 반환
  // Python으로 치면: def pages_in_cat(cat_id): return [p for p in pages if category_map[p.id] == cat_id]
  function getPagesInCat(catId: string | null): Page[] {
    return pages.filter(p => (categoryMap[p.id] ?? null) === catId)
  }

  // ── 폴더 펼침/접힘 토글 ────────────────────────
  function toggleFolder(catId: string) {
    setExpandedFolderIds(prev => {
      const next = new Set(prev)
      if (next.has(catId)) { next.delete(catId) } else { next.add(catId) }
      return next
    })
  }

  // ── 전체 폴더 펼치기/접기 ───────────────────────
  // Python으로 치면: def expand_all(): expanded = set(all_cat_ids)
  function expandAllFolders() {
    setExpandedFolderIds(new Set(categories.map(c => c.id)))
  }
  // Python으로 치면: def collapse_all(): expanded = set()
  function collapseAllFolders() {
    setExpandedFolderIds(new Set())
  }

  // ── 폴더 삭제 처리 ──────────────────────────
  async function handleDeleteFolder(categoryId: string) {
    const result = await deleteCategory(categoryId)
    if (result.hasChildren) {
      setDeleteError(`하위 폴더가 ${result.count}개 있습니다. 먼저 하위 폴더를 삭제해주세요.`)
      setTimeout(() => setDeleteError(null), 4000)
    } else if (result.hasPages) {
      setDeleteError(`메모가 ${result.count}개 있습니다. 먼저 메모를 이동하거나 삭제해주세요.`)
      setTimeout(() => setDeleteError(null), 4000)
    }
  }

  // ── 최상위 폴더 추가 완료 ───────────────────
  function handleAddTopFolder() {
    const name = newFolderName.trim()
    if (name) { addCategory(name, null); setNewFolderName(''); setIsAddingTopFolder(false) }
  }

  // ── 하위 폴더 추가 시작 ─────────────────────
  function startAddChildFolder(parentId: string) {
    setAddingChildOf(parentId)
    setChildFolderName('')
    setExpandedFolderIds(prev => new Set([...prev, parentId]))
  }

  // ── 하위 폴더 추가 완료 ─────────────────────
  function handleAddChildFolder(parentId: string) {
    const name = childFolderName.trim()
    if (name) {
      addCategory(name, parentId)
      setExpandedFolderIds(prev => new Set([...prev, parentId]))
      setChildFolderName('')
      setAddingChildOf(null)
    }
  }

  // ── 폴더에 페이지 추가 시작 (폴더 펼치기 + 인라인 인풋 표시) ────────
  // 폴더 행의 📄 버튼 클릭 시: 해당 폴더 펼치기 → 인라인 입력창 열기
  // Python으로 치면: def start_add_page_in_cat(cat_id): ...
  function startAddPageInCat(catId: string) {
    setExpandedFolderIds(prev => new Set([...prev, catId]))
    setAddingPageInCat(catId)
    setNewPageName('')
  }

  // ── 폴더에 페이지 인라인 추가 완료 ─────────
  function handleAddPageInCat(catId: string) {
    const name = newPageName.trim()
    if (name) {
      addPage(name, catId)
    }
    setAddingPageInCat(null)
    setNewPageName('')
  }

  // ── 페이지 선택 핸들러 ───────────────────────
  function handleSelectPage(pageId: string) {
    setCurrentPage(pageId)
    pushRecentPage(pageId)
    onCloseMobile?.()
  }

  // -----------------------------------------------
  // 폴더 트리 재귀 렌더링
  // depth=0: SortableCategoryRow (순서 변경 가능)
  // depth>0: DroppableCategoryRow (드롭만 가능)
  // 폴더 펼쳐지면 → 하위 페이지 + 하위 폴더 순서로 표시
  // Python으로 치면: def render_folder(cat_id, depth=0): ...
  // -----------------------------------------------
  function renderFolder(catId: string, depth: number): React.ReactNode {
    const cat = categoryById[catId]
    if (!cat) return null

    const childFolderIds = categoryChildOrder[catId] ?? []
    const pagesInCat = getPagesInCat(catId)
    // 하위 폴더 또는 페이지가 있으면 펼치기 가능
    // Python으로 치면: has_children = bool(child_folder_ids or pages_in_cat)
    const hasChildren = childFolderIds.length > 0 || pagesInCat.length > 0
    const isExpanded = expandedFolderIds.has(catId)
    const isSelected = currentCategoryId === catId

    const RowComponent = depth === 0 ? SortableCategoryRow : DroppableCategoryRow

    return (
      <div key={catId}>
        <RowComponent
          category={cat}
          depth={depth}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          isSelected={isSelected}
          collapsed={sidebarCollapsed}
          pageCount={pagesInCat.length}
          onToggleExpand={() => toggleFolder(catId)}
          // 폴더 클릭 시 선택 + 펼치기/접기 토글 (옵시디언 스타일)
          onSelect={() => { setCurrentCategory(catId); setSearchQuery(''); setSelectedDate(null); toggleFolder(catId) }}
          onRename={(name) => renameCategory(catId, name)}
          onDelete={() => handleDeleteFolder(catId)}
          onAddChild={() => startAddChildFolder(catId)}
          onAddPage={() => startAddPageInCat(catId)}
          onColorChange={(color) => updateCategoryColor(catId, color)}
        />

        {/* 하위 폴더 추가 인풋 */}
        {addingChildOf === catId && !sidebarCollapsed && (
          <div
            className="flex gap-1 py-1 pr-1"
            style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
          >
            <input
              autoFocus value={childFolderName}
              onChange={(e) => setChildFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChildFolder(catId)
                if (e.key === 'Escape') { setAddingChildOf(null); setChildFolderName('') }
              }}
              onBlur={() => { if (!childFolderName.trim()) setAddingChildOf(null) }}
              placeholder={t.sidebar.subfolderPlaceholder}
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded outline-none"
            />
            <button
              onClick={() => handleAddChildFolder(catId)}
              className="px-1.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
            >
              {t.common.confirm}
            </button>
          </div>
        )}

        {/* 펼침 상태: 이 폴더의 페이지 (인라인) + 하위 폴더 (재귀) */}
        {/* Python으로 치면: if is_expanded: render pages then child folders */}
        {isExpanded && !sidebarCollapsed && (
          // ── 자식 영역 래퍼 ─────────────────────────────────
          // position: relative → 트리 가이드 라인(absolute)의 기준점
          // Python으로 치면: children_area = RelativeDiv(guide_line + children)
          <div className="relative">

            {/* 트리 가이드 라인 — 이 폴더의 자식 범위를 수직선으로 시각화
                left = depth * 12 + 6: 이 depth 인덴트 단위의 중앙 (12px step 기준)
                depth 0 → 6px, depth 1 → 18px, depth 2 → 30px
                커스텀 색상이 있으면 해당 색(반투명), 없으면 depth 기본색
                Python으로 치면: guide = AbsDiv(left=depth*12+6, w=2px, h=100%) */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none rounded-full"
              style={{
                left: `${depth * 12 + 6}px`,
                width: '2px',
                backgroundColor: cat.color
                  ? cat.color + 'aa'  // 커스텀 색상 ~67% 투명도
                  : GUIDE_COLORS[Math.min(depth, 3)],
              }}
            />

            {/* 폴더 내 페이지 인라인 표시 — SortableContext로 감싸 드래그 순서 변경 지원 */}
            {/* Python으로 치면: with SortableContext(page_ids): render_pages() */}
            <SortableContext items={pagesInCat.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {pagesInCat.map(page => (
                <DraggablePageRow
                  key={page.id}
                  page={page}
                  depth={depth + 1}
                  isSelected={currentPageId === page.id}
                  collapsed={false}
                  onSelect={() => handleSelectPage(page.id)}
                  onDelete={() => deletePage(page.id)}
                  onDuplicate={() => duplicatePage(page.id)}
                  onSplitPage={() => onSplitPage?.(page.id)}
                />
              ))}
            </SortableContext>
            {/* 폴더에 페이지 인라인 추가 인풋 */}
            {addingPageInCat === catId && (
              <div
                className="flex gap-1 py-1 pr-1"
                style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
              >
                <input
                  autoFocus value={newPageName}
                  onChange={(e) => setNewPageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPageInCat(catId)
                    if (e.key === 'Escape') { setAddingPageInCat(null); setNewPageName('') }
                  }}
                  onBlur={() => { if (!newPageName.trim()) setAddingPageInCat(null) }}
                  placeholder={t.sidebar.newNote + '...'}
                  className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded outline-none"
                />
                <button
                  onClick={() => handleAddPageInCat(catId)}
                  className="px-1.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
                >
                  {t.common.confirm}
                </button>
              </div>
            )}
            {/* 하위 폴더들 (재귀) — SortableContext로 감싸서 같은 부모 내 순서 변경 지원 */}
            {/* Python으로 치면: child_sortable_ctx = SortableContext(child_folder_ids) */}
            {childFolderIds.length > 0 && (
              <SortableContext items={childFolderIds} strategy={verticalListSortingStrategy}>
                {childFolderIds.map(childId => renderFolder(childId, depth + 1))}
              </SortableContext>
            )}
          </div>
        )}
      </div>
    )
  }

  // 최상위 폴더 순서대로 정렬 — 주기적 노트 카테고리 제외 (계획 탭에서 관리)
  // categoryById O(1) 조회 사용 (categories.find O(n) 제거)
  // Python으로 치면: [cat_by_id[id] for id in order if id in cat_by_id and cat.name not in PERIODIC]
  const orderedTopFolders = useMemo(() =>
    categoryOrder
      .map(id => categoryById[id])
      .filter((cat): cat is Category => !!cat && !PERIODIC_CAT_NAMES.has(cat.name)),
    [categoryOrder, categoryById]
  )

  // 미분류 페이지 (categoryId가 null) — 주기적 노트 페이지 제외
  // isPeriodicNote(L245)과 동일 함수이므로 재사용
  // Python으로 치면: [p for p in uncategorized if not is_periodic(p.title)]
  const uncategorizedPages = getPagesInCat(null).filter(p => !isPeriodicNote(p.title))

  // ── 접힘 모드 렌더링 ────────────────────────────
  if (sidebarCollapsed) {
    return (
      <aside className="w-12 h-screen bg-[#ede9e4] dark:bg-[#1e1e1e] flex flex-col shrink-0 transition-[width] duration-200">
        {/* 헤더: 펼치기 버튼 */}
        <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={toggleSidebarCollapsed}
            title={t.sidebar.expandSidebar}
            className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-sm font-bold"
          >
            ›
          </button>
        </div>

        {/* 전체보기 아이콘 */}
        <div className="px-1.5 py-2">
          <div ref={setAllRef}>
            <button
              onClick={() => setCurrentCategory(null)}
              title={t.sidebar.allPages}
              className={isOverAll ? "w-full flex items-center justify-center py-2 rounded-md text-base bg-blue-100 text-blue-800" : currentCategoryId === null ? "w-full flex items-center justify-center py-2 rounded-md text-base bg-gray-200 text-gray-900" : "w-full flex items-center justify-center py-2 rounded-md text-base text-gray-600 hover:bg-gray-100"}
            >
              📋
            </button>
          </div>

          {/* 최상위 폴더 아이콘들 — CollapsedFolderIcon 컴포넌트로 hooks 규칙 준수 */}
          {/* items는 실제 렌더되는 목록과 일치해야 dnd-kit 오동작 방지 */}
          <SortableContext items={orderedTopFolders.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {orderedTopFolders.map(cat => (
              <CollapsedFolderIcon
                key={cat.id}
                cat={cat}
                isSelected={currentCategoryId === cat.id}
                onSelect={() => setCurrentCategory(cat.id)}
              />
            ))}
          </SortableContext>
        </div>

        {/* 하단 버튼들 */}
        <div className="mt-auto px-1.5 py-3 border-t border-gray-200 flex flex-col gap-1">
          <button
            onClick={() => setNewPageDialogOpen(true)}
            title={t.sidebar.newNote}
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base"
          >
            📄
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title={t.sidebar.settings}
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base"
          >
            ⚙️
          </button>
          <button
            type="button"
            onClick={onOpenTrash}
            title={t.sidebar.trash}
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base"
          >
            🗑️
          </button>
        </div>

        {newPageDialogOpen && (
          <NewPageDialog categoryId={currentCategoryId} onClose={() => setNewPageDialogOpen(false)} />
        )}
      </aside>
    )
  }

  // ── 펼침 모드 렌더링 ────────────────────────────
  return (
    <>
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className="h-screen bg-[#ede9e4] dark:bg-[#1e1e1e] flex flex-col shrink-0 relative"
      >

        {/* ── 헤더 ────────────────────────────────── */}
        <div className="px-2 py-2.5 border-b border-black/5 dark:border-white/5 flex items-center gap-1">
          {/* 접기 버튼 */}
          <button
            onClick={toggleSidebarCollapsed}
            title={t.sidebar.collapseSidebar}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-sm font-bold shrink-0"
          >
            ‹
          </button>

          {/* 볼트 이름 + NOTES 부제 */}
          <div className="flex-1 px-1 min-w-0">
            {currentVaultName ? (
              <div className="truncate text-xs font-semibold text-gray-600 dark:text-gray-300 leading-tight">
                🗂 {currentVaultName}
              </div>
            ) : (
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {t.sidebar.notes}
              </span>
            )}
          </div>

          {/* 전체 펼치기 버튼 */}
          <button
            type="button"
            onClick={expandAllFolders}
            title={t.sidebar.expandAllFolders}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronsDown size={13} />
          </button>

          {/* 전체 접기 버튼 */}
          <button
            type="button"
            onClick={collapseAllFolders}
            title={t.sidebar.collapseAllFolders}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronsUp size={13} />
          </button>

          {/* 그래프 뷰 버튼 (Ctrl+G) */}
          <button
            type="button"
            onClick={onOpenGraphView}
            title={`${t.sidebar.graphView} (Ctrl+G)`}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            <GitFork size={13} />
          </button>

          {/* 데이터베이스 테이블 뷰 버튼 */}
          <button
            type="button"
            onClick={onToggleDbView}
            title={t.sidebar.tableView}
            className={dbViewActive
              ? "flex items-center justify-center w-6 h-6 rounded-md text-blue-500 bg-blue-50 transition-colors shrink-0"
              : "flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"}
          >
            <Table2 size={13} />
          </button>

          {/* 새 메모 버튼 */}
          <button
            onClick={() => setNewPageDialogOpen(true)}
            title={t.sidebar.newNote}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base shrink-0"
          >
            📄
          </button>

          {/* 설정 버튼 */}
          <button
            type="button"
            onClick={onOpenSettings}
            title={t.sidebar.settings}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-sm shrink-0"
          >
            ⚙️
          </button>
          {/* 휴지통 버튼 */}
          <button
            type="button"
            onClick={onOpenTrash}
            title={t.sidebar.trash}
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-sm shrink-0"
          >
            🗑️
          </button>
        </div>

        {/* ── 노트 / 계획 탭 토글 ──────────────────────
            Python으로 치면: tab_bar = TabBar(['노트', '계획']) */}
        <div className="flex items-center px-2 py-1.5 border-b border-gray-200 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setSidebarTab('notes'); setSelectedDate(null) }}
            className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${sidebarTab === 'notes' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            📓 {t.sidebar.tabNotes}
          </button>
          <button
            type="button"
            onClick={() => { setSidebarTab('plan'); setSelectedDate(null) }}
            className={`flex-1 py-1 text-xs rounded font-medium transition-colors ${sidebarTab === 'plan' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            📅 {t.sidebar.tabPlan}
          </button>
        </div>

        {/* ===================================================== */}
        {/* 계획 탭 — 캘린더 + PeriodicNotesPanel                   */}
        {/* Python으로 치면: if sidebar_tab == 'plan': render_plan() */}
        {/* ===================================================== */}
        {sidebarTab === 'plan' && (
          <div className="flex-1 overflow-y-auto">
            {/* 캘린더 위젯 (플러그인 ON일 때만) */}
            {plugins.calendar && (
              <CalendarWidget
                pages={pages}
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); setSearchQuery('') }}
              />
            )}
            {/* 주기적 노트 패널 — 계획 탭에서는 항상 표시 */}
            {/* Python으로 치면: render(PeriodicNotesPanel()) */}
            <PeriodicNotesPanel />
          </div>
        )}

        {/* ===================================================== */}
        {/* 노트 탭 — 검색 + 태그 + 파일 트리 + 최근파일 + 하단바    */}
        {/* Python으로 치면: if sidebar_tab == 'notes': render_notes() */}
        {/* ===================================================== */}
        {sidebarTab === 'notes' && (
          <>
        {/* ── 검색바 ───────────────────────────────── */}
        <div className="px-2 py-2 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-gray-200 rounded-md focus-within:border-blue-400 transition-colors">
            <span className="text-gray-400 text-xs shrink-0">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearchQuery(''); searchInputRef.current?.blur() }
              }}
              placeholder={t.sidebar.searchPlaceholder}
              className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
                className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── 태그 브라우저 섹션 ──────────────────────
            전체 페이지에서 수집한 고유 태그를 페이지 수와 함께 표시
            클릭 시 해당 태그 필터 ON/OFF (다중 선택 가능)
            Python으로 치면: tag_browser = TagBrowser(all_tags_with_count) */}
        {allTagsWithCount.length > 0 && (
          <div className="border-b border-gray-100 shrink-0">
            <button
              type="button"
              onClick={() => setTagSectionOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-1">
                <span>🏷</span>
                <span>{t.sidebar.tags}</span>
                {selectedTags.size > 0 && (
                  <span className="ml-0.5 px-1 py-0 rounded-full bg-blue-500 text-white text-[9px] leading-4">
                    {selectedTags.size}
                  </span>
                )}
              </span>
              <span className="text-gray-300">{tagSectionOpen ? '▾' : '▸'}</span>
            </button>
            {tagSectionOpen && (
              <div className="px-2 pb-2">
                <div className="flex flex-wrap gap-1">
                  {allTagsWithCount.map(([tag, count]) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSelectedTags(prev => {
                          const next = new Set(prev)
                          if (next.has(tag)) { next.delete(tag) } else { next.add(tag) }
                          return next
                        })
                      }}
                      title={`#${tag} — ${count}${t.sidebar.pagesCountSuffix}`}
                      className={selectedTags.has(tag)
                        ? "inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] rounded-full bg-blue-500 text-white transition-colors"
                        : "inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"}
                    >
                      <span className="text-[9px] opacity-60">#</span>
                      <span>{tag}</span>
                      <span className={selectedTags.has(tag) ? "opacity-70" : "opacity-50"}>({count})</span>
                    </button>
                  ))}
                </div>
                {selectedTags.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTags(new Set())}
                    className="mt-1.5 text-[10px] text-blue-400 hover:text-blue-600 transition-colors"
                  >
                    ✕ {t.sidebar.clearTagFilter}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 태그 필터 활성 안내 배너 ─────────────── */}
        {selectedTags.size > 0 && !searchQuery && (
          <div className="px-2 py-1 flex items-center gap-1 bg-blue-50 border-b border-blue-100 shrink-0">
            <span className="text-xs text-blue-600 flex-1 truncate">
              🏷 {[...selectedTags].map(t => `#${t}`).join(', ')}
            </span>
            <button
              type="button"
              onClick={() => setSelectedTags(new Set())}
              className="text-xs text-blue-400 hover:text-blue-600 shrink-0"
              title={t.sidebar.clearTagFilter}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── 날짜 필터 활성 안내 ─────────────────── */}
        {selectedDate && !searchQuery && (
          <div className="px-2 py-1 flex items-center gap-1 bg-blue-50 border-b border-blue-100 shrink-0">
            <span className="text-xs text-blue-600 flex-1">{selectedDate} {t.sidebar.dateFilter}</span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs text-blue-400 hover:text-blue-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── 트리 / 검색 결과 ──────────────────────── */}
        {isFiltering ? (
          /* ── 검색/날짜 필터 결과 — 단일 스크롤 영역 ── */
          <nav className="flex-1 overflow-y-auto px-1.5 py-2">
            {displayPages!.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-xs text-gray-400">
                  {searchQuery.trim()
                    ? `"${searchQuery}" ${t.sidebar.searchNoResults}`
                    : selectedTags.size > 0
                      ? t.sidebar.noTagResults
                      : t.sidebar.noDateResults}
                </p>
              </div>
            ) : (
              displayPages!.map(page => {
                const catId = categoryMap[page.id] ?? null
                const catName = catId
                  ? (categoryById[catId]?.name ?? null)
                  : (searchQuery ? t.sidebar.uncategorized : null)
                return (
                  <DraggablePageRow
                    key={page.id}
                    page={page}
                    depth={0}
                    isSelected={currentPageId === page.id}
                    collapsed={false}
                    onSelect={() => handleSelectPage(page.id)}
                    onDelete={() => deletePage(page.id)}
                    onDuplicate={() => duplicatePage(page.id)}
                    onSplitPage={() => onSplitPage?.(page.id)}
                    searchCategoryName={catName}
                  />
                )
              })
            )}
          </nav>
        ) : (
          /* ── 단일 파일 트리 (폴더 + 인라인 페이지) ── */
          /* Python으로 치면: nav = ScrollView([all_files_tree]) */
          <nav className="flex-1 overflow-y-auto px-1.5 py-2">

            {/* ── 즐겨찾기 섹션 (starred 페이지가 있을 때만) ────────
                사이드바 상단에 ★ 고정 목록 표시
                dnd-kit 중복 ID 방지를 위해 순수 버튼으로 렌더링 (드래그 불필요)
                Python으로 치면: if starred_pages: render StarredSection() */}
            {starredPages.length > 0 && (
              <>
                <div className="px-2 py-0.5 text-[10px] text-yellow-500 font-medium uppercase tracking-wide flex items-center gap-1">
                  <span>★</span><span>{t.sidebar.favorites}</span>
                </div>
                {starredPages.map(page => (
                  <button
                    key={`star-${page.id}`}
                    type="button"
                    onClick={(e) => {
                      if (e.ctrlKey && onSplitPage) { e.preventDefault(); onSplitPage(page.id); return }
                      handleSelectPage(page.id)
                    }}
                    className={currentPageId === page.id
                      ? "w-full flex items-center gap-1 py-1 pr-2 pl-2 rounded-md text-sm text-left bg-gray-200 text-gray-900"
                      : "w-full flex items-center gap-1 py-1 pr-2 pl-2 rounded-md text-sm text-left text-gray-600 hover:bg-gray-100 transition-colors"}
                  >
                    <span className="text-sm shrink-0">{page.icon}</span>
                    <span className="truncate flex-1">{page.title || t.common.untitled}</span>
                  </button>
                ))}
                <div className="border-t border-gray-200 my-1" />
              </>
            )}

            {/* 전체보기 — 드롭 대상 (미분류로 페이지 이동) */}
            <div ref={setAllRef}>
              <button
                onClick={() => { setCurrentCategory(null); setSearchQuery(''); setSelectedDate(null) }}
                className={isOverAll
                  ? "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left bg-blue-100 text-blue-800"
                  : currentCategoryId === null
                    ? "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left bg-gray-200 text-gray-900"
                    : "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left text-gray-600 hover:bg-gray-100 transition-colors"}
              >
                <span className="text-base">📄</span>
                <span>{t.sidebar.dbView}</span>
              </button>
            </div>

            {/* 구분선 */}
            {orderedTopFolders.length > 0 && (
              <div className="border-t border-gray-200 my-1" />
            )}

            {/* 폴더 트리 (인라인 페이지 포함, 최상위 정렬 가능) */}
            {/* items는 실제 렌더 목록과 일치해야 dnd-kit 오동작 방지 */}
            <SortableContext items={orderedTopFolders.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {orderedTopFolders.map(cat => renderFolder(cat.id, 0))}
            </SortableContext>

            {/* 미분류 페이지 (폴더에 속하지 않은 페이지) */}
            {uncategorizedPages.length > 0 && (
              <>
                <div className="border-t border-gray-200 my-1 mt-2" />
                <div className="px-2 py-0.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">{t.sidebar.uncategorized}</div>
                {uncategorizedPages.map(page => (
                  <DraggablePageRow
                    key={page.id}
                    page={page}
                    depth={0}
                    isSelected={currentPageId === page.id}
                    collapsed={false}
                    onSelect={() => handleSelectPage(page.id)}
                    onDelete={() => deletePage(page.id)}
                    onDuplicate={() => duplicatePage(page.id)}
                    onSplitPage={() => onSplitPage?.(page.id)}
                  />
                ))}
              </>
            )}

            {/* 최상위 폴더 추가 인풋 */}
            {isAddingTopFolder && (
              <div className="flex gap-1 py-1 pr-1 mt-1">
                <input
                  autoFocus value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTopFolder()
                    if (e.key === 'Escape') { setIsAddingTopFolder(false); setNewFolderName('') }
                  }}
                  onBlur={() => { if (!newFolderName.trim()) setIsAddingTopFolder(false) }}
                  placeholder={t.sidebar.folderNamePlaceholder + '...'}
                  className="flex-1 min-w-0 px-2 py-1 text-sm bg-white border border-gray-300 rounded outline-none"
                />
                <button
                  onClick={handleAddTopFolder}
                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
                >
                  {t.common.confirm}
                </button>
              </div>
            )}

            {/* 폴더 삭제 오류 메시지 */}
            {deleteError && (
              <div className="mx-1 mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600">
                {deleteError}
              </div>
            )}
          </nav>
        )}

        {/* ── 최근 파일 섹션 ────────────────────────
            mounted 체크: SSR hydration 불일치 방지
            Python으로 치면: if mounted and plugins.recentFiles and recent_ids: render() */}
        {mounted && plugins.recentFiles && recentPageIds.length > 0 && (
          <div className="border-t border-gray-200 px-1.5 py-2 shrink-0">
            <div className="flex items-center gap-1 px-1 mb-1">
              <span className="text-[10px] text-gray-400">🕓</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{t.sidebar.recentFiles}</span>
            </div>
            {recentPageIds.slice(0, 5).map(pageId => {
              const page = pages.find(p => p.id === pageId)
              if (!page) return null
              return (
                <button
                  key={pageId}
                  type="button"
                  onClick={(e) => {
                    if (e.ctrlKey && onSplitPage) { e.preventDefault(); onSplitPage(pageId); return }
                    handleSelectPage(pageId)
                  }}
                  className={currentPageId === pageId
                    ? "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-left bg-gray-200 text-gray-900"
                    : "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-left text-gray-500 hover:bg-gray-100 transition-colors"}
                >
                  <span className="shrink-0">{page.icon}</span>
                  <span className="truncate">{page.title || t.common.untitled}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── 하단: 새 메모 + 새 폴더 버튼 ─────────────── */}
        <div className="px-2 py-2 border-t border-gray-200 shrink-0 space-y-0.5">
          {/* 새 메모 버튼 — 현재 선택된 폴더에 페이지 생성 */}
          <button
            onClick={() => setNewPageDialogOpen(true)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <span className="text-base leading-none">📄</span>
            <span>{t.sidebar.newPage}</span>
          </button>
          {/* 새 폴더 버튼 */}
          {!isAddingTopFolder && (
            <button
              onClick={() => setIsAddingTopFolder(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              <span>{t.sidebar.newFolder}</span>
            </button>
          )}
        </div>
          </>
        )} {/* 노트 탭 끝 */}

        {/* ── 리사이즈 핸들 ──────────────────────────
            사이드바 오른쪽 가장자리 4px 영역
            마우스다운 → 드래그로 너비 조절 (160 ~ 480px)
            Python으로 치면: self.resize_handle = QSizeGrip(self) */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-10"
          title={t.sidebar.resizeHandle}
        />

      </aside>

      {/* 새 페이지 다이얼로그 (aside 밖에 portal로 렌더링) */}
      {newPageDialogOpen && (
        <NewPageDialog categoryId={currentCategoryId} onClose={() => setNewPageDialogOpen(false)} />
      )}
    </>
  )
}
