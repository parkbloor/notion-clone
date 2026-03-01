// =============================================
// src/components/editor/EmbedBlock.tsx
// 역할: URL 임베드 블록 — YouTube · Vimeo · 일반 iframe
// content JSON 포맷: { url: string }
// Python으로 치면: class EmbedBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useState, useRef, useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'
import type { Block } from '@/types/block'

// -----------------------------------------------
// 임베드 콘텐츠 JSON 인터페이스
// Python으로 치면: @dataclass class EmbedContent: url: str
// -----------------------------------------------
interface EmbedContent {
  url: string
}

interface EmbedBlockProps {
  block: Block
  pageId: string
  readOnly?: boolean
}

// -----------------------------------------------
// YouTube URL → 임베드 URL 변환
// watch?v=XXX, youtu.be/XXX, shorts/XXX → youtube.com/embed/XXX
// Python으로 치면: def to_youtube_embed(url: str) -> str | None: ...
// -----------------------------------------------
function toYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('?')[0]
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      // /watch?v=VIDEO_ID
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v')
        if (v) return `https://www.youtube.com/embed/${v}`
      }
      // 이미 /embed/ 형식
      if (u.pathname.startsWith('/embed/')) return url
      // /shorts/VIDEO_ID
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.replace('/shorts/', '').split('?')[0]
        if (id) return `https://www.youtube.com/embed/${id}`
      }
    }
  } catch {
    // URL 파싱 실패 → null 반환
  }
  return null
}

// -----------------------------------------------
// Vimeo URL → 임베드 URL 변환
// vimeo.com/VIDEO_ID → player.vimeo.com/video/VIDEO_ID
// Python으로 치면: def to_vimeo_embed(url: str) -> str | None: ...
// -----------------------------------------------
function toVimeoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'vimeo.com' || u.hostname === 'www.vimeo.com') {
      const id = u.pathname.slice(1).split('/')[0]
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
  } catch {
    // URL 파싱 실패
  }
  return null
}

// -----------------------------------------------
// URL → 임베드용 src 변환
// YouTube / Vimeo 전용 변환, 그 외는 그대로 반환
// Python으로 치면: def resolve_embed_src(url: str) -> str: ...
// -----------------------------------------------
export function resolveEmbedSrc(url: string): string {
  return toYouTubeEmbedUrl(url) ?? toVimeoEmbedUrl(url) ?? url
}

// -----------------------------------------------
// URL이 YouTube 또는 Vimeo인지 판별
// Python으로 치면: def is_media_embed(url: str) -> bool: ...
// -----------------------------------------------
export function isEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace('www.', '')
    return (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'vimeo.com'
    )
  } catch {
    return false
  }
}

export default function EmbedBlock({ block, pageId, readOnly = false }: EmbedBlockProps) {

  // 블록 content → { url } 파싱
  // Python으로 치면: content = json.loads(block.content) or {}
  const parsed: Partial<EmbedContent> = (() => {
    try { return JSON.parse(block.content) } catch { return {} }
  })()
  const savedUrl = parsed.url ?? ''

  const updateBlock = usePageStore(s => s.updateBlock)

  // URL 입력값 (아직 저장 전)
  const [inputUrl, setInputUrl] = useState('')
  // 에러 메시지
  const [error, setError] = useState('')
  // URL 변경 모드 (저장된 URL이 있어도 재입력 허용)
  const [isEditing, setIsEditing] = useState(false)
  // input ref (자동 포커스)
  const inputRef = useRef<HTMLInputElement>(null)

  // 편집 모드 전환 시 input 자동 포커스
  // Python으로 치면: if is_editing: input.focus()
  useEffect(() => {
    if ((isEditing || !savedUrl) && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing, savedUrl])

  // -----------------------------------------------
  // URL 저장 처리
  // Python으로 치면: def handle_save(self): validate → save
  // -----------------------------------------------
  function handleSave() {
    const trimmed = inputUrl.trim()
    if (!trimmed) {
      setError('URL을 입력해주세요')
      return
    }
    // URL 유효성 검사
    try {
      new URL(trimmed)
    } catch {
      setError('올바른 URL 형식이 아닙니다')
      return
    }
    setError('')
    updateBlock(pageId, block.id, JSON.stringify({ url: trimmed }))
    setIsEditing(false)
    setInputUrl('')
  }

  // -----------------------------------------------
  // Enter 키로 저장
  // Python으로 치면: def on_key_down(e): if e.key == 'Enter': save()
  // -----------------------------------------------
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsEditing(false)
      setInputUrl('')
      setError('')
    }
  }

  // ── URL 없음: 입력 UI 표시 ─────────────────────
  if (!savedUrl || isEditing) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-gray-400 p-4 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          {/* 임베드 아이콘 */}
          <span className="text-xl">🔗</span>
          <p className="text-sm font-medium text-gray-600">
            URL 임베드
          </p>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          YouTube · Vimeo · 일반 웹페이지 URL을 붙여넣으세요
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="url"
            value={inputUrl}
            onChange={e => { setInputUrl(e.target.value); setError('') }}
            onKeyDown={handleKeyDown}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
          />
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            임베드
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={() => { setIsEditing(false); setInputUrl(''); setError('') }}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-1.5">{error}</p>
        )}
      </div>
    )
  }

  // ── URL 있음: iframe 표시 ─────────────────────
  // YouTube / Vimeo → 전용 embed URL로 변환, 그 외 그대로
  const embedSrc = resolveEmbedSrc(savedUrl)
  // YouTube / Vimeo는 16:9 비율로 표시, 그 외 고정 높이
  const isVideoEmbed = toYouTubeEmbedUrl(savedUrl) !== null || toVimeoEmbedUrl(savedUrl) !== null

  return (
    <div className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">

      {/* iframe 컨테이너 — YouTube/Vimeo: 16:9 비율 패딩, 일반: h-80 */}
      {/* Python으로 치면: ratio = '56.25%' if video else '320px' */}
      <div
        className={isVideoEmbed ? 'relative w-full' : 'w-full'}
        style={isVideoEmbed ? { paddingTop: '56.25%' } : { height: '320px' }}
      >
        <iframe
          src={embedSrc}
          title="임베드 콘텐츠"
          // YouTube: allow autoplay(정책), fullscreen 허용
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          // 절대 위치로 컨테이너를 꽉 채움
          className={isVideoEmbed
            ? 'absolute inset-0 w-full h-full border-none'
            : 'w-full h-full border-none'
          }
          // sandbox 속성은 너무 제한적이어서 제거 (YouTube 재생 막힘)
        />
      </div>

      {/* URL 하단 표시 + 변경/제거 버튼 (hover 시 표시) */}
      {!readOnly && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between px-3 py-1.5 bg-white border-t border-gray-100">
          {/* 저장된 URL 표시 (말줄임) */}
          <span className="text-xs text-gray-400 truncate max-w-xs" title={savedUrl}>
            {savedUrl}
          </span>
          <div className="flex gap-1 shrink-0 ml-2">
            {/* URL 변경 */}
            <button
              type="button"
              onClick={() => { setIsEditing(true); setInputUrl(savedUrl) }}
              className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              변경
            </button>
            {/* 임베드 제거 */}
            <button
              type="button"
              onClick={() => updateBlock(pageId, block.id, '')}
              className="px-2 py-0.5 text-xs text-red-400 bg-red-50 rounded hover:bg-red-100 transition-colors"
            >
              제거
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
