// =============================================
// src/components/sidebar/CategoryRow.tsx
// 역할: 폴더 행 UI + dnd-kit 래퍼 컴포넌트
//   - CategoryRowUI: 순수 UI (dnd 훅 없음)
//   - SortableCategoryRow: 최상위 폴더 (depth=0, 순서 드래그)
//   - DroppableCategoryRow: 하위 폴더 (depth>0, 드래그+드롭)
//   - CollapsedFolderIcon: 접힘 모드용 아이콘 (훅 규칙 준수용 분리)
// Python으로 치면: class CategoryRow(Widget): ...
// =============================================

'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Folder } from 'lucide-react'
import { Category } from '@/types/block'
import { useLocale } from '@/locales'
import { DEPTH_STYLES, FOLDER_COLOR_GROUPS } from './sidebarUtils'
import ContextMenu from '@/components/editor/ContextMenu'

// -----------------------------------------------
// CategoryRowUI props — dnd 훅 없이 순수 UI만 담당
// setNodeRef, style, dragHandleProps는 부모 dnd 훅에서 주입
// Python으로 치면: @dataclass class CategoryRowUIProps: ...
// -----------------------------------------------
export interface CategoryRowUIProps {
  category: Category
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  isSelected: boolean
  isOver: boolean
  isDragging?: boolean
  collapsed: boolean
  pageCount: number       // 이 폴더에 직접 속한 메모 수 (배지 표시용)
  dragHandleProps?: object
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
  onToggleExpand: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddChild: () => void
  onAddPage: () => void
  onColorChange: (color: string | null) => void
}

// -----------------------------------------------
// CategoryRowUI: 폴더 행 공통 UI — SortableCategoryRow / DroppableCategoryRow 모두 사용
// Python으로 치면: class CategoryRowUI(Widget): pure UI, no dnd
// -----------------------------------------------
export function CategoryRowUI({
  category, depth, hasChildren, isExpanded, isSelected, isOver, isDragging,
  collapsed, pageCount, dragHandleProps, setNodeRef, style,
  onToggleExpand, onSelect, onRename, onDelete, onAddChild, onAddPage, onColorChange,
}: CategoryRowUIProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(category.name)
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 우클릭 컨텍스트 메뉴 상태
  // Python으로 치면: self.ctx_menu_pos: tuple[int,int] | None = None
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  function handleRenameSubmit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== category.name) onRename(trimmed)
    setIsEditing(false)
  }

  // 접힘 모드: 아이콘만
  if (collapsed) {
    const base = "w-full flex items-center justify-center py-2 rounded-md text-base transition-colors"
    return (
      <div ref={setNodeRef} style={style}>
        <button
          onClick={onSelect}
          title={category.name}
          className={isOver ? base + " bg-blue-100 text-blue-800" : isSelected ? base + " bg-gray-200 text-gray-900" : base + " text-gray-500 hover:bg-gray-100"}
        >
          <Folder size={16} />
        </button>
      </div>
    )
  }

  // 들여쓰기 (depth마다 12px)
  const indentStyle: React.CSSProperties = { paddingLeft: `${depth * 12}px` }
  const ds = DEPTH_STYLES[Math.min(depth, DEPTH_STYLES.length - 1)]
  const baseBtn = "w-full flex items-center gap-1 py-1.5 pr-16 rounded-md text-sm text-left transition-colors"
  const normalBtn = baseBtn + " " + ds.normal
  const selectedBtn = baseBtn + " " + ds.selected
  const overBtn = baseBtn + " " + ds.over

  // depth=0 최상위 폴더 하이라이트 배경색 계산
  // 커스텀 색상 있으면 해당 색 12% 투명, 없으면 회색 12% 투명
  // Python으로 치면: bg = (cat.color + '1f') if cat.color else 'rgba(107,114,128,0.12)'
  const depth0BgColor = depth === 0
    ? (category.color ? category.color + '1f' : 'rgba(107,114,128,0.12)')
    : undefined

  return (
    // depth=0 최상위 폴더: 위아래 약간의 여백 + 반투명 하이라이트 배경
    <div
      ref={setNodeRef}
      style={{ ...style, ...indentStyle, backgroundColor: depth0BgColor }}
      className={['group relative rounded-md', depth === 0 ? 'mt-0.5' : ''].join(' ')}
    >
      {isEditing ? (
        <input
          autoFocus value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setEditValue(category.name); setIsEditing(false) }
          }}
          className="w-full px-2 py-1.5 text-sm bg-white border border-blue-400 rounded-md outline-none"
        />
      ) : (
        <button
          onClick={onSelect}
          onDoubleClick={() => { setIsEditing(true); setEditValue(category.name) }}
          onContextMenu={(e) => {
            // 우클릭 시 브라우저 기본 메뉴 차단 → 커스텀 컨텍스트 메뉴 표시
            // Python으로 치면: def on_right_click(e): e.prevent_default(); show_ctx_menu(e.x, e.y)
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ x: e.clientX, y: e.clientY })
          }}
          className={isOver ? overBtn : isSelected ? selectedBtn : normalBtn}
          title={t.sidebar.renameFolderHint}
          style={{ opacity: isDragging ? 0.4 : 1 }}
        >
          {/* 드래그 핸들 (최상위 depth=0만) */}
          {dragHandleProps && (
            <span
              className="shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs"
              {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
            >
              ⠿
            </span>
          )}

          {/* 펼치기/접기 토글 — 폴더 커스텀 색상 있으면 동일 색, 없으면 depth 색 */}
          <span
            className={['shrink-0 w-4 text-center text-xs leading-none', category.color ? '' : ds.folder].join(' ')}
            onClick={(e) => {
              if (!hasChildren) return
              e.stopPropagation()
              onToggleExpand()
            }}
            style={{
              cursor: hasChildren ? 'pointer' : 'default',
              color: category.color ?? undefined,
            }}
          >
            {hasChildren ? (isExpanded ? '▼' : '▶') : ''}
          </span>

          {/* 깊이 색상 도트 — 커스텀 색 있으면 자기 색, 없으면 depth 기본색 */}
          {depth > 0 && (category.color || ds.dot) && (
            <span
              className={['shrink-0 w-1 h-3.5 rounded-full', category.color ? '' : ds.dot].join(' ')}
              style={category.color ? { backgroundColor: category.color } : undefined}
            />
          )}

          {/* 폴더 아이콘 — 커스텀 색상 우선(fill 적용), 없으면 depth 기본 색상 */}
          <Folder
            size={14}
            className={'shrink-0' + (category.color ? '' : ' ' + ds.folder)}
            style={category.color ? { color: category.color } : undefined}
            fill={category.color ?? 'none'}
            strokeWidth={category.color ? 1.5 : 2}
          />

          {/* 폴더 이름 */}
          <span className="truncate flex-1">{category.name}</span>

          {/* 메모 수 배지 — hover 시 숨김 (액션 버튼과 겹침 방지) */}
          {pageCount > 0 && (
            <span className="shrink-0 text-[10px] text-gray-400 group-hover:hidden">
              {pageCount}
            </span>
          )}
        </button>
      )}

      {/* 액션 버튼들 — hover 시만 표시 */}
      {!isEditing && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddPage() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs"
            title={t.sidebar.addPageToFolder}
          >
            📄
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddChild() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs font-bold"
            title={t.sidebar.addSubfolder}
          >
            +
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all text-xs"
            title={t.sidebar.deleteFolder}
          >
            ✕
          </button>
        </div>
      )}

      {/* 폴더 우클릭 컨텍스트 메뉴 */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          sections={[
            { id: 'folder-info', title: category.name, actions: [] },
            {
              id: 'folder-actions',
              actions: [
                { id: 'rename', label: t.sidebar.renameFolder, icon: '✏️', onClick: () => { setIsEditing(true); setEditValue(category.name) } },
                { id: 'add-page', label: t.sidebar.addPageToFolder, icon: '📄', onClick: onAddPage },
                { id: 'add-child', label: t.sidebar.addSubfolder, icon: '📁', onClick: onAddChild },
              ],
            },
            {
              id: 'folder-color',
              title: t.sidebar.folderColor,
              actions: [],
              // 그룹별 색상 팔레트 커스텀 렌더링
              // Python으로 치면: for group in FOLDER_COLOR_GROUPS: render_group(group)
              customRender: (
                <div className="px-3 py-1.5 space-y-1.5" onMouseDown={e => e.stopPropagation()}>
                  {FOLDER_COLOR_GROUPS.map(group => (
                    <div key={group.id}>
                      <div className="text-[10px] text-gray-400 mb-1">{(t.sidebar as Record<string, string>)[group.id]}</div>
                      <div className="flex flex-wrap gap-1">
                        {group.colors.map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            title={c ?? t.sidebar.folderColorDefault}
                            onClick={() => { onColorChange(c); setCtxMenu(null) }}
                            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              background: c ?? '#e5e7eb',
                              borderColor: category.color === c ? '#1d4ed8'
                                : (c === null && !category.color) ? '#93c5fd'
                                : 'transparent',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              id: 'folder-danger',
              actions: [{ id: 'delete', label: t.sidebar.deleteFolder, icon: '🗑️', danger: true, onClick: onDelete }],
            },
          ]}
        />
      )}
    </div>
  )
}


// -----------------------------------------------
// CategoryRow 공통 props (SortableCategoryRow / DroppableCategoryRow 공유)
// -----------------------------------------------
export interface CategoryRowProps {
  category: Category
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  isSelected: boolean
  collapsed: boolean
  pageCount: number
  onToggleExpand: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddChild: () => void
  onAddPage: () => void
  onColorChange: (color: string | null) => void
}

// -----------------------------------------------
// SortableCategoryRow — 최상위 폴더 (depth=0, 순서 드래그 가능)
// Python으로 치면: class SortableCategoryRow(CategoryRowUI): uses_sortable = True
// -----------------------------------------------
export function SortableCategoryRow(props: CategoryRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, isOver,
  } = useSortable({
    id: props.category.id,
    // parentId: null = 최상위. handleDragEnd에서 같은 부모인지 확인할 때 사용
    data: { type: 'category', categoryId: props.category.id, parentId: null, depth: 0 },
  })

  return (
    <CategoryRowUI
      {...props}
      setNodeRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      isOver={isOver}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  )
}

// -----------------------------------------------
// DroppableCategoryRow — 하위 폴더 (depth>0, 드래그+드롭 모두 가능)
// useSortable = useDraggable + useDroppable 통합
// Python으로 치면: class SortableSubfolderRow(CategoryRowUI): uses_sortable = True
// -----------------------------------------------
export function DroppableCategoryRow(props: CategoryRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, isOver,
  } = useSortable({
    id: props.category.id,
    data: {
      type: 'category',
      categoryId: props.category.id,
      parentId: props.category.parentId ?? null,
      depth: props.depth,
    },
  })

  return (
    <CategoryRowUI
      {...props}
      setNodeRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      isOver={isOver}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  )
}

// -----------------------------------------------
// CollapsedFolderIcon — 접힘 모드용 폴더 아이콘
// .map() 안에서 훅 직접 호출 금지 → 별도 컴포넌트로 분리 (훅 규칙 준수)
// Python으로 치면: class CollapsedFolderIcon(Widget): uses_sortable = True
// -----------------------------------------------
export function CollapsedFolderIcon({ cat, isSelected, onSelect }: { cat: Category; isSelected: boolean; onSelect: () => void }) {
  const { setNodeRef, transform, transition } = useSortable({
    id: cat.id,
    data: { type: 'category', categoryId: cat.id },
  })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button
        onClick={onSelect}
        title={cat.name}
        className={isSelected
          ? "w-full flex items-center justify-center py-2 rounded-md bg-gray-200 text-gray-600"
          : "w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:bg-gray-100"}
      >
        <Folder size={16} />
      </button>
    </div>
  )
}
