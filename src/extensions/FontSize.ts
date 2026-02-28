// =============================================
// src/extensions/FontSize.ts
// 역할: 선택된 텍스트에 인라인 font-size를 적용하는 커스텀 Tiptap 확장
// TextStyle mark의 글로벌 속성으로 fontSize를 추가하는 방식
// Python으로 치면: class FontSizeExtension(TiptapExtension): ...
// =============================================

import { Extension } from '@tiptap/core'
// TextStyle 확장이 반드시 먼저 등록되어 있어야 함
// (Editor.tsx에서 TextStyle보다 뒤에 등록)
import '@tiptap/extension-text-style'

// -----------------------------------------------
// TypeScript: Tiptap 명령어 타입 확장
// setFontSize / unsetFontSize 명령어를 에디터 체인에서 사용할 수 있게 선언
// Python으로 치면: Protocol 또는 타입 힌트 확장
// -----------------------------------------------
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      // 선택된 텍스트에 fontSize 적용
      // 예: editor.chain().focus().setFontSize('18px').run()
      setFontSize: (size: string) => ReturnType
      // 선택된 텍스트의 fontSize 제거 (기본값으로 복원)
      unsetFontSize: () => ReturnType
    }
  }
}

// -----------------------------------------------
// FontSize 확장 정의
// Extension.create: Tiptap 커스텀 확장 공장 함수
// Python으로 치면: class FontSize(Extension): name = 'fontSize'
// -----------------------------------------------
export const FontSize = Extension.create({
  name: 'fontSize',

  // -----------------------------------------------
  // addOptions: 확장 기본 옵션 정의
  // types: fontSize를 적용할 mark 종류 목록
  // TextStyle mark에 fontSize 속성을 붙임
  // Python으로 치면: self.options = {'types': ['textStyle']}
  // -----------------------------------------------
  addOptions() {
    return {
      types: ['textStyle'],
    }
  },

  // -----------------------------------------------
  // addGlobalAttributes: TextStyle mark에 fontSize 속성 추가
  // parseHTML: HTML에서 style="font-size:18px" 읽어 내부 상태로 변환
  // renderHTML: 내부 상태를 다시 HTML style 속성으로 출력
  // Python으로 치면: def serialize(self): return {'style': f'font-size: {self.fontSize}'}
  // -----------------------------------------------
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            // 기본값: null → fontSize 속성 없음 = 에디터 기본 크기 사용
            default: null,

            // HTML → Tiptap 내부 상태 파싱
            // element.style.fontSize 예: "18px" → "18px"
            // Python으로 치면: return element.style.get('fontSize')
            parseHTML: (element) =>
              element.style.fontSize?.replace(/['"]/g, '') || null,

            // Tiptap 내부 상태 → HTML 렌더링
            // fontSize가 없으면 빈 객체 반환 → 속성 미출력
            // Python으로 치면: if not self.fontSize: return {}
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return {
                style: `font-size: ${attributes.fontSize}`,
              }
            },
          },
        },
      },
    ]
  },

  // -----------------------------------------------
  // addCommands: 에디터 체인에서 사용할 수 있는 명령어 등록
  // Python으로 치면: def register_commands(self): ...
  // -----------------------------------------------
  addCommands() {
    return {
      // ─ setFontSize ────────────────────────────
      // 선택된 텍스트에 fontSize 적용
      // 사용: editor.chain().focus().setFontSize('18px').run()
      // Python으로 치면: def set_font_size(self, size: str): self.mark('textStyle', fontSize=size)
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          return chain()
            .setMark('textStyle', { fontSize })
            .run()
        },

      // ─ unsetFontSize ──────────────────────────
      // 선택된 텍스트의 fontSize 제거 (기본 크기로 복원)
      // removeEmptyTextStyle: fontSize 제거 후 TextStyle mark가 비어있으면 mark 자체도 제거
      // Python으로 치면: def unset_font_size(self): self.unset_mark_attr('fontSize')
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain()
            .setMark('textStyle', { fontSize: null })
            .removeEmptyTextStyle()
            .run()
        },
    }
  },
})
