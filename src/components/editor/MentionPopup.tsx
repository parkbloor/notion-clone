// ==============================================
// src/components/editor/MentionPopup.tsx
// 역할: @ 멘션 / [[ 페이지링크 팝업
//   - 검색어 없을 때: 페이지 목록만 (최대 6개)
//   - 검색어 있을 때: 페이지 + 블록 통합 검색 (클라이언트 사이드)
//     ┌─ 📄 페이지 섹션: 제목 매치 (최대 3개)
//     └─ 🧱 블록 섹션: heading 우선, 부모 페이지 브레드크럼 표시 (최대 6개)
// Python으로 치면: class MentionDropdown(Widget): def render(self): ...
// ==============================================

'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Page, Block } from '@/types/block'

// ── 멘션 선택 결과 타입 ──────────────────────────
// 페이지 링크 또는 블록 링크 둘 중 하나
// Python으로 치면: Union[PageItem, BlockItem]
export type MentionItem =
  | { kind: 'page'; page: Page }
  | { kind: 'block'; page: Page; block: Block; plainText: string }

interface MentionPopupProps {
  query: string                        // @ 또는 [[ 뒤에 입력된 검색어
  pages: Page[]                        // 전체 페이지 목록 (blocks 포함)
  position: { x: number; y: number }  // 화면 좌표 (cursor 아래)
  onSelect: (item: MentionItem) => void // 항목 선택 시 콜백
  onClose: () => void                  // Escape 키: 팝업만 닫기 (트리거 텍스트 유지)
  onClickOutside: () => void           // 외부 클릭: 팝업 닫기 + 트리거 텍스트 삭제
  trigger?: '@' | '[['                // 트리거 종류 (헤더 문구용)
}

// ── 헤딩 블록 타입 집합 (블록 검색 우선순위용) ──
// Python으로 치면: HEADING_TYPES = frozenset({'heading1', 'heading2', 'heading3'})
const HEADING_TYPES = new Set(['heading1', 'heading2', 'heading3'])

// ── HTML 태그 제거 헬퍼 ──────────────────────────
// Python으로 치면: re.sub(r'<[^>]+>', '', html)
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── 블록 타입 → 짧은 배지 라벨 ─────────────────
// Python으로 치면: BLOCK_LABELS = {'heading1': 'H1', 'paragraph': '텍스트', ...}
function blockLabel(type: string): string {
  const labels: Record<string, string> = {
    heading1: 'H1', heading2: 'H2', heading3: 'H3',
    paragraph: '텍스트', bulletList: '•목록', orderedList: '번호',
    taskList: '☑체크', code: '코드', toggle: '토글',
    admonition: '콜아웃',
  }
  return labels[type] ?? type
}

export default function MentionPopup({
  query, pages, position, onSelect, onClose, onClickOutside, trigger = '@'
}: MentionPopupProps) {

  // 현재 키보드 선택 인덱스
  // Python으로 치면: self.active_index = 0
  const [activeIndex, setActiveIndex] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)
  // 각 항목 버튼의 ref (키보드 스크롤용)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // -----------------------------------------------
  // 클라이언트 사이드 통합 검색
  // pages store에 모든 블록이 있으므로 서버 요청 없이 즉시 검색
  //
  // 검색어 없을 때:  페이지만 최대 6개
  // 검색어 있을 때:
  //   1. 페이지 제목 매치 (최대 3개)
  //   2. 블록 매치: heading 우선, 한 페이지에서 최대 2개, 전체 최대 6개
  //
  // Python으로 치면:
  //   @lru_cache
  //   def build_results(query, pages):
  //       if not query: return pages[:6]
  //       page_hits = [p for p in pages if query in p.title.lower()][:3]
  //       block_hits = find_blocks(query, pages)[:6]
  //       return page_hits + block_hits
  // -----------------------------------------------
  const items: MentionItem[] = useMemo(() => {
    const q = query.trim().toLowerCase()

    // 검색어 없으면 페이지만
    if (!q) {
      return pages.slice(0, 6).map(p => ({ kind: 'page' as const, page: p }))
    }

    const pageItems: MentionItem[] = []
    const blockItems: MentionItem[] = []
    // 같은 페이지에서 블록이 너무 많이 나오지 않도록 카운트
    const blockCountPerPage = new Map<string, number>()

    for (const page of pages) {
      // ── 페이지 제목 매치 ──
      if (pageItems.length < 3 && page.title.toLowerCase().includes(q)) {
        pageItems.push({ kind: 'page', page })
      }

      // ── 블록 매치 (heading 먼저, 나머지 나중) ──
      if (blockItems.length < 6) {
        // 1pass: heading 블록만
        for (const block of page.blocks) {
          if (!HEADING_TYPES.has(block.type)) continue
          const plain = stripHtml(block.content)
          if (!plain.toLowerCase().includes(q)) continue
          const cnt = blockCountPerPage.get(page.id) ?? 0
          if (cnt >= 2) continue
          blockItems.push({ kind: 'block', page, block, plainText: plain })
          blockCountPerPage.set(page.id, cnt + 1)
          if (blockItems.length >= 6) break
        }
        // 2pass: 일반 텍스트 블록
        for (const block of page.blocks) {
          if (blockItems.length >= 6) break
          if (HEADING_TYPES.has(block.type)) continue
          // 이미지·구분선·칸반은 텍스트 없으므로 제외
          if (['image', 'divider', 'kanban', 'table'].includes(block.type)) continue
          const plain = stripHtml(block.content)
          if (!plain.toLowerCase().includes(q)) continue
          const cnt = blockCountPerPage.get(page.id) ?? 0
          if (cnt >= 2) continue
          blockItems.push({ kind: 'block', page, block, plainText: plain })
          blockCountPerPage.set(page.id, cnt + 1)
        }
      }
    }

    return [...pageItems, ...blockItems]
  }, [query, pages])

  // 쿼리 변경 시 선택 인덱스 초기화
  useEffect(() => {
    setActiveIndex(0)
    itemRefs.current = []
  }, [query])

  // -----------------------------------------------
  // 키보드 네비게이션 — capture 단계로 에디터보다 먼저 처리
  // Python으로 치면: def on_key_press(key): ...
  // -----------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex(i => {
          const next = Math.min(i + 1, items.length - 1)
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setActiveIndex(i => {
          const next = Math.max(i - 1, 0)
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        if (items[activeIndex]) onSelect(items[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [items, activeIndex, onSelect, onClose])

  // ── 팝업 외부 클릭 시 닫기 + 트리거 텍스트 삭제 ──
  // onClickOutside: Editor.tsx가 @query/[[query 텍스트 삭제까지 처리
  // Python으로 치면: def on_outside_click(event): on_dismiss()
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClickOutside()
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClickOutside])

  // ── 팝업 표시 위치 계산 (화면 절반 기준 + X 잘림 방지) ──────────
  // 렌더 시점에 직접 계산 — 상태/훅 불필요, 깜빡임 없음
  //
  // Y: 커서가 화면 위쪽 절반 → 팝업 아래에 표시
  //    커서가 화면 아래쪽 절반 → 팝업 위에 표시
  // X: 오른쪽 잘림 방지 → 팝업이 뷰포트 밖으로 나가면 왼쪽으로 당김
  //
  // Python으로 치면:
  //   y = cursor_y + 6 if cursor_y < vh/2 else cursor_y - POPUP_MAX_H
  //   x = clamp(cursor_x, 8, vw - POPUP_W - 8)
  // ──────────────────────────────────────────────────────────────────
  const POPUP_MAX_H = 320  // maxHeight: 20rem
  const POPUP_W = 288      // w-72
  const popupX = Math.max(8, Math.min(position.x, window.innerWidth - POPUP_W - 8))
  const popupY = position.y < window.innerHeight / 2
    ? position.y + 6                          // 커서 아래에 표시
    : Math.max(8, position.y - POPUP_MAX_H)   // 커서 위에 표시

  // 페이지 섹션 / 블록 섹션 구분 위치 계산
  const firstBlockIdx = items.findIndex(item => item.kind === 'block')
  const hasPages = items.some(item => item.kind === 'page')
  const hasBlocks = items.some(item => item.kind === 'block')

  return (
    // ── popupRef는 항상 부착 — 빈 결과일 때도 크기 측정을 위해 필요 ──
    // visibility: hidden → useLayoutEffect 측정 후 visible로 전환 (깜빡임 방지)
    // Python으로 치면: popup.visible = False; after_measure: popup.visible = True
    <div
      ref={popupRef}
      style={{ position: 'fixed', left: popupX, top: popupY, zIndex: 1000, maxHeight: '20rem' }}
      className="w-72 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden overflow-y-auto"
    >
      {/* ── 결과 없음 ── */}
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 px-3 py-2">
          {query.trim() ? `"${query}" 결과 없음` : '페이지가 없습니다'}
        </p>
      ) : (
        <div className="py-1">
          {/* 팝업 최상단 헤더 — 트리거 종류 표시 */}
          <div className="px-3 py-1 text-xs text-gray-400 font-medium border-b border-gray-50">
            {trigger === '[[' ? '페이지·블록 링크 삽입' : '@ 멘션'}
          </div>

          {/* ── 페이지 섹션 헤더 ── */}
          {hasPages && (
            <div className="px-3 pt-1.5 pb-0.5 text-xs text-gray-400 font-semibold flex items-center gap-1">
              <span>📄</span> 페이지
            </div>
          )}

          {items.map((item, i) => {
        // 블록 섹션 헤더: 블록이 처음 나오는 인덱스 직전에 삽입
        const showBlockHeader = hasBlocks && i === firstBlockIdx

        if (item.kind === 'page') {
          // ── 페이지 항목 ──────────────────────────────
          return (
            <button
              key={`page-${item.page.id}`}
              ref={el => { itemRefs.current[i] = el }}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
              onMouseEnter={() => setActiveIndex(i)}
              className={i === activeIndex
                ? "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left bg-blue-50 text-blue-700"
                : "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50"}
            >
              <span className="shrink-0">{item.page.icon}</span>
              <span className="truncate">{item.page.title || '제목 없음'}</span>
            </button>
          )
        }

        // ── 블록 항목 ────────────────────────────────
        const snippetText = item.plainText.length > 36
          ? item.plainText.slice(0, 36) + '…'
          : item.plainText

        return (
          <div key={`block-${item.block.id}`}>
            {/* 블록 섹션 구분선 + 헤더 */}
            {showBlockHeader && (
              <>
                <div className="border-t border-gray-100 mt-1" />
                <div className="px-3 pt-1.5 pb-0.5 text-xs text-gray-400 font-semibold flex items-center gap-1">
                  <span>🧱</span> 블록
                </div>
              </>
            )}
            <button
              ref={el => { itemRefs.current[i] = el }}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
              onMouseEnter={() => setActiveIndex(i)}
              className={i === activeIndex
                ? "w-full text-left px-3 py-1.5 bg-blue-50"
                : "w-full text-left px-3 py-1.5 hover:bg-gray-50"}
            >
              {/* 부모 페이지 브레드크럼 */}
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                <span className="shrink-0">{item.page.icon}</span>
                <span className="truncate max-w-28">{item.page.title || '제목 없음'}</span>
                <span className="shrink-0 text-gray-300">›</span>
                {/* 블록 타입 배지 */}
                <span className={`shrink-0 px-1 rounded text-xs font-medium ${HEADING_TYPES.has(item.block.type) ? 'text-indigo-500 bg-indigo-50' : 'text-gray-500 bg-gray-100'}`}>
                  {blockLabel(item.block.type)}
                </span>
              </div>
              {/* 블록 내용 스니펫 */}
              <div className={`text-sm truncate pl-1 ${i === activeIndex ? 'text-blue-800 font-medium' : 'text-gray-700'}`}>
                {snippetText || '(내용 없음)'}
              </div>
            </button>
          </div>
        )
          })}
        </div>
      )}
    </div>
  )
}
