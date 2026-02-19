// =============================================
// src/components/editor/BlockMenu.tsx
// 역할: 블록 왼쪽 + 버튼 클릭 시 나타나는 블록 조작 메뉴
//       위에 추가 / 아래에 추가 / 복제 / 삭제
// Python으로 치면: class BlockMenu(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState, useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'

interface BlockMenuProps {
  pageId: string
  blockId: string
}

// -----------------------------------------------
// 메뉴 항목 하나를 위한 내부 컴포넌트
// Python으로 치면: def MenuItem(icon, label, onClick, danger=False): ...
// -----------------------------------------------
function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}) {
  const cls = danger
    ? "flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left text-red-500 hover:bg-red-50 transition-colors"
    : "flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"

  return (
    <button type="button" onClick={onClick} className={cls}>
      <span className="w-4 text-center text-base leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// -----------------------------------------------
// 구분선 — 메뉴 그룹 사이를 구분하는 얇은 선
// Python으로 치면: def Divider(): render <hr>
// -----------------------------------------------
function Divider() {
  return <div className="my-1 border-t border-gray-100" />
}

// -----------------------------------------------
// BlockMenu 메인 컴포넌트
// Python으로 치면: class BlockMenu(Component): ...
// -----------------------------------------------
export default function BlockMenu({ pageId, blockId }: BlockMenuProps) {

  // 드롭다운 열림 여부
  // Python으로 치면: is_open = False
  const [isOpen, setIsOpen] = useState(false)

  // 메뉴 컨테이너 DOM 참조 (외부 클릭 감지용)
  // Python으로 치면: menu_ref = None
  const menuRef = useRef<HTMLDivElement>(null)

  const { addBlock, addBlockBefore, duplicateBlock, deleteBlock } = usePageStore()

  // -----------------------------------------------
  // 메뉴가 열렸을 때 외부 클릭 또는 Escape 키로 닫기
  // Python으로 치면:
  //   document.on('mousedown', lambda e: close() if not menu.contains(e.target))
  //   document.on('keydown', lambda e: close() if e.key == 'Escape')
  // -----------------------------------------------
  useEffect(() => {
    if (!isOpen) return

    function handleOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    // -----------------------------------------------
    // relative: 드롭다운의 기준점 역할
    // shrink-0: flex 컨테이너 안에서 크기 줄어들지 않음
    // -----------------------------------------------
    <div ref={menuRef} className="relative shrink-0 mt-1">

      {/* ── + 트리거 버튼 ──────────────────────────────
          opacity-0 group-hover:opacity-100: 블록에 hover 시에만 보임
          이 버튼이 속한 최상위 div에 className="group"이 있어야 동작
          Python으로 치면: btn.visible = parent.is_hovered */}
      <button
        type="button"
        onClick={(e) => {
          // stopPropagation: 버튼 클릭이 에디터 포커스 해제로 이어지지 않게
          e.stopPropagation()
          setIsOpen(prev => !prev)
        }}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all select-none text-base leading-none"
        title="블록 메뉴"
      >
        +
      </button>

      {/* ── 드롭다운 메뉴 ──────────────────────────────
          absolute: + 버튼 기준 위치 지정
          top-6: 버튼 바로 아래
          left-0: 버튼 왼쪽 정렬
          z-50: 다른 요소 위에 표시
          Python으로 치면: dropdown.position = (button.left, button.bottom) */}
      {isOpen && (
        <div className="absolute left-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-44 py-1 overflow-hidden">

          {/* ── 블록 추가 그룹 ────────────────────────── */}
          <MenuItem
            icon="↑"
            label="위에 블록 추가"
            onClick={() => {
              addBlockBefore(pageId, blockId)
              setIsOpen(false)
            }}
          />
          <MenuItem
            icon="↓"
            label="아래에 블록 추가"
            onClick={() => {
              addBlock(pageId, blockId)
              setIsOpen(false)
            }}
          />

          <Divider />

          {/* ── 복제 ──────────────────────────────────── */}
          <MenuItem
            icon="📋"
            label="복제"
            onClick={() => {
              duplicateBlock(pageId, blockId)
              setIsOpen(false)
            }}
          />

          <Divider />

          {/* ── 삭제 (빨간색 강조) ────────────────────── */}
          {/* 삭제 후 블록이 0개면 스토어가 자동으로 빈 블록을 하나 추가 */}
          <MenuItem
            icon="🗑️"
            label="삭제"
            onClick={() => {
              deleteBlock(pageId, blockId)
              setIsOpen(false)
            }}
            danger
          />

        </div>
      )}

    </div>
  )
}
