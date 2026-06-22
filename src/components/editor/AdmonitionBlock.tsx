// =============================================
// src/components/editor/AdmonitionBlock.tsx
// 역할: 콜아웃(Admonition) 블록 — 팁/정보/경고/위험 강조 박스
// Python으로 치면: class AdmonitionBlock(Block): def render(self): ...
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { useLocale } from '@/locales'

// -----------------------------------------------
// 콜아웃 종류 정의
// Python으로 치면: VARIANTS = {'tip': {...}, 'info': {...}, ...}
// -----------------------------------------------
type AdmonitionVariant = 'tip' | 'info' | 'warning' | 'danger'

const VARIANTS: Record<AdmonitionVariant, {
  icon: string
  label: string
  bg: string         // 배경색 (라이트)
  darkBg: string     // 배경색 (다크)
  border: string     // 왼쪽 테두리 색
  textColor: string  // 레이블 색 (라이트)
  darkText: string   // 레이블 색 (다크)
}> = {
  tip: {
    icon: '💡',
    label: '팁',
    bg: 'bg-yellow-50',
    darkBg: 'dark:bg-yellow-950/40',
    border: 'border-yellow-400',
    textColor: 'text-yellow-700',
    darkText: 'dark:text-yellow-300',
  },
  info: {
    icon: 'ℹ️',
    label: '정보',
    bg: 'bg-blue-50',
    darkBg: 'dark:bg-blue-950/40',
    border: 'border-blue-400',
    textColor: 'text-blue-700',
    darkText: 'dark:text-blue-300',
  },
  warning: {
    icon: '⚠️',
    label: '주의',
    bg: 'bg-orange-50',
    darkBg: 'dark:bg-orange-950/40',
    border: 'border-orange-400',
    textColor: 'text-orange-700',
    darkText: 'dark:text-orange-300',
  },
  danger: {
    icon: '❌',
    label: '위험',
    bg: 'bg-red-50',
    darkBg: 'dark:bg-red-950/40',
    border: 'border-red-400',
    textColor: 'text-red-700',
    darkText: 'dark:text-red-300',
  },
}

// 종류 순서 (클릭으로 순환)
// Python으로 치면: VARIANT_ORDER = list(VARIANTS.keys())
const VARIANT_ORDER: AdmonitionVariant[] = ['tip', 'info', 'warning', 'danger']

// -----------------------------------------------
// content 문자열 파싱 헬퍼
// JSON 실패 시 기본값 반환
// Python으로 치면: def parse_content(s): return json.loads(s) if s else default
// -----------------------------------------------
function parseContent(content: string): { variant: AdmonitionVariant; text: string } {
  try {
    const parsed = JSON.parse(content)
    return {
      variant: VARIANT_ORDER.includes(parsed.variant) ? parsed.variant : 'tip',
      text: parsed.text ?? '',
    }
  } catch {
    return { variant: 'tip', text: '' }
  }
}

// -----------------------------------------------
// AdmonitionBlock 컴포넌트
// -----------------------------------------------
interface AdmonitionBlockProps {
  blockId: string
  content: string                   // JSON 직렬화: { variant, text }
  onChange: (newContent: string) => void  // 부모(Editor)에 변경 알림
}

// Python으로 치면: def AdmonitionBlock(block_id, content, on_change): ...
export default function AdmonitionBlock({ blockId: _blockId, content, onChange }: AdmonitionBlockProps) {
  const t = useLocale()

  // content JSON 파싱
  // Python으로 치면: self.data = parse_content(content)
  const parsed = parseContent(content)
  const [variant, setVariant] = useState<AdmonitionVariant>(parsed.variant)

  // 현재 종류의 스타일 정보
  // Python으로 치면: style = VARIANTS[self.variant]
  const style = VARIANTS[variant]

  // 로케일 기반 레이블 맵 (모듈 상수 VARIANTS의 label 대신 사용)
  const VARIANT_LABELS: Record<AdmonitionVariant, string> = {
    tip: t.blocks.admonition.types.tip,
    info: t.blocks.admonition.types.info,
    warning: t.blocks.admonition.types.caution,
    danger: t.blocks.admonition.types.danger,
  }

  // -----------------------------------------------
  // 텍스트 저장 헬퍼 — variant와 text를 JSON으로 직렬화
  // Python으로 치면: def save(variant, text): on_change(json.dumps({variant, text}))
  // -----------------------------------------------
  const save = useCallback((newVariant: AdmonitionVariant, newText: string) => {
    onChange(JSON.stringify({ variant: newVariant, text: newText }))
  }, [onChange])

  // -----------------------------------------------
  // 종류 순환 클릭 핸들러
  // tip → info → warning → danger → tip ...
  // Python으로 치면: def cycle_variant(): self.variant = next_in_cycle(VARIANT_ORDER, self.variant)
  // -----------------------------------------------
  function cycleVariant() {
    const currentIdx = VARIANT_ORDER.indexOf(variant)
    const nextVariant = VARIANT_ORDER[(currentIdx + 1) % VARIANT_ORDER.length]
    setVariant(nextVariant)
    // 현재 에디터 텍스트(HTML)와 함께 저장
    const currentText = editor?.getHTML() ?? ''
    save(nextVariant, currentText)
  }

  // -----------------------------------------------
  // 내부 Tiptap 에디터 — 텍스트 입력 전용
  // 헤딩·목록 등 불필요한 확장은 제외 (StarterKit 기본만 사용)
  // Python으로 치면: self.editor = TiptapEditor(extensions=[StarterKit, Placeholder])
  // -----------------------------------------------
  const editor = useEditor({
    // Next.js SSR hydration 불일치 방지
    // Python으로 치면: render_on_client_only=True
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // 콜아웃 내부에서는 heading 불필요
        heading: false,
        // Python으로 치면: heading=False
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: t.blocks.admonition.contentPlaceholder,
      }),
    ],
    content: parsed.text || '',
    // 내용 변경 시 부모에 알림
    // Python으로 치면: def on_update(self): self.save(self.variant, self.editor.get_html())
    onUpdate: ({ editor: ed }) => {
      save(variant, ed.getHTML())
    },
  })

  // 언마운트 시 Tiptap 에디터 명시적 정리 — 메모리 누수 방지
  // Python으로 치면: def __del__(self): self.editor.destroy()
  useEffect(() => () => { editor?.destroy() }, [editor])

  return (
    // -----------------------------------------------
    // 왼쪽 색상 테두리 + 배경색 박스 레이아웃
    // Python으로 치면: Box(border_left=style.border, bg=style.bg)
    // -----------------------------------------------
    <div className={`admonition-block flex gap-3 rounded-r-lg border-l-4 px-4 py-3 my-1 ${style.bg} ${style.darkBg} ${style.border}`}>

      {/* 아이콘 버튼 — 클릭 시 종류 순환 */}
      {/* Python으로 치면: Button(icon, on_click=cycle_variant, tooltip='클릭해서 종류 변경') */}
      <button
        type="button"
        onClick={cycleVariant}
        title={t.blocks.admonition.changeTypeTitle}
        className="text-xl shrink-0 leading-none mt-0.5 hover:scale-110 transition-transform cursor-pointer select-none"
      >
        {style.icon}
      </button>

      {/* 오른쪽 영역: 레이블 + 텍스트 에디터 */}
      <div className="flex-1 min-w-0">

        {/* 종류 레이블 (팁 / 정보 / 주의 / 위험) */}
        {/* Python으로 치면: Label(style.label, color=style.text_color) */}
        <div className={`text-xs font-semibold mb-1 ${style.textColor} ${style.darkText}`}>
          {VARIANT_LABELS[variant]}
        </div>

        {/* Tiptap 에디터 — 콜아웃 내용 입력 */}
        {/* Python으로 치면: EditorContent(editor=self.editor) */}
        <EditorContent
          editor={editor}
          className="text-sm text-gray-800 dark:text-gray-200 outline-none [&_.tiptap]:outline-none [&_.tiptap_p]:my-0"
        />
      </div>
    </div>
  )
}
