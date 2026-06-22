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
  pageId: string
  // RightPanel 내부 탭 모드 — 외부 래퍼(mt-10, border-t) 없이 렌더
  inline?: boolean
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

export default function BacklinkPanel({ pageId, inline }: BacklinkPanelProps) {
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
    <div className={inline ? "" : "mt-10 mb-4 px-1 print-hide"}>
      {/* inline 모드에서는 구분선 생략, 일반 모드에서는 표시 */}
      {!inline && <div className="border-t hairline mb-4" />}

      {!inline && (
        <p className="label mb-3 select-none">
          이 페이지를 참조하는 페이지 ({backlinks.length})
        </p>
      )}
      {inline && (
        <p className="label mb-3 select-none">
          {backlinks.length}개 페이지에서 참조 중
        </p>
      )}

      {/* 백링크 카드 목록 */}
      <div className="flex flex-col gap-1.5">
        {backlinks.map(({ page, blocks }) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setCurrentPage(page.id)}
            className="text-left p-3 rounded-lg border hairline transition-colors group"
            style={{ background: "var(--color-surface)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm leading-none select-none">
                {page.icon || '📄'}
              </span>
              <span className="text-sm font-medium transition-colors" style={{ color: "var(--color-text)" }}>
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
                  className="text-xs truncate ml-6"
                  style={{ color: "var(--color-text-subtle)" }}
                >
                  {text.length > 80 ? `${text.slice(0, 80)}…` : text}
                </p>
              )
            })}

            {blocks.length > 2 && (
              <p className="text-xs ml-6 mt-0.5" style={{ color: "var(--color-text-faint)" }}>
                +{blocks.length - 2}개 더
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
