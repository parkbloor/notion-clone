// =============================================
// src/components/editor/SlashCommand.tsx
// 역할: / 입력 시 나타나는 블록 타입 선택 메뉴
// =============================================

'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { BlockType } from '@/types/block'
import { useSettingsStore } from '@/store/settingsStore'

const COMMANDS = [
  {
    group: '기본 블록',
    items: [
      { icon: '📝', name: '텍스트', description: '일반 텍스트를 작성합니다', type: 'paragraph' as BlockType },
      { icon: '▶', name: '토글', description: '클릭으로 내용 접고 펼치기', type: 'toggle' as BlockType },
      { icon: '🔠', name: '제목 1', description: '가장 큰 제목', type: 'heading1' as BlockType },
      { icon: '🔡', name: '제목 2', description: '중간 크기 제목', type: 'heading2' as BlockType },
      { icon: '🔤', name: '제목 3', description: '작은 제목', type: 'heading3' as BlockType },
      { icon: 'H4', name: '제목 4', description: '소제목 (H4)', type: 'heading4' as BlockType },
      { icon: 'H5', name: '제목 5', description: '소제목 (H5)', type: 'heading5' as BlockType },
      { icon: 'H6', name: '제목 6', description: '최소 제목 (H6)', type: 'heading6' as BlockType },
    ]
  },
  {
    group: '목록',
    items: [
      { icon: '•', name: '글머리 기호', description: '순서 없는 목록', type: 'bulletList' as BlockType },
      { icon: '1.', name: '번호 목록', description: '순서 있는 목록', type: 'orderedList' as BlockType },
      { icon: '☑️', name: '체크박스', description: '할 일 목록', type: 'taskList' as BlockType },
    ]
  },
  {
    group: '고급',
    items: [
      { icon: '🖼️', name: '이미지', description: '이미지를 삽입합니다', type: 'image' as BlockType },
      { icon: '📊', name: '표', description: '3×3 테이블을 삽입합니다', type: 'table' as BlockType },
      { icon: '💻', name: '코드', description: '코드 블록 삽입', type: 'code' as BlockType },
      { icon: '➖', name: '구분선', description: '구분선을 삽입합니다', type: 'divider' as BlockType },
      { icon: '📋', name: '칸반', description: '칸반 보드를 삽입합니다', type: 'kanban' as BlockType },
      { icon: '💡', name: '콜아웃', description: '팁/정보/경고/위험 강조 박스를 삽입합니다', type: 'admonition' as BlockType },
      { icon: '🖼️', name: '캔버스', description: '무한 캔버스 — 카드와 화살표로 다이어그램 작성', type: 'canvas' as BlockType },
      { icon: '✏️', name: 'Excalidraw', description: '손그림 스타일 다이어그램을 자유롭게 그립니다', type: 'excalidraw' as BlockType },
      { icon: '🎬', name: '비디오', description: '로컬 비디오 파일을 업로드하여 재생합니다', type: 'video' as BlockType },
      { icon: '📐', name: '레이아웃', description: 'A4 용지 기준 다단 레이아웃 (잡지 편집 스타일)', type: 'layout' as BlockType },
      { icon: '∑', name: '수식', description: 'LaTeX 수식 블록 — KaTeX 렌더링', type: 'math' as BlockType },
      { icon: '🔗', name: '임베드', description: 'YouTube · Vimeo · 웹페이지 URL을 iframe으로 삽입합니다', type: 'embed' as BlockType },
      { icon: '📊', name: 'Mermaid', description: 'flowchart · sequence · gantt 등 텍스트로 다이어그램 작성', type: 'mermaid' as BlockType },
      { icon: '📈', name: '차트', description: '막대 · 선 · 파이 차트로 데이터를 시각화합니다', type: 'chart' as BlockType },
      { icon: '📅', name: '갠트', description: '태스크 일정과 기간을 타임라인으로 시각화합니다', type: 'gantt' as BlockType },
    ]
  },
]

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

  // 플러그인 설정 읽기 — 비활성화된 플러그인은 메뉴에서 숨김
  // Python으로 치면: plugins = settings_store.plugins
  const { plugins } = useSettingsStore()

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
        <p className="text-sm text-gray-400 text-center">검색 결과가 없습니다</p>
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
            검색: <span className="text-gray-600 font-medium">{searchQuery}</span>
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