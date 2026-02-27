// =============================================
// src/components/editor/BacklinkPanel.tsx
// 역할: 현재 페이지를 @멘션/링크로 참조하는 다른 페이지 목록 표시 (백링크)
// Notion의 "Backlinks" 섹션과 동일한 기능
// Python으로 치면: class BacklinkPanel: def render(self, page_id): ...
// =============================================

'use client'

import { useMemo } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

interface BacklinkPanelProps {
  pageId: string  // 현재 페이지 ID — 이 페이지를 참조하는 다른 페이지를 찾음
}

// -----------------------------------------------
// HTML 태그 제거 → 순수 텍스트 추출 (스니펫 표시용)
// Python으로 치면: re.sub(r'<[^>]+>', '', html).strip()
// -----------------------------------------------
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

// -----------------------------------------------
// 블록 트리 평탄화 — 토글 블록의 children까지 재귀 탐색
// Python으로 치면: def flatten(blocks): return sum([([b] + flatten(b.children)) for b in blocks], [])
// -----------------------------------------------
function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap(b => [b, ...flattenBlocks(b.children ?? [])])
}

// -----------------------------------------------
// 블록 content HTML에 현재 페이지를 가리키는 링크가 있는지 확인
// 감지 패턴:
//   #page-{pageId}         — @멘션/[[ 페이지 링크
//   #block-{pageId}:{...}  — 블록 수준 링크
// Python으로 치면: def links_to(block, page_id): return f'#page-{page_id}' in block.content
// -----------------------------------------------
function blockLinksToPage(block: Block, pageId: string): boolean {
  return (
    block.content.includes(`#page-${pageId}`) ||
    block.content.includes(`#block-${pageId}:`)
  )
}

export default function BacklinkPanel({ pageId }: BacklinkPanelProps) {
  const { pages, setCurrentPage } = usePageStore()

  // -----------------------------------------------
  // 백링크 계산 — 현재 페이지를 제외한 모든 페이지의 블록을 스캔
  // Python으로 치면:
  //   backlinks = [
  //     (page, linking_blocks)
  //     for page in pages if page.id != page_id
  //     for linking_blocks in [filter(lambda b: links_to(b, page_id), flatten(page.blocks))]
  //     if linking_blocks
  //   ]
  // -----------------------------------------------
  const backlinks = useMemo(() => {
    return pages
      .filter(p => p.id !== pageId)
      .flatMap(p => {
        const allBlocks = flattenBlocks(p.blocks)
        const linking = allBlocks.filter(b => blockLinksToPage(b, pageId))
        if (linking.length === 0) return []
        return [{ page: p, blocks: linking }]
      })
  }, [pages, pageId])

  // 백링크가 없으면 섹션 자체를 렌더링하지 않음
  if (backlinks.length === 0) return null

  return (
    <div className="mt-10 mb-4 px-1 print-hide">
      {/* 구분선 */}
      <div className="border-t border-gray-200 dark:border-gray-700 mb-4" />

      {/* 헤더 — 참조 페이지 수 표시 */}
      {/* Python으로 치면: print(f"이 페이지를 참조하는 페이지 ({len(backlinks)})") */}
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 select-none">
        이 페이지를 참조하는 페이지 ({backlinks.length})
      </p>

      {/* 백링크 카드 목록 */}
      <div className="flex flex-col gap-1.5">
        {backlinks.map(({ page, blocks }) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setCurrentPage(page.id)}
            className="text-left p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
          >
            {/* 페이지 아이콘 + 제목 */}
            {/* Python으로 치면: print(f"{page.icon} {page.title}") */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm leading-none select-none">
                {page.icon || '📄'}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {page.title || '제목 없음'}
              </span>
            </div>

            {/* 참조 블록 스니펫 — 최대 2개, 80자 잘라서 표시 */}
            {/* Python으로 치면: snippets = [strip_html(b.content)[:80] for b in blocks[:2]] */}
            {blocks.slice(0, 2).map(b => {
              const text = stripHtml(b.content).trim()
              if (!text) return null
              return (
                <p
                  key={b.id}
                  className="text-xs text-gray-400 dark:text-gray-500 truncate ml-6"
                >
                  {text.length > 80 ? `${text.slice(0, 80)}…` : text}
                </p>
              )
            })}

            {/* 블록이 2개 넘으면 "+N개 더" 표시 */}
            {blocks.length > 2 && (
              <p className="text-xs text-gray-300 dark:text-gray-600 ml-6 mt-0.5">
                +{blocks.length - 2}개 더
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
