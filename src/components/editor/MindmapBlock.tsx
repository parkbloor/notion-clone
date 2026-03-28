// ==============================================
// src/components/editor/MindmapBlock.tsx
// 역할: AI 마인드맵 블록
//   - 왼쪽: 방사형 SVG 마인드맵 캔버스 (팬/줌/노드 드래그/편집/접기)
//   - 오른쪽: AI 채팅 패널 (트리 생성 · 확장 · 이름변경 JSON 액션)
// content JSON 구조:
//   { nodes, chatHistory, chatOpen, nodePositions }
// Python으로 치면: class MindmapBlock(Widget): canvas + ai_chat
// ==============================================

'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useLocale } from '@/locales'

// ── 마인드맵 노드 ────────────────────────────────
// Python으로 치면: @dataclass class MindNode: id, text, parentId, collapsed
interface MindNode {
  id: string
  text: string
  parentId: string | null
  collapsed: boolean
}

// ── AI 채팅 메시지 ────────────────────────────────
interface ChatMsg {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ── 전체 저장 데이터 ──────────────────────────────
interface MindmapData {
  nodes: MindNode[]
  chatHistory: ChatMsg[]
  chatOpen: boolean
  // 드래그로 이동된 노드 위치 오버라이드 { nodeId: {x, y} }
  // Python으로 치면: node_positions: dict[str, tuple[float, float]]
  nodePositions?: Record<string, { x: number; y: number }>
}

// ── 깊이별 색상 팔레트 (Digital Atelier: 따뜻한 뉴트럴 계열) ──────────────
// Python으로 치면: DEPTH_COLORS = ['#44403c', '#78716c', '#a78bfa', ...]
const DEPTH_COLORS = [
  '#44403c', // stone-700 (루트 — 짙은 웜 차콜)
  '#78716c', // stone-500 (1단계)
  '#a78bfa', // violet-400 (2단계 — 은은한 포인트)
  '#86efac', // 흐린 민트 (3단계)
  '#fbbf24', // amber-400 (4단계)
  '#94a3b8', // slate-400 (5단계+)
]

const SVG_W = 1000
const SVG_H = 700

// ── 기본 데이터 ───────────────────────────────────
function defaultData(): MindmapData {
  return {
    nodes: [{ id: 'root', text: '중심 주제', parentId: null, collapsed: false }],
    chatHistory: [],
    chatOpen: true,
    nodePositions: {},
  }
}

// ── 깊이 계산 ─────────────────────────────────────
// Python으로 치면: def get_depth(nodes, id): ...
function getDepth(nodes: MindNode[], id: string): number {
  const node = nodes.find(n => n.id === id)
  if (!node || !node.parentId) return 0
  return 1 + getDepth(nodes, node.parentId)
}

// ── 베지어 곡선 경로 ──────────────────────────────
function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = (to.x - from.x) * 0.5
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

// ── 방사형 레이아웃 계산 ──────────────────────────
// 리프 수에 비례하여 각도를 배분하므로 노드가 겹치지 않음
// Python으로 치면: def compute_layout(nodes): return {id: (x, y), ...}
function computeLayout(nodes: MindNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const root = nodes.find(n => !n.parentId)
  if (!root) return positions

  const CENTER = { x: SVG_W / 2, y: SVG_H / 2 }
  positions.set(root.id, CENTER)

  const getVisible = (id: string): MindNode[] => {
    const parent = nodes.find(n => n.id === id)
    if (parent?.collapsed) return []
    return nodes.filter(n => n.parentId === id)
  }

  function countLeaves(id: string): number {
    const children = getVisible(id)
    if (children.length === 0) return 1
    return children.reduce((s, c) => s + countLeaves(c.id), 0)
  }

  function layout(id: string, a0: number, a1: number, ppos: { x: number; y: number }, depth: number) {
    const children = getVisible(id)
    if (children.length === 0) return

    const radius = Math.max(100, 220 - depth * 18)
    const totalLeaves = Math.max(children.reduce((s, c) => s + countLeaves(c.id), 0), 1)
    const MIN_ANGLE = (Math.PI * 2) / 10
    const range = Math.max(a1 - a0, children.length * MIN_ANGLE)
    let cur = a0 - (range - (a1 - a0)) / 2

    for (const child of children) {
      const share = range * (countLeaves(child.id) / totalLeaves)
      const mid = cur + share / 2
      const x = ppos.x + Math.cos(mid) * radius
      const y = ppos.y + Math.sin(mid) * radius
      positions.set(child.id, { x, y })
      layout(child.id, cur, cur + share, { x, y }, depth + 1)
      cur += share
    }
  }

  layout(root.id, 0, Math.PI * 2, CENTER, 1)
  return positions
}

// ── 트리 직렬화 (AI 컨텍스트용) ──────────────────
function serializeTree(nodes: MindNode[]): string {
  const root = nodes.find(n => !n.parentId)
  if (!root) return '(빈 트리)'
  function print(id: string, indent: number): string {
    const node = nodes.find(n => n.id === id)
    if (!node) return ''
    const kids = nodes.filter(n => n.parentId === id)
    const pre = '  '.repeat(indent)
    const childLines = kids.map(c => print(c.id, indent + 1)).join('\n')
    return `${pre}[${id}] ${node.text}${childLines ? '\n' + childLines : ''}`
  }
  return print(root.id, 0)
}

// ── AI 프롬프트 생성 ──────────────────────────────
function buildAiPrompt(treeText: string, userMsg: string): string {
  return `당신은 마인드맵 설계 전문가입니다.

현재 마인드맵 구조 (각 노드는 [id] 텍스트 형식):
${treeText}

사용자 요청에 따라 반드시 다음 JSON 형식 중 하나로만 응답하세요.
설명이나 다른 텍스트는 절대 출력하지 마세요. JSON만 출력하세요.

형식 1 — 전체 트리 새로 생성:
{"action":"set_all","nodes":[{"id":"root","text":"중심주제","parentId":null},{"id":"n1","text":"가지1","parentId":"root"},{"id":"n2","text":"세부","parentId":"n1"}]}

형식 2 — 특정 노드에 자식 추가:
{"action":"add_children","targetId":"노드id","nodes":[{"text":"새가지1"},{"text":"새가지2"},{"text":"새가지3"}]}

형식 3 — 노드 이름 변경:
{"action":"rename","targetId":"노드id","text":"새이름"}

규칙:
- set_all 시 id는 "root","n1","n2" 등 단순 문자열
- parentId가 null인 노드는 반드시 1개만 (루트)
- 노드 텍스트는 15자 이내

사용자: ${userMsg}`
}

// ── 모듈 레벨: 마지막 활성 MindmapBlock ID ───────
// GlobalAIChatButton의 'ai-apply-mindmap' 이벤트를 처리할 블록 결정
// Python으로 치면: _active_mindmap_id: str | None = None
let _activeMindmapBlockId: string | null = null

// =============================================
// MindmapBlock 메인 컴포넌트
// =============================================
export default function MindmapBlock({ block, pageId, readMode }: { block: Block; pageId: string; readMode?: boolean }) {
  const t = useLocale()
  const { updateBlock } = usePageStore()
  const { aiProvider, aiModel, aiApiKey, ollamaUrl } = useSettingsStore()

  // ── 초기 데이터 파싱 ─────────────────────────────
  const initData = useMemo<MindmapData>(() => {
    try {
      const parsed = JSON.parse(block.content)
      if (Array.isArray(parsed.nodes)) return parsed
    } catch {}
    return defaultData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  // ── 로컬 상태 ─────────────────────────────────────
  const [nodes, setNodes] = useState<MindNode[]>(initData.nodes)
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>(initData.chatHistory)
  const [chatOpen, setChatOpen] = useState(initData.chatOpen)
  // 드래그로 이동된 노드의 위치 오버라이드
  // Python으로 치면: self._node_pos_overrides: dict[str, (x, y)] = {}
  const [nodePosOverrides, setNodePosOverrides] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(Object.entries(initData.nodePositions ?? {}))
  )
  // 읽기 전용 모드 — 기본값 true (잘못 클릭 방지)
  // Python으로 치면: self.read_only: bool = True
  const [readOnly, setReadOnly] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [chatInput, setChatInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiStreamText, setAiStreamText] = useState('')
  const [nodeCtxMenu, setNodeCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  // 드래그 중인지 여부 — cursor 표시용 (실제 드래그 로직은 ref로)
  const [isDraggingNode, setIsDraggingNode] = useState(false)

  // ── Ref ──────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const chatEndRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<MindNode[]>(nodes)
  // chatHistoryRef: 전역 AI 이벤트 핸들러에서 최신 chatHistory 참조용 (stale closure 방지)
  // Python으로 치면: self._chat_history_ref = WeakRef(self.chat_history)
  const chatHistoryRef = useRef(chatHistory)
  // applyAiActionRef: 전역 AI 이벤트에서 최신 applyAiAction을 호출하기 위한 ref
  // Python으로 치면: self._apply_ref = WeakRef(self.apply_ai_action)
  const applyAiActionRef = useRef<typeof applyAiAction>(() => {})
  // isAiTarget: 전역 AI가 이 블록을 선택했을 때 링 + 배지 표시
  // Python으로 치면: self.is_ai_target = False
  const [isAiTarget, setIsAiTarget] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  // SSE 요청 취소용 — 컴포넌트 언마운트 시 진행 중인 AI 스트림 중단
  // Python으로 치면: self._abort_ctrl: AbortController | None = None
  const aiAbortRef = useRef<AbortController | null>(null)
  // 드래그 중인 노드 정보 — 마우스 이벤트 핸들러에서 사용
  // Python으로 치면: self._dragging: dict | None = None
  const draggingNode = useRef<{
    nodeId: string
    startClientX: number
    startClientY: number
    origX: number     // 드래그 시작 시 노드의 SVG 좌표 X
    origY: number
    hasMoved: boolean
  } | null>(null)
  // 최신 zoom/pan 값을 ref로도 유지 — document 레벨 핸들러에서 stale closure 방지
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  const readOnlyRef = useRef(readOnly)
  // 페이지 레벨 readMode도 ref로 동기화 (휠 핸들러에서 최신값 참조용)
  // Python으로 치면: self.read_mode_ref = readMode
  const readModeRef = useRef(readMode)
  // ref 동기화 — useEffect 없이 렌더 중 직접 업데이트
  // useEffect는 커밋 후 실행되므로 이벤트 타이밍에 따라 stale 발생 가능
  // 렌더 중 직접 대입은 React 공식 패턴 (commitPhase 전에 값 반영됨)
  // Python으로 치면: self._zoom_ref = self.zoom  (매 렌더마다)
  zoomRef.current = zoom
  panRef.current = pan
  nodesRef.current = nodes
  readOnlyRef.current = readOnly
  readModeRef.current = readMode

  // ── 레이아웃 계산 ─────────────────────────────────
  const autoPositions = useMemo(() => computeLayout(nodes), [nodes])

  // ── 렌더 순서 정렬 — 드래그 중인 노드를 맨 위(마지막)에 렌더 ──
  // 렌더링마다 인라인 sort()로 새 배열 생성하는 것을 useMemo로 최적화
  // draggingNode는 ref이므로 의존성 배열에서 제외 (변경돼도 재렌더 불필요)
  // Python으로 치면: sorted_nodes = sorted(nodes, key=lambda n: n.id == dragging_id)
  const sortedNodes = useMemo(() =>
    [...nodes].sort((a, b) =>
      draggingNode.current?.nodeId === a.id ? 1 :
      draggingNode.current?.nodeId === b.id ? -1 : 0
    ),
  [nodes])

  // ── 최종 노드 위치 = 자동 계산 위치 or 드래그 오버라이드 ──
  // Python으로 치면: def get_pos(id): return overrides.get(id) or auto_positions[id]
  const getFinalPos = useCallback((nodeId: string): { x: number; y: number } | undefined => {
    return nodePosOverrides.get(nodeId) ?? autoPositions.get(nodeId)
  }, [nodePosOverrides, autoPositions])

  // ── 디바운스 저장 ─────────────────────────────────
  const save = useCallback((
    newNodes: MindNode[],
    newHistory: ChatMsg[],
    newChatOpen: boolean,
    newOverrides: Map<string, { x: number; y: number }>
  ) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateBlock(pageId, block.id, JSON.stringify({
        nodes: newNodes,
        chatHistory: newHistory,
        chatOpen: newChatOpen,
        nodePositions: Object.fromEntries(newOverrides),
      }))
    }, 500)
  }, [pageId, block.id, updateBlock])

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    save(nodes, chatHistory, chatOpen, nodePosOverrides)
  }, [nodes, chatHistory, chatOpen, nodePosOverrides, save])

  // ── 마우스 휠 줌 (passive: false 로 preventDefault 가능하게) ──
  // React onWheel은 passive listener라 preventDefault가 차단될 수 있음
  // → useEffect로 직접 등록해서 { passive: false } 지정
  // Python으로 치면: container.bind('<MouseWheel>', on_wheel)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // 페이지 읽기/잠금 OR 마인드맵 내부 읽기 모드 → 휠 줌 비활성화
      // Python으로 치면: if read_mode or read_only: return
      if (readModeRef.current || readOnlyRef.current) return
      const factor = e.deltaY < 0 ? 1.12 : 0.9
      setZoom(z => Math.max(0.2, Math.min(4, z * factor)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── 언마운트 시 진행 중인 AI 스트림 취소 ──────────
  // Python으로 치면: def __del__(self): self._abort_controller?.abort()
  useEffect(() => () => { aiAbortRef.current?.abort() }, [])

  // ── document 레벨 mousemove / mouseup ────────────
  // 노드 드래그 + 배경 팬을 한 곳에서 처리
  // document 레벨이므로 SVG 밖으로 마우스가 나가도 계속 작동
  // Python으로 치면: def on_mouse_move(event): ... (글로벌 핸들러)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // ── 노드 드래그 ──────────────────────────────
      if (draggingNode.current) {
        const dx = e.clientX - draggingNode.current.startClientX
        const dy = e.clientY - draggingNode.current.startClientY
        // 3px 이상 이동해야 드래그로 인식 (클릭과 구분)
        if (!draggingNode.current.hasMoved && Math.hypot(dx, dy) > 3) {
          draggingNode.current.hasMoved = true
          setIsDraggingNode(true)
        }
        if (draggingNode.current.hasMoved) {
          const z = zoomRef.current
          const newX = draggingNode.current.origX + dx / z
          const newY = draggingNode.current.origY + dy / z
          const nodeId = draggingNode.current.nodeId
          setNodePosOverrides(prev => {
            const next = new Map(prev)
            next.set(nodeId, { x: newX, y: newY })
            return next
          })
        }
        return
      }
      // ── 배경 팬 ──────────────────────────────────
      if (isPanning.current) {
        setPan({
          x: e.clientX - panStart.current.x,
          y: e.clientY - panStart.current.y,
        })
      }
    }

    const onUp = () => {
      if (draggingNode.current) {
        // 이동 없이 마우스업 = 클릭 → 선택 처리
        if (!draggingNode.current.hasMoved) {
          setSelectedId(draggingNode.current.nodeId)
          setNodeCtxMenu(null)
        }
        draggingNode.current = null
        setIsDraggingNode(false)
      }
      isPanning.current = false
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, []) // 의존성 없음 — ref로 최신값 접근

  // ── 노드 조작 ─────────────────────────────────────

  const addChild = useCallback((parentId: string) => {
    if (readOnlyRef.current) return  // 읽기 모드 안전장치
    const newNode: MindNode = { id: crypto.randomUUID(), text: t.blocks.mindmap.newNode, parentId, collapsed: false }
    setNodes(prev => [...prev, newNode])
    setSelectedId(newNode.id)
    setTimeout(() => { setEditingId(newNode.id); setEditingText(t.blocks.mindmap.newNode) }, 30)
    return newNode
  }, [])

  const addSibling = useCallback((nodeId: string) => {
    if (readOnlyRef.current) return  // 읽기 모드 안전장치
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node?.parentId) return
    const newNode: MindNode = { id: crypto.randomUUID(), text: '새 노드', parentId: node.parentId, collapsed: false }
    setNodes(prev => [...prev, newNode])
    setSelectedId(newNode.id)
    setTimeout(() => { setEditingId(newNode.id); setEditingText(t.blocks.mindmap.newNode) }, 30)
  }, [])

  const deleteNode = useCallback((nodeId: string) => {
    const toDelete = new Set<string>()
    const collect = (id: string) => {
      toDelete.add(id)
      nodesRef.current.filter(n => n.parentId === id).forEach(c => collect(c.id))
    }
    collect(nodeId)
    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
    // 삭제된 노드의 위치 오버라이드도 제거
    setNodePosOverrides(prev => {
      const next = new Map(prev)
      toDelete.forEach(id => next.delete(id))
      return next
    })
    setSelectedId(null)
  }, [])

  const toggleCollapse = useCallback((nodeId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, collapsed: !n.collapsed } : n))
  }, [])

  const finishEdit = useCallback(() => {
    if (!editingId) return
    const trimmed = editingText.trim() || t.blocks.mindmap.newNode
    setNodes(prev => prev.map(n => n.id === editingId ? { ...n, text: trimmed } : n))
    setEditingId(null)
    setEditingText('')
  }, [editingId, editingText])

  // ── 키보드 핸들러 ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingId) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit() }
        if (e.key === 'Escape') { setEditingId(null); setEditingText('') }
        return
      }
      if (!selectedId) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return

      // 읽기 모드: Escape(선택 해제)만 허용, 나머지 편집 단축키 차단
      if (readOnlyRef.current) {
        if (e.key === 'Escape') setSelectedId(null)
        return
      }

      if (e.key === 'Tab') { e.preventDefault(); addChild(selectedId) }
      if (e.key === 'Enter') { e.preventDefault(); addSibling(selectedId) }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const node = nodesRef.current.find(n => n.id === selectedId)
        if (node?.parentId) { e.preventDefault(); deleteNode(selectedId) }
      }
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, editingId, finishEdit, addChild, addSibling, deleteNode])

  // ── 채팅 스크롤 ──────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, aiStreamText])

  // ── AI 메시지 전송 ────────────────────────────────
  const sendAiMessage = useCallback(async (userMsg: string) => {
    if (!userMsg.trim() || isAiLoading) return

    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: userMsg }]
    setChatHistory(newHistory)
    setChatInput('')
    setIsAiLoading(true)
    setAiStreamText('')

    const prompt = buildAiPrompt(serializeTree(nodesRef.current), userMsg)

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
          provider: aiProvider, model: aiModel, api_key: aiApiKey,
          base_url: aiProvider === 'ollama' ? ollamaUrl : undefined,
          prompt, context: '',
        }),
        signal: controller.signal,  // 언마운트·중복 요청 시 중단
      })
      if (!res.ok) throw new Error(`서버 오류 ${res.status}`)
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
            applyAiAction(accumulated.trim(), newHistory)
            setAiStreamText('')
            break
          }
          try {
            const msg = JSON.parse(raw)
            if (msg.error) throw new Error(msg.error)
            if (msg.text) { accumulated += msg.text; setAiStreamText(accumulated) }
          } catch {}
        }
      }
    } catch (err) {
      // AbortError는 의도적 취소 — 사용자에게 표시하지 않음
      if (err instanceof Error && err.name !== 'AbortError') {
        setChatHistory(prev => [...prev, { role: 'system', content: `❌ ${err.message}` }])
      }
    } finally {
      reader?.cancel().catch(() => {})  // 스트림 정리
      setIsAiLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatHistory, aiProvider, aiModel, aiApiKey, ollamaUrl, isAiLoading])

  // ── AI 액션 적용 ──────────────────────────────────
  function applyAiAction(jsonText: string, history: ChatMsg[]) {
    try {
      const match = jsonText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('JSON 없음')
      const action = JSON.parse(match[0])

      if (action.action === 'set_all') {
        if (!Array.isArray(action.nodes)) throw new Error('nodes 배열 없음')
        const newNodes: MindNode[] = action.nodes.map((n: { id?: string; text?: string; parentId?: string | null }) => ({
          id: n.id || crypto.randomUUID(),
          text: (n.text || t.blocks.mindmap.newNode).slice(0, 30),
          parentId: n.parentId ?? null,
          collapsed: false,
        }))
        setNodes(newNodes)
        // 새 트리 생성 시 위치 오버라이드 초기화
        setNodePosOverrides(new Map())
        setChatHistory([...history, { role: 'assistant', content: `✅ ${t.blocks.mindmap.aiCreated.replace('{count}', String(newNodes.length))}` }])

      } else if (action.action === 'add_children') {
        const targetId = action.targetId as string
        const parent = nodesRef.current.find(n => n.id === targetId)
        if (!parent) throw new Error(`노드 "${targetId}" 없음`)
        if (!Array.isArray(action.nodes)) throw new Error('nodes 배열 없음')
        const newNodes: MindNode[] = action.nodes.map((n: { text?: string }) => ({
          id: crypto.randomUUID(),
          text: (n.text || t.blocks.mindmap.newNode).slice(0, 30),
          parentId: targetId,
          collapsed: false,
        }))
        setNodes(prev => [...prev, ...newNodes])
        setChatHistory([...history, { role: 'assistant', content: `✅ ${t.blocks.mindmap.aiAdded.replace('{count}', String(newNodes.length)).replace('{name}', parent.text)}` }])

      } else if (action.action === 'rename') {
        const newText = (action.text as string || '').slice(0, 30)
        setNodes(prev => prev.map(n => n.id === action.targetId ? { ...n, text: newText } : n))
        setChatHistory([...history, { role: 'assistant', content: `✅ ${t.blocks.mindmap.aiRenamed.replace('{name}', newText)}` }])

      } else {
        throw new Error(`알 수 없는 액션: ${action.action}`)
      }
    } catch {
      const fallback = jsonText.length > 300 ? jsonText.slice(0, 300) + '…' : jsonText
      setChatHistory([...history, { role: 'assistant', content: fallback || t.blocks.mindmap.aiEmptyResponse }])
    }
  }

  // ── 전역 AI → 마인드맵 적용 연동 ─────────────────
  // 매 렌더마다 최신 함수/상태로 ref 동기화 (stale closure 방지)
  // Python으로 치면: def on_render(self): self._refs.update(chat_history=..., apply=...)
  chatHistoryRef.current = chatHistory
  applyAiActionRef.current = applyAiAction

  // 마운트 시 전역 활성 마인드맵으로 등록 + 이벤트 리스너 등록
  // GlobalAIChatButton의 🧠 모드 '적용' 버튼이 'ai-apply-mindmap' 이벤트 발행
  // + AI 블록 선택/해제 인디케이터 (파란 링 + 배지)
  // Python으로 치면: def on_mount(self): global _active; _active = self; window.on(...)
  useEffect(() => {
    _activeMindmapBlockId = block.id
    function handleGlobalMindmap(e: Event) {
      if (_activeMindmapBlockId !== block.id) return
      applyAiActionRef.current((e as CustomEvent<string>).detail, chatHistoryRef.current)
    }
    function handleSelect(e: Event) {
      const { blockId } = (e as CustomEvent<{ blockId: string; blockType: string }>).detail
      setIsAiTarget(blockId === block.id)
    }
    function handleDeselect() { setIsAiTarget(false) }
    window.addEventListener('ai-apply-mindmap', handleGlobalMindmap)
    window.addEventListener('ai-block-select', handleSelect)
    window.addEventListener('ai-block-deselect', handleDeselect)
    return () => {
      window.removeEventListener('ai-apply-mindmap', handleGlobalMindmap)
      window.removeEventListener('ai-block-select', handleSelect)
      window.removeEventListener('ai-block-deselect', handleDeselect)
      if (_activeMindmapBlockId === block.id) _activeMindmapBlockId = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  // ── 렌더 ──────────────────────────────────────────
  return (
    <div
      data-ai-block="mindmap"
      onClick={() => window.dispatchEvent(new CustomEvent('ai-block-select', { detail: { blockId: block.id, blockType: 'mindmap' } }))}
      className={`mindmap-block relative rounded-xl overflow-hidden select-none transition-shadow ${isAiTarget ? 'border-2 border-violet-400 ring-2 ring-violet-400 ring-offset-1 shadow-violet-100 shadow-md' : 'border border-black/8 dark:border-white/8 shadow-sm'}`}
      style={{ height: '580px' }}
    >
      {/* ── AI 대상 배지 ──────────────────────────
          isAiTarget일 때만 표시 — 보라색 링과 함께 우상단에 위치
          Python으로 치면: if self.is_ai_target: render Badge('🤖 AI 대상') */}
      {isAiTarget && (
        <span className="absolute top-1.5 right-1.5 z-10 text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full pointer-events-none select-none">
          {t.blocks.mindmap.aiTarget}
        </span>
      )}
      <div className="flex h-full">

        {/* ══ 캔버스 영역 ══ */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden dot-grid-bg dark:bg-[#191919]"
        >
          {/* 헤더 툴바 */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">{t.blocks.mindmap.mapLabel}</span>
            {/* 읽기/편집 모드 토글 버튼 */}
            <button
              onClick={() => { setReadOnly(v => !v); setEditingId(null); setNodeCtxMenu(null) }}
              title={readOnly ? t.blocks.mindmap.readModeTitle : t.blocks.mindmap.editModeTitle}
              className={readOnly
                ? 'text-xs px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-gray-800/80 border border-black/8 dark:border-white/10 text-gray-400 hover:text-gray-700 hover:bg-white transition-colors backdrop-blur-sm'
                : 'text-xs px-2.5 py-0.5 rounded-full bg-stone-700 border border-stone-700 text-white hover:bg-stone-600 transition-colors'}
            >
              {readOnly ? t.blocks.mindmap.readLabel : t.blocks.mindmap.editLabel}
            </button>
          </div>

          {/* 줌 컨트롤 — 읽기 모드에서 숨김 (휠로만 줌 가능) */}
          {!readOnly && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              <button
                onClick={() => setZoom(z => Math.min(4, z * 1.2))}
                className="w-7 h-7 rounded-full bg-white/80 dark:bg-gray-800/80 border border-black/8 dark:border-white/10 text-gray-500 dark:text-gray-400 flex items-center justify-center text-sm hover:bg-white dark:hover:bg-gray-700 backdrop-blur-sm transition-colors"
                title={t.blocks.mindmap.zoomIn}
              >+</button>
              <button
                onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}
                className="w-7 h-7 rounded-full bg-white/80 dark:bg-gray-800/80 border border-black/8 dark:border-white/10 text-gray-500 dark:text-gray-400 flex items-center justify-center text-sm hover:bg-white dark:hover:bg-gray-700 backdrop-blur-sm transition-colors"
                title={t.blocks.mindmap.zoomOut}
              >−</button>
              <button
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
                className="px-2.5 h-7 rounded-full bg-white/80 dark:bg-gray-800/80 border border-black/8 dark:border-white/10 text-gray-500 dark:text-gray-400 text-xs hover:bg-white dark:hover:bg-gray-700 backdrop-blur-sm transition-colors"
                title={t.blocks.mindmap.resetView}
              >{t.blocks.mindmap.resetBtn}</button>
            </div>
          )}

          {/* SVG 캔버스 */}
          <svg
            width="100%"
            height="100%"
            style={{ cursor: isDraggingNode ? 'grabbing' : isPanning.current ? 'grabbing' : 'default' }}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

              {/* 배경 팬 영역 */}
              <rect
                x={-SVG_W * 10}
                y={-SVG_H * 10}
                width={SVG_W * 20}
                height={SVG_H * 20}
                fill="transparent"
                style={{ cursor: readOnly ? 'default' : 'grab' }}
                onMouseDown={e => {
                  e.preventDefault()
                  if (readOnly) return  // 읽기 모드: 팬 비활성화
                  isPanning.current = true
                  panStart.current = {
                    x: e.clientX - panRef.current.x,
                    y: e.clientY - panRef.current.y,
                  }
                  setSelectedId(null)
                  setNodeCtxMenu(null)
                }}
              />

              {/* 연결선 — getFinalPos 사용으로 드래그 후에도 올바르게 연결됨 */}
              {nodes.map(node => {
                if (!node.parentId) return null
                const from = getFinalPos(node.parentId)
                const to = getFinalPos(node.id)
                if (!from || !to) return null
                const color = DEPTH_COLORS[getDepth(nodes, node.parentId) % DEPTH_COLORS.length]
                return (
                  <path
                    key={`edge-${node.id}`}
                    d={bezierPath(from, to)}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    opacity={0.5}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none' }}
                  />
                )
              })}

              {/* 노드 — 드래그 중인 노드를 맨 마지막에 렌더링해 다른 노드 위에 표시 */}
              {sortedNodes.map(node => {
                const pos = getFinalPos(node.id)
                if (!pos) return null

                const depth = getDepth(nodes, node.id)
                const color = DEPTH_COLORS[depth % DEPTH_COLORS.length]
                const isRoot = !node.parentId
                const isSelected = selectedId === node.id
                const isEditing = editingId === node.id
                const hasChildren = nodes.some(n => n.parentId === node.id)
                const isBeingDragged = draggingNode.current?.nodeId === node.id && isDraggingNode

                const nodeW = isRoot ? 130 : Math.max(80, 120 - depth * 8)
                const nodeH = isRoot ? 48 : Math.max(30, 42 - depth * 4)
                const fontSize = isRoot ? 14 : Math.max(10, 13 - depth)
                const maxChars = isRoot ? 10 : 9
                const displayText = node.text.length > maxChars
                  ? node.text.slice(0, maxChars) + '…'
                  : node.text

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    style={{ cursor: isBeingDragged ? 'grabbing' : 'grab' }}
                    // 노드 그룹 mousedown — 드래그 준비 (클릭과 구분은 hasMoved로)
                    onMouseDown={e => {
                      e.stopPropagation() // 배경 팬 방지
                      if (e.button !== 0) return
                      // 읽기 모드: 드래그 비활성화 (클릭 선택만 허용)
                      if (readOnly) { setSelectedId(node.id); return }
                      const currentPos = getFinalPos(node.id)
                      draggingNode.current = {
                        nodeId: node.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origX: currentPos?.x ?? 0,
                        origY: currentPos?.y ?? 0,
                        hasMoved: false,
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation()
                      if (readOnly) return
                      setEditingId(node.id)
                      setEditingText(node.text)
                    }}
                    onContextMenu={e => {
                      e.preventDefault()
                      if (readOnly) return
                      e.stopPropagation()
                      setNodeCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
                    }}
                  >
                    {/* 선택 글로우 */}
                    {isSelected && (
                      <ellipse
                        rx={nodeW / 2 + 7}
                        ry={nodeH / 2 + 7}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                        opacity={0.3}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}

                    {/* 드래그 중 그림자 */}
                    {isBeingDragged && (
                      <rect
                        x={-nodeW / 2 + 3}
                        y={-nodeH / 2 + 4}
                        width={nodeW}
                        height={nodeH}
                        rx={nodeH / 2}
                        ry={nodeH / 2}
                        fill={color}
                        opacity={0.15}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}

                    {/* 노드 배경 */}
                    <rect
                      x={-nodeW / 2}
                      y={-nodeH / 2}
                      width={nodeW}
                      height={nodeH}
                      rx={nodeH / 2}
                      ry={nodeH / 2}
                      fill={isRoot ? color : '#fafaf9'}
                      stroke={color}
                      strokeWidth={isRoot ? 0 : isSelected ? 2.5 : 1.8}
                      style={{
                        filter: isBeingDragged
                          ? `drop-shadow(0 4px 12px ${color}70)`
                          : isSelected
                          ? `drop-shadow(0 2px 6px ${color}50)`
                          : undefined,
                      }}
                    />

                    {/* 루트 하이라이트 */}
                    {isRoot && (
                      <rect
                        x={-nodeW / 2}
                        y={-nodeH / 2}
                        width={nodeW}
                        height={nodeH / 2}
                        rx={nodeH / 2}
                        ry={nodeH / 2}
                        fill="white"
                        opacity={0.15}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}

                    {/* 텍스트 */}
                    {!isEditing && (
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={fontSize}
                        fontWeight={isRoot ? 'bold' : 'normal'}
                        fill={isRoot ? 'white' : color}
                        fontFamily="inherit"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {displayText}
                      </text>
                    )}

                    {/* 접기/펼치기 버튼 */}
                    {hasChildren && !isEditing && (
                      <g
                        transform={`translate(${nodeW / 2 + 10}, 0)`}
                        onClick={e => { e.stopPropagation(); toggleCollapse(node.id) }}
                        style={{ cursor: 'pointer' }}
                      >
                        <circle r={9} fill={color} opacity={0.85} />
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={11}
                          fontWeight="bold"
                          fill="white"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {node.collapsed ? '+' : '−'}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          {/* 인라인 편집 오버레이 */}
          {editingId && (() => {
            const pos = getFinalPos(editingId)
            if (!pos) return null
            const depth = getDepth(nodes, editingId)
            const color = DEPTH_COLORS[depth % DEPTH_COLORS.length]
            return (
              <div
                style={{
                  position: 'absolute',
                  left: pos.x * zoom + pan.x,
                  top: pos.y * zoom + pan.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 50,
                }}
              >
                <input
                  autoFocus
                  value={editingText}
                  onChange={e => setEditingText(e.target.value)}
                  onBlur={finishEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); finishEdit() }
                    if (e.key === 'Escape') { setEditingId(null); setEditingText('') }
                  }}
                  className="px-3 py-1.5 rounded-full text-sm outline-none text-center bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                  style={{
                    minWidth: '90px', maxWidth: '200px',
                    border: `2.5px solid ${color}`,
                    boxShadow: `0 0 0 3px ${color}30`,
                    fontSize: depth === 0 ? 14 : 12,
                    fontWeight: depth === 0 ? 'bold' : 'normal',
                  }}
                />
              </div>
            )
          })()}

          {/* 단축키 안내 — 편집 모드에서만 표시 */}
          {!readOnly && (
            <div className="absolute bottom-2 left-2 text-xs text-gray-400 dark:text-gray-600 select-none pointer-events-none">
              {t.blocks.mindmap.shortcutHint}
            </div>
          )}

          {/* 노드 컨텍스트 메뉴 */}
          {nodeCtxMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNodeCtxMenu(null)} />
              <div
                className="fixed z-50 bg-white/95 dark:bg-gray-800/95 border border-black/8 dark:border-white/8 rounded-xl shadow-lg backdrop-blur-sm py-1 min-w-40 text-sm"
                style={{ left: nodeCtxMenu.x, top: nodeCtxMenu.y }}
              >
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                  onClick={() => { addChild(nodeCtxMenu.nodeId); setNodeCtxMenu(null) }}
                >{t.blocks.mindmap.addChildMenu}</button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                  onClick={() => {
                    const node = nodes.find(n => n.id === nodeCtxMenu.nodeId)
                    if (node) { setEditingId(node.id); setEditingText(node.text) }
                    setNodeCtxMenu(null)
                  }}
                >{t.blocks.mindmap.editMenu}</button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                  onClick={() => {
                    const node = nodes.find(n => n.id === nodeCtxMenu.nodeId)
                    if (node) {
                      setChatOpen(true)
                      setChatInput(`"${node.text}" 노드를 더 구체적으로 발전시켜줘. 자식 노드 3~5개를 추가해줘. targetId는 "${node.id}"`)
                    }
                    setNodeCtxMenu(null)
                  }}
                >{t.blocks.mindmap.aiExpandMenu}</button>
                {nodes.find(n => n.id === nodeCtxMenu.nodeId)?.parentId && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                      onClick={() => { deleteNode(nodeCtxMenu.nodeId); setNodeCtxMenu(null) }}
                    >{t.blocks.mindmap.deleteMenu}</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* ══ AI 채팅 패널 — 통합 GlobalAIChatButton으로 대체되어 숨김 ══ */}
        {false && chatOpen && !readOnly && (
          <div className="w-72 flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
            {/* 헤더 */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🤖</span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t.blocks.mindmap.aiChatTitle}</span>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none w-6 h-6 flex items-center justify-center"
              >×</button>
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {chatHistory.length === 0 && !isAiLoading && (
                <div className="text-center py-6 space-y-2">
                  <div className="text-2xl">🧠</div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                    {t.blocks.mindmap.aiChatHint.split('\n').map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : null}</span>)}
                  </p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={
                    msg.role === 'user'
                      ? 'max-w-[88%] px-3 py-2 rounded-2xl rounded-tr-sm text-xs bg-blue-500 text-white leading-relaxed'
                      : msg.role === 'system'
                      ? 'max-w-[88%] px-3 py-2 rounded-2xl text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 leading-relaxed'
                      : 'max-w-[88%] px-3 py-2 rounded-2xl rounded-tl-sm text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 leading-relaxed'
                  }>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[88%] px-3 py-2 rounded-2xl rounded-tl-sm text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 leading-relaxed">
                    {aiStreamText
                      ? (aiStreamText.length > 200 ? aiStreamText.slice(0, 200) + '…' : aiStreamText)
                      : <span className="flex items-center gap-1">
                          <span className="animate-pulse">●</span>
                          <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                          <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                        </span>
                    }
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 빠른 명령어 */}
            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1 shrink-0">
              {t.blocks.mindmap.quickCommands.map(cmd => (
                <button
                  key={cmd}
                  onClick={() => setChatInput(cmd)}
                  disabled={isAiLoading}
                  className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >{cmd}</button>
              ))}
            </div>

            {/* 입력창 */}
            <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0 space-y-1.5">
              {selectedId && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="truncate">
                    {t.blocks.mindmap.selectedLabel} <span className="font-medium text-gray-600 dark:text-gray-300">{nodes.find(n => n.id === selectedId)?.text}</span>
                  </span>
                  <button
                    onClick={() => {
                      const node = nodes.find(n => n.id === selectedId)
                      if (node) setChatInput(`"${node.text}" 노드(targetId: "${node.id}")를 더 구체적으로 발전시켜줘. 자식 노드 3~5개를 추가해줘.`)
                    }}
                    className="shrink-0 text-purple-500 hover:text-purple-700 underline underline-offset-2"
                  >{t.blocks.mindmap.aiExpandBtn}</button>
                </div>
              )}
              <div className="flex gap-1.5">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(chatInput) }
                  }}
                  placeholder={t.blocks.mindmap.aiChatPlaceholder}
                  rows={2}
                  disabled={isAiLoading}
                  className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2 resize-none outline-none focus:border-blue-400 dark:focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                />
                <button
                  onClick={() => sendAiMessage(chatInput)}
                  disabled={isAiLoading || !chatInput.trim()}
                  className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >{isAiLoading ? '…' : t.blocks.mindmap.aiSend}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
