// =============================================
// src/components/editor/MermaidBlock.tsx
// 역할: Mermaid 다이어그램 블록 — 편집(textarea) ↔ 미리보기(SVG) 2모드
// content = raw Mermaid 문자열 (예: "flowchart LR\n  A --> B")
// Python으로 치면: class MermaidBlock: def render(self): mermaid.render(self.code)
// =============================================

'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

interface MermaidBlockProps {
  block: Block
  pageId: string
}

export default function MermaidBlock({ block, pageId }: MermaidBlockProps) {
  const { updateBlock } = usePageStore()

  // -----------------------------------------------
  // 편집 모드 초기값: 내용 비어있으면 바로 편집 모드로 시작
  // Python으로 치면: self.is_editing = not bool(block.content.strip())
  // -----------------------------------------------
  const [isEditing, setIsEditing] = useState(!block.content.trim())

  // 로컬 Mermaid 코드 (저장 전 실시간 편집용)
  // Python으로 치면: self.code = block.content
  const [code, setCode] = useState(block.content)

  // 렌더링된 SVG HTML 문자열
  // Python으로 치면: self.svg_html = ''
  const [svgHtml, setSvgHtml] = useState('')

  // 파싱 오류 메시지
  // Python으로 치면: self.error = ''
  const [error, setError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mermaid 렌더 시 고유 ID 생성 (React 18+ useId)
  // Python으로 치면: self.render_id = f"mermaid-{uuid4().hex}"
  const uid = useId().replace(/:/g, '')
  const renderId = `mermaid-render-${uid}`

  // -----------------------------------------------
  // Mermaid 코드 → SVG 비동기 변환
  // mermaid.render()는 Promise 반환 → async useEffect
  // Python으로 치면: async def render_mermaid(code): return await mermaid.render(id, code)
  // -----------------------------------------------
  useEffect(() => {
    if (!code.trim()) {
      setSvgHtml('')
      setError('')
      return
    }

    let cancelled = false

    async function renderDiagram() {
      try {
        // mermaid는 클라이언트 전용 → dynamic import
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        })
        const { svg } = await mermaid.render(renderId, code.trim())
        if (!cancelled) {
          setSvgHtml(svg)
          setError('')
        }
      } catch (e) {
        if (!cancelled) {
          setSvgHtml('')
          setError(e instanceof Error ? e.message.replace(/^Error:\s*/i, '') : '다이어그램 파싱 오류')
        }
      }
    }

    renderDiagram()
    return () => { cancelled = true }
  }, [code, renderId])

  // -----------------------------------------------
  // 편집 모드 진입 시 textarea 자동 포커스
  // Python으로 치면: if self.is_editing: self.textarea.focus()
  // -----------------------------------------------
  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus()
    }
  }, [isEditing])

  // -----------------------------------------------
  // 편집 완료 (blur): 스토어에 저장 후 미리보기로 전환
  // Python으로 치면: def on_blur(self): store.update(self.code); self.mode = 'preview'
  // -----------------------------------------------
  function handleBlur() {
    updateBlock(pageId, block.id, code)
    if (code.trim()) {
      setIsEditing(false)
    }
  }

  // -----------------------------------------------
  // 키보드 처리
  // Escape: 취소 후 미리보기, Enter: 저장 (Shift+Enter는 줄바꿈)
  // Python으로 치면: def on_key_down(self, key): ...
  // -----------------------------------------------
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      const saved = block.content
      setCode(saved)
      if (saved.trim()) setIsEditing(false)
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    }
  }

  // ── 편집 모드 렌더링 ─────────────────────────────
  if (isEditing) {
    return (
      <div className="rounded-xl border border-purple-300 bg-purple-50 p-3 space-y-2">

        {/* 헤더 라벨 */}
        <div className="flex items-center gap-1.5 text-xs text-purple-500 font-medium">
          <span>📊</span>
          <span>Mermaid 다이어그램</span>
        </div>

        {/* Mermaid 코드 입력 textarea */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={"flowchart LR\n  A[시작] --> B{조건}\n  B -->|Yes| C[완료]\n  B -->|No| D[취소]"}
          rows={6}
          spellCheck={false}
          className="w-full resize-y bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 outline-none focus:border-purple-400 placeholder:text-gray-300"
        />

        {/* 실시간 미리보기 (오류 없을 때만) */}
        {svgHtml && !error && (
          <div
            className="bg-white rounded-lg p-3 overflow-x-auto border border-purple-100"
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}

        {/* 파싱 오류 메시지 */}
        {error && (
          <p className="text-xs text-red-500 font-mono whitespace-pre-wrap">{error}</p>
        )}

        {/* 힌트 텍스트 */}
        <p className="text-xs text-purple-400">
          Enter 또는 포커스 이탈로 저장 · Escape로 취소 · Shift+Enter로 줄바꿈
        </p>
      </div>
    )
  }

  // ── 미리보기 모드 렌더링 ─────────────────────────
  // 클릭하면 편집 모드로 전환
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditing(true) }}
      className="group rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 py-3 px-4 cursor-pointer transition-colors"
      title="클릭하여 다이어그램 편집"
    >
      {svgHtml ? (
        // Mermaid SVG 렌더링 결과 출력
        <div
          className="overflow-x-auto flex justify-center"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      ) : error ? (
        // 오류 상태
        <p className="text-red-400 text-sm text-center font-mono">{error}</p>
      ) : (
        // 비어있는 다이어그램 블록 플레이스홀더
        <p className="text-gray-400 text-sm text-center select-none">
          📊 다이어그램을 입력하려면 클릭하세요 (Mermaid)
        </p>
      )}
    </div>
  )
}
