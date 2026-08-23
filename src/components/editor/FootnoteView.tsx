// =============================================
// src/components/editor/FootnoteView.tsx
// 역할: FootnoteInline 노드의 React NodeView
// 각주 번호 [n]을 superscript로 표시하고, 호버 시 툴팁으로 내용 표시
// Python으로 치면: class FootnoteView(NodeView): def render(self): show_number_and_tooltip()
// =============================================

'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState } from 'react'

export default function FootnoteView({ node, editor, getPos }: NodeViewProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  // -----------------------------------------------
  // 현재 각주 번호 계산
  // doc 전체를 순회해 footnote 노드들의 등장 순서를 찾아 n 결정
  // Python으로 치면: n = [i for i, node in enumerate(doc.footnotes) if node is self][0] + 1
  // -----------------------------------------------
  let footnoteNumber = 1
  try {
    let count = 0
    let found = false
    const currentPos = typeof getPos === 'function' ? getPos() : undefined
    editor.state.doc.descendants((n, pos) => {
      if (found) return false
      if (n.type.name === 'footnoteInline') {
        count += 1
        // 현재 NodeView 위치와 문서 순회 위치를 비교한다.
        // 텍스트 값으로 찾으면 같은 내용의 각주가 모두 첫 번째 번호로 표시될 수 있다.
        if (pos === currentPos) {
          footnoteNumber = count
          found = true
        }
      }
    })
    if (!found) footnoteNumber = count + 1
  } catch {
    footnoteNumber = 1
  }

  const text = (node.attrs.text as string) || ''
  // 분류 출처는 블록마다 번호가 다시 시작되는 일반 각주와 구분해 고정 라벨로 표시한다.
  // Python으로 치면: label = '출처' if is_capture_source else str(footnote_number)
  const label = text.startsWith('작성 ') && text.includes(' · 출처:') ? '출처' : String(footnoteNumber)

  return (
    // NodeViewWrapper: Tiptap이 노드 경계를 인식하는 래퍼 (inline 배치)
    // Python으로 치면: class Wrapper(InlineElement): ...
    <NodeViewWrapper as="span" className="footnote-ref-wrapper">
      <span
        className="footnote-ref"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={text}
      >
        [{label}]

        {/* 호버 툴팁 — 각주 본문 표시 */}
        {showTooltip && text && (
          <span className="footnote-tooltip">
            {text}
          </span>
        )}
      </span>
    </NodeViewWrapper>
  )
}
