// =============================================
// src/components/editor/SlashCommand.tsx
// 역할: / 입력 시 나타나는 블록 타입 선택 메뉴 (플라이아웃 이중 패널)
// =============================================

'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Editor as TiptapEditor } from '@tiptap/react'
import { BlockType } from '@/types/block'
import { useSettingsStore } from '@/store/settingsStore'
import { useVaultPreferencesStore } from '@/store/vaultPreferencesStore'
import { useLocale } from '@/locales'

interface SlashCommandProps {
  editor: TiptapEditor
  isOpen: boolean
  position: { top?: number; bottom?: number; left: number }
  onSelect: (type: BlockType) => void
  onClose: () => void
  onClickOutside: () => void
  searchQuery: string
}

export default function SlashCommand({
  isOpen,
  position,
  onSelect,
  onClose,
  onClickOutside,
  searchQuery,
}: SlashCommandProps) {

  // 현재 플라이아웃을 표시할 카테고리 키 (마우스 호버 or 키보드 탐색으로 설정)
  // Python으로 치면: active_category: Optional[str] = None
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // 키보드가 어느 패널을 제어하는지 — 'categories' | 'items'
  // Python으로 치면: focus_pane = 'categories'
  const [focusPane, setFocusPane] = useState<'categories' | 'items'>('categories')

  // 카테고리 패널의 키보드 포커스 인덱스
  // Python으로 치면: category_index = 0
  const [categoryIndex, setCategoryIndex] = useState(0)

  // 항목 패널의 키보드 포커스 인덱스
  // Python으로 치면: item_index = 0
  const [itemIndex, setItemIndex] = useState(0)

  // 검색 모드 flat 결과의 포커스 인덱스
  // Python으로 치면: search_index = 0
  const [searchIndex, setSearchIndex] = useState(0)

  // 항목 패널 스크롤용 ref
  // Python으로 치면: item_ref = None
  const itemRef = useRef<HTMLButtonElement>(null)

  // 카테고리 패널 스크롤용 ref
  // Python으로 치면: category_ref = None
  const categoryRef = useRef<HTMLButtonElement>(null)

  // 검색 결과 스크롤용 ref
  const searchRef = useRef<HTMLButtonElement>(null)

  // 팝업 DOM — 외부 클릭 감지용
  const popupRef = useRef<HTMLDivElement>(null)

  // 번역 훅
  const t = useLocale()

  // 플러그인 설정
  const { plugins } = useSettingsStore()
  const showPlannerBlocks = useVaultPreferencesStore(
    state => state.preferences.planner.slashPlannerBlocks,
  )

  // ── 7개 카테고리 커맨드 목록 ──────────────────────────────────────
  // Python으로 치면: COMMANDS = [{'key':..., 'group':..., 'items':[...]}, ...]
  const COMMANDS = useMemo(() => [
    {
      key: 'text',
      group: t.slash.groupText,
      items: [
        { icon: '📝', name: t.slash.paragraph.label,  description: t.slash.paragraph.desc,  type: 'paragraph' as BlockType },
        { icon: '▶',  name: t.slash.toggle.label,     description: t.slash.toggle.desc,     type: 'toggle'    as BlockType },
        { icon: '🔠', name: t.slash.heading1.label,   description: t.slash.heading1.desc,   type: 'heading1'  as BlockType },
        { icon: '🔡', name: t.slash.heading2.label,   description: t.slash.heading2.desc,   type: 'heading2'  as BlockType },
        { icon: '🔤', name: t.slash.heading3.label,   description: t.slash.heading3.desc,   type: 'heading3'  as BlockType },
        { icon: 'H4', name: t.slash.heading4.label,   description: t.slash.heading4.desc,   type: 'heading4'  as BlockType },
        { icon: 'H5', name: t.slash.heading5.label,   description: t.slash.heading5.desc,   type: 'heading5'  as BlockType },
        { icon: 'H6', name: t.slash.heading6.label,   description: t.slash.heading6.desc,   type: 'heading6'  as BlockType },
      ],
    },
    {
      key: 'list',
      group: t.slash.groupList,
      items: [
        { icon: '•',  name: t.slash.bulletList.label,  description: t.slash.bulletList.desc,  type: 'bulletList'  as BlockType },
        { icon: '1.', name: t.slash.orderedList.label, description: t.slash.orderedList.desc, type: 'orderedList' as BlockType },
        { icon: '☑️', name: t.slash.taskList.label,    description: t.slash.taskList.desc,    type: 'taskList'    as BlockType },
      ],
    },
    {
      key: 'media',
      group: t.slash.groupMedia,
      items: [
        { icon: '🖼️', name: t.slash.image.label,      description: t.slash.image.desc,      type: 'image'      as BlockType },
        { icon: '🎬', name: t.slash.video.label,       description: t.slash.video.desc,       type: 'video'      as BlockType },
        { icon: '🎨', name: t.slash.canvas.label,      description: t.slash.canvas.desc,      type: 'canvas'     as BlockType },
        { icon: '✏️', name: t.slash.excalidraw.label,  description: t.slash.excalidraw.desc,  type: 'excalidraw' as BlockType },
        { icon: '🔗', name: t.slash.embed.label,       description: t.slash.embed.desc,       type: 'embed'      as BlockType },
        { icon: '📎', name: t.slash.file.label,        description: t.slash.file.desc,        type: 'file'       as BlockType },
      ],
    },
    {
      key: 'data',
      group: t.slash.groupData,
      items: [
        { icon: '📊', name: t.slash.table.label,     description: t.slash.table.desc,     type: 'table'   as BlockType },
        { icon: '📋', name: t.slash.kanban.label,    description: t.slash.kanban.desc,    type: 'kanban'  as BlockType },
        { icon: '💻', name: t.slash.codeBlock.label, description: t.slash.codeBlock.desc, type: 'code'    as BlockType },
        { icon: '∑',  name: t.slash.math.label,      description: t.slash.math.desc,      type: 'math'    as BlockType },
        { icon: '🔀', name: t.slash.mermaid.label,   description: t.slash.mermaid.desc,   type: 'mermaid' as BlockType },
        { icon: '📈', name: t.slash.chart.label,     description: t.slash.chart.desc,     type: 'chart'   as BlockType },
        { icon: '📅', name: t.slash.gantt.label,     description: t.slash.gantt.desc,     type: 'gantt'   as BlockType },
        { icon: '🧠', name: t.slash.mindmap.label,   description: t.slash.mindmap.desc,   type: 'mindmap' as BlockType },
        { icon: '📑', name: t.slash.toc.label,       description: t.slash.toc.desc,       type: 'toc'     as BlockType },
      ],
    },
    {
      key: 'advanced',
      group: t.slash.groupAdvanced,
      items: [
        { icon: '💡', name: t.slash.admonition.label, description: t.slash.admonition.desc, type: 'admonition' as BlockType },
        { icon: '➖', name: t.slash.divider.label,    description: t.slash.divider.desc,    type: 'divider'    as BlockType },
        { icon: '📐', name: t.slash.layout.label,     description: t.slash.layout.desc,     type: 'layout'     as BlockType },
      ],
    },
    {
      key: 'planner',
      group: t.slash.groupPlanner,
      items: [
        { icon: '📌', name: t.slash.record.label,        description: t.slash.record.desc,        type: 'record'           as BlockType },
        { icon: '🗓️', name: t.slash.dayPlanner.label,    description: t.slash.dayPlanner.desc,    type: 'dayplanner'       as BlockType },
        { icon: '🗃️', name: t.slash.weekPlanner.label,   description: t.slash.weekPlanner.desc,   type: 'weekplanner'      as BlockType },
        { icon: '📆', name: t.slash.weeklyPlanner.label, description: t.slash.weeklyPlanner.desc, type: 'weeklyplanner'    as BlockType },
        { icon: '🔄', name: t.slash.routineMatrix.label, description: t.slash.routineMatrix.desc, type: 'routinematrix'    as BlockType },
        { icon: '📅', name: t.slash.monthly.label,       description: t.slash.monthly.desc,       type: 'monthlycalendar'  as BlockType },
        { icon: '📊', name: t.slash.quarterly.label,     description: t.slash.quarterly.desc,     type: 'quarterlyplanner' as BlockType },
        { icon: '🌟', name: t.slash.yearly.label,        description: t.slash.yearly.desc,        type: 'yearlyplanner'    as BlockType },
      ],
    },
    {
      key: 'ai',
      group: t.slash.groupAI,
      items: [
        { icon: '✨', name: t.slash.aiWrite.label, description: t.slash.aiWrite.desc, type: 'ai' as BlockType },
      ],
    },
  ], [t])

  // ── 플러그인 OFF → 해당 BlockType 숨김 ─────────────────────────
  // Python으로 치면: plugin_block_map = {'kanban': plugins.kanban, ...}
  const pluginBlockMap: Partial<Record<BlockType, boolean>> = {
    kanban:     plugins.kanban,
    admonition: plugins.admonition,
    canvas:     plugins.canvas,
    excalidraw: plugins.excalidraw,
    layout:     plugins.layoutEnabled,
    chart:      plugins.chart,
    gantt:      plugins.gantt,
    mindmap:    plugins.mindmap,
    math:       plugins.math,
  }

  // 플러그인 필터 적용 후 카테고리 목록
  // Python으로 치면: visible_cats = filter_by_plugins(COMMANDS)
  const filteredCategories = useMemo(() => (
    COMMANDS
      .filter(cat => showPlannerBlocks || cat.key !== 'planner')
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          !(item.type in pluginBlockMap) || !!pluginBlockMap[item.type as BlockType]
        ),
      }))
      .filter(cat => cat.items.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [COMMANDS, plugins, showPlannerBlocks])

  // 현재 활성 카테고리의 항목 목록
  // Python으로 치면: active_items = get_items(active_category)
  const activeItems = useMemo(() => {
    if (!activeCategory) return []
    return filteredCategories.find(c => c.key === activeCategory)?.items ?? []
  }, [activeCategory, filteredCategories])

  // 검색 모드: 모든 항목 flat 필터
  // Python으로 치면: search_results = [i for c in cats for i in c.items if q in i.name]
  const searchResults = useMemo(() => {
    if (!searchQuery) return []
    const q = searchQuery.toLowerCase()
    return filteredCategories.flatMap(cat =>
      cat.items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      )
    )
  }, [filteredCategories, searchQuery])

  // ── 카테고리 호버 핸들러 (마우스) ──────────────────────────────
  // Python으로 치면: def on_cat_hover(key, idx): active_category = key
  const handleCategoryHover = useCallback((key: string, idx: number) => {
    setActiveCategory(key)
    setCategoryIndex(idx)
    setFocusPane('categories')
    setItemIndex(0)
  }, [])

  // ── 키보드 이벤트 처리 ────────────────────────────────────────
  // Python으로 치면: def handle_keydown(e): ...
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return

    // 검색 모드: flat 결과 내비게이션
    if (searchQuery) {
      const total = searchResults.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSearchIndex(i => (i + 1) % total)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSearchIndex(i => (i - 1 + total) % total)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (searchResults[searchIndex]) onSelect(searchResults[searchIndex].type)
      } else if (e.key === 'Escape') {
        onClose()
      }
      return
    }

    // 항목 패널 키보드 모드
    if (focusPane === 'items') {
      const total = activeItems.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setItemIndex(i => (i + 1) % total)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setItemIndex(i => (i - 1 + total) % total)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeItems[itemIndex]) onSelect(activeItems[itemIndex].type)
      } else if (e.key === 'ArrowLeft') {
        // ← : 카테고리 패널로 복귀
        e.preventDefault()
        setFocusPane('categories')
      } else if (e.key === 'Escape') {
        onClose()
      }
      return
    }

    // 카테고리 패널 키보드 모드
    const catTotal = filteredCategories.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (categoryIndex + 1) % catTotal
      setCategoryIndex(next)
      setActiveCategory(filteredCategories[next]?.key ?? null)
      setItemIndex(0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = (categoryIndex - 1 + catTotal) % catTotal
      setCategoryIndex(prev)
      setActiveCategory(filteredCategories[prev]?.key ?? null)
      setItemIndex(0)
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      // → 또는 Enter: 항목 패널로 진입
      e.preventDefault()
      if (!activeCategory && filteredCategories[categoryIndex]) {
        setActiveCategory(filteredCategories[categoryIndex].key)
      }
      setFocusPane('items')
      setItemIndex(0)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [
    isOpen, searchQuery, focusPane, searchResults, searchIndex,
    activeItems, itemIndex, filteredCategories, categoryIndex,
    activeCategory, onSelect, onClose,
  ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // 검색어 변경 시 인덱스 초기화
  useEffect(() => {
    setSearchIndex(0)
  }, [searchQuery])

  // 팝업 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setActiveCategory(null)
      setFocusPane('categories')
      setCategoryIndex(0)
      setItemIndex(0)
      setSearchIndex(0)
    }
  }, [isOpen])

  // 카테고리 키보드 포커스 자동 스크롤
  useEffect(() => {
    if (categoryRef.current) categoryRef.current.scrollIntoView({ block: 'nearest' })
  }, [categoryIndex])

  // 항목 키보드 포커스 자동 스크롤
  useEffect(() => {
    if (itemRef.current) itemRef.current.scrollIntoView({ block: 'nearest' })
  }, [itemIndex])

  // 검색 포커스 자동 스크롤
  useEffect(() => {
    if (searchRef.current) searchRef.current.scrollIntoView({ block: 'nearest' })
  }, [searchIndex])

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return
    function handleOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClickOutside()
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [isOpen, onClickOutside])

  // ── 팝업 위치 계산 (화면 잘림 방지) ──────────────────────────
  // 플라이아웃 포함 최대 너비 384px 기준으로 계산
  // Python으로 치면: adjusted_left = clamp(left, 8, vw - MAX_W - 8)
  const MAX_W = 384
  const adjustedLeft = useMemo(
    () => Math.max(8, Math.min(position.left, window.innerWidth - MAX_W - 8)),
    [position.left]
  )

  if (!isOpen) return null

  // ── 검색 결과 없음 ────────────────────────────────────────────
  // createPortal로 document.body에 직접 마운트 → 에디터 group 요소의 DOM 트리에서 분리
  // group-hover: CSS 트리거 방지 (드래그 핸들 등이 반투명하게 나타나는 버그 수정)
  // Python으로 치면: document.body.appendChild(popup_element)
  if (searchQuery && searchResults.length === 0) {
    return createPortal(
      <div
        ref={popupRef}
        style={{ top: position.top, bottom: position.bottom, left: adjustedLeft }}
        className="fixed z-50 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
      >
        <p className="text-sm text-gray-400 text-center">{t.common.noResults}</p>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      ref={popupRef}
      style={{ top: position.top, bottom: position.bottom, left: adjustedLeft }}
      className="fixed z-50 flex bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
    >
      {searchQuery ? (
        // ── 검색 모드: 단일 패널 flat 결과 ──────────────────────
        <div className="w-72 py-1">
          <div className="px-3 py-1.5 border-b border-gray-100">
            <p className="text-xs text-gray-400">
              {t.common.search}: <span className="text-gray-600 font-medium">{searchQuery}</span>
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {searchResults.map((item, idx) => {
              const isSel = searchIndex === idx
              return (
                <button
                  key={item.type}
                  ref={isSel ? searchRef : null}
                  onClick={() => onSelect(item.type)}
                  className={
                    isSel
                      ? "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors bg-blue-50 text-blue-700"
                      : "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 text-gray-700"
                  }
                >
                  <span className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded text-sm shrink-0">
                    {item.icon}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        // ── 플라이아웃 모드: 카테고리 패널 + 항목 패널 나란히 ───
        <>
          {/* 왼쪽: 카테고리 패널 */}
          <div className="w-36 border-r border-gray-100 py-1 shrink-0">
            <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t.slash.addBlock}
            </p>
            {filteredCategories.map((cat, idx) => {
              // 카테고리 하이라이트: 호버 중이거나 키보드 포커스 중
              // Python으로 치면: is_active = active_category == cat.key
              const isActive = activeCategory === cat.key
              const isKbFocus = focusPane === 'categories' && categoryIndex === idx
              return (
                <button
                  key={cat.key}
                  ref={isKbFocus ? categoryRef : null}
                  onMouseEnter={() => handleCategoryHover(cat.key, idx)}
                  onClick={() => {
                    setFocusPane('items')
                    setItemIndex(0)
                  }}
                  className={
                    isActive || isKbFocus
                      ? "w-full flex items-center justify-between px-3 py-2 text-left transition-colors bg-blue-50 text-blue-700"
                      : "w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-gray-50 text-gray-700"
                  }
                >
                  <span className="text-sm font-medium truncate">{cat.group}</span>
                  <span className="text-gray-400 text-xs ml-1 shrink-0">›</span>
                </button>
              )
            })}
          </div>

          {/* 오른쪽: 항목 패널 (활성 카테고리가 있을 때만 표시) */}
          {/* max-h-72 + overflow-hidden: 왼쪽 카테고리 패널(~294px)보다 작게 고정 → 컨테이너 높이 안정화 */}
          {activeCategory && (
            <div className="w-60 py-1 border-l border-gray-100 max-h-72 flex flex-col overflow-hidden">
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                {filteredCategories.find(c => c.key === activeCategory)?.group}
              </p>
              <div className="flex-1 overflow-y-auto">
                {activeItems.map((item, idx) => {
                  // 항목 하이라이트: 키보드가 항목 패널에 있을 때만 적용
                  // Python으로 치면: is_kb_sel = focus_pane == 'items' and item_index == idx
                  const isKbSel = focusPane === 'items' && itemIndex === idx
                  return (
                    <button
                      key={item.type}
                      ref={isKbSel ? itemRef : null}
                      onMouseEnter={() => {
                        setItemIndex(idx)
                        setFocusPane('items')
                      }}
                      onClick={() => onSelect(item.type)}
                      className={
                        isKbSel
                          ? "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors bg-blue-50 text-blue-700"
                          : "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50 text-gray-700"
                      }
                    >
                      <span className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded text-sm shrink-0">
                        {item.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 truncate">{item.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  )
}
