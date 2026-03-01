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

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Category, Page } from '@/types/block'
import CalendarWidget from './CalendarWidget'
import NewPageDialog from './NewPageDialog'
import { toast } from 'sonner'
import { templateApi } from '@/lib/api'

// dnd-kit: 폴더 정렬 + 페이지→폴더 드래그 이동
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
// 테이블 뷰 + 폴더 아이콘 (depth별 색상 적용을 위해 Lucide Folder 사용)
import { Table2, Folder } from 'lucide-react'


// -----------------------------------------------
// 깊이별 색상 스키마 (기존 CategorySidebar와 동일)
// folder: Lucide Folder 아이콘에 적용할 색상 클래스
// Python으로 치면: DEPTH_STYLES: list[dict] = [...]
// -----------------------------------------------
const DEPTH_STYLES = [
  // depth 0: 최상위 — 기본 회색
  { dot: '', folder: 'text-gray-400', normal: 'text-gray-600 hover:bg-gray-100', selected: 'bg-gray-200 text-gray-900', over: 'bg-blue-100 text-blue-800' },
  // depth 1 — 파란 계열
  { dot: 'bg-blue-400', folder: 'text-blue-400', normal: 'text-blue-600 hover:bg-blue-50', selected: 'bg-blue-100 text-blue-900', over: 'bg-blue-200 text-blue-900' },
  // depth 2 — 보라 계열
  { dot: 'bg-violet-400', folder: 'text-violet-500', normal: 'text-violet-600 hover:bg-violet-50', selected: 'bg-violet-100 text-violet-900', over: 'bg-violet-200 text-violet-900' },
  // depth 3+ — 초록 계열
  { dot: 'bg-teal-400', folder: 'text-teal-500', normal: 'text-teal-600 hover:bg-teal-50', selected: 'bg-teal-100 text-teal-900', over: 'bg-teal-200 text-teal-900' },
] as const


// -----------------------------------------------
// HTML 태그 제거 — 페이지 검색용 텍스트 추출
// Python으로 치면: def strip_html(html): return re.sub(r'<[^>]+>', ' ', html).strip()
// -----------------------------------------------
function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// 페이지 블록 전체 텍스트 추출 (검색용)
// Python으로 치면: def get_page_text(page): return ' '.join(b.text for b in page.blocks)
function getPageSearchText(page: Page): string {
  return page.blocks.map(b => {
    if (b.type === 'image') return ''
    if (b.type === 'toggle') {
      try {
        const p = JSON.parse(b.content)
        return stripHtml(p.header || '') + ' ' + stripHtml(p.body || '')
      } catch { return '' }
    }
    return stripHtml(b.content)
  }).join(' ')
}

// 페이지 블록 → 마크다운 (템플릿 저장용)
// Python으로 치면: def blocks_to_markdown(page): ...
function blocksToMarkdown(page: Page): string {
  const lines: string[] = []
  for (const block of page.blocks) {
    const text = block.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    switch (block.type) {
      case 'heading1': lines.push(`# ${text}`); break
      case 'heading2': lines.push(`## ${text}`); break
      case 'heading3': lines.push(`### ${text}`); break
      case 'heading4': lines.push(`#### ${text}`); break
      case 'heading5': lines.push(`##### ${text}`); break
      case 'heading6': lines.push(`###### ${text}`); break
      case 'divider':  lines.push('---'); break
      case 'code':     lines.push(`\`\`\`\n${text}\n\`\`\``); break
      case 'paragraph': if (text) lines.push(text); break
      default: if (text) lines.push(text)
    }
  }
  return lines.join('\n\n')
}


// -----------------------------------------------
// 페이지 인라인 컨텍스트 메뉴
// 페이지 행의 "•••" 버튼 클릭 시 나타나는 미니 메뉴
// Python으로 치면: class PageInlineMenu(Widget): ...
// -----------------------------------------------
interface PageInlineMenuProps {
  page: Page
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
}

function PageInlineMenu({ page, onClose, onDelete, onDuplicate }: PageInlineMenuProps) {
  const { categories, categoryMap, movePageToCategory } = usePageStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // 템플릿 저장 폼 표시 여부
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [templateName, setTemplateName] = useState(page.title || '')
  const [templateDesc, setTemplateDesc] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 메뉴 외부 클릭 → 닫기
  // Python으로 치면: document.addEventListener('click', close_if_outside)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const pageCategoryId = categoryMap[page.id] ?? null

  // 템플릿으로 저장
  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return
    setIsSaving(true)
    try {
      await templateApi.create({
        name: templateName.trim(),
        icon: page.icon || '📄',
        description: templateDesc.trim(),
        content: blocksToMarkdown(page),
      })
      toast.success(`"${templateName.trim()}" 템플릿으로 저장됐어요!`)
      onClose()
    } catch {
      toast.error('템플릿 저장에 실패했습니다.')
      setIsSaving(false)
    }
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      style={{ width: showSaveForm ? '210px' : '176px' }}
    >
      {showSaveForm ? (
        /* ── 템플릿 저장 폼 ── */
        <div className="px-3 py-2 space-y-2">
          <p className="text-xs font-medium text-gray-600">템플릿으로 저장</p>
          <input
            type="text" autoFocus
            value={templateName} onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowSaveForm(false) }}
            placeholder="템플릿 이름"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400"
          />
          <input
            type="text"
            value={templateDesc} onChange={e => setTemplateDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowSaveForm(false) }}
            placeholder="설명 (선택)"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400"
          />
          <div className="flex gap-1.5">
            <button
              type="button" onClick={handleSaveAsTemplate}
              disabled={!templateName.trim() || isSaving}
              className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button" onClick={() => setShowSaveForm(false)}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 카테고리로 이동 섹션 */}
          <div className="px-3 py-1 text-[10px] text-gray-400 font-medium uppercase">폴더로 이동</div>
          {pageCategoryId !== null && (
            <button
              onClick={() => { movePageToCategory(page.id, null); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
            >
              <span>📋</span><span>미분류</span>
            </button>
          )}
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => { movePageToCategory(page.id, cat.id); onClose() }}
              className={pageCategoryId === cat.id
                ? "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-blue-600 bg-blue-50"
                : "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
              }
            >
              <span>📁</span>
              <span className="truncate">{cat.name}</span>
              {pageCategoryId === cat.id && <span className="ml-auto text-blue-500">✓</span>}
            </button>
          ))}
          {/* 구분선 + 복제 + 템플릿 저장 + 삭제 */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => { onDuplicate(); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
            >
              <span>📋</span><span>복제</span>
            </button>
            <button
              onClick={() => setShowSaveForm(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
            >
              <span>⭐</span><span>템플릿으로 저장</span>
            </button>
            <button
              onClick={() => { onDelete(); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-red-500 hover:bg-red-50"
            >
              <span>🗑️</span><span>삭제</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}


// -----------------------------------------------
// 드래그 가능한 페이지 행 컴포넌트
// useDraggable: 폴더로 드래그 이동 지원 (페이지 내 정렬 없음 — 향후 추가 예정)
// Python으로 치면: class DraggablePageRow(Widget): uses_draggable = True
// -----------------------------------------------
interface DraggablePageRowProps {
  page: Page
  depth: number             // 들여쓰기 깊이 (폴더 depth + 1)
  isSelected: boolean
  collapsed: boolean        // 사이드바 접힘 여부
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
  // 검색 중일 때 카테고리 이름 표시
  searchCategoryName?: string | null
}

function DraggablePageRow({
  page, depth, isSelected, collapsed, onSelect, onDelete, onDuplicate, searchCategoryName,
}: DraggablePageRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: page.id,
    data: { type: 'page', pageId: page.id },
  })

  const [menuOpen, setMenuOpen] = useState(false)
  const handleCloseMenu = useCallback(() => setMenuOpen(false), [])

  // 접힘 모드: 아이콘만 표시
  if (collapsed) {
    return (
      <div ref={setNodeRef}>
        <button
          onClick={onSelect}
          title={page.title || '제목 없음'}
          className={isSelected
            ? "w-full flex items-center justify-center py-1.5 rounded-md text-base bg-gray-200"
            : "w-full flex items-center justify-center py-1.5 rounded-md text-base text-gray-500 hover:bg-gray-100"}
        >
          {page.icon}
        </button>
      </div>
    )
  }

  // 들여쓰기: 폴더와 같은 depth 스키마 사용 (페이지는 추가 8px indent)
  // Python으로 치면: indent_px = depth * 12 + 8  (폴더보다 약간 더 들여씀)
  const indentPx = depth * 12 + 8

  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: `${indentPx}px`, transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className="group relative flex items-center"
    >
      {/* 드래그 핸들 — hover 시만 표시 */}
      <span
        className="shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs"
        {...attributes}
        {...listeners}
        title="드래그하여 폴더로 이동"
      >
        ⠿
      </span>

      {/* 페이지 선택 버튼 */}
      <button
        onClick={onSelect}
        className={isSelected
          ? "flex-1 min-w-0 flex items-center gap-1 py-1 pr-10 rounded-md text-sm text-left bg-blue-100 text-blue-900"
          : "flex-1 min-w-0 flex items-center gap-1 py-1 pr-10 rounded-md text-sm text-left text-gray-600 hover:bg-gray-100 transition-colors"}
      >
        <span className="text-sm shrink-0">{page.icon}</span>
        <span className="truncate flex-1">{page.title || '제목 없음'}</span>
        {/* 검색 중일 때: 소속 폴더 배지 */}
        {searchCategoryName && (
          <span className="shrink-0 text-[10px] text-blue-500 bg-blue-50 px-1 py-0.5 rounded leading-tight">
            {searchCategoryName}
          </span>
        )}
        {/* 즐겨찾기 별 (starred이면 항상 표시) */}
        {page.starred && (
          <span className="shrink-0 text-yellow-400 text-xs">★</span>
        )}
      </button>

      {/* "•••" 컨텍스트 메뉴 버튼 (hover 시만 표시) */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all text-xs"
          title="옵션"
        >
          •••
        </button>
        {menuOpen && (
          <PageInlineMenu
            page={page}
            onClose={handleCloseMenu}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        )}
      </div>
    </div>
  )
}


// -----------------------------------------------
// 폴더 행 공통 UI (dnd 훅 없음)
// SortableCategoryRow / DroppableCategoryRow 모두 이것을 렌더링
// Python으로 치면: class CategoryRowUI(Widget): pure UI, no dnd
// -----------------------------------------------
interface CategoryRowUIProps {
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
  onAddPage: () => void   // 이 폴더에 새 페이지 추가
}

function CategoryRowUI({
  category, depth, hasChildren, isExpanded, isSelected, isOver, isDragging,
  collapsed, pageCount, dragHandleProps, setNodeRef, style,
  onToggleExpand, onSelect, onRename, onDelete, onAddChild, onAddPage,
}: CategoryRowUIProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(category.name)

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

  return (
    <div ref={setNodeRef} style={{ ...style, ...indentStyle }} className="group relative">
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
          className={isOver ? overBtn : isSelected ? selectedBtn : normalBtn}
          title="더블클릭으로 이름 변경"
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

          {/* 펼치기/접기 토글 */}
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

          {/* 깊이 색상 도트 */}
          {depth > 0 && ds.dot && (
            <span className={"shrink-0 w-1 h-3.5 rounded-full " + ds.dot} />
          )}

          {/* 폴더 아이콘 — depth별 색상 (Lucide Folder 아이콘으로 CSS 색상 제어) */}
          <Folder size={14} className={"shrink-0 " + ds.folder} />

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
          {/* 이 폴더에 새 페이지 추가 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddPage() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs"
            title="이 폴더에 메모 추가"
          >
            📄
          </button>
          {/* 하위 폴더 추가 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddChild() }}
            className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all text-xs font-bold"
            title="하위 폴더 추가"
          >
            +
          </button>
          {/* 삭제 */}
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
// SortableCategoryRow — 최상위 폴더 (depth=0, 순서 드래그 가능)
// Python으로 치면: class SortableCategoryRow(CategoryRowUI): uses_sortable = True
// -----------------------------------------------
interface CategoryRowProps {
  category: Category
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  isSelected: boolean
  collapsed: boolean
  pageCount: number       // 이 폴더에 직접 속한 메모 수 (배지 표시용)
  onToggleExpand: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddChild: () => void
  onAddPage: () => void
}

function SortableCategoryRow(props: CategoryRowProps) {
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
// useSortable = useDraggable + useDroppable 통합 → 순서 변경 + 다른 폴더로 이동 모두 지원
// Python으로 치면: class SortableSubfolderRow(CategoryRowUI): uses_sortable = True
// -----------------------------------------------
function DroppableCategoryRow(props: CategoryRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, isOver,
  } = useSortable({
    id: props.category.id,
    // parentId: 같은 부모끼리 순서 변경 vs 다른 부모로 이동 판별용
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
// 접힘 모드용 폴더 아이콘 — useSortable 훅을 컴포넌트 내에서 호출 (훅 규칙 준수)
// .map() 안에서 직접 훅 호출 금지 → 별도 컴포넌트로 분리
// Python으로 치면: class CollapsedFolderIcon(Widget): uses_sortable = True
// -----------------------------------------------
function CollapsedFolderIcon({ cat, isSelected, onSelect }: { cat: Category; isSelected: boolean; onSelect: () => void }) {
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
}


// -----------------------------------------------
// CategorySidebar (통합 파일 사이드바) — 메인 컴포넌트
// -----------------------------------------------
export default function CategorySidebar({
  onOpenSettings, onCloseMobile, dbViewActive, onToggleDbView,
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
  } = usePageStore()

  // ── 설정 스토어 ─────────────────────────────
  const {
    plugins,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
  } = useSettingsStore()

  // ── 컴포넌트 상태 ────────────────────────────
  // 펼쳐진 폴더 ID 집합 (Set에 있으면 펼쳐진 상태)
  // Python으로 치면: expanded_folder_ids: set[str] = set()
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set())

  // 검색어 — 입력 시 전체 페이지 전문 검색
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 캘린더 날짜 필터 (YYYY-MM-DD 또는 null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

  // ── 검색 결과 ────────────────────────────────
  // 검색어가 있을 때만 전체 페이지 필터링 (null이면 검색 모드 아님)
  // Python으로 치면: filtered = None if not query else [p for p in pages if ...]
  const filteredSearchPages = searchQuery.trim()
    ? pages.filter(p => {
        const q = searchQuery.toLowerCase()
        if (selectedDate) {
          // 날짜 필터와 검색 조합 지원
          const dateStr = p.createdAt instanceof Date
            ? `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth()+1).padStart(2,'0')}-${String(p.createdAt.getDate()).padStart(2,'0')}`
            : String(p.createdAt || '').slice(0, 10)
          if (dateStr !== selectedDate) return false
        }
        return p.title.toLowerCase().includes(q) || getPageSearchText(p).toLowerCase().includes(q)
      })
    : selectedDate
      // 날짜만 필터링 (검색어 없을 때)
      ? pages.filter(p => {
          const dateStr = p.createdAt instanceof Date
            ? `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth()+1).padStart(2,'0')}-${String(p.createdAt.getDate()).padStart(2,'0')}`
            : String(p.createdAt || '').slice(0, 10)
          return dateStr === selectedDate
        })
      : null

  // 검색/날짜 필터 활성 여부
  const isFiltering = filteredSearchPages !== null

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
    const cat = categories.find(c => c.id === catId)
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
              placeholder="하위 폴더 이름..."
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded outline-none"
            />
            <button
              onClick={() => handleAddChildFolder(catId)}
              className="px-1.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
            >
              확인
            </button>
          </div>
        )}

        {/* 펼침 상태: 이 폴더의 페이지 (인라인) + 하위 폴더 (재귀) */}
        {/* Python으로 치면: if is_expanded: render pages then child folders */}
        {isExpanded && !sidebarCollapsed && (
          <>
            {/* 폴더 내 페이지 인라인 표시 */}
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
              />
            ))}
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
                  placeholder="메모 이름..."
                  className="flex-1 min-w-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded outline-none"
                />
                <button
                  onClick={() => handleAddPageInCat(catId)}
                  className="px-1.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
                >
                  확인
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
          </>
        )}
      </div>
    )
  }

  // 최상위 폴더 순서대로 정렬
  const orderedTopFolders = categoryOrder
    .map(id => categories.find(c => c.id === id))
    .filter(Boolean) as Category[]

  // 미분류 페이지 (categoryId가 null)
  const uncategorizedPages = getPagesInCat(null)

  // ── 접힘 모드 렌더링 ────────────────────────────
  if (sidebarCollapsed) {
    return (
      <aside className="w-12 h-screen bg-gray-100 border-r border-gray-200 flex flex-col shrink-0 transition-[width] duration-200">
        {/* 헤더: 펼치기 버튼 */}
        <div className="px-2 py-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={toggleSidebarCollapsed}
            title="사이드바 펼치기"
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
              title="전체보기"
              className={isOverAll ? "w-full flex items-center justify-center py-2 rounded-md text-base bg-blue-100 text-blue-800" : currentCategoryId === null ? "w-full flex items-center justify-center py-2 rounded-md text-base bg-gray-200 text-gray-900" : "w-full flex items-center justify-center py-2 rounded-md text-base text-gray-600 hover:bg-gray-100"}
            >
              📋
            </button>
          </div>

          {/* 최상위 폴더 아이콘들 — CollapsedFolderIcon 컴포넌트로 hooks 규칙 준수 */}
          <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
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
            title="새 메모"
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base"
          >
            📄
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="설정"
            className="w-full flex items-center justify-center py-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base"
          >
            ⚙️
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
        className="h-screen bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 relative"
      >

        {/* ── 헤더 ────────────────────────────────── */}
        <div className="px-2 py-2.5 border-b border-gray-200 flex items-center gap-1">
          {/* 접기 버튼 */}
          <button
            onClick={toggleSidebarCollapsed}
            title="사이드바 접기"
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-sm font-bold shrink-0"
          >
            ‹
          </button>

          {/* 제목 */}
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest truncate flex-1 px-1">
            메모
          </span>

          {/* 데이터베이스 테이블 뷰 버튼 */}
          <button
            type="button"
            onClick={onToggleDbView}
            title="테이블 뷰"
            className={dbViewActive
              ? "flex items-center justify-center w-6 h-6 rounded-md text-blue-500 bg-blue-50 transition-colors shrink-0"
              : "flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"}
          >
            <Table2 size={13} />
          </button>

          {/* 새 메모 버튼 */}
          <button
            onClick={() => setNewPageDialogOpen(true)}
            title="새 메모"
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-base shrink-0"
          >
            📄
          </button>

          {/* 설정 버튼 */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="설정 열기"
            className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors text-sm shrink-0"
          >
            ⚙️
          </button>
        </div>

        {/* ── 검색바 ───────────────────────────────── */}
        <div className="px-2 py-2 border-b border-gray-100">
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
              placeholder="전체 메모 검색..."
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

        {/* ── 캘린더 위젯 (플러그인 ON일 때만) ────── */}
        {plugins.calendar && (
          <CalendarWidget
            pages={pages}
            selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setSearchQuery('') }}
          />
        )}

        {/* ── 날짜 필터 활성 안내 ─────────────────── */}
        {selectedDate && !searchQuery && (
          <div className="px-2 py-1 flex items-center gap-1 bg-blue-50 border-b border-blue-100">
            <span className="text-xs text-blue-600 flex-1">{selectedDate} 날짜 필터</span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs text-blue-400 hover:text-blue-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── 트리 / 검색 결과 / 두 섹션 레이아웃 ─────────────────────────── */}
        {isFiltering ? (
          /* ── 검색/날짜 필터 결과 — 단일 스크롤 영역 ── */
          <nav className="flex-1 overflow-y-auto px-1.5 py-2">
            {filteredSearchPages!.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <p className="text-xs text-gray-400">
                  {searchQuery.trim() ? `"${searchQuery}" 검색 결과 없음` : '해당 날짜에 메모가 없습니다'}
                </p>
              </div>
            ) : (
              filteredSearchPages!.map(page => {
                const catId = categoryMap[page.id] ?? null
                const catName = catId
                  ? (categories.find(c => c.id === catId)?.name ?? null)
                  : (searchQuery ? '미분류' : null)
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
                <span className="text-base">📋</span>
                <span>전체보기</span>
              </button>
            </div>

            {/* 구분선 */}
            {orderedTopFolders.length > 0 && (
              <div className="border-t border-gray-200 my-1" />
            )}

            {/* 폴더 트리 (인라인 페이지 포함, 최상위 정렬 가능) */}
            <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
              {orderedTopFolders.map(cat => renderFolder(cat.id, 0))}
            </SortableContext>

            {/* 미분류 페이지 (폴더에 속하지 않은 페이지) */}
            {uncategorizedPages.length > 0 && (
              <>
                <div className="border-t border-gray-200 my-1 mt-2" />
                <div className="px-2 py-0.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">미분류</div>
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
                  placeholder="폴더 이름..."
                  className="flex-1 min-w-0 px-2 py-1 text-sm bg-white border border-gray-300 rounded outline-none"
                />
                <button
                  onClick={handleAddTopFolder}
                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 shrink-0"
                >
                  확인
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
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">최근 파일</span>
            </div>
            {recentPageIds.slice(0, 5).map(pageId => {
              const page = pages.find(p => p.id === pageId)
              if (!page) return null
              return (
                <button
                  key={pageId}
                  type="button"
                  onClick={() => handleSelectPage(pageId)}
                  className={currentPageId === pageId
                    ? "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-left bg-gray-200 text-gray-900"
                    : "w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-left text-gray-500 hover:bg-gray-100 transition-colors"}
                >
                  <span className="shrink-0">{page.icon}</span>
                  <span className="truncate">{page.title || '제목 없음'}</span>
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
            <span>새 메모</span>
          </button>
          {/* 새 폴더 버튼 */}
          {!isAddingTopFolder && (
            <button
              onClick={() => setIsAddingTopFolder(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              <span>새 폴더</span>
            </button>
          )}
        </div>

        {/* ── 리사이즈 핸들 ──────────────────────────
            사이드바 오른쪽 가장자리 4px 영역
            마우스다운 → 드래그로 너비 조절 (160 ~ 480px)
            Python으로 치면: self.resize_handle = QSizeGrip(self) */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-10"
          title="드래그로 사이드바 너비 조절"
        />

      </aside>

      {/* 새 페이지 다이얼로그 (aside 밖에 portal로 렌더링) */}
      {newPageDialogOpen && (
        <NewPageDialog categoryId={currentCategoryId} onClose={() => setNewPageDialogOpen(false)} />
      )}
    </>
  )
}
