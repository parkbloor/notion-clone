// =============================================
// src/components/editor/BubbleMenuBar.tsx
// 역할: 텍스트 드래그 선택 시 나타나는 인라인 툴바
//       글꼴 / 글자 크기 / 글자 색상 / 배경 색상 피커 포함
// =============================================

'use client'

import { Editor as TiptapEditor } from '@tiptap/react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { toast } from 'sonner'
import { FONT_PRESETS, FONT_SIZE_PRESETS, CATEGORY_LABELS, type FontCategory } from '@/lib/fonts'
// 정렬 아이콘 — lucide-react 패키지에서 가져옴
// Python으로 치면: from lucide import AlignLeft, AlignCenter, AlignRight, AlignJustify
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'
// 화살표 연결 대기 전역 스토어
// Python으로 치면: from store.arrow_store import use_arrow_store
import { useArrowStore } from '@/store/arrowStore'


// -----------------------------------------------
// 인라인 서식 버튼 목록
// Python으로 치면: FORMAT_BUTTONS: list[dict] = [...]
// -----------------------------------------------
const FORMAT_BUTTONS = [
  {
    label: 'B',
    title: '굵게 (Ctrl+B)',
    isActive: (editor: TiptapEditor) => editor.isActive('bold'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleBold().run(),
    className: 'font-bold',
  },
  {
    label: 'I',
    title: '기울임 (Ctrl+I)',
    isActive: (editor: TiptapEditor) => editor.isActive('italic'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleItalic().run(),
    className: 'italic',
  },
  {
    label: 'S',
    title: '취소선',
    isActive: (editor: TiptapEditor) => editor.isActive('strike'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleStrike().run(),
    className: 'line-through',
  },
  {
    label: '<>',
    title: '인라인 코드',
    isActive: (editor: TiptapEditor) => editor.isActive('code'),
    action: (editor: TiptapEditor) => editor.chain().focus().toggleCode().run(),
    className: 'font-mono text-red-400',
  },
]


// -----------------------------------------------
// 글자 색상 프리셋
// value: null → 색상 제거 (기본 텍스트 색상 복원)
// Python으로 치면: TEXT_COLORS: list[dict] = [{label, value}, ...]
// -----------------------------------------------
const TEXT_COLORS = [
  { label: '기본',  value: null },
  { label: '빨강',  value: '#ef4444' },
  { label: '주황',  value: '#f97316' },
  { label: '노랑',  value: '#ca8a04' },
  { label: '초록',  value: '#16a34a' },
  { label: '파랑',  value: '#3b82f6' },
  { label: '보라',  value: '#a855f7' },
  { label: '회색',  value: '#6b7280' },
]


// -----------------------------------------------
// 배경(형광펜) 색상 프리셋
// value: null → 형광펜 제거
// -----------------------------------------------
const HIGHLIGHT_COLORS = [
  { label: '없음',  value: null },
  { label: '노랑',  value: '#fef08a' },
  { label: '초록',  value: '#bbf7d0' },
  { label: '파랑',  value: '#bfdbfe' },
  { label: '보라',  value: '#e9d5ff' },
  { label: '분홍',  value: '#fecdd3' },
  { label: '주황',  value: '#fed7aa' },
  { label: '회색',  value: '#e5e7eb' },
]


// -----------------------------------------------
// 세로 구분선 컴포넌트 (반복 사용 줄이기)
// -----------------------------------------------
function Divider() {
  return <div className="w-px h-4 bg-gray-600 mx-1" />
}


interface BubbleMenuBarProps {
  editor: TiptapEditor
  // 읽기 모드: true이면 텍스트 선택 시에도 메뉴 표시 안 함
  // Python으로 치면: read_mode: bool = False
  readMode?: boolean
}

export default function BubbleMenuBar({ editor, readMode = false }: BubbleMenuBarProps) {

  const [visible, setVisible]       = useState(false)
  const [position, setPosition]     = useState({ top: 0, left: 0 })
  const [, forceUpdate]             = useState(0)

  // -----------------------------------------------
  // 현재 열려있는 피커/드롭다운
  // 'text'      → 글자 색상 피커
  // 'highlight' → 배경 색상 피커
  // 'font'      → 글꼴 선택 드롭다운
  // 'size'      → 글자 크기 드롭다운
  // null        → 모두 닫힘
  // Python으로 치면: open_panel: Literal['text','highlight','font','size'] | None = None
  // -----------------------------------------------
  const [openPanel, setOpenPanel] = useState<'text' | 'highlight' | 'font' | 'size' | 'ai' | null>(null)

  // AI 요청 처리 중 여부
  // Python으로 치면: self.ai_loading = False
  const [aiLoading, setAiLoading] = useState(false)

  const { aiProvider, aiModel, aiApiKey, ollamaUrl } = useSettingsStore()

  // -----------------------------------------------
  // 글자 크기 슬라이더 값 — openPanel이 'size'로 열릴 때 현재 fontSize로 초기화
  // Python으로 치면: self.slider_value: int = 16
  // -----------------------------------------------
  const [sliderValue, setSliderValue] = useState(16)

  const menuRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------
  // 툴바 크기 버튼 스크러버 드래그 상태
  // Figma처럼 크기 버튼을 좌우로 드래그하면 값이 바뀜
  // startX: 드래그 시작 X좌표, startValue: 드래그 시작 시점의 폰트 크기
  // dragging: true면 pointerup 시 패널 열지 않음
  // Python으로 치면: self._scrub = {'start_x': 0, 'start_val': 16, 'dragging': False}
  // -----------------------------------------------
  const sizeScrubRef = useRef<{
    startX: number
    startValue: number
    dragging: boolean
  } | null>(null)

  // 버튼 클릭 시 선택이 해제되므로 미리 저장
  const savedSelection = useRef<{ from: number; to: number } | null>(null)

  // -----------------------------------------------
  // size 패널이 열릴 때 현재 적용된 fontSize → 슬라이더 초기값 동기화
  // currentFontSize 예: "18px" → 18 / null → 16 (에디터 기본값)
  // Python으로 치면: if panel == 'size': self.slider_value = int(current_size or 16)
  // -----------------------------------------------
  useEffect(() => {
    if (openPanel === 'size') {
      const parsed = parseInt(
        editor.getAttributes('textStyle').fontSize ?? '16',
        10
      )
      setSliderValue(isNaN(parsed) ? 16 : Math.min(96, Math.max(8, parsed)))
    }
  }, [openPanel, editor])


  // -----------------------------------------------
  // 텍스트 선택 변화 감지 → 버블 메뉴 표시/숨김
  //
  // 핵심: 각 블록이 자체 BubbleMenuBar를 가지므로, document.selectionchange가
  // 모든 인스턴스를 동시에 활성화하는 문제가 있음.
  // → 선택 범위가 이 에디터의 DOM 내부에 있는지 반드시 확인
  // Python으로 치면: if selection_node not in self.editor.dom: return
  // -----------------------------------------------
  useEffect(() => {
    const handleSelectionChange = () => {
      setTimeout(() => {
        const selection = window.getSelection()

        if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
          if (menuRef.current?.matches(':hover')) return
          setVisible(false)
          setOpenPanel(null)  // 메뉴 닫힐 때 패널도 함께 닫음
          return
        }

        const range = selection.getRangeAt(0)

        // ─────────────────────────────────────────────
        // 선택 범위가 이 에디터 DOM 안에 있는지 확인
        // 다른 블록의 에디터를 선택했을 때 이 메뉴가 뜨지 않도록 막음
        // ─────────────────────────────────────────────
        const editorDom = editor.view.dom
        if (!editorDom.contains(range.commonAncestorContainer)) {
          if (!menuRef.current?.matches(':hover')) {
            setVisible(false)
            setOpenPanel(null)
          }
          return
        }

        const rect = range.getBoundingClientRect()
        if (rect.width === 0) return

        const { from, to } = editor.state.selection
        if (from !== to) {
          savedSelection.current = { from, to }
        }

        setPosition({
          top: rect.top + window.scrollY - 48,
          left: rect.left + window.scrollX + rect.width / 2,
        })
        setVisible(true)
        forceUpdate(n => n + 1)
      }, 10)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [editor])


  // -----------------------------------------------
  // 서식/색상 액션 실행 헬퍼
  // 1. 저장된 선택 범위 복원
  // 2. 액션 실행
  // 3. 강제 리렌더 (active 상태 반영)
  // -----------------------------------------------
  const handleAction = (action: (editor: TiptapEditor) => void) => {
    if (savedSelection.current) {
      editor.commands.setTextSelection(savedSelection.current)
    }
    action(editor)
    forceUpdate(n => n + 1)
  }

  // -----------------------------------------------
  // 패널 토글 헬퍼 — 같은 패널 클릭 시 닫기, 다른 패널 클릭 시 전환
  // 클릭 직전에 selection을 재캡처 (포커스 유지)
  // Python으로 치면: def toggle_panel(name): self.open_panel = None if open == name else name
  // -----------------------------------------------
  const togglePanel = (name: 'text' | 'highlight' | 'font' | 'size' | 'ai') => {
    const { from, to } = editor.state.selection
    if (from !== to) savedSelection.current = { from, to }
    setOpenPanel(prev => prev === name ? null : name)
  }

  // -----------------------------------------------
  // 선택 복원 헬퍼 — 패널 안의 버튼 클릭 전 selection을 복원
  // useCallback: editor가 바뀔 때만 재생성 → runAi 의존성 배열에 포함 가능
  // Python으로 치면: def restore_sel(): if saved and collapsed: editor.restore(saved)
  // -----------------------------------------------
  const restoreSelection = useCallback(() => {
    const editorSel = editor.state.selection
    const saved = savedSelection.current
    if (editorSel.from === editorSel.to && saved && saved.from !== saved.to) {
      editor.commands.setTextSelection(saved)
    }
  }, [editor])


  // -----------------------------------------------
  // AI 스트리밍 요청 — /api/ai/stream (SSE) 호출
  // 1단계: 선택 삭제(또는 커서 이동) → 에디터 준비
  // 2단계: SSE 스트림 수신 + 버퍼 파싱
  // 3단계: 청크 단위로 editor.commands.insertContent() → 실시간 타이핑 효과
  //         Tiptap history의 newGroupDelay(500ms) 덕분에 빠른 연속 삽입 → 단일 undo 스텝
  // 에러 시 삽입된 부분 텍스트 롤백 (insertFrom ~ 현재 커서)
  // Python으로 치면: async def run_ai(action): async for chunk in stream('/ai/stream', ...): editor.insert(chunk)
  // -----------------------------------------------
  const runAi = useCallback(async (action: string) => {
    // Ollama는 API 키 불필요, 나머지는 필수
    // Python으로 치면: if provider != 'ollama' and not api_key: raise ValueError
    if (aiProvider !== 'ollama' && !aiApiKey.trim()) {
      toast.error('AI API 키가 없습니다. 설정 → AI 탭에서 입력해 주세요.')
      setOpenPanel(null)
      return
    }

    // 선택 텍스트 추출 (백엔드 context로 전달)
    restoreSelection()
    const { from, to } = editor.state.selection
    if (from === to) {
      toast.error('텍스트를 선택해 주세요.')
      setOpenPanel(null)
      return
    }
    const selectedText = editor.state.doc.textBetween(from, to, '\n')

    // 액션 → 프롬프트 매핑
    // Python으로 치면: PROMPTS = {'refine': '...', 'summarize': '...', ...}
    const PROMPTS: Record<string, string> = {
      refine:       '다음 텍스트를 자연스럽고 명확하게 다듬어 주세요. 원래 의미를 유지하세요.',
      summarize:    '다음 텍스트를 3줄 이내로 요약해 주세요.',
      continue:     '다음 텍스트에 이어서 자연스럽게 2~3문장을 추가해 주세요.',
      translate_ko: '다음 텍스트를 한국어로 번역해 주세요.',
      translate_en: '다음 텍스트를 영어로 번역해 주세요.',
    }

    setAiLoading(true)
    setOpenPanel(null)

    // 삽입 시작 위치 — 에러 롤백 시 사용
    // Python으로 치면: insert_from = from  # 에디터 준비 후 갱신
    let insertFrom = from

    try {
      // Ollama는 base_url 추가
      const reqBody: Record<string, string> = {
        provider: aiProvider,
        model: aiModel,
        api_key: aiApiKey,
        prompt: PROMPTS[action] ?? action,
        context: selectedText,
      }
      if (aiProvider === 'ollama') reqBody.base_url = ollamaUrl

      const res = await fetch('http://localhost:8000/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })

      // 네트워크 에러 (백엔드 미실행 등) — body가 없으면 JSON으로 폴백
      if (!res.body) {
        const data = await res.json().catch(() => ({})) as { detail?: string }
        toast.error(data.detail ?? 'AI 오류가 발생했습니다.')
        return
      }

      // ── 1단계: 에디터 준비 ─────────────────────────────
      // 계속 쓰기: 커서를 선택 끝으로 이동 + 공백 삽입 (앞 문장과 분리)
      // 나머지: 선택 텍스트 삭제 → 커서가 from 위치에 남음
      // Python으로 치면: if action == 'continue': editor.move_cursor(to); editor.insert(' ')
      //                   else: editor.delete_selection(from, to)
      if (action === 'continue') {
        editor.chain().focus().setTextSelection(to).insertContent(' ').run()
      } else {
        editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run()
      }
      // 실제 커서 위치 읽기 (에디터 연산 후 확정된 위치)
      insertFrom = editor.state.selection.from

      // ── 2단계: SSE 스트림 수신 + 파싱 ─────────────────
      // "data: {...}\n\n" 단위로 메시지 분리 → JSON 파싱 → chunk 추출
      // Python으로 치면: for line in response.iter_lines(): parse_sse(line)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 새로 받은 바이트를 UTF-8로 디코딩 후 버퍼에 추가
        // stream: true → 멀티바이트 문자(한글 등)가 청크 경계에 걸려도 안전하게 처리
        buffer += decoder.decode(value, { stream: true })

        // "\n\n"로 완성된 SSE 메시지 분리, 마지막 불완전 청크는 버퍼에 보관
        // Python으로 치면: parts = buffer.split('\n\n'); buffer = parts.pop()
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)  // "data: " 제거
          if (payload === '[DONE]') break

          let msg: { text?: string; error?: string }
          try {
            msg = JSON.parse(payload) as { text?: string; error?: string }
          } catch {
            continue  // JSON 파싱 실패 → 무시하고 다음 청크
          }

          // 에러 SSE → 토스트 표시 + 부분 삽입 텍스트 롤백
          // Python으로 치면: if msg.get('error'): rollback(insert_from, cursor); return
          if (msg.error) {
            toast.error(msg.error)
            const insertEnd = editor.state.selection.from
            if (insertEnd > insertFrom) {
              editor.chain().focus()
                .setTextSelection({ from: insertFrom, to: insertEnd })
                .deleteSelection()
                .run()
            }
            return
          }

          // ── 3단계: 청크를 에디터에 즉시 삽입 ────────────
          // insertContent()는 현재 커서 위치에 삽입 후 커서를 앞으로 이동
          // 연속 호출 시 자동으로 이어붙여짐 → 타이핑 애니메이션 효과
          // Tiptap history: 500ms 내 연속 삽입 → 단일 undo 스텝으로 합쳐짐
          // Python으로 치면: editor.insert_at_cursor(chunk)
          if (msg.text) {
            editor.commands.insertContent(msg.text)
          }
        }
      }

      toast.success('AI 처리 완료')
    } catch {
      toast.error('서버 연결 실패. 백엔드가 실행 중인지 확인해 주세요.')
    } finally {
      setAiLoading(false)
    }
  }, [editor, aiProvider, aiModel, aiApiKey, ollamaUrl, restoreSelection])

  // 읽기 모드이거나 선택 없으면 숨김
  // Python으로 치면: if read_mode or not visible: return None
  if (!visible || readMode) return null

  // 현재 적용된 글자 색상 / 배경 색상 (버튼 인디케이터에 표시용)
  // Python으로 치면: current_text_color = editor.get_attr('textStyle').get('color')
  const currentTextColor: string | null = editor.getAttributes('textStyle').color ?? null
  const currentHighlightColor: string | null = editor.getAttributes('highlight').color ?? null

  // 현재 적용된 글꼴 / 글자 크기 (드롭다운 현재값 표시용)
  // Python으로 치면: current_font = editor.get_attr('textStyle').get('fontFamily')
  const currentFontFamily: string | null = editor.getAttributes('textStyle').fontFamily ?? null
  const currentFontSize: string | null = editor.getAttributes('textStyle').fontSize ?? null

  // 현재 글꼴에 해당하는 프리셋 라벨 (없으면 '글꼴')
  // Python으로 치면: label = next((f.label for f in PRESETS if f.family == current), '글꼴')
  const activeFontLabel = currentFontFamily
    ? (FONT_PRESETS.find(f => f.family === currentFontFamily)?.label ?? '글꼴')
    : '글꼴'

  // 현재 글자 크기 라벨 (없으면 '크기')
  const activeSizeLabel = currentFontSize ?? '크기'

  // -----------------------------------------------
  // 카테고리별로 폰트 그룹화
  // Python으로 치면: groups = itertools.groupby(FONT_PRESETS, key=lambda f: f.category)
  // -----------------------------------------------
  const fontGroups = FONT_PRESETS.reduce<Partial<Record<FontCategory, typeof FONT_PRESETS>>>((acc, preset) => {
    if (!acc[preset.category]) acc[preset.category] = []
    acc[preset.category]!.push(preset)
    return acc
  }, {})

  // 카테고리 표시 순서
  const categoryOrder: FontCategory[] = ['sans', 'korean', 'serif', 'mono']


  return (
    // -----------------------------------------------
    // 메뉴 컨테이너
    // fixed: 스크롤과 무관하게 화면에 고정
    // -translate-x-1/2: 선택 텍스트 정중앙에 표시
    // flex flex-col: 툴바 행 + 패널을 세로로 배치
    // -----------------------------------------------
    <div
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
      className="fixed z-50 -translate-x-1/2 bg-gray-900 rounded-lg shadow-xl"
    >

      {/* ── 메인 툴바 행 ────────────────────────── */}
      <div className="flex items-center gap-0.5 px-1 py-1">

        {/* ── 글꼴 선택 드롭다운 버튼 ─────────── */}
        {/* 현재 선택된 폰트 이름 표시, 클릭 시 font 패널 토글 */}
        <button
          title="글꼴 선택"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePanel('font')
          }}
          className={openPanel === 'font'
            ? 'px-2 py-1 rounded text-xs bg-gray-700 text-white min-w-13 text-left flex items-center gap-1'
            : 'px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700 hover:text-white min-w-13 text-left flex items-center gap-1'}
        >
          {/* 현재 글꼴명을 해당 폰트로 미리보기 렌더링 */}
          <span style={{ fontFamily: currentFontFamily ?? undefined }}>
            {activeFontLabel}
          </span>
          <span className="text-gray-500 text-xs">▾</span>
        </button>

        {/* ── 글자 크기 버튼 (클릭: 패널 / 좌우 드래그: 스크러버) ─ */}
        {/* Figma 스타일: 드래그로 값 변경, 클릭으로 슬라이더 패널 열기 */}
        {/* cursor-ew-resize: 좌우 드래그 가능함을 커서로 표시 */}
        {/* Python으로 치면: btn.on_drag(scrub); btn.on_click(toggle_panel) */}
        <button
          title="글자 크기 (드래그로 조절 / 클릭으로 슬라이더 열기)"
          style={{ cursor: 'ew-resize' }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()

            // 드래그 시작 시점의 현재 폰트 크기 읽기
            const rawSize = editor.getAttributes('textStyle').fontSize ?? '16px'
            const initVal = Math.min(96, Math.max(8, parseInt(rawSize, 10) || 16))

            // 드래그 상태 초기화
            sizeScrubRef.current = { startX: e.clientX, startValue: initVal, dragging: false }

            // ── pointermove: 드래그 거리 → 크기 변경 ───────────
            // 2px 이동당 1px 변화 (sensitivity = 0.5)
            // Python으로 치면: delta_size = (mouse_x - start_x) * 0.5
            const handleMove = (me: PointerEvent) => {
              if (!sizeScrubRef.current) return
              const delta = me.clientX - sizeScrubRef.current.startX

              // 3px 이상 움직여야 드래그로 판정 (클릭과 구분)
              if (!sizeScrubRef.current.dragging && Math.abs(delta) < 3) return
              sizeScrubRef.current.dragging = true

              const next = Math.min(96, Math.max(8, Math.round(sizeScrubRef.current.startValue + delta * 0.5)))
              setSliderValue(next)
              restoreSelection()
              editor.chain().setFontSize(`${next}px`).run()
              forceUpdate(n => n + 1)
            }

            // ── pointerup: 드래그 아니면 클릭 → 패널 열기 ──────
            // Python으로 치면: if not dragging: toggle_panel('size')
            const handleUp = () => {
              const wasDragging = sizeScrubRef.current?.dragging ?? false
              sizeScrubRef.current = null
              document.removeEventListener('pointermove', handleMove)
              document.removeEventListener('pointerup', handleUp)

              if (!wasDragging) {
                // 움직임 없었으면 클릭: 슬라이더 패널 토글
                togglePanel('size')
              }
            }

            document.addEventListener('pointermove', handleMove)
            document.addEventListener('pointerup', handleUp)
          }}
          className={openPanel === 'size'
            ? 'px-2 py-1 rounded text-xs bg-gray-700 text-white min-w-11 text-left flex items-center gap-1'
            : 'px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700 hover:text-white min-w-11 text-left flex items-center gap-1'}
        >
          {activeSizeLabel}
          <span className="text-gray-500 text-xs">▾</span>
        </button>

        <Divider />

        {/* 서식 버튼 (Bold / Italic / Strike / Code) */}
        {FORMAT_BUTTONS.map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleAction(btn.action)
            }}
            className={btn.isActive(editor)
              ? `px-2 py-2 rounded text-sm transition-colors bg-white text-gray-900 ${btn.className}`
              : `px-2 py-2 rounded text-sm transition-colors text-gray-300 hover:bg-gray-700 hover:text-white ${btn.className}`}
          >
            {btn.label}
          </button>
        ))}

        <Divider />

        {/* ── 텍스트 정렬 버튼 (좌 / 중 / 우 / 양쪽) ─── */}
        {/* TextAlign extension이 paragraph/heading에 text-align 속성 적용 */}
        {/* Python으로 치면: for align in ['left','center','right','justify']: render_btn(align) */}
        {(
          [
            { align: 'left',    title: '왼쪽 정렬',   Icon: AlignLeft    },
            { align: 'center',  title: '가운데 정렬', Icon: AlignCenter  },
            { align: 'right',   title: '오른쪽 정렬', Icon: AlignRight   },
            { align: 'justify', title: '양쪽 정렬',   Icon: AlignJustify },
          ] as const
        ).map(({ align, title, Icon }) => {
          // isActive: 현재 커서/선택 블록의 정렬이 이 값인지 여부
          // Python으로 치면: is_active = editor.is_active({'textAlign': align})
          const isActive = editor.isActive({ textAlign: align })
          return (
            <button
              key={align}
              title={title}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // toggleTextAlign: 활성 정렬이면 해제, 아니면 새 정렬 적용 (내부에서 토글 처리)
                // Python으로 치면: editor.commands.toggleTextAlign(align)
                handleAction(ed => ed.chain().focus().toggleTextAlign(align).run())
              }}
              className={isActive
                ? 'px-2 py-2 rounded text-sm transition-colors bg-white text-gray-900'
                : 'px-2 py-2 rounded text-sm transition-colors text-gray-300 hover:bg-gray-700 hover:text-white'}
            >
              <Icon size={14} />
            </button>
          )
        })}

        <Divider />

        {/* ── 글자 색상 버튼 ───────────────────── */}
        {/* 'A' 아래 밑줄 색상 = 현재 적용된 글자 색상 */}
        <button
          title="글자 색상"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePanel('text')
          }}
          className={openPanel === 'text' ? 'px-2 py-2 rounded text-sm bg-gray-700 text-white' : 'px-2 py-2 rounded text-sm text-gray-300 hover:bg-gray-700 hover:text-white'}
        >
          <span style={{ borderBottom: `2px solid ${currentTextColor ?? '#9ca3af'}`, paddingBottom: '1px' }}>
            A
          </span>
        </button>

        {/* ── 배경 색상 버튼 ───────────────────── */}
        {/* '가' 글자 뒤 배경색 = 현재 적용된 형광펜 색상 */}
        <button
          title="배경 색상"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePanel('highlight')
          }}
          className={openPanel === 'highlight' ? 'px-2 py-2 rounded text-sm bg-gray-700 text-white' : 'px-2 py-2 rounded text-sm text-gray-300 hover:bg-gray-700 hover:text-white'}
        >
          <span
            className="text-xs px-0.5 rounded-sm"
            style={{
              background: currentHighlightColor ?? 'transparent',
              color: currentHighlightColor ? '#1f2937' : 'currentColor',
            }}
          >
            가
          </span>
        </button>

        <Divider />

        {/* ── 링크 버튼 ────────────────────────── */}
        <button
          title="링크 삽입"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (savedSelection.current) {
              editor.commands.setTextSelection(savedSelection.current)
            }
            const url = window.prompt('링크 URL을 입력하세요')
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }}
          className={editor.isActive('link') ? 'px-2 py-2 rounded text-sm transition-colors bg-white text-gray-900' : 'px-2 py-2 rounded text-sm transition-colors text-gray-300 hover:bg-gray-700 hover:text-white'}
        >
          🔗
        </button>

        {/* 링크 제거 버튼 — 링크가 활성일 때만 표시 */}
        {editor.isActive('link') && (
          <button
            title="링크 제거"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleAction((editor) => editor.chain().focus().unsetLink().run())
            }}
            className="px-2 py-2 rounded text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        )}

        <Divider />

        {/* ── 각주 버튼 [각주] ─────────────────────── */}
        {/* 텍스트 선택 후 클릭 → 선택 텍스트를 각주 본문으로 FootnoteInline 노드 삽입 */}
        {/* Python으로 치면: if btn == 'footnote': editor.insert(FootnoteNode(text=selected_text)) */}
        <button
          title="각주 삽입 (선택한 텍스트가 각주 내용이 됩니다)"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // 현재 선택된 텍스트를 각주 text로 사용
            // Python으로 치면: selected = editor.get_selection_text()
            const { from, to } = editor.state.selection
            const selectedText = editor.state.doc.textBetween(from, to, ' ').trim()
            if (!selectedText) return
            // 선택 범위를 FootnoteInline 노드로 교체
            // Python으로 치면: editor.replace_selection(FootnoteNode(text=selected_text))
            editor.chain().focus()
              .deleteSelection()
              .insertContent({ type: 'footnoteInline', attrs: { text: selectedText } })
              .run()
          }}
          className="px-2 py-1.5 rounded text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          [각주]
        </button>

        <Divider />

        {/* ── AI 버튼 ✨ ──────────────────────────── */}
        {/* 클릭 시 AI 액션 드롭다운 토글 */}
        <button
          title="AI 어시스턴트"
          disabled={aiLoading}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePanel('ai')
          }}
          className={openPanel === 'ai'
            ? 'px-2 py-2 rounded text-sm bg-purple-600 text-white'
            : 'px-2 py-2 rounded text-sm text-gray-300 hover:bg-purple-700 hover:text-white transition-colors disabled:opacity-40'}
        >
          {aiLoading ? '⏳' : '✨'}
        </button>

        <Divider />

        {/* ── 화살표 버튼 ↗ ────────────────────── */}
        {/* 클릭: 선택 텍스트에 시작 마크 적용 → 연결 대기 모드 진입 */}
        {/* Python으로 치면: btn.on_click(start_arrow_connect_mode) */}
        <button
          title="단어 연결 화살표 (클릭: 시작점 지정 후 끝점 클릭으로 연결)"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!editor.schema.marks['arrowMark']) {
              toast.error('페이지를 새로고침(F5)한 후 다시 시도해 주세요.')
              return
            }
            restoreSelection()
            const { from, to } = editor.state.selection
            if (from === to) return

            // 새 arrowId 생성 + 시작 마크 적용
            const arrowId = crypto.randomUUID()
            editor.chain().focus()
              .setMark('arrowMark', {
                arrowId, isStart: true,
                color: 'blue', opacity: 1,
                arrowType: 'margin', xPosition: 0,
                startHead: false, endHead: true,
              })
              .run()

            // 시작 앵커 좌표: 선택 범위 첫 번째 rect의 left + 수직 중앙
            // Python으로 치면: anchor = (rects[0].left, rects[0].top + height/2)
            const sel = window.getSelection()
            let anchorX = 0
            let anchorY = 0
            if (sel && sel.rangeCount > 0) {
              const rects = sel.getRangeAt(0).getClientRects()
              if (rects.length > 0) {
                anchorX = rects[0].left
                anchorY = rects[0].top + rects[0].height / 2
              }
            }

            // 연결 대기 모드 진입 (ArrowLayer가 고무줄 선 + 원 핸들 렌더링)
            useArrowStore.getState().setConnecting({
              arrowId, color: 'blue', opacity: 1,
              arrowType: 'margin', xPosition: 0,
              startHead: false, endHead: true,
              anchorX, anchorY,
            })
            setVisible(false)  // 버블 메뉴 숨김
          }}
          style={{ width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, border: 'none', cursor: 'pointer', background: editor.isActive('arrowMark') ? '#2563eb' : 'transparent', color: editor.isActive('arrowMark') ? '#fff' : '#d1d5db' }}
        >
          ↗
        </button>

        {/* 화살표 마커 제거 버튼 — 선택 텍스트에 arrowMark가 있을 때만 표시 */}
        {/* Python으로 치면: if editor.is_active('arrowMark'): show_remove_btn() */}
        {editor.isActive('arrowMark') && (
          <button
            title="화살표 마커 제거"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              restoreSelection()
              editor.chain().focus().unsetMark('arrowMark').run()
              forceUpdate(n => n + 1)
            }}
            style={{ width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'transparent', color: '#f87171' }}
          >
            ✕
          </button>
        )}

      </div>

      {/* ── AI 액션 드롭다운 패널 ───────────────────── */}
      {/* Python으로 치면: if open_panel == 'ai': render_ai_panel() */}
      {openPanel === 'ai' && (
        <div className="border-t border-gray-700 py-1">
          {[
            { action: 'refine',       label: '✍️ 다듬기',        desc: '문장을 자연스럽게 교정' },
            { action: 'summarize',    label: '📝 요약',           desc: '3줄 이내로 요약'        },
            { action: 'continue',     label: '➡️ 계속 쓰기',      desc: '선택 뒤에 이어서 생성' },
            { action: 'translate_ko', label: '🇰🇷 한국어로 번역', desc: ''                       },
            { action: 'translate_en', label: '🇺🇸 영어로 번역',   desc: ''                       },
          ].map(({ action, label, desc }) => (
            <button
              key={action}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                runAi(action)
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-200 hover:bg-purple-700 hover:text-white transition-colors text-left"
            >
              <span>{label}</span>
              {desc && <span className="text-gray-500 ml-2">{desc}</span>}
            </button>
          ))}
        </div>
      )}


      {/* ── 글꼴 선택 패널 ──────────────────────── */}
      {/* 카테고리별 구분선 + 폰트 목록 */}
      {/* Python으로 치면: if open_panel == 'font': render_font_panel() */}
      {openPanel === 'font' && (
        <div className="px-2 pb-2 border-t border-gray-700 min-w-45 max-h-72 overflow-y-auto">
          {categoryOrder.map((category) => {
            const presets = fontGroups[category]
            if (!presets || presets.length === 0) return null

            return (
              <div key={category}>
                {/* 카테고리 구분 레이블 */}
                <p className="text-xs text-gray-500 mt-2 mb-1 px-1 uppercase tracking-wide">
                  {CATEGORY_LABELS[category]}
                </p>

                {/* 해당 카테고리 폰트 목록 */}
                {/* Python으로 치면: for preset in presets: render_font_item(preset) */}
                {presets.map((preset) => {
                  const isSelected = currentFontFamily === preset.family

                  return (
                    <button
                      key={preset.id}
                      title={preset.label}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        restoreSelection()

                        if (isSelected) {
                          // 이미 선택된 폰트 재클릭 → 폰트 제거 (기본값 복원)
                          editor.chain().focus().unsetFontFamily().run()
                        } else {
                          editor.chain().focus().setFontFamily(preset.family).run()
                        }

                        setOpenPanel(null)
                        forceUpdate(n => n + 1)
                      }}
                      className="w-full text-left px-2 py-1.5 rounded text-sm transition-colors flex items-center gap-2"
                      style={{
                        color: isSelected ? '#fff' : '#d1d5db',
                        backgroundColor: isSelected ? '#3b82f6' : 'transparent',
                      }}
                    >
                      {/* 폰트 이름을 해당 폰트 자체로 미리보기 렌더링 */}
                      <span style={{ fontFamily: preset.family, fontSize: '14px' }}>
                        {preset.label}
                      </span>
                      {/* 한국어 폰트는 '가나다' 미리보기, 영문은 'Abc' 미리보기 */}
                      <span className="text-xs text-gray-500 ml-auto" style={{ fontFamily: preset.family }}>
                        {preset.category === 'korean' ? '가나다' : 'Abc'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ── 글자 크기 슬라이더 패널 ────────────── */}
      {/* Python으로 치면: if open_panel == 'size': render_size_slider() */}
      {openPanel === 'size' && (
        // onMouseDown e.preventDefault(): 패널 조작 중 에디터 텍스트 선택이 해제되지 않도록 방지
        // 단, range <input> 자체는 제외 — INPUT의 preventDefault를 막으면 슬라이더 thumb 드래그가 안 됨
        // Python으로 치면: if not isinstance(target, InputRange): e.prevent_default()
        <div
          className="px-3 pb-3 border-t border-gray-700 w-52"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') {
              e.preventDefault()
            }
          }}
        >
          {/* 헤더 — "글자 크기" 레이블 + 현재 값 숫자 표시 */}
          <div className="flex items-center justify-between mt-2 mb-2">
            <p className="text-xs text-gray-400">글자 크기</p>
            {/* 현재 슬라이더 값을 굵게 표시 */}
            <span className="text-sm font-bold text-white">{sliderValue}px</span>
          </div>

          {/* ─ − / + 미세 조절 버튼 + 슬라이더 행 ── */}
          <div className="flex items-center gap-2">
            {/* − 버튼: 1px 감소 */}
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const next = Math.max(8, sliderValue - 1)
                setSliderValue(next)
                restoreSelection()
                editor.chain().setFontSize(`${next}px`).run()
                forceUpdate(n => n + 1)
              }}
              className="w-6 h-6 rounded text-gray-300 hover:bg-gray-700 hover:text-white text-base leading-none flex items-center justify-center shrink-0"
            >
              −
            </button>

            {/* 슬라이더 — 8~96px, 1px 단위 */}
            {/* onChange: 슬라이더 값 갱신 + 실시간 폰트 크기 적용 */}
            {/* Python으로 치면: slider.on_change(lambda v: editor.set_font_size(f'{v}px')) */}
            <input
              type="range"
              min={8}
              max={96}
              step={1}
              value={sliderValue}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                setSliderValue(val)
                // 선택 복원 후 폰트 크기 즉시 적용 (실시간 미리보기)
                restoreSelection()
                editor.chain().setFontSize(`${val}px`).run()
                forceUpdate(n => n + 1)
              }}
              className="flex-1 accent-blue-500 cursor-pointer"
              style={{ height: '4px' }}
            />

            {/* + 버튼: 1px 증가 */}
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const next = Math.min(96, sliderValue + 1)
                setSliderValue(next)
                restoreSelection()
                editor.chain().setFontSize(`${next}px`).run()
                forceUpdate(n => n + 1)
              }}
              className="w-6 h-6 rounded text-gray-300 hover:bg-gray-700 hover:text-white text-base leading-none flex items-center justify-center shrink-0"
            >
              +
            </button>
          </div>

          {/* 범위 레이블 */}
          <div className="flex justify-between text-xs text-gray-600 mt-1 px-8">
            <span>8</span>
            <span>96</span>
          </div>

          {/* 크기 초기화 버튼 — 인라인 크기가 적용된 경우에만 표시 */}
          {currentFontSize && (
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                restoreSelection()
                editor.chain().unsetFontSize().run()
                setSliderValue(16)
                setOpenPanel(null)
                forceUpdate(n => n + 1)
              }}
              className="w-full mt-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-700 hover:text-white transition-colors text-center"
            >
              기본 크기로 초기화
            </button>
          )}
        </div>
      )}

      {/* ── 색상 피커 패널 ──────────────────────── */}
      {/* openPanel이 'text' 또는 'highlight'인 경우에만 툴바 아래로 펼쳐짐 */}
      {/* Python으로 치면: if open_panel in ('text', 'highlight'): render_color_panel() */}
      {(openPanel === 'text' || openPanel === 'highlight') && (
        <div className="px-2 pb-2 border-t border-gray-700">
          <p className="text-xs text-gray-400 mt-1.5 mb-1.5">
            {openPanel === 'text' ? '글자 색상' : '배경 색상'}
          </p>

          {/* 색상 스와치 그리드 */}
          <div className="flex gap-1 flex-wrap">
            {(openPanel === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS).map((color) => (
              <button
                key={color.value ?? 'default'}
                title={color.label}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  restoreSelection()

                  if (openPanel === 'text') {
                    if (color.value) editor.commands.setColor(color.value)
                    else editor.commands.unsetColor()
                  } else {
                    if (color.value) editor.commands.setHighlight({ color: color.value })
                    else editor.commands.unsetHighlight()
                  }

                  setOpenPanel(null)  // 색상 선택 후 패널 닫기
                  forceUpdate(n => n + 1)
                }}
                className="w-6 h-6 rounded hover:scale-110 transition-transform"
                style={{
                  // value가 null이면 "색상 없음"을 나타내는 대각선 스타일
                  background: color.value
                    ? color.value
                    : 'linear-gradient(135deg, #f9fafb 45%, #ef4444 45%, #ef4444 55%, #f9fafb 55%)',
                  border: '2px solid #4b5563',
                }}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
