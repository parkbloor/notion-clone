// =============================================
// src/components/editor/CategorySidebar.tsx
// 역할: 가장 왼쪽 패널 — 카테고리(폴더) 트리 목록
// 무제한 깊이 재귀 트리 (parentId 방식)
// 물리 폴더는 vault/ 아래 flat, 논리적 트리만 index에 저장
// Python으로 치면: class CategoryTree(Widget): ...
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Category } from '@/types/block'

// dnd-kit: 최상위 카테고리 정렬 + 페이지→카테고리 드롭 대상
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'


// -----------------------------------------------
// 깊이별 색상 스키마
// depth=0 회색, depth=1 파랑, depth=2 보라, depth=3+ 초록
// Tailwind 퍼지 대응: 클래스 문자열을 상수로 하드코딩
// Python으로 치면: DEPTH_STYLES: list[dict] = [...]
// -----------------------------------------------
const DEPTH_STYLES = [
  // depth 0: 최상위 — 기본 회색
  { dot: '', normal: 'text-gray-600 hover:bg-gray-100', selected: 'bg-gray-200 text-gray-900', over: 'bg-blue-100 text-blue-800' },
  // depth 1 — 파란 계열
  { dot: 'bg-blue-400', normal: 'text-blue-600 hover:bg-blue-50', selected: 'bg-blue-100 text-blue-900', over: 'bg-blue-200 text-blue-900' },
  // depth 2 — 보라 계열
  { dot: 'bg-violet-400', normal: 'text-violet-600 hover:bg-violet-50', selected: 'bg-violet-100 text-violet-900', over: 'bg-violet-200 text-violet-900' },
  // depth 3+ — 초록 계열
  { dot: 'bg-teal-400', normal: 'text-teal-600 hover:bg-teal-50', selected: 'bg-teal-100 text-teal-900', over: 'bg-teal-200 text-teal-900' },
] as const


// -----------------------------------------------
// 공통 행 UI 컴포넌트 (dnd 훅 없음, 순수 UI)
// 재사용: SortableCategoryRow / DroppableCategoryRow 둘 다 이걸 렌더링
// Python으로 치면: class CategoryRowUI(Widget): ...
// -----------------------------------------------
interface CategoryRowUIProps {
  category: Category
  depth: number             // 들여쓰기 깊이 (0=최상위)
  hasChildren: boolean      // 하위 폴더 존재 여부
  isExpanded: boolean       // 현재 펼쳐져 있는지
  isSelected: boolean       // 현재 선택된 카테고리인지
  isOver: boolean           // 드래그 대상으로 호버 중인지
  isDragging?: boolean      // 이 아이템이 드래그 중인지 (최상위만 해당)
  collapsed: boolean        // 사이드바 자체가 접힌 상태인지
  dragHandleProps?: object  // useSortable의 attributes+listeners (최상위만)
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
  onToggleExpand: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddChild: () => void    // 하위 폴더 추가 버튼 클릭
}

function CategoryRowUI({
  category, depth, hasChildren, isExpanded, isSelected, isOver, isDragging,
  collapsed, dragHandleProps, setNodeRef, style,
  onToggleExpand, onSelect, onRename, onDelete, onAddChild,
}: CategoryRowUIProps) {
  // 이름 편집 모드 상태
  // Python으로 치면: is_editing = False
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(category.name)

  // 이름 편집 완료 처리
  function handleRenameSubmit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== category.name) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  // ── 사이드바 접힘 모드: 아이콘만 표시 (최상위만 보임) ──
  if (collapsed) {
    const base = "w-full flex items-center justify-center py-2 rounded-md text-base transition-colors"
    return (
      <div ref={setNodeRef} style={style}>
        <button
          onClick={onSelect}
          title={category.name}
          className={isOver ? base + " bg-blue-100 text-blue-800" : isSelected ? base + " bg-gray-200 text-gray-900" : base + " text-gray-600 hover:bg-gray-100"}
        >
          📁
        </button>
      </div>
    )
  }

  // ── 펼침 모드: 트리 행 UI ──────────────────────
  // 들여쓰기: depth마다 12px
  // Python으로 치면: indent_px = depth * 12
  const indentStyle: React.CSSProperties = { paddingLeft: `${depth * 12}px` }

  // 깊이별 색상 스키마 적용 (depth 3 이상은 마지막 스키마 재사용)
  // Python으로 치면: ds = DEPTH_STYLES[min(depth, len(DEPTH_STYLES)-1)]
  const ds = DEPTH_STYLES[Math.min(depth, DEPTH_STYLES.length - 1)]

  const baseBtn = "w-full flex items-center gap-1 py-1.5 pr-14 rounded-md text-sm text-left transition-colors"
  const normalBtn = baseBtn + " " + ds.normal
  const selectedBtn = baseBtn + " " + ds.selected
  const overBtn = baseBtn + " " + ds.over

  return (
    <div ref={setNodeRef} style={{ ...style, ...indentStyle }} className="group relative">
      {isEditing ? (
        // ── 이름 편집 인풋 ──────────────────────────
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setEditValue(category.name); setIsEditing(false) }
          }}
          className="w-full px-2 py-1.5 text-sm bg-white border border-blue-400 rounded-md outline-none"
        />
      ) : (
        // ── 카테고리 버튼 행 ──────────────────────────
        <button
          onClick={onSelect}
          onDoubleClick={() => { setIsEditing(true); setEditValue(category.name) }}
          className={isOver ? overBtn : isSelected ? selectedBtn : normalBtn}
          title="더블클릭으로 이름 변경"
          style={{ opacity: isDragging ? 0.4 : 1 }}
        >
          {/* 드래그 핸들 — 최상위(depth=0)만, hover 시 표시 */}
          {dragHandleProps && (
            <span
              className="shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs"
              {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
            >
              ⠿
            </span>
          )}

          {/* 펼치기/접기 토글 — 자식 있을 때만 클릭 가능 */}
          {/* Python으로 치면: toggle_icon = '▼' if expanded else '▶' */}
          <span
            className="shrink-0 w-4 text-center text-gray-400 text-xs leading-none"
            onClick={(e) => {
              if (!hasChildren) return
              e.stopPropagation()
              onToggleExpand()
            }}
            style={{ cursor: hasChildren ? 'pointer' : 'default' }}
          >
            {hasChildren ? (isExpanded ? '▼' : '▶') : ''}
          </span>

          {/* 깊이 색상 표시 도트 — depth>0인 하위 폴더에만 표시 */}
          {/* Python으로 치면: if depth > 0: render colored dot */}
          {depth > 0 && ds.dot && (
            <span className={"shrink-0 w-1 h-3.5 rounded-full " + ds.dot} />
          )}

          {/* 폴더 아이콘 */}
          <span className="text-base shrink-0">📁</span>

          {/* 이름 (truncate) */}
          <span className="truncate flex-1">{category.name}</span>
        </button>
      )}

      {/* 액션 버튼들 — hover 시만 표시 */}
      {!isEditing && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          {/* 하위 폴더 추가 버튼 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddChild() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs font-bold"
            title="하위 폴더 추가"
          >
            +
          </button>
          {/* 삭제 버튼 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all text-xs"
            title="폴더 삭제"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}


// -----------------------------------------------
// SortableCategoryRow — 최상위 카테고리 (depth=0)
// useSortable로 드래그 순서 변경 + 드롭 대상
// Python으로 치면: class SortableCategoryRow(CategoryRowUI): uses_sortable = True
// -----------------------------------------------
interface CategoryRowProps {
  category: Category
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  isSelected: boolean
  collapsed: boolean
  onToggleExpand: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddChild: () => void
}

function SortableCategoryRow(props: CategoryRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, isOver,
  } = useSortable({
    id: props.category.id,
    data: { type: 'category', categoryId: props.category.id },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <CategoryRowUI
      {...props}
      setNodeRef={setNodeRef}
      style={style}
      isOver={isOver}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  )
}


// -----------------------------------------------
// DroppableCategoryRow — 하위 카테고리 (depth > 0)
// useDroppable만 사용 (페이지 드롭만 받음, 정렬 드래그 없음)
// Python으로 치면: class DroppableCategoryRow(CategoryRowUI): uses_droppable = True
// -----------------------------------------------
function DroppableCategoryRow(props: CategoryRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: props.category.id,
    data: { type: 'category', categoryId: props.category.id },
  })

  return (
    <CategoryRowUI
      {...props}
      setNodeRef={setNodeRef}
      isOver={isOver}
    />
  )
}


// -----------------------------------------------
// CategorySidebar — 메인 컴포넌트
// -----------------------------------------------
export default function CategorySidebar() {

  const {
    categories,
    currentCategoryId,
    categoryOrder,
    categoryChildOrder,
    setCurrentCategory,
    addCategory,
    renameCategory,
    deleteCategory,
  } = usePageStore()

  // 접힘 상태: settingsStore에서 읽어 localStorage 영속
  // Python으로 치면: collapsed = settings.sidebar_collapsed
  const { sidebarCollapsed, toggleSidebarCollapsed } = useSettingsStore()

  // 각 카테고리 노드의 펼침/접힘 상태
  // Set에 있으면 펼쳐진 상태
  // Python으로 치면: expanded_ids: set[str] = set()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  // 삭제 실패 메시지
  // Python으로 치면: delete_error: str | None = None
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 최상위 새 폴더 추가 인풋
  const [isAddingTop, setIsAddingTop] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // 하위 폴더 추가 인풋 상태
  // Python으로 치면: adding_child_of: str | None = None
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null)
  const [childCatName, setChildCatName] = useState('')

  // ── "전체보기" 드롭 대상 ─────────────────────
  const { setNodeRef: setAllRef, isOver: isOverAll } = useDroppable({
    id: 'uncategorized',
    data: { type: 'category', categoryId: null },
  })

  // ── 노드 펼침/접힘 토글 ─────────────────────────
  function toggleExpand(catId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(catId)) { next.delete(catId) } else { next.add(catId) }
      return next
    })
  }

  // ── 카테고리 삭제 처리 ──────────────────────────
  async function handleDelete(categoryId: string) {
    const result = await deleteCategory(categoryId)
    if (result.hasChildren) {
      setDeleteError(`이 폴더 안에 하위 폴더가 ${result.count}개 있습니다.\n먼저 하위 폴더를 삭제해주세요.`)
      setTimeout(() => setDeleteError(null), 4000)
    } else if (result.hasPages) {
      setDeleteError(`이 폴더 안에 메모가 ${result.count}개 있습니다.\n먼저 메모를 다른 폴더로 이동하거나 삭제해주세요.`)
      setTimeout(() => setDeleteError(null), 4000)
    }
  }

  // ── 최상위 새 폴더 추가 완료 ────────────────────
  function handleAddTopCategory() {
    const trimmed = newCatName.trim()
    if (trimmed) {
      addCategory(trimmed, null)
      setNewCatName('')
      setIsAddingTop(false)
    }
  }

  // ── 하위 폴더 추가 완료 ─────────────────────────
  function handleAddChildCategory(parentId: string) {
    const trimmed = childCatName.trim()
    if (trimmed) {
      addCategory(trimmed, parentId)
      setExpandedIds(prev => new Set([...prev, parentId]))
      setChildCatName('')
      setAddingChildOf(null)
    }
  }

  // ── 하위 폴더 추가 시작 ─────────────────────────
  function startAddChild(parentId: string) {
    setAddingChildOf(parentId)
    setChildCatName('')
    // 부모 폴더가 접혀있으면 자동으로 펼침
    setExpandedIds(prev => new Set([...prev, parentId]))
  }

  // -----------------------------------------------
  // 재귀 트리 렌더링
  // depth=0: SortableCategoryRow (드래그 정렬 가능)
  // depth>0: DroppableCategoryRow (드롭만 가능)
  // Python으로 치면: def render_tree(cat_id, depth=0): ...
  // -----------------------------------------------
  function renderCategoryTree(catId: string, depth: number): React.ReactNode {
    const cat = categories.find(c => c.id === catId)
    if (!cat) return null

    const childIds = categoryChildOrder[catId] ?? []
    const hasChildren = childIds.length > 0
    const isExpanded = expandedIds.has(catId)

    // depth=0: 정렬 가능한 행, depth>0: 드롭만 가능한 행
    const RowComponent = depth === 0 ? SortableCategoryRow : DroppableCategoryRow

    return (
      <div key={catId}>
        <RowComponent
          category={cat}
          depth={depth}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          isSelected={currentCategoryId === catId}
          collapsed={sidebarCollapsed}
          onToggleExpand={() => toggleExpand(catId)}
          onSelect={() => setCurrentCategory(catId)}
          onRename={(name) => renameCategory(catId, name)}
          onDelete={() => handleDelete(catId)}
          onAddChild={() => startAddChild(catId)}
        />

        {/* 하위 폴더 추가 인풋 (펼침 모드에서만) */}
        {addingChildOf === catId && !sidebarCollapsed && (
          <div
            className="flex gap-1 py-1 pr-1"
            style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
          >
            <input
              autoFocus
              value={childCatName}
              onChange={(e) => setChildCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChildCategory(catId)
                if (e.key === 'Escape') { setAddingChildOf(null); setChildCatName('') }
              }}
              onBlur={() => { if (!childCatName.trim()) setAddingChildOf(null) }}
              placeholder="하위 폴더 이름..."
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded outline-none"
            />
            <button
              onClick={() => handleAddChildCategory(catId)}
              className="px-1.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
            >
              확인
            </button>
          </div>
        )}

        {/* 하위 카테고리 (펼쳐진 상태 + 펼침 모드에서만) */}
        {isExpanded && !sidebarCollapsed && childIds.map(childId =>
          renderCategoryTree(childId, depth + 1)
        )}
      </div>
    )
  }

  // categoryOrder 순서대로 최상위 카테고리 정렬
  const orderedTopCategories = categoryOrder
    .map(id => categories.find(c => c.id === id))
    .filter(Boolean) as Category[]

  // ── 공통 스타일 ──────────────────────────────────
  const allIconBtn = "w-full flex items-center justify-center py-2 rounded-md text-base transition-colors"
  const allFullBtn = "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors"

  const asideClass = sidebarCollapsed
    ? "w-12 h-screen bg-gray-100 border-r border-gray-200 flex flex-col shrink-0 transition-[width] duration-200"
    : "w-44 h-screen bg-gray-100 border-r border-gray-200 flex flex-col shrink-0 transition-[width] duration-200"

  return (
    <aside className={asideClass}>

      {/* ── 헤더 ── */}
      <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between">
        {!sidebarCollapsed && (
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-2">폴더</h2>
        )}
        <button
          onClick={toggleSidebarCollapsed}
          title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors ml-auto text-sm font-bold"
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>
      </div>

      {/* ── 카테고리 목록 ── */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">

        {/* 전체보기 — 드롭 대상 (미분류로 이동) */}
        <div ref={setAllRef}>
          {sidebarCollapsed ? (
            <button
              onClick={() => setCurrentCategory(null)}
              title="전체보기"
              className={isOverAll ? allIconBtn + " bg-blue-100 text-blue-800" : currentCategoryId === null ? allIconBtn + " bg-gray-200 text-gray-900" : allIconBtn + " text-gray-600 hover:bg-gray-100"}
            >
              📋
            </button>
          ) : (
            <button
              onClick={() => setCurrentCategory(null)}
              className={isOverAll ? allFullBtn + " bg-blue-100 text-blue-800" : currentCategoryId === null ? allFullBtn + " bg-gray-200 text-gray-900" : allFullBtn + " text-gray-600 hover:bg-gray-100"}
            >
              <span className="text-base">📋</span>
              <span>전체보기</span>
            </button>
          )}
        </div>

        {/* 구분선 */}
        {orderedTopCategories.length > 0 && (
          <div className="border-t border-gray-200 my-1" />
        )}

        {/* ── 최상위 카테고리 트리 (드래그 정렬) ── */}
        {/* SortableContext는 최상위만 포함 (하위는 DroppableCategoryRow 사용) */}
        <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
          {orderedTopCategories.map(cat => renderCategoryTree(cat.id, 0))}
        </SortableContext>

        {/* 삭제 오류 메시지 */}
        {deleteError && !sidebarCollapsed && (
          <div className="mx-1 mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600 whitespace-pre-line">
            {deleteError}
          </div>
        )}

      </nav>

      {/* ── 새 최상위 폴더 추가 ── */}
      <div className="px-1.5 py-3 border-t border-gray-200">
        {sidebarCollapsed ? (
          <button
            onClick={() => { toggleSidebarCollapsed(); setTimeout(() => setIsAddingTop(true), 210) }}
            title="새 폴더 추가"
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-lg leading-none"
          >
            +
          </button>
        ) : isAddingTop ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTopCategory()
                if (e.key === 'Escape') { setIsAddingTop(false); setNewCatName('') }
              }}
              onBlur={() => { if (!newCatName.trim()) setIsAddingTop(false) }}
              placeholder="폴더 이름..."
              className="flex-1 min-w-0 px-2 py-1 text-sm bg-white border border-gray-300 rounded outline-none"
            />
            <button
              onClick={handleAddTopCategory}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
            >
              확인
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingTop(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>새 폴더</span>
          </button>
        )}
      </div>

    </aside>
  )
}
