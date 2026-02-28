// =============================================
// src/components/editor/MathBlock.tsx
// 역할: LaTeX 수식 블록 — 편집(textarea) ↔ 미리보기(KaTeX) 2모드
// content = raw LaTeX 문자열 (예: "\sqrt{x^2 + y^2}")
// Python으로 치면: class MathBlock: def render(self): katex.render(self.latex)
// =============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import katex from 'katex'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

interface MathBlockProps {
  block: Block
  pageId: string
}

export default function MathBlock({ block, pageId }: MathBlockProps) {
  const { updateBlock } = usePageStore()

  // -----------------------------------------------
  // 편집 모드 초기값: 내용 비어있으면 바로 편집 모드로 시작
  // Python으로 치면: self.is_editing = not bool(block.content.strip())
  // -----------------------------------------------
  const [isEditing, setIsEditing] = useState(!block.content.trim())

  // 로컬 LaTeX 문자열 (저장 전 실시간 편집용)
  // Python으로 치면: self.latex = block.content
  const [latex, setLatex] = useState(block.content)

  // KaTeX 렌더링 결과 HTML
  // Python으로 치면: self.rendered_html = ''
  const [renderedHtml, setRenderedHtml] = useState('')

  // 수식 파싱 오류 메시지
  // Python으로 치면: self.error = ''
  const [error, setError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // -----------------------------------------------
  // LaTeX → KaTeX HTML 실시간 변환
  // displayMode: true → 블록 중앙 정렬 스타일 (인라인 아님)
  // throwOnError: false → 파싱 오류 시 에러 HTML 렌더링 (앱 크래시 방지)
  // Python으로 치면: def render_latex(latex): return katex.renderToString(latex, display=True)
  // -----------------------------------------------
  useEffect(() => {
    if (!latex.trim()) {
      setRenderedHtml('')
      setError('')
      return
    }
    try {
      const html = katex.renderToString(latex, {
        displayMode: true,
        throwOnError: true,
        strict: false,
      })
      setRenderedHtml(html)
      setError('')
    } catch (e) {
      setRenderedHtml('')
      setError(e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/i, '') : '수식 파싱 오류')
    }
  }, [latex])

  // -----------------------------------------------
  // 편집 모드 진입 시 textarea 자동 포커스 + 전체 선택
  // Python으로 치면: if self.is_editing: self.textarea.focus(); self.textarea.select_all()
  // -----------------------------------------------
  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
  }, [isEditing])

  // -----------------------------------------------
  // 편집 완료 (blur): 최신 LaTeX를 store에 저장하고 미리보기로 전환
  // 비어있으면 편집 모드 유지 (저장은 함)
  // Python으로 치면: def on_blur(self): store.update(self.latex); if self.latex: self.mode = 'preview'
  // -----------------------------------------------
  function handleBlur() {
    updateBlock(pageId, block.id, latex)
    if (latex.trim()) {
      setIsEditing(false)
    }
  }

  // -----------------------------------------------
  // 키보드 처리
  // Escape: 변경 취소 후 미리보기 (저장된 내용으로 되돌림)
  // Shift+Enter: 줄바꿈 허용 (다음 블록 추가 방지)
  // Python으로 치면: def on_key_down(self, key): if key == 'Escape': self.cancel()
  // -----------------------------------------------
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      const saved = block.content
      setLatex(saved)
      if (saved.trim()) setIsEditing(false)
    }
    // Shift+Enter: textarea 기본 줄바꿈 허용 (Enter 단독은 부모가 새 블록 추가)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    }
  }

  // ── 편집 모드 렌더링 ─────────────────────────────
  // Python으로 치면: if self.is_editing: render TextareaMode()
  if (isEditing) {
    return (
      <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 space-y-2">

        {/* LaTeX 입력 textarea */}
        <textarea
          ref={textareaRef}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="\sqrt{x^2 + y^2} \quad \frac{d}{dx}\sin(x) = \cos(x)"
          rows={2}
          spellCheck={false}
          className="w-full resize-none bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 outline-none focus:border-blue-400 placeholder:text-gray-300"
        />

        {/* 실시간 미리보기 (오류 없을 때만) */}
        {renderedHtml && !error && (
          <div
            className="py-1 overflow-x-auto text-center"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}

        {/* 파싱 오류 메시지 */}
        {error && (
          <p className="text-xs text-red-500 font-mono">{error}</p>
        )}

        {/* 힌트 텍스트 */}
        <p className="text-xs text-blue-400">
          Enter 또는 포커스 이탈로 저장 · Escape로 취소 · Shift+Enter로 줄바꿈
        </p>
      </div>
    )
  }

  // ── 미리보기 모드 렌더링 ─────────────────────────
  // 클릭하면 편집 모드로 전환
  // Python으로 치면: if self.mode == 'preview': render PreviewMode()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditing(true) }}
      className="group rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 py-3 px-4 cursor-pointer transition-colors"
      title="클릭하여 수식 편집"
    >
      {renderedHtml ? (
        // KaTeX 렌더링 결과 출력
        <div
          className="overflow-x-auto text-center"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        // 비어있는 수식 블록 플레이스홀더
        <p className="text-gray-400 text-sm text-center select-none">
          수식을 입력하려면 클릭하세요 (LaTeX)
        </p>
      )}
    </div>
  )
}
