// =============================================
// src/components/ai/GlobalAIChatButton.tsx
// 역할: 컨텍스트 인식 전역 AI 채팅 플로팅 버튼
//   - 우하단 고정 FAB 버튼
//   - 블록 선택 이벤트 수신 → 블록 타입 자동 감지
//   - 특수 블록(일정/마인드맵/차트): 해당 블록에 직접 삽입
//   - 텍스트 블록: 커서 위치에 텍스트 삽입
//   - 선택 없음: 페이지 범용 조언 모드
//   - 블록별 대화 히스토리 독립 유지
// Python으로 치면: class GlobalAIChatButton(QWidget): context_aware_ai_panel
// =============================================

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePageStore } from '@/store/pageStore'
import { Page } from '@/types/block'
import AIChatPanel, { ChatMsg } from './AIChatPanel'
import { PLANNER_SYSTEM_PROMPT } from '@/components/editor/DayPlannerBlock'
import { useLocale } from '@/locales'

// ── AI 대상 블록 타입 ─────────────────────────
// Python으로 치면: @dataclass class AiTarget: block_id, block_type
interface AiTarget {
  blockId:   string
  blockType: string
}

// ── 텍스트 블록 타입 집합 ──────────────────────
// Python으로 치면: TEXT_BLOCK_TYPES: set[str] = {'paragraph', 'heading1', ...}
const TEXT_BLOCK_TYPES = new Set([
  'paragraph', 'heading1', 'heading2', 'heading3',
  'heading4', 'heading5', 'heading6',
  'bulletList', 'numberedList', 'taskList', 'blockquote',
])

// ── 마인드맵 전용 시스템 프롬프트 ───────────────
// set_all / add_children / rename JSON 액션만 출력
// Python으로 치면: MINDMAP_SYSTEM_PROMPT: str = "..."
const MINDMAP_SYSTEM_PROMPT = `당신은 마인드맵 설계 전문가입니다.
사용자의 요청과 페이지 내용을 바탕으로 마인드맵 구조를 JSON으로 생성하세요.

반드시 아래 JSON 형식 중 하나로만 응답하세요. 설명 없이 JSON만 출력하세요.

형식 1 — 전체 트리 새로 생성:
{"action":"set_all","nodes":[{"id":"root","text":"중심주제","parentId":null},{"id":"n1","text":"가지1","parentId":"root"},{"id":"n2","text":"세부","parentId":"n1"}]}

형식 2 — 특정 노드에 자식 추가:
{"action":"add_children","targetId":"root","nodes":[{"text":"새가지1"},{"text":"새가지2"},{"text":"새가지3"}]}

형식 3 — 노드 이름 변경:
{"action":"rename","targetId":"root","text":"새이름"}

규칙:
- set_all: parentId가 null인 노드 반드시 1개(루트), id는 "root","n1","n2" 등 단순 문자열
- 노드 텍스트는 15자 이내, 총 노드 수 8~20개
- JSON만 출력, 설명·마크다운 금지`

// ── 차트 전용 시스템 프롬프트 ───────────────────
// Python으로 치면: CHART_SYSTEM_PROMPT: str = "..."
const CHART_SYSTEM_PROMPT = `당신은 데이터 시각화 전문가입니다.
사용자의 요청에 따라 차트 데이터를 아래 JSON 형식으로만 반환하세요.
설명이나 다른 텍스트 없이 JSON만 출력하세요.

형식:
{"chartType":"bar","title":"차트 제목","labels":["항목1","항목2","항목3"],"series":[{"name":"시리즈명","data":[값1,값2,값3],"color":"#3b82f6"}]}

규칙:
- chartType: "bar" | "line" | "pie" 중 하나
- labels 배열 길이와 각 series의 data 배열 길이는 반드시 동일
- series color는 hex 코드 (예: "#3b82f6")`

// ── 블록 타입 → AI 설정 매핑 ──────────────────
// Python으로 치면: def get_config(block_type: str | None) -> AIConfig: ...
interface BlockAiConfig {
  title:         string    // 패널 헤더 제목
  icon:          string    // 패널 + FAB 아이콘
  fabBg:         string    // FAB 버튼 배경 Tailwind 클래스
  systemPrompt:  string
  quickCommands: string[]
  emptyHint:     string
  placeholder:   string
  applyLabel:    string
  applyEvent:    string    // dispatch할 CustomEvent 이름
}

// ── 블록 타입 → AI 설정 팩토리 (t를 파라미터로 받아 로케일 적용) ──
// Python으로 치면: def get_block_config(block_type, t) -> BlockAiConfig: ...
function getBlockConfig(blockType: string | null, t: ReturnType<typeof useLocale>): BlockAiConfig {
  if (blockType === 'dayplanner') return {
    title: t.ai.panelPlanner,
    icon: '📅',
    fabBg: 'bg-blue-500 text-white',
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    quickCommands: t.ai.quickPlanner,
    emptyHint: t.ai.hintPlanner,
    placeholder: t.ai.placeholderPlanner,
    applyLabel: t.ai.applyPlanner,
    applyEvent: 'ai-apply-schedule',
  }
  if (blockType === 'mindmap') return {
    title: t.ai.panelMindmap,
    icon: '🧠',
    fabBg: 'bg-violet-500 text-white',
    systemPrompt: MINDMAP_SYSTEM_PROMPT,
    quickCommands: t.ai.quickMindmap,
    emptyHint: t.ai.hintMindmap,
    placeholder: t.ai.placeholderMindmap,
    applyLabel: t.ai.applyMindmap,
    applyEvent: 'ai-apply-mindmap',
  }
  if (blockType === 'chart') return {
    title: t.ai.panelChart,
    icon: '📊',
    fabBg: 'bg-emerald-500 text-white',
    systemPrompt: CHART_SYSTEM_PROMPT,
    quickCommands: t.ai.quickChart,
    emptyHint: t.ai.hintChart,
    placeholder: t.ai.placeholderChart,
    applyLabel: t.ai.applyChart,
    applyEvent: 'ai-apply-chart',
  }
  if (blockType && TEXT_BLOCK_TYPES.has(blockType)) return {
    title: t.ai.panelText,
    icon: '✏️',
    fabBg: 'bg-sky-400 text-white',
    systemPrompt: '당신은 글쓰기 전문 AI 어시스턴트입니다. 사용자의 노트·문서 작성을 돕습니다. 현재 페이지 내용을 참고해 자연스러운 글을 작성해주세요. 한국어로 답변하세요.',
    quickCommands: t.ai.quickText,
    emptyHint: t.ai.hintText,
    placeholder: t.ai.placeholderText,
    applyLabel: t.ai.applyText,
    applyEvent: 'ai-insert-text',
  }
  // 선택 없음 — 범용 페이지 모드
  return {
    title: t.ai.globalTitle,
    icon: '🤖',
    fabBg: 'bg-white border border-gray-200 text-blue-500',
    systemPrompt: '당신은 개인 노트 앱의 AI 어시스턴트입니다. 사용자의 현재 페이지 내용을 참고해 질문에 답하고, 글쓰기·요약·계획 수립을 도와줍니다. 한국어로 답변해주세요.',
    quickCommands: t.ai.quickGeneral,
    emptyHint: t.ai.hintGeneral,
    placeholder: t.ai.placeholderGeneral,
    applyLabel: t.ai.applyGeneral,
    applyEvent: 'ai-insert-text',
  }
}

// ── HTML 태그 제거 유틸 ──────────────────────
// Python으로 치면: def strip_html(html: str) -> str: re.sub(r'<[^>]+>', ' ', html)
function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── 현재 페이지 텍스트 컨텍스트 추출 ────────────
// Python으로 치면: def get_page_context(page_id, pages) -> str: ...
function getPageContext(pageId: string | null, pages: Page[]): string {
  if (!pageId) return ''
  const page = pages.find(p => p.id === pageId)
  if (!page) return ''
  const lines = [`[현재 페이지: ${page.title}]`]
  let count = 0
  for (const b of page.blocks) {
    if (count >= 80) break
    if (!TEXT_BLOCK_TYPES.has(b.type)) continue
    const text = stripHtml(b.content)
    if (text) { lines.push(text); count++ }
  }
  return lines.join('\n')
}

// =============================================
export default function GlobalAIChatButton() {

  // ── 로케일 ────────────────────────────────
  // Python으로 치면: t = use_locale()
  const t = useLocale()

  // ── 패널 열림 상태 ─────────────────────────
  // Python으로 치면: self.is_open = False
  const [isOpen, setIsOpen] = useState(false)

  // ── 현재 선택된 AI 대상 블록 ─────────────────
  // null = 선택 없음 (범용 모드)
  // Python으로 치면: self.ai_target: AiTarget | None = None
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null)

  // ── 블록별 독립 대화 히스토리 ─────────────────
  // key: blockId 또는 'general' (선택 없음)
  // Python으로 치면: self.block_histories: dict[str, list[ChatMsg]] = {}
  const [blockHistories, setBlockHistories] = useState<Record<string, ChatMsg[]>>({})

  const { pages, currentPageId } = usePageStore()

  // ── ai-block-select 이벤트 구독 ─────────────
  // Editor.tsx(텍스트 포커스) 및 특수 블록 클릭에서 발행
  // Python으로 치면: window.on('ai-block-select', self._on_block_select)
  useEffect(() => {
    function handleBlockSelect(e: Event) {
      const { blockId, blockType } = (e as CustomEvent<AiTarget>).detail
      setAiTarget({ blockId, blockType })
    }
    function handleBlockDeselect() {
      setAiTarget(null)
    }
    window.addEventListener('ai-block-select', handleBlockSelect)
    window.addEventListener('ai-block-deselect', handleBlockDeselect)
    return () => {
      window.removeEventListener('ai-block-select', handleBlockSelect)
      window.removeEventListener('ai-block-deselect', handleBlockDeselect)
    }
  }, [])

  // ── 외부 클릭 → 선택 해제 ──────────────────
  // [data-ai-block], [data-ai-panel], [data-ai-fab] 밖 클릭 시 deselect
  // Python으로 치면: document.on('mousedown', self._on_outside_click)
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (
        target.closest('[data-ai-block]') ||
        target.closest('[data-ai-panel]') ||
        target.closest('[data-ai-fab]')
      ) return
      // 외부 클릭 → 선택 해제
      setAiTarget(null)
      window.dispatchEvent(new CustomEvent('ai-block-deselect'))
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // ── 컨텍스트 함수 — 매 요청 시 최신 페이지 읽기 ──
  // Python으로 치면: def get_context(self) -> str: ...
  const getContext = useCallback(
    () => getPageContext(currentPageId, pages),
    [currentPageId, pages]
  )

  // ── 히스토리 변경 콜백 — 블록별 독립 보존 ─────
  // Python으로 치면: def on_history_change(self, h): self.histories[key] = h
  const historyKey = aiTarget?.blockId ?? 'general'
  const handleHistoryChange = useCallback((history: ChatMsg[]) => {
    setBlockHistories(prev => ({ ...prev, [historyKey]: history }))
  }, [historyKey])

  // ── 적용 핸들러 — 블록 타입에 따라 이벤트 dispatch ──
  // Python으로 치면: def handle_apply(self, text): window.emit(self.config.apply_event, text)
  const cfg = getBlockConfig(aiTarget?.blockType ?? null, t)
  const applyEventRef = useRef(cfg.applyEvent)
  applyEventRef.current = cfg.applyEvent

  const handleApply = useCallback((text: string): string => {
    window.dispatchEvent(new CustomEvent(applyEventRef.current, { detail: text }))
    if (applyEventRef.current === 'ai-apply-schedule') return t.ai.toastPlanner
    if (applyEventRef.current === 'ai-apply-mindmap')  return t.ai.toastMindmap
    if (applyEventRef.current === 'ai-apply-chart')    return t.ai.toastChart
    return t.ai.toastText
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  // ── 현재 설정 ─────────────────────────────────
  // aiTarget.blockType 변경 시 자동으로 새 설정 적용
  const isSpecialBlock = aiTarget && !TEXT_BLOCK_TYPES.has(aiTarget.blockType)

  return (
    <>
      {/* ── FAB 버튼 (우하단 고정) ────────────────────
          data-ai-fab: 외부클릭 deselect 예외 처리용
          블록 선택 상태에 따라 아이콘/배경색 자동 변경
          Python으로 치면: self.fab_btn = QPushButton(); 상태에 따라 icon 변경 */}
      <button
        type="button"
        data-ai-fab="true"
        onClick={() => setIsOpen(prev => !prev)}
        title={cfg.title}
        className={`fixed bottom-4 right-20 z-40 w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg transition-all hover:scale-105 ${isOpen ? 'scale-95 shadow-lg ' + cfg.fabBg : cfg.fabBg + ' hover:shadow-xl'}`}
      >
        {cfg.icon}
      </button>

      {/* ── 선택된 블록 타입 툴팁 (FAB 왼쪽) ─────────
          블록이 선택되었을 때만 표시 — 현재 AI 모드 안내
          Python으로 치면: if ai_target: render Label(cfg.title) */}
      {aiTarget && !isOpen && (
        <div className="fixed bottom-5 right-32 z-40 pointer-events-none">
          <span className="text-[10px] bg-gray-800 text-white px-2 py-1 rounded-full opacity-80 whitespace-nowrap">
            {cfg.icon} {cfg.title.replace('AI — ', '')}{t.ai.selectedBlock}
          </span>
        </div>
      )}

      {/* ── AIChatPanel (floating 모드) ───────────────
          key={historyKey}: 블록 전환 시 재마운트 → 새 시스템 프롬프트 적용
          data-ai-panel: AIChatPanel 래퍼에 전달할 속성 (외부 클릭 예외 처리)
          initialHistory: 블록별 히스토리 복원
          Python으로 치면: if is_open: render AIChatPanel(config=cfg) */}
      {isOpen && (
        <div data-ai-panel="true">
          <AIChatPanel
            key={historyKey}
            title={cfg.title}
            icon={cfg.icon}
            emptyHint={cfg.emptyHint}
            systemPrompt={cfg.systemPrompt}
            context={getContext}
            placeholder={cfg.placeholder}
            quickCommands={cfg.quickCommands}
            mode="floating"
            applyLabel={cfg.applyLabel}
            initialPos={{ right: 16, bottom: 72 }}
            initialHistory={blockHistories[historyKey] ?? []}
            onHistoryChange={handleHistoryChange}
            onApply={handleApply}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}

      {/* ── 특수 블록 선택 시 안내 배너 (채팅 패널 상단) ──
          isSpecialBlock이고 패널이 열려있을 때 채팅 위에 표시할 정보는
          emptyHint와 title로 충분히 전달됨 → 별도 UI 불필요 */}
    </>
  )
}
