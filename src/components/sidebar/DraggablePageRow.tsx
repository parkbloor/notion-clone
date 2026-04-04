// =============================================
// src/components/sidebar/DraggablePageRow.tsx
// 역할: 드래그 가능한 페이지 행 컴포넌트
// useSortable: 같은 카테고리 내 순서 변경 + 다른 폴더로 이동 모두 지원
// Python으로 치면: class DraggablePageRow(Widget): uses_sortable = True
// =============================================

'use client'

import { useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Page } from '@/types/block'
import { useLocale } from '@/locales'
import PageInlineMenu from './PageInlineMenu'

// -----------------------------------------------
// 드래그 가능한 페이지 행 props
// -----------------------------------------------
interface DraggablePageRowProps {
  page: Page
  depth: number             // 들여쓰기 깊이 (폴더 depth + 1)
  isSelected: boolean
  collapsed: boolean        // 사이드바 접힘 여부
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
  // 분할 뷰 콜백 — Ctrl+클릭 시 오른쪽 패널에 열기
  // Python으로 치면: on_split_page: Callable | None = None
  onSplitPage?: () => void
  // 검색 중일 때 카테고리 이름 표시
  searchCategoryName?: string | null
}

export default function DraggablePageRow({
  page, depth, isSelected, collapsed, onSelect, onDelete, onDuplicate, onSplitPage, searchCategoryName,
}: DraggablePageRowProps) {
  // Python으로 치면: t = get_locale()
  const t = useLocale()
  // useSortable = 드래그 핸들 + 드롭 대상 겸용 → 순서 변경과 폴더 이동 모두 동작
  // Python으로 치면: self.sortable = Sortable(id=page.id, data={type:'page'})
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    data: { type: 'page', pageId: page.id },
  })

  const [menuOpen, setMenuOpen] = useState(false)
  const handleCloseMenu = useCallback(() => setMenuOpen(false), [])

  // 팝업 표시 좌표 — fixed 포지셔닝으로 overflow 클리핑 우회
  // Python으로 치면: self.menu_anchor = (x, y)
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 })

  // 접힘 모드: 아이콘만 표시 (transform/transition 포함해야 드래그 애니메이션 동작)
  // Python으로 치면: if collapsed: return icon_only_view(transform=transform)
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
        <button
          onClick={(e) => {
            // Ctrl+클릭 → 분할 뷰로 열기
            // Python으로 치면: if e.ctrl and on_split_page: on_split_page()
            if (e.ctrlKey && onSplitPage) { e.preventDefault(); onSplitPage(); return }
            onSelect()
          }}
          title={(page.title || t.common.untitled) + ' ' + t.sidebar.ctrlClickSplitView}
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
      style={{ paddingLeft: `${indentPx}px`, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="group relative flex items-center"
    >
      {/* 드래그 핸들 — hover 시만 표시 */}
      <span
        className="shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs"
        {...attributes}
        {...listeners}
        title={t.sidebar.dragToFolder}
      >
        ⠿
      </span>

      {/* 페이지 선택 버튼 (Ctrl+클릭: 분할 뷰로 열기, 우클릭: 컨텍스트 메뉴) */}
      {/* Python으로 치면: if e.ctrl and on_split_page: on_split_page() else: on_select() */}
      <button
        onClick={(e) => {
          if (e.ctrlKey && onSplitPage) { e.preventDefault(); onSplitPage(); return }
          onSelect()
        }}
        onContextMenu={(e) => {
          // 우클릭 → 커서 위치에 PageInlineMenu 팝업 표시
          // 화면 오른쪽 끝 초과 방지: 메뉴 너비(176px) 고려해 보정
          // Python으로 치면: x = min(e.clientX, screen_width - 176 - 8)
          e.preventDefault()
          e.stopPropagation()
          const menuW = 176
          const safeX = Math.min(e.clientX, window.innerWidth - menuW - 8)
          const safeY = Math.min(e.clientY, window.innerHeight - 240)
          setMenuAnchor({ x: safeX, y: safeY })
          setMenuOpen(true)
        }}
        title={`${page.title || t.common.untitled} ${t.sidebar.ctrlClickSplitView}`}
        className={isSelected
          ? "flex-1 min-w-0 flex items-center gap-1 py-1 pr-10 rounded-md text-sm text-left bg-gray-200 text-gray-900"
          : "flex-1 min-w-0 flex items-center gap-1 py-1 pr-10 rounded-md text-sm text-left text-gray-600 hover:bg-gray-100 transition-colors"}
      >
        <span className="text-sm shrink-0">{page.icon}</span>
        <span className="truncate flex-1">{page.title || t.common.untitled}</span>
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
      {/* transform 있는 div 밖에 PageInlineMenu 렌더링 — fixed가 transform 기준으로 위치 잡히는 CSS 버그 방지 */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            // 버튼 우측 하단 좌표를 fixed 팝업 기준점으로 사용
            // Python으로 치면: rect = e.currentTarget.get_bounding_client_rect()
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const menuW = 176
            const safeX = Math.min(rect.right, window.innerWidth - menuW - 8)
            setMenuAnchor({ x: safeX - menuW, y: rect.bottom + 4 })
            setMenuOpen(v => !v)
          }}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all text-xs"
          title={t.sidebar.options}
        >
          •••
        </button>
      </div>
      {/* PageInlineMenu: -translate-y-1/2 div 밖에 위치해야 position:fixed가 뷰포트 기준으로 동작 */}
      {menuOpen && (
        <PageInlineMenu
          page={page}
          onClose={handleCloseMenu}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          anchorX={menuAnchor.x}
          anchorY={menuAnchor.y}
        />
      )}
    </div>
  )
}
