// =============================================
// src/components/editor/ImageBlock.tsx
// 역할: 이미지 블록 — 단일/다중 이미지 지원
//       단일 이미지: 너비 조절 + GIF canvas 플레이어
//       다중 이미지: 그리드 레이아웃 + 라이트박스 뷰어 (←→ 넘기기, ESC 닫기)
// Python으로 치면: class ImageBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { parseGIF, decompressFrames, ParsedFrame } from 'gifuct-js'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { api } from '@/lib/api'
import { useLocale } from '@/locales'

interface ImageBlockProps {
  block: Block
  pageId: string
  // 읽기 모드 여부 — true이면 GIF 컨트롤 항상 표시, 편집 UI 숨김
  // Python으로 치면: read_mode: bool = False
  readMode?: boolean
}

// -----------------------------------------------
// 개별 이미지 항목 타입
// Python으로 치면: class ImageItem(TypedDict): src: str; caption: Optional[str]
// -----------------------------------------------
type ImageItem = {
  src: string
  caption?: string
  name?: string
  mime?: string
  size?: number
}

// -----------------------------------------------
// content 파싱 헬퍼 — 구/신 포맷 모두 지원
//   신 포맷: { images: ImageItem[], width?: number }
//   구 포맷: { src, width?, caption? } or 평문 data URL
// Python으로 치면: def parse_multi_content(s) -> dict: ...
// -----------------------------------------------
function parseMultiContent(content: string): { images: ImageItem[]; width?: number } {
  if (!content) return { images: [] }
  try {
    const parsed = JSON.parse(content)
    // 신 포맷: images 배열이 있으면 바로 반환
    if (Array.isArray(parsed.images)) return parsed as { images: ImageItem[]; width?: number }
    // 구 포맷: src 문자열 하나를 배열로 래핑
    if (typeof parsed.src === 'string') {
      return { images: [{ src: parsed.src, caption: parsed.caption }], width: parsed.width }
    }
  } catch {}
  // 레거시: 평문 data URL 또는 http URL
  if (content.startsWith('data:image/') || content.startsWith('http')) {
    return { images: [{ src: content }] }
  }
  return { images: [] }
}

// -----------------------------------------------
// src URL이 GIF인지 판단
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

// -----------------------------------------------
// 이미지 수에 따른 그리드 열 클래스 계산
// 2장 → 2열, 3장 이상 → 3열
// Python으로 치면: def grid_cols(n): return 2 if n == 2 else 3
// -----------------------------------------------
function gridColsClass(count: number): string {
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-3'
}

export default function ImageBlock({ block, pageId, readMode = false }: ImageBlockProps) {
  const { updateBlock, updateBlockCanvas, savePageNow } = usePageStore()
  const t = useLocale()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // GIF canvas 렌더링용 ref
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [isDragOver, setIsDragOver] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const isResizingRef = useRef(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])
  const [localWidth, setLocalWidth] = useState<number | undefined>(undefined)
  const [isUploading, setIsUploading] = useState(false)
  const [draggedImageIdx, setDraggedImageIdx] = useState<number | null>(null)

  // ── 라이트박스 상태 ──────────────────────────
  // null = 닫힘, 숫자 = 해당 인덱스 이미지를 전체화면으로 표시
  // Python으로 치면: self.lightbox_idx: Optional[int] = None
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  // 라이트박스에서 편집 중인 캡션
  const [lightboxCaption, setLightboxCaption] = useState('')

  // ── GIF 플레이어 상태 (단일 이미지 모드 전용) ──
  // Python으로 치면: self.frames: list[ParsedFrame] = []
  const [gifFrames, setParsedFrames] = useState<ParsedFrame[]>([])
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoadingGif, setIsLoadingGif] = useState(false)
  const [isGif, setIsGif] = useState(false)
  const rafRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(0)
  const frameIdxRef = useRef(0)
  const framesRef = useRef<ParsedFrame[]>([])
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [speedMultiplier, setSpeedMultiplier] = useState<0.5 | 1 | 2>(1)
  const speedMultiplierRef = useRef<number>(1)
  const [isLooping, setIsLooping] = useState(true)
  const isLoopingRef = useRef(true)

  // content 파싱 — 이미지 배열과 공통 너비 추출
  const { images, width: savedWidth } = parseMultiContent(block.content)
  const isSingleImage = images.length === 1
  const src = images[0]?.src ?? ''
  const displayWidth = isResizing ? localWidth : savedWidth

  // 단일 이미지 모드에서만 GIF 감지 실행
  // Python으로 치면: if single_mode: self.is_gif = is_gif(src)
  useEffect(() => {
    if (!isSingleImage) { setIsGif(false); return }
    setIsGif(src ? detectGif(src) : false)
  }, [src, isSingleImage])

  // isGif 전환 후 DOM에 <canvas>가 마운트된 시점에 프레임 로딩
  useEffect(() => {
    if (!isGif || !src || !isSingleImage) return
    loadParsedFrames(src)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGif, src, isSingleImage])

  // 라이트박스가 열릴 때 해당 이미지 캡션을 편집 상태로 초기화
  useEffect(() => {
    if (lightboxIdx !== null) {
      setLightboxCaption(images[lightboxIdx]?.caption ?? '')
    }
  }, [lightboxIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // 라이트박스 키보드 조작 — ← → ESC
  // Python으로 치면: def on_key(e): if e.key == 'Escape': close()
  useEffect(() => {
    if (lightboxIdx === null) return
    const total = images.length
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setLightboxIdx(null); return }
      if (e.key === 'ArrowLeft')
        setLightboxIdx(i => i !== null ? (i - 1 + total) % total : null)
      if (e.key === 'ArrowRight')
        setLightboxIdx(i => i !== null ? (i + 1) % total : null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIdx, images.length])

  // -----------------------------------------------
  // XHR로 ArrayBuffer 로드 (Chrome 확장 fetch 간섭 방지)
  // Python으로 치면: def fetch_bytes(url) -> bytes: ...
  // -----------------------------------------------
  function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'arraybuffer'
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as ArrayBuffer)
        else reject(new Error(`HTTP ${xhr.status}`))
      }
      xhr.onerror = () => reject(new Error('network error'))
      xhr.send()
    })
  }

  // -----------------------------------------------
  // GIF 파싱: XHR → gifuct-js 디코딩 → 프레임 배열
  // Python으로 치면: async def load_gif_frames(src): ...
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

      // canvas 크기를 GIF 헤더(lsd)로 설정
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = parsed.lsd.width
        canvas.height = parsed.lsd.height
        const off = document.createElement('canvas')
        off.width = parsed.lsd.width
        off.height = parsed.lsd.height
        offscreenRef.current = off
      }

      framesRef.current = frames
      setParsedFrames(frames)
      if (frames.length > 0) renderFrame(frames, 0, canvas)
    } catch {
      // 파싱 실패 시 isGif 유지 (img 폴백으로 GIF 원본 표시 유지)
    } finally {
      setIsLoadingGif(false)
    }
  }

  // -----------------------------------------------
  // 특정 프레임을 canvas에 렌더링 (disposal type 0/1/2/3 처리)
  // Python으로 치면: def render_frame(frames, idx, canvas): ...
  // -----------------------------------------------
  function renderFrame(frames: ParsedFrame[], idx: number, canvas: HTMLCanvasElement | null) {
    const c = canvas ?? canvasRef.current
    if (!c || frames.length === 0) return
    const frame = frames[idx]
    if (!frame) return

    const ctx = c.getContext('2d')
    if (!ctx) return

    if (idx > 0) {
      const prev = frames[idx - 1]
      if (prev.disposalType === 2) {
        ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
      } else if (prev.disposalType === 3) {
        const off = offscreenRef.current
        if (off) {
          ctx.drawImage(off, prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height,
            prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
        }
      }
    } else {
      ctx.clearRect(0, 0, c.width, c.height)
    }

    if (frame.disposalType === 3) {
      const offCtx = offscreenRef.current?.getContext('2d')
      if (offCtx && offscreenRef.current) {
        offCtx.clearRect(0, 0, offscreenRef.current.width, offscreenRef.current.height)
        offCtx.drawImage(c, 0, 0)
      }
    }

    // putImageData → drawImage 브릿지 (알파 채널 보존)
    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas')
    const temp = tempCanvasRef.current
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
  // RAF 애니메이션 루프 — delay마다 다음 프레임
  // Python으로 치면: def animation_loop(timestamp): ...
  // -----------------------------------------------
  const animationLoop = useCallback((timestamp: number) => {
    const frames = framesRef.current
    if (frames.length === 0) return

    const frame = frames[frameIdxRef.current]
    const rawDelay = frame.delay || 100
    const delay = Math.max(rawDelay / speedMultiplierRef.current, 10)

    if (timestamp - lastFrameTimeRef.current >= delay) {
      const nextRaw = frameIdxRef.current + 1
      if (nextRaw >= frames.length) {
        if (!isLoopingRef.current) {
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

  const startAnimation = useCallback(() => {
    if (rafRef.current !== null) return
    lastFrameTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animationLoop)
    setIsPlaying(true)
  }, [animationLoop])

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsPlaying(false)
  }, [])

  useEffect(() => () => { stopAnimation() }, [stopAnimation])

  function handleTogglePlay() {
    if (isPlaying) stopAnimation()
    else startAnimation()
  }

  function handleStepFrame(delta: number) {
    if (gifFrames.length === 0) return
    stopAnimation()
    const nextIdx = (currentFrameIdx + delta + gifFrames.length) % gifFrames.length
    frameIdxRef.current = nextIdx
    setCurrentFrameIdx(nextIdx)
    renderFrame(gifFrames, nextIdx, null)
  }

  function handleJumpToFirst() {
    if (gifFrames.length === 0) return
    stopAnimation()
    frameIdxRef.current = 0
    setCurrentFrameIdx(0)
    renderFrame(gifFrames, 0, null)
  }

  function handleJumpToLast() {
    if (gifFrames.length === 0) return
    stopAnimation()
    const lastIdx = gifFrames.length - 1
    frameIdxRef.current = lastIdx
    setCurrentFrameIdx(lastIdx)
    renderFrame(gifFrames, lastIdx, null)
  }

  function handleScrub(idx: number) {
    if (gifFrames.length === 0) return
    stopAnimation()
    frameIdxRef.current = idx
    setCurrentFrameIdx(idx)
    renderFrame(gifFrames, idx, null)
  }

  function handleSetSpeed(s: 0.5 | 1 | 2) {
    speedMultiplierRef.current = s
    setSpeedMultiplier(s)
  }

  function handleToggleLoop() {
    const next = !isLoopingRef.current
    isLoopingRef.current = next
    setIsLooping(next)
  }

  // -----------------------------------------------
  // 신 포맷으로 content 직렬화하여 저장
  // Python으로 치면: def save_multi_content(images, width=None): update_block(...)
  // -----------------------------------------------
  function saveMultiContent(newImages: ImageItem[], newWidth?: number) {
    const data: { images: ImageItem[]; width?: number } = { images: newImages }
    if (newWidth !== undefined) data.width = newWidth
    updateBlock(pageId, block.id, JSON.stringify(data))
    if (newWidth !== undefined && block.canvasX !== undefined) {
      updateBlockCanvas(pageId, block.id, { w: newWidth })
    }
  }

  // -----------------------------------------------
  // 단일 이미지 모드용 저장 — GIF 플레이어 호환 레거시 래퍼
  // Python으로 치면: def save_single(src, width=None, caption=None): ...
  // -----------------------------------------------
  function saveSingleContent(newSrc: string, newWidth?: number, newCaption?: string) {
    const item: ImageItem = { ...(images[0] ?? {}), src: newSrc }
    if (newCaption) item.caption = newCaption
    else delete item.caption
    saveMultiContent([item], newWidth)
  }

  // -----------------------------------------------
  // 파일 여러 개 → 병렬 업로드 → images 배열에 추가
  // Python으로 치면: async def load_files(files): ...
  // -----------------------------------------------
  async function loadFiles(files: File[]) {
    const MAX_SIZE = 20 * 1024 * 1024  // 20MB — backend/core.py MAX_IMAGE_SIZE와 동기화

    // 클라이언트 사전 검증: 크기·형식 오류는 서버 요청 전에 바로 안내
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        toast.error(t.blocks.image.formatError)
        return
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} — ${t.blocks.image.sizeError}`)
        return
      }
    }

    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    setIsUploading(true)
    try {
      // 한 파일의 실패가 같은 묶음의 정상 이미지까지 버리게 하면 안 된다.
      // Promise.all은 하나라도 reject되면 이미 업로드된 파일 URL도 잃어버린다.
      const results = await Promise.allSettled(imageFiles.map(f => api.uploadImage(pageId, f)))
      const uploaded = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      const failedCount = results.length - uploaded.length
      if (uploaded.length === 0) {
        const failed = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        )
        throw failed?.reason ?? new Error(t.blocks.image.uploadError)
      }
      const newItems: ImageItem[] = uploaded.map(result => ({
        src: result.url,
        name: result.name,
        mime: result.mime,
        size: result.size,
      }))
      const merged = [...images, ...newItems]
      saveMultiContent(merged, savedWidth)
      const saved = await savePageNow(pageId)
      if (!saved) {
        toast.error('이미지는 업로드됐지만 메모 저장에 실패했습니다. 저장 버튼으로 다시 시도하세요.')
      }
      if (failedCount > 0) {
        toast.warning(`${uploaded.length}개 이미지를 추가했고 ${failedCount}개는 업로드하지 못했습니다.`)
      }
    } catch (err) {
      // api.ts에서 서버 detail 메시지를 Error.message에 담아 throw — 그대로 표시
      const msg = err instanceof Error ? err.message : t.blocks.image.uploadError
      toast.error(msg)
    } finally {
      setIsUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) loadFiles(files)
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
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) loadFiles(files)
  }

  // -----------------------------------------------
  // 원본 다운로드·드래그 파일명 헬퍼
  // Python으로 치면: def image_name(item, idx): return item.name or f'image-{idx + 1}.ext'
  // -----------------------------------------------
  function imageDownloadName(item: ImageItem, idx: number): string {
    if (item.name) return item.name
    try {
      const ext = new URL(item.src).pathname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.png'
      return `image-${String(idx + 1).padStart(2, '0')}${ext.toLowerCase()}`
    } catch {
      return `image-${String(idx + 1).padStart(2, '0')}.png`
    }
  }

  // 원본 바이트를 Blob으로 받은 뒤 브라우저 다운로드를 시작한다.
  // Python으로 치면: def download_image(item): requests.post(...).save(item.name)
  async function handleDownloadImage(item: ImageItem, idx: number, e?: React.SyntheticEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    const toastId = toast.loading(t.blocks.image.downloading)
    try {
      const blob = await api.downloadImage(pageId, item.src)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = imageDownloadName(item, idx)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      toast.success(t.blocks.image.downloadComplete, { id: toastId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.blocks.image.downloadError, { id: toastId })
    }
  }

  // 이미지 자체를 앱 밖으로 끌면 Electron은 원본 파일 드래그를 시작하고,
  // 일반 Chromium은 DownloadURL 형식으로 다운로드 드래그를 시도한다.
  // Python으로 치면: def drag_original(event, image): native_drag(image.path)
  function handleOriginalDragStart(e: React.DragEvent, item: ImageItem, idx: number) {
    e.stopPropagation()
    const name = imageDownloadName(item, idx)
    if (window.electronAPI?.startImageDrag) {
      e.preventDefault()
      window.electronAPI.startImageDrag({ url: item.src, name })
      return
    }
    const mime = item.mime || 'application/octet-stream'
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('DownloadURL', `${mime}:${name}:${item.src}`)
    e.dataTransfer.setData('text/uri-list', item.src)
  }

  // 다중 이미지의 순서 핸들 드래그 시작.
  // Python으로 치면: self.dragged_index = idx
  function handleReorderDragStart(e: React.DragEvent, idx: number) {
    e.stopPropagation()
    setDraggedImageIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-notion-image-index', String(idx))
  }

  function handleReorderDrop(e: React.DragEvent, targetIdx: number) {
    const raw = e.dataTransfer.getData('application/x-notion-image-index')
    if (!raw) return
    e.preventDefault()
    e.stopPropagation()
    const sourceIdx = Number(raw)
    setDraggedImageIdx(null)
    if (!Number.isInteger(sourceIdx) || sourceIdx === targetIdx || !images[sourceIdx]) return
    const reordered = [...images]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    saveMultiContent(reordered, savedWidth)
  }

  // -----------------------------------------------
  // 개별 이미지 삭제 — 해당 인덱스 제거 후 저장
  // Python으로 치면: def delete_image(idx): images.pop(idx); save()
  // -----------------------------------------------
  async function handleDeleteImage(idx: number) {
    const removedImage = images[idx]
    const newImages = images.filter((_, i) => i !== idx)
    if (newImages.length === 0) {
      // 전체 삭제 → 빈 상태로 초기화
      updateBlock(pageId, block.id, '')
    } else {
      saveMultiContent(newImages, savedWidth)
    }
    // 라이트박스가 열려있으면 닫기
    setLightboxIdx(null)

    // 본문 저장이 확인된 뒤에만 미참조 파일 정리를 시도한다. 복제본·Undo·
    // 버전 히스토리가 같은 URL을 참조하면 서버가 파일을 보존한다.
    const saved = await savePageNow(pageId)
    if (!saved) {
      toast.error('이미지 삭제 내용 저장에 실패했습니다. 저장 버튼으로 다시 시도하세요.')
      return
    }
    if (removedImage?.src) {
      try {
        await api.cleanupImage(pageId, removedImage.src)
      } catch {
        // 정리 실패는 표시 중인 본문이나 저장된 이미지를 손상시키지 않는다.
      }
    }
  }

  // 라이트박스에서 캡션 저장
  // Python으로 치면: def save_lightbox_caption(caption): images[idx].caption = caption
  function saveLightboxCaption() {
    if (lightboxIdx === null) return
    const newImages = images.map((img, i) =>
      i === lightboxIdx ? { ...img, caption: lightboxCaption || undefined } : img
    )
    saveMultiContent(newImages, savedWidth)
  }

  // -----------------------------------------------
  // 리사이즈 핸들 마우스다운 → 드래그로 너비 조절
  // Python으로 치면: def on_resize_start(event): ...
  // -----------------------------------------------
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isResizingRef.current) return
    isResizingRef.current = true

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
      // 단일/다중 모두 width만 업데이트
      saveMultiContent(images, finalWidth)
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

  // =============================================
  // ── 렌더링 분기 ──────────────────────────────
  // =============================================

  // ── 1. 빈 상태: 이미지가 없으면 업로드 영역 표시 ──
  if (images.length === 0) {
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
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        {isUploading ? (
          <>
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-400">{t.blocks.image.uploading}</p>
          </>
        ) : (
          <>
            <span className="text-3xl select-none">🖼️</span>
            <p className="text-sm text-gray-400">{t.blocks.image.multiInstruction}</p>
            <p className="text-xs text-gray-300">{t.blocks.image.formatInfo}</p>
          </>
        )}
      </div>
    )
  }

  // ── 2. 다중 이미지 모드: 그리드 + 라이트박스 ──────
  if (images.length > 1) {
    const colsClass = gridColsClass(images.length)

    return (
      <>
        {/* 드래그 리사이즈 중 커서 고정 오버레이 */}
        {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

        <div
          ref={containerRef}
          className="image-block-wrapper relative group/block my-1"
          style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 이미지 그리드 */}
          <div className={`grid ${colsClass} gap-1.5`}>
            {images.map((img, idx) => (
              // 개별 이미지 셀 — 4:3 비율 고정, 클릭 시 라이트박스 열기
              // Python으로 치면: ImageThumbnail(img, on_click=open_lightbox)
              <div
                key={idx}
                className={draggedImageIdx === idx
                  ? "relative group/cell aspect-4/3 overflow-hidden rounded-md bg-gray-100 cursor-pointer opacity-50 ring-2 ring-blue-400"
                  : "relative group/cell aspect-4/3 overflow-hidden rounded-md bg-gray-100 cursor-pointer"}
                onClick={() => setLightboxIdx(idx)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-notion-image-index')) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDrop={(e) => handleReorderDrop(e, idx)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- vault paths and data URLs are user-selected at runtime */}
                <img
                  src={img.src}
                  alt={img.caption ?? t.blocks.image.alt}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover/cell:scale-105"
                  draggable
                  onDragStart={(e) => handleOriginalDragStart(e, img, idx)}
                />

                {/* 호버 시 캡션 오버레이 — 캡션 있을 때만 표시 */}
                {img.caption && (
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                    <p className="text-xs text-white truncate">{img.caption}</p>
                  </div>
                )}

                {/* 원본 다운로드·순서 변경·삭제 버튼 */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => handleDownloadImage(img, idx, e)}
                    className="h-6 px-1.5 bg-black/60 text-white rounded flex items-center justify-center hover:bg-blue-600 text-xs"
                    title={t.blocks.image.downloadOriginal}
                  >
                    ↓
                  </button>
                  {!readMode && (
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => handleReorderDragStart(e, idx)}
                      onDragEnd={() => setDraggedImageIdx(null)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 px-1.5 bg-black/60 text-white rounded flex items-center justify-center hover:bg-gray-700 text-xs cursor-grab active:cursor-grabbing"
                      title={t.blocks.image.reorderTitle}
                    >
                      ⠿
                    </button>
                  )}
                  {!readMode && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteImage(idx) }}
                    className="w-6 h-6 bg-black/60 text-white rounded flex items-center justify-center hover:bg-red-500 text-xs"
                    title={t.blocks.image.deleteImageTitle}
                  >
                    ✕
                  </button>
                  )}
                </div>

                {/* 업로드 진행 스피너 */}
                {isUploading && idx === images.length - 1 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ))}

            {/* 편집 모드: 이미지 추가 버튼 셀 */}
            {!readMode && (
              <div
                className="aspect-4/3 rounded-md border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="text-2xl text-gray-300">+</span>
                <span className="text-xs text-gray-300">{t.blocks.image.addImage}</span>
              </div>
            )}
          </div>

          {/* 우측 리사이즈 핸들 */}
          {!readMode && (
            <div
              onMouseDown={handleResizeStart}
              className={isResizing
                ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
                : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/block:opacity-100 transition-opacity"}
              title={t.blocks.image.resizeTitle}
            >
              <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>

        {/* ── 라이트박스 ──────────────────────────────
            createPortal로 body에 마운트 → z-index 최상위 보장
            Python으로 치면: LightboxOverlay(images, current_idx)
            ─────────────────────────────────────────── */}
        {lightboxIdx !== null && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center bg-black/90"
            onClick={() => setLightboxIdx(null)}
          >
            {/* 이미지 컨테이너 — 클릭 버블링 차단 */}
            <div
              className="relative flex flex-col items-center max-w-[90vw] max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* 현재 이미지 */}
              {/* eslint-disable-next-line @next/next/no-img-element -- lightbox must display the runtime vault URL directly */}
              <img
                src={images[lightboxIdx].src}
                alt={images[lightboxIdx].caption ?? t.blocks.image.alt}
                className="max-w-[85vw] max-h-[75vh] object-contain rounded-lg shadow-2xl"
                draggable={false}
              />

              {/* 인덱스 표시 및 닫기 버튼 (우상단) */}
              <div className="absolute top-0 right-0 flex items-center gap-2 -translate-y-10">
                <span className="text-white/60 text-sm tabular-nums">
                  {lightboxIdx + 1} / {images.length}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleDownloadImage(images[lightboxIdx], lightboxIdx, e)}
                  className="text-white/80 hover:text-white text-sm h-8 px-3 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  title={t.blocks.image.downloadOriginal}
                >
                  ↓ {t.blocks.image.download}
                </button>
                <button
                  onClick={() => setLightboxIdx(null)}
                  className="text-white/80 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  title={t.blocks.image.lightboxClose}
                >
                  ✕
                </button>
              </div>

              {/* 이전 이미지 버튼 (좌측) */}
              <button
                onClick={() => setLightboxIdx(i => i !== null ? (i - 1 + images.length) % images.length : null)}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 w-10 h-10 bg-white/10 hover:bg-white/25 text-white rounded-full flex items-center justify-center transition-colors"
                title={t.blocks.image.lightboxPrev}
              >
                ←
              </button>

              {/* 다음 이미지 버튼 (우측) */}
              <button
                onClick={() => setLightboxIdx(i => i !== null ? (i + 1) % images.length : null)}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 w-10 h-10 bg-white/10 hover:bg-white/25 text-white rounded-full flex items-center justify-center transition-colors"
                title={t.blocks.image.lightboxNext}
              >
                →
              </button>

              {/* 캡션 입력 (하단) — 읽기 모드는 텍스트만, 편집 모드는 input */}
              <div className="mt-3 w-full">
                {readMode ? (
                  images[lightboxIdx].caption && (
                    <p className="text-white/70 text-sm text-center">{images[lightboxIdx].caption}</p>
                  )
                ) : (
                  <input
                    type="text"
                    value={lightboxCaption}
                    onChange={e => setLightboxCaption(e.target.value)}
                    onBlur={saveLightboxCaption}
                    placeholder={t.blocks.image.captionAdd}
                    className="w-full bg-transparent border-none outline-none text-white/60 text-sm text-center placeholder:text-white/30 focus:text-white/90"
                  />
                )}
              </div>

              {/* 하단 점 인디케이터 (이미지가 많을 때) */}
              {images.length <= 10 && (
                <div className="flex gap-1.5 mt-3">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === lightboxIdx ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'}`}
                    />
                  ))}
                </div>
              )}

              {/* 편집 모드: 현재 이미지 삭제 버튼 */}
              {!readMode && (
                <button
                  onClick={() => handleDeleteImage(lightboxIdx)}
                  className="mt-4 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs rounded-full transition-colors"
                  title={t.blocks.image.deleteImageTitle}
                >
                  {t.blocks.image.deleteBtn}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
      </>
    )
  }

  // ── 3. 단일 이미지 모드 ─────────────────────────
  // 이하는 기존 동작과 동일 (GIF 플레이어 + 리사이즈 + 캡션)

  const singleSrc = images[0].src
  const singleCaption = images[0].caption ?? ''
  // ── 단일 GIF 뷰어 ──────────────────────────────
  if (isGif) {
    const framesReady = gifFrames.length > 0

    return (
      <>
        {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

        <div
          ref={containerRef}
          className="image-block-wrapper relative group/img my-1 inline-block"
          style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : 'auto' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- GIF frame fallback uses a runtime vault URL */}
          <img
            src={singleSrc}
            alt={t.blocks.image.alt}
            className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
            style={{ display: framesReady ? 'none' : 'block' }}
            draggable
            onDragStart={(e) => handleOriginalDragStart(e, images[0], 0)}
          />
          <canvas
            ref={canvasRef}
            className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
            style={{ display: framesReady ? 'block' : 'none' }}
          />

          {isLoadingGif && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 rounded-full text-xs text-gray-500">
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                {t.blocks.image.gifLoadingFrames}
              </div>
            </div>
          )}

          {/* GIF 컨트롤 바 */}
          {framesReady && !isResizing && (
            <div className={readMode
              ? "absolute bottom-0 left-0 right-0 flex flex-col px-2 pt-1 pb-1.5 transition-opacity"
              : "absolute bottom-0 left-0 right-0 flex flex-col px-2 pt-1 pb-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity"}>
              <div className="absolute inset-0 bg-black/50 rounded-b-lg" />
              <div className="relative z-10 flex items-center gap-2 mb-1">
                <input
                  type="range" min={0} max={gifFrames.length - 1} value={currentFrameIdx}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  className="flex-1 h-1 cursor-pointer accent-white"
                  title={t.blocks.image.gifScrubber}
                />
                <span className="text-xs text-white/80 tabular-nums whitespace-nowrap">
                  {currentFrameIdx + 1} / {gifFrames.length}
                  <span className="text-white/50 ml-1">({gifFrames[currentFrameIdx]?.delay ?? 0}ms)</span>
                </span>
              </div>
              <div className="relative z-10 flex items-center justify-center gap-0.5">
                <button onClick={handleJumpToFirst} className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none" title={t.blocks.image.gifJumpFirst}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="2" height="10" rx="0.5" /><rect x="4" y="2" width="2" height="10" rx="0.5" /><path d="M13 3L6 7l7 4V3z" /></svg>
                </button>
                <button onClick={() => handleStepFrame(-1)} className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none" title={t.blocks.image.gifPrevFrame}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="2" height="10" rx="0.5" /><path d="M12 3L5 7l7 4V3z" /></svg>
                </button>
                <button onClick={handleTogglePlay} className="flex items-center justify-center w-8 h-8 rounded-full text-white bg-white/20 hover:bg-white/35 transition-colors select-none" title={isPlaying ? t.blocks.image.gifPause : t.blocks.image.gifPlay}>
                  {isPlaying ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" rx="0.5" /><rect x="7" y="1" width="3" height="10" rx="0.5" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l8 4-8 4V2z" /></svg>
                  )}
                </button>
                <button onClick={() => handleStepFrame(1)} className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none" title={t.blocks.image.gifNextFrame}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="11" y="2" width="2" height="10" rx="0.5" /><path d="M2 3l7 4-7 4V3z" /></svg>
                </button>
                <button onClick={handleJumpToLast} className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 transition-colors select-none" title={t.blocks.image.gifJumpLast}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="11" y="2" width="2" height="10" rx="0.5" /><rect x="8" y="2" width="2" height="10" rx="0.5" /><path d="M1 3l7 4-7 4V3z" /></svg>
                </button>
                <div className="w-px h-4 bg-white/20 mx-1" />
                <button onClick={handleToggleLoop} className={`flex items-center justify-center w-7 h-7 rounded transition-colors select-none ${isLooping ? 'text-white bg-white/20 hover:bg-white/30' : 'text-white/40 hover:bg-white/10'}`} title={isLooping ? t.blocks.image.gifLoopOn : t.blocks.image.gifLoopOff}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4h9a3 3 0 0 1 0 6H4" /><path d="M4 7L1 4l3-3" /></svg>
                </button>
                <div className="w-px h-4 bg-white/20 mx-1" />
                {([0.5, 1, 2] as const).map((s) => (
                  <button key={s} onClick={() => handleSetSpeed(s)} className={`text-xs px-1.5 py-0.5 rounded transition-colors select-none ${speedMultiplier === s ? 'bg-white/40 text-white' : 'text-white/50 hover:bg-white/20 hover:text-white'}`}>{s}×</button>
                ))}
              </div>
            </div>
          )}

          {/* 원본 다운로드/끌어내기 + 편집 버튼 */}
          {!isResizing && (
            <div className="absolute top-2 right-8 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <button
                type="button"
                draggable
                onDragStart={(e) => handleOriginalDragStart(e, images[0], 0)}
                onClick={(e) => handleDownloadImage(images[0], 0, e)}
                className="px-2 py-1 text-xs bg-white rounded shadow text-blue-600 hover:bg-blue-50 cursor-grab active:cursor-grabbing"
                title={t.blocks.image.dragOrDownload}
              >
                ↓ {t.blocks.image.download}
              </button>
              {!readMode && (
                <>
                  <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-xs bg-white rounded shadow text-gray-600 hover:bg-gray-100" title={t.blocks.image.addImage}>
                    + {t.blocks.image.addImage}
                  </button>
                  <button onClick={() => handleDeleteImage(0)} className="px-2 py-1 text-xs bg-white rounded shadow text-red-500 hover:bg-red-50" title={t.blocks.image.deleteTitle}>
                    {t.blocks.image.deleteBtn}
                  </button>
                </>
              )}
            </div>
          )}

          <div
            onMouseDown={handleResizeStart}
            className={isResizing
              ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
              : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/img:opacity-100 transition-opacity"}
            title={t.blocks.image.resizeTitle}
          >
            <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>

        {/* 캡션 */}
        <div className="block" style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}>
          <input
            type="text"
            defaultValue={singleCaption}
            onBlur={(e) => saveSingleContent(singleSrc, savedWidth, e.target.value || undefined)}
            placeholder={t.blocks.image.captionAdd}
            className="w-full text-center text-xs text-gray-400 bg-transparent border-none outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400 mt-1 py-0.5"
          />
        </div>
      </>
    )
  }

  // ── 단일 일반 이미지 ─────────────────────────────
  return (
    <>
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

      <div
        ref={containerRef}
        className="image-block-wrapper relative group/img my-1 inline-block"
        style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : 'auto' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- memo image paths are resolved by the local vault server */}
        <img
          src={singleSrc}
          alt={t.blocks.image.alt}
          className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
          style={{ contain: 'layout' }}
          draggable
          onDragStart={(e) => handleOriginalDragStart(e, images[0], 0)}
        />

        {!isResizing && (
          <div className="absolute top-2 right-8 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <button
              type="button"
              draggable
              onDragStart={(e) => handleOriginalDragStart(e, images[0], 0)}
              onClick={(e) => handleDownloadImage(images[0], 0, e)}
              className="px-2 py-1 text-xs bg-white rounded shadow text-blue-600 hover:bg-blue-50 cursor-grab active:cursor-grabbing"
              title={t.blocks.image.dragOrDownload}
            >
              ↓ {t.blocks.image.download}
            </button>
            {!readMode && (
              <>
                <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-xs bg-white rounded shadow text-gray-600 hover:bg-gray-100" title={t.blocks.image.addImage}>
                  + {t.blocks.image.addImage}
                </button>
                <button onClick={() => handleDeleteImage(0)} className="px-2 py-1 text-xs bg-white rounded shadow text-red-500 hover:bg-red-50" title={t.blocks.image.deleteTitle}>
                  {t.blocks.image.deleteBtn}
                </button>
              </>
            )}
          </div>
        )}

        <div
          onMouseDown={handleResizeStart}
          className={isResizing
            ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
            : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/img:opacity-100 transition-opacity"}
          title={t.blocks.image.resizeTitle}
        >
          <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
      </div>

      {/* 캡션 */}
      <div className="block" style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}>
        <input
          type="text"
          defaultValue={singleCaption}
          onBlur={(e) => saveSingleContent(singleSrc, savedWidth, e.target.value || undefined)}
          placeholder={t.blocks.image.captionAdd}
          className="w-full text-center text-xs text-gray-400 bg-transparent border-none outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400 mt-1 py-0.5"
        />
      </div>
    </>
  )
}
