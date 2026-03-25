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
import { X, Plus, ChevronUp, ChevronDown, Filter } from 'lucide-react'

interface DatabaseViewProps {
  // 테이블 뷰 닫기 콜백 — page.tsx에서 전달
  // Python으로 치면: on_close: Callable[[], None]
  onClose: () => void
}

// ── 필터 연산자 타입 ─────────────────────────────
// Python으로 치면: FilterOperator = Literal['contains', 'equals', 'not_contains', 'before', 'after']
type FilterOperator = 'contains' | 'equals' | 'not_contains' | 'before' | 'after'

// ── 필터 조건 단건 ────────────────────────────────
// Python으로 치면: @dataclass class FilterCondition: id, column, operator, value
interface FilterCondition {
  id: string          // crypto.randomUUID() — 리스트 key 전용
  column: string      // prop name | '__title__' | '__updatedAt__'
  operator: FilterOperator
  value: string
}

// ── 정렬 설정 ────────────────────────────────────
// Python으로 치면: SortConfig = TypedDict('SortConfig', key=str, dir=Literal['asc','desc'])
interface SortConfig {
  key: string           // prop name | '__title__' | '__updatedAt__'
  dir: 'asc' | 'desc'
}

// ── 내장 컬럼 키 상수 ────────────────────────────
// Python으로 치면: COL_TITLE = '__title__'; COL_UPDATED = '__updatedAt__'
const COL_TITLE   = '__title__'
const COL_UPDATED = '__updatedAt__'

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

// ── 컬럼 타입에 따라 사용 가능한 연산자 목록 반환 ──
// Python으로 치면: def get_operators(prop_type) -> list[tuple[FilterOperator, str]]: ...
function getOperatorsForType(
  propType: PropertyType | 'title' | 'updatedAt'
): { value: FilterOperator; label: string }[] {
  if (propType === 'date' || propType === 'updatedAt') {
    return [
      { value: 'before', label: '이전' },
      { value: 'after',  label: '이후' },
      { value: 'equals', label: '같음' },
    ]
  }
  if (propType === 'status' || propType === 'select') {
    return [
      { value: 'equals',      label: '포함' },
      { value: 'not_contains', label: '포함 안함' },
    ]
  }
  // text, title, relation 공통
  return [
    { value: 'contains', label: '포함' },
    { value: 'equals',   label: '같음' },
  ]
}

// ── 정렬 적용: Page[] → 정렬된 Page[] ──────────────
// Python으로 치면: def apply_sort(pages, config) -> list[Page]: ...
function applySort(pages: Page[], config: SortConfig | null): Page[] {
  if (!config) return pages
  return [...pages].sort((a, b) => {
    let aVal: string
    let bVal: string
    if (config.key === COL_TITLE) {
      aVal = a.title ?? ''
      bVal = b.title ?? ''
    } else if (config.key === COL_UPDATED) {
      aVal = (a.updatedAt as string) ?? ''
      bVal = (b.updatedAt as string) ?? ''
    } else {
      aVal = a.properties?.find(p => p.name === config.key)?.value ?? ''
      bVal = b.properties?.find(p => p.name === config.key)?.value ?? ''
    }
    const cmp = aVal.localeCompare(bVal, 'ko-KR')
    return config.dir === 'asc' ? cmp : -cmp
  })
}

// ── 필터 AND 조합 적용: Page[] → 필터링된 Page[] ────
// Python으로 치면: def apply_filters(pages, filters) -> list[Page]: ...
function applyFilters(pages: Page[], filters: FilterCondition[]): Page[] {
  if (filters.length === 0) return pages
  return pages.filter(page =>
    filters.every(f => {
      let cellVal: string
      if (f.column === COL_TITLE) {
        cellVal = page.title ?? ''
      } else if (f.column === COL_UPDATED) {
        cellVal = (page.updatedAt as string) ?? ''
      } else {
        cellVal = page.properties?.find(p => p.name === f.column)?.value ?? ''
      }
      const fv = f.value.trim().toLowerCase()
      const cv = cellVal.toLowerCase()
      switch (f.operator) {
        case 'contains':      return cv.includes(fv)
        case 'equals':        return cv === fv
        case 'not_contains':  return !cv.includes(fv)
        case 'before':        return !!fv && !!cv && cv < fv
        case 'after':         return !!fv && !!cv && cv > fv
        default:              return true
      }
    })
  )
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
// FilterRow — 필터 조건 한 행 컴포넌트
// [컬럼 드롭다운] [연산자 드롭다운] [값 입력] [X 버튼]
// Python으로 치면: class FilterRow(QWidget): ...
// =============================================
interface FilterRowProps {
  condition: FilterCondition
  // 선택 가능한 컬럼 목록 (propColumns + 내장 컬럼)
  // Python으로 치면: col_opts: list[ColumnOption]
  columnOptions: { key: string; label: string; type: PropertyType | 'title' | 'updatedAt' }[]
  onChange: (updated: FilterCondition) => void
  onRemove: () => void
}

function FilterRow({ condition, columnOptions, onChange, onRemove }: FilterRowProps) {
  // 현재 선택된 컬럼의 타입 — 연산자 목록 결정에 사용
  // Python으로 치면: col_type = next(c.type for c in col_opts if c.key == condition.column)
  const colType = columnOptions.find(c => c.key === condition.column)?.type ?? 'text'
  const operators = getOperatorsForType(colType)

  // 컬럼 변경 시 연산자·값 초기화
  // Python으로 치면: def on_col_change(col): self.operator = ops[0].value; self.value = ''
  function handleColumnChange(key: string) {
    const newColType = columnOptions.find(c => c.key === key)?.type ?? 'text'
    const newOps = getOperatorsForType(newColType)
    onChange({ ...condition, column: key, operator: newOps[0].value, value: '' })
  }

  // 값 입력 영역: 타입별 분기
  // date/updatedAt → date input / status → STATUS_OPTIONS select / 그 외 → text input
  // Python으로 치면: def render_value_input(): ...
  function renderValueInput() {
    if (colType === 'date' || colType === 'updatedAt') {
      return (
        <input
          type="date"
          value={condition.value}
          onChange={e => onChange({ ...condition, value: e.target.value })}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 h-7"
        />
      )
    }
    if (colType === 'status') {
      return (
        <select
          value={condition.value}
          onChange={e => onChange({ ...condition, value: e.target.value })}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 h-7 bg-white"
        >
          <option value="">선택...</option>
          {STATUS_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        type="text"
        placeholder="값 입력..."
        value={condition.value}
        onChange={e => onChange({ ...condition, value: e.target.value })}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 h-7 w-28"
      />
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 컬럼 선택 드롭다운 */}
      <select
        value={condition.column}
        onChange={e => handleColumnChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 h-7 bg-white"
      >
        {columnOptions.map(col => (
          <option key={col.key} value={col.key}>{col.label}</option>
        ))}
      </select>

      {/* 연산자 선택 드롭다운 */}
      <select
        value={condition.operator}
        onChange={e => onChange({ ...condition, operator: e.target.value as FilterOperator })}
        className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 h-7 bg-white"
      >
        {operators.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {/* 값 입력 (타입별) */}
      {renderValueInput()}

      {/* 필터 삭제 버튼 */}
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50 transition-colors"
        title="필터 삭제"
      >
        <X size={12} />
      </button>
    </div>
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

  // ── FilterRow에 전달할 전체 컬럼 목록 ──────
  // 내장 컬럼(제목, 수정일) + 속성 컬럼 순서
  // Python으로 치면: all_cols = [title_col, updated_col] + prop_cols
  const allColumnOptions: { key: string; label: string; type: PropertyType | 'title' | 'updatedAt' }[] = [
    { key: COL_TITLE,   label: '제목',  type: 'title' },
    { key: COL_UPDATED, label: '수정일', type: 'updatedAt' },
    ...propColumns.map(col => ({ key: col.name, label: col.name, type: col.type })),
  ]

  // ── 인라인 편집 상태 ───────────────────────
  // 현재 편집 중인 셀: { pageId, propName } 또는 null
  // Python으로 치면: editing_cell: tuple[str, str] | None = None
  const [editingCell, setEditingCell] = useState<{ pageId: string; propName: string } | null>(null)

  // ── 정렬 설정 ─────────────────────────────
  // null이면 정렬 없음; key + dir로 단일 컬럼 정렬
  // Python으로 치면: sort_config: SortConfig | None = None
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)

  // ── 필터 조건 목록 ────────────────────────
  // 빈 배열이면 필터 없음; AND 조합으로 적용
  // Python으로 치면: filters: list[FilterCondition] = []
  const [filters, setFilters] = useState<FilterCondition[]>([])

  // ── 필터 → 정렬 파이프라인 파생값 ────────────
  // Python으로 치면: display_pages = apply_sort(apply_filters(cat_pages, filters), sort_config)
  const filteredPages = applyFilters(categoryPages, filters)
  const sortedPages   = applySort(filteredPages, sortConfig)

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

  // ── 필터 추가 ────────────────────────────────
  // 첫 번째 컬럼을 기본값으로 FilterCondition 생성
  // Python으로 치면: def handle_add_filter(): filters.append(new_condition())
  function handleAddFilter() {
    const firstCol  = allColumnOptions[0]?.key ?? COL_TITLE
    const firstType = allColumnOptions[0]?.type ?? 'title'
    const firstOp   = getOperatorsForType(firstType)[0].value
    setFilters(prev => [
      ...prev,
      { id: crypto.randomUUID(), column: firstCol, operator: firstOp, value: '' },
    ])
  }

  // ── 필터 조건 업데이트 ───────────────────────
  // Python으로 치면: def handle_update_filter(updated): filters[id] = updated
  function handleUpdateFilter(updated: FilterCondition) {
    setFilters(prev => prev.map(f => f.id === updated.id ? updated : f))
  }

  // ── 필터 삭제 ────────────────────────────────
  // Python으로 치면: def handle_remove_filter(id): filters.remove(id)
  function handleRemoveFilter(id: string) {
    setFilters(prev => prev.filter(f => f.id !== id))
  }

  // ── 컬럼 헤더 클릭 → 정렬 토글 ──────────────
  // 동일 컬럼 재클릭: asc → desc → null 순환
  // Python으로 치면: def handle_toggle_sort(key): toggle_sort_dir(key)
  function handleToggleSort(key: string) {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null  // desc 후 클릭하면 정렬 해제
    })
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
        {/* ── 필터 추가 버튼 ─────────────────────── */}
        {/* Python으로 치면: filter_btn.on_click = handle_add_filter */}
        <button
          type="button"
          onClick={handleAddFilter}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-colors"
          title="필터 조건 추가"
        >
          <Filter size={12} />
          <span>필터</span>
          {filters.length > 0 && (
            <span className="bg-blue-500 text-white text-[9px] px-1 py-0.5 rounded-full leading-none">
              {filters.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
          title="테이블 뷰 닫기"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── 필터 조건 행 ─────────────────────────── */}
      {/* filters.length === 0이면 렌더링 안 함 */}
      {/* Python으로 치면: if filters: render_filter_rows() */}
      {filters.length > 0 && (
        <div className="px-6 py-2 border-b border-gray-200 bg-blue-50 flex flex-col gap-1.5 shrink-0">
          {filters.map(f => (
            <FilterRow
              key={f.id}
              condition={f}
              columnOptions={allColumnOptions}
              onChange={handleUpdateFilter}
              onRemove={() => handleRemoveFilter(f.id)}
            />
          ))}
        </div>
      )}

      {/* ── 테이블 영역 ───────────────────────── */}
      {/* flex-1 + overflow-auto: 헤더 아래 공간을 모두 차지하고 스크롤 */}
      {/* Python으로 치면: scroll_area = QScrollArea(); scroll_area.setWidget(table) */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">

          {/* 테이블 헤더 — sticky top으로 스크롤 시 고정 */}
          {/* Python으로 치면: header_row = [TitleHeader, ...PropHeaders, TagHeader, DateHeader] */}
          <thead>
            <tr className="border-b border-gray-200 sticky top-0 bg-gray-50 z-10">
              {/* 제목 컬럼 — 왼쪽 고정 (sticky), 클릭 정렬 가능 */}
              {/* Python으로 치면: title_th.on_click = lambda: toggle_sort('__title__') */}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-52 sticky left-0 bg-gray-50 z-10 border-r border-gray-100">
                <button
                  type="button"
                  onClick={() => handleToggleSort(COL_TITLE)}
                  className="flex items-center gap-1 hover:text-gray-800 transition-colors"
                >
                  <span>제목</span>
                  {sortConfig?.key === COL_TITLE ? (
                    sortConfig.dir === 'asc'
                      ? <ChevronUp size={11} className="text-blue-500" />
                      : <ChevronDown size={11} className="text-blue-500" />
                  ) : (
                    <ChevronUp size={11} className="opacity-0" />
                  )}
                </button>
              </th>
              {/* 속성 컬럼들 — 각각 클릭 정렬 가능 */}
              {propColumns.map(col => (
                <th
                  key={col.name}
                  className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap"
                  style={{ minWidth: '120px' }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleSort(col.name)}
                    className="flex items-center gap-1 hover:text-gray-800 transition-colors"
                  >
                    <span>{col.name}</span>
                    {sortConfig?.key === col.name ? (
                      sortConfig.dir === 'asc'
                        ? <ChevronUp size={11} className="text-blue-500" />
                        : <ChevronDown size={11} className="text-blue-500" />
                    ) : (
                      <ChevronUp size={11} className="opacity-0" />
                    )}
                  </button>
                </th>
              ))}
              {/* 태그 컬럼 */}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap" style={{ minWidth: '80px' }}>
                태그
              </th>
              {/* 수정일 컬럼 — 클릭 정렬 가능 */}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-24 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleToggleSort(COL_UPDATED)}
                  className="flex items-center gap-1 hover:text-gray-800 transition-colors"
                >
                  <span>수정일</span>
                  {sortConfig?.key === COL_UPDATED ? (
                    sortConfig.dir === 'asc'
                      ? <ChevronUp size={11} className="text-blue-500" />
                      : <ChevronDown size={11} className="text-blue-500" />
                  ) : (
                    <ChevronUp size={11} className="opacity-0" />
                  )}
                </button>
              </th>
            </tr>
          </thead>

          {/* 테이블 본문 — 필터+정렬 파이프라인 결과 표시 */}
          {/* Python으로 치면: for page in sorted_pages: render_row(page) */}
          <tbody>
            {sortedPages.map(page => (
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

        {/* 페이지 없을 때 안내 — 필터 적용 중이면 다른 메시지 표시 */}
        {/* Python으로 치면: if not filtered_pages: render_empty_hint(filters) */}
        {filteredPages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <p className="text-sm">
              {filters.length > 0
                ? '필터 조건에 맞는 페이지가 없습니다'
                : '이 카테고리에 메모가 없습니다'}
            </p>
            {filters.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters([])}
                className="text-xs text-blue-500 hover:text-blue-700 underline"
              >
                필터 모두 지우기
              </button>
            )}
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
