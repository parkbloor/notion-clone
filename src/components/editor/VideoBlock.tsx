// =============================================
// src/components/editor/VideoBlock.tsx
// 역할: 로컬 비디오 파일 업로드 + 재생 블록 + 우측 핸들 너비 조절
// 자동재생/반복은 settingsStore의 videoAutoplay / videoLoop 플러그인 설정 따름
// Python으로 치면: class VideoBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState, useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { api } from '@/lib/api'
import type { Block } from '@/types/block'
import { useLocale } from '@/locales'

// 비디오 콘텐츠 JSON 포맷
// Python으로 치면: @dataclass class VideoContent: src: str; width: int | None
interface VideoContent {
  src: string
  width?: number
}

// 허용 비디오 확장자 (백엔드와 동일하게)
// Python으로 치면: ALLOWED = {'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'}
const ALLOWED_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'])

interface VideoBlockProps {
  block: Block
  pageId: string
  readOnly?: boolean
}

// content 파싱 헬퍼
// JSON 포맷({ src, width? })만 유효하게 처리, 그 외(Tiptap HTML 등)는 빈 src 반환
// Python으로 치면: def parse_content(s): return json.loads(s) if s.startswith('{') else {}
function parseContent(content: string): VideoContent {
  if (!content) return { src: '' }
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed.src === 'string') return parsed
  } catch {}
  // JSON이 아닌 경우(예: Tiptap HTML <p></p>) → 빈 src 반환 (upload UI 표시)
  // 주의: src: content로 fallback하면 <p></p>가 video src로 사용돼 "재생 불가" 에러 발생
  return { src: '' }
}

export default function VideoBlock({ block, pageId, readOnly = false }: VideoBlockProps) {
  const t = useLocale()

  const updateBlock = usePageStore(s => s.updateBlock)
  const updateBlockCanvas = usePageStore(s => s.updateBlockCanvas)
  const plugins = useSettingsStore(s => s.plugins)

  // content에서 src, 저장된 너비 파싱
  // Python으로 치면: src, saved_width = parse_content(block.content)
  const { src, width: savedWidth } = parseContent(block.content)

  // 리사이즈 드래그 중 여부
  // Python으로 치면: is_resizing = False
  const [isResizing, setIsResizing] = useState(false)
  // 리사이즈 중 임시 너비 (mousemove마다 갱신)
  // Python으로 치면: local_width: int | None = None
  const [localWidth, setLocalWidth] = useState<number | undefined>(undefined)

  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [progress, setProgress] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // 컨테이너 DOM 참조 — 리사이즈 시작 시점 실제 너비 측정용
  // Python으로 치면: container_ref = None
  const containerRef = useRef<HTMLDivElement>(null)
  // 리사이즈 핸들러 중복 등록 방지용 ref
  const isResizingRef = useRef(false)
  // 언마운트 시 리사이즈 리스너 정리용 ref
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  // 업로드 진행 타이머 ref — 언마운트 시 정리
  const uploadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 언마운트 시 남은 이벤트 리스너 및 타이머 정리
  useEffect(() => () => {
    resizeCleanupRef.current?.()
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current)
  }, [])

  // -----------------------------------------------
  // 실제 렌더링 너비: 리사이즈 중에는 localWidth, 아닐 때는 savedWidth
  // Python으로 치면: display_width = local_width if is_resizing else saved_width
  // -----------------------------------------------
  const displayWidth = isResizing ? localWidth : savedWidth

  // -----------------------------------------------
  // 플러그인 설정 변경 시 video 엘리먼트에 즉시 반영
  // Python으로 치면: self.on_settings_change → video.loop = ...
  // -----------------------------------------------
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.loop = plugins.videoLoop
  }, [plugins.videoLoop])

  // -----------------------------------------------
  // content를 JSON으로 직렬화하여 저장
  // 캔버스 모드에서는 canvasW도 동기화 (블록 컨테이너 크기 반영)
  // Python으로 치면: def save_content(src, width=None): update_block(...)
  // -----------------------------------------------
  function saveContent(newSrc: string, newWidth?: number) {
    const data: VideoContent = { src: newSrc }
    if (newWidth !== undefined) data.width = newWidth
    updateBlock(pageId, block.id, JSON.stringify(data))
    // 캔버스 모드에서 영상 너비 변경 시 캔버스 블록 컨테이너 너비도 동기화
    // Python으로 치면: if block.canvas_x is not None and new_width: update_canvas(w=new_width)
    if (newWidth !== undefined && block.canvasX !== undefined) {
      updateBlockCanvas(pageId, block.id, { w: newWidth })
    }
  }

  // -----------------------------------------------
  // 파일 유효성 검사
  // Python으로 치면: def validate_file(file): check ext + size
  // -----------------------------------------------
  function validateFile(file: File): string | null {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      return t.blocks.video.formatError
    }
    if (file.size > 500 * 1024 * 1024) {
      return t.blocks.video.sizeError
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
    // ref에 저장해 언마운트 시에도 정리 가능하게 함
    uploadTimerRef.current = setInterval(() => {
      setProgress(p => p < 85 ? p + 5 : p)
    }, 300)

    try {
      const url = await api.uploadVideo(pageId, file)
      if (uploadTimerRef.current) { clearInterval(uploadTimerRef.current); uploadTimerRef.current = null }
      setProgress(100)
      saveContent(url, savedWidth)
    } catch (e: unknown) {
      if (uploadTimerRef.current) { clearInterval(uploadTimerRef.current); uploadTimerRef.current = null }
      setUploadError(e instanceof Error ? e.message : t.blocks.video.uploadError)
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

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

  function handleRemove() {
    updateBlock(pageId, block.id, '')
  }

  // -----------------------------------------------
  // 리사이즈 핸들 마우스다운 → 드래그로 너비 조절
  // Python으로 치면:
  //   def on_resize_start(event):
  //       start_x = event.clientX
  //       start_width = container.offsetWidth
  //       document.onmousemove = lambda e: set_width(start_width + e.clientX - start_x)
  //       document.onmouseup = lambda e: save(final_width)
  // -----------------------------------------------
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    // 이미 리사이즈 중이면 중복 등록 방지
    if (isResizingRef.current) return
    isResizingRef.current = true

    // 리사이즈 시작 시점의 실제 컨테이너 너비, 부모 최대 너비 측정
    const startWidth = containerRef.current?.offsetWidth ?? (savedWidth ?? 560)
    // 부모 너비를 상한으로 사용 (본문 초과 방지)
    // Python으로 치면: max_width = container.parent.offsetWidth or float('inf')
    const maxWidth = containerRef.current?.parentElement?.offsetWidth ?? Infinity
    const startX = e.clientX

    setLocalWidth(startWidth)
    setIsResizing(true)

    // mousemove: delta만큼 너비 업데이트 (최소 120px, 최대 부모 너비)
    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.min(maxWidth, Math.max(120, startWidth + (ev.clientX - startX)))
      setLocalWidth(newWidth)
    }

    // mouseup: 최종 너비를 스토어에 저장하고 리사이즈 종료
    function onMouseUp(ev: MouseEvent) {
      cleanup()
      const finalWidth = Math.min(maxWidth, Math.max(120, startWidth + (ev.clientX - startX)))
      setLocalWidth(finalWidth)
      setIsResizing(false)
      saveContent(src, finalWidth)
    }

    function cleanup() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      isResizingRef.current = false
      resizeCleanupRef.current = null
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    resizeCleanupRef.current = cleanup
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
          <p className="text-sm text-gray-500">{t.blocks.video.uploading} {progress}%</p>
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">
                {t.blocks.video.instruction}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {t.blocks.video.formatInfo}
              </p>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {t.blocks.video.chooseFile}
              </button>
            )}
          </>
        )}

        {uploadError && (
          <p className="text-xs text-red-500 mt-1">{uploadError}</p>
        )}

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

  // ── src 있음: 비디오 플레이어 + 리사이즈 핸들 ──
  return (
    <>
      {/* -----------------------------------------------
          리사이즈 중 전체 화면 오버레이로 커서 스타일 고정
          마우스가 컨테이너 밖으로 나가도 col-resize 커서 유지
          Python으로 치면: if is_resizing: show_overlay()
          ----------------------------------------------- */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      {/* 비디오 컨테이너
          inline-block: 실제 너비만큼만 차지 (핸들이 컨테이너 오른쪽 끝에 위치)
          max-w-full: 부모 너비를 초과하지 않음 */}
      <div
        ref={containerRef}
        className="relative group/vid my-1 inline-block"
        style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}
      >
        {/* HTML5 비디오 플레이어
            width:100% → 컨테이너 꽉 채움
            height:auto (기본값) → 브라우저가 원본 비율 그대로 유지
            Python으로 치면: video = QVideoWidget(src=src, autoplay=..., loop=...) */}
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay={plugins.videoAutoplay}
          loop={plugins.videoLoop}
          muted={plugins.videoAutoplay}
          playsInline
          className="block w-full rounded-xl bg-black"
          onError={() => setUploadError(t.blocks.video.playError)}
        />

        {/* 재생 설정 뱃지 (autoplay / loop 상태 표시) */}
        {(plugins.videoAutoplay || plugins.videoLoop) && (
          <div className="absolute top-2 left-2 flex gap-1 pointer-events-none">
            {plugins.videoAutoplay && (
              <span className="px-1.5 py-0.5 text-xs bg-black/60 text-white rounded">
                {t.blocks.video.autoplay}
              </span>
            )}
            {plugins.videoLoop && (
              <span className="px-1.5 py-0.5 text-xs bg-black/60 text-white rounded">
                {t.blocks.video.loop}
              </span>
            )}
          </div>
        )}

        {/* 호버 시 버튼 (제거) — 리사이즈 중에는 숨김 */}
        {!readOnly && !isResizing && (
          <div className="absolute top-2 right-8 opacity-0 group-hover/vid:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleRemove}
              className="px-2 py-1 text-xs bg-black/60 text-white rounded hover:bg-black/80"
              title={t.blocks.video.removeTitle}
            >
              {t.blocks.video.removeBtn}
            </button>
          </div>
        )}

        {/* ── 우측 리사이즈 핸들 ────────────────────
            absolute right-0: 컨테이너 오른쪽 끝에 붙음
            w-3: 드래그 영역 (12px)
            내부 파란 막대: 시각적 인디케이터
            Python으로 치면: resize_handle = DragHandle(side='right') */}
        {!readOnly && (
          <div
            onMouseDown={handleResizeStart}
            className={isResizing
              ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
              : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/vid:opacity-100 transition-opacity"}
            title={t.blocks.video.resizeTitle}
          >
            {/* 파란 수직 막대 — 리사이즈 핸들 시각 표시 */}
            <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
          </div>
        )}

        {uploadError && (
          <p className="absolute bottom-2 left-2 text-xs text-red-400 bg-black/60 px-2 py-1 rounded">
            {uploadError}
          </p>
        )}
      </div>
    </>
  )
}
