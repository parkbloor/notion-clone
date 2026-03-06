// =============================================
// src/components/editor/PageEditor.tsx
// 역할: 한 페이지 안의 모든 블록을 목록으로 렌더링
// Python으로 치면: for block in page.blocks: render(block)
// =============================================

'use client'

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { toast } from 'sonner'
import { usePageStore } from '@/store/pageStore'
import { api } from '@/lib/api'
import { Block, Page } from '@/types/block'
import Editor from './Editor'
import EmojiPicker from './EmojiPicker'
import CoverPicker from './CoverPicker'
import TemplatePanel from './TemplatePanel'
import TocPanel from './TocPanel'
import BacklinkPanel from './BacklinkPanel'
import FindReplacePanel from './FindReplacePanel'
import PropertyPanel from './PropertyPanel'
import { useSettingsStore } from '@/store/settingsStore'
import { useFindReplaceStore } from '@/store/findReplaceStore'

// =============================================
// 마크다운 내보내기 헬퍼 함수들
// Python으로 치면: def block_to_markdown(block): ...
// =============================================

// -----------------------------------------------
// HTML 태그 제거 → 순수 텍스트 추출
// Python으로 치면: import html; html.unescape(re.sub(r'<[^>]+>', '', s))
// -----------------------------------------------
function stripHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '')
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

// -----------------------------------------------
// HTML 인라인 서식 → 마크다운 서식 변환
// <strong> → **bold**, <em> → *italic*, <del> → ~~strikethrough~~
// Python으로 치면: def html_to_md_inline(s): return re.sub(r'<strong>(.*?)</strong>', r'**\1**', s)
// -----------------------------------------------
function htmlToMdInline(html: string): string {
  return html
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/g, '*$1*')
    .replace(/<s>([\s\S]*?)<\/s>/g, '~~$1~~')
    .replace(/<del>([\s\S]*?)<\/del>/g, '~~$1~~')
    .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

// -----------------------------------------------
// 블록 하나 → 마크다운 문자열
// Python으로 치면: def block_to_md(block: Block) -> str: ...
// -----------------------------------------------
function blockToMarkdown(block: Block): string {
  const c = block.content

  switch (block.type) {
    case 'paragraph':
      return htmlToMdInline(c).trim()

    case 'heading1': return `# ${stripHtml(c)}`
    case 'heading2': return `## ${stripHtml(c)}`
    case 'heading3': return `### ${stripHtml(c)}`

    case 'bulletList': {
      // <ul><li><p>항목</p></li>...</ul> 구조
      // Python으로 치면: items = [li.text for li in ul.find_all('li')]
      const div = document.createElement('div')
      div.innerHTML = c
      const items = div.querySelectorAll('li')
      return Array.from(items)
        .map(li => `- ${li.textContent?.trim() ?? ''}`)
        .join('\n')
    }

    case 'orderedList': {
      const div = document.createElement('div')
      div.innerHTML = c
      const items = div.querySelectorAll('li')
      return Array.from(items)
        .map((li, i) => `${i + 1}. ${li.textContent?.trim() ?? ''}`)
        .join('\n')
    }

    case 'taskList': {
      const div = document.createElement('div')
      div.innerHTML = c
      const items = div.querySelectorAll('li')
      return Array.from(items).map(li => {
        // data-checked 속성으로 체크 여부 확인
        const checked = li.getAttribute('data-checked') === 'true'
        return `- [${checked ? 'x' : ' '}] ${li.textContent?.trim() ?? ''}`
      }).join('\n')
    }

    case 'toggle': {
      // toggle content = JSON { header: '<p>...</p>', body: '<p>...</p>' }
      // Python으로 치면: parsed = json.loads(c); header, body = parsed['header'], parsed['body']
      try {
        const parsed = JSON.parse(c) as { header?: string; body?: string }
        const header = stripHtml(parsed.header ?? '').trim()
        const body = stripHtml(parsed.body ?? '').trim()
        return body
          ? `**${header}**\n${body.split('\n').map(l => `  ${l}`).join('\n')}`
          : `**${header}**`
      } catch { return stripHtml(c) }
    }

    case 'code': {
      // Tiptap code block content는 <pre><code>...</code></pre>
      const div = document.createElement('div')
      div.innerHTML = c
      const code = div.textContent ?? c
      return `\`\`\`\n${code}\n\`\`\``
    }

    case 'image':
      // content = 이미지 URL 문자열
      return `![이미지](${c})`

    case 'math':
      // LaTeX 수식 블록 → 마크다운 수식 펜스($$...$$)로 내보내기
      // Python으로 치면: f'$$\n{latex}\n$$'
      return c.trim() ? `$$\n${c.trim()}\n$$` : ''

    case 'embed': {
      // 임베드 블록 → 마크다운 링크로 내보내기
      // Python으로 치면: url = json.loads(c).get('url', ''); f'[임베드]({url})'
      try {
        const { url } = JSON.parse(c) as { url?: string }
        return url ? `[임베드](${url})` : ''
      } catch { return '' }
    }

    case 'divider':
      return '---'

    case 'table': {
      // 기본 HTML 테이블 → 마크다운 표
      // Python으로 치면: rows = [[cell.text for cell in row] for row in table.find_all('tr')]
      const div = document.createElement('div')
      div.innerHTML = c
      const rows = div.querySelectorAll('tr')
      const mdRows = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('th, td')
        return '| ' + Array.from(cells).map(cell => cell.textContent?.trim() ?? '').join(' | ') + ' |'
      })
      // 첫 번째 행(헤더) 다음에 구분선 삽입
      if (mdRows.length > 0) {
        const sepCols = rows[0].querySelectorAll('th, td').length
        const sep = '| ' + Array(sepCols).fill('---').join(' | ') + ' |'
        mdRows.splice(1, 0, sep)
      }
      return mdRows.join('\n')
    }

    case 'kanban': {
      // kanban content = JSON { columns: [{ title, cards: [{id, text}] }] }
      // Python으로 치면: '\n\n'.join(f'**[{col.title}]**\n' + '\n'.join(f'  - {c.text}' for c in col.cards) for col in columns)
      try {
        const parsed = JSON.parse(c) as { columns: Array<{ title: string; cards: Array<{ text: string }> }> }
        return parsed.columns.map(col => {
          const cards = col.cards.map(card => `  - ${card.text}`).join('\n')
          return `**[${col.title}]**\n${cards || '  (비어 있음)'}`
        }).join('\n\n')
      } catch { return '' }
    }

    case 'admonition': {
      // admonition content = JSON { variant: 'tip'|'info'|'warning'|'danger', text: '<p>...</p>' }
      // Python으로 치면: f'> {icon} **{variant.upper()}**\n> {text}'
      try {
        const parsed = JSON.parse(c) as { variant: string; text: string }
        const icons: Record<string, string> = { tip: '💡', info: 'ℹ️', warning: '⚠️', danger: '❌' }
        const icon = icons[parsed.variant] ?? '💡'
        const text = stripHtml(parsed.text ?? '').trim()
        return `> ${icon} **${parsed.variant.toUpperCase()}**\n> ${text}`
      } catch { return '' }
    }

    default:
      return stripHtml(c).trim()
  }
}

// -----------------------------------------------
// 페이지 전체 → 마크다운 문자열 생성
// Python으로 치면: def page_to_markdown(page: Page) -> str: ...
// -----------------------------------------------
function pageToMarkdown(page: Page): string {
  const lines: string[] = []
  // 제목
  lines.push(`# ${page.title || '제목 없음'}`)
  lines.push('')
  // 태그
  if ((page.tags ?? []).length > 0) {
    lines.push(`태그: ${page.tags!.map(t => `#${t}`).join(' ')}`)
    lines.push('')
  }
  // 블록 순서대로 변환
  for (const block of page.blocks) {
    const md = blockToMarkdown(block)
    if (md.trim()) lines.push(md)
  }
  return lines.join('\n')
}

// ── 섹션 접기: 헤딩 레벨 맵 ──────────────────────
// heading 타입 → 레벨 숫자 (1=최상위, 6=최하위)
// 레벨 추론: H{n}이 접히면 다음 H{m≤n} 등장 전까지 하위 블록 모두 숨김
// Python으로 치면: HEADING_LEVEL = {'heading1': 1, ..., 'heading6': 6}
const HEADING_LEVEL: Record<string, number> = {
  heading1: 1, heading2: 2, heading3: 3,
  heading4: 4, heading5: 5, heading6: 6,
}

// ── dnd-kit 임포트 ────────────────────────────
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

interface PageEditorProps {
  pageId: string
}

export default function PageEditor({ pageId }: PageEditorProps) {

  // -----------------------------------------------
  // 스토어에서 현재 페이지 데이터 + 액션 가져오기
  // -----------------------------------------------
  const page = usePageStore((state) =>
    state.pages.find(p => p.id === pageId) ?? null
  )
  const {
    updatePageTitle, addBlock, moveBlock,
    updatePageIcon, updatePageCover, updatePageCoverPosition,
    addTagToPage, removeTagFromPage,
    undoPage, redoPage, canUndo, canRedo,
    applyTemplate,
  } = usePageStore()

  // historyVersion 구독 → undo/redo 실행 시 버튼 활성화 상태 자동 갱신
  // Python으로 치면: self.history_version = store.history_version  # reactive
  const historyVersion = usePageStore((state) => state.historyVersion)

  // 플러그인 설정 + 집중 모드 상태/토글 구독
  // Python으로 치면: self.plugins = settings_store.plugins
  const { plugins, isFocusMode, toggleFocusMode } = useSettingsStore()

  // ── 섹션 접기 상태 ───────────────────────────
  // 접힌 heading 블록 ID 집합 — 접힌 헤딩의 하위 블록들은 렌더링에서 제외
  // Python으로 치면: self.collapsed_sections: set[str] = set()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // 특정 헤딩 ID 접기/펼치기 토글
  // Python으로 치면: collapsed.symmetric_difference_update({block_id})
  const toggleSection = useCallback((blockId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
  }, [])

  // ── UI 상태 ──────────────────────────────────
  // 이모지 피커 열림 여부
  const [emojiOpen, setEmojiOpen] = useState(false)
  // 커버 피커 열림 여부
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  // 커버 이미지 위치 조정 모드 여부 (드래그로 Y 위치 변경)
  const [isAdjustingCover, setIsAdjustingCover] = useState(false)
  // 내보내기 드롭다운 열림 여부
  // Python으로 치면: self.export_menu_open = False
  const [exportOpen, setExportOpen] = useState(false)
  // 내보내기 메뉴 DOM 참조 (외부 클릭 감지용)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // ── 찾기/바꾸기 스토어 (Ctrl+H 핸들러용) ──────────
  // Python으로 치면: self.find_replace = find_replace_store
  const openFindReplace = useFindReplaceStore((s) => s.open)

  // ── Ctrl+H → 찾기/바꾸기 패널 열기 ──────────────
  // Python으로 치면: def on_key_down(e): if e.ctrlKey and e.key == 'h': open_find_replace()
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        openFindReplace(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        openFindReplace(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openFindReplace])

  // -----------------------------------------------
  // 내보내기 드롭다운 외부 클릭 시 닫기
  // Python으로 치면: document.on('click', lambda e: close_if_outside(e))
  // -----------------------------------------------
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // -----------------------------------------------
  // Markdown 내보내기 — 블록 순서대로 변환 후 .md 파일 다운로드
  // Python으로 치면: def export_markdown(): write_file(f'{title}.md', page_to_md(page))
  // -----------------------------------------------
  function handleExportMarkdown() {
    if (!page) return
    const md = pageToMarkdown(page)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${page.title || '제목없음'}.md`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }

  // -----------------------------------------------
  // PDF 내보내기 — window.print() 브라우저 인쇄 다이얼로그
  // 인쇄 전: body에 'is-printing' 클래스 추가 → CSS에서 레이아웃 재정의
  // 인쇄 후: afterprint 이벤트로 클래스 자동 제거
  // Python으로 치면: def export_pdf(): body.class_list.add('is-printing'); print(); body.class_list.remove(...)
  // -----------------------------------------------
  function handleExportPdf() {
    setExportOpen(false)
    setTimeout(() => {
      // 인쇄 완료(또는 취소) 후 클래스 제거
      function onAfterPrint() {
        document.body.classList.remove('is-printing')
        window.removeEventListener('afterprint', onAfterPrint)
      }
      window.addEventListener('afterprint', onAfterPrint)
      document.body.classList.add('is-printing')
      window.print()
    }, 50)
  }

  // ── 태그 UI 상태 ─────────────────────────────
  // 태그 인풋 표시 여부
  // Python으로 치면: self.is_tag_input_visible = False
  const [isTagInputVisible, setIsTagInputVisible] = useState(false)
  // 태그 인풋 입력값
  const [tagInput, setTagInput] = useState('')

  // 태그 추가 실행 (Enter / 쉼표 / blur 시 호출)
  // Python으로 치면: def handle_add_tag(self): ...
  function handleAddTag() {
    const trimmed = tagInput.trim().replace(/^#/, '') // 앞의 # 제거
    if (trimmed) addTagToPage(pageId, trimmed)
    setTagInput('')
    setIsTagInputVisible(false)
  }

  // ── 커버 위치 ─────────────────────────────────
  // 로컬 Y 위치 (0~100): 드래그 중 실시간 반영, 완료 시 store에 저장
  // Python으로 치면: self.local_pos = page.cover_position or 50
  const [localCoverPos, setLocalCoverPos] = useState<number>(50)
  // 드래그 중 최신 pos를 클로저 밖에서 읽기 위한 ref
  const dragPosRef = useRef<number>(50)

  // 페이지 변경 시 로컬 위치 + 조정 모드 초기화
  useEffect(() => {
    const pos = page?.coverPosition ?? 50
    setLocalCoverPos(pos)
    dragPosRef.current = pos
    setIsAdjustingCover(false)
  }, [page?.id, page?.coverPosition])

  // ── DOM 참조 ─────────────────────────────────
  // 커버 파일 입력 (숨겨진 input)
  const coverInputRef = useRef<HTMLInputElement>(null)
  // 커버 영역 (드래그 시 높이 계산용)
  const coverAreaRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // 커버 값 파싱 헬퍼
  //
  // cover 문자열 형식:
  //   "gradient:linear-gradient(...)"  → CSS gradient background
  //   "color:#ff6b6b"                  → 단색 background
  //   그 외                             → 이미지 URL
  //
  // Python으로 치면:
  //   def is_bg_only(cover): return cover.startswith(('gradient:', 'color:'))
  // -----------------------------------------------
  function isBgCover(cover: string): boolean {
    return cover.startsWith('gradient:') || cover.startsWith('color:')
  }

  // gradient: / color: prefix 제거 → CSS background 값 반환
  function getCoverBgValue(cover: string): string {
    if (cover.startsWith('gradient:')) return cover.slice('gradient:'.length)
    if (cover.startsWith('color:')) return cover.slice('color:'.length)
    return ''
  }

  // -----------------------------------------------
  // 커버 이미지 파일 선택 → 서버 업로드 후 URL 저장
  // 업로드 실패 시 base64 저장 금지 — vault 파일 비대화 방지
  // Python으로 치면:
  //   async def on_cover_change(file):
  //       try: url = await api.upload(file); update_cover(url)
  //       except: toast.error(...); return  # base64 저장 안 함
  // -----------------------------------------------
  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const url = await api.uploadImage(pageId, file)
      updatePageCover(pageId, url)
    } catch {
      // 업로드 실패 시 에러 표시만 — base64 fallback 제거
      toast.error('커버 이미지 업로드에 실패했습니다. 서버 연결을 확인해 주세요.')
    }
  }

  // -----------------------------------------------
  // 커버 이미지 Y 위치 드래그 조정
  //
  // 마우스를 아래로 내리면 이미지도 아래로 (pos 감소 → 위쪽 보임)
  // 마우스를 위로 올리면 이미지가 위로 (pos 증가 → 아래쪽 보임)
  // objectPosition: `center ${localCoverPos}%` 에 반영
  //
  // Python으로 치면:
  //   def on_mouse_down(e):
  //       start_y, start_pos = e.y, local_pos
  //       def on_move(me): new_pos = clamp(start_pos - (me.y - start_y) / h * 100)
  //       def on_up(): store.update(new_pos)
  // -----------------------------------------------
  function handleCoverMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!isAdjustingCover) return
    e.preventDefault()

    const startY = e.clientY
    const startPos = localCoverPos

    function onMouseMove(me: MouseEvent) {
      const height = coverAreaRef.current?.clientHeight ?? 208
      // dy > 0 (아래 드래그) → 이미지 위로 이동 → pos 감소 (위쪽 보임)
      const dy = me.clientY - startY
      const newPos = Math.max(0, Math.min(100, startPos - (dy / height) * 100))
      dragPosRef.current = newPos
      setLocalCoverPos(newPos)
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      // 드래그 완료 → store에 저장 (debounce 없이 즉시)
      updatePageCoverPosition(pageId, dragPosRef.current)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // -----------------------------------------------
  // 드래그 센서
  // PointerSensor: 데스크탑 마우스 — 8px 이상 이동해야 드래그 시작
  // TouchSensor: 모바일 터치 — 250ms 길게 누르면 드래그 시작 (오발동 방지)
  // Python으로 치면: sensors = [PointerSensor(min_distance=8), TouchSensor(delay=250)]
  // -----------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // -----------------------------------------------
  // 드래그 완료 시 블록 순서 변경
  // -----------------------------------------------
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !page) return

    const fromIndex = page.blocks.findIndex(b => b.id === active.id)
    const toIndex = page.blocks.findIndex(b => b.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      moveBlock(pageId, fromIndex, toIndex)
    }
  }

  if (!page) return null

  return (
    // -----------------------------------------------
    // 전체 페이지 컨테이너 — 커버는 전체 너비, 본문은 최대 너비 제한
    // -----------------------------------------------
    <div className="min-h-screen">

      {/* ── 커버 이미지 영역 (커버 있을 때만 렌더링) ── */}
      {page.cover && (
        // group/cover: 호버 시 버튼 표시 제어
        // isAdjustingCover: cursor-grab 으로 변경
        <div
          ref={coverAreaRef}
          className={`cover-area relative w-full h-52 overflow-hidden group/cover select-none ${isAdjustingCover ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onMouseDown={handleCoverMouseDown}
        >
          {isBgCover(page.cover) ? (
            // 그라디언트 / 단색 — div 배경으로 렌더링
            <div
              className="w-full h-full"
              style={{ background: getCoverBgValue(page.cover) }}
            />
          ) : (
            // 이미지 URL — objectPosition으로 Y 위치 조정
            <img
              src={page.cover}
              alt="페이지 커버"
              draggable={false}
              className="w-full h-full object-cover"
              style={{ objectPosition: `center ${localCoverPos}%` }}
            />
          )}

          {/* ── 호버 버튼 영역 ─────────────────────
              위치 조정 중: "위치 변경 완료" 버튼만
              그 외: "커버 변경" / "위치 조정" / "삭제"
              커버 변경은 setCoverPickerOpen(true)만 → 피커는 아래 h-12 영역에 표시
          ── */}
          <div className={`absolute bottom-3 right-4 flex gap-2 transition-opacity ${isAdjustingCover ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'}`}>
            {isAdjustingCover ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsAdjustingCover(false) }}
                className="px-3 py-1 text-xs bg-white bg-opacity-95 rounded shadow font-medium text-gray-800 hover:bg-white transition-colors"
              >
                위치 변경 완료
              </button>
            ) : (
              <>
                {/* 커버 변경: 피커를 h-12 영역에서 열기 (항상 같은 위치) */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCoverPickerOpen(true) }}
                  className="px-3 py-1 text-xs bg-white bg-opacity-90 rounded shadow text-gray-600 hover:bg-white transition-colors"
                >
                  커버 변경
                </button>

                {/* 이미지인 경우에만 위치 조정 버튼 표시 */}
                {!isBgCover(page.cover) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsAdjustingCover(true) }}
                    className="px-3 py-1 text-xs bg-white bg-opacity-90 rounded shadow text-gray-600 hover:bg-white transition-colors"
                  >
                    위치 조정
                  </button>
                )}

                {/* 커버 삭제 */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); updatePageCover(pageId, undefined) }}
                  className="px-3 py-1 text-xs bg-white bg-opacity-90 rounded shadow text-red-500 hover:bg-white transition-colors"
                >
                  삭제
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 버튼 + 피커 공통 영역 (커버 유무와 무관하게 항상 렌더링) ──────────
          커버 없음 → "+ 커버 추가" 버튼 표시
          커버 있음 → 버튼 숨김, "커버 변경" 클릭 시 여기에 피커만 표시
          → 두 경우 모두 동일한 위치에 CoverPicker가 뜸
          Python으로 치면: self.picker_anchor = QWidget(); # 항상 동일 위치
      ── */}
      <div className="h-12 group/nocov relative print-hide">
        <div className="absolute bottom-1 left-16">
          <div className="relative inline-block">
            {/* 커버 없을 때만 "+ 커버 추가" 버튼 표시 */}
            {!page.cover && (
              <button
                type="button"
                onClick={() => setCoverPickerOpen(true)}
                className="opacity-0 group-hover/nocov:opacity-100 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
              >
                + 커버 추가
              </button>
            )}

            {/* CoverPicker: 커버 추가/변경 모두 이 위치에서 렌더링 */}
            {coverPickerOpen && (
              <CoverPicker
                onSelect={(cover) => updatePageCover(pageId, cover)}
                onUpload={() => coverInputRef.current?.click()}
                onClose={() => setCoverPickerOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* 숨겨진 파일 입력 (커버 이미지 업로드) */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverChange}
        className="hidden"
      />

      {/* ── 본문 영역: 콘텐츠 + 선택적 TOC 사이드바 ───────────── */}
      {/* tableOfContents 플러그인 ON 시 flex 레이아웃으로 TOC를 우측에 배치 */}
      {/* Python으로 치면: self.content_layout = HBox([content, toc]) if plugins.toc else VBox([content]) */}
      <div className="flex items-start">
      {/* 본문 콘텐츠 래퍼 — 모바일: px-4, 태블릿: px-8, 데스크탑: px-16 */}
      {/* Python으로 치면: padding = 'px-16' if desktop else 'px-4' */}
      {/* max-w는 --editor-max-width CSS 변수로 제어 (하단 슬라이더 + settingsStore) */}
      {/* Python으로 치면: content_body.max_width = css_var('--editor-max-width') */}
      <div className="content-body flex-1 min-w-0 mr-auto px-4 sm:px-8 md:px-16 pb-8" style={{ maxWidth: 'var(--editor-max-width, 768px)' }}>

        {/* ── undo/redo + 내보내기 버튼 (우측 상단) ──────
            historyVersion 구독 → 버튼 활성화 상태 자동 갱신
            Python으로 치면: undo_btn, redo_btn, export_btn = QPushButton() */}
        <div className="flex justify-end items-center gap-1 pt-4 pb-1 print-hide">

          {/* 실행 취소 (Ctrl+Z) */}
          {/* historyVersion >= 0는 항상 true — 구독 유지를 위해 disabled에 포함 */}
          <button
            type="button"
            onClick={() => undoPage(pageId)}
            disabled={historyVersion >= 0 && !canUndo(pageId)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="실행 취소 (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>

          {/* 다시 실행 (Ctrl+Y) */}
          <button
            type="button"
            onClick={() => redoPage(pageId)}
            disabled={historyVersion >= 0 && !canRedo(pageId)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="다시 실행 (Ctrl+Y)"
          >
            <Redo2 size={14} />
          </button>

          {/* 집중 모드 종료 버튼 (집중 모드 플러그인 ON + 집중 모드 활성 시만 표시) */}
          {/* Python으로 치면: if plugins.focus_mode and is_focus_mode: render_exit_btn() */}
          {plugins.focusMode && isFocusMode && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              <button
                type="button"
                onClick={toggleFocusMode}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                title="집중 모드 종료 (Ctrl+Shift+F)"
              >
                <span>🎯</span>
                <span>집중 모드 종료</span>
              </button>
            </>
          )}

          {/* 구분선 */}
          <div className="w-px h-4 bg-gray-200 mx-1" />

          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="이 페이지 내보내기"
            >
              <span>⬇</span>
              <span>내보내기</span>
            </button>

            {/* 드롭다운 메뉴 */}
            {/* Python으로 치면: if export_open: render_dropdown() */}
            {exportOpen && (
              <div className="absolute right-0 top-8 z-50 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 print-hide">
                {/* Markdown 내보내기 */}
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>📄</span>
                  <div>
                    <div className="font-medium text-xs">Markdown 저장</div>
                    <div className="text-xs text-gray-400">.md 파일 다운로드</div>
                  </div>
                </button>
                {/* PDF 내보내기 */}
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>🖨️</span>
                  <div>
                    <div className="font-medium text-xs">PDF로 저장</div>
                    <div className="text-xs text-gray-400">브라우저 인쇄 다이얼로그</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 페이지 아이콘 ────────────────────────
            클릭하면 이모지 피커 팝업 표시
            Python으로 치면: icon_btn.on_click = lambda: toggle_picker() */}
        <div className="relative inline-block pt-8 pb-2">
          <button
            type="button"
            onClick={() => setEmojiOpen(prev => !prev)}
            className="text-6xl cursor-pointer hover:opacity-80 transition-opacity select-none"
            title="아이콘 변경"
          >
            {page.icon}
          </button>

          {/* 이모지 피커 팝업 */}
          {emojiOpen && (
            <EmojiPicker
              onSelect={(emoji) => updatePageIcon(pageId, emoji)}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        {/* ── 페이지 제목 입력 ─────────────────────── */}
        <input
          type="text"
          value={page.title}
          placeholder="제목 없음"
          onChange={(e) => updatePageTitle(pageId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addBlock(pageId)
            }
          }}
          className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-gray-300 text-gray-900 mb-3"
        />

        {/* ── 태그 영역 ─────────────────────────────
            제목 아래에 태그 칩 목록 + 추가 인풋을 가로로 나열
            Python으로 치면: self.tag_row = HBox([...tag_chips, tag_input]) */}
        <div className="flex flex-wrap items-center gap-1.5 mb-6 min-h-7">

          {/* 기존 태그 칩 목록 */}
          {(page.tags ?? []).map(tag => (
            // group/tag: 호버 시 X 버튼 표시
            <span
              key={tag}
              className="group/tag inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <span className="text-gray-400">#</span>
              <span>{tag}</span>
              {/* 태그 삭제 버튼 — hover 시만 표시 */}
              <button
                type="button"
                onClick={() => removeTagFromPage(pageId, tag)}
                className="opacity-0 group-hover/tag:opacity-100 ml-0.5 text-gray-400 hover:text-red-500 transition-opacity leading-none text-sm"
                title="태그 삭제"
              >
                ×
              </button>
            </span>
          ))}

          {/* 태그 추가 인풋 or + 태그 버튼 */}
          {isTagInputVisible ? (
            // 인풋: Enter·쉼표 → 저장, Escape·blur → 닫기
            // Python으로 치면: if event.key in ('Enter', ','): save(); elif event.key == 'Escape': cancel()
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag() }
                if (e.key === 'Escape') { setTagInput(''); setIsTagInputVisible(false) }
              }}
              onBlur={handleAddTag}
              placeholder="태그 입력..."
              className="text-xs px-2 py-0.5 border border-blue-300 rounded-full outline-none bg-white w-24"
            />
          ) : (
            // + 태그 버튼: 클릭 시 인풋으로 전환
            <button
              type="button"
              onClick={() => setIsTagInputVisible(true)}
              className="text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-100 px-2 py-0.5 rounded-full transition-colors"
              title="태그 추가"
            >
              + 태그
            </button>
          )}
        </div>

        {/* ── 속성 패널 ──────────────────────────────
            날짜·상태·선택·텍스트 속성 표시 및 편집
            Python으로 치면: self.property_panel = PropertyPanel(page_id) */}
        <PropertyPanel pageId={pageId} />

        {/* ── 템플릿 패널 (빈 페이지일 때만 표시) ──────
            블록이 1개이고 내용이 비어 있으면 템플릿 목록 표시
            Python으로 치면: if len(page.blocks) == 1 and not page.blocks[0].content: render_template_panel() */}
        {page.blocks.length === 1 && !stripHtml(page.blocks[0].content).trim() && (
          <TemplatePanel onSelect={(content) => applyTemplate(pageId, content)} />
        )}

        {/* ── 블록 목록 렌더링 ─────────────────────── */}
        <DndContext
          id="dnd-blocks"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={page.blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {(() => {
                // ── 섹션 접기 가시성 계산 ──────────────────────────────────
                // collapsedSections 기반으로 각 블록의 표시 여부와 접기 버튼 메타 계산
                // hiddenUntilLevel: null=표시 중 / 숫자=해당 레벨 이하 헤딩 등장까지 숨김
                // Python으로 치면: visible, meta = compute_visibility(blocks, collapsed)
                const visibility: Array<{
                  hidden: boolean       // 이 블록을 숨길지 여부
                  hasChild: boolean     // 하위 블록이 있는지 (접기 버튼 표시 여부)
                }> = []

                let hiddenUntilLevel: number | null = null

                page.blocks.forEach((block, index) => {
                  const level = HEADING_LEVEL[block.type]

                  // 가시성 판단
                  let hidden = false
                  if (hiddenUntilLevel !== null) {
                    if (level !== undefined && level <= hiddenUntilLevel) {
                      // 동급 또는 상위 헤딩 → 숨김 종료, 이 블록은 표시
                      hiddenUntilLevel = null
                      if (collapsedSections.has(block.id)) hiddenUntilLevel = level
                    } else {
                      // 하위 헤딩 또는 비헤딩 → 숨김
                      hidden = true
                    }
                  } else {
                    if (level !== undefined && collapsedSections.has(block.id)) {
                      hiddenUntilLevel = level
                    }
                  }

                  // 자식 존재 여부: 바로 다음 블록이 하위 레벨 헤딩이거나 비헤딩이면 자식 있음
                  // Python으로 치면: has_child = index+1 < len(blocks) and next_level > level
                  let hasChild = false
                  if (level !== undefined && index + 1 < page.blocks.length) {
                    const nextBlock = page.blocks[index + 1]
                    const nextLevel = HEADING_LEVEL[nextBlock.type]
                    hasChild = nextLevel === undefined || nextLevel > level
                  }

                  visibility.push({ hidden, hasChild })
                })

                return page.blocks.map((block, index) => {
                  const { hidden, hasChild } = visibility[index]
                  return (
                    <div key={block.id} className={hidden ? 'hidden' : undefined}>
                      <Editor
                        block={block}
                        pageId={pageId}
                        isLast={page.blocks.length === 1}
                        hasSectionChildren={hasChild}
                        isSectionCollapsed={collapsedSections.has(block.id)}
                        onToggleSectionCollapse={() => toggleSection(block.id)}
                      />
                    </div>
                  )
                })
              })()}
            </div>
          </SortableContext>
        </DndContext>

        {/* ── 빈 영역 클릭 시 새 블록 추가 ────────── */}
        <div
          className="min-h-32 cursor-text"
          onClick={() => addBlock(pageId)}
        />

        {/* 백링크 패널 — 이 페이지를 참조하는 다른 페이지 목록 표시
            백링크가 없으면 BacklinkPanel 자체가 null 반환 → 섹션 안 보임
            Python으로 치면: if plugins.backlinks: render BacklinkPanel(page.id) */}
        {plugins.backlinks && <BacklinkPanel pageId={pageId} />}

      </div>

      {/* ── TOC 사이드 패널 (tableOfContents 플러그인 ON + 헤딩 있을 때) ──
          xl 이상 넓은 화면에서만 표시 (px-16 본문 영역과 겹치지 않도록)
          sticky top-20: 스크롤 시 상단에 고정
          Python으로 치면: if plugins.table_of_contents: render TocPanel(page.blocks) */}
      {plugins.tableOfContents && (
        // self-stretch: items-start 부모에서 TOC 래퍼가 content-body와 같은 높이로 늘어나야
        // sticky top-20이 전체 스크롤 구간 동안 유지됨 (높이가 짧으면 즉시 컨테이너 끝에 닿아 고정 해제)
        // Python으로 치면: toc_wrapper.height = content_body.height  # sticky가 작동하는 최소 조건
        <div className="hidden xl:block self-stretch pt-16">
          <TocPanel blocks={page.blocks} />
        </div>
      )}

      </div>{/* ── flex 래퍼 닫기 */}

      {/* ── 찾기/바꾸기 플로팅 패널 (Ctrl+H/F로 열림, z-50 fixed) ──
          isOpen 이 false 면 패널 컴포넌트가 null 반환 → 항상 마운트해도 무방
          Python으로 치면: if find_replace.is_open: render FindReplacePanel() */}
      <FindReplacePanel />

    </div>
  )
}
