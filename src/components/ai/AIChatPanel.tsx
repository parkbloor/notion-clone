// ==============================================
// src/components/ai/AIChatPanel.tsx
// 역할: 재사용 가능한 AI 대화 패널 공통 컴포넌트
//   - sidebar 모드: 블록 우측에 붙어서 표시 (ChartBlock 등)
//   - floating 모드: 화면 우측 고정 위치 플로팅 (에디터 전체용)
// Python으로 치면: class AIChatPanel(Widget): chat_history + streaming
// ==============================================

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'

// ── 채팅 메시지 타입 ────────────────────────────────
// Python으로 치면: @dataclass class ChatMsg: role: str; content: str
export interface ChatMsg {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface AIChatPanelProps {
  title: string              // 패널 헤더 제목 (예: 'AI 차트 생성')
  icon: string               // 이모지 아이콘 (예: '📊')
  emptyHint: string          // 채팅 비어있을 때 안내 문구
  // 블록별 AI 역할 지시문 — 매 요청 prompt 앞에 붙음
  // Python으로 치면: self.system_prompt: str
  systemPrompt: string
  // 현재 블록 내용 컨텍스트 — 함수면 매 요청 시 최신값 호출
  // Python으로 치면: self.context: Callable[[], str] | str | None
  context?: string | (() => string)
  placeholder?: string
  quickCommands?: string[]   // 빠른 명령어 칩 버튼 목록
  mode: 'sidebar' | 'floating'
  applyLabel?: string        // 적용 버튼 텍스트 (기본: '✓ 적용')
  // AI 응답을 실제로 적용하는 콜백
  // 반환값(string)이 있으면 채팅에 성공 메시지로 추가
  // Python으로 치면: def on_apply(self, text: str) -> str | None: ...
  onApply: (text: string) => string | void
  onClose: () => void
  // 히스토리 지속성 — 초기값 주입 + 변경 알림 (저장 연동용)
  initialHistory?: ChatMsg[]
  onHistoryChange?: (history: ChatMsg[]) => void
}

// =============================================
// AIChatPanel 메인 컴포넌트
// =============================================
export default function AIChatPanel({
  title,
  icon,
  emptyHint,
  systemPrompt,
  context,
  placeholder = 'AI에게 물어보세요… (Enter 전송)',
  quickCommands = [],
  mode,
  applyLabel = '✓ 적용',
  onApply,
  onClose,
  initialHistory = [],
  onHistoryChange,
}: AIChatPanelProps) {
  const { aiProvider, aiModel, aiApiKey, ollamaUrl } = useSettingsStore()

  // ── 채팅 상태 ─────────────────────────────────────
  // Python으로 치면: self.history: list[ChatMsg] = []
  const [history, setHistory] = useState<ChatMsg[]>(initialHistory)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamText, setStreamText] = useState('')

  // 적용된 메시지 인덱스 추적 (버튼 비활성화용)
  // Python으로 치면: self.applied_indices: set[int] = set()
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set())

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // SSE 요청 취소용 — 언마운트 시 진행 중인 AI 스트림 중단
  // Python으로 치면: self._abort_ctrl: AbortController | None = None
  const aiAbortRef = useRef<AbortController | null>(null)

  // 드래그/리사이즈 리스너 cleanup — 언마운트 시 좀비 리스너 방지
  // Python으로 치면: self._drag_cleanup: Callable | None = None
  const activeListenersRef = useRef<(() => void) | null>(null)

  // 언마운트 시 AI 스트림 + 이벤트 리스너 일괄 정리
  useEffect(() => () => {
    aiAbortRef.current?.abort()
    activeListenersRef.current?.()
  }, [])

  // ── 드래그 이동 + 리사이즈 (floating 모드 전용) ──────
  // Python으로 치면: self.pos = (right,bottom); self.size = (w,h)
  const [pos, setPos] = useState({ right: 16, bottom: 16 })
  const [size, setSize] = useState({ width: 320, height: 480 })

  // 이동 드래그
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null)

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (mode !== 'floating') return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRight: pos.right, startBottom: pos.bottom }
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setSize(s => {
        const newRight = Math.max(0, Math.min(window.innerWidth - s.width, dragRef.current!.startRight - dx))
        const newBottom = Math.max(0, Math.min(window.innerHeight - s.height, dragRef.current!.startBottom - dy))
        setPos({ right: newRight, bottom: newBottom })
        return s
      })
    }
    function onUp() {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      activeListenersRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    // 언마운트 시 제거할 cleanup 등록
    activeListenersRef.current = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }

  // ── 리사이즈 드래그 ──────────────────────────────
  // dir: 'left' | 'top' | 'corner' — 어느 핸들을 드래그했는지
  // Python으로 치면: def start_resize(self, dir): attach_resize_handler()
  function startResize(e: React.MouseEvent, dir: 'left' | 'top' | 'corner') {
    if (mode !== 'floating') return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = size.width
    const startH = size.height
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX  // 양수 = 오른쪽
      const dy = ev.clientY - startY  // 양수 = 아래쪽
      setSize(prev => {
        // 왼쪽 핸들: 왼쪽으로 드래그 → 너비 증가 (패널이 right 고정이므로 왼쪽으로 확장)
        const newW = (dir === 'left' || dir === 'corner')
          ? Math.max(240, Math.min(window.innerWidth - 32, startW - dx))
          : prev.width
        // 위쪽 핸들: 위로 드래그 → 높이 증가 (패널이 bottom 고정이므로 위쪽으로 확장)
        const newH = (dir === 'top' || dir === 'corner')
          ? Math.max(300, Math.min(window.innerHeight - 32, startH - dy))
          : prev.height
        return { width: newW, height: newH }
      })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      activeListenersRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    // 언마운트 시 제거할 cleanup 등록
    activeListenersRef.current = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }

  // ── 스크롤 유지 ─────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamText])

  // ── 컨텍스트 값 가져오기 ──────────────────────────
  // Python으로 치면: def get_context(self): return self.context() if callable else self.context
  const getContext = useCallback((): string => {
    if (!context) return ''
    return typeof context === 'function' ? context() : context
  }, [context])

  // ── 히스토리 업데이트 + 외부 저장 알림 ───────────
  // Python으로 치면: def update_history(self, h): self.history = h; self.on_change(h)
  const updateHistory = useCallback((newHistory: ChatMsg[]) => {
    setHistory(newHistory)
    onHistoryChange?.(newHistory)
  }, [onHistoryChange])

  // ── AI 메시지 전송 + SSE 스트리밍 ────────────────
  // Python으로 치면: async def send(self, user_msg: str): ...
  const send = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isLoading) return

    const ctx = getContext()

    // 사용자 메시지 추가
    const newHistory: ChatMsg[] = [...history, { role: 'user', content: userMsg }]
    updateHistory(newHistory)
    setInput('')
    setIsLoading(true)
    setStreamText('')

    // 시스템 지시 + 컨텍스트 + 대화 히스토리 + 사용자 메시지를 하나의 prompt로 조합
    // Python으로 치면: prompt = system + context_section + history_text + user_msg
    const historyText = newHistory.slice(0, -1)
      .filter(m => m.role !== 'system')
      .map(m => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content)
      .join('\n')

    const fullPrompt = [
      systemPrompt,
      ctx ? '\n\n현재 내용:\n' + ctx : '',
      historyText ? '\n\n대화 기록:\n' + historyText : '',
      '\n\nUser: ' + userMsg,
    ].filter(Boolean).join('')

    // 이전 요청 취소 + 새 컨트롤러 등록
    aiAbortRef.current?.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    try {
      const res = await fetch('http://localhost:8000/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
          api_key: aiApiKey,
          base_url: aiProvider === 'ollama' ? ollamaUrl : undefined,
          prompt: fullPrompt,
          context: '',
        }),
        signal: controller.signal,  // 언마운트·중복 요청 시 중단
      })
      if (!res.ok) throw new Error('서버 오류 ' + res.status)
      if (!res.body) throw new Error('스트림 없음')

      reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = '', accumulated = '', done = false

      while (!done) {
        const { done: sd, value } = await reader.read()
        if (sd) { done = true; break }
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const raw = part.slice(6).trim()
          if (raw === '[DONE]') {
            done = true
            // AI 응답 완료 → 히스토리에 추가
            const finalHistory: ChatMsg[] = [
              ...newHistory,
              { role: 'assistant', content: accumulated.trim() },
            ]
            updateHistory(finalHistory)
            setStreamText('')
            break
          }
          try {
            const msg = JSON.parse(raw)
            if (msg.error) throw new Error(msg.error)
            if (msg.text) { accumulated += msg.text; setStreamText(accumulated) }
          } catch { /* 무시 */ }
        }
      }
    } catch (err) {
      // AbortError는 의도적 취소 — 사용자에게 표시하지 않음
      if (err instanceof Error && err.name !== 'AbortError') {
        updateHistory([...newHistory, { role: 'system', content: '❌ ' + err.message }])
      }
    } finally {
      reader?.cancel().catch(() => {})  // 스트림 정리
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, isLoading, getContext, systemPrompt, aiProvider, aiModel, aiApiKey, ollamaUrl, updateHistory])

  // ── 적용 버튼 처리 ───────────────────────────────
  // Python으로 치면: def handle_apply(self, msg_index: int, text: str): ...
  function handleApply(msgIndex: number, text: string) {
    const feedback = onApply(text)
    // 버튼 비활성화 (중복 적용 방지)
    setAppliedIndices(prev => new Set([...prev, msgIndex]))
    // 반환된 피드백 메시지가 있으면 채팅에 추가
    if (feedback) {
      updateHistory([...history, { role: 'system', content: '✅ ' + feedback }])
    }
  }

  // ── 컨테이너 클래스 / 스타일 계산 ──────────────────
  // floating: 화면 고정 + 동적 크기 / sidebar: 블록 우측 패널
  const containerCls = mode === 'floating'
    ? 'fixed z-50 flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl'
    : 'flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'

  const containerStyle = mode === 'floating'
    ? { width: size.width + 'px', height: size.height + 'px', right: pos.right + 'px', bottom: pos.bottom + 'px' }
    : undefined

  return (
    <div className={containerCls} style={containerStyle}>

      {/* ── 리사이즈 핸들 (floating 전용) ── */}
      {mode === 'floating' && (
        <>
          {/* 왼쪽 가장자리 — 너비 조절 */}
          <div
            onMouseDown={e => startResize(e, 'left')}
            className="absolute top-4 bottom-4 left-0 w-1.5 cursor-ew-resize rounded-l-2xl hover:bg-blue-400/30 transition-colors"
            title="너비 조절"
          />
          {/* 위쪽 가장자리 — 높이 조절 */}
          <div
            onMouseDown={e => startResize(e, 'top')}
            className="absolute top-0 left-4 right-4 h-1.5 cursor-ns-resize rounded-t-2xl hover:bg-blue-400/30 transition-colors"
            title="높이 조절"
          />
          {/* 왼쪽 위 모서리 — 너비+높이 동시 조절 */}
          <div
            onMouseDown={e => startResize(e, 'corner')}
            className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center rounded-tl-2xl hover:bg-blue-400/30 transition-colors"
            title="크기 조절"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-gray-300 dark:text-gray-600">
              <line x1="1" y1="7" x2="7" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="4" y1="7" x2="7" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </>
      )}

      {/* ── 헤더 (floating 모드에서 드래그 핸들) ── */}
      <div
        className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0"
        style={mode === 'floating' ? { cursor: 'grab' } : undefined}
        onMouseDown={onHeaderMouseDown}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm select-none">⠿</span>
          <span className="text-sm">{icon}</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 select-none">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none w-6 h-6 flex items-center justify-center"
        >×</button>
      </div>

      {/* ── 메시지 목록 ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {/* 빈 상태 안내 */}
        {history.length === 0 && !isLoading && (
          <div className="text-center py-6 space-y-2">
            <div className="text-2xl">{icon}</div>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed whitespace-pre-line">
              {emptyHint}
            </p>
          </div>
        )}

        {/* 메시지 렌더링 */}
        {history.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start gap-1'}
          >
            {/* 말풍선 */}
            <div className={
              msg.role === 'user'
                ? 'max-w-[88%] px-3 py-2 rounded-2xl rounded-tr-sm text-xs bg-blue-500 text-white leading-relaxed'
                : msg.role === 'system'
                ? 'max-w-[88%] px-3 py-2 rounded-2xl text-xs bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 leading-relaxed'
                : 'max-w-[88%] px-3 py-2 rounded-2xl rounded-tl-sm text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap'
            }>
              {msg.content}
            </div>

            {/* 적용 버튼 — assistant 메시지에만 표시 */}
            {msg.role === 'assistant' && (
              <button
                onClick={() => handleApply(i, msg.content)}
                disabled={appliedIndices.has(i)}
                className={
                  appliedIndices.has(i)
                    ? 'ml-1 text-xs px-2.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 border border-green-200 dark:border-green-800 cursor-default'
                    : 'ml-1 text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium'
                }
              >
                {appliedIndices.has(i) ? '✓ 적용됨' : applyLabel}
              </button>
            )}
          </div>
        ))}

        {/* 스트리밍 중 메시지 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[88%] px-3 py-2 rounded-2xl rounded-tl-sm text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 leading-relaxed">
              {streamText
                ? (streamText.length > 400 ? streamText.slice(0, 400) + '…' : streamText)
                : (
                  <span className="flex items-center gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                  </span>
                )
              }
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── 빠른 명령어 칩 ── */}
      {quickCommands.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1 shrink-0">
          {quickCommands.map(cmd => (
            <button
              key={cmd}
              onClick={() => { setInput(cmd); textareaRef.current?.focus() }}
              disabled={isLoading}
              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >{cmd}</button>
          ))}
        </div>
      )}

      {/* ── 입력창 ── */}
      <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex gap-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
            placeholder={placeholder}
            rows={2}
            disabled={isLoading}
            className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2 resize-none outline-none focus:border-blue-400 dark:focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
          />
          <button
            onClick={() => send(input)}
            disabled={isLoading || !input.trim()}
            className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >{isLoading ? '…' : '전송'}</button>
        </div>
      </div>
    </div>
  )
}
