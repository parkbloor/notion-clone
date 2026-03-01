// =============================================
// src/components/editor/VideoBlock.tsx
// 역할: 로컬 비디오 파일 업로드 + 재생 블록
// 자동재생/반복은 settingsStore의 videoAutoplay / videoLoop 플러그인 설정 따름
// Python으로 치면: class VideoBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState, useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { api } from '@/lib/api'
import type { Block } from '@/types/block'

// 비디오 콘텐츠 JSON 포맷
// Python으로 치면: @dataclass class VideoContent: src: str
interface VideoContent {
  src: string
}

// 허용 비디오 확장자 (백엔드와 동일하게)
// Python으로 치면: ALLOWED = {'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'}
const ALLOWED_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'])

interface VideoBlockProps {
  block: Block
  pageId: string
  readOnly?: boolean
}

export default function VideoBlock({ block, pageId, readOnly = false }: VideoBlockProps) {

  // 블록 내용 파싱 — src 추출
  // Python으로 치면: content = json.loads(block.content) or {}
  const parsed: Partial<VideoContent> = (() => {
    try { return JSON.parse(block.content) } catch { return {} }
  })()
  const src = parsed.src ?? ''

  // 전역 스토어
  const updateBlock = usePageStore(s => s.updateBlock)
  const plugins = useSettingsStore(s => s.plugins)

  // 파일 드래그 오버 상태
  const [isDragOver, setIsDragOver] = useState(false)
  // 업로드 진행 중
  const [isUploading, setIsUploading] = useState(false)
  // 업로드 에러 메시지
  const [uploadError, setUploadError] = useState('')
  // 업로드 진행률 (0~100, 정확한 값이 아닌 시뮬레이션)
  const [progress, setProgress] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // -----------------------------------------------
  // 플러그인 설정 변경 시 video 엘리먼트에 즉시 반영
  // Python으로 치면: self.on_settings_change → video.autoplay = ...
  // -----------------------------------------------
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    // autoplay 속성은 DOM 속성이 아닌 JS 프로퍼티로 제어
    v.loop = plugins.videoLoop
  }, [plugins.videoLoop])

  // -----------------------------------------------
  // 파일 유효성 검사
  // Python으로 치면: def validate_file(file): check ext + size
  // -----------------------------------------------
  function validateFile(file: File): string | null {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      return `지원하지 않는 형식입니다. 허용: ${[...ALLOWED_EXTS].join(', ')}`
    }
    if (file.size > 500 * 1024 * 1024) {
      return `파일 크기가 500MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(0)}MB)`
    }
    return null
  }

  // -----------------------------------------------
  // 파일 업로드 처리
  // Python으로 치면: async def upload(self, file): url = await api.upload_video(...)
  // -----------------------------------------------
  async function handleFile(file: File) {
    const err = validateFile(file)
    if (err) { setUploadError(err); return }

    setIsUploading(true)
    setUploadError('')
    setProgress(10)

    // 진행률 시뮬레이션 (실제 스트리밍 대신 타이머 사용)
    const timer = setInterval(() => {
      setProgress(p => p < 85 ? p + 5 : p)
    }, 300)

    try {
      const url = await api.uploadVideo(pageId, file)
      clearInterval(timer)
      setProgress(100)
      // 블록 content에 JSON으로 저장
      // Python으로 치면: block.content = json.dumps({'src': url})
      updateBlock(pageId, block.id, JSON.stringify({ src: url }))
    } catch (e: unknown) {
      clearInterval(timer)
      setUploadError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  // -----------------------------------------------
  // 파일 input 변경 이벤트
  // Python으로 치면: def on_file_selected(self, event): self.upload(event.files[0])
  // -----------------------------------------------
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // input 초기화 (같은 파일 재선택 허용)
    e.target.value = ''
  }

  // ── 드래그앤드롭 핸들러 ───────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }
  function handleDragLeave() { setIsDragOver(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ── 비디오 제거 ──────────────────────────────
  // Python으로 치면: def remove_video(self): block.content = ''
  function handleRemove() {
    updateBlock(pageId, block.id, '')
  }

  // ── src 없음: 업로드 UI 표시 ─────────────────
  if (!src) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative flex flex-col items-center justify-center gap-3',
          'rounded-xl border-2 border-dashed py-10 transition-colors select-none',
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400',
        ].join(' ')}
      >
        {/* 업로드 중 진행 바 */}
        {isUploading && (
          <div className="absolute inset-x-4 top-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-blue-400 transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <span className="text-3xl">{isUploading ? '⏳' : '🎬'}</span>

        {isUploading ? (
          <p className="text-sm text-gray-500">업로드 중... {progress}%</p>
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">
                비디오 파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                MP4 · WebM · OGG · MOV · AVI · MKV  /  최대 500MB
              </p>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                파일 선택
              </button>
            )}
          </>
        )}

        {uploadError && (
          <p className="text-xs text-red-500 mt-1">{uploadError}</p>
        )}

        {/* hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.webm,.ogg,.mov,.avi,.mkv,video/*"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    )
  }

  // ── src 있음: 비디오 플레이어 표시 ───────────────
  return (
    <div className="group relative rounded-xl overflow-hidden bg-black">
      {/* HTML5 비디오 플레이어 */}
      {/* Python으로 치면: video = QVideoWidget(src=src, autoplay=..., loop=...) */}
      <video
        ref={videoRef}
        src={src}
        controls
        // autoplay는 muted 없이는 브라우저가 차단함 (정책)
        autoPlay={plugins.videoAutoplay}
        loop={plugins.videoLoop}
        muted={plugins.videoAutoplay}  // autoplay 활성 시 음소거로 시작 (브라우저 정책)
        playsInline
        className="w-full max-h-120 object-contain"
        onError={() => setUploadError('비디오를 재생할 수 없습니다.')}
      />

      {/* 재생 설정 뱃지 (autoplay / loop 상태 표시) */}
      {(plugins.videoAutoplay || plugins.videoLoop) && (
        <div className="absolute top-2 left-2 flex gap-1">
          {plugins.videoAutoplay && (
            <span className="px-1.5 py-0.5 text-xs bg-black/60 text-white rounded">
              ▶ 자동재생
            </span>
          )}
          {plugins.videoLoop && (
            <span className="px-1.5 py-0.5 text-xs bg-black/60 text-white rounded">
              🔁 반복
            </span>
          )}
        </div>
      )}

      {/* 비디오 제거 버튼 (hover 시 표시) */}
      {!readOnly && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-black/60 text-white rounded hover:bg-black/80"
          title="비디오 제거"
        >
          ✕ 제거
        </button>
      )}

      {uploadError && (
        <p className="absolute bottom-2 left-2 text-xs text-red-400 bg-black/60 px-2 py-1 rounded">
          {uploadError}
        </p>
      )}
    </div>
  )
}
