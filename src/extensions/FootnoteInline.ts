// =============================================
// src/extensions/FootnoteInline.ts
// 역할: 인라인 각주 Tiptap 확장
// [^각주 내용] 패턴을 입력하면 자동으로 각주 노드로 변환
// 표시: [n] 파란색 superscript, 호버 시 툴팁으로 각주 텍스트 표시
// 저장: span[data-footnote][data-text="..."] HTML 속성으로 직렬화
// Python으로 치면: class FootnoteNode(InlineAtomNode): input_rule = r'\[\^([^\]]+)\]'
// =============================================

import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import FootnoteView from '@/components/editor/FootnoteView'

export const FootnoteInline = Node.create({
  name: 'footnoteInline',

  // ── 인라인 원자 노드 설정 ─────────────────────
  // group: 'inline' → 단락/제목 안에 삽입 가능
  // inline: true    → 텍스트 흐름 안에 배치
  // atom: true      → 단일 단위로 선택·삭제 (내부 커서 진입 불가)
  // Python으로 치면: node.is_inline = True; node.is_atomic = True
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  // ── 속성: 각주 본문 텍스트 ───────────────────
  // parseHTML: span의 data-text 속성에서 복원
  // renderHTML: data-text 속성으로 직렬화
  // Python으로 치면: attrs = { 'text': Attribute(default='', from_html=lambda el: el['data-text']) }
  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-text') ?? '',
        renderHTML: (attrs)  => ({ 'data-text': attrs.text }),
      },
    }
  },

  // ── HTML 파싱: 저장된 HTML에서 각주 노드 복원 ─
  // span[data-footnote] 태그를 FootnoteInline 노드로 변환
  // Python으로 치면: if tag == 'span' and 'data-footnote' in attrs: parse_as_footnote()
  parseHTML() {
    return [{ tag: 'span[data-footnote]' }]
  },

  // ── HTML 직렬화: 각주 노드 → HTML 저장 ───────
  // data-footnote: 파싱 식별용 마커
  // Python으로 치면: def to_html(self): return f'<span data-footnote data-text="...">[^{text}]</span>'
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-footnote': '', class: 'footnote-ref' },
        HTMLAttributes,
      ),
      `[^${node.attrs.text}]`,
    ]
  },

  // ── NodeView: React 컴포넌트로 렌더링 ─────────
  // FootnoteView: 번호 [n] + 호버 툴팁
  // Python으로 치면: node.view = FootnoteView
  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView)
  },

  // ── InputRule: [^각주 내용] 패턴 자동 변환 ─────
  // 닫는 ]를 입력하는 순간 match 감지 → range 전체를 FootnoteInline 노드로 교체
  //
  // 정규식: \[\^([^\]\n]{1,200})\]$
  //   - \[\^   : "[^" 리터럴 시작
  //   - ([^\]\n]{1,200}): 각주 본문 (], 줄바꿈 제외, 1~200자)
  //   - \]$    : "]" 로 끝남
  //
  // Python으로 치면: if re.match(r'\[\^([^\]\n]+)\]$', text): node.create(text=match[1])
  addInputRules() {
    return [
      new InputRule({
        find: /\[\^([^\]\n]{1,200})\]$/,
        handler: ({ state, range, match }) => {
          const text = match[1]?.trim()
          if (!text) return null
          // range.from ~ range.to = "[^...]" 전체 위치 → 노드 1개로 교체
          // Python으로 치면: tr.replace(range.from, range.to, FootnoteNode(text=text))
          try {
            state.tr.replaceWith(range.from, range.to, this.type.create({ text }))
          } catch (e) {
            console.error('[FootnoteInline] replaceWith 실패:', e)
            return null
          }
        },
      }),
    ]
  },
})
