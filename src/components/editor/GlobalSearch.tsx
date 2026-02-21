// ==============================================
// src/components/editor/GlobalSearch.tsx
// 역할: Ctrl+K로 여는 전체 텍스트 검색 팝업
//   - 페이지 제목 + 블록 내용을 서버에서 검색
//   - 결과 클릭 시 해당 페이지로 이동
//   - 키보드 탐색 (↑↓ 이동, Enter 선택, Esc 닫기)
// Python으로 치면: class GlobalSearchDialog(QDialog): ...
// ==============================================

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api, SearchResult } from '@/lib/api'
import { usePageStore } from '@/store/pageStore'

// GlobalSearch 컴포넌트 props
// Python으로 치면: def GlobalSearch(on_close: Callable) -> None: ...
interface GlobalSearchProps {
  onClose: () => void
}

export default function GlobalSearch({ onClose }: GlobalSearchProps) {
  // 검색어 입력 상태
  // Python으로 치면: self.query = ''
  const [query, setQuery] = useState('')

  // 검색 결과 목록
  // Python으로 치면: self.results: list[SearchResult] = []
  const [results, setResults] = useState<SearchResult[]>([])

  // 현재 키보드로 선택된 항목 인덱스 (-1이면 아무것도 선택 안 됨)
  // Python으로 치면: self.selected_index = -1
  const [selectedIndex, setSelectedIndex] = useState(-1)

  // 검색 중 로딩 여부
  // Python으로 치면: self.loading = False
  const [loading, setLoading] = useState(false)

  // 검색 입력창 ref (자동 포커스용)
  const inputRef = useRef<HTMLInputElement>(null)

  // 결과 항목 ref 배열 (키보드 스크롤용)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // 페이지 이동 액션
  const { setCurrentPage } = usePageStore()

  // ── 컴포넌트 마운트 시 입력창에 자동 포커스 ──
  // Python으로 치면: self.input.setFocus()
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // -----------------------------------------------
  // 디바운스 검색 (300ms 대기 후 API 호출)
  // Python으로 치면:
  //   async def on_query_change(q):
  //       await asyncio.sleep(0.3)
  //       results = await api.search_pages(q)
  // -----------------------------------------------
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSelectedIndex(-1)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchPages(trimmed)
        setResults(res)
        setSelectedIndex(-1)
        // ref 배열 크기 맞추기
        itemRefs.current = itemRefs.current.slice(0, res.length)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // -----------------------------------------------
  // 결과 항목 선택 → 해당 페이지로 이동 + 팝업 닫기
  // Python으로 치면: def select(result): store.current_page = result.page_id; close()
  // -----------------------------------------------
  const handleSelect = useCallback((result: SearchResult) => {
    setCurrentPage(result.pageId)
    onClose()
  }, [setCurrentPage, onClose])

  // -----------------------------------------------
  // 키보드 탐색 처리
  // ↑↓: 선택 인덱스 이동
  // Enter: 현재 선택 항목 실행
  // Esc: 팝업 닫기
  // Python으로 치면: def on_key_press(key): ...
  // -----------------------------------------------
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => {
        const next = Math.min(prev + 1, results.length - 1)
        // 선택된 항목이 보이도록 스크롤
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => {
        const next = Math.max(prev - 1, 0)
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
      return
    }
    if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    }
  }

  // ── 검색어에서 일치하는 부분을 강조 표시 ──
  // Python으로 치면: re.sub(keyword, f'<mark>{keyword}</mark>', text, flags=IGNORECASE)
  function highlight(text: string, keyword: string) {
    if (!keyword.trim()) return <span>{text}</span>
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part)
            ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{part}</mark>
            : <span key={i}>{part}</span>
        )}
      </span>
    )
  }

  // ── 블록 타입을 한글 라벨로 변환 ──
  // Python으로 치면: BLOCK_LABELS = {'paragraph': '텍스트', ...}
  function blockTypeLabel(type: string | null): string {
    const labels: Record<string, string> = {
      paragraph:   '텍스트',
      heading1:    '제목 1',
      heading2:    '제목 2',
      heading3:    '제목 3',
      bulletList:  '글머리',
      orderedList: '번호 목록',
      taskList:    '체크리스트',
      toggle:      '토글',
      code:        '코드',
      image:       '이미지',
      table:       '테이블',
      divider:     '구분선',
      kanban:      '칸반',
      admonition:  '콜아웃',
    }
    return type ? (labels[type] ?? type) : ''
  }

  return (
    // ── 오버레이 배경 (클릭 시 팝업 닫기) ──
    // Python으로 치면: self.overlay.mousePressEvent = lambda: self.close()
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh]"
      onMouseDown={(e) => {
        // 배경 클릭 시만 닫기 (자식 클릭은 무시)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* ── 검색 다이얼로그 박스 ── */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden border border-gray-200">

        {/* ── 검색 입력창 ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          {/* 돋보기 아이콘 */}
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            placeholder="페이지 제목 또는 내용으로 검색..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 outline-none text-base text-gray-800 placeholder-gray-400 bg-transparent"
          />

          {/* 로딩 스피너 */}
          {loading && (
            <svg className="w-4 h-4 text-gray-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}

          {/* Esc 힌트 */}
          <kbd className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono shrink-0">Esc</kbd>
        </div>

        {/* ── 결과 목록 ── */}
        <div className="max-h-[60vh] overflow-y-auto">

          {/* 검색어 없음 → 안내 메시지 */}
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              검색어를 입력하세요
            </div>
          )}

          {/* 검색 중이 아니고 결과 없음 */}
          {query.trim() && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              <span className="font-medium text-gray-600">&quot;{query}&quot;</span>에 대한 결과가 없습니다
            </div>
          )}

          {/* 결과 항목 목록 */}
          {results.map((result, i) => (
            <button
              key={`${result.pageId}-${result.blockId ?? 'title'}-${i}`}
              ref={el => { itemRefs.current[i] = el }}
              type="button"
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={
                i === selectedIndex
                  ? "w-full text-left px-4 py-3 flex items-start gap-3 bg-blue-50 border-l-2 border-blue-500"
                  : "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 border-l-2 border-transparent"
              }
            >
              {/* 페이지 아이콘 */}
              <span className="text-xl leading-none mt-0.5 shrink-0">{result.pageIcon}</span>

              {/* 내용 영역 */}
              <div className="flex-1 min-w-0">
                {/* 페이지 제목 */}
                <div className="text-sm font-medium text-gray-800 truncate">
                  {highlight(result.pageTitle, query)}
                </div>

                {/* 블록 내용 스니펫 (제목 매치 아닌 경우만) */}
                {result.matchType === 'content' && (
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {highlight(result.snippet, query)}
                  </div>
                )}
              </div>

              {/* 블록 타입 배지 */}
              {result.matchType === 'content' && result.blockType && (
                <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                  {blockTypeLabel(result.blockType)}
                </span>
              )}

              {/* 제목 매치 배지 */}
              {result.matchType === 'title' && (
                <span className="text-xs text-blue-500 bg-blue-50 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                  제목
                </span>
              )}
            </button>
          ))}

        </div>

        {/* ── 하단 키 안내 ── */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-400">
            <span><kbd className="border border-gray-200 rounded px-1 font-mono">↑↓</kbd> 이동</span>
            <span><kbd className="border border-gray-200 rounded px-1 font-mono">Enter</kbd> 선택</span>
            <span><kbd className="border border-gray-200 rounded px-1 font-mono">Esc</kbd> 닫기</span>
            <span className="ml-auto">{results.length}개 결과</span>
          </div>
        )}

      </div>
    </div>
  )
}
