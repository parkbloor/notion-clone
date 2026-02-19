// =============================================
// src/components/editor/SlashCommand.tsx
// 역할: / 입력 시 나타나는 블록 타입 선택 메뉴
// =============================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { BlockType } from '@/types/block'

const COMMANDS = [
  {
    group: '기본 블록',
    items: [
      { icon: '📝', name: '텍스트', description: '일반 텍스트를 작성합니다', type: 'paragraph' as BlockType },
      { icon: '🔠', name: '제목 1', description: '가장 큰 제목', type: 'heading1' as BlockType },
      { icon: '🔡', name: '제목 2', description: '중간 크기 제목', type: 'heading2' as BlockType },
      { icon: '🔤', name: '제목 3', description: '작은 제목', type: 'heading3' as BlockType },
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
    ]
  },
]

interface SlashCommandProps {
  editor: TiptapEditor
  isOpen: boolean
  position: { top: number; left: number }
  onSelect: (type: BlockType) => void
  onClose: () => void
  searchQuery: string
}

export default function SlashCommand({
  editor,
  isOpen,
  position,
  onSelect,
  onClose,
  searchQuery,
}: SlashCommandProps) {

  const [selectedIndex, setSelectedIndex] = useState(0)

  // 선택된 버튼으로 스크롤하기 위한 ref
  // Python으로 치면: selected_ref = None
  const selectedRef = useRef<HTMLButtonElement>(null)

  const filteredGroups = COMMANDS.map(group => ({
    ...group,
    items: group.items.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
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

  if (!isOpen) return null

  if (allFilteredItems.length === 0) {
    return (
      <div
        style={{ top: position.top, left: position.left }}
        className="fixed z-50 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
      >
        <p className="text-sm text-gray-400 text-center">검색 결과가 없습니다</p>
      </div>
    )
  }

  let globalIndex = 0

  return (
    <div
      style={{ top: position.top, left: position.left }}
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