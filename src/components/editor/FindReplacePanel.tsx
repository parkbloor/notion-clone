// ==============================================
// src/components/editor/FindReplacePanel.tsx
// 역할: 찾기/바꾸기 플로팅 패널
//   - Ctrl+H: 바꾸기 행 포함 열기
//   - 검색어 입력 → 모든 Editor에 동시 하이라이트 (SearchHighlight 확장)
//   - ▲▼ 버튼: DOM의 .find-highlight 요소를 순서대로 스크롤
//   - 모두 바꾸기: 현재 페이지 블록 HTML에서 텍스트 노드 치환
//   - [Aa] 대소문자 구분 토글
// Python으로 치면: class FindReplacePanel(QWidget): ...
// ==============================================

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useFindReplaceStore } from '@/store/findReplaceStore'
import { usePageStore } from '@/store/pageStore'

// ── HTML에서 텍스트 노드만 치환하는 헬퍼 ────────
// HTML 태그 속성값 오염 없이 텍스트 내용만 치환
// Python으로 치면: def replace_text_in_html(html, regex, replacement): ...
function replaceTextInHtml(html: string, regex: RegExp, replacement: string): string {
  if (typeof document === 'undefined') return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const root = doc.body

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? ''
      regex.lastIndex = 0
      if (regex.test(text)) {
        regex.lastIndex = 0
        node.nodeValue = text.replace(regex, replacement)
      }
    } else {
      // 자식 노드 순회 (유사 배열 → 배열로 복사 후 순회: live list 변경 방지)
      Array.from(node.childNodes).forEach(walk)
    }
  }

  walk(root)
  return root.innerHTML
}

// 정규식 특수문자 이스케이프
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function FindReplacePanel() {
  const {
    isOpen, showReplace, query, replaceStr, caseSensitive,
    close, setQuery, setReplaceStr, toggleCase, toggleReplace,
  } = useFindReplaceStore()

  const { pages, currentPageId, updateBlock } = usePageStore()

  // DOM 기반 현재 매치 인덱스 (0부터 시작)
  // Python으로 치면: self.current_index = 0
  const [currentIndex, setCurrentIndex] = useState(0)

  // 검색어 변경 시 인덱스 초기화
  // Python으로 치면: def on_query_change(): self.current_index = 0
  useEffect(() => { setCurrentIndex(0) }, [query, caseSensitive])

  // 패널 닫힐 때 .find-highlight-current 클래스 정리
  useEffect(() => {
    if (!isOpen) {
      document.querySelectorAll('.find-highlight-current')
        .forEach(el => el.classList.remove('find-highlight-current'))
    }
  }, [isOpen])

  // 검색 입력창 ref (열릴 때 자동 포커스)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50)
  }, [isOpen])

  // ── DOM 기반 매치 개수 계산 ──────────────────
  // 검색어가 바뀌면 약간의 딜레이 후 DOM에서 .find-highlight 개수 읽기
  // Python으로 치면: def count_matches() -> int: return len(doc.query_selector_all('.find-highlight'))
  const [matchCount, setMatchCount] = useState(0)
  useEffect(() => {
    if (!isOpen || !query) { setMatchCount(0); return }
    // Editor에 SearchHighlight 반영될 시간 약간 대기
    const timer = setTimeout(() => {
      const count = document.querySelectorAll('.find-highlight').length
      setMatchCount(count)
    }, 80)
    return () => clearTimeout(timer)
  }, [isOpen, query, caseSensitive, currentPageId, pages])

  // ── 이전/다음 이동 ────────────────────────────
  // DOM의 .find-highlight 요소를 순서대로 스크롤
  // Python으로 치면: def navigate(direction): scroll to highlight[index]
  const navigate = useCallback((direction: 'next' | 'prev') => {
    const highlights = Array.from(document.querySelectorAll('.find-highlight'))
    if (highlights.length === 0) return

    // 기존 current 클래스 제거
    highlights.forEach(el => el.classList.remove('find-highlight-current'))

    const next = direction === 'next'
      ? (currentIndex + 1) % highlights.length
      : (currentIndex - 1 + highlights.length) % highlights.length

    setCurrentIndex(next)
    const target = highlights[next]
    target?.classList.add('find-highlight-current')
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex])

  // Enter 키로 다음 이동, Escape로 닫기
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); navigate('next') }
    if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  // ── 모두 바꾸기 ──────────────────────────────
  // 현재 페이지의 모든 블록 HTML에서 텍스트 노드만 치환 후 스토어 업데이트
  // Python으로 치면: async def replace_all(): for block in page.blocks: block.content = replace(...)
  function handleReplaceAll() {
    if (!query || !currentPageId) return
    const page = pages.find(p => p.id === currentPageId)
    if (!page) return

    const flags = caseSensitive ? 'g' : 'gi'
    let regex: RegExp
    try { regex = new RegExp(escapeRe(query), flags) }
    catch { toast.error('잘못된 검색어입니다.'); return }

    let replacedBlocks = 0
    page.blocks.forEach(block => {
      if (!block.content) return
      const newContent = replaceTextInHtml(block.content, regex, replaceStr)
      if (newContent !== block.content) {
        updateBlock(currentPageId, block.id, newContent)
        replacedBlocks++
      }
    })

    if (replacedBlocks > 0) {
      toast.success(`${matchCount}개 항목을 "${replaceStr}"(으)로 바꿨습니다.`)
      setQuery('')  // 검색어 초기화 → 하이라이트 제거
    } else {
      toast.info('바꿀 항목이 없습니다.')
    }
  }

  if (!isOpen) return null

  return (
    // ── 플로팅 패널 (우측 상단 고정) ────────────────
    // Python으로 치면: self.panel.setFixedPos(top=64, right=16)
    <div
      className="fixed top-16 right-4 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ width: 380, minWidth: 320 }}
    >

      {/* ── 찾기 행 ─────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        {/* 바꾸기 펼치기/접기 토글 버튼 */}
        <button
          type="button"
          onClick={toggleReplace}
          className="text-gray-400 hover:text-gray-600 text-sm w-5 shrink-0 transition-colors"
          title={showReplace ? '바꾸기 숨기기' : '바꾸기 표시'}
        >
          {showReplace ? '▾' : '▸'}
        </button>

        {/* 검색어 입력 */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="찾기..."
          className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />

        {/* 대소문자 구분 토글 */}
        <button
          type="button"
          onClick={toggleCase}
          title="대소문자 구분"
          className={[
            'w-7 h-7 rounded-md text-xs font-bold transition-colors shrink-0',
            caseSensitive
              ? 'bg-blue-100 text-blue-600 border border-blue-300'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
          ].join(' ')}
        >
          Aa
        </button>

        {/* 매치 수 표시 */}
        <span className="text-xs text-gray-400 w-12 text-center shrink-0 tabular-nums">
          {query ? (matchCount > 0 ? `${Math.min(currentIndex + 1, matchCount)}/${matchCount}` : '없음') : ''}
        </span>

        {/* 이전 */}
        <button
          type="button"
          onClick={() => navigate('prev')}
          disabled={matchCount === 0}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="이전 (Shift+Enter)"
        >
          ▲
        </button>

        {/* 다음 */}
        <button
          type="button"
          onClick={() => navigate('next')}
          disabled={matchCount === 0}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="다음 (Enter)"
        >
          ▼
        </button>

        {/* 닫기 */}
        <button
          type="button"
          onClick={close}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="닫기 (Esc)"
        >
          ✕
        </button>
      </div>

      {/* ── 바꾸기 행 (토글) ─────────────────────── */}
      {showReplace && (
        <div className="flex items-center gap-1.5 px-3 pb-2.5">
          {/* 들여쓰기 맞춤 (▸/▾ 버튼 너비) */}
          <div className="w-5 shrink-0" />

          {/* 바꿀 내용 입력 */}
          <input
            type="text"
            value={replaceStr}
            onChange={e => setReplaceStr(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close() } }}
            placeholder="바꿀 내용..."
            className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />

          {/* 모두 바꾸기 */}
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={!query || matchCount === 0}
            className="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
          >
            모두 바꾸기
          </button>
        </div>
      )}

    </div>
  )
}
