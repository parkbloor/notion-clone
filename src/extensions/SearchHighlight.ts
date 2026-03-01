// ==============================================
// src/extensions/SearchHighlight.ts
// 역할: 찾기/바꾸기 하이라이트 Tiptap 확장
//   - ProseMirror Plugin으로 검색어 일치 텍스트에 데코레이션 추가
//   - 검색어는 Transaction metadata로 전달 → stale closure 없음
//   - 각 Editor 인스턴스에 독립적으로 동작
// Python으로 치면: class SearchHighlight(TiptapExtension): ...
// ==============================================

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Plugin key — 외부에서 dispatch 시 메타 키로 사용
// Python으로 치면: PLUGIN_KEY = PluginKey('searchHighlight')
export const searchHighlightKey = new PluginKey<{ term: string; caseSensitive: boolean }>('searchHighlight')

// 정규식 특수문자 이스케이프
// Python으로 치면: def escape_re(s): return re.escape(s)
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── SearchHighlight 확장 ───────────────────────
// Python으로 치면: search_highlight = Extension.create(...)
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,

        // Plugin 상태: { term, caseSensitive }
        // Python으로 치면: self.state = {'term': '', 'case_sensitive': False}
        state: {
          init: () => ({ term: '', caseSensitive: false }),
          apply(tr, prev) {
            // Transaction 메타에서 새 검색어 수신
            // Python으로 치면: if tr.meta.get('searchHighlight'): update state
            const meta = tr.getMeta(searchHighlightKey)
            if (meta !== undefined) return meta
            return prev
          },
        },

        // 데코레이션: 검색어와 일치하는 모든 텍스트에 'find-highlight' 클래스 추가
        // Python으로 치면: def get_decorations(state) -> DecorationSet: ...
        props: {
          decorations(state) {
            const { term, caseSensitive } = searchHighlightKey.getState(state) ?? { term: '', caseSensitive: false }
            if (!term || term.length < 1) return DecorationSet.empty

            const decorations: Decoration[] = []
            try {
              const flags = caseSensitive ? 'g' : 'gi'
              const regex = new RegExp(escapeRe(term), flags)

              // 문서의 모든 텍스트 노드를 순회하며 매칭 위치에 데코레이션 추가
              // Python으로 치면: for node, pos in doc.descendants(): if node.is_text: ...
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return
                regex.lastIndex = 0
                let m: RegExpExecArray | null
                while ((m = regex.exec(node.text)) !== null) {
                  decorations.push(
                    Decoration.inline(
                      pos + m.index,
                      pos + m.index + m[0].length,
                      { class: 'find-highlight' }
                    )
                  )
                }
              })
            } catch {
              // 잘못된 정규식 등 오류 무시
            }

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
