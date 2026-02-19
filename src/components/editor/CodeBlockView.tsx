// =============================================
// src/components/editor/CodeBlockView.tsx
// 역할: 코드 블록 Tiptap NodeView — 언어 선택 드롭다운 + 코드 내용
// Tiptap의 ReactNodeViewRenderer로 <pre> 안에 직접 주입됨
// Python으로 치면: class CodeBlockView(NodeView): def render(self): ...
// =============================================

'use client'

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'

// -----------------------------------------------
// NodeViewRendererProps 중 필요한 것만 인라인으로 정의
// Python으로 치면: Props = TypedDict('Props', {'node': Node, 'updateAttributes': Callable})
// -----------------------------------------------
interface CodeBlockViewProps {
  node: {
    attrs: {
      language?: string
    }
  }
  updateAttributes: (attrs: Record<string, unknown>) => void
}

// -----------------------------------------------
// 지원 언어 목록
// Python으로 치면: LANGUAGES = [{'value': 'javascript', 'label': 'JavaScript'}, ...]
// -----------------------------------------------
const LANGUAGES = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
]

// -----------------------------------------------
// 코드 블록 NodeView 컴포넌트
// NodeViewWrapper : Tiptap이 이 컴포넌트를 에디터 DOM에 마운트하는 컨테이너
// NodeViewContent : 실제 편집 가능한 코드 텍스트가 들어가는 영역
// Python으로 치면: def CodeBlockView(node, updateAttributes): ...
// -----------------------------------------------
export default function CodeBlockView({ node, updateAttributes }: CodeBlockViewProps) {
  // 현재 선택된 언어 (없으면 javascript 기본값)
  const language = node.attrs.language ?? 'javascript'

  // -----------------------------------------------
  // 언어 드롭다운 변경 시 노드 속성 업데이트
  // Python으로 치면: def on_language_change(e): node.attrs['language'] = e.target.value
  // -----------------------------------------------
  function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    updateAttributes({ language: e.target.value })
  }

  return (
    // NodeViewWrapper: Tiptap이 이 영역을 에디터 안에서 관리
    // code-block-container: globals.css에서 pre의 상단 모서리를 제거하는 훅
    <NodeViewWrapper className="code-block-container my-2">

      {/* ── 상단 헤더바 — 언어 선택 드롭다운 ────── */}
      {/* contentEditable="false": 이 영역은 편집 불가, 언어 선택만 가능 */}
      <div
        contentEditable={false}
        className="flex items-center justify-between px-3 py-1.5 bg-[#252526] rounded-t-lg border-b border-[#3e3e42]"
      >
        <span className="text-xs text-gray-500 select-none">코드</span>
        <select
          value={language}
          onChange={handleLanguageChange}
          className="text-xs bg-[#3c3c3c] text-gray-300 border border-[#555] rounded px-1.5 py-0.5 cursor-pointer outline-none hover:border-gray-400 transition-colors"
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── 코드 편집 영역 ────────────────────────
          NodeViewContent: 실제 커서가 위치하고 타이핑하는 영역
          as="code": <code> 태그로 렌더링 (pre > code 구조 완성)
          ----------------------------------------- */}
      <pre>
        <NodeViewContent as="code" />
      </pre>

    </NodeViewWrapper>
  )
}
