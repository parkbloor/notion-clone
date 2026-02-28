// =============================================
// src/components/editor/InlineMathView.tsx
// 역할: InlineMath 노드의 React NodeView
// 미리보기(KaTeX 렌더링) ↔ 편집(inline input) 2모드
// Python으로 치면: class InlineMathView(NodeView): def render(self): ...
// =============================================

'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useEffect, useRef } from 'react'
import katex from 'katex'

export default function InlineMathView({ node, updateAttributes, selected }: NodeViewProps) {
  // 노드에 저장된 LaTeX 문자열 (예: "\neq", "\sqrt{x}")
  // Python으로 치면: self.latex = node.attrs['latex']
  const latex = (node.attrs.latex as string) ?? ''

  // 편집 모드 여부
  const [isEditing, setIsEditing] = useState(false)
  // 편집 중 임시 값 (저장 전 취소 지원)
  const [editValue, setEditValue] = useState(latex)
  // KaTeX 렌더링 결과 HTML
  // 초기값을 즉시 계산 → 첫 렌더링부터 KaTeX 표시 (useEffect 지연 없음)
  // Python으로 치면: self.rendered = katex.render(latex) if latex else ''
  const [renderedHtml, setRenderedHtml] = useState(() => {
    if (!latex.trim()) return ''
    try {
      return katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      })
    } catch {
      return ''
    }
  })

  const inputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------
  // latex 변경 시 KaTeX로 인라인 렌더링
  // displayMode: false → 인라인 크기 (블록 수식보다 작음)
  // throwOnError: false → 파싱 오류 시 앱 크래시 방지
  // Python으로 치면: self.rendered = katex.renderToString(self.latex, display=False)
  // -----------------------------------------------
  useEffect(() => {
    if (!latex.trim()) {
      setRenderedHtml('')
      return
    }
    try {
      const html = katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      })
      setRenderedHtml(html)
    } catch {
      setRenderedHtml('')
    }
  }, [latex])

  // -----------------------------------------------
  // 편집 모드 진입 시 input 포커스 + 전체 선택
  // Python으로 치면: if self.is_editing: self.input.focus(); self.input.select_all()
  // -----------------------------------------------
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // -----------------------------------------------
  // 편집 완료: 변경된 LaTeX를 노드 속성에 저장
  // 빈 값이면 저장하지 않고 편집 모드만 종료
  // Python으로 치면: def commit(self): node.update_attrs(latex=self.edit_value); self.mode = 'preview'
  // -----------------------------------------------
  function handleCommit() {
    const trimmed = editValue.trim()
    if (trimmed) updateAttributes({ latex: trimmed })
    setIsEditing(false)
  }

  // ── 편집 모드: inline input 표시 ────────────────
  // Python으로 치면: if self.is_editing: render InputMode()
  if (isEditing) {
    return (
      // as="span" + inline-block: 텍스트 흐름 안에서 inline 배치
      <NodeViewWrapper as="span" className="inline-block align-baseline">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            // Enter: 저장 후 미리보기 모드
            if (e.key === 'Enter') { e.preventDefault(); handleCommit() }
            // Escape: 변경 취소 (원래 latex로 되돌림)
            if (e.key === 'Escape') { setEditValue(latex); setIsEditing(false) }
          }}
          className="border border-blue-400 rounded px-1 py-0 text-xs font-mono bg-blue-50 outline-none text-gray-800 align-baseline"
          // 입력 길이에 따라 너비 동적 조정
          style={{ minWidth: '3em', width: `${Math.max(editValue.length * 0.65 + 2, 3)}em` }}
        />
      </NodeViewWrapper>
    )
  }

  // ── 미리보기 모드: KaTeX 렌더링 결과 표시 ────────
  // selected: Tiptap이 이 노드가 선택됐을 때 true (파란 링 표시)
  // 클릭하면 편집 모드로 전환
  // Python으로 치면: if self.mode == 'preview': render KatexMode()
  return (
    <NodeViewWrapper
      as="span"
      onClick={() => { setEditValue(latex); setIsEditing(true) }}
      className={[
        'inline-block align-baseline cursor-pointer rounded px-0.5',
        'hover:bg-blue-50 transition-colors',
        selected ? 'ring-1 ring-blue-400 bg-blue-50' : '',
      ].join(' ')}
      title={`수식 편집: $${latex}$`}
    >
      {renderedHtml ? (
        // KaTeX 렌더링 결과 — dangerouslySetInnerHTML 사용 (KaTeX 공식 방법)
        <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      ) : (
        // 렌더링 실패 시 raw LaTeX 폴백
        <span className="font-mono text-sm text-gray-500">${latex}$</span>
      )}
    </NodeViewWrapper>
  )
}
