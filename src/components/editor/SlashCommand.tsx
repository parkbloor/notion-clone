// =============================================
// src/components/editor/SlashCommand.tsx
// 역할: / 입력 시 나타나는 블록 타입 선택 메뉴
// =============================================

'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { BlockType } from '@/types/block'
import { useSettingsStore } from '@/store/settingsStore'
import { useLocale } from '@/locales'

interface SlashCommandProps {
  editor: TiptapEditor
  isOpen: boolean
  position: { top: number; left: number }
  onSelect: (type: BlockType) => void
  onClose: () => void              // Escape 키: 팝업만 닫기 (/ 텍스트 유지)
  onClickOutside: () => void       // 외부 클릭: 팝업 닫기 + /query 텍스트 삭제
  searchQuery: string
}

export default function SlashCommand({
  editor: _editor,
  isOpen,
  position,
  onSelect,
  onClose,
  onClickOutside,
  searchQuery,
}: SlashCommandProps) {

  const [selectedIndex, setSelectedIndex] = useState(0)

  // 선택된 버튼으로 스크롤하기 위한 ref
  // Python으로 치면: selected_ref = None
  const selectedRef = useRef<HTMLButtonElement>(null)
  // 팝업 DOM 참조 — 외부 클릭 감지용
  // Python으로 치면: self.popup_ref = None
  const popupRef = useRef<HTMLDivElement>(null)

  // 번역 훅
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 플러그인 설정 읽기 — 비활성화된 플러그인은 메뉴에서 숨김
  // Python으로 치면: plugins = settings_store.plugins
  const { plugins } = useSettingsStore()

  // ── 슬래시 커맨드 항목 목록 (번역 적용, useMemo로 t 변경 시 재생성) ──
  // COMMANDS가 모듈 레벨 상수였으나 번역 적용을 위해 컴포넌트 내부 useMemo로 이동
  // Python으로 치면: commands = compute_commands(t)
  const COMMANDS = useMemo(() => [
    {
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
      ]
    },
    {
      group: t.slash.groupList,
      items: [
        { icon: '•',  name: t.slash.bulletList.label,  description: t.slash.bulletList.desc,  type: 'bulletList'  as BlockType },
        { icon: '1.', name: t.slash.orderedList.label, description: t.slash.orderedList.desc, type: 'orderedList' as BlockType },
        { icon: '☑️', name: t.slash.taskList.label,    description: t.slash.taskList.desc,    type: 'taskList'    as BlockType },
      ]
    },
    {
      group: t.slash.groupAdvanced,
      items: [
        { icon: '🖼️', name: t.slash.image.label,         description: t.slash.image.desc,         type: 'image'          as BlockType },
        { icon: '📊', name: t.slash.table.label,         description: t.slash.table.desc,         type: 'table'          as BlockType },
        { icon: '💻', name: t.slash.codeBlock.label,     description: t.slash.codeBlock.desc,     type: 'code'           as BlockType },
        { icon: '➖', name: t.slash.divider.label,       description: t.slash.divider.desc,       type: 'divider'        as BlockType },
        { icon: '📋', name: t.slash.kanban.label,        description: t.slash.kanban.desc,        type: 'kanban'         as BlockType },
        { icon: '💡', name: t.slash.admonition.label,    description: t.slash.admonition.desc,    type: 'admonition'     as BlockType },
        { icon: '🖼️', name: t.slash.canvas.label,        description: t.slash.canvas.desc,        type: 'canvas'         as BlockType },
        { icon: '✏️', name: t.slash.excalidraw.label,    description: t.slash.excalidraw.desc,    type: 'excalidraw'     as BlockType },
        { icon: '🎬', name: t.slash.video.label,         description: t.slash.video.desc,         type: 'video'          as BlockType },
        { icon: '📐', name: t.slash.layout.label,        description: t.slash.layout.desc,        type: 'layout'         as BlockType },
        { icon: '∑',  name: t.slash.math.label,          description: t.slash.math.desc,          type: 'math'           as BlockType },
        { icon: '🔗', name: t.slash.embed.label,         description: t.slash.embed.desc,         type: 'embed'          as BlockType },
        { icon: '📊', name: t.slash.mermaid.label,       description: t.slash.mermaid.desc,       type: 'mermaid'        as BlockType },
        { icon: '📈', name: t.slash.chart.label,         description: t.slash.chart.desc,         type: 'chart'          as BlockType },
        { icon: '📅', name: t.slash.gantt.label,         description: t.slash.gantt.desc,         type: 'gantt'          as BlockType },
        { icon: '🧠', name: t.slash.mindmap.label,       description: t.slash.mindmap.desc,       type: 'mindmap'        as BlockType },
        { icon: '📑', name: t.slash.toc.label,           description: t.slash.toc.desc,           type: 'toc'            as BlockType },
        { icon: '📎', name: t.slash.file.label,          description: t.slash.file.desc,          type: 'file'           as BlockType },
        { icon: '🗓️', name: t.slash.dayPlanner.label,    description: t.slash.dayPlanner.desc,    type: 'dayplanner'     as BlockType },
        { icon: '📆', name: t.slash.weeklyPlanner.label, description: t.slash.weeklyPlanner.desc, type: 'weeklyplanner'  as BlockType },
        { icon: '🔄', name: t.slash.routineMatrix.label, description: t.slash.routineMatrix.desc, type: 'routinematrix'  as BlockType },
        { icon: '📅', name: t.slash.monthly.label,       description: t.slash.monthly.desc,       type: 'monthlycalendar' as BlockType },
        { icon: '📊', name: t.slash.quarterly.label,     description: t.slash.quarterly.desc,     type: 'quarterlyplanner' as BlockType },
        { icon: '🌟', name: t.slash.yearly.label,        description: t.slash.yearly.desc,        type: 'yearlyplanner'  as BlockType },
      ]
    },
    {
      group: t.slash.groupAI,
      items: [
        { icon: '✨', name: t.slash.aiWrite.label, description: t.slash.aiWrite.desc, type: 'ai' as BlockType },
      ]
    },
  ], [t])

  // 플러그인 토글 → BlockType 매핑 (false이면 해당 블록 타입을 메뉴에서 제거)
  // Python으로 치면: PLUGIN_BLOCK_MAP = {'kanban': 'kanban', ...}
  const pluginBlockMap: Partial<Record<BlockType, boolean>> = {
    kanban:      plugins.kanban,
    admonition:  plugins.admonition,
    canvas:      plugins.canvas,
    excalidraw:  plugins.excalidraw,  // Excalidraw 플러그인 OFF 시 슬래시 메뉴에서 숨김
    layout:      plugins.layoutEnabled,
    chart:       plugins.chart,         // 차트 플러그인 OFF 시 슬래시 메뉴에서 숨김
    gantt:       plugins.gantt,         // 갠트 플러그인 OFF 시 슬래시 메뉴에서 숨김
    mindmap:     plugins.mindmap,       // 마인드맵 플러그인 OFF 시 슬래시 메뉴에서 숨김
    // video는 pluginBlockMap에 없으므로 항상 메뉴에 표시됨 (autoplay/loop은 설정에서만 조절)
  }

  const filteredGroups = COMMANDS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // 플러그인 토글이 false이면 해당 블록 타입 제거
      // Python으로 치면: if type in plugin_map and not plugin_map[type]: return False
      if (item.type in pluginBlockMap && !pluginBlockMap[item.type as BlockType]) return false
      return (
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })
  })).filter(group => group.items.length > 0)

  const allFilteredItems = filteredGroups.flatMap(g => g.items)

  // 키보드 이벤트 처리
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % allFilteredItems.length)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + allFilteredItems.length) % allFilteredItems.length)
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (allFilteredItems[selectedIndex]) {
        onSelect(allFilteredItems[selectedIndex].type)
      }
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }, [isOpen, selectedIndex, allFilteredItems, onSelect, onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // 검색어 바뀌면 선택 인덱스 초기화
  useEffect(() => { setSelectedIndex(0) }, [searchQuery])

  // -----------------------------------------------
  // 선택된 아이템으로 자동 스크롤
  // selectedRef가 붙은 버튼이 보이도록 스크롤
  // -----------------------------------------------
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // ── 팝업 외부 클릭 시 닫기 + /query 텍스트 삭제 ──
  // onClickOutside: Editor.tsx가 /query 삭제까지 처리
  // Python으로 치면: def on_outside_click(e): if not popup.contains(e.target): on_dismiss()
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

  // ── 팝업 표시 위치 계산 (화면 절반 기준 + X 잘림 방지) ──────────
  // Editor.tsx가 position.top = coords.bottom + 8 로 전달하므로
  // Y 방향은 여기서 오버라이드하지 않고 Editor.tsx의 checkSlash에서 처리
  // Python으로 치면: x = clamp(left, 8, vw - MENU_W - 8)
  const MENU_W = 288  // w-72
  const adjustedLeft = useMemo(
    () => Math.max(8, Math.min(position.left, window.innerWidth - MENU_W - 8)),
    [position.left]
  )

  if (!isOpen) return null

  if (allFilteredItems.length === 0) {
    return (
      <div
        ref={popupRef}
        style={{ top: position.top, left: adjustedLeft }}
        className="fixed z-50 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
      >
        <p className="text-sm text-gray-400 text-center">{t.common.noResults}</p>
      </div>
    )
  }

  let globalIndex = 0

  return (
    <div
      ref={popupRef}
      style={{ top: position.top, left: adjustedLeft }}
      className="fixed z-50 w-72 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
    >
      {searchQuery && (
        <div className="px-3 py-2 border-b border-gray-100">
          <p className="text-xs text-gray-400">
            {t.common.search}: <span className="text-gray-600 font-medium">{searchQuery}</span>
          </p>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto py-1">
        {filteredGroups.map((group) => (
          <div key={group.group}>
            <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {group.group}
            </p>
            {group.items.map((item) => {
              const currentIndex = globalIndex++
              const isSelected = selectedIndex === currentIndex

              return (
                <button
                  key={item.type}
                  ref={isSelected ? selectedRef : null}  // 선택된 버튼에만 ref 부착
                  onClick={() => onSelect(item.type)}
                  className={
                    isSelected
                      ? "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors bg-blue-50 text-blue-700"
                      : "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 text-gray-700"
                  }
                >
                  <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-base shrink-0">
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
        ))}
      </div>
    </div>
  )
}