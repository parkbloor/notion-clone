// =============================================
// src/components/editor/PageList.tsx
// 역할: 가운데 패널 — 현재 카테고리의 페이지 목록 + 전문 검색
// Python으로 치면: class PageList(Widget): def render(self): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Page } from '@/types/block'
import CalendarWidget from './CalendarWidget'
import NewPageDialog from './NewPageDialog'
import { templateApi } from '@/lib/api'
import { toast } from 'sonner'

// dnd-kit: 페이지 목록 정렬 + 카테고리로 드래그앤드롭
// useSortable: 목록 내 순서 변경 + 크로스 패널 드래그 모두 지원
// SortableContext: 목록 내 드래그 순서 변경을 위한 컨텍스트
// Python으로 치면: from dnd import Sortable, SortableContext
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// 뷰 모드 토글 아이콘 (리스트 / 갤러리 / 테이블)
// Python으로 치면: from lucide_react import LayoutGrid, List, Table2
import { LayoutGrid, List, ArrowUpDown, Table2 } from 'lucide-react'
import { PageProperty } from '@/types/block'


// -----------------------------------------------
// HTML 태그 제거 — 순수 텍스트 추출
// Python으로 치면: def strip_html(html): return re.sub(r'<[^>]+>', ' ', html).strip()
// -----------------------------------------------
function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// -----------------------------------------------
// 페이지의 모든 블록 내용을 하나의 텍스트로 합치기
// 이미지 블록 제외, 토글 블록은 header+body 모두 추출
// Python으로 치면: def get_page_text(page): return ' '.join(block.text for block in page.blocks)
// -----------------------------------------------
function getPageSearchText(page: Page): string {
  const texts = page.blocks.map(block => {
    if (block.type === 'image') return ''
    if (block.type === 'dailycapture') {
      try {
        const parsed = JSON.parse(block.content) as { date?: string; body?: string }
        return `${parsed.date ?? ''} ${parsed.body ?? ''}`
      } catch { return block.content }
    }
    if (block.type === 'toggle') {
      try {
        const parsed = JSON.parse(block.content)
        return stripHtml(parsed.header || '') + ' ' + stripHtml(parsed.body || '')
      } catch { return '' }
    }
    return stripHtml(block.content)
  })
  return texts.join(' ')
}

// -----------------------------------------------
// 검색어가 처음 등장하는 블록의 주변 텍스트를 스니펫으로 반환
// Python으로 치면: def get_snippet(page, query): idx = ...; return text[idx-15:idx+50]
// -----------------------------------------------
function getSnippet(page: Page, query: string): string {
  const q = query.toLowerCase()
  for (const block of page.blocks) {
    if (block.type === 'image') continue
    let text = ''
    if (block.type === 'dailycapture') {
      try {
        const parsed = JSON.parse(block.content) as { date?: string; body?: string }
        text = `${parsed.date ?? ''} ${parsed.body ?? ''}`
      } catch { text = block.content }
    } else if (block.type === 'toggle') {
      try {
        const parsed = JSON.parse(block.content)
        text = stripHtml(parsed.header || '') + ' ' + stripHtml(parsed.body || '')
      } catch { continue }
    } else {
      text = stripHtml(block.content)
    }
    const idx = text.toLowerCase().indexOf(q)
    if (idx !== -1) {
      const start = Math.max(0, idx - 15)
      const end = Math.min(text.length, idx + query.length + 45)
      const snippet = text.slice(start, end).trim()
      return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '')
    }
  }
  return ''
}

// -----------------------------------------------
// 제목 텍스트에서 검색어 부분을 노란 배경으로 강조
// Python으로 치면: def highlight(text, query): return text[:idx] + <mark> + ... + </mark> + ...
// -----------------------------------------------
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-200 rounded-sm">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}


// -----------------------------------------------
// 카테고리 이동 컨텍스트 메뉴 컴포넌트
// "..." 버튼 클릭 시 나타나는 드롭다운
// Python으로 치면: class ContextMenu(Widget): ...
// -----------------------------------------------
interface PageContextMenuProps {
  page: Page
  currentCategoryId: string | null  // 현재 보고있는 카테고리 (이 페이지의 카테고리가 아닐 수 있음)
  onClose: () => void
}

// -----------------------------------------------
// 페이지 블록 → 마크다운 문자열 직렬화 (간이 버전)
// 템플릿 저장 시 content 필드로 사용
// Python으로 치면: def blocks_to_markdown(blocks: list[Block]) -> str: ...
// -----------------------------------------------
function blocksToMarkdown(page: Page): string {
  const lines: string[] = []
  for (const block of page.blocks) {
    // HTML 태그 제거 (간이 버전: 태그 → 공백 → trim)
    // Python으로 치면: text = re.sub(r'<[^>]+>', ' ', block.content).strip()
    const text = block.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    switch (block.type) {
      case 'heading1': lines.push(`# ${text}`); break
      case 'heading2': lines.push(`## ${text}`); break
      case 'heading3': lines.push(`### ${text}`); break
      case 'heading4': lines.push(`#### ${text}`); break
      case 'heading5': lines.push(`##### ${text}`); break
      case 'heading6': lines.push(`###### ${text}`); break
      case 'divider':  lines.push('---'); break
      case 'code':     lines.push(`\`\`\`\n${text}\n\`\`\``); break
      case 'paragraph':
        if (text) lines.push(text)
        break
      default:
        // 목록·기타: 텍스트만 추출
        if (text) lines.push(text)
    }
  }
  return lines.join('\n\n')
}

function PageContextMenu({ page, onClose }: PageContextMenuProps) {
  const { categories, categoryMap, movePageToCategory, deletePage, duplicatePage } = usePageStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // 템플릿 저장 폼 표시 여부
  // Python으로 치면: self.show_save_form = False
  const [showSaveForm, setShowSaveForm] = useState(false)
  // 저장 요청 진행 중 여부
  const [isSaving, setIsSaving] = useState(false)
  // 템플릿 이름 입력값
  const [templateName, setTemplateName] = useState(page.title || '')
  // 템플릿 설명 입력값
  const [templateDesc, setTemplateDesc] = useState('')

  // 메뉴 외부 클릭 시 닫기
  // Python으로 치면: document.addEventListener('click', close_if_outside)
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [onClose])

  // 이 페이지의 현재 카테고리
  const pageCategoryId = categoryMap[page.id] ?? null

  // 페이지를 특정 카테고리로 이동
  function handleMoveTo(targetCategoryId: string | null) {
    movePageToCategory(page.id, targetCategoryId)
    onClose()
  }

  // -----------------------------------------------
  // 현재 페이지 → 템플릿으로 저장
  // Python으로 치면: async def save_as_template(): api.create(name, icon, desc, content)
  // -----------------------------------------------
  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return
    setIsSaving(true)
    try {
      const content = blocksToMarkdown(page)
      await templateApi.create({
        name: templateName.trim(),
        icon: page.icon || '📄',
        description: templateDesc.trim(),
        content,
      })
      toast.success(`"${templateName.trim()}" 템플릿으로 저장됐어요!`)
      onClose()
    } catch {
      toast.error('템플릿 저장에 실패했습니다.')
      setIsSaving(false)
    }
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      style={{ width: showSaveForm ? '220px' : '192px' }}
    >
      {/* ── 템플릿 저장 폼 (form 상태일 때) ── */}
      {showSaveForm ? (
        <div className="px-3 py-2 space-y-2">
          <p className="text-xs font-medium text-gray-600">템플릿으로 저장</p>
          {/* 템플릿 이름 */}
          <input
            type="text"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowSaveForm(false) }}
            placeholder="템플릿 이름"
            autoFocus
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400"
          />
          {/* 설명 (선택) */}
          <input
            type="text"
            value={templateDesc}
            onChange={e => setTemplateDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowSaveForm(false) }}
            placeholder="설명 (선택)"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400"
          />
          {/* 저장 / 취소 버튼 */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleSaveAsTemplate}
              disabled={!templateName.trim() || isSaving}
              className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setShowSaveForm(false)}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── 카테고리로 이동 섹션 ── */}
          <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">카테고리로 이동</div>

          {/* 미분류로 이동 (현재 카테고리가 있는 경우에만 표시) */}
          {pageCategoryId !== null && (
            <button
              onClick={() => handleMoveTo(null)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
            >
              <span>📋</span>
              <span>미분류</span>
            </button>
          )}

          {/* 카테고리 목록 */}
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleMoveTo(cat.id)}
              className={
                pageCategoryId === cat.id
                  ? "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-blue-600 bg-blue-50"
                  : "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
              }
            >
              <span>📁</span>
              <span className="truncate">{cat.name}</span>
              {pageCategoryId === cat.id && <span className="ml-auto text-blue-500 shrink-0">✓</span>}
            </button>
          ))}

          {categories.length === 0 && pageCategoryId === null && (
            <div className="px-3 py-1.5 text-xs text-gray-400">폴더가 없습니다</div>
          )}

          {/* 구분선 + 복제 + 템플릿 저장 + 삭제 */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            {/* 복제 */}
            <button
              onClick={() => { duplicatePage(page.id); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
            >
              <span>📋</span>
              <span>복제</span>
            </button>
            {/* 템플릿으로 저장 */}
            {/* Python으로 치면: btn_save_template.on_click = lambda: self.save_state = 'form' */}
            <button
              onClick={() => setShowSaveForm(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-600 hover:bg-gray-50"
            >
              <span>⭐</span>
              <span>템플릿으로 저장</span>
            </button>
            {/* 삭제 */}
            <button
              onClick={() => { deletePage(page.id); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-red-500 hover:bg-red-50"
            >
              <span>🗑️</span>
              <span>삭제</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}


// -----------------------------------------------
// 드래그 가능한 페이지 아이템 컴포넌트
// 검색 중: snippet + categoryName 표시 / 검색어 하이라이트
// Python으로 치면: class DraggablePageItem(Widget): ...
// -----------------------------------------------
interface PageItemProps {
  page: Page
  isSelected: boolean
  currentCategoryId: string | null
  onSelect: () => void
  // 검색 관련 (검색 중일 때만 전달)
  // Python으로 치면: search_query: str = '', snippet: str = '', category_name: str | None = None
  searchQuery?: string
  snippet?: string
  categoryName?: string | null
}

function PageItem({ page, isSelected, currentCategoryId, onSelect, searchQuery, snippet, categoryName }: PageItemProps) {
  // 컨텍스트 메뉴 표시 여부
  const [menuOpen, setMenuOpen] = useState(false)
  // 즐겨찾기 토글 액션
  const { togglePageStar } = usePageStore()

  // dnd-kit sortable: 목록 내 순서 변경 + 카테고리 크로스 패널 드래그 모두 지원
  // useSortable은 useDraggable을 포함하므로 카테고리 드롭도 그대로 동작
  // Python으로 치면: sortable = Sortable(id=page.id, data={'type': 'page'})
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    data: { type: 'page', pageId: page.id },
  })

  // 검색 중 여부
  // Python으로 치면: is_searching = bool(search_query)
  const isSearching = Boolean(searchQuery)

  const baseCls = "flex-1 min-w-0 flex items-start gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors"
  const selectedCls = baseCls + " bg-gray-200 text-gray-900"
  const normalCls = baseCls + " text-gray-600 hover:bg-gray-100"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="group relative flex items-center"
    >
      {/* 드래그 핸들 — hover 시만 표시 */}
      <span
        className="absolute left-0 shrink-0 text-gray-300 cursor-grab opacity-0 group-hover:opacity-100 text-xs px-0.5 z-10"
        {...attributes}
        {...listeners}
        title="드래그로 폴더 이동"
      >
        ⠿
      </span>

      {/* 페이지 선택 버튼 */}
      <button
        onClick={onSelect}
        className={isSelected ? selectedCls : normalCls}
      >
        <span className="text-base shrink-0 mt-0.5">{page.icon}</span>

        {/* 제목 + 검색 결과 정보 */}
        <div className="min-w-0 flex-1">

          {/* 제목 행: 제목 + 카테고리 배지 (검색 중일 때) */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="truncate">
              {/* 검색 중이면 매칭 부분 노란 하이라이트 */}
              {isSearching && searchQuery
                ? <HighlightText text={page.title || '제목 없음'} query={searchQuery} />
                : (page.title || '제목 없음')
              }
            </span>
            {/* 카테고리 배지 — 검색 결과에서만 표시 */}
            {/* Python으로 치면: if is_searching and category_name: render_badge() */}
            {isSearching && categoryName && (
              <span className="shrink-0 text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                {categoryName}
              </span>
            )}
          </div>

          {/* 스니펫 — 블록 내용에서 매칭된 텍스트 미리보기 */}
          {/* Python으로 치면: if snippet: render_snippet() */}
          {isSearching && snippet && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-tight">
              {snippet}
            </p>
          )}

          {/* 태그 칩 목록 — 태그가 있을 때 항상 표시 */}
          {/* Python으로 치면: if page.tags: render_tag_chips() */}
          {(page.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(page.tags ?? []).map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0 text-xs rounded-full bg-gray-100 text-gray-400"
                >
                  <span>#</span>{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* ── 오른쪽 액션 버튼들 ─────────────────── */}
      <div className="flex items-center shrink-0">

        {/* 즐겨찾기 별 버튼 — starred이면 항상 표시, 아니면 hover 시만 */}
        {/* Python으로 치면: star_btn.visible = page.starred or hovered */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePageStar(page.id) }}
          className={page.starred
            ? "flex items-center justify-center w-6 h-6 rounded text-yellow-400 hover:text-yellow-500 hover:bg-yellow-50 transition-all text-sm"
            : "opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-300 hover:text-yellow-400 hover:bg-yellow-50 transition-all text-sm"}
          title={page.starred ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        >
          {page.starred ? '★' : '☆'}
        </button>

        {/* "..." 컨텍스트 메뉴 버튼 */}
        <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(prev => !prev) }}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-all text-xs mr-1"
          title="옵션"
        >
          •••
        </button>

        {/* 컨텍스트 메뉴 드롭다운 */}
        {menuOpen && (
          <PageContextMenu
            page={page}
            currentCategoryId={currentCategoryId}
            onClose={() => setMenuOpen(false)}
          />
        )}
        </div>
        {/* ── 오른쪽 액션 버튼들 닫기 ── */}
      </div>
    </div>
  )
}


// -----------------------------------------------
// 정렬 키 타입 및 옵션 목록
// Python으로 치면: SortKey = Literal['default', 'updated-desc', ...]
// -----------------------------------------------
type SortKey = 'default' | 'title-asc' | 'updated-desc' | 'updated-asc' | 'created-desc' | 'status' | 'date-prop'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',      label: '기본 순서' },
  { key: 'updated-desc', label: '최근 수정순' },
  { key: 'updated-asc',  label: '오래된 수정순' },
  { key: 'created-desc', label: '최근 생성순' },
  { key: 'title-asc',    label: '제목 가나다순' },
  { key: 'status',       label: '상태별' },
  { key: 'date-prop',    label: '날짜 속성순' },
]

// 페이지 배열을 sortKey에 따라 정렬
// Python으로 치면: def sort_pages(pages, key): return sorted(pages, key=...)
function sortPages(pages: Page[], key: SortKey): Page[] {
  if (key === 'default') return pages
  const copy = [...pages]
  switch (key) {
    case 'title-asc':
      return copy.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'))
    case 'updated-desc':
      return copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    case 'updated-asc':
      return copy.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    case 'created-desc':
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case 'status': {
      // 진행 중 → 미시작 → 보류 → 완료 → 없음 순
      const order = ['진행 중', '미시작', '보류', '완료']
      return copy.sort((a, b) => {
        const as = a.properties?.find(p => p.type === 'status')?.value ?? ''
        const bs = b.properties?.find(p => p.type === 'status')?.value ?? ''
        const ai = order.indexOf(as) === -1 ? order.length : order.indexOf(as)
        const bi = order.indexOf(bs) === -1 ? order.length : order.indexOf(bs)
        return ai - bi
      })
    }
    case 'date-prop':
      return copy.sort((a, b) => {
        const ad = a.properties?.find(p => p.type === 'date')?.value ?? ''
        const bd = b.properties?.find(p => p.type === 'date')?.value ?? ''
        return bd.localeCompare(ad) // 최신 날짜 먼저
      })
    default:
      return copy
  }
}

// -----------------------------------------------
// 상태 속성 배지 색상 매핑
// Python으로 치면: STATUS_COLOR = {'미시작': ('gray', 'gray'), ...}
// -----------------------------------------------
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  '미시작': { bg: 'bg-gray-100',   text: 'text-gray-500' },
  '진행 중': { bg: 'bg-blue-100',  text: 'text-blue-700' },
  '완료':   { bg: 'bg-green-100',  text: 'text-green-700' },
  '보류':   { bg: 'bg-yellow-100', text: 'text-yellow-700' },
}

// -----------------------------------------------
// 커버 값 → CSS 스타일 변환 헬퍼
// "gradient:..." / "color:..." / URL / undefined
// Python으로 치면: def get_cover_style(cover: str | None) -> dict: ...
// -----------------------------------------------
function getCoverStyle(cover?: string): React.CSSProperties {
  if (!cover) return { background: '#e5e7eb' }
  if (cover.startsWith('gradient:')) return { background: cover.slice('gradient:'.length) }
  if (cover.startsWith('color:')) return { background: cover.slice('color:'.length) }
  // 이미지 URL
  return {
    backgroundImage: `url(${cover})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

// -----------------------------------------------
// GalleryCard — 갤러리 뷰 카드 컴포넌트
// 커버 썸네일 + 아이콘 + 제목 + 태그 + 블록 수
// Python으로 치면: class GalleryCard(Widget): def render(self): ...
// -----------------------------------------------
interface GalleryCardProps {
  page: Page
  isSelected: boolean
  onSelect: () => void
}

function GalleryCard({ page, isSelected, onSelect }: GalleryCardProps) {
  // 비어있지 않은 블록 수 계산 (내용 척도)
  // Python으로 치면: block_count = sum(1 for b in page.blocks if b.content)
  const blockCount = page.blocks.filter(b => b.content.trim()).length

  // 상대 시간 표시 (예: "2일 전")
  // Python으로 치면: def rel_time(dt): diff = now - dt; return f'{diff.days}일 전' if ...
  function relTime(date: Date | string | undefined): string {
    if (!date) return ''
    const ms = Date.now() - new Date(date).getTime()
    const min = Math.floor(ms / 60000)
    if (min < 1) return '방금'
    if (min < 60) return `${min}분 전`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}시간 전`
    const day = Math.floor(hr / 24)
    if (day < 30) return `${day}일 전`
    return `${Math.floor(day / 30)}달 전`
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex flex-col rounded-lg overflow-hidden text-left transition-all w-full',
        'border',
        isSelected
          ? 'border-blue-400 ring-1 ring-blue-200 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm',
      ].join(' ')}
    >
      {/* 커버 썸네일 영역 */}
      {/* Python으로 치면: cover_div = QLabel(); cover_div.setBackground(cover_style) */}
      <div className="w-full h-16 shrink-0 relative" style={getCoverStyle(page.cover)}>
        {/* 커버 없을 때: 아이콘을 중앙에 크게 표시 */}
        {!page.cover && (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-20 select-none">
            {page.icon}
          </div>
        )}
        {/* 즐겨찾기 뱃지 */}
        {page.starred && (
          <span className="absolute top-1 right-1 text-[10px] bg-yellow-400 text-white px-1 rounded leading-tight">
            ★
          </span>
        )}
      </div>

      {/* 카드 본문 */}
      <div className="p-1.5 bg-white flex flex-col gap-0.5 flex-1">
        {/* 아이콘 + 제목 */}
        <div className="flex items-start gap-1">
          <span className="text-xs shrink-0 leading-tight">{page.icon}</span>
          <span className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight break-all">
            {page.title || '제목 없음'}
          </span>
        </div>

        {/* 태그 (최대 2개, 넘치면 +N) */}
        {(page.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {(page.tags ?? []).slice(0, 2).map(tag => (
              <span
                key={tag}
                className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded-full leading-none"
              >
                #{tag}
              </span>
            ))}
            {(page.tags ?? []).length > 2 && (
              <span className="text-[9px] text-gray-400 leading-none self-center">
                +{(page.tags ?? []).length - 2}
              </span>
            )}
          </div>
        )}

        {/* 속성 미리보기 — 상태 배지 + 날짜 값 */}
        {/* Python으로 치면: if status_prop or date_prop: render_props() */}
        {(() => {
          const statusProp = (page.properties ?? []).find(p => p.type === 'status' && p.value)
          const dateProp   = (page.properties ?? []).find(p => p.type === 'date'   && p.value)
          if (!statusProp && !dateProp) return null
          const sc = statusProp ? (STATUS_COLOR[statusProp.value] ?? { bg: 'bg-gray-100', text: 'text-gray-500' }) : null
          return (
            <div className="flex flex-wrap gap-0.5 mt-0.5">
              {statusProp && sc && (
                <span className={`text-[9px] px-1 py-0.5 rounded leading-none ${sc.bg} ${sc.text}`}>
                  {statusProp.value}
                </span>
              )}
              {dateProp && (
                <span className="text-[9px] px-1 py-0.5 rounded leading-none bg-purple-50 text-purple-600">
                  {dateProp.value}
                </span>
              )}
            </div>
          )
        })()}

        {/* 블록 수 + 수정 시각 */}
        <div className="text-[9px] text-gray-400 mt-auto pt-0.5 flex items-center justify-between">
          <span>{blockCount}개 블록</span>
          <span>{relTime(page.updatedAt)}</span>
        </div>
      </div>
    </button>
  )
}


// -----------------------------------------------
// PageList — 메인 컴포넌트
// onOpenSettings: 설정 모달을 여는 콜백 (page.tsx에서 전달)
// Python으로 치면: class PageList(Widget): def __init__(self, on_open_settings): ...
// -----------------------------------------------
interface PageListProps {
  onOpenSettings?: () => void
  // 모바일에서 페이지 선택 시 사이드바 드로어를 닫는 콜백
  // Python으로 치면: on_close_mobile: Callable | None = None
  onCloseMobile?: () => void
  // 데이터베이스 테이블 뷰 활성 여부 (page.tsx에서 전달)
  // Python으로 치면: db_view_active: bool = False
  dbViewActive?: boolean
  // 데이터베이스 테이블 뷰 토글 콜백
  // Python으로 치면: on_toggle_db_view: Callable[[], None] | None = None
  onToggleDbView?: () => void
}

export default function PageList({ onOpenSettings, onCloseMobile, dbViewActive, onToggleDbView }: PageListProps) {

  const {
    pages,
    currentPageId,
    currentCategoryId,
    categoryMap,
    categories,
    setCurrentPage,
    recentPageIds,
    pushRecentPage,
  } = usePageStore()

  // 플러그인 설정 — recentFiles ON일 때만 최근 파일 섹션 표시
  // Python으로 치면: show_recent = settings.plugins['recentFiles']
  const { plugins } = useSettingsStore()

  // -----------------------------------------------
  // 클라이언트 마운트 여부 — SSR hydration 오류 방지
  // localStorage 기반 데이터(최근 파일)는 SSR에서 빈 배열이므로
  // 마운트 후에만 렌더링하여 서버/클라이언트 불일치를 막음
  // Python으로 치면: self.mounted = False; def on_mount(self): self.mounted = True
  // -----------------------------------------------
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── 정렬 키 — localStorage 영속화 ────────────
  // Python으로 치면: sort_key = localStorage.get('pageListSortKey', 'default')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  useEffect(() => {
    const saved = localStorage.getItem('pageListSortKey')
    if (saved) setSortKey(saved as SortKey)
  }, [])
  function handleSetSortKey(key: SortKey) {
    setSortKey(key)
    localStorage.setItem('pageListSortKey', key)
    setShowSortMenu(false)
  }

  // 정렬 드롭다운 표시 여부
  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  // 정렬 메뉴 외부 클릭 → 닫기
  // Python으로 치면: document.addEventListener('click', close_if_outside)
  useEffect(() => {
    if (!showSortMenu) return
    function handler(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSortMenu])

  // ── 속성 필터 (상태 타입만 지원) ─────────────
  // Python으로 치면: prop_filter: dict | None = None
  const [propFilter, setPropFilter] = useState<{ type: 'status'; value: string } | null>(null)

  // 검색어 상태
  // Python으로 치면: search_query = ''
  const [searchQuery, setSearchQuery] = useState('')

  // 활성 태그 필터 (null = 필터 없음)
  // Python으로 치면: active_tag_filter: str | None = None
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)

  // 캘린더에서 선택된 날짜 필터 ('YYYY-MM-DD' 또는 null)
  // Python으로 치면: selected_date: str | None = None
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 검색 입력창 DOM 참조 (포커스 제어용)
  // Python으로 치면: search_input_ref = None
  const searchInputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------
  // 뷰 모드 ('list' | 'gallery') — localStorage 영속화
  // Python으로 치면: view_mode = localStorage.get('viewMode', 'list')
  // -----------------------------------------------
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list')
  // 마운트 후 localStorage에서 뷰 모드 복원 (SSR 안전)
  // Python으로 치면: def on_mount(self): self.view_mode = local_storage['pageListViewMode']
  useEffect(() => {
    const saved = localStorage.getItem('pageListViewMode')
    if (saved === 'gallery' || saved === 'list') setViewMode(saved)
  }, [])
  // 뷰 모드 변경 + localStorage 저장
  // Python으로 치면: def set_view(mode): self.view_mode = mode; local_storage['pageListViewMode'] = mode
  function handleSetViewMode(mode: 'list' | 'gallery') {
    setViewMode(mode)
    localStorage.setItem('pageListViewMode', mode)
  }

  // -----------------------------------------------
  // 현재 카테고리에 해당하는 페이지만 필터링 (검색 없을 때)
  // currentCategoryId가 null이면 전체보기 (모든 페이지)
  // Python으로 치면:
  //   if current_cat is None: return all_pages
  //   else: return [p for p in pages if categoryMap[p.id] == current_cat]
  // -----------------------------------------------
  const categoryPages = currentCategoryId === null
    ? pages
    : pages.filter(p => (categoryMap[p.id] ?? null) === currentCategoryId)

  // -----------------------------------------------
  // 검색어·태그 필터 순서로 페이지 목록 좁히기
  // 1) 검색어 있음 → 전체 pages 전문 검색
  //    없음 → 카테고리 필터 결과(categoryPages)
  // 2) activeTagFilter 있음 → 태그로 추가 필터링
  // Python으로 치면:
  //   base = search(all_pages, query) if query else category_pages
  //   if tag: base = [p for p in base if tag in (p.tags or [])]
  // -----------------------------------------------
  const filteredPages = (() => {
    let base = searchQuery.trim()
      ? pages.filter(p => {
          const q = searchQuery.toLowerCase()
          if (p.title.toLowerCase().includes(q)) return true
          return getPageSearchText(p).toLowerCase().includes(q)
        })
      : categoryPages
    if (activeTagFilter) {
      base = base.filter(p => (p.tags ?? []).includes(activeTagFilter))
    }
    // 캘린더 날짜 필터 — 선택된 날짜에 생성된 페이지만 표시
    // createdAt이 Date 객체이거나 ISO 문자열일 수 있으므로 두 경우 모두 처리
    // Python으로 치면: if selected_date: base = [p for p in base if str(p.createdAt)[:10] == selected_date]
    if (selectedDate) {
      base = base.filter(p => {
        if (!p.createdAt) return false
        // createdAt은 ISO 문자열 — 앞 10자리가 YYYY-MM-DD
        const dateStr = String(p.createdAt).slice(0, 10)
        return dateStr === selectedDate
      })
    }
    // 속성 필터 — 상태 속성 값으로 필터링
    // Python으로 치면: if prop_filter: base = [p for p in base if p.properties[type] == value]
    if (propFilter) {
      base = base.filter(p => {
        const prop = (p.properties ?? []).find(pr => pr.type === propFilter.type)
        return prop?.value === propFilter.value
      })
    }
    // 정렬 적용 (검색 중에는 관련도 순 유지)
    // Python으로 치면: if not query: base = sort_pages(base, sort_key)
    if (!searchQuery.trim()) {
      if (sortKey === 'default') {
        // 기본: 즐겨찾기 상단 정렬
        base = [...base.filter(p => p.starred), ...base.filter(p => !p.starred)]
      } else {
        base = sortPages(base, sortKey)
      }
    }
    return base
  })()

  // -----------------------------------------------
  // 현재 뷰(categoryPages)에 존재하는 모든 고유 태그 수집
  // 태그 필터 칩 표시용
  // Python으로 치면: all_tags = sorted(set(tag for p in category_pages for tag in p.tags))
  // -----------------------------------------------
  const allTagsInView = Array.from(
    new Set(categoryPages.flatMap(p => p.tags ?? []))
  )

  // 현재 뷰 페이지들 중 상태 속성을 가진 고유 상태값 목록 (필터 칩용)
  // Python으로 치면: all_status_vals = sorted({p.status for p in category_pages if p.status})
  const allStatusValues = Array.from(new Set(
    categoryPages
      .flatMap(p => p.properties ?? [])
      .filter((prop): prop is PageProperty => prop.type === 'status' && Boolean(prop.value))
      .map(prop => prop.value)
  ))

  // 현재 카테고리 이름 (헤더에 표시)
  // Python으로 치면: cat_name = cats[current_cat].name if current_cat else '전체보기'
  const currentCategoryName = currentCategoryId === null
    ? '전체보기'
    : categories.find(c => c.id === currentCategoryId)?.name ?? '전체보기'

  // 새 페이지 다이얼로그 열림 여부 (빈 페이지 or 템플릿 선택)
  // Python으로 치면: self.new_page_dialog_open = False
  const [newPageDialogOpen, setNewPageDialogOpen] = useState(false)

  // 새 메모 버튼 → 다이얼로그 열기 (빈 페이지 or 템플릿 선택)
  // Python으로 치면: def handle_add_page(self): self.new_page_dialog_open = True
  function handleAddPage() {
    setNewPageDialogOpen(true)
  }

  return (
    <>
    <aside className="w-60 h-screen bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">

      {/* ── 헤더: 현재 카테고리 이름 + 뷰 토글 ─────── */}
      <div className="px-3 py-3 border-b border-gray-200 flex items-center gap-2">
        <h1 className="text-sm font-semibold text-gray-700 truncate flex-1">
          {/* 검색 중이면 "검색 결과" 표시 */}
          {/* Python으로 치면: header = '검색 결과' if search_query else cat_name */}
          {searchQuery.trim()
            ? `검색 결과 (${filteredPages.length})`
            : selectedDate
            ? `${selectedDate} (${filteredPages.length})`
            : currentCategoryName}
        </h1>
        {/* 뷰 토글 + 정렬 버튼 그룹 */}
        {/* Python으로 치면: self.btn_group = [ListBtn, GridBtn, SortBtn] */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            title="목록 보기"
            onClick={() => handleSetViewMode('list')}
            className={viewMode === 'list'
              ? 'p-1 rounded text-blue-500 bg-blue-50'
              : 'p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'}
          >
            <List size={14} />
          </button>
          <button
            type="button"
            title="갤러리 보기"
            onClick={() => handleSetViewMode('gallery')}
            className={viewMode === 'gallery'
              ? 'p-1 rounded text-blue-500 bg-blue-50'
              : 'p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'}
          >
            <LayoutGrid size={14} />
          </button>

          {/* 데이터베이스 테이블 뷰 토글 버튼 */}
          {/* Python으로 치면: db_btn.on_click = lambda: on_toggle_db_view() */}
          <button
            type="button"
            title="테이블 뷰"
            onClick={onToggleDbView}
            className={dbViewActive
              ? 'p-1 rounded text-blue-500 bg-blue-50'
              : 'p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'}
          >
            <Table2 size={14} />
          </button>

          {/* 정렬 버튼 — 클릭 시 드롭다운 */}
          {/* Python으로 치면: sort_btn.on_click = lambda: show_sort_menu = True */}
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              title="정렬"
              onClick={() => setShowSortMenu(v => !v)}
              className={showSortMenu || sortKey !== 'default'
                ? 'p-1 rounded text-blue-500 bg-blue-50'
                : 'p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'}
            >
              <ArrowUpDown size={14} />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-32.5">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleSetSortKey(opt.key)}
                    className={[
                      'w-full px-3 py-1.5 text-xs text-left flex items-center justify-between',
                      sortKey === opt.key ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {opt.label}
                    {sortKey === opt.key && <span className="text-blue-500">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 검색바 ────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-md focus-within:border-blue-400 transition-colors">
          <span className="text-gray-400 text-sm shrink-0">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Escape → 검색 초기화
              // Python으로 치면: if event.key == 'Escape': search_query = ''
              if (e.key === 'Escape') {
                setSearchQuery('')
                searchInputRef.current?.blur()
              }
            }}
            placeholder="전체 메모 검색..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
          />
          {/* 검색어 지우기 버튼 */}
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
              className="text-gray-400 hover:text-gray-600 text-xs shrink-0"
              title="검색 지우기"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── 캘린더 위젯 (플러그인 ON일 때만 표시) ─────────
          검색바 바로 아래에 접이식으로 배치
          pages 전체를 넘겨 createdAt 기반으로 날짜별 점 표시
          Python으로 치면: if plugins.calendar: render(CalendarWidget) */}
      {plugins.calendar && (
        <CalendarWidget
          pages={pages}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}

      {/* ── 태그 필터 바 (태그가 하나라도 있을 때만 표시) ───
          각 태그를 클릭 가능한 칩으로 표시
          활성 태그: 파란색, 비활성 태그: 회색
          Python으로 치면: if all_tags: render_tag_filters() */}
      {allTagsInView.length > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-100 flex flex-wrap gap-1">
          {allTagsInView.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTagFilter(prev => prev === tag ? null : tag)}
              className={activeTagFilter === tag
                ? "inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium transition-colors"
                : "inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"}
              title={activeTagFilter === tag ? '태그 필터 해제' : `#${tag} 로 필터`}
            >
              <span className={activeTagFilter === tag ? "text-blue-400" : "text-gray-400"}>#</span>
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── 상태 속성 필터 칩 (해당 속성 가진 페이지가 있을 때만 표시) ───
          상태값(미시작/진행 중/완료/보류) 클릭 → 해당 상태 페이지만 표시
          Python으로 치면: if all_status_values: render_status_filter_chips() */}
      {allStatusValues.length > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-100 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-gray-400 shrink-0">상태</span>
          {allStatusValues.map(val => {
            const sc = STATUS_COLOR[val] ?? { bg: 'bg-gray-100', text: 'text-gray-500' }
            const active = propFilter?.value === val
            return (
              <button
                key={val}
                type="button"
                onClick={() => setPropFilter(prev => prev?.value === val ? null : { type: 'status', value: val })}
                className={[
                  'text-[10px] px-1.5 py-0.5 rounded-full transition-colors',
                  active ? `${sc.bg} ${sc.text} font-medium ring-1 ring-current ring-offset-1` : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                ].join(' ')}
                title={active ? '필터 해제' : `${val} 상태만 보기`}
              >
                {val}
              </button>
            )
          })}
        </div>
      )}

      {/* ── 페이지 목록 / 갤러리 ─────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* 검색 결과 없을 때 안내 */}
        {filteredPages.length === 0 && (
          <div className="px-2 py-4 text-center">
            <p className="text-sm text-gray-400">
              {searchQuery.trim() ? `"${searchQuery}"` : ''}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {searchQuery.trim() ? '검색 결과가 없습니다' : '메모가 없습니다'}
            </p>
          </div>
        )}

        {/* ── 리스트 뷰 ── */}
        {/* Python으로 치면: if view_mode == 'list': render_list() */}
        {viewMode === 'list' && (
          <nav className="px-2 py-2">
            <SortableContext items={filteredPages.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {filteredPages.map((page) => {
                const snippet = searchQuery.trim() ? getSnippet(page, searchQuery) : ''
                const catId = categoryMap[page.id] ?? null
                const catName = searchQuery.trim()
                  ? (catId ? (categories.find(c => c.id === catId)?.name ?? null) : '미분류')
                  : null

                return (
                  <PageItem
                    key={page.id}
                    page={page}
                    isSelected={currentPageId === page.id}
                    currentCategoryId={currentCategoryId}
                    onSelect={() => { setCurrentPage(page.id); pushRecentPage(page.id); onCloseMobile?.() }}
                    searchQuery={searchQuery.trim() || undefined}
                    snippet={snippet || undefined}
                    categoryName={catName}
                  />
                )
              })}
            </SortableContext>
          </nav>
        )}

        {/* ── 갤러리 뷰 ── */}
        {/* 2열 그리드, 커버 썸네일 + 아이콘/제목/태그 카드 */}
        {/* Python으로 치면: if view_mode == 'gallery': render_grid() */}
        {viewMode === 'gallery' && filteredPages.length > 0 && (
          <div className="px-2 py-2 grid grid-cols-2 gap-1.5">
            {filteredPages.map((page) => (
              <GalleryCard
                key={page.id}
                page={page}
                isSelected={currentPageId === page.id}
                onSelect={() => { setCurrentPage(page.id); pushRecentPage(page.id); onCloseMobile?.() }}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── 최근 파일 섹션 (플러그인 ON + 기록 있을 때만 표시) ─── */}
      {/* mounted 체크: localStorage는 SSR에서 빈 배열 → hydration 불일치 방지 */}
      {/* Python으로 치면: if mounted and plugins.recentFiles and recent_page_ids: render_recent() */}
      {mounted && plugins.recentFiles && recentPageIds.length > 0 && (
        <div className="border-t border-gray-200 px-2 py-2 shrink-0">

          {/* 섹션 헤더 */}
          <div className="flex items-center gap-1 px-2 mb-1">
            <span className="text-xs text-gray-400">🕓</span>
            <span className="text-xs font-medium text-gray-400">최근 파일</span>
          </div>

          {/* 최근 열어본 페이지 목록 (최대 5개) */}
          {/* Python으로 치면: for page_id in recent_ids[:5]: render_item(page_id) */}
          {recentPageIds.slice(0, 5).map(pageId => {
            const page = pages.find(p => p.id === pageId)
            // 삭제된 페이지는 건너뜀
            if (!page) return null
            const isSelected = currentPageId === pageId
            return (
              <button
                key={pageId}
                type="button"
                onClick={() => { setCurrentPage(pageId); pushRecentPage(pageId); onCloseMobile?.() }}
                className={isSelected
                  ? "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm text-left bg-gray-200 text-gray-900"
                  : "w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm text-left text-gray-500 hover:bg-gray-100 transition-colors"}
              >
                <span className="text-sm shrink-0">{page.icon}</span>
                <span className="truncate text-xs">{page.title || '제목 없음'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── 하단: 새 메모 버튼 + 설정 버튼 ─────────── */}
      <div className="px-2 py-3 border-t border-gray-200 flex items-center gap-1">
        {/* 새 메모 버튼 */}
        <button
          onClick={handleAddPage}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          <span>새 메모</span>
        </button>
        {/* ⚙️ 설정 버튼 — 클릭 시 설정 모달 열기 */}
        {/* Python으로 치면: settings_btn = QPushButton('⚙'); settings_btn.clicked.connect(on_open_settings) */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-base shrink-0"
          title="설정 열기"
        >
          ⚙️
        </button>
      </div>

    </aside>

    {/* ── 새 페이지 다이얼로그 ─────────────────────
        빈 페이지 or 템플릿 선택 후 생성
        Python으로 치면: if new_page_dialog_open: render(NewPageDialog) */}
    {newPageDialogOpen && (
      <NewPageDialog
        categoryId={currentCategoryId}
        onClose={() => setNewPageDialogOpen(false)}
      />
    )}
    </>
  )
}
