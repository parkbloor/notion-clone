// ==============================================
// src/components/editor/VersionHistoryPanel.tsx
// 역할: 페이지 버전 히스토리 슬라이드-인 패널
//   - 버전 목록 (최신순, 타임스탬프 + 블록 수 + 제목)
//   - 버전 클릭 → 읽기전용 미리보기 (블록 타입·텍스트 나열)
//   - "이 버전으로 복원" 버튼 → 확인 후 복원 + 페이지 리로드
// Python으로 치면: class VersionHistoryPanel(QWidget): ...
// ==============================================

'use client'

import { useState, useEffect } from 'react'
import { historyApi, HistoryVersion } from '@/lib/api'
import { usePageStore } from '@/store/pageStore'
import { toast } from 'sonner'
import { Page } from '@/types/block'

interface VersionHistoryPanelProps {
  pageId: string
  onClose: () => void
}

// ── 타임스탬프 포맷 헬퍼 ────────────────────────────
// "2026-03-17T11-17-22.nct" → "2026-03-17 11:17:22" 가독성 있는 형식으로 변환
// Python으로 치면: def fmt_ts(ts): return datetime.fromisoformat(ts).strftime('%Y-%m-%d %H:%M')
function formatTimestamp(snapshotAt: string): string {
  try {
    const d = new Date(snapshotAt)
    if (isNaN(d.getTime())) return snapshotAt
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch {
    return snapshotAt
  }
}

// ── 경과 시간 표시 헬퍼 ──────────────────────────────
// Python으로 치면: def time_ago(ts): return f'{diff.days}일 전' if diff.days > 0 else '오늘'
function timeAgo(snapshotAt: string): string {
  try {
    const diff = Date.now() - new Date(snapshotAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return `${Math.floor(days / 7)}주 전`
  } catch {
    return ''
  }
}

// ── 블록 타입 라벨 ───────────────────────────────────
// Python으로 치면: BLOCK_TYPE_LABELS = {'paragraph': '텍스트', 'heading1': 'H1', ...}
const BLOCK_LABELS: Record<string, string> = {
  paragraph: '텍스트', heading1: 'H1', heading2: 'H2', heading3: 'H3',
  heading4: 'H4', heading5: 'H5', heading6: 'H6',
  bulletList: '• 목록', orderedList: '1. 목록', taskList: '☐ 할일',
  code: '코드', image: '이미지', table: '표', divider: '구분선',
  toggle: '토글', kanban: '칸반', admonition: '콜아웃',
  canvas: '캔버스', excalidraw: '손그림', video: '비디오',
  math: '수식', embed: '임베드', mermaid: 'Mermaid',
}

export default function VersionHistoryPanel({ pageId, onClose }: VersionHistoryPanelProps) {
  // ── 상태 ─────────────────────────────────────────
  // 버전 목록
  const [versions, setVersions] = useState<HistoryVersion[]>([])
  // 로딩 중 여부
  const [loading, setLoading] = useState(true)
  // 미리보기 중인 버전 데이터 (null이면 목록 화면)
  // Python으로 치면: self.preview_page: Page | None = None
  const [previewPage, setPreviewPage] = useState<Page | null>(null)
  const [previewVersion, setPreviewVersion] = useState<HistoryVersion | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // 복원 확인 UI
  const [restoring, setRestoring] = useState(false)

  const { loadFromServer } = usePageStore()

  // ── 버전 목록 로드 ───────────────────────────────
  // Python으로 치면: async def load_versions(self): self.versions = await api.list(page_id)
  useEffect(() => {
    historyApi.list(pageId)
      .then(vs => setVersions(vs))
      .catch(() => toast.error('버전 목록을 불러올 수 없습니다'))
      .finally(() => setLoading(false))
  }, [pageId])

  // ── 미리보기 로드 ─────────────────────────────────
  // Python으로 치면: async def load_preview(self, version): self.preview = await api.get(page_id, version.filename)
  async function handlePreview(version: HistoryVersion) {
    setPreviewLoading(true)
    try {
      const page = await historyApi.get(pageId, version.filename)
      setPreviewPage(page)
      setPreviewVersion(version)
    } catch {
      toast.error('미리보기를 불러올 수 없습니다')
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── 버전 복원 ────────────────────────────────────
  // Python으로 치면: async def restore(self, version): await api.restore(page_id, filename); reload()
  async function handleRestore(version: HistoryVersion) {
    setRestoring(true)
    try {
      await historyApi.restore(pageId, version.filename)
      toast.success('버전이 복원됐습니다. 페이지를 다시 불러옵니다...')
      onClose()
      // 서버에서 최신 데이터로 재로드
      await loadFromServer()
    } catch {
      toast.error('버전 복원에 실패했습니다')
    } finally {
      setRestoring(false)
    }
  }

  // ── HTML 태그 제거 (블록 내용 텍스트 추출) ──────────
  // Python으로 치면: def strip_html(html): return re.sub(r'<[^>]+>', '', html).strip()
  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  }

  // ── 렌더링 ───────────────────────────────────────
  return (
    // 오버레이 + 슬라이드인 패널
    // Python으로 치면: self.overlay = QWidget(); self.panel = QWidget()
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>

      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* 패널 본체 */}
      <div className="relative w-80 h-full bg-white border-l border-gray-200 shadow-xl flex flex-col">

        {/* ── 헤더 ──────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          {previewPage ? (
            // 미리보기 모드 헤더
            <button
              type="button"
              onClick={() => { setPreviewPage(null); setPreviewVersion(null) }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <span>←</span>
              <span>버전 목록으로</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-base">⏱</span>
              <span className="text-sm font-semibold text-gray-700">버전 기록</span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* ── 본문 ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* 로딩 중 */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              불러오는 중...
            </div>
          )}

          {/* 버전 없음 */}
          {!loading && !previewPage && versions.length === 0 && (
            <div className="px-4 py-16 text-center">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm text-gray-400">아직 저장된 버전이 없습니다</p>
              <p className="text-xs text-gray-300 mt-1">페이지를 편집하면 5분 간격으로<br />자동 저장됩니다</p>
            </div>
          )}

          {/* ── 버전 목록 ─────────────────────────────── */}
          {!loading && !previewPage && versions.length > 0 && (
            <div className="py-2">
              {/* 현재 버전 표시 */}
              <div className="px-4 py-2.5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-gray-700">현재 버전</div>
                    <div className="text-[10px] text-gray-400">자동 저장 중</div>
                  </div>
                </div>
              </div>

              {/* 스냅샷 목록 */}
              {versions.map((version, idx) => (
                <div
                  key={version.filename}
                  className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group"
                >
                  {/* 타임스탬프 + 경과 시간 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* 타임라인 점 */}
                      <span className="w-2 h-2 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 truncate">
                          {formatTimestamp(version.snapshotAt)}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {timeAgo(version.snapshotAt)} · 블록 {version.blockCount}개
                        </div>
                        {/* 제목이 현재와 다르면 표시 */}
                        {idx === 0 || versions[idx - 1]?.title !== version.title ? (
                          <div className="text-[10px] text-gray-500 truncate mt-0.5">
                            📄 {version.title || '제목 없음'}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* 버튼 — hover 시 표시 */}
                  <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 미리보기 버튼 */}
                    <button
                      type="button"
                      onClick={() => handlePreview(version)}
                      disabled={previewLoading}
                      className="flex-1 py-1 text-[10px] text-gray-500 border border-gray-200 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      미리보기
                    </button>
                    {/* 복원 버튼 */}
                    <button
                      type="button"
                      onClick={() => handleRestore(version)}
                      disabled={restoring}
                      className="flex-1 py-1 text-[10px] text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      {restoring ? '복원 중...' : '이 버전으로'}
                    </button>
                  </div>
                </div>
              ))}

              {/* 안내 문구 */}
              <div className="px-4 py-3 text-[10px] text-gray-300 text-center">
                최대 50개 버전 보관 · 3분 간격 자동 저장
              </div>
            </div>
          )}

          {/* ── 미리보기 화면 ───────────────────────────── */}
          {previewPage && previewVersion && (
            <div className="py-2">
              {/* 버전 정보 */}
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                <div className="text-xs font-medium text-amber-700">
                  {formatTimestamp(previewVersion.snapshotAt)}
                </div>
                <div className="text-[10px] text-amber-500 mt-0.5">
                  블록 {previewVersion.blockCount}개 · 읽기전용 미리보기
                </div>
              </div>

              {/* 페이지 제목 */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span>{(previewPage as unknown as Record<string,string>).icon || '📄'}</span>
                  <span className="font-semibold text-sm text-gray-800">
                    {(previewPage as unknown as Record<string,string>).title || '제목 없음'}
                  </span>
                </div>
              </div>

              {/* 블록 목록 — 타입 + 텍스트 미리보기 */}
              <div className="px-4 py-2 space-y-1">
                {((previewPage as unknown as {blocks: Array<{id:string; type:string; content:string}>}).blocks ?? []).map(block => {
                  const label = BLOCK_LABELS[block.type] ?? block.type
                  // 블록 내용 텍스트 추출 (HTML 태그 제거)
                  let text = ''
                  if (block.type === 'image') {
                    text = '이미지'
                  } else if (block.type === 'divider') {
                    text = '───'
                  } else {
                    try {
                      // toggle/kanban 같은 JSON 블록은 header만 추출
                      const parsed = JSON.parse(block.content)
                      text = stripHtml(parsed.header ?? parsed.title ?? '') || '(내용 없음)'
                    } catch {
                      text = stripHtml(block.content) || '(내용 없음)'
                    }
                  }
                  return (
                    <div key={block.id} className="flex items-start gap-2 py-1">
                      {/* 블록 타입 배지 */}
                      <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-400 mt-0.5 min-w-7 text-center">
                        {label}
                      </span>
                      {/* 내용 미리보기 */}
                      <span className="text-xs text-gray-600 leading-relaxed truncate">{text}</span>
                    </div>
                  )
                })}
              </div>

              {/* 복원 버튼 (미리보기 화면 하단) */}
              <div className="px-4 py-3 border-t border-gray-100 mt-2">
                <button
                  type="button"
                  onClick={() => handleRestore(previewVersion)}
                  disabled={restoring}
                  className="w-full py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  {restoring ? '복원 중...' : '이 버전으로 복원'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
