// =============================================
// src/extensions/editorExtensions.ts
// 역할: Tiptap 에디터에 등록할 확장 배열 조립
// Editor.tsx에서 useEditor({ extensions }) 에 그대로 전달
// Python으로 치면: def build_extensions(placeholder_text: str) -> list[Extension]: ...
// =============================================

import { ReactNodeViewRenderer } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
// 폰트 확장
import { FontFamily } from '@tiptap/extension-font-family'
import { FontSize } from '@/extensions/FontSize'
// 텍스트 정렬
import { TextAlign } from '@tiptap/extension-text-align'
// 인라인 수식, 각주
import { InlineMath } from '@/extensions/InlineMath'
import { FootnoteInline } from '@/extensions/FootnoteInline'
// 체크리스트
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
// 테이블
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
// 코드 하이라이트 — lowlight common 번들 (~40개 언어)
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import CodeBlockView from '@/components/editor/CodeBlockView'
// 찾기/바꾸기 + 화살표 마크
import { SearchHighlight } from '@/extensions/SearchHighlight'
import { ArrowMark } from '@/extensions/ArrowMark'

// -----------------------------------------------
// lowlight 인스턴스 — 모듈 레벨에서 한 번만 생성 (렌더마다 재생성 방지)
// Python으로 치면: lowlight = create_lowlight(common_languages)
// -----------------------------------------------
const lowlight = createLowlight(common)

// -----------------------------------------------
// CustomCodeBlock: CodeBlockLowlight + 언어 선택 드롭다운 NodeView
// Python으로 치면: CustomCodeBlock = CodeBlockLowlight.extend(node_view=CodeBlockView)
// -----------------------------------------------
const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: 'javascript' })

// -----------------------------------------------
// buildEditorExtensions: useEditor({ extensions }) 에 전달할 배열 반환
// headingPlaceholder — 헤딩 블록 플레이스홀더 문자열 (locale에서 주입)
// Python으로 치면: def build_extensions(heading_placeholder): return [StarterKit, ...]
// -----------------------------------------------
export function buildEditorExtensions(headingPlaceholder: string) {
  return [
    // codeBlock: false → StarterKit 내장 코드블록 비활성화 (CustomCodeBlock이 대체)
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false },
      // 블록 하나가 독립 Editor라서 Tiptap의 trailing paragraph가 필요 없다.
      // 표/목록 뒤에 지워지지 않는 빈 줄이 생기는 것을 막는다.
      trailingNode: false,
    }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return headingPlaceholder
        return "'/' 커맨드  ·  '@' 멘션  ·  '[[' 링크"
      },
    }),
    Typography,
    // multicolor: true → 형광펜에 여러 색상 지원
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    // FontFamily는 TextStyle보다 뒤에 등록해야 mark를 확장할 수 있음
    FontFamily,
    FontSize,
    InlineMath,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    CustomCodeBlock,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    SearchHighlight,
    ArrowMark,
    FootnoteInline,
  ]
}
