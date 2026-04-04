// =============================================
// src/components/editor/BlockMenu.tsx
// 역할: 블록 왼쪽 + 버튼 클릭 시 나타나는 블록 조작 메뉴
//       위에 추가 / 아래에 추가 / 복제 / 다른 페이지로 이동·복사 / 삭제
// Python으로 치면: class BlockMenu(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { usePageStore } from '@/store/pageStore'
import { Page } from '@/types/block'

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
// 페이지 선택 팝업 — 이동/복사 대상 페이지를 검색·선택
// anchorRect: 기준 요소(MenuRef)의 뷰포트 좌표 → 팝업 위치 계산에 사용
// Python으로 치면: class PagePickerPopup(Widget): def render(self): ...
// -----------------------------------------------
function PagePickerPopup({
  currentPageId,
  pages,
  anchorRect,
  onSelect,
  onClose,
}: {
  currentPageId: string
  pages: Page[]
  anchorRect: DOMRect
  onSelect: (page: Page) => void
  onClose: () => void
}) {
  // 검색어 상태
  // Python으로 치면: self.query = ""
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // 마운트 즉시 검색창에 포커스
  // Python으로 치면: def on_mount(self): self.input.focus()
  useEffect(() => { inputRef.current?.focus() }, [])

  // Escape 키 → 팝업 닫기 (capture 단계에서 처리해 에디터보다 먼저 반응)
  // Python으로 치면: document.on('keydown', capture=True, lambda e: close() if e.key == 'Escape')
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  // 팝업 외부 클릭 → 닫기
  // Python으로 치면: def on_outside_click(event): if not popup.contains(event.target): close()
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose])

  // 현재 페이지 제외 + 검색어 필터 (최대 8개)
  // Python으로 치면: filtered = [p for p in pages if p.id != current and query in p.title.lower()][:8]
  const filtered = pages
    .filter(p => p.id !== currentPageId)
    .filter(p => !query || p.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)

  // 팝업 위치 계산 — anchor 오른쪽, 뷰포트 밖으로 나가면 왼쪽으로 당김
  // Python으로 치면: left = min(anchor.right + 4, vw - POPUP_W - 8)
  const POPUP_W = 240
  const left = Math.min(anchorRect.right + 4, window.innerWidth - POPUP_W - 8)
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 320))

  return (
    <div
      ref={popupRef}
      style={{ position: 'fixed', left, top, zIndex: 200, width: POPUP_W }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
    >
      {/* ── 검색 헤더 ───────────────────────────────── */}
      <div className="p-2 border-b border-gray-100">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="페이지 검색…"
          className="w-full text-sm px-2 py-1 rounded border border-gray-200 outline-none focus:border-blue-300"
        />
      </div>

      {/* ── 페이지 목록 ─────────────────────────────── */}
      <div className="max-h-56 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 px-3 py-2">
            {query ? `"${query}" 결과 없음` : '다른 페이지가 없습니다'}
          </p>
        ) : (
          filtered.map(page => (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelect(page)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <span className="shrink-0">{page.icon}</span>
              <span className="truncate">{page.title || '제목 없음'}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------
// BlockMenu 메인 컴포넌트
// Python으로 치면: class BlockMenu(Component): ...
// -----------------------------------------------
export default function BlockMenu({ pageId, blockId }: BlockMenuProps) {

  // 드롭다운 열림 여부
  // Python으로 치면: is_open = False
  const [isOpen, setIsOpen] = useState(false)

  // 드롭다운 메뉴의 fixed 위치 (뷰포트 기준 px)
  // Python으로 치면: self.menu_pos: dict = {'left': 0, 'top': 0}
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)

  // 페이지 선택 모드: null = 닫힘, 'move' = 이동, 'copy' = 복사
  // Python으로 치면: self.picker_mode: Optional[str] = None
  const [pickerMode, setPickerMode] = useState<'move' | 'copy' | null>(null)

  // 페이지 선택 팝업 위치 기준 rect (menuRef의 뷰포트 좌표)
  // Python으로 치면: self.picker_anchor: Optional[DOMRect] = None
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)

  // + 버튼 wrapper DOM 참조 (버튼 위치 계산에 사용)
  // Python으로 치면: btn_ref = None
  const menuRef = useRef<HTMLDivElement>(null)

  // fixed 드롭다운 DOM 참조 (외부 클릭 감지에 사용)
  // fixed 요소는 menuRef DOM 트리 밖에 있으므로 별도 ref 필요
  // Python으로 치면: dropdown_ref = None
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    pages, currentPageId,
    addBlock, addBlockBefore, duplicateBlock, deleteBlock,
    moveBlockToPage, copyBlockToPage,
  } = usePageStore()

  // -----------------------------------------------
  // 메뉴가 열렸을 때 외부 클릭 또는 Escape 키로 닫기
  // Python으로 치면:
  //   document.on('mousedown', lambda e: close() if not menu.contains(e.target))
  //   document.on('keydown', lambda e: close() if e.key == 'Escape')
  // -----------------------------------------------
  useEffect(() => {
    if (!isOpen) return

    function handleOutside(e: MouseEvent) {
      // + 버튼(menuRef)과 fixed 드롭다운(dropdownRef) 둘 다 체크
      // Python으로 치면: if not (btn.contains(t) or dropdown.contains(t)): close()
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !dropdownRef.current?.contains(t)) {
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

  // -----------------------------------------------
  // 페이지 선택 팝업 열기 헬퍼
  // 메인 드롭다운을 닫고, pickerMode와 기준 위치를 설정
  // Python으로 치면: def open_picker(self, mode): self.picker_mode = mode; self.picker_anchor = rect
  // -----------------------------------------------
  function openPicker(mode: 'move' | 'copy') {
    setIsOpen(false)
    setPickerMode(mode)
    setPickerAnchor(menuRef.current?.getBoundingClientRect() ?? null)
  }

  // -----------------------------------------------
  // 페이지 선택 완료 핸들러
  // 선택된 페이지로 이동 또는 복사 + 토스트 알림
  // Python으로 치면: def on_page_select(self, target_page): do_action(); toast()
  // -----------------------------------------------
  function handlePageSelect(targetPage: Page) {
    const label = targetPage.title || '제목 없음'
    if (pickerMode === 'move') {
      moveBlockToPage(pageId, targetPage.id, blockId)
      toast.success(`블록이 "${label}"으로 이동됐습니다`)
    } else if (pickerMode === 'copy') {
      copyBlockToPage(pageId, targetPage.id, blockId)
      toast.success(`블록이 "${label}"으로 복사됐습니다`)
    }
    setPickerMode(null)
    setPickerAnchor(null)
  }

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

          // -----------------------------------------------
          // 뷰포트 경계 검사 후 메뉴 위치 계산
          // 버튼 아래 공간이 부족하면 위쪽으로 뒤집음
          // Python으로 치면:
          //   rect = btn.getBoundingClientRect()
          //   top = rect.bottom if rect.bottom + MENU_H < vh else rect.top - MENU_H
          // -----------------------------------------------
          if (!isOpen && menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            const MENU_H = 230 // 메뉴 예상 높이 (px)
            const MENU_W = 192 // min-w-48 = 12rem = 192px
            const vw = window.innerWidth
            const vh = window.innerHeight

            // 아래 공간 충분 → 버튼 아래, 부족 → 버튼 위로 뒤집기
            const top = rect.bottom + MENU_H < vh
              ? rect.bottom + 2
              : rect.top - MENU_H - 2

            // 오른쪽 넘침 방지
            const left = Math.min(rect.left, vw - MENU_W - 8)

            setMenuPos({ left, top })
          }

          setIsOpen(prev => !prev)
        }}
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all select-none text-base leading-none"
        title="블록 메뉴"
      >
        +
      </button>

      {/* ── 드롭다운 메뉴 ──────────────────────────────
          fixed: 뷰포트 기준 위치 → 부모의 overflow/scroll 영향 없음
          menuPos: 클릭 시 계산한 뷰포트 좌표 (위/아래 자동 선택)
          z-50: 다른 요소 위에 표시
          Python으로 치면: dropdown.position = calc_pos(button.rect, viewport) */}
      {isOpen && menuPos && (
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', left: menuPos.left, top: menuPos.top }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48 py-1 overflow-hidden"
        >

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

          {/* ── 페이지 간 이동 / 복사 ─────────────────── */}
          {/* Python으로 치면: MoveToPageBtn, CopyToPageBtn = open_picker('move'/'copy') */}
          <MenuItem
            icon="↗️"
            label="다른 페이지로 이동"
            onClick={() => openPicker('move')}
          />
          <MenuItem
            icon="🔗"
            label="다른 페이지로 복사"
            onClick={() => openPicker('copy')}
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

      {/* ── 페이지 선택 팝업 ─────────────────────────────
          pickerMode가 설정되면 렌더링, onClose/onSelect로 정리
          Python으로 치면: if self.picker_mode: render PagePickerPopup(...) */}
      {pickerMode && pickerAnchor && (
        <PagePickerPopup
          currentPageId={currentPageId ?? pageId}
          pages={pages}
          anchorRect={pickerAnchor}
          onSelect={handlePageSelect}
          onClose={() => { setPickerMode(null); setPickerAnchor(null) }}
        />
      )}

    </div>
  )
}
