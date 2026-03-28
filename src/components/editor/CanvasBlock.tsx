// =============================================
// src/components/editor/CanvasBlock.tsx
// 역할: 행/열 기반 그리드 레이아웃 캔버스 블록
//   - 행(Row): 수직으로 쌓임, 위아래 이동 가능
//   - 열(Column): 행 안에서 가로로 나뉨 (너비 % 저장)
//   - 블록(Block): 열 안에 쌓임 (H1/H2/H3/P + 배경색 6종)
//   - 열 구분선 드래그 → 너비 비율 실시간 조절
//   - readMode: 모든 편집 UI 숨김
// Python으로 치면: class CanvasBlock: rows=[Row([Col([Block])])]
// =============================================

'use client'

import { useState, useRef, useCallback } from 'react'
import { Plus, X, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'

// ──────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────

// 블록 텍스트 타입 (계층 구조)
// Python으로 치면: BlockType = Literal['heading1','heading2','heading3','text']
type BlockType = 'heading1' | 'heading2' | 'heading3' | 'text'

// 블록 배경색 키
// Python으로 치면: BlockColor = Literal['','1','2','3','4','5','6']
type BlockColor = '' | '1' | '2' | '3' | '4' | '5' | '6'

// 블록 — 열 안에 들어가는 콘텐츠 단위
// Python으로 치면: @dataclass class CBlock: id, type, content, color
interface CBlock {
  id: string
  type: BlockType
  content: string
  color: BlockColor
}

// 열 — 행 안에서 가로로 나뉨, 너비는 퍼센트
// Python으로 치면: @dataclass class CColumn: id, width(%), blocks=[]
interface CColumn {
  id: string
  width: number    // 퍼센트 (같은 행의 열들 합계 = 100)
  blocks: CBlock[]
}

// 행 — 수직으로 쌓이는 레이아웃 단위
// Python으로 치면: @dataclass class CRow: id, columns=[]
interface CRow {
  id: string
  columns: CColumn[]
}

// 전체 캔버스 데이터
// Python으로 치면: @dataclass class CanvasState: rows=[]
interface CanvasState {
  rows: CRow[]
}

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────
const MIN_COL_W = 15  // 열 최소 너비 (%)
const MAX_COLS  = 4   // 행당 최대 열 수

// 블록 타입별 텍스트 스타일
// Python으로 치면: BLOCK_STYLE = {'heading1': {'size': '1.1rem', 'weight': 700}, ...}
const BLOCK_STYLE: Record<BlockType, { fontSize: string; fontWeight: number }> = {
  heading1: { fontSize: '1.1rem',   fontWeight: 700 },
  heading2: { fontSize: '0.95rem',  fontWeight: 600 },
  heading3: { fontSize: '0.875rem', fontWeight: 600 },
  text:     { fontSize: '0.825rem', fontWeight: 400 },
}

// 블록 타입 레이블 (H1/H2/H3/P)
const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  heading1: 'H1', heading2: 'H2', heading3: 'H3', text: 'P',
}

// 블록 타입 순서
const BLOCK_TYPES: BlockType[] = ['heading1', 'heading2', 'heading3', 'text']

// 블록 색상 스타일 (Stitch Digital Atelier 뮤트 팔레트)
// Python으로 치면: COLOR_STYLE = {'': {bg:..., border:...}, ...}
const COLOR_STYLE: Record<BlockColor, { bg: string; border: string }> = {
  '':  { bg: 'bg-white dark:bg-gray-800',            border: 'border-stone-200 dark:border-stone-700'   },
  '1': { bg: 'bg-red-50 dark:bg-red-950/30',          border: 'border-red-200 dark:border-red-800'       },
  '2': { bg: 'bg-orange-50 dark:bg-orange-950/30',    border: 'border-orange-200 dark:border-orange-800' },
  '3': { bg: 'bg-yellow-50 dark:bg-yellow-950/30',    border: 'border-yellow-200 dark:border-yellow-800' },
  '4': { bg: 'bg-green-50 dark:bg-green-950/30',      border: 'border-green-200 dark:border-green-800'   },
  '5': { bg: 'bg-sky-50 dark:bg-sky-950/30',          border: 'border-sky-200 dark:border-sky-800'       },
  '6': { bg: 'bg-violet-50 dark:bg-violet-950/30',    border: 'border-violet-200 dark:border-violet-800' },
}

// 색상 선택 버튼 도트 스타일
const COLOR_DOT: Record<BlockColor, string> = {
  '':  'bg-stone-100 border-2 border-stone-400',
  '1': 'bg-red-400',    '2': 'bg-orange-400',
  '3': 'bg-yellow-400', '4': 'bg-green-400',
  '5': 'bg-sky-400',    '6': 'bg-violet-400',
}

// 색상 키 순서
const COLOR_KEYS: BlockColor[] = ['', '1', '2', '3', '4', '5', '6']

// 블록 타입 한글 이름 (드롭다운 표시용)
const BLOCK_TYPE_KO: Record<BlockType, string> = {
  heading1: '큰 제목', heading2: '중간 제목', heading3: '작은 제목', text: '텍스트',
}

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

// 균등 너비 배열 생성: 100%를 n개로 나누어 정수 퍼센트 반환
// Python으로 치면: def equal_widths(n): return [100//n]*n, 나머지는 마지막에 추가
function equalWidths(n: number): number[] {
  const base = Math.floor(100 / n)
  const arr  = Array(n).fill(base) as number[]
  arr[n - 1] += 100 - base * n  // 나머지를 마지막 열에 추가
  return arr
}

// JSON 파싱 — 구조 검증 + 기본값 보정
// Python으로 치면: def parse(s): return CanvasState(**json.loads(s)) with defaults
function parseData(s: string): CanvasState {
  try {
    const p = JSON.parse(s)
    if (Array.isArray(p?.rows)) {
      return {
        rows: p.rows.map((r: Partial<CRow>) => ({
          id: r.id ?? crypto.randomUUID(),
          columns: Array.isArray(r.columns)
            ? r.columns.map((c: Partial<CColumn>) => ({
                id: c.id ?? crypto.randomUUID(),
                width: typeof c.width === 'number' ? c.width : 100,
                blocks: Array.isArray(c.blocks)
                  ? c.blocks.map((b: Partial<CBlock>) => ({
                      id:      b.id      ?? crypto.randomUUID(),
                      type:    (b.type   as BlockType)  ?? 'text',
                      content: b.content ?? '',
                      color:   (b.color  as BlockColor) ?? '',
                    }))
                  : [],
              }))
            : [{ id: crypto.randomUUID(), width: 100, blocks: [] }],
        })),
      }
    }
  } catch { /* JSON 파싱 실패 → 빈 상태 */ }
  return { rows: [] }
}

// 새 행 생성 — 열 1개(100%)로 초기화
// Python으로 치면: def new_row(): return CRow(columns=[CColumn(width=100)])
function newRow(): CRow {
  return {
    id: crypto.randomUUID(),
    columns: [{ id: crypto.randomUUID(), width: 100, blocks: [] }],
  }
}

// ──────────────────────────────────────────────
// BlockView — 블록 카드 컴포넌트
// Python으로 치면: class BlockView(Card): type + content + color + toolbar
// ──────────────────────────────────────────────
interface BlockViewProps {
  block:    CBlock
  isFirst:  boolean
  isLast:   boolean
  readMode?: boolean
  onUpdate: (updates: Partial<CBlock>) => void
  onDelete: () => void
  onMove:   (dir: -1 | 1) => void
}

function BlockView({ block, isFirst, isLast, readMode, onUpdate, onDelete, onMove }: BlockViewProps) {
  const [editing, setEditing]               = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const C = COLOR_STYLE[block.color]

  return (
    <div
      className={[
        'group/block relative rounded-lg border shadow-sm mb-1.5 last:mb-0 transition-shadow hover:shadow-md',
        C.bg, C.border,
      ].join(' ')}
    >
      {/* ── 블록 헤더 툴바 (편집 모드 + hover 시만 표시) ──
           타입 선택 · 색상 버튼 · 위아래 이동 · 삭제
           Python으로 치면: render_toolbar_if_editable() */}
      {!readMode && (
        <div className="flex items-center gap-1 px-2 pt-1.5 pb-0 opacity-0 group-hover/block:opacity-100 transition-opacity">

          {/* 타입 버튼 (H1/H2/H3/P) */}
          <div className="flex gap-0.5">
            {BLOCK_TYPES.map(t => (
              <button
                key={t}
                type="button"
                className={[
                  'text-[9px] px-1 py-0.5 rounded font-medium transition-colors leading-none',
                  block.type === t
                    ? 'bg-stone-700 text-white dark:bg-stone-300 dark:text-stone-900'
                    : 'text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 dark:text-stone-500',
                ].join(' ')}
                onClick={() => onUpdate({ type: t })}
                title={`타입: ${BLOCK_TYPE_KO[t]}`}
              >
                {BLOCK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* 색상 도트 버튼 */}
          <div className="relative ml-1">
            <button
              type="button"
              className={['w-3 h-3 rounded-full shrink-0 transition-transform hover:scale-110', COLOR_DOT[block.color]].join(' ')}
              onClick={() => setShowColorPicker(p => !p)}
              title="배경색 변경"
            />
            {/* 색상 피커 드롭다운 */}
            {showColorPicker && (
              <div
                className="absolute left-0 top-5 z-30 flex gap-1 bg-white/95 dark:bg-gray-800/95 border border-black/8 dark:border-white/8 rounded-xl shadow-md backdrop-blur-sm p-1.5"
                onMouseDown={e => e.stopPropagation()}
              >
                {COLOR_KEYS.map(c => (
                  <button
                    key={c || 'df'}
                    type="button"
                    className={[
                      'w-4 h-4 rounded-full transition-transform hover:scale-110',
                      COLOR_DOT[c],
                      block.color === c ? 'ring-2 ring-stone-500 ring-offset-1' : '',
                    ].join(' ')}
                    onClick={() => { onUpdate({ color: c }); setShowColorPicker(false) }}
                    title={c ? `색상 ${c}` : '기본색'}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 이동/삭제 버튼 그룹 */}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              disabled={isFirst}
              className="text-stone-300 hover:text-stone-600 dark:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 transition-colors p-0.5"
              onClick={() => onMove(-1)}
              title="위로 이동"
            >
              <ChevronUp size={11} />
            </button>
            <button
              type="button"
              disabled={isLast}
              className="text-stone-300 hover:text-stone-600 dark:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 transition-colors p-0.5"
              onClick={() => onMove(1)}
              title="아래로 이동"
            >
              <ChevronDown size={11} />
            </button>
            <button
              type="button"
              className="text-stone-300 hover:text-red-400 transition-colors p-0.5 ml-0.5"
              onClick={onDelete}
              title="블록 삭제"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      {/* ── 블록 내용 영역 ──
           편집 중: textarea / 표시 중: p 태그
           Python으로 치면: if editing: render textarea else: render p */}
      <div className="px-3 py-2">
        {editing && !readMode ? (
          <textarea
            autoFocus
            className="w-full resize-none bg-transparent focus:outline-none text-stone-800 dark:text-stone-200 leading-snug"
            style={BLOCK_STYLE[block.type]}
            value={block.content}
            rows={Math.max(2, block.content.split('\n').length)}
            onChange={e => onUpdate({ content: e.target.value })}
            onBlur={() => setEditing(false)}
            onMouseDown={e => e.stopPropagation()}
            placeholder="내용을 입력하세요..."
          />
        ) : (
          <p
            className="leading-snug whitespace-pre-wrap wrap-break-word text-stone-700 dark:text-stone-300 min-h-[1.5em]"
            style={{ ...BLOCK_STYLE[block.type], cursor: readMode ? 'default' : 'text' }}
            onClick={() => { if (!readMode) setEditing(true) }}
          >
            {block.content || (
              !readMode && (
                <span className="text-stone-300 dark:text-stone-600 italic" style={{ fontSize: '0.75rem' }}>
                  클릭하여 편집...
                </span>
              )
            )}
          </p>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// ColumnView — 열 컴포넌트
// Python으로 치면: class ColumnView(Container): blocks + add_block_button
// ──────────────────────────────────────────────
interface ColumnViewProps {
  col:       CColumn
  totalCols: number
  readMode?: boolean
  canDelete: boolean   // 삭제 가능 여부 (블록이 없고 열이 2개 이상일 때)
  onDeleteColumn:  () => void
  onAddBlock:      (type: BlockType) => void
  onUpdateBlock:   (blockId: string, updates: Partial<CBlock>) => void
  onDeleteBlock:   (blockId: string) => void
  onMoveBlock:     (blockId: string, dir: -1 | 1) => void
}

function ColumnView({
  col, readMode, canDelete,
  onDeleteColumn, onAddBlock, onUpdateBlock, onDeleteBlock, onMoveBlock,
}: ColumnViewProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)

  return (
    <div className="group/col relative flex flex-col h-full min-h-20">

      {/* ── 열 헤더 (편집 모드 hover 시만 표시) ──
           빈 열이고 열이 2개 이상일 때만 삭제 버튼 표시
           Python으로 치면: if editable and can_delete: render delete button */}
      {!readMode && (
        <div className="flex items-center justify-end mb-1 h-4 opacity-0 group-hover/col:opacity-100 transition-opacity">
          {canDelete && (
            <button
              type="button"
              className="text-stone-300 hover:text-red-400 transition-colors"
              onClick={onDeleteColumn}
              title="빈 열 삭제"
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* ── 블록 목록 ── */}
      <div className="flex-1">
        {col.blocks.map((block, bi) => (
          <BlockView
            key={block.id}
            block={block}
            isFirst={bi === 0}
            isLast={bi === col.blocks.length - 1}
            readMode={readMode}
            onUpdate={updates => onUpdateBlock(block.id, updates)}
            onDelete={() => onDeleteBlock(block.id)}
            onMove={dir => onMoveBlock(block.id, dir)}
          />
        ))}
      </div>

      {/* ── + 블록 추가 버튼 (편집 모드) ──
           클릭 시 타입 선택 드롭다운 표시
           Python으로 치면: if editable: render add_block_dropdown() */}
      {!readMode && (
        <div className="relative mt-1.5">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-stone-200 dark:border-stone-700 text-stone-300 dark:text-stone-600 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400 hover:bg-white/60 dark:hover:bg-stone-800/50 transition-all text-xs"
            onClick={() => setShowAddMenu(p => !p)}
          >
            <Plus size={11} />
            <span>블록</span>
          </button>

          {/* 블록 타입 선택 드롭다운 */}
          {showAddMenu && (
            <>
              {/* 외부 클릭 닫기 오버레이 */}
              <div className="fixed inset-0 z-10" onClick={() => setShowAddMenu(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-white/95 dark:bg-gray-800/95 border border-black/8 dark:border-white/8 rounded-xl shadow-md backdrop-blur-sm py-1 min-w-32">
                {BLOCK_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 text-left transition-colors"
                    onClick={() => { onAddBlock(t); setShowAddMenu(false) }}
                  >
                    <span className="font-semibold text-stone-400 dark:text-stone-500 w-5 shrink-0">
                      {BLOCK_TYPE_LABEL[t]}
                    </span>
                    <span>{BLOCK_TYPE_KO[t]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// RowView — 행 컴포넌트
// 열 목록 렌더링 + 열 구분선 드래그 리사이즈 + 행 컨트롤
// Python으로 치면: class RowView(Container): columns + controls + resize_logic
// ──────────────────────────────────────────────
interface RowViewProps {
  row:        CRow
  rowIndex:   number
  totalRows:  number
  readMode?:  boolean
  onDeleteRow:     () => void
  onMoveRow:       (dir: -1 | 1) => void
  onAddColumn:     () => void
  onDeleteColumn:  (colId: string) => void
  onResizeColumns: (newWidths: number[]) => void
  onAddBlock:      (colId: string, type: BlockType) => void
  onUpdateBlock:   (colId: string, blockId: string, updates: Partial<CBlock>) => void
  onDeleteBlock:   (colId: string, blockId: string) => void
  onMoveBlock:     (colId: string, blockId: string, dir: -1 | 1) => void
}

function RowView({
  row, rowIndex, totalRows, readMode,
  onDeleteRow, onMoveRow, onAddColumn, onDeleteColumn, onResizeColumns,
  onAddBlock, onUpdateBlock, onDeleteBlock, onMoveBlock,
}: RowViewProps) {
  // 행 컨테이너 ref — 열 너비 계산 기준점
  // Python으로 치면: self.row_ref = ref  # 행 DOM 요소, 너비 계산에 사용
  const rowRef = useRef<HTMLDivElement>(null)

  // 드래그 시작 시점 스냅샷 (시작 X 좌표 + 원본 너비 배열)
  // Python으로 치면: self._resize_start = {widths: [...], start_x: 0}
  const resizeSnap = useRef<{ widths: number[]; startX: number } | null>(null)

  // 열 구분선 드래그 시작
  // colIndex: 드래그 핸들 왼쪽 열 인덱스 (오른쪽은 colIndex+1)
  // Python으로 치면: def start_resize(col_idx, event): snapshot; register listeners
  function startResize(colIndex: number, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    resizeSnap.current = {
      widths: row.columns.map(c => c.width),
      startX: e.clientX,
    }

    function onMove(ev: MouseEvent) {
      if (!resizeSnap.current || !rowRef.current) return
      const rowW  = rowRef.current.getBoundingClientRect().width
      const delta = ((ev.clientX - resizeSnap.current.startX) / rowW) * 100
      const ws    = [...resizeSnap.current.widths]

      // 좌측 열 너비 증가, 우측 열 너비 감소 (최소값 MIN_COL_W 보장)
      const newLeft  = Math.max(MIN_COL_W, resizeSnap.current.widths[colIndex]     + delta)
      const newRight = Math.max(MIN_COL_W, resizeSnap.current.widths[colIndex + 1] - delta)

      // 두 열의 합이 원래 합을 초과하지 않도록 보정
      const origSum = resizeSnap.current.widths[colIndex] + resizeSnap.current.widths[colIndex + 1]
      ws[colIndex]     = newLeft
      ws[colIndex + 1] = newRight
      if (newLeft + newRight > origSum) {
        // 합 초과 시 비율로 배분
        const ratio = origSum / (newLeft + newRight)
        ws[colIndex]     = newLeft  * ratio
        ws[colIndex + 1] = newRight * ratio
      }

      onResizeColumns(ws)
    }

    function onUp() {
      resizeSnap.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  return (
    // group/row: 행 컨트롤 hover 표시 트리거
    <div className="group/row relative mb-3">

      {/* ── 행 컨트롤 — 왼쪽 hover 시 나타남 ──
           위로/아래로 이동 + 삭제 버튼
           Python으로 치면: render_row_controls_on_hover() */}
      {!readMode && (
        <div className="absolute -left-7 top-0 flex flex-col items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity z-10">
          <button
            type="button"
            disabled={rowIndex === 0}
            className="text-stone-300 hover:text-stone-600 dark:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 transition-colors p-0.5 rounded"
            onClick={() => onMoveRow(-1)}
            title="행 위로"
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            className="text-stone-300 hover:text-red-400 transition-colors p-0.5 rounded"
            onClick={onDeleteRow}
            title="행 삭제"
          >
            <Trash2 size={11} />
          </button>
          <button
            type="button"
            disabled={rowIndex === totalRows - 1}
            className="text-stone-300 hover:text-stone-600 dark:text-stone-600 dark:hover:text-stone-300 disabled:opacity-20 transition-colors p-0.5 rounded"
            onClick={() => onMoveRow(1)}
            title="행 아래로"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}

      {/* ── 열 목록 + 구분선 핸들 ── */}
      <div ref={rowRef} className="flex items-stretch">
        {row.columns.map((col, ci) => (
          <div
            key={col.id}
            className="relative"
            style={{ width: `${col.width}%` }}
          >
            {/* 열 콘텐츠 — 마지막 열이 아니면 오른쪽에 12px 여백(구분선 공간) */}
            <div style={{ paddingRight: ci < row.columns.length - 1 ? '12px' : '0' }}>
              <ColumnView
                col={col}
                totalCols={row.columns.length}
                readMode={readMode}
                canDelete={col.blocks.length === 0 && row.columns.length > 1}
                onDeleteColumn={() => onDeleteColumn(col.id)}
                onAddBlock={type => onAddBlock(col.id, type)}
                onUpdateBlock={(blockId, upd) => onUpdateBlock(col.id, blockId, upd)}
                onDeleteBlock={blockId => onDeleteBlock(col.id, blockId)}
                onMoveBlock={(blockId, dir) => onMoveBlock(col.id, blockId, dir)}
              />
            </div>

            {/* ── 열 구분선 드래그 핸들 (마지막 열 제외, 편집 모드만) ──
                 12px 히트 영역 + 중앙 1px 시각적 라인
                 Python으로 치면: ResizeHandle(right_edge_of_col, drag=start_resize) */}
            {!readMode && ci < row.columns.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  right: '0',
                  top: '0',
                  bottom: '0',
                  width: '12px',
                  zIndex: 10,
                  cursor: 'col-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className="group/resize"
                onMouseDown={e => startResize(ci, e)}
                title="드래그하여 열 너비 조절"
              >
                {/* 시각적 구분선 — hover 시 진해짐 */}
                <div className="h-full w-px bg-stone-200 dark:bg-stone-700 group-hover/resize:bg-stone-400 dark:group-hover/resize:bg-stone-500 group-hover/resize:w-0.5 transition-all" />
              </div>
            )}
          </div>
        ))}

        {/* ── + 열 추가 버튼 (최대 4열 미만, 편집 모드) ──
             행 오른쪽 끝에 표시, hover 시 나타남
             Python으로 치면: if editable and cols < MAX: render add_col_button() */}
        {!readMode && row.columns.length < MAX_COLS && (
          <div className="flex items-center pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              className="w-6 h-6 rounded-full border border-dashed border-stone-300 dark:border-stone-600 text-stone-300 dark:text-stone-600 hover:border-stone-500 hover:text-stone-600 dark:hover:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all flex items-center justify-center"
              onClick={onAddColumn}
              title={`열 추가 (현재 ${row.columns.length}개)`}
            >
              <Plus size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// CanvasBlock — 메인 컴포넌트
// 전체 상태 관리 + 행/열/블록 조작 함수 정의
// Python으로 치면: class CanvasBlock(Widget): data + operations
// ──────────────────────────────────────────────
interface CanvasBlockProps {
  blockId:   string
  content:   string
  onChange:  (s: string) => void
  readMode?: boolean
}

export default function CanvasBlock({ blockId: _blockId, content, onChange, readMode }: CanvasBlockProps) {
  const [data, setData] = useState<CanvasState>(() => parseData(content))
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef  = useRef(onChange)
  onChangeRef.current = onChange

  // 디바운스 저장 (300ms)
  // Python으로 치면: @debounce(0.3) def save(data): onChange(json.dumps(data))
  const save = useCallback((nd: CanvasState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onChangeRef.current(JSON.stringify(nd)), 300)
  }, [])

  // ── 행 조작 ──────────────────────────────────

  // 행 추가 (맨 아래)
  // Python으로 치면: def add_row(): rows.append(new_row())
  const addRow = useCallback(() => {
    setData(prev => {
      const nd = { rows: [...prev.rows, newRow()] }
      save(nd); return nd
    })
  }, [save])

  // 행 삭제
  // Python으로 치면: def delete_row(id): rows.remove(id)
  const deleteRow = useCallback((rowId: string) => {
    setData(prev => {
      const nd = { rows: prev.rows.filter(r => r.id !== rowId) }
      save(nd); return nd
    })
  }, [save])

  // 행 위/아래 이동
  // Python으로 치면: def move_row(id, dir): swap(rows[i], rows[i+dir])
  const moveRow = useCallback((rowId: string, dir: -1 | 1) => {
    setData(prev => {
      const rows = [...prev.rows]
      const i    = rows.findIndex(r => r.id === rowId)
      if (i < 0 || i + dir < 0 || i + dir >= rows.length) return prev
      ;[rows[i], rows[i + dir]] = [rows[i + dir], rows[i]]
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // ── 열 조작 ──────────────────────────────────

  // 열 추가 — 기존 열 너비를 균등 재분배
  // Python으로 치면: def add_col(row_id): widths = equal_widths(n+1); add new col
  const addColumn = useCallback((rowId: string) => {
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId || r.columns.length >= MAX_COLS) return r
        const n   = r.columns.length + 1
        const ws  = equalWidths(n)
        const columns: CColumn[] = [
          ...r.columns.map((c, i) => ({ ...c, width: ws[i] })),
          { id: crypto.randomUUID(), width: ws[n - 1], blocks: [] },
        ]
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // 열 삭제 — 남은 열에 너비 균등 재분배
  // Python으로 치면: def delete_col(row_id, col_id): remove; redistribute widths
  const deleteColumn = useCallback((rowId: string, colId: string) => {
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r
        const remaining = r.columns.filter(c => c.id !== colId)
        if (remaining.length === 0) return r
        const ws      = equalWidths(remaining.length)
        const columns = remaining.map((c, i) => ({ ...c, width: ws[i] }))
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // 열 너비 배열 갱신 (구분선 드래그 후 호출)
  // Python으로 치면: def resize_cols(row_id, new_widths): update each col.width
  const resizeColumns = useCallback((rowId: string, newWidths: number[]) => {
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r
        const columns = r.columns.map((c, i) => ({ ...c, width: newWidths[i] ?? c.width }))
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // ── 블록 조작 ──────────────────────────────────

  // 블록 추가
  // Python으로 치면: def add_block(row_id, col_id, type): col.blocks.append(Block(type))
  const addBlock = useCallback((rowId: string, colId: string, type: BlockType) => {
    const newBlock: CBlock = { id: crypto.randomUUID(), type, content: '', color: '' }
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r
        const columns = r.columns.map(c =>
          c.id !== colId ? c : { ...c, blocks: [...c.blocks, newBlock] }
        )
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // 블록 수정
  // Python으로 치면: def update_block(row_id, col_id, block_id, **kwargs): block.update(kwargs)
  const updateBlock = useCallback((rowId: string, colId: string, blockId: string, updates: Partial<CBlock>) => {
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r
        const columns = r.columns.map(c => {
          if (c.id !== colId) return c
          return { ...c, blocks: c.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b) }
        })
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // 블록 삭제
  // Python으로 치면: def delete_block(row_id, col_id, block_id): col.blocks.remove(id)
  const deleteBlock = useCallback((rowId: string, colId: string, blockId: string) => {
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r
        const columns = r.columns.map(c =>
          c.id !== colId ? c : { ...c, blocks: c.blocks.filter(b => b.id !== blockId) }
        )
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // 블록 위/아래 이동
  // Python으로 치면: def move_block(row_id, col_id, block_id, dir): swap(blocks[i], blocks[i+dir])
  const moveBlock = useCallback((rowId: string, colId: string, blockId: string, dir: -1 | 1) => {
    setData(prev => {
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r
        const columns = r.columns.map(c => {
          if (c.id !== colId) return c
          const blocks = [...c.blocks]
          const i      = blocks.findIndex(b => b.id === blockId)
          if (i < 0 || i + dir < 0 || i + dir >= blocks.length) return c
          ;[blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]]
          return { ...c, blocks }
        })
        return { ...r, columns }
      })
      const nd = { rows }; save(nd); return nd
    })
  }, [save])

  // ── 렌더 ──────────────────────────────────────
  return (
    // dot-grid-bg: 점 격자 배경 (globals.css에 정의)
    // pl-8: 행 컨트롤 버튼(-left-7)이 잘리지 않도록 왼쪽 여백 확보
    <div className="relative rounded-xl border border-black/8 dark:border-white/8 dot-grid-bg shadow-sm overflow-visible px-8 py-5 print-hide select-none">

      {/* ── 빈 상태 안내 ──
           행이 하나도 없을 때 표시
           Python으로 치면: if not rows: render empty_state() */}
      {data.rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <p className="text-sm text-stone-400 dark:text-stone-600">
            {readMode ? '내용이 없습니다.' : '행을 추가하여 레이아웃을 구성하세요.'}
          </p>
          {!readMode && (
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-stone-500 dark:text-stone-400 border border-dashed border-stone-300 dark:border-stone-600 rounded-lg hover:bg-white/60 dark:hover:bg-stone-800/50 hover:text-stone-700 dark:hover:text-stone-300 hover:border-stone-400 transition-all"
              onClick={addRow}
            >
              <Plus size={14} />
              행 추가
            </button>
          )}
        </div>
      )}

      {/* ── 행 목록 ── */}
      {data.rows.map((row, ri) => (
        <RowView
          key={row.id}
          row={row}
          rowIndex={ri}
          totalRows={data.rows.length}
          readMode={readMode}
          onDeleteRow={() => deleteRow(row.id)}
          onMoveRow={dir => moveRow(row.id, dir)}
          onAddColumn={() => addColumn(row.id)}
          onDeleteColumn={colId => deleteColumn(row.id, colId)}
          onResizeColumns={ws => resizeColumns(row.id, ws)}
          onAddBlock={(colId, type) => addBlock(row.id, colId, type)}
          onUpdateBlock={(colId, blockId, upd) => updateBlock(row.id, colId, blockId, upd)}
          onDeleteBlock={(colId, blockId) => deleteBlock(row.id, colId, blockId)}
          onMoveBlock={(colId, blockId, dir) => moveBlock(row.id, colId, blockId, dir)}
        />
      ))}

      {/* ── + 행 추가 버튼 (편집 모드, 행이 1개 이상일 때) ──
           Python으로 치면: if editable and rows: render add_row_button() */}
      {!readMode && data.rows.length > 0 && (
        <button
          type="button"
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-stone-200 dark:border-stone-700 text-stone-300 dark:text-stone-600 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-500 dark:hover:text-stone-400 hover:bg-white/50 dark:hover:bg-stone-800/40 transition-all text-xs"
          onClick={addRow}
        >
          <Plus size={11} />
          행 추가
        </button>
      )}
    </div>
  )
}
