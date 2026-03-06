// =============================================
// src/components/editor/TocPanel.tsx
// 역할: 현재 페이지의 제목 목차(Table of Contents) 사이드 패널
// heading1~6 블록을 추출해 계층 목록으로 표시
// H1이 접히면 하위 H2/H3... 모두 숨김 (레벨 기반 추론)
// Python으로 치면: class TocPanel: def render(self, blocks): ...
// =============================================

'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
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
// 헤딩 블록 타입 → 레벨 숫자 (1=최상위, 6=최하위)
// Python으로 치면: LEVEL = {'heading1': 1, 'heading2': 2, ...}
// -----------------------------------------------
const HEADING_LEVEL: Record<string, number> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 5,
  heading6: 6,
}

// 레벨별 들여쓰기 클래스 (level-1 인덱스로 사용)
const INDENT_CLASSES = ['', 'pl-3', 'pl-5', 'pl-7', 'pl-9', 'pl-11'] as const

export default function TocPanel({ blocks }: TocPanelProps) {
  // 현재 클릭된 항목 ID (스크롤 피드백용)
  const [activeId, setActiveId] = useState<string | null>(null)

  // 접힌 헤딩 ID 집합 — 접힌 헤딩의 하위 항목은 목차에서 숨김
  // Python으로 치면: self.collapsed_ids = set()
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  // -----------------------------------------------
  // 헤딩 블록만 추출 (heading1~6)
  // Python으로 치면: headings = [b for b in blocks if b.type in HEADING_LEVEL]
  // -----------------------------------------------
  const headings = useMemo(() =>
    blocks.filter(b => b.type in HEADING_LEVEL),
    [blocks]
  )

  // -----------------------------------------------
  // childFlags[i]: headings[i]가 하위 헤딩(더 큰 레벨 번호)을 가지는지 여부
  // 접기 버튼 표시 여부 결정에 사용
  // Python으로 치면: child_flags = [has_children(i, headings) for i in range(len(headings))]
  // -----------------------------------------------
  // -----------------------------------------------
  // visibleHeadings: collapsedIds 기반으로 표시할 헤딩 필터링
  // 접힌 헤딩의 하위 항목(더 큰 레벨 번호)을 숨김
  // Python으로 치면: visible = compute_visible(headings, collapsed_ids)
  // -----------------------------------------------
  const { visibleHeadings, childFlags } = useMemo(() => {
    // 각 헤딩이 하위 헤딩을 가지는지 계산
    // Python으로 치면: def has_children(i): next level > current level before same/higher level
    const flags = headings.map((h, i) => {
      const level = HEADING_LEVEL[h.type]
      for (let j = i + 1; j < headings.length; j++) {
        const nextLevel = HEADING_LEVEL[headings[j].type]
        if (nextLevel <= level) return false
        if (nextLevel > level) return true
      }
      return false
    })

    // 접힌 헤딩 기준으로 표시할 헤딩 목록 계산
    // hiddenUntilLevel: null이면 표시 중, 숫자이면 해당 레벨 이하 헤딩이 나올 때까지 숨김
    // Python으로 치면: for h in headings: if hidden and h.level <= threshold: unhide
    const result: Array<{ block: Block; origIndex: number }> = []
    let hiddenUntilLevel: number | null = null

    headings.forEach((heading, index) => {
      const level = HEADING_LEVEL[heading.type]

      if (hiddenUntilLevel !== null) {
        if (level <= hiddenUntilLevel) {
          // 동급 또는 상위 헤딩 → 숨김 종료 후 표시
          hiddenUntilLevel = null
          result.push({ block: heading, origIndex: index })
          if (collapsedIds.has(heading.id)) hiddenUntilLevel = level
        }
        // else: 여전히 하위 헤딩 → 숨김 (push 안 함)
      } else {
        result.push({ block: heading, origIndex: index })
        if (collapsedIds.has(heading.id)) hiddenUntilLevel = level
      }
    })

    return { visibleHeadings: result, childFlags: flags }
  }, [headings, collapsedIds])

  // 헤딩이 없으면 패널 미표시
  if (headings.length === 0) return null

  // -----------------------------------------------
  // 헤딩 클릭 → 해당 블록으로 부드럽게 스크롤
  // Python으로 치면: element.scroll_into_view(smooth=True)
  // -----------------------------------------------
  function scrollToBlock(blockId: string) {
    const el = document.getElementById(blockId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(blockId)
    setTimeout(() => setActiveId(null), 2000)
  }

  // -----------------------------------------------
  // 접기/펼치기 토글
  // Python으로 치면: collapsed_ids.symmetric_difference_update({block_id})
  // -----------------------------------------------
  function toggleCollapse(e: React.MouseEvent, blockId: string) {
    e.stopPropagation()
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
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
      {/* Python으로 치면: for heading in visible_headings: render_toc_item(heading) */}
      <nav className="space-y-0.5">
        {visibleHeadings.map(({ block, origIndex }) => {
          const level = HEADING_LEVEL[block.type]
          const indentClass = INDENT_CLASSES[level - 1] ?? 'pl-11'
          const title = stripHtml(block.content).trim() || '(제목 없음)'
          const isActive = activeId === block.id
          const isCollapsed = collapsedIds.has(block.id)
          const hasChild = childFlags[origIndex]

          return (
            <div
              key={block.id}
              className={['flex items-center gap-0.5', indentClass].join(' ')}
            >
              {/* 접기/펼치기 버튼 — 자식이 있을 때만 표시, 없으면 자리 유지 */}
              {hasChild ? (
                <button
                  type="button"
                  onClick={(e) => toggleCollapse(e, block.id)}
                  className="shrink-0 w-3.5 h-3.5 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded transition-colors"
                  title={isCollapsed ? '펼치기' : '접기'}
                >
                  {isCollapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                </button>
              ) : (
                // 자식 없는 경우 빈 공간으로 정렬 유지
                <span className="w-3.5 shrink-0" />
              )}

              {/* 헤딩 클릭 → 스크롤 이동 버튼 */}
              <button
                type="button"
                onClick={() => scrollToBlock(block.id)}
                title={title}
                className={[
                  'flex-1 text-left px-1.5 py-0.5 text-xs rounded-lg transition-colors truncate',
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
                  // 레벨별 스타일 차별화
                  level === 1 ? 'font-semibold' : '',
                  level === 2 ? 'font-medium' : '',
                  level >= 5 ? 'text-[10px] italic' : '',
                  level === 6 ? 'uppercase tracking-wide' : '',
                ].join(' ')}
              >
                {title}
              </button>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
