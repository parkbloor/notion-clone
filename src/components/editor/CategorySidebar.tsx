// =============================================
// src/components/editor/CategorySidebar.tsx
// 역할: 가장 왼쪽 패널 — 카테고리(폴더) 목록
// 접힘(w-12, 아이콘만) / 펼침(w-44, 전체) 두 모드 지원
// Python으로 치면: class CategoryList(Widget): collapsed: bool = False
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Category } from '@/types/block'

// dnd-kit: 카테고리 정렬 + 드롭 대상으로 사용
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'


// -----------------------------------------------
// 카테고리 아이템 컴포넌트
// collapsed=true 시: 아이콘만 + title 툴팁
// collapsed=false 시: 기존 전체 UI (드래그핸들, 이름, 삭제버튼)
// Python으로 치면: class CategoryItem(Widget): collapsed: bool = False
// -----------------------------------------------
interface CategoryItemProps {
  category: Category
  isSelected: boolean
  collapsed: boolean            // 사이드바 접힘 여부
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

function CategoryItem({ category, isSelected, collapsed, onSelect, onRename, onDelete }: CategoryItemProps) {
  // 이름 편집 모드 상태
  // Python으로 치면: is_editing = False
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(category.name)

  // dnd-kit sortable: 카테고리 자체를 드래그앤드롭으로 순서 변경
  // Python으로 치면: draggable_handle = DragHandle(category.id)
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: category.id,
    data: { type: 'category', categoryId: category.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // 이름 편집 완료
  function handleRenameSubmit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== category.name) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  // ── 접힘 모드: 아이콘만 표시 ──────────────────
  if (collapsed) {
    const iconBtn = "w-full flex items-center justify-center py-2 rounded-md text-base transition-colors"
    const iconBtnSel = iconBtn + " bg-gray-200 text-gray-900"
    const iconBtnNormal = iconBtn + " text-gray-600 hover:bg-gray-100"
    const iconBtnOver = iconBtn + " bg-blue-100 text-blue-800"
    return (
      <div ref={setSortRef} style={style}>
        <button
          onClick={onSelect}
          title={category.name}
          className={isOver ? iconBtnOver : isSelected ? iconBtnSel : iconBtnNormal}
        >
          📁
        </button>
      </div>
    )
  }

  // ── 펼침 모드: 기존 전체 UI ──────────────────
  const baseBtn = "w-full flex items-center gap-1.5 px-2 py-1.5 pr-8 rounded-md text-sm text-left transition-colors"
  const selectedBtn = baseBtn + " bg-gray-200 text-gray-900"
  const normalBtn = baseBtn + " text-gray-600 hover:bg-gray-100"
  // 페이지가 이 카테고리 위로 드래그될 때 하이라이트
  const overBtn = baseBtn + " bg-blue-100 text-blue-800"

  return (
    <div ref={setSortRef} style={style} className="group relative">
      {isEditing ? (
        // ── 이름 편집 인풋 ────────────────────────
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
        // ── 카테고리 버튼 ──────────────────────────
        <button
          onClick={onSelect}
          onDoubleClick={() => { setIsEditing(true); setEditValue(category.name) }}
          className={isOver ? overBtn : isSelected ? selectedBtn : normalBtn}
          title="더블클릭으로 이름 변경"
        >
          {/* 드래그 핸들 — hover 시만 표시 */}
          <span
            className="shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs"
            {...attributes}
            {...listeners}
          >
            ⠿
          </span>
          <span className="text-base shrink-0">📁</span>
          <span className="truncate">{category.name}</span>
        </button>
      )}

      {/* 삭제 버튼 — hover 시만 표시 */}
      {!isEditing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
          title="폴더 삭제"
        >
          🗑️
        </button>
      )}
    </div>
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
    setCurrentCategory,
    addCategory,
    renameCategory,
    deleteCategory,
  } = usePageStore()

  // 접힘 상태: settingsStore에서 읽어 localStorage 영속
  // Python으로 치면: collapsed = settings.sidebar_collapsed
  const { sidebarCollapsed, toggleSidebarCollapsed } = useSettingsStore()

  // 삭제 실패 메시지 (메모가 있어서 삭제 불가)
  // Python으로 치면: delete_error: str | None = None
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 새 폴더 추가 인풋 표시 여부
  const [isAdding, setIsAdding] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // ── "전체보기" 드롭 대상 ─────────────────────
  // 페이지를 여기에 드롭하면 미분류(카테고리 없음)로 이동
  // Python으로 치면: all_droppable = Droppable(id='uncategorized')
  const { setNodeRef: setAllRef, isOver: isOverAll } = useDroppable({
    id: 'uncategorized',
    data: { type: 'category', categoryId: null },
  })

  // 카테고리 삭제 처리
  async function handleDelete(categoryId: string) {
    const result = await deleteCategory(categoryId)
    if (result.hasPages) {
      setDeleteError(
        `이 폴더 안에 메모가 ${result.count}개 있습니다.\n먼저 메모를 다른 폴더로 이동하거나 삭제해주세요.`
      )
      // 4초 후 오류 메시지 자동 숨김
      setTimeout(() => setDeleteError(null), 4000)
    }
  }

  // 새 폴더 추가 완료
  function handleAddCategory() {
    const trimmed = newCatName.trim()
    if (trimmed) {
      addCategory(trimmed)
      setNewCatName('')
      setIsAdding(false)
    }
  }

  // categoryOrder 순서대로 카테고리 배열 정렬
  // Python으로 치면: ordered = [cats[id] for id in order if id in cats]
  const orderedCategories = categoryOrder
    .map(id => categories.find(c => c.id === id))
    .filter(Boolean) as Category[]

  // ── 공통 스타일 헬퍼 ────────────────────────
  // 전체보기 버튼: 접힘/펼침 × 선택/hover/over 조합
  const allIconBtn = "w-full flex items-center justify-center py-2 rounded-md text-base transition-colors"
  const allIconBtnSel = allIconBtn + " bg-gray-200 text-gray-900"
  const allIconBtnNormal = allIconBtn + " text-gray-600 hover:bg-gray-100"
  const allIconBtnOver = allIconBtn + " bg-blue-100 text-blue-800"

  const allFullBtn = "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors"
  const allFullBtnSel = allFullBtn + " bg-gray-200 text-gray-900"
  const allFullBtnNormal = allFullBtn + " text-gray-600 hover:bg-gray-100"
  const allFullBtnOver = allFullBtn + " bg-blue-100 text-blue-800"

  // ── 사이드바 너비 — transition으로 부드럽게 ──
  // Python으로 치면: width = 'w-12' if collapsed else 'w-44'
  const asideClass = sidebarCollapsed
    ? "w-12 h-screen bg-gray-100 border-r border-gray-200 flex flex-col shrink-0 transition-[width] duration-200"
    : "w-44 h-screen bg-gray-100 border-r border-gray-200 flex flex-col shrink-0 transition-[width] duration-200"

  return (
    <aside className={asideClass}>

      {/* ── 헤더: 접힘 시 펼치기 버튼만, 펼침 시 "폴더" + 접기 버튼 ── */}
      <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-between">
        {/* 펼침 모드에서만 "폴더" 라벨 표시 */}
        {!sidebarCollapsed && (
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-2">폴더</h2>
        )}
        {/* 접기/펼치기 토글 버튼 */}
        {/* Python으로 치면: Button(text='‹' if not collapsed else '›', command=toggle) */}
        <button
          onClick={toggleSidebarCollapsed}
          title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors ml-auto text-sm font-bold"
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>
      </div>

      {/* ── 카테고리 목록 ─────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">

        {/* 전체보기 — 항상 맨 위, 드롭 대상 (미분류로 이동) */}
        <div ref={setAllRef}>
          {sidebarCollapsed ? (
            // 접힘: 아이콘만
            <button
              onClick={() => setCurrentCategory(null)}
              title="전체보기"
              className={isOverAll ? allIconBtnOver : currentCategoryId === null ? allIconBtnSel : allIconBtnNormal}
            >
              📋
            </button>
          ) : (
            // 펼침: 아이콘 + 텍스트
            <button
              onClick={() => setCurrentCategory(null)}
              className={isOverAll ? allFullBtnOver : currentCategoryId === null ? allFullBtnSel : allFullBtnNormal}
            >
              <span className="text-base">📋</span>
              <span>전체보기</span>
            </button>
          )}
        </div>

        {/* 구분선 */}
        {orderedCategories.length > 0 && (
          <div className="border-t border-gray-200 my-1" />
        )}

        {/* 카테고리 목록 (드래그앤드롭 정렬) */}
        {/* SortableContext는 외부 DndContext(page.tsx)를 사용 */}
        <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
          {orderedCategories.map(cat => (
            <CategoryItem
              key={cat.id}
              category={cat}
              isSelected={currentCategoryId === cat.id}
              collapsed={sidebarCollapsed}
              onSelect={() => setCurrentCategory(cat.id)}
              onRename={(name) => renameCategory(cat.id, name)}
              onDelete={() => handleDelete(cat.id)}
            />
          ))}
        </SortableContext>

        {/* 삭제 오류 메시지 — 펼침 모드에서만 표시 */}
        {deleteError && !sidebarCollapsed && (
          <div className="mx-1 mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600 whitespace-pre-line">
            {deleteError}
          </div>
        )}

      </nav>

      {/* ── 새 폴더 추가 ─────────────────────────── */}
      <div className="px-1.5 py-3 border-t border-gray-200">
        {sidebarCollapsed ? (
          // 접힘: + 아이콘만
          <button
            onClick={() => { toggleSidebarCollapsed(); setTimeout(() => setIsAdding(true), 210) }}
            title="새 폴더 추가"
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-lg leading-none"
          >
            +
          </button>
        ) : isAdding ? (
          // 펼침 + 입력 모드: 폴더 이름 입력 인풋
          <div className="flex gap-1">
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCategory()
                if (e.key === 'Escape') { setIsAdding(false); setNewCatName('') }
              }}
              onBlur={() => { if (!newCatName.trim()) setIsAdding(false) }}
              placeholder="폴더 이름..."
              className="flex-1 min-w-0 px-2 py-1 text-sm bg-white border border-gray-300 rounded outline-none"
            />
            <button
              onClick={handleAddCategory}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
            >
              확인
            </button>
          </div>
        ) : (
          // 펼침 + 일반: 새 폴더 버튼
          <button
            onClick={() => setIsAdding(true)}
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
