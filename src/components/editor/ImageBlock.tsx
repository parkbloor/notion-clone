// =============================================
// src/components/editor/ImageBlock.tsx
// 역할: 이미지 블록 — 업로드 UI, 이미지 표시, 우측 핸들로 너비 조절
// Python으로 치면: class ImageBlock(Widget): def render(self): ...
// =============================================

'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { api } from '@/lib/api'

interface ImageBlockProps {
  block: Block
  pageId: string
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
  // 구 포맷 호환: plain data URL 그대로 src로 사용
  return { src: content }
}

export default function ImageBlock({ block, pageId }: ImageBlockProps) {
  const { updateBlock, updateBlockCanvas } = usePageStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  // 이미지 컨테이너 DOM 참조 — 리사이즈 시 실제 렌더링 너비 측정용
  // Python으로 치면: container_ref = None
  const containerRef = useRef<HTMLDivElement>(null)

  // 드래그 오버 상태 (업로드 영역 색상 변경용)
  const [isDragOver, setIsDragOver] = useState(false)
  // 리사이즈 드래그 중 여부
  // Python으로 치면: is_resizing = False
  const [isResizing, setIsResizing] = useState(false)
  // 리사이즈 중에만 사용하는 임시 너비 (매 mousemove마다 업데이트)
  // Python으로 치면: local_width: int | None = None
  const [localWidth, setLocalWidth] = useState<number | undefined>(undefined)
  // 서버 업로드 진행 중 여부 — true이면 스피너 표시
  // Python으로 치면: is_uploading = False
  const [isUploading, setIsUploading] = useState(false)

  // content에서 src, 저장된 너비, 캡션 파싱
  const { src, width: savedWidth, caption: savedCaption } = parseContent(block.content)

  // ── 캡션 로컬 상태 ───────────────────────────────
  // 로컬 편집 중 caption 값 (blur 시 저장)
  // Python으로 치면: self.caption_local = saved_caption or ''
  const [localCaption, setLocalCaption] = useState(savedCaption ?? '')

  // -----------------------------------------------
  // 실제 렌더링에 사용할 너비
  // 리사이즈 중: localWidth (마우스 이동에 따라 실시간 변경)
  // 리사이즈 아닐 때: savedWidth (스토어에 저장된 값)
  // Python으로 치면: display_width = local_width if is_resizing else saved_width
  // -----------------------------------------------
  const displayWidth = isResizing ? localWidth : savedWidth

  // 유효한 이미지 src 여부
  // data:image/ — 구 포맷 base64 (legacy 표시 전용, 신규 저장 금지)
  // http — 서버 업로드 후 받은 정상 URL
  const hasValidImage = src.startsWith('data:image/') || src.startsWith('http')

  // -----------------------------------------------
  // content를 JSON으로 직렬화하여 저장
  // caption이 있으면 같이 저장, undefined면 필드 제외
  // 캔버스 모드에서는 canvasW도 동기화 (블록 컨테이너 크기 반영)
  // Python으로 치면: def save_content(src, width=None, caption=None): update_block(...)
  // -----------------------------------------------
  function saveContent(newSrc: string, newWidth?: number, newCaption?: string) {
    const data: { src: string; width?: number; caption?: string } = { src: newSrc }
    if (newWidth !== undefined) data.width = newWidth
    if (newCaption !== undefined && newCaption !== '') data.caption = newCaption
    updateBlock(pageId, block.id, JSON.stringify(data))
    // 캔버스 모드에서 이미지 너비 변경 시 캔버스 블록 컨테이너 너비도 동기화
    // Python으로 치면: if block.canvas_x is not None and new_width: update_canvas(w=new_width)
    if (newWidth !== undefined && block.canvasX !== undefined) {
      updateBlockCanvas(pageId, block.id, { w: newWidth })
    }
  }

  // -----------------------------------------------
  // 파일 → 서버 업로드 후 URL 저장
  // 업로드 실패 시 base64 저장 금지 — vault 파일 비대화 방지
  // Python으로 치면:
  //   async def load_file(file):
  //       try: url = await api.upload(file); save(url)
  //       except: toast.error(...); return  # base64 저장 안 함
  // -----------------------------------------------
  async function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setIsUploading(true)
    try {
      // 서버에 실제 파일로 저장 → URL만 반환받아 블록에 저장
      const url = await api.uploadImage(pageId, file)
      saveContent(url, savedWidth, localCaption || undefined)
    } catch {
      // 업로드 실패 시 에러 표시만 — base64 fallback 제거
      toast.error('이미지 업로드에 실패했습니다. 서버 연결을 확인해 주세요.')
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
  //       start_x = event.clientX
  //       start_width = img.offsetWidth
  //       document.onmousemove = lambda e: set_width(start_width + e.clientX - start_x)
  //       document.onmouseup = lambda e: save(final_width)
  // -----------------------------------------------
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    // 리사이즈 시작 시점의 실제 렌더링 너비, 부모 최대 너비 측정
    const imgEl = containerRef.current?.querySelector('img') as HTMLImageElement | null
    const startWidth = imgEl ? imgEl.offsetWidth : (savedWidth ?? 400)
    // 부모 너비를 상한으로 사용 (본문 초과 방지)
    // Python으로 치면: max_width = container.parent.offsetWidth or float('inf')
    const maxWidth = containerRef.current?.parentElement?.offsetWidth ?? Infinity
    const startX = e.clientX

    setLocalWidth(startWidth)
    setIsResizing(true)

    // mousemove: delta만큼 너비 업데이트 (최소 100px, 최대 부모 너비)
    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.min(maxWidth, Math.max(100, startWidth + (ev.clientX - startX)))
      setLocalWidth(newWidth)
    }

    // mouseup: 최종 너비를 스토어에 저장하고 리사이즈 종료
    function onMouseUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      const finalWidth = Math.min(maxWidth, Math.max(100, startWidth + (ev.clientX - startX)))
      setLocalWidth(finalWidth)
      setIsResizing(false)
      saveContent(src, finalWidth, localCaption || undefined)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
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
          // 업로드 진행 중 스피너
          // Python으로 치면: show_spinner()
          <>
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-400">업로드 중...</p>
          </>
        ) : (
          <>
            <span className="text-3xl select-none">🖼️</span>
            <p className="text-sm text-gray-400">클릭하거나 이미지를 드래그하여 업로드</p>
            <p className="text-xs text-gray-300">PNG, JPG, GIF, WebP 지원</p>
          </>
        )}
      </div>
    )
  }

  // ── 이미지 표시 + 리사이즈 핸들 ──────────────
  return (
    <>
      {/* -----------------------------------------------
          리사이즈 중에 전체 화면 오버레이로 커서 스타일 고정
          마우스가 이미지 밖으로 나가도 col-resize 커서 유지
          Python으로 치면: if is_resizing: show_overlay()
          ----------------------------------------------- */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      {/* 이미지 컨테이너
          inline-block: 이미지 실제 너비만큼만 차지 (핸들이 이미지 오른쪽 끝에 위치)
          max-w-full: 부모 너비를 초과하지 않음 */}
      <div
        ref={containerRef}
        className="image-block-wrapper relative group/img my-1 inline-block"
        style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : 'auto' }}
      >
        <img
          src={src}
          alt="업로드된 이미지"
          // displayWidth가 있으면 컨테이너를 꽉 채움, 없으면 자연 크기
          className={displayWidth ? "block w-full rounded-lg" : "block max-w-full rounded-lg"}
          // 브라우저 기본 드래그 방지 (리사이즈 핸들과 충돌 방지)
          draggable={false}
        />

        {/* ── 호버 시 버튼 (교체/삭제) ──────────────
            리사이즈 중에는 숨김, 리사이즈 핸들과 겹치지 않게 right-8 */}
        {!isResizing && (
          <div className="absolute top-2 right-8 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 text-xs bg-white rounded shadow text-gray-600 hover:bg-gray-100"
              title="이미지 교체"
            >
              교체
            </button>
            <button
              onClick={() => updateBlock(pageId, block.id, '')}
              className="px-2 py-1 text-xs bg-white rounded shadow text-red-500 hover:bg-red-50"
              title="이미지 삭제"
            >
              삭제
            </button>
          </div>
        )}

        {/* ── 우측 리사이즈 핸들 ────────────────────
            absolute right-0: 이미지 오른쪽 끝에 붙음
            w-3: 드래그 영역 (12px)
            내부 파란 막대: 시각적 인디케이터
            Python으로 치면: resize_handle = DragHandle(side='right') */}
        <div
          onMouseDown={handleResizeStart}
          className={isResizing
            ? "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10"
            : "absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-0 group-hover/img:opacity-100 transition-opacity"}
          title="드래그하여 크기 조절"
        >
          {/* 파란 수직 막대 — 리사이즈 핸들 시각 표시 */}
          <div className="w-1 h-10 bg-blue-400 rounded-full shadow" />
        </div>

        {/* 숨겨진 파일 인풋 (교체용) */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </div>

      {/* ── 캡션 입력란 ─────────────────────────────
          이미지 바로 아래에 표시, 중앙 정렬
          blur 시 스토어에 저장 (onChange는 로컬 상태만 업데이트)
          Python으로 치면: caption_input = LineEdit(placeholder='설명 추가...')  */}
      <div
        className="block"
        style={{ width: displayWidth ? `min(${displayWidth}px, 100%)` : '100%' }}
      >
        <input
          type="text"
          value={localCaption}
          onChange={(e) => setLocalCaption(e.target.value)}
          onBlur={() => saveContent(src, savedWidth, localCaption || undefined)}
          placeholder="설명 추가..."
          className="w-full text-center text-xs text-gray-400 bg-transparent border-none outline-none placeholder:text-gray-300 focus:placeholder:text-gray-400 mt-1 py-0.5"
        />
      </div>
    </>
  )
}
