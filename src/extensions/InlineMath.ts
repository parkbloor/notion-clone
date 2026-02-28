// =============================================
// src/extensions/InlineMath.ts
// 역할: 인라인 LaTeX 수식 Tiptap 확장
// $...$  패턴을 입력하면 자동으로 KaTeX 인라인 노드로 변환
// 저장: span[data-inline-math][data-latex="..."] HTML 속성으로 직렬화
// Python으로 치면: class InlineMathNode(InlineAtomNode): input_rule = r'\$[^$]+\$'
// =============================================

import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import InlineMathView from '@/components/editor/InlineMathView'

export const InlineMath = Node.create({
  name: 'inlineMath',

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

  // ── 속성: LaTeX 소스 문자열 ───────────────────
  // parseHTML: span의 data-latex 속성에서 복원
  // renderHTML: data-latex 속성으로 직렬화
  // Python으로 치면: attrs = { 'latex': Attribute(default='', from_html=lambda el: el['data-latex']) }
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attrs)  => ({ 'data-latex': attrs.latex }),
      },
    }
  },

  // ── HTML 파싱: 저장된 HTML에서 인라인 수식 복원 ─
  // span[data-inline-math] 태그를 InlineMath 노드로 변환
  // Python으로 치면: if tag == 'span' and 'data-inline-math' in attrs: parse_as_inline_math()
  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }]
  },

  // ── HTML 직렬화: 인라인 수식 노드 → HTML 저장 ──
  // data-inline-math: 파싱 식별용 마커
  // 텍스트 폴백($\latex$): HTML 파서가 JS 없이 읽을 때 표시
  // Python으로 치면: def to_html(self): return f'<span data-inline-math data-latex="{self.latex}">${self.latex}$</span>'
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-inline-math': '', class: 'inline-math-node' },
        HTMLAttributes,
      ),
      `$${node.attrs.latex}$`,
    ]
  },

  // ── NodeView: React 컴포넌트로 렌더링 ─────────
  // InlineMathView: 미리보기(KaTeX) ↔ 편집(input) 2모드
  // Python으로 치면: node.view = InlineMathView
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView)
  },

  // ── InputRule: $...$  패턴 자동 변환 ───────────
  // 닫는 $를 입력하는 순간 match 감지 → range 전체를 InlineMath 노드로 교체
  //
  // 정규식: (?<!\$)\$([^$\n]{1,100})\$(?!\$)$
  //   - (?<!\$)  : 앞에 $ 없음  → $$ 블록 수식과 구별
  //   - ([^$\n]+): LaTeX 내용   → $ 와 줄바꿈 미포함, 1~100자
  //   - (?!\$)   : 뒤에 $ 없음  → $$ 블록 수식과 구별
  //
  // getAttributes: match[1] = LaTeX 내용 → { latex } 속성 반환
  // Python으로 치면: if re.match(r'(?<!\$)\$([^$\n]+)\$(?!\$)', text): node.create(latex=match[1])
  addInputRules() {
    return [
      // InputRule: $...$  전체(양쪽 $ 포함)를 InlineMath 노드 하나로 교체
      // nodeInputRule은 캡처 그룹만 교체하므로 $ 기호가 남음 → 직접 replaceWith 사용
      // state.tr: InputRule이 생성한 공유 transaction → steps 추가 후 run()이 dispatch
      // Python으로 치면: tr.replace(range.from, range.to, InlineMathNode(latex=match[1]))
      new InputRule({
        find: /(?<!\$)\$([^$\n]{1,100})\$(?!\$)$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]?.trim()
          if (!latex) return null
          // range.from ~ range.to = "$...$" 전체 위치 → 노드 1개로 교체
          // state.tr = InputRule 공유 transaction → steps 추가 후 run()이 dispatch
          try {
            state.tr.replaceWith(range.from, range.to, this.type.create({ latex }))
          } catch {
            return null
          }
        },
      }),
    ]
  },
})
