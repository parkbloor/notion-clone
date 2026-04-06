// =============================================
// src/components/editor/ImageBlock.tsx
// 역할: 이미지 블록 — 업로드 UI, 이미지 표시, 우측 핸들로 너비 조절
//       GIF의 경우 canvas 렌더링으로 재생/일시정지/프레임 이동 지원
// Python으로 치면: class ImageBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { parseGIF, decompressFrames, ParsedFrame } from 'gifuct-js'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { api } from '@/lib/api'
import { useLocale } from '@/locales'

interface ImageBlockProps {
  block: Block
  pageId: string
  // 원고(읽기) 모드 여부 — true이면 GIF 컨트롤 표시 + 자동 재생 없음
  // Python으로 치면: read_mode: bool = False
  readMode?: boolean
}

// -----------------------------------------------
// content 파싱 헬퍼
// 새 포맷: JSON { src, width?, caption? }
// 구 포맷(legacy): plain data URL 문자열
// Python으로 치면: def parse_content(s): return json.loads(s) or {'src': s}
// -----------------------------------------------
function parseContent(content: string): { src: string; width?: number; caption?: string } {
  if (!content) return { src: '' }
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed.src === 'string') return parsed
  } catch {}
  return { src: content }
}

// -----------------------------------------------
// src URL이 GIF인지 판단
// URL 끝이 .gif 이거나 쿼리스트링 제외한 경로가 .gif 로 끝나면 true
// Python으로 치면: def is_gif(src): return src.lower().endswith('.gif')
// -----------------------------------------------
function detectGif(src: string): boolean {
  try {
    const url = new URL(src, 'http://x')
    return url.pathname.toLowerCase().endsWith('.gif')
  } catch {
    return src.toLowerCase().includes('.gif')
  }
}

export default function ImageBlock({ block, pageId, readMode = false }: ImageBlockProps) {
  const { updateBlock, updateBlockCanvas, savePageNow } = usePageStore()
  const t = useLocale()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // GIF canvas 렌더링용 ref — <canvas> 엘리먼트 직접 참조
  // Python으로 치면: canvas_ref = None
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [isDragOver, setIsDragOver] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const isResizingRef = useRef(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])
  const [localWidth, setLocalWidth] = useState<number | undefined>(undefined)
  const [isUploading, setIsUploading] = useState(false)

  // ── GIF 플레이어 상태 ─────────────────────────
  // 파싱된 프레임 배열 (gifuct-js 디코딩 결과)
  // Python으로 치면: self.frames: list[ParsedFrame] = []
  const [gifFrames, setParsedFrames] = useState<ParsedFrame[]>([])
  // 현재 표시 중인 프레임 인덱스
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0)
  // 재생 중 여부 — true면 requestAnimationFrame 루프 작동
  const [isPlaying, setIsPlaying] = useState(false)
  // GIF 파싱 진행 중 여부
  const [isLoadingGif, setIsLoadingGif] = useState(false)
  // GIF 여부
  const [isGif, setIsGif] = useState(false)

  // GIF 애니메이션 루프 제어용 ref
  // Python으로 치면: raf_id: int | None = None
  const rafRef = useRef<number | null>(null)
  // 마지막 프레임 렌더 시각 (ms) — delay 계산용
  const lastFrameTimeRef = useRef<number>(0)
  // 현재 프레임 인덱스 ref — RAF 클로저 안에서 최신값 참조
  const frameIdxRef = useRef(0)
  // 프레임 배열 ref — RAF 클로저 안에서 최신값 참조
  const framesRef = useRef<ParsedFrame[]>([])
  // canvas 누적 배경 보존용 오프스크린 버퍼 (disposal type 3 용)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  // 프레임 픽셀 데이터 임시 캔버스 — 매 프레임마다 생성 비용 절감용 재사용 버퍼
  // putImageData → drawImage 변환 브릿지 역할
  // Python으로 치면: self._temp_surface = pygame.Surface((0, 0))
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // ── 재생 속도 배수 — 0.5× / 1× / 2× 선택
  // Python으로 치면: self.speed: float = 1.0
  const [speedMultiplier, setSpeedMultiplier] = useState<0.5 | 1 | 2>(1)
  // RAF 클로저 안에서 최신 속도값 읽기용 ref
  const speedMultiplierRef = useRef<number>(1)

  // ── 루프 여부 — false면 마지막 프레임에서 재생 멈춤
  // Python으로 치면: self.looping: bool = True
  const [isLooping, setIsLooping] = useState(true)
  const isLoopingRef = useRef(true)

  const { src, width: savedWidth, caption: savedCaption } = parseContent(block.content)
  const [localCaption, setLocalCaption] = useState(savedCaption ?? '')
  const displayWidth = isResizing ? localWidth : savedWidth
  const hasValidImage = src.startsWith('data:image/') || src.startsWith('http')

  // -----------------------------------------------
  // Effect 1: src가 바뀌면 GIF 여부만 감지해서 상태 업데이트
  // — 프레임 로딩은 여기서 하지 않는다.
  //   setIsGif(true)가 실행되면 React가 다음 렌더에서 <canvas>를 DOM에 추가한다.
  //   canvas가 DOM에 존재하기 전에 loadParsedFrames를 호출하면 canvasRef.current가
  //   null이라 canvas.width/height 설정이 전부 무효 → 빈 캔버스가 된다.
  // Python으로 치면: def on_src_changed(src): self.is_gif = is_gif(src)
  // -----------------------------------------------
  useEffect(() => {
    setIsGif(src ? detectGif(src) : false)
  }, [src])

  // -----------------------------------------------
  // Effect 2: isGif가 true가 된 직후 실행
  // React는 상태 변경 → DOM 커밋 → effect 실행 순서를 보장하므로
  // 이 effect가 실행될 때는 <canvas>가 이미 DOM에 마운트된 상태다.
  // Python으로 치면: def on_is_gif_changed(): if is_gif: load_frames(src)
  // -----------------------------------------------
  useEffect(() => {
    if (!isGif || !src) return
    loadParsedFrames(src)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGif, src])

  // -----------------------------------------------
  // XHR로 ArrayBuffer 로드
  // Chrome 확장이 window.fetch를 가로채므로 XHR 직접 사용
  // 확장의 InvalidStateError는 확장 자체의 오류일 뿐 우리 onload 콜백은 정상 실행됨
  // Python으로 치면: def fetch_bytes(url) -> bytes: return urllib.request.urlopen(url).read()
  // -----------------------------------------------
  function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'arraybuffer'
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as ArrayBuffer)
        } else {
          reject(new Error(`HTTP ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('network error'))
      xhr.send()
    })
  }

  // -----------------------------------------------
  // GIF 파싱: XHR → ArrayBuffer → gifuct-js 디코딩 → 프레임 배열
  // Python으로 치면:
  //   async def load_gif_frames(src):
  //       data = fetch_bytes(src)
  //       frames = decompress(parse_gif(data))
  //       self.frames = frames
  // -----------------------------------------------
  async function loadParsedFrames(gifSrc: string) {
    setIsLoadingGif(true)
    setParsedFrames([])
    setCurrentFrameIdx(0)
    frameIdxRef.current = 0
    stopAnimation()
    try {
      const buf = await fetchArrayBuffer(gifSrc)
      const parsed = parseGIF(buf)
      const frames = decompressFrames(parsed, true) as ParsedFrame[]

      // ── canvas 크기를 GIF 헤더(lsd)에서 설정 ──────────────────────
      // canvas 기본 크기는 300×150이라 width===0 조건이 절대 실행 안 됨
      // lsd(Logical Screen Descriptor)가 GIF 전체 해상도의 단일 진실 공급원
      // Python으로 치면: canvas.config(width=parsed.lsd.width, height=parsed.lsd.height)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = parsed.lsd.width
        canvas.height = parsed.lsd.height
        // 오프스크린 버퍼 초기화 (disposal type 3 복원용)
        const off = document.createElement('canvas')
        off.width = parsed.lsd.width
        off.height = parsed.lsd.height
        offscreenRef.current = off
      }

      framesRef.current = frames
      setParsedFrames(frames)
      // 첫 프레임 즉시 렌더
      if (frames.length > 0) {
        renderFrame(frames, 0, canvas)
      }
    } catch {
      // 파싱 실패 — isGif는 유지 (setIsGif(false) 금지)
      // setIsGif(false)를 하면 <img>로 폴백되어 컨트롤이 사라짐
      // frames가 비어있으면 컨트롤 비활성 상태로 표시됨
    } finally {
      setIsLoadingGif(false)
    }
  }

  // -----------------------------------------------
  // 특정 프레임을 canvas에 렌더링
  // GIF disposal type 처리:
  //   0,1 = 이전 상태 유지 (do not dispose) → 그냥 덧그리기
  //   2   = 배경으로 복원 → 이전 프레임 영역 지우고 덧그리기
  //   3   = 이전 프레임 복원 (rare, 오프스크린 버퍼로 처리)
  // Python으로 치면:
  //   def render_frame(frames, idx, canvas):
  //       apply_disposal(prev); ctx.put_image_data(frame.patch, x, y)
  // -----------------------------------------------
  function renderFrame(frames: ParsedFrame[], idx: number, canvas: HTMLCanvasElement | null) {
    const c = canvas ?? canvasRef.current
    if (!c || frames.length === 0) return
    const frame = frames[idx]
    if (!frame) return

    const ctx = c.getContext('2d')
    if (!ctx) return

    // 이전 프레임의 disposal type 적용 (현재 프레임 그리기 전)
    // Python으로 치면: if prev.disposal == 2: ctx.clear(prev.rect)
    if (idx > 0) {
      const prev = frames[idx - 1]
      if (prev.disposalType === 2) {
        // restore to background: 이전 프레임 영역을 투명으로 지우기
        ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
      } else if (prev.disposalType === 3) {
        // restore to previous: 오프스크린 버퍼에서 해당 영역 복원
        const off = offscreenRef.current
        if (off) {
          ctx.drawImage(off, prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height,
            prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
        }
      }
      // disposalType 0,1: 이전 상태 유지 — 아무것도 하지 않음
    } else {
      // 첫 프레임은 전체 canvas 클리어
      ctx.clearRect(0, 0, c.width, c.height)
    }

    // disposalType 3을 위해 현재 프레임 그리기 전 상태를 오프스크린에 저장
    // Python으로 치면: if frame.disposal == 3: offscreen.copy(canvas)
    if (frame.disposalType === 3) {
      const offCtx = offscreenRef.current?.getContext('2d')
      if (offCtx && offscreenRef.current) {
        offCtx.clearRect(0, 0, offscreenRef.current.width, offscreenRef.current.height)
        offCtx.drawImage(c, 0, 0)
      }
    }

    // 현재 프레임을 임시 캔버스에 putImageData → 메인 캔버스에 drawImage
    // putImageData는 알파 채널을 덮어쓰기로 직접 써서 투명 픽셀이 배경을 지워버림
    // drawImage는 source-over 합성이라 투명 픽셀이 아래 내용을 보존함
    // Python으로 치면: temp_surface.blit(patch); main_surface.blit(temp_surface, (x, y))
    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas')
    }
    const temp = tempCanvasRef.current
    // 프레임 크기가 바뀔 때만 리사이즈 (매 프레임 재할당 방지)
    if (temp.width !== frame.dims.width || temp.height !== frame.dims.height) {
      temp.width = frame.dims.width
      temp.height = frame.dims.height
    }
    const tempCtx = temp.getContext('2d')
    if (tempCtx) {
      const safeData = new Uint8ClampedArray(frame.patch)
      tempCtx.putImageData(new ImageData(safeData, frame.dims.width, frame.dims.height), 0, 0)
      ctx.drawImage(temp, frame.dims.left, frame.dims.top)
    }
  }

  // -----------------------------------------------
  // RAF 애니메이션 루프 — delay 시간마다 다음 프레임으로 이동
  // Python으로 치면:
  //   def animation_loop(timestamp):
  //       if timestamp - last >= frame.delay: next_frame()
  //       raf_id = request_animation_frame(animation_loop)
  // -----------------------------------------------
  const animationLoop = useCallback((timestamp: number) => {
    const frames = framesRef.current
    if (frames.length === 0) return

    const frame = frames[frameIdxRef.current]
    // 속도 배수 적용: delay / speed (최소 10ms)
    // Python으로 치면: effective_delay = max(frame.delay / speed, 10)
    const rawDelay = frame.delay || 100
    const delay = Math.max(rawDelay / speedMultiplierRef.current, 10)

    if (timestamp - lastFrameTimeRef.current >= delay) {
      const nextRaw = frameIdxRef.current + 1
      // 마지막 프레임 도달 시 루프 여부에 따라 정지 또는 처음으로 이동
      // Python으로 치면: if next >= len(frames): stop() if not looping else wrap
      if (nextRaw >= frames.length) {
        if (!isLoopingRef.current) {
          // 루프 꺼짐: 마지막 프레임에서 재생 정지
          rafRef.current = null
          setIsPlaying(false)
          return
        }
      }
      const nextIdx = nextRaw % frames.length
      frameIdxRef.current = nextIdx
      setCurrentFrameIdx(nextIdx)
      renderFrame(frames, nextIdx, null)
      lastFrameTimeRef.current = timestamp
    }

    rafRef.current = requestAnimationFrame(animationLoop)
  }, [])

  // -----------------------------------------------
  // 애니메이션 시작
  // Python으로 치면: def start_animation(): raf_id = request_animation_frame(loop)
  // -----------------------------------------------
  const startAnimation = useCallback(() => {
    if (rafRef.current !== null) return
    lastFrameTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animationLoop)
    setIsPlaying(true)
  }, [animationLoop])

  // -----------------------------------------------
  // 애니메이션 정지
  // Python으로 치면: def stop_animation(): cancel_animation_frame(raf_id)
  // -----------------------------------------------
  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsPlaying(false)
  }, [])

  // 언마운트 시 RAF 정리
  useEffect(() => () => { stopAnimation() }, [stopAnimation])

  // -----------------------------------------------
  // 재생/일시정지 토글
  // Python으로 치면: def toggle_play(): start() if not playing else stop()
  // -----------------------------------------------
  function handleTogglePlay() {
    if (isPlaying) {
      stopAnimation()
    } else {
      startAnimation()
    }
  }

  // -----------------------------------------------
  // 이전/다음 프레임으로 이동 (재생 중이면 일시정지 후 이동)
  // Python으로 치면: def step_frame(delta): idx = (idx + delta) % len(frames)
  // -----------------------------------------------
  function handleStepFrame(delta: number) {
    if (gifFrames.length === 0) return
    stopAnimation()
    const nextIdx = (currentFrameIdx + delta + gifFrames.length) % gifFrames.length
    frameIdxRef.current = nextIdx
    setCurrentFrameIdx(nextIdx)
    renderFrame(gifFrames, nextIdx, null)
  }

  // -----------------------------------------------
  // 첫 프레임으로 점프
  // Python으로 치면: def jump_to_first(): idx = 0
  // -----------------------------------------------
  function handleJumpToFirst() {
    if (gifFrames.length === 0) return
    stopAnimation()
    frameIdxRef.current = 0
    setCurrentFrameIdx(0)
    renderFrame(gifFrames, 0, null)
  }

  // -----------------------------------------------
  // 마지막 프레임으로 점프
  // Python으로 치면: def jump_to_last(): idx = len(frames) - 1
  // -----------------------------------------------
  function handleJumpToLast() {
    if (gifFrames.length === 0) return
    stopAnimation()
    const lastIdx = gifFrames.length - 1
    frameIdxRef.current = lastIdx
    setCurrentFrameIdx(lastIdx)
    renderFrame(gifFrames, lastIdx, null)
  }

  // -----------------------------------------------
  // 스크러버로 임의 프레임 이동
  // Python으로 치면: def seek(idx): stop(); render(idx)
  // -----------------------------------------------
  function handleScrub(idx: number) {
    if (gifFrames.length === 0) return
    stopAnimation()
    frameIdxRef.current = idx
    setCurrentFrameIdx(idx)
    renderFrame(gifFrames, idx, null)
  }

  // -----------------------------------------------
  // 재생 속도 변경 — ref와 state 동시 업데이트
  // Python으로 치면: def set_speed(s): self.speed = s
  // -----------------------------------------------
  function handleSetSpeed(s: 0.5 | 1 | 2) {
    speedMultiplierRef.current = s
    setSpeedMultiplier(s)
  }

  // -----------------------------------------------
  // 루프 토글 — ref와 state 동시 업데이트
  // Python으로 치면: def toggle_loop(): self.looping = not self.looping
  // -----------------------------------------------
  function handleToggleLoop() {
    const next = !isLoopingRef.current
    isLoopingRef.current = next
    setIsLooping(next)
  }

  // -----------------------------------------------
  // content를 JSON으로 직렬화하여 저장
  // Python으로 치면: def save_content(src, width=None, caption=None): update_block(...)
  // -----------------------------------------------
  function saveContent(newSrc: string, newWidth?: number, newCaption?: string) {
    const data: { src: string; width?: number; caption?: string } = { src: newSrc }
    if (newWidth !== undefined) data.width = newWidth
    if (newCaption !== undefined && newCaption !== '') data.caption = newCaption
    updateBlock(pageId, block.id, JSON.stringify(data))
    if (newWidth !== undefined && block.canvasX !== undefined) {
      updateBlockCanvas(pageId, block.id, { w: newWidth })
    }
  }

  // -----------------------------------------------
  // 파일 → 서버 업로드 후 URL 저장
  // Python으로 치면:
  //   async def load_file(file):
  //       url = await api.upload(file); save(url)
  // -----------------------------------------------
  async function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setIsUploading(true)
    try {
      const url = await api.uploadImage(pageId, file)
      saveContent(url, savedWidth, localCaption || undefined)
      await savePageNow(pageId)
    } catch {
      toast.error(t.blocks.image.uploadError)
    } finally {
      setIsUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ''
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave() {
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }

  // -----------------------------------------------
  // 리사이즈 핸들 마우스다운 → 드래그로 너비 조절
  // Python으로 치면:
  //   def on_resize_start(event):
  //       start_x = event.clientX; start_width = img.offsetWidth
  //       document.onmousemove = lambda e: set_width(start_width + e.clientX - start_x)
  // -----------------------------------------------
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isResizingRef.current) return
    isResizingRef.current = true

    // canvas 또는 img 엘리먼트의 현재 너비 측정
    const targetEl = canvasRef.current ?? (containerRef.current?.querySelector('img') as HTMLImageElement | null)
    const startWidth = targetEl ? targetEl.offsetWidth : (savedWidth ?? 400)
    const maxWidth = containerRef.current?.parentElement?.offsetWidth ?? Infinity
    const startX = e.clientX

    setLocalWidth(startWidth)
    setIsResizing(true)

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.min(maxWidth, Math.max(100, startWidth + (ev.clientX - startX)))
      setLocalWidth(newWidth)
    }

    function onMouseUp(ev: MouseEvent) {
      cleanup()
      const finalWidth = Math.min(maxWidth, Math.max(100, startWidth + (ev.clientX - startX)))
      setLocalWidth(finalWidth)
      setIsResizing(false)
      saveContent(src, finalWidth, localCaption || undefined)
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

  // ── 업로드 영역 ──────────────────────────────
  if (!hasValidImage) {
    const uploadClass = isDragOver
      ? "w-full min-h-36 border-2 border-dashed border-blue-400 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer bg-blue-50 transition-colors"
      : "w-full min-h-36 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"

    return (
      <div
        className={uploadClass}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        {isUploading ? (
          <>
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-400">{t.blocks.image.uploading}</p>
          </>
        ) : (
          <>
            <span className="text-3xl select-none">🖼️</span>
            <p className="text-sm text-gray-400">{t.blocks.image.instruction}</p>
            <p className="text-xs text-gray-300">{t.blocks.image.formatInfo}</p>
          </>
        )}
      </div>
    )
  }

  // ── GIF 뷰어 (img 항상 표시 + canvas 오버레이 + 컨트롤 바) ─────────────
  if (isGif) {
    // 프레임 로딩 완료 여부 — canvas가 유효한 콘텐츠를 가진 상태
    // Python으로 치면: frames_ready = len(self.gif_frames) > 0
    const framesReady = gifFrames.length > 0

    return (
      <>
        {isResizing && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}

        {/* GIF 컨테이너 */}
        <div
          ref={containerRef}
          className="image-block-wrapper relative group/img my-1 inline-block"
          style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : 'auto' }}
        >
          {/* -----------------------------------------------
              <img>: 항상 표시 — 로딩 중·파싱 실패 시에도 GIF가 보이도록 보장
              프레임 로딩 완료 후에는 canvas 아래에 숨겨지지만 DOM에는 유지
              Python으로 치면: img.visible = not frames_ready
              ----------------------------------------------- */}
          <img
            src={src}
            alt={t.blocks.image.alt}
            className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
            style={{ display: framesReady ? 'none' : 'block' }}
            draggable={false}
          />

          {/* -----------------------------------------------
              <canvas>: 프레임 로딩 완료 후 img 위에 표시
              gifuct-js로 디코딩한 프레임을 직접 렌더링 → 재생/정지/프레임이동 가능
              Python으로 치면: canvas.visible = frames_ready
              ----------------------------------------------- */}
          <canvas
            ref={canvasRef}
            className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
            style={{ display: framesReady ? 'block' : 'none' }}
          />

          {/* 파싱 중 스피너 — img 위에 작게 오버레이 */}
          {isLoadingGif && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 rounded-full text-xs text-gray-500">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                {t.blocks.image.gifLoadingFrames}
              </div>
            </div>
          )}

          {/* -----------------------------------------------
              GIF 컨트롤 바 — 호버 시 canvas 하단에 오버레이
              [ |< ] [▶/⏸] [ >| ]   1 / 24
              Python으로 치면: control_bar = HBox([prev_btn, play_btn, next_btn, label])
              ----------------------------------------------- */}
          {framesReady && !isResizing && (
            // 원고 모드: 항상 표시 / 편집 모드: 호버 시 표시
            // Python으로 치면: visible = read_mode or hovered
            <div className={readMode
              ? "absolute bottom-0 left-0 right-0 flex flex-col px-2 pt-1 pb-1.5 transition-opacity"
              : "absolute bottom-0 left-0 right-0 flex flex-col px-2 pt-1 pb-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"}>
              {/* 반투명 배경 바 */}
              <div className="absolute inset-0 bg-black/50 rounded-b-lg" />

              {/* ── 줄 1: 스크러버 + 카운터 ─────────────────── */}
              {/* Python으로 치면: Row([scrubber, counter_label]) */}
              <div className="relative z-10 flex items-center gap-2 mb-1">
                {/* 프레임 스크러버 — range input으로 임의 프레임 이동 */}
                <input
                  type="range"
                  min={0}
                  max={gifFrames.length - 1}
                  value={currentFrameIdx}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  className="flex-1 h-1 cursor-pointer accent-white"
                  title={t.blocks.image.gifScrubber}
                />
                {/* 프레임 카운터 + 현재 프레임 딜레이 */}
                <span className="text-xs text-white/80 tabular-nums whitespace-nowrap">
                  {currentFrameIdx + 1} / {gifFrames.length}
                  <span className="text-white/50 ml-1">
                    ({gifFrames[currentFrameIdx]?.delay ?? 0}ms)
                  </span>
                </span>
              </div>

              {/* ── 줄 2: 버튼들 ──────────────────────────── */}
              {/* Python으로 치면: Row([first, prev, play, next, last, loop, speed]) */}
              <div className="relative z-10 flex items-center justify-center gap-0.5">

                {/* ⏮ 처음으로 점프 */}
                <button
                  onClick={handleJumpToFirst}
                  className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none"
                  title={t.blocks.image.gifJumpFirst}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="1" y="2" width="2" height="10" rx="0.5" />
                    <rect x="4" y="2" width="2" height="10" rx="0.5" />
                    <path d="M13 3L6 7l7 4V3z" />
                  </svg>
                </button>

                {/* |< 이전 프레임 */}
                <button
                  onClick={() => handleStepFrame(-1)}
                  className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none"
                  title={t.blocks.image.gifPrevFrame}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="1" y="2" width="2" height="10" rx="0.5" />
                    <path d="M12 3L5 7l7 4V3z" />
                  </svg>
                </button>

                {/* ▶/⏸ 재생/일시정지 */}
                <button
                  onClick={handleTogglePlay}
                  className="flex items-center justify-center w-8 h-8 rounded-full text-white bg-white/20 hover:bg-white/35 transition-colors select-none"
                  title={isPlaying ? t.blocks.image.gifPause : t.blocks.image.gifPlay}
                >
                  {isPlaying ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="2" y="1" width="3" height="10" rx="0.5" />
                      <rect x="7" y="1" width="3" height="10" rx="0.5" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M3 2l8 4-8 4V2z" />
                    </svg>
                  )}
                </button>

                {/* >| 다음 프레임 */}
                <button
                  onClick={() => handleStepFrame(1)}
                  className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none"
                  title={t.blocks.image.gifNextFrame}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="11" y="2" width="2" height="10" rx="0.5" />
                    <path d="M2 3l7 4-7 4V3z" />
                  </svg>
                </button>

                {/* ⏭ 끝으로 점프 */}
                <button
                  onClick={handleJumpToLast}
                  className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none"
                  title={t.blocks.image.gifJumpLast}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="11" y="2" width="2" height="10" rx="0.5" />
                    <rect x="8" y="2" width="2" height="10" rx="0.5" />
                    <path d="M1 3l7 4-7 4V3z" />
                  </svg>
                </button>

                {/* 구분선 */}
                <div className="w-px h-4 bg-white/20 mx-1" />

                {/* 🔁 루프 토글 */}
                <button
                  onClick={handleToggleLoop}
                  className={`flex items-center justify-center w-7 h-7 rounded transition-colors select-none ${isLooping ? 'text-white bg-white/20 hover:bg-white/30' : 'text-white/40 hover:bg-white/10'}`}
                  title={isLooping ? t.blocks.image.gifLoopOn : t.blocks.image.gifLoopOff}
                >
                  {/* 루프 아이콘 (순환 화살표) */}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4h9a3 3 0 0 1 0 6H4" />
                    <path d="M4 7L1 4l3-3" />
                  </svg>
                </button>

                {/* 구분선 */}
                <div className="w-px h-4 bg-white/20 mx-1" />

                {/* 속도 선택 — 0.5× / 1× / 2× */}
                {([0.5, 1, 2] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSetSpeed(s)}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors select-none ${speedMultiplier === s ? 'bg-white/40 text-white' : 'text-white/50 hover:bg-white/20 hover:text-white'}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 호버 시 버튼 (교체/삭제) — 원고 모드에서는 숨김 */}
          {!isResizing && !readMode && (
            <div className="absolute top-2 right-8 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 text-xs bg-white rounded shadow text-gray-600 hover:bg-gray-100"
                title={t.blocks.image.replaceTitle}
              >
                {t.blocks.image.replaceBtn}
              </button>
              <button
                onClick={() => updateBlock(pageId, block.id, '')}
                className="px-2 py-1 text-xs bg-white rounded shadow text-red-500 hover:bg-red-50"
                title={t.blocks.image.deleteTitle}
              >
                {t.blocks.image.deleteBtn}
              </button>
            </div>
          )}

          {/* ── 우측 리사이즈 핸들 — 원고 모드에서 숨김 */}
          {!readMode && (
            <div
              onMouseDown={handleResizeStart}
              className={isResizing
                ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
                : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/img:opacity-100 transition-opacity"}
              title={t.blocks.image.resizeTitle}
            >
              <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>

        {/* 캡션 입력란 */}
        <div
          className="block"
          style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}
        >
          <input
            type="text"
            value={localCaption}
            onChange={(e) => setLocalCaption(e.target.value)}
            onBlur={() => saveContent(src, savedWidth, localCaption || undefined)}
            placeholder={t.blocks.image.captionAdd}
            className="w-full text-center text-xs text-gray-400 bg-transparent border-none outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400 mt-1 py-0.5"
          />
        </div>
      </>
    )
  }

  // ── 일반 이미지 표시 + 리사이즈 핸들 ──────────
  return (
    <>
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      <div
        ref={containerRef}
        className="image-block-wrapper relative group/img my-1 inline-block"
        style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : 'auto' }}
      >
        <img
          src={src}
          alt={t.blocks.image.alt}
          className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
          style={{ contain: 'layout' }}
          draggable={false}
        />

        {!isResizing && (
          <div className="absolute top-2 right-8 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 text-xs bg-white rounded shadow text-gray-600 hover:bg-gray-100"
              title={t.blocks.image.replaceTitle}
            >
              {t.blocks.image.replaceBtn}
            </button>
            <button
              onClick={() => updateBlock(pageId, block.id, '')}
              className="px-2 py-1 text-xs bg-white rounded shadow text-red-500 hover:bg-red-50"
              title={t.blocks.image.deleteTitle}
            >
              {t.blocks.image.deleteBtn}
            </button>
          </div>
        )}

        {/* ── 우측 리사이즈 핸들 ─────────────────── */}
        <div
          onMouseDown={handleResizeStart}
          className={isResizing
            ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
            : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/img:opacity-100 transition-opacity"}
          title={t.blocks.image.resizeTitle}
        >
          <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </div>

      {/* 캡션 입력란 */}
      <div
        className="block"
        style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}
      >
        <input
          type="text"
          value={localCaption}
          onChange={(e) => setLocalCaption(e.target.value)}
          onBlur={() => saveContent(src, savedWidth, localCaption || undefined)}
          placeholder={t.blocks.image.captionAdd}
          className="w-full text-center text-xs text-gray-400 bg-transparent border-none outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400 mt-1 py-0.5"
        />
      </div>
    </>
  )
}
