// =============================================
// src/components/editor/ShortcutModal.tsx
// 역할: 단축키 안내 모달 — ? 버튼으로 열기, 외부 클릭/Escape로 닫기
// Python으로 치면: class ShortcutDialog(QDialog): def show(self): ...
// =============================================

'use client'

import { useEffect, useRef } from 'react'

// -----------------------------------------------
// 단축키 목록 데이터
// 그룹별로 묶어서 표시
// Python으로 치면: SHORTCUTS = [{'group': ..., 'items': [...]}, ...]
// -----------------------------------------------
const SHORTCUT_GROUPS = [
  {
    group: '텍스트 서식',
    items: [
      { keys: ['Ctrl', 'B'], label: '굵게' },
      { keys: ['Ctrl', 'I'], label: '기울임' },
      { keys: ['Ctrl', 'U'], label: '밑줄' },
      { keys: ['Ctrl', 'Shift', 'S'], label: '취소선' },
      { keys: ['Ctrl', 'E'], label: '인라인 코드' },
      { keys: ['Ctrl', 'K'], label: '링크 삽입' },
    ],
  },
  {
    group: '블록 변환',
    items: [
      { keys: ['/'], label: '슬래시 메뉴 열기' },
      { keys: ['#', '스페이스'], label: '제목 1' },
      { keys: ['##', '스페이스'], label: '제목 2' },
      { keys: ['###', '스페이스'], label: '제목 3' },
      { keys: ['-', '스페이스'], label: '글머리 기호 목록' },
      { keys: ['1.', '스페이스'], label: '번호 목록' },
      { keys: ['[]', '스페이스'], label: '체크박스' },
    ],
  },
  {
    group: '편집',
    items: [
      { keys: ['Ctrl', 'Z'], label: '실행 취소' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: '다시 실행' },
      { keys: ['Enter'], label: '새 블록 추가' },
      { keys: ['Backspace'], label: '빈 블록 삭제' },
      { keys: ['Tab'], label: '들여쓰기' },
      { keys: ['Shift', 'Tab'], label: '내어쓰기' },
    ],
  },
  {
    group: '탐색',
    items: [
      { keys: ['Escape'], label: '검색 초기화 / 메뉴 닫기' },
      { keys: ['?'], label: '단축키 안내 열기' },
    ],
  },
]

interface ShortcutModalProps {
  onClose: () => void
}

export default function ShortcutModal({ onClose }: ShortcutModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // 외부 클릭 또는 Escape 키 → 모달 닫기
  // Python으로 치면: dialog.keyPressEvent = lambda e: e.key == Qt.Key_Escape and dialog.close()
  // -----------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // 오버레이 클릭 시 닫기 (모달 내부 클릭은 전파 차단)
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    // ── 반투명 오버레이 ────────────────────────────────
    // Python으로 치면: overlay = QFrame(parent); overlay.setStyleSheet("background: rgba(0,0,0,0.4)")
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
    >
      {/* ── 모달 컨테이너 ─────────────────────── */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">단축키 안내</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none transition-colors"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* 단축키 목록 (스크롤 가능) */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.group}>
              {/* 그룹 이름 */}
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                {group.group}
              </h3>
              {/* 단축키 행 목록 */}
              <div className="space-y-1">
                {group.items.map(item => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-1"
                  >
                    {/* 단축키 설명 */}
                    <span className="text-sm text-gray-600">{item.label}</span>
                    {/* 키 칩 목록 */}
                    {/* Python으로 치면: [QLabel(k, style='border: 1px solid gray') for k in keys] */}
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <span key={i} className="inline-flex items-center">
                          {i > 0 && <span className="text-gray-300 text-xs mx-0.5">+</span>}
                          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-700 shadow-sm">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">언제든지 <kbd className="px-1 py-0.5 text-xs font-mono bg-gray-100 border border-gray-200 rounded">?</kbd> 키를 눌러 이 화면을 열 수 있습니다</p>
        </div>

      </div>
    </div>
  )
}
