// =============================================
// src/components/editor/QuickAddModal.tsx
// 역할: 빠른 노트 캡처 팝업 — Ctrl+Alt+N으로 열리는 미니 입력창
// Python으로 치면: class QuickAddDialog(QDialog): def __init__(self): ...
// =============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { usePageStore } from '@/store/pageStore'

interface QuickAddModalProps {
  onClose: () => void  // 팝업 닫기 콜백
}

// Python으로 치면: def QuickAddModal(on_close): ...
export default function QuickAddModal({ onClose }: QuickAddModalProps) {
  // 제목 입력값
  // Python으로 치면: self.title = ''
  const [title, setTitle] = useState('')

  // 내용 입력값 (선택 사항)
  // Python으로 치면: self.content = ''
  const [content, setContent] = useState('')

  // 저장 중 여부 (중복 클릭 방지)
  // Python으로 치면: self.saving = False
  const [saving, setSaving] = useState(false)

  // 제목 input에 자동 포커스
  // Python으로 치면: self.title_input.setFocus()
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // -----------------------------------------------
  // Esc 키로 팝업 닫기
  // Python으로 치면: if event.key == 'Escape': self.close()
  // -----------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // -----------------------------------------------
  // 저장 처리
  // 1) addPage(title) → 새 페이지 생성 + 현재 페이지로 이동
  // 2) 내용이 있으면 첫 번째 블록에 텍스트 업데이트
  // Python으로 치면:
  //   async def save(self):
  //       page = await store.add_page(self.title)
  //       if self.content: store.update_block(page.id, page.blocks[0].id, self.content)
  //       self.close()
  // -----------------------------------------------
  async function handleSave() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle || saving) return
    setSaving(true)
    try {
      const { addPage, updateBlock } = usePageStore.getState()
      // 새 페이지 생성 (현재 카테고리 무시 — 미분류로 생성)
      await addPage(trimmedTitle, null)

      // 내용이 있으면 생성된 페이지의 첫 블록에 삽입
      // Python으로 치면: if content: store.update_block(current_page_id, blocks[0].id, content)
      if (content.trim()) {
        const { currentPageId, pages } = usePageStore.getState()
        if (currentPageId) {
          const newPage = pages.find(p => p.id === currentPageId)
          if (newPage && newPage.blocks[0]) {
            // 텍스트를 <p> 태그로 감싸 Tiptap HTML 형식으로 저장
            updateBlock(currentPageId, newPage.blocks[0].id, `<p>${content.trim()}</p>`)
          }
        }
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    // ── 오버레이 — 클릭 시 닫기 ──────────────────────
    // Python으로 치면: overlay = QWidget(); overlay.mousePressEvent = close
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* ── 팝업 카드 ─────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <span className="text-xl">⚡</span>
          <h2 className="text-sm font-semibold text-gray-700">빠른 메모</h2>
          <span className="ml-auto text-xs text-gray-400">Esc로 닫기</span>
        </div>

        {/* 입력 영역 */}
        <div className="px-5 pb-4 space-y-2">

          {/* 제목 입력 */}
          {/* Python으로 치면: title_input = QLineEdit(placeholder='제목...') */}
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // Enter → 내용 입력창으로 포커스 이동 (내용 없으면 바로 저장)
              if (e.key === 'Enter') {
                e.preventDefault()
                if (contentRef.current) {
                  contentRef.current.focus()
                } else {
                  handleSave()
                }
              }
            }}
            placeholder="제목을 입력하세요..."
            className="w-full px-3 py-2.5 text-base font-medium text-gray-800 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-400"
          />

          {/* 내용 입력 (선택 사항) */}
          {/* Python으로 치면: content_input = QTextEdit(placeholder='내용...') */}
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl+Enter 또는 Cmd+Enter → 저장
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleSave()
              }
            }}
            placeholder="내용을 입력하세요... (선택 사항, Ctrl+Enter로 저장)"
            rows={3}
            className="w-full px-3 py-2.5 text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors placeholder:text-gray-400 resize-none"
          />
        </div>

        {/* 하단 버튼 영역 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">

          {/* 취소 버튼 */}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            취소
          </button>

          {/* 저장 버튼 */}
          {/* Python으로 치면: save_btn = QPushButton('저장'); save_btn.setEnabled(bool(title)) */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className={title.trim() && !saving
              ? "px-4 py-1.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              : "px-4 py-1.5 text-sm font-medium text-white bg-blue-300 rounded-lg cursor-not-allowed"}
          >
            {saving ? '저장 중...' : '저장 ↵'}
          </button>
        </div>
      </div>
    </div>
  )
}
