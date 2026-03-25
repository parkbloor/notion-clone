// =============================================
// src/components/editor/TocBlock.tsx
// 역할: 페이지 내부에 삽입되는 인라인 목차 블록
// /목차 슬래시 커맨드로 생성. 현재 페이지의 헤딩(H1~H6)을
// 실시간으로 읽어 계층 목록으로 표시하고 클릭 시 해당 위치로 스크롤.
// Python으로 치면: class TocBlock: def render(self): read_headings(); render_list()
// =============================================

'use client'

import { useMemo, useState } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

interface TocBlockProps {
  block: Block      // 이 목차 블록 자체 (id 참조용)
  pageId: string    // 현재 페이지 ID
}

// -----------------------------------------------
// 헤딩 블록 타입 → 레벨 숫자 (TocPanel과 동일)
// Python으로 치면: HEADING_LEVEL = {'heading1': 1, ...}
// -----------------------------------------------
const HEADING_LEVEL: Record<string, number> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 5,
  heading6: 6,
}

// 레벨별 왼쪽 들여쓰기 (level-1 인덱스)
// Python으로 치면: INDENT = ['', '  ', '    ', '      ', '        ', '          ']
const INDENT_CLASSES = ['', 'pl-4', 'pl-8', 'pl-12', 'pl-16', 'pl-20'] as const

// -----------------------------------------------
// HTML 태그 제거 → 순수 텍스트 (TocPanel과 동일 함수)
// Python으로 치면: re.sub(r'<[^>]+>', '', html)
// -----------------------------------------------
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

export default function TocBlock({ block, pageId }: TocBlockProps) {
  // -----------------------------------------------
  // 현재 페이지 블록 목록 구독
  // 헤딩 추가/삭제/수정 시 자동으로 목차 갱신
  // Python으로 치면: self.blocks = store.get_page(page_id).blocks
  // -----------------------------------------------
  const allBlocks = usePageStore(s => s.pages.find(p => p.id === pageId)?.blocks ?? [])

  // 클릭된 항목 ID (스크롤 피드백 — 2초 후 초기화)
  const [activeId, setActiveId] = useState<string | null>(null)

  // -----------------------------------------------
  // 헤딩 블록만 추출 (이 목차 블록 자신은 제외)
  // Python으로 치면: headings = [b for b in blocks if b.type in HEADING_LEVEL]
  // -----------------------------------------------
  const headings = useMemo(
    () => allBlocks.filter(b => b.type in HEADING_LEVEL && b.id !== block.id),
    [allBlocks, block.id]
  )

  // -----------------------------------------------
  // 헤딩 클릭 → 해당 블록 ID로 부드럽게 스크롤
  // Python으로 치면: def scroll_to(block_id): document.get(id).scroll_into_view()
  // -----------------------------------------------
  function scrollToBlock(blockId: string) {
    const el = document.getElementById(blockId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(blockId)
    setTimeout(() => setActiveId(null), 2000)
  }

  return (
    // 목차 블록 컨테이너
    // border로 구분, 배경은 밝은 회색
    <div className="my-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">

      {/* 헤더 라인 */}
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-gray-200">
        <span className="text-sm">📑</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">목차</span>
      </div>

      {/* 헤딩이 없을 때 안내 메시지 */}
      {headings.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-1">
          이 페이지에 제목(H1~H6)이 없습니다.
        </p>
      ) : (
        // -----------------------------------------------
        // 헤딩 목록 렌더링
        // Python으로 치면: for h in headings: render_item(h)
        // -----------------------------------------------
        <nav className="space-y-0.5">
          {headings.map(h => {
            const level = HEADING_LEVEL[h.type]
            const indentClass = INDENT_CLASSES[level - 1] ?? 'pl-20'
            const title = stripHtml(h.content).trim() || '(제목 없음)'
            const isActive = activeId === h.id

            return (
              <div key={h.id} className={indentClass}>
                <button
                  type="button"
                  onClick={() => scrollToBlock(h.id)}
                  title={title}
                  className={[
                    'w-full text-left px-2 py-0.5 text-xs rounded transition-colors truncate',
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    level === 1 ? 'font-semibold text-[13px]' : '',
                    level === 2 ? 'font-medium' : '',
                    level >= 5 ? 'text-[10px] italic text-gray-400' : '',
                  ].join(' ')}
                >
                  {/* H1은 점 없이, H2 이상은 점 프리픽스 */}
                  {level >= 2 && (
                    <span className="mr-1 text-gray-300">
                      {'·'.repeat(level - 1)}
                    </span>
                  )}
                  {title}
                </button>
              </div>
            )
          })}
        </nav>
      )}
    </div>
  )
}
