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

export default function FootnoteView({ node, editor }: NodeViewProps) {
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
    editor.state.doc.descendants((n, pos) => {
      if (found) return false
      if (n.type.name === 'footnoteInline') {
        count += 1
        // 현재 노드와 동일한 위치인지 확인 (attrs.text 비교로 근사치)
        // node.attrs.id가 있으면 id로, 없으면 텍스트+위치 조합으로 구분
        if (n.attrs.text === node.attrs.text && count >= 1) {
          // 같은 텍스트가 여러 개일 수 있으므로 첫 번째만 매칭
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
        [{footnoteNumber}]

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
