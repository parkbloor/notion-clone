// =============================================
// src/components/editor/FileBlock.tsx
// 역할: 일반 파일 첨부 블록 (PDF / docx / zip 등)
// /파일 슬래시 커맨드로 생성. 파일 업로드 → 아이콘+이름+크기 표시 + 다운로드.
// Python으로 치면: class FileBlock: def upload(self, file): save(); render_preview()
// =============================================

'use client'

import { useRef, useState, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useLocale } from '@/locales'

interface FileBlockProps {
  block: Block      // 현재 파일 블록
  pageId: string    // 소속 페이지 ID
}

// -----------------------------------------------
// 파일 content JSON 포맷
// Python으로 치면: @dataclass class FileContent: url str; name str; size int; ext str
// -----------------------------------------------
interface FileContent {
  url: string    // 백엔드 정적 파일 URL
  name: string   // 원본 파일명 (표시용)
  size: number   // 바이트 단위 파일 크기
  ext: string    // 확장자 (소문자, 예: '.pdf')
}

// -----------------------------------------------
// 파일 크기 → 사람이 읽기 쉬운 문자열 (KB / MB / GB)
// Python으로 치면: def format_bytes(n): ...
// -----------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// -----------------------------------------------
// 확장자 → 이모지 아이콘
// Python으로 치면: EXT_ICON = {'.pdf': '🔴', '.docx': '📘', ...}
// -----------------------------------------------
function getFileIcon(ext: string): string {
  const e = ext.toLowerCase()
  if (e === '.pdf') return '🔴'
  if (['.doc', '.docx'].includes(e)) return '📘'
  if (['.xls', '.xlsx', '.csv'].includes(e)) return '📗'
  if (['.ppt', '.pptx'].includes(e)) return '📙'
  if (['.zip', '.rar', '.7z'].includes(e)) return '🗜'
  if (['.md', '.txt'].includes(e)) return '📄'
  if (e === '.json') return '📋'
  return '📎'
}

// 허용 확장자 목록 (백엔드와 동일)
const ALLOWED_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.csv', '.json', '.zip', '.rar', '.7z',
])

// -----------------------------------------------
// JSON 안전 파싱 — 내용이 없거나 파싱 실패 시 null 반환
// Python으로 치면: def parse_content(s): return json.loads(s) if s else None
// -----------------------------------------------
function parseContent(content: string): FileContent | null {
  if (!content || content.trim() === '' || content.startsWith('<')) return null
  try {
    const parsed = JSON.parse(content)
    if (parsed?.url) return parsed as FileContent
    return null
  } catch {
    return null
  }
}

export default function FileBlock({ block, pageId }: FileBlockProps) {
  const { updateBlock } = usePageStore()
  const t = useLocale()

  // 현재 파일 정보 (업로드 완료 후 저장된 content)
  const fileData = parseContent(block.content)

  // 업로드 중 상태
  const [uploading, setUploading] = useState(false)
  // 드래그오버 상태
  const [dragOver, setDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // -----------------------------------------------
  // 파일 업로드 처리
  // Python으로 치면: async def handle_upload(file): url = await api.upload(file); save(url)
  // -----------------------------------------------
  const handleFile = useCallback(async (file: File) => {
    const ext = '.' + file.name.split('.').pop()!.toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      toast.error(t.blocks.file.typeError)
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error(t.blocks.file.sizeError)
      return
    }

    setUploading(true)
    try {
      const result = await api.uploadFile(pageId, file)
      const content: FileContent = {
        url: result.url,
        name: result.name,
        size: result.size,
        ext: result.ext,
      }
      updateBlock(pageId, block.id, JSON.stringify(content))
    } catch (e) {
      toast.error((e as Error).message ?? t.blocks.file.uploadError)
    } finally {
      setUploading(false)
    }
  }, [pageId, block.id, updateBlock])

  // 파일 input change 핸들러
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // 드래그앤드롭 핸들러들
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave() {
    setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // -----------------------------------------------
  // 다운로드 버튼 클릭
  // Python으로 치면: def download(url, name): open browser download link
  // -----------------------------------------------
  function handleDownload() {
    if (!fileData) return
    const a = document.createElement('a')
    a.href = fileData.url
    a.download = fileData.name
    a.click()
  }

  // ──────────────────────────────────────────────
  // 업로드 완료 상태: 파일 정보 표시
  // ──────────────────────────────────────────────
  if (fileData) {
    return (
      <div className="my-1 flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors group">
        {/* 확장자 아이콘 */}
        <span className="text-2xl shrink-0">{getFileIcon(fileData.ext)}</span>

        {/* 파일 정보 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{fileData.name}</p>
          <p className="text-xs text-gray-400">{formatBytes(fileData.size)}</p>
        </div>

        {/* 다운로드 버튼 */}
        <button
          type="button"
          onClick={handleDownload}
          title={t.blocks.file.downloadTitle}
          className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors font-medium"
        >
          {t.blocks.file.download}
        </button>
      </div>
    )
  }

  // ──────────────────────────────────────────────
  // 미업로드 상태: 파일 선택 UI (클릭 또는 드래그앤드롭)
  // ──────────────────────────────────────────────
  return (
    <div
      className={[
        'my-1 flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-lg border-2 border-dashed transition-colors cursor-pointer',
        dragOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100',
      ].join(' ')}
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 숨겨진 파일 input */}
      <input
        ref={inputRef}
        type="file"
        accept={Array.from(ALLOWED_EXTS).join(',')}
        className="hidden"
        onChange={handleInputChange}
      />

      {uploading ? (
        // 업로드 중 스피너
        <>
          <div className="w-8 h-8 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" />
          <p className="text-sm text-gray-500">{t.blocks.file.uploading}</p>
        </>
      ) : (
        // 기본 안내 UI
        <>
          <span className="text-3xl">📎</span>
          <p className="text-sm font-medium text-gray-600">
            {t.blocks.file.instruction}
          </p>
          <p className="text-xs text-gray-400">
            {t.blocks.file.formatInfo}
          </p>
        </>
      )}
    </div>
  )
}
