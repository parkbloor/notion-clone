// =============================================
// src/components/editor/CategorySidebar.tsx
// 역할: 가장 왼쪽 패널 — 카테고리(폴더) 목록
// Python으로 치면: class CategoryList(Widget): def render(self): ...
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
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
// 더블클릭으로 이름 변경, 드래그로 순서 변경, 드롭으로 페이지 받기
// Python으로 치면: class CategoryItem(Widget): ...
// -----------------------------------------------
interface CategoryItemProps {
  category: Category
  isSelected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

function CategoryItem({ category, isSelected, onSelect, onRename, onDelete }: CategoryItemProps) {
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
    reorderCategories,
  } = usePageStore()

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

  const allBtnBase = "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors"
  const allBtnSelected = allBtnBase + " bg-gray-200 text-gray-900"
  const allBtnNormal = allBtnBase + " text-gray-600 hover:bg-gray-100"
  const allBtnOver = allBtnBase + " bg-blue-100 text-blue-800"

  return (
    <aside className="w-44 h-screen bg-gray-100 border-r border-gray-200 flex flex-col shrink-0">

      {/* ── 헤더 ────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">폴더</h2>
      </div>

      {/* ── 카테고리 목록 ─────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">

        {/* 전체보기 — 항상 맨 위, 드롭 대상 (미분류로 이동) */}
        <div ref={setAllRef}>
          <button
            onClick={() => setCurrentCategory(null)}
            className={isOverAll ? allBtnOver : currentCategoryId === null ? allBtnSelected : allBtnNormal}
          >
            <span className="text-base">📋</span>
            <span>전체보기</span>
          </button>
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
              onSelect={() => setCurrentCategory(cat.id)}
              onRename={(name) => renameCategory(cat.id, name)}
              onDelete={() => handleDelete(cat.id)}
            />
          ))}
        </SortableContext>

        {/* 삭제 오류 메시지 */}
        {deleteError && (
          <div className="mx-1 mt-1 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-600 whitespace-pre-line">
            {deleteError}
          </div>
        )}

      </nav>

      {/* ── 새 폴더 추가 ─────────────────────────── */}
      <div className="px-2 py-3 border-t border-gray-200">
        {isAdding ? (
          // 폴더 이름 입력 인풋
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
