// =============================================
// src/components/editor/WordCountBar.tsx
// 역할: 에디터 하단 단어·글자 수 표시 바
// 플러그인 "단어 수 표시"가 켜진 경우에만 렌더링됨
// Python으로 치면: def render_word_count_bar(blocks: list[Block]): ...
// =============================================

'use client'

import { useMemo } from 'react'
import { Block } from '@/types/block'

interface WordCountBarProps {
  blocks: Block[]
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
// 텍스트 없는 블록(image, divider, kanban)은 건너뜀
// Python으로 치면: def count_words(blocks): total_words = sum(len(text.split()) for text in blocks)
// -----------------------------------------------
function countText(blocks: Block[]): { words: number; chars: number } {
  let words = 0
  let chars = 0

  for (const block of blocks) {
    // 텍스트 내용이 없는 블록 유형 건너뜀
    // canvas는 노드 텍스트가 있지만 다이어그램용이므로 제외
    // Python으로 치면: if block.type in ('image', 'divider', 'canvas'): continue
    if (block.type === 'image' || block.type === 'divider' || block.type === 'canvas') continue

    // kanban / toggle / admonition은 JSON 구조 → 파싱 후 텍스트 추출
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
      // 일반 블록: HTML 태그 제거
      raw = stripHtml(block.content)
    }

    const trimmed = raw.trim()
    if (!trimmed) continue

    // 단어 수: 공백/줄바꿈으로 split 후 비어있지 않은 항목
    // Python으로 치면: words += len([w for w in trimmed.split() if w])
    words += trimmed.split(/\s+/).filter(Boolean).length
    // 글자 수: 공백 포함 전체 길이
    chars += trimmed.length
  }

  return { words, chars }
}

export default function WordCountBar({ blocks }: WordCountBarProps) {
  // useMemo: blocks가 바뀔 때만 재계산 (타이핑 성능 보호)
  // Python으로 치면: @cached_property 또는 @lru_cache
  const { words, chars } = useMemo(() => countText(blocks), [blocks])

  return (
    // 에디터 영역 하단 고정 → print 시 숨김
    // Python으로 치면: footer = QLabel(f"단어 {words} · 글자 {chars}")
    <div className="print-hide flex justify-end items-center gap-3 mt-4 pt-3 border-t border-gray-100 select-none">
      <span className="text-xs text-gray-300">
        단어 {words.toLocaleString()}
      </span>
      <span className="text-gray-200">·</span>
      <span className="text-xs text-gray-300">
        글자 {chars.toLocaleString()}
      </span>
    </div>
  )
}