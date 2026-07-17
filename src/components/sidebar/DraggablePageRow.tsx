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
  // 다중 선택 모드 — 드래그/열기 대신 체크박스로 이동 대상을 고른다.
  selectionMode?: boolean
  isBulkSelected?: boolean
  onToggleBulkSelection?: () => void
  bulkSelectedPageIds?: string[]
  onBulkMoveComplete?: (successCount: number, totalCount: number) => void
}

export default function DraggablePageRow({
  page, depth, isSelected, collapsed, onSelect, onDelete, onDuplicate, onSplitPage, searchCategoryName,
  selectionMode = false, isBulkSelected = false, onToggleBulkSelection,
  bulkSelectedPageIds = [], onBulkMoveComplete,
}: DraggablePageRowProps) {
  // Python으로 치면: t = get_locale()
  const t = useLocale()
  // useSortable = 드래그 핸들 + 드롭 대상 겸용 → 순서 변경과 폴더 이동 모두 동작
  // Python으로 치면: self.sortable = Sortable(id=page.id, data={type:'page'})
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    data: {
      type: 'page',
      pageId: page.id,
      bulkPageIds: selectionMode && isBulkSelected ? bulkSelectedPageIds : undefined,
      onBulkMoveComplete: selectionMode && isBulkSelected ? onBulkMoveComplete : undefined,
    },
  })
  const dragActivatorProps = { ...attributes, ...listeners }
  const pageButtonActivatorProps = selectionMode ? {} : dragActivatorProps
  const pageColor = page.color ?? null
  const pageColorBg = pageColor ? `${pageColor}1f` : undefined

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
          {...pageButtonActivatorProps}
          onClick={(e) => {
            if (selectionMode) { onToggleBulkSelection?.(); return }
            // Ctrl+클릭 → 분할 뷰로 열기
            // Python으로 치면: if e.ctrl and on_split_page: on_split_page()
            if (e.ctrlKey && onSplitPage) { e.preventDefault(); onSplitPage(); return }
            onSelect()
          }}
          title={(page.title || t.common.untitled) + ' ' + t.sidebar.ctrlClickSplitView}
          className={isBulkSelected
            ? "relative w-full flex items-center justify-center py-1.5 rounded-md text-base ring-2 ring-inset"
            : isSelected
            ? "relative w-full flex items-center justify-center py-1.5 rounded-md text-base"
            : "relative w-full flex items-center justify-center py-1.5 rounded-md text-base"}
          style={isBulkSelected
            ? { background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", borderColor: "var(--color-accent)" }
            : isSelected
            ? { background: "var(--color-active)", color: "var(--color-text)" }
            : { background: pageColorBg, color: "var(--color-text-muted)" }}
          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--color-hover)" }}
          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = pageColorBg ?? "" }}
        >
          {pageColor && (
            <span
              className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3 rounded-full"
              style={{ backgroundColor: pageColor }}
            />
          )}
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
      className={isDragging ? "group relative flex items-center cursor-grabbing" : "group relative flex items-center"}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={isBulkSelected}
          onChange={() => onToggleBulkSelection?.()}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${page.title || t.common.untitled} ${t.sidebar.selectNote}`}
          className="w-3.5 h-3.5 shrink-0 cursor-pointer accent-(--color-accent)"
        />
      )}
      {/* 다중 선택 모드에서는 선택된 메모에만 묶음 드래그 손잡이를 활성화 */}
      <span
        className={selectionMode
          ? `shrink-0 text-xs ${isBulkSelected ? 'cursor-grab opacity-100' : 'cursor-not-allowed opacity-20'}`
          : 'shrink-0 cursor-grab opacity-0 group-hover:opacity-100 text-xs'}
        style={{ color: "var(--color-text-faint)" }}
        {...(selectionMode && !isBulkSelected ? {} : dragActivatorProps)}
        title={selectionMode ? t.sidebar.dragSelectedToFolder : t.sidebar.dragToFolder}
      >
        ⠿
      </span>

      {/* 페이지 선택 버튼 (Ctrl+클릭: 분할 뷰로 열기, 우클릭: 컨텍스트 메뉴) */}
      {/* Python으로 치면: if e.ctrl and on_split_page: on_split_page() else: on_select() */}
      <button
        {...pageButtonActivatorProps}
        onClick={(e) => {
          if (selectionMode) { onToggleBulkSelection?.(); return }
          if (e.ctrlKey && onSplitPage) { e.preventDefault(); onSplitPage(); return }
          onSelect()
        }}
        onContextMenu={(e) => {
          // 우클릭 → 커서 위치에 PageInlineMenu 팝업 표시
          // 화면 오른쪽 끝 초과 방지: 메뉴 너비(176px) 고려해 보정
          // Python으로 치면: x = min(e.clientX, screen_width - 176 - 8)
          e.preventDefault()
          e.stopPropagation()
          const menuW = 224
          const menuH = 360  // 색상 팔레트 포함 메뉴 예상 최대 높이
          const safeX = Math.min(e.clientX, window.innerWidth - menuW - 8)
          // 아래 공간이 부족하면 위로 뒤집기 (flip)
          const safeY = e.clientY + menuH > window.innerHeight
            ? Math.max(0, e.clientY - menuH)
            : e.clientY
          setMenuAnchor({ x: safeX, y: safeY })
          setMenuOpen(true)
        }}
        title={`${page.title || t.common.untitled} ${t.sidebar.ctrlClickSplitView}`}
        className={isDragging
          ? "flex-1 min-w-0 flex items-center gap-1 py-1 pr-10 rounded-md text-sm text-left transition-colors cursor-grabbing"
          : selectionMode
            ? "flex-1 min-w-0 flex items-center gap-1 py-1 pr-2 rounded-md text-sm text-left transition-colors cursor-pointer"
            : "flex-1 min-w-0 flex items-center gap-1 py-1 pr-10 rounded-md text-sm text-left transition-colors cursor-grab"}
        style={isBulkSelected
          ? { background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", fontWeight: 600 }
          : isSelected
          ? { background: "var(--color-active)", color: "var(--color-text)", fontWeight: 600 }
          : { background: pageColorBg, color: "var(--color-text-muted)" }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--color-hover)" }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = pageColorBg ?? "" }}
      >
        {pageColor && (
          <span
            className="w-1 h-4 rounded-full shrink-0"
            style={{ backgroundColor: pageColor }}
          />
        )}
        <span className="text-sm shrink-0">{page.icon}</span>
        <span className="truncate flex-1">{page.title || t.common.untitled}</span>
        {/* 검색 중일 때: 소속 폴더 배지 */}
        {searchCategoryName && (
          <span className="chip shrink-0" style={{ padding: "1px 6px", fontSize: 10 }}>
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
      {!selectionMode && <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            // 버튼 우측 하단 좌표를 fixed 팝업 기준점으로 사용
            // Python으로 치면: rect = e.currentTarget.get_bounding_client_rect()
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const menuW = 224
            // 메뉴를 버튼 우측 기준으로 배치하되 화면 오른쪽 끝 초과 방지
            // Python으로 치면: x = max(0, min(rect.right - menu_w, screen_w - menu_w - 8))
            const x = Math.max(0, Math.min(rect.right - menuW, window.innerWidth - menuW - 8))
            setMenuAnchor({ x, y: rect.bottom + 4 })
            setMenuOpen(v => !v)
          }}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded transition-all text-xs"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)" }}
          title={t.sidebar.options}
        >
          •••
        </button>
      </div>}
      {/* PageInlineMenu: -translate-y-1/2 div 밖에 위치해야 position:fixed가 뷰포트 기준으로 동작 */}
      {!selectionMode && menuOpen && (
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
