// =============================================
// src/components/editor/TocPanel.tsx
// 역할: 현재 페이지의 제목 목차(Table of Contents) 사이드 패널
// heading1/2/3 블록을 추출해 계층 목록으로 표시
// 클릭 시 해당 블록으로 스크롤 (Editor.tsx의 id={block.id} 활용)
// Python으로 치면: class TocPanel: def render(self, blocks): ...
// =============================================

'use client'

import { useMemo, useState } from 'react'
import { Block } from '@/types/block'

interface TocPanelProps {
  blocks: Block[]
}

// -----------------------------------------------
// HTML 태그 제거 → 순수 텍스트 (헤딩 제목 추출용)
// Python으로 치면: re.sub(r'<[^>]+>', '', html)
// -----------------------------------------------
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

// -----------------------------------------------
// 헤딩 블록 타입 → 들여쓰기 레벨 (0, 1, 2)
// Python으로 치면: INDENT = {'heading1': 0, 'heading2': 1, 'heading3': 2}
// -----------------------------------------------
const HEADING_INDENT: Record<string, number> = {
  heading1: 0,
  heading2: 1,
  heading3: 2,
}

const INDENT_CLASSES = ['', 'pl-3', 'pl-6'] as const

export default function TocPanel({ blocks }: TocPanelProps) {
  // 현재 하이라이트된 항목 ID (클릭 피드백용)
  const [activeId, setActiveId] = useState<string | null>(null)

  // -----------------------------------------------
  // 헤딩 블록만 추출 (heading1 / heading2 / heading3)
  // Python으로 치면: headings = [b for b in blocks if b.type.startswith('heading')]
  // -----------------------------------------------
  const headings = useMemo(() =>
    blocks.filter(b => b.type in HEADING_INDENT),
    [blocks]
  )

  // 헤딩이 없으면 패널 미표시
  if (headings.length === 0) return null

  // -----------------------------------------------
  // 헤딩 클릭 → 해당 블록으로 부드럽게 스크롤
  // Editor.tsx에서 id={block.id}로 DOM에 등록되어 있음
  // Python으로 치면: element = document.get_element_by_id(block_id); element.scroll_into_view()
  // -----------------------------------------------
  function scrollToBlock(blockId: string) {
    const el = document.getElementById(blockId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(blockId)
    // 하이라이트 2초 후 초기화
    setTimeout(() => setActiveId(null), 2000)
  }

  return (
    // sticky top-20: 스크롤 시 고정 (main.overflow-y-auto 기준)
    // print-hide: 인쇄 시 숨김
    <div className="print-hide w-52 shrink-0 sticky top-20 self-start pr-4">

      {/* 헤더 */}
      <div className="flex items-center gap-1.5 mb-2 px-2">
        <span className="text-xs text-gray-400">📑</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">목차</span>
      </div>

      {/* 헤딩 목록 */}
      {/* Python으로 치면: for heading in headings: render_toc_item(heading) */}
      <nav className="space-y-0.5">
        {headings.map(block => {
          const indent = HEADING_INDENT[block.type] ?? 0
          const title = stripHtml(block.content).trim() || '(제목 없음)'
          const isActive = activeId === block.id

          return (
            <button
              key={block.id}
              type="button"
              onClick={() => scrollToBlock(block.id)}
              title={title}
              className={[
                'w-full text-left px-2 py-1 text-xs rounded-lg transition-colors truncate',
                INDENT_CLASSES[indent],
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
              ].join(' ')}
            >
              {/* heading1은 굵게 */}
              {block.type === 'heading1' ? (
                <span className="font-semibold">{title}</span>
              ) : (
                title
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
