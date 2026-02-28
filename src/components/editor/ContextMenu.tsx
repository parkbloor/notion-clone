// =============================================
// src/components/editor/ContextMenu.tsx
// 역할: 블록 우클릭 시 표시되는 컨텍스트 메뉴
// sections/actions 배열 구조 → 항목 추가 시 buildContextSections()만 수정
// Python으로 치면: class ContextMenu(QMenu): exec_at_pos(x, y)
// =============================================

'use client'

import { useEffect, useRef } from 'react'

// -----------------------------------------------
// ContextMenuAction: 메뉴 한 항목의 정의
// 추후 submenu, badge, separator 등을 여기에 추가 가능
// Python으로 치면: @dataclass class Action: id, label, icon, danger, ...
// -----------------------------------------------
export interface ContextMenuAction {
  id: string
  label: string
  icon?: string        // 이모지 또는 텍스트 아이콘 (선택)
  shortcut?: string    // 표시용 단축키 힌트 (실제 동작은 별도 구현, 선택)
  danger?: boolean     // true → 빨간색 강조 (삭제 등 위험 동작)
  disabled?: boolean   // true → 비활성화
  onClick: () => void
}

// -----------------------------------------------
// ContextMenuSection: 구분선으로 나뉘는 항목 그룹
// 새 기능 추가 시 sections 배열에 section 객체를 push하면 됨
// Python으로 치면: @dataclass class Section: id, title?, actions
// -----------------------------------------------
export interface ContextMenuSection {
  id: string
  title?: string              // 섹션 소제목 (선택 — 있으면 회색 레이블로 표시)
  actions: ContextMenuAction[]
}

interface ContextMenuProps {
  x: number
  y: number
  sections: ContextMenuSection[]
  onClose: () => void
}

// -----------------------------------------------
// ContextMenu 컴포넌트
// position: fixed → DOM 위치와 무관하게 커서 위치에 표시
// 화면 경계 초과 시 자동 보정 (오른쪽/아래 끝 넘어가면 반대 방향)
// 외부 클릭(mousedown) 또는 Escape 키로 닫힘
// Python으로 치면: menu = QMenu(); menu.exec_(global_pos); menu.close()
// -----------------------------------------------
export default function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 예상 메뉴 크기 계산 — 화면 경계 보정에 사용
  // 항목당 34px, 섹션 헤더 28px, 구분선 9px
  // Python으로 치면: estimated_h = sum(len(s.actions)*34 + (28 if s.title else 0) for s in sections)
  const MENU_W = 224
  const estimatedH = sections.reduce(
    (acc, s) => acc + s.actions.length * 34 + (s.title ? 28 : 0) + 9,
    0
  )

  // 화면 오른쪽/아래 끝에서 잘리지 않도록 좌표 보정
  // Python으로 치면: safe_x = min(x, screen.width - MENU_W - 8)
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const safeX = Math.min(x, vw - MENU_W - 8)
  const safeY = Math.min(y, vh - estimatedH - 8)

  useEffect(() => {
    // 메뉴 바깥 클릭 → 닫기 (mousedown: click보다 빨리 감지)
    // Python으로 치면: root.bind('<ButtonPress>', lambda e: close_if_outside(e))
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Escape 키 → 닫기
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: safeX, top: safeY, zIndex: 9999, width: MENU_W }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 select-none"
      // 메뉴 위에서 다시 우클릭해도 브라우저 기본 메뉴 차단
      onContextMenu={e => e.preventDefault()}
    >
      {sections.map((section, sIdx) => (
        <div key={section.id}>

          {/* 첫 섹션 제외 구분선 */}
          {sIdx > 0 && (
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          )}

          {/* 섹션 소제목 (title 있을 때만) */}
          {/* Python으로 치면: if section.title: render_label(section.title) */}
          {section.title && (
            <div className="px-3 pt-2 pb-0.5 text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide">
              {section.title}
            </div>
          )}

          {/* 항목 버튼 목록 */}
          {section.actions.map(action => (
            <button
              key={action.id}
              disabled={action.disabled}
              onClick={() => {
                if (!action.disabled) {
                  action.onClick()
                  onClose()
                }
              }}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                action.disabled
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : action.danger
                    // 삭제 등 위험 동작: 빨간색 + 빨간 hover 배경
                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer'
                    // 일반 항목
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer',
              ].join(' ')}
            >
              {/* 아이콘 영역 — 너비 고정으로 레이블이 흔들리지 않음 */}
              {action.icon !== undefined && (
                <span className="w-5 text-center shrink-0 text-gray-400 dark:text-gray-500 text-xs font-mono">
                  {action.icon}
                </span>
              )}

              {/* 레이블 */}
              <span className="flex-1">{action.label}</span>

              {/* 단축키 힌트 (있을 때만 오른쪽에 표시) */}
              {action.shortcut && (
                <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0 font-mono">
                  {action.shortcut}
                </span>
              )}
            </button>
          ))}

        </div>
      ))}
    </div>
  )
}
