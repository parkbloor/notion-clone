// ==============================================
// src/components/editor/NewPageDialog.tsx
// 역할: 새 페이지 생성 다이얼로그 — 빈 페이지 or 템플릿 선택
//   - 서버에서 템플릿 목록 로드
//   - 빈 페이지 / 마크다운 템플릿 / 그리드 템플릿 구분
//   - 선택 후 페이지 생성 → 템플릿 적용
// Python으로 치면: class NewPageDialog(QDialog): ...
// ==============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { templateApi, Template } from '@/lib/api'
import { usePageStore } from '@/store/pageStore'
import { gridCellsToBlocks, isGridTemplate, GridTemplateContent } from '@/lib/templateGrid'

// NewPageDialog 컴포넌트 props
// Python으로 치면: def NewPageDialog(category_id, on_close): ...
interface NewPageDialogProps {
  categoryId: string | null   // 생성할 카테고리 ID (null = 미분류)
  onClose: () => void
}

export default function NewPageDialog({ categoryId, onClose }: NewPageDialogProps) {

  // 서버에서 불러온 템플릿 목록
  // Python으로 치면: self.templates: list[Template] = []
  const [templates, setTemplates] = useState<Template[]>([])

  // 로딩 / 적용 중 상태
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)

  // 오버레이 ref (외부 클릭 감지용)
  const overlayRef = useRef<HTMLDivElement>(null)

  // 스토어 액션
  // Python으로 치면: store = get_store()
  const { addPage, applyTemplate, setPageBlocks } = usePageStore()

  // ── 마운트 시 템플릿 목록 로드 ───────────────
  // Python으로 치면: self.templates = await api.get_all()
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
      // 1. 빈 페이지 생성 (서버에서 ID 발급)
      await addPage(template.name, categoryId)

      // 2. 생성된 페이지 ID 가져오기
      const pageId = usePageStore.getState().currentPageId
      if (!pageId) {
        onClose()
        return
      }

      // 3. 템플릿 내용 적용
      if (isGridTemplate(template.content)) {
        // 그리드 템플릿 → 셀을 Block[]로 변환 후 적용
        // Python으로 치면: if is_grid_template(content): apply_grid(cells)
        const gridData = JSON.parse(template.content) as GridTemplateContent
        const blocks = gridCellsToBlocks(gridData.cells, gridData.gridCols ?? 12)
        setPageBlocks(pageId, blocks)
      } else if (template.content.trim()) {
        // 마크다운 템플릿 → 기존 파서 사용
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
    // ── 오버레이 배경 ───────────────────────────
    // Python으로 치면: self.overlay.mousePressEvent = lambda: self.close()
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* ── 다이얼로그 박스 ── */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200">

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">새 페이지 만들기</h2>
          <p className="text-xs text-gray-400 mt-0.5">빈 페이지로 시작하거나 템플릿을 선택하세요</p>
        </div>

        {/* 본문 */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1">

          {/* ── 빈 페이지 옵션 ── */}
          <button
            type="button"
            onClick={handleBlankPage}
            disabled={applying}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50 border border-transparent hover:border-gray-200"
          >
            <span className="text-2xl w-8 text-center shrink-0">📄</span>
            <div>
              <p className="text-sm font-medium text-gray-800">빈 페이지</p>
              <p className="text-xs text-gray-400">아무 내용 없이 시작합니다</p>
            </div>
          </button>

          {/* ── 구분선 ── */}
          {!loading && templates.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">템플릿으로 시작</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}

          {/* ── 로딩 중 ── */}
          {loading && (
            <div className="flex items-center justify-center py-6">
              <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="ml-2 text-sm text-gray-400">템플릿 불러오는 중...</span>
            </div>
          )}

          {/* ── 템플릿 목록 ── */}
          {templates.map(template => {
            const isGrid = isGridTemplate(template.content)
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => handleTemplate(template)}
                disabled={applying}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-blue-50 transition-colors text-left disabled:opacity-50 border border-transparent hover:border-blue-100"
              >
                {/* 아이콘 */}
                <span className="text-2xl w-8 text-center shrink-0">{template.icon}</span>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{template.name}</p>
                  {template.description && (
                    <p className="text-xs text-gray-400 truncate">{template.description}</p>
                  )}
                </div>

                {/* 템플릿 타입 배지 */}
                <span className={[
                  'text-xs px-1.5 py-0.5 rounded-md shrink-0',
                  isGrid
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-gray-100 text-gray-500',
                ].join(' ')}>
                  {isGrid ? '그리드' : '마크다운'}
                </span>
              </button>
            )
          })}

          {/* 템플릿 없음 안내 */}
          {!loading && templates.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-400">
              아직 템플릿이 없습니다. 설정 &gt; 템플릿에서 추가하세요.
            </div>
          )}

        </div>

        {/* 하단 버튼 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            취소
          </button>
        </div>

      </div>
    </div>
  )
}
