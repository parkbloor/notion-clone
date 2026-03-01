// =============================================
// src/components/editor/DatabaseView.tsx
// 역할: 데이터베이스 뷰 — 현재 카테고리 페이지들을 테이블로 표시
//   - 각 행: 페이지 (아이콘+제목, 속성 컬럼들, 태그, 수정일)
//   - 각 열: 모든 페이지에 걸쳐 공통으로 사용되는 속성 이름
//   - 인라인 셀 편집 (status 피커, date input, text input, select 피커)
// Python으로 치면: class DatabaseView(QTableWidget): ...
// =============================================

'use client'

import { useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { Page, PageProperty, PropertyType, STATUS_OPTIONS } from '@/types/block'
import { X, Plus } from 'lucide-react'

interface DatabaseViewProps {
  // 테이블 뷰 닫기 콜백 — page.tsx에서 전달
  // Python으로 치면: on_close: Callable[[], None]
  onClose: () => void
}

// ── 속성 타입별 컬럼 정렬 순서 ──────────────────
// status → date → select → text 순으로 표시
// Python으로 치면: PROP_TYPE_ORDER = ['status', 'date', 'select', 'text']
const PROP_TYPE_ORDER: PropertyType[] = ['status', 'date', 'select', 'text']

// ── 상태 배지 색상 매핑 ───────────────────────
// Python으로 치면: STATUS_COLOR = {'미시작': 'bg-gray-100 text-gray-600', ...}
const STATUS_COLOR: Record<string, string> = {
  '미시작': 'bg-gray-100 text-gray-600',
  '진행 중': 'bg-blue-100 text-blue-700',
  '완료': 'bg-green-100 text-green-700',
  '보류': 'bg-yellow-100 text-yellow-700',
}

// ── 날짜 포맷 헬퍼 ─────────────────────────────
// Python으로 치면: def fmt_date(dt): return dt.strftime('%m월 %d일') if dt else ''
function fmtDate(val: Date | string | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}


// =============================================
// PropertyCell — 개별 속성 셀 컴포넌트
// 타입에 따라 다른 인라인 편집 UI를 렌더링
// Python으로 치면: class PropertyCell(QWidget): def render(self): ...
// =============================================
interface PropertyCellProps {
  propType: PropertyType
  value: string
  options: string[]
  isEditing: boolean
  onStartEdit: () => void
  onEndEdit: () => void
  onChange: (value: string) => void
}

function PropertyCell({
  propType, value, options,
  isEditing, onStartEdit, onEndEdit, onChange,
}: PropertyCellProps) {

  // ── 상태 타입 ──────────────────────────────
  // 클릭 → 피커 드롭다운 (STATUS_OPTIONS 4종)
  // Python으로 치면: if prop_type == 'status': render_status_picker()
  if (propType === 'status') {
    if (isEditing) {
      return (
        <div className="relative">
          <div className="absolute left-0 top-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex flex-col gap-0.5 min-w-24">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); onEndEdit() }}
                className={[
                  'text-xs px-2 py-1 rounded text-left transition-colors',
                  value === opt ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              onClick={onEndEdit}
              className="text-xs px-2 py-1 text-gray-400 hover:bg-gray-50 rounded text-left mt-0.5 border-t border-gray-100"
            >
              취소
            </button>
          </div>
        </div>
      )
    }
    if (!value) {
      return (
        <button
          type="button"
          onClick={onStartEdit}
          className="text-[10px] text-gray-300 hover:text-gray-500 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
        >
          + 설정
        </button>
      )
    }
    const cls = STATUS_COLOR[value] ?? 'bg-gray-100 text-gray-600'
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className={`text-[10px] px-2 py-0.5 rounded-full transition-opacity ${cls}`}
      >
        {value}
      </button>
    )
  }

  // ── 날짜 타입 ──────────────────────────────
  // 편집 중: date input / 비편집: 날짜 뱃지
  // Python으로 치면: if prop_type == 'date': render_date_input()
  if (propType === 'date') {
    if (isEditing) {
      return (
        <input
          type="date"
          autoFocus
          className="text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onEndEdit}
        />
      )
    }
    if (!value) {
      return (
        <button
          type="button"
          onClick={onStartEdit}
          className="text-[10px] text-gray-300 hover:text-gray-500 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
        >
          + 설정
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded"
      >
        {value}
      </button>
    )
  }

  // ── 선택 타입 ──────────────────────────────
  // 클릭 → 옵션 드롭다운 (options 배열)
  // Python으로 치면: if prop_type == 'select': render_select_picker()
  if (propType === 'select') {
    if (isEditing) {
      return (
        <div className="relative">
          <div className="absolute left-0 top-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex flex-col gap-0.5 min-w-24">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(value === opt ? '' : opt); onEndEdit() }}
                className={[
                  'text-xs px-2 py-1 rounded text-left transition-colors',
                  value === opt ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {opt}
              </button>
            ))}
            {options.length === 0 && (
              <span className="text-[10px] text-gray-400 px-2 py-1">
                옵션 없음
              </span>
            )}
            <button
              type="button"
              onClick={onEndEdit}
              className="text-xs px-2 py-1 text-gray-400 hover:bg-gray-50 rounded text-left mt-0.5 border-t border-gray-100"
            >
              취소
            </button>
          </div>
        </div>
      )
    }
    if (!value) {
      return (
        <button
          type="button"
          onClick={onStartEdit}
          className="text-[10px] text-gray-300 hover:text-gray-500 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
        >
          + 설정
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
      >
        {value}
      </button>
    )
  }

  // ── 텍스트 타입 ────────────────────────────
  // 편집 중: 인라인 input / 비편집: 텍스트 버튼
  // Python으로 치면: if prop_type == 'text': render_text_input()
  if (isEditing) {
    return (
      <input
        type="text"
        autoFocus
        className="text-xs border-b border-blue-400 outline-none bg-transparent w-full py-0.5 max-w-28"
        defaultValue={value}
        onBlur={e => { onChange(e.target.value); onEndEdit() }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            onChange((e.target as HTMLInputElement).value)
            onEndEdit()
          }
        }}
      />
    )
  }
  if (!value) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="text-[10px] text-gray-300 hover:text-gray-500 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
      >
        + 설정
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onStartEdit}
      className="text-xs text-gray-600 text-left truncate max-w-28"
    >
      {value}
    </button>
  )
}


// =============================================
// DatabaseView — 메인 컴포넌트
// =============================================
export default function DatabaseView({ onClose }: DatabaseViewProps) {
  // ── 스토어 ──────────────────────────────────
  const {
    pages,
    currentCategoryId,
    categoryMap,
    categories,
    setCurrentPage,
    setPageProperty,
    addPage,
    pushRecentPage,
  } = usePageStore()

  // ── 현재 카테고리 페이지 필터링 ──────────────
  // Python으로 치면: cat_pages = [p for p in pages if category_map[p.id] == current_cat]
  const categoryPages = currentCategoryId === null
    ? pages
    : pages.filter(p => (categoryMap[p.id] ?? null) === currentCategoryId)

  // ── 현재 카테고리 이름 ─────────────────────
  // Python으로 치면: cat_name = cats[current_cat].name if current_cat else '전체보기'
  const categoryName = currentCategoryId === null
    ? '전체보기'
    : categories.find(c => c.id === currentCategoryId)?.name ?? '전체보기'

  // ── 모든 페이지에서 고유 속성 컬럼 수집 ──────
  // 이름 기준으로 중복 제거, type별 정렬
  // Python으로 치면: cols = {p.name: p.type for page in pages for p in page.properties}
  const propColumnMap = new Map<string, PropertyType>()
  for (const page of categoryPages) {
    for (const prop of page.properties ?? []) {
      if (!propColumnMap.has(prop.name)) {
        propColumnMap.set(prop.name, prop.type)
      }
    }
  }
  const propColumns = Array.from(propColumnMap.entries())
    .sort(([, a], [, b]) => PROP_TYPE_ORDER.indexOf(a) - PROP_TYPE_ORDER.indexOf(b))
    .map(([name, type]) => ({ name, type }))

  // ── 인라인 편집 상태 ───────────────────────
  // 현재 편집 중인 셀: { pageId, propName } 또는 null
  // Python으로 치면: editing_cell: tuple[str, str] | None = None
  const [editingCell, setEditingCell] = useState<{ pageId: string; propName: string } | null>(null)

  // ── 셀 값 가져오기 ─────────────────────────
  // Python으로 치면: def get_val(page, name): return next(p.value for p in page.props if p.name == name, '')
  function getCellValue(page: Page, propName: string): string {
    return page.properties?.find(p => p.name === propName)?.value ?? ''
  }

  // ── 셀 옵션 가져오기 (select 타입) ──────────
  // Python으로 치면: def get_opts(page, name): return next(p.options for p in page.props if p.name == name, [])
  function getCellOptions(page: Page, propName: string): string[] {
    return page.properties?.find(p => p.name === propName)?.options ?? []
  }

  // ── 셀 값 업데이트 ─────────────────────────
  // 기존 속성이 있으면 value 업데이트, 없으면 새로 추가
  // Python으로 치면: def update_cell(page, name, type, val): prop.value = val or create_prop(...)
  function updateCellValue(page: Page, propName: string, propType: PropertyType, value: string) {
    const existing = page.properties?.find(p => p.name === propName)
    if (existing) {
      setPageProperty(page.id, { ...existing, value })
    } else {
      setPageProperty(page.id, {
        id: crypto.randomUUID(),
        name: propName,
        type: propType,
        value,
        options: propType === 'select' ? [] : undefined,
      })
    }
  }

  // ── 새 페이지 추가 ─────────────────────────
  // Python으로 치면: def handle_add(): add_page(None, current_cat)
  function handleAddPage() {
    addPage(undefined, currentCategoryId)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── 헤더 ─────────────────────────────── */}
      {/* Python으로 치면: header = HBox([cat_label, page_count, close_btn]) */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <h2 className="text-base font-semibold text-gray-800 flex-1">
          {categoryName}
          <span className="ml-2 text-xs font-normal text-gray-400">
            데이터베이스 — {categoryPages.length}개 페이지
          </span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
          title="테이블 뷰 닫기"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── 테이블 영역 ───────────────────────── */}
      {/* flex-1 + overflow-auto: 헤더 아래 공간을 모두 차지하고 스크롤 */}
      {/* Python으로 치면: scroll_area = QScrollArea(); scroll_area.setWidget(table) */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">

          {/* 테이블 헤더 — sticky top으로 스크롤 시 고정 */}
          {/* Python으로 치면: header_row = [TitleHeader, ...PropHeaders, TagHeader, DateHeader] */}
          <thead>
            <tr className="border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
              {/* 제목 컬럼 — 왼쪽 고정 (sticky) */}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-52 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">
                제목
              </th>
              {/* 속성 컬럼들 */}
              {propColumns.map(col => (
                <th
                  key={col.name}
                  className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap"
                  style={{ minWidth: '120px' }}
                >
                  {col.name}
                </th>
              ))}
              {/* 태그 컬럼 */}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap" style={{ minWidth: '80px' }}>
                태그
              </th>
              {/* 수정일 컬럼 */}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-24 whitespace-nowrap">
                수정일
              </th>
            </tr>
          </thead>

          {/* 테이블 본문 */}
          {/* Python으로 치면: for page in cat_pages: render_row(page) */}
          <tbody>
            {categoryPages.map(page => (
              <tr
                key={page.id}
                className="border-b border-gray-100 hover:bg-gray-50 group"
              >
                {/* 제목 셀 — 클릭 시 해당 페이지로 이동 + 뷰 닫기 */}
                {/* sticky left: 수평 스크롤 시 제목이 고정 유지 */}
                {/* Python으로 치면: title_btn.on_click = lambda: navigate(page) */}
                <td className="px-4 py-2 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100">
                  <button
                    type="button"
                    onClick={() => { setCurrentPage(page.id); pushRecentPage(page.id); onClose() }}
                    className="flex items-center gap-2 text-left w-full"
                    title="페이지 열기"
                  >
                    <span className="text-sm shrink-0">{page.icon}</span>
                    <span className="text-xs font-medium text-gray-800 truncate max-w-36">
                      {page.title || '제목 없음'}
                    </span>
                  </button>
                </td>

                {/* 속성 셀들 — 각 컬럼에 맞는 PropertyCell 렌더링 */}
                {/* Python으로 치면: for col in prop_columns: render_cell(page, col) */}
                {propColumns.map(col => (
                  <td key={col.name} className="px-4 py-2">
                    <PropertyCell
                      propType={col.type}
                      value={getCellValue(page, col.name)}
                      options={getCellOptions(page, col.name)}
                      isEditing={editingCell?.pageId === page.id && editingCell?.propName === col.name}
                      onStartEdit={() => setEditingCell({ pageId: page.id, propName: col.name })}
                      onEndEdit={() => setEditingCell(null)}
                      onChange={val => updateCellValue(page, col.name, col.type, val)}
                    />
                  </td>
                ))}

                {/* 태그 셀 */}
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-0.5">
                    {(page.tags ?? []).map(tag => (
                      <span
                        key={tag}
                        className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded-full leading-none"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </td>

                {/* 수정일 셀 */}
                <td className="px-4 py-2 text-[10px] text-gray-400 whitespace-nowrap">
                  {fmtDate(page.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 페이지 없을 때 안내 */}
        {/* Python으로 치면: if not cat_pages: render_empty_hint() */}
        {categoryPages.length === 0 && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <p className="text-sm">이 카테고리에 메모가 없습니다</p>
          </div>
        )}

        {/* 새 페이지 추가 행 */}
        {/* Python으로 치면: add_btn.on_click = lambda: add_page(cat_id) */}
        <div className="px-4 py-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleAddPage}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 px-2 py-1.5 rounded transition-colors"
          >
            <Plus size={12} />
            <span>새 페이지</span>
          </button>
        </div>
      </div>

    </div>
  )
}
