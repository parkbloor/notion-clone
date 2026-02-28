// =============================================
// src/components/editor/BottomBar.tsx
// 역할: 에디터 하단 고정 바 — 너비 슬라이더 + 단어/글자 수
// #4 에디터 너비 슬라이더 + #5 WordCount 하단 고정 통합 구현
// Python으로 치면: class BottomBar(QWidget): 너비조절 + 단어수 StatusBar
// =============================================

'use client'

import { useMemo } from 'react'
import { AlignJustify } from 'lucide-react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Block } from '@/types/block'

interface BottomBarProps {
  pageId: string
}

// -----------------------------------------------
// HTML 태그 제거 → 순수 텍스트 추출
// Python으로 치면: re.sub(r'<[^>]+>', '', html)
// -----------------------------------------------
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

// -----------------------------------------------
// 블록 배열 → { words, chars } 집계
// kanban / toggle / admonition은 JSON 파싱 후 텍스트 추출
// Python으로 치면: def count_words(blocks): total = sum(len(b.text.split()) for b in blocks)
// -----------------------------------------------
function countText(blocks: Block[]): { words: number; chars: number } {
  let words = 0
  let chars = 0

  for (const block of blocks) {
    // 텍스트 없는 블록 제외 (image, divider, canvas)
    // Python으로 치면: if block.type in ('image', 'divider', 'canvas'): continue
    if (block.type === 'image' || block.type === 'divider' || block.type === 'canvas') continue

    let raw = ''
    if (block.type === 'kanban') {
      try {
        const parsed = JSON.parse(block.content) as {
          columns: Array<{ title: string; cards: Array<{ text: string }> }>
        }
        raw = parsed.columns
          .flatMap(col => [col.title, ...col.cards.map(c => c.text)])
          .join(' ')
      } catch { continue }
    } else if (block.type === 'toggle') {
      try {
        const parsed = JSON.parse(block.content) as { header?: string; body?: string }
        raw = `${stripHtml(parsed.header ?? '')} ${stripHtml(parsed.body ?? '')}`
      } catch { continue }
    } else if (block.type === 'admonition') {
      try {
        const parsed = JSON.parse(block.content) as { text?: string }
        raw = stripHtml(parsed.text ?? '')
      } catch { continue }
    } else {
      raw = stripHtml(block.content)
    }

    const trimmed = raw.trim()
    if (!trimmed) continue

    // 단어: 공백 기준 분리, 글자: 전체 길이
    // Python으로 치면: words += len(trimmed.split()); chars += len(trimmed)
    words += trimmed.split(/\s+/).filter(Boolean).length
    chars += trimmed.length
  }

  return { words, chars }
}

// -----------------------------------------------
// BottomBar 컴포넌트
// 왼쪽: 에디터 너비 슬라이더 (AlignJustify 아이콘 + 현재값 + range input)
// 오른쪽: 단어/글자 수 (wordCount 플러그인 ON 시만 표시)
// Python으로 치면: class BottomBar(QStatusBar): left=width_slider, right=word_count
// -----------------------------------------------
export default function BottomBar({ pageId }: BottomBarProps) {
  // 현재 페이지의 블록 가져오기
  // Python으로 치면: page = store.get_page(page_id); blocks = page.blocks
  const page = usePageStore(s => s.pages.find(p => p.id === pageId))

  // 스토어에서 플러그인 설정 + 너비 상태 + 너비 변경 액션
  // Python으로 치면: plugins, width, set_width = settings_store.get_editor_settings()
  const plugins = useSettingsStore(s => s.plugins)
  const editorMaxWidth = useSettingsStore(s => s.editorMaxWidth)
  const setEditorMaxWidth = useSettingsStore(s => s.setEditorMaxWidth)

  const blocks = page?.blocks ?? []

  // blocks 변경 시만 단어/글자 수 재계산 (타이핑 성능 보호)
  // Python으로 치면: @cached_property def word_count(self): return count_text(self.blocks)
  const { words, chars } = useMemo(() => countText(blocks), [blocks])

  // -----------------------------------------------
  // 슬라이더 드래그 핸들러
  // 1) CSS 변수를 직접 주입 → 실시간 반영 (re-render 기다리지 않음)
  // 2) 스토어 업데이트 → localStorage 영속화
  // Python으로 치면: def on_slider_change(self, val): self.update_css_var(val); store.set(val)
  // -----------------------------------------------
  function handleWidthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value)
    // CSS 변수 즉시 반영 (스토어 업데이트를 기다리지 않아 드래그가 매끄러움)
    document.documentElement.style.setProperty('--editor-max-width', `${val}px`)
    // 스토어에도 저장 (localStorage 영속화)
    setEditorMaxWidth(val)
  }

  return (
    // shrink-0: flex-col 부모에서 높이가 줄어들지 않도록
    // print-hide: PDF 내보내기 시 숨김
    // Python으로 치면: self.setVisible(True); self.setPrintHidden(True)
    <div className="print-hide shrink-0 flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-white select-none dark:bg-gray-900 dark:border-gray-800">

      {/* ── 왼쪽: 에디터 너비 슬라이더 ─────────────────── */}
      {/* AlignJustify 아이콘: 너비 조절을 상징 (텍스트 정렬 모양) */}
      {/* Python으로 치면: width_label = QLabel(f"{width}px"); width_slider = QSlider(Qt.Horizontal) */}
      <div className="flex items-center gap-2">
        <AlignJustify size={13} className="text-gray-300 shrink-0" />
        {/* 현재 너비 값 — w-14로 고정해 슬라이더가 흔들리지 않음 */}
        <span className="text-xs text-gray-300 w-14 tabular-nums">
          {editorMaxWidth}px
        </span>
        <input
          type="range"
          min={400}
          max={1400}
          step={10}
          value={editorMaxWidth}
          onChange={handleWidthChange}
          className="w-32 h-1 accent-gray-400 cursor-pointer"
          title={`에디터 너비: ${editorMaxWidth}px (400~1400px)`}
        />
      </div>

      {/* ── 오른쪽: 단어/글자 수 (wordCount 플러그인 ON 시만) ─── */}
      {/* Python으로 치면: if plugins.word_count: render_word_count_label() */}
      {plugins.wordCount && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-300">
            단어 {words.toLocaleString()}
          </span>
          <span className="text-gray-200">·</span>
          <span className="text-xs text-gray-300">
            글자 {chars.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}
