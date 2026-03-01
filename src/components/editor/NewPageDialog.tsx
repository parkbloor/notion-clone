// ==============================================
// src/components/editor/NewPageDialog.tsx
// 역할: 새 페이지 생성 다이얼로그 — 갤러리 카드 그리드 UI
//   - 빈 페이지 / 마크다운 템플릿 / 그리드 템플릿 카드로 표시
//   - 선택 → 페이지 생성 → 템플릿 적용
// Python으로 치면: class NewPageDialog(QDialog): ...
// ==============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { templateApi, Template } from '@/lib/api'
import { usePageStore } from '@/store/pageStore'
import { gridCellsToBlocks, isGridTemplate, GridTemplateContent } from '@/lib/templateGrid'

interface NewPageDialogProps {
  categoryId: string | null
  onClose: () => void
}

// -----------------------------------------------
// 템플릿 아이콘 → 배경 색상 매핑
// 아이콘 유형별로 카드 상단 색상을 다르게
// Python으로 치면: def icon_to_color(icon: str) -> str: ...
// -----------------------------------------------
function iconToColor(icon: string): string {
  const map: Record<string, string> = {
    '📋': 'from-blue-400 to-blue-500',
    '📊': 'from-indigo-400 to-indigo-500',
    '📅': 'from-amber-400 to-amber-500',
    '📖': 'from-green-400 to-green-500',
    '🎯': 'from-red-400 to-red-500',
    '📄': 'from-gray-300 to-gray-400',
    '✏️': 'from-purple-400 to-purple-500',
    '💡': 'from-yellow-400 to-yellow-500',
    '🗒️': 'from-teal-400 to-teal-500',
    '🔖': 'from-pink-400 to-pink-500',
  }
  return map[icon] ?? 'from-gray-400 to-gray-500'
}

export default function NewPageDialog({ categoryId, onClose }: NewPageDialogProps) {

  // 서버에서 불러온 템플릿 목록
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)

  // 오버레이 ref (외부 클릭 감지)
  const overlayRef = useRef<HTMLDivElement>(null)

  const { addPage, applyTemplate, setPageBlocks } = usePageStore()

  // ── 마운트 시 템플릿 목록 로드 ───────────────
  useEffect(() => {
    templateApi.getAll()
      .then(setTemplates)
      .catch(() => toast.error('템플릿 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  // ── Esc / 오버레이 클릭 → 닫기 ─────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // ── 빈 페이지 생성 ────────────────────────────
  // Python으로 치면: async def create_blank(): await store.add_page(None, category_id)
  async function handleBlankPage() {
    setApplying(true)
    try {
      await addPage(undefined, categoryId)
      onClose()
    } catch {
      toast.error('페이지 생성에 실패했습니다.')
    } finally {
      setApplying(false)
    }
  }

  // ── 템플릿으로 페이지 생성 ────────────────────
  // Python으로 치면: async def create_from_template(template): ...
  async function handleTemplate(template: Template) {
    setApplying(true)
    try {
      // 1. 빈 페이지 생성
      await addPage(template.name, categoryId)

      // 2. 생성된 페이지 ID 가져오기
      const pageId = usePageStore.getState().currentPageId
      if (!pageId) { onClose(); return }

      // 3. 템플릿 내용 적용 (그리드 or 마크다운)
      if (isGridTemplate(template.content)) {
        // Python으로 치면: if is_grid_template(content): apply_grid(cells)
        const gridData = JSON.parse(template.content) as GridTemplateContent
        const blocks = gridCellsToBlocks(gridData.cells, gridData.gridCols ?? 12)
        setPageBlocks(pageId, blocks)
      } else if (template.content.trim()) {
        // Python으로 치면: else: apply_markdown(content)
        applyTemplate(pageId, template.content)
      }

      onClose()
    } catch {
      toast.error('템플릿 적용에 실패했습니다.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* ── 다이얼로그 박스 (넓게) ── */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[85vh]">

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">새 페이지 만들기</h2>
            <p className="text-xs text-gray-400 mt-0.5">빈 페이지로 시작하거나 템플릿을 선택하세요</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* 본문 — 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ── 카드 그리드 ── */}
          {/* Python으로 치면: grid = QGridLayout(); grid.setColumns(3) */}
          <div className="grid grid-cols-3 gap-3">

            {/* ── 빈 페이지 카드 ── */}
            <button
              type="button"
              onClick={handleBlankPage}
              disabled={applying}
              className="flex flex-col rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group disabled:opacity-50"
            >
              {/* 카드 상단 색상 영역 */}
              <div className="w-full h-20 bg-linear-to-br from-gray-200 to-gray-300 flex items-center justify-center group-hover:from-blue-100 group-hover:to-blue-200 transition-colors">
                <span className="text-4xl opacity-60">📄</span>
              </div>
              {/* 카드 본문 */}
              <div className="p-3 bg-white flex-1">
                <p className="text-sm font-semibold text-gray-800">빈 페이지</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">아무 내용 없이 시작합니다</p>
              </div>
            </button>

            {/* ── 로딩 스켈레톤 ── */}
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-xl overflow-hidden border border-gray-100 animate-pulse">
                <div className="w-full h-20 bg-gray-100" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}

            {/* ── 템플릿 카드 목록 ── */}
            {/* Python으로 치면: for template in templates: render_card(template) */}
            {templates.map(template => {
              const isGrid = isGridTemplate(template.content)
              const gradientCls = iconToColor(template.icon)
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleTemplate(template)}
                  disabled={applying}
                  className="flex flex-col rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group disabled:opacity-50"
                >
                  {/* 카드 상단 — 그라디언트 + 큰 아이콘 */}
                  <div className={`w-full h-20 bg-linear-to-br ${gradientCls} flex items-center justify-center`}>
                    <span className="text-4xl drop-shadow-sm">{template.icon}</span>
                  </div>
                  {/* 카드 본문 */}
                  <div className="p-3 bg-white flex-1 flex flex-col gap-1">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{template.name}</p>
                    {template.description && (
                      <p className="text-xs text-gray-400 leading-tight line-clamp-2">{template.description}</p>
                    )}
                    {/* 타입 배지 */}
                    <div className="mt-auto pt-1">
                      <span className={[
                        'text-[10px] px-1.5 py-0.5 rounded-md',
                        isGrid ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500',
                      ].join(' ')}>
                        {isGrid ? '그리드' : '마크다운'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}

          </div>

          {/* 템플릿 없을 때 (로딩 완료 후) */}
          {!loading && templates.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-400 mt-2">
              아직 저장된 템플릿이 없습니다.
            </div>
          )}

        </div>

        {/* 하단 푸터 */}
        {applying && (
          <div className="px-5 py-2 border-t border-gray-100 shrink-0">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>페이지 생성 중...</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
