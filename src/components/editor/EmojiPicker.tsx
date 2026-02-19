// =============================================
// src/components/editor/EmojiPicker.tsx
// 역할: 페이지 아이콘 선택용 이모지 그리드 팝업
// Python으로 치면: class EmojiPicker(Popup): def render(self): ...
// =============================================

'use client'

import { useRef, useEffect } from 'react'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

// -----------------------------------------------
// 자주 쓰는 이모지 목록 (카테고리별)
// Python으로 치면: EMOJIS: list[str] = [...]
// -----------------------------------------------
const EMOJIS = [
  // 문서·작업
  '📝', '📄', '📋', '📊', '📈', '📌', '🗂️', '📁', '📦', '💼',
  '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '🔖', '💡',
  // 도구·기술
  '💻', '📱', '🖥️', '⌨️', '🖱️', '📡', '🔍', '🔎', '✏️', '🖊️',
  '🖋️', '📐', '📏', '🗓️', '📅', '🔧', '🔨', '⚙️', '🛠️', '🔑',
  // 사람·감정
  '👤', '👥', '🧑‍💻', '👨‍💼', '👩‍💼', '🧠', '👋', '🤝', '👍', '🎯',
  '💬', '📢', '🗣️', '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤',
  // 자연·날씨
  '🌟', '⭐', '✨', '💫', '🌙', '☀️', '🌈', '⚡', '🔥', '❄️',
  '🌹', '🌷', '🌸', '🌺', '🌻', '🌿', '🌱', '🌳', '🍀', '🌊',
  // 음식·여행
  '🚀', '✈️', '🚗', '🏠', '🏢', '🌍', '🗺️', '🧭', '🏆', '🎁',
  '🍎', '🍊', '🍋', '🍇', '🍓', '☕', '🍵', '🎂', '🍕', '🍜',
  // 스포츠·예술
  '🎨', '🎭', '🎬', '🎵', '🎶', '🎸', '🎹', '🎯', '⚽', '🏀',
  '🏋️', '🧘', '🎮', '🕹️', '🎲', '♟️', '🎻', '🥊', '🏄', '🧩',
  // 동물
  '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯',
  '🐸', '🐧', '🦋', '🐝', '🦄', '🐉', '🦅', '🐬', '🐙', '🦁',
]

// -----------------------------------------------
// EmojiPicker 컴포넌트
// Python으로 치면: def EmojiPicker(on_select, on_close): ...
// -----------------------------------------------
export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {

  // 팝업 DOM 참조 (외부 클릭 감지용)
  const ref = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // 외부 클릭 및 Escape 키로 팝업 닫기
  // Python으로 치면: document.on('mousedown', lambda e: close() if not popup.contains(e.target))
  // -----------------------------------------------
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    // -----------------------------------------------
    // 팝업 컨테이너
    // absolute: 아이콘 기준 위치 (부모가 relative여야 함)
    // z-50: 다른 요소 위에 표시
    // -----------------------------------------------
    <div
      ref={ref}
      className="absolute left-0 top-14 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-72"
    >
      {/* ── 헤더 ──────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">아이콘 선택</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ✕
        </button>
      </div>

      {/* ── 이모지 그리드 ─────────────────────────── */}
      {/* grid-cols-10: 한 줄에 10개씩 */}
      {/* Python으로 치면: for emoji in EMOJIS: render_button(emoji) */}
      <div className="grid grid-cols-10 gap-0.5 max-h-48 overflow-y-auto">
        {EMOJIS.map((emoji, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onSelect(emoji)
              onClose()
            }}
            className="flex items-center justify-center w-7 h-7 rounded text-lg hover:bg-gray-100 transition-colors"
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
