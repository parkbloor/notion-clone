// =============================================
// src/components/editor/MentionPopup.tsx
// 역할: @ 멘션 팝업 — 페이지 목록을 보여주고 클릭하면 링크 삽입
// Python으로 치면: class MentionDropdown(Widget): def render(self): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { Page } from '@/types/block'

interface MentionPopupProps {
  query: string                       // @ 뒤에 입력된 검색어
  pages: Page[]                       // 전체 페이지 목록
  position: { x: number; y: number } // 화면 좌표 (cursor 아래)
  onSelect: (page: Page) => void      // 페이지 선택 시 콜백
  onClose: () => void                 // 팝업 닫기
}

export default function MentionPopup({ query, pages, position, onSelect, onClose }: MentionPopupProps) {

  // 키보드로 현재 선택된 아이템 인덱스
  // Python으로 치면: self.active_index = 0
  const [activeIndex, setActiveIndex] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // 쿼리로 페이지 필터링 (최대 6개)
  // 쿼리 없으면 전체 목록 (최대 6개)
  // Python으로 치면: filtered = [p for p in pages if query.lower() in p.title.lower()][:6]
  // -----------------------------------------------
  const filtered = pages
    .filter(p => {
      if (!query) return true
      return (p.title || '').toLowerCase().includes(query.toLowerCase())
    })
    .slice(0, 6)

  // 쿼리 변경 시 선택 인덱스 초기화
  useEffect(() => { setActiveIndex(0) }, [query])

  // -----------------------------------------------
  // 키보드 네비게이션 — 캡처 단계에 등록해서 에디터보다 먼저 처리
  // ArrowDown/Up: 이전/다음 항목 선택
  // Enter: 현재 항목 선택
  // Escape: 팝업 닫기
  // Python으로 치면: def handle_key(event): ...
  // -----------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        if (filtered[activeIndex]) onSelect(filtered[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        onClose()
      }
    }
    // capture: true — 에디터(ProseMirror)보다 먼저 이벤트를 받음
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [filtered, activeIndex, onSelect, onClose])

  // -----------------------------------------------
  // 팝업 외부 클릭 시 닫기
  // Python으로 치면: document.addEventListener('mousedown', close_if_outside)
  // -----------------------------------------------
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose])

  // 결과 없음
  if (filtered.length === 0) {
    return (
      <div
        style={{ position: 'fixed', left: position.x, top: position.y + 6, zIndex: 1000 }}
        className="w-56 bg-white border border-gray-200 rounded-lg shadow-xl py-2 px-3"
      >
        <p className="text-sm text-gray-400">
          {query ? `"${query}" 페이지 없음` : '페이지가 없습니다'}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={popupRef}
      style={{ position: 'fixed', left: position.x, top: position.y + 6, zIndex: 1000 }}
      className="w-56 bg-white border border-gray-200 rounded-lg shadow-xl py-1 overflow-hidden"
    >
      {/* 팝업 헤더 */}
      <div className="px-3 py-1 text-xs text-gray-400 font-medium">페이지 링크</div>

      {/* 페이지 아이템 목록 */}
      {filtered.map((page, i) => (
        <button
          key={page.id}
          type="button"
          // mousedown: onBlur → onClose 가 발생하기 전에 선택 처리
          // Python으로 치면: bind mousedown, not click
          onMouseDown={(e) => { e.preventDefault(); onSelect(page) }}
          onMouseEnter={() => setActiveIndex(i)}
          className={i === activeIndex
            ? "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left bg-blue-50 text-blue-700"
            : "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50"}
        >
          <span className="shrink-0">{page.icon}</span>
          <span className="truncate">{page.title || '제목 없음'}</span>
        </button>
      ))}
    </div>
  )
}
