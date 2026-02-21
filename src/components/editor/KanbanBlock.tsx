// =============================================
// src/components/editor/KanbanBlock.tsx
// 역할: 칸반 보드 블록 — 열과 카드 드래그앤드롭 지원
// Python으로 치면: class KanbanBoard: def __init__(self, content): self.data = parse(content)
// =============================================

'use client'

import { useState, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// -----------------------------------------------
// 타입 정의
// Python으로 치면: @dataclass class KanbanCard, KanbanColumn, KanbanData
// -----------------------------------------------

// 카드 한 장의 구조
interface KanbanCard {
  id: string    // 카드 고유 ID
  title: string // 카드 제목
}

// 열(컬럼) 하나의 구조
interface KanbanColumn {
  id: string    // 열 고유 ID
  title: string // 열 제목 (예: '할 일', '진행 중')
  color: string // 열 배경색 (hex)
  cards: KanbanCard[]
}

// 전체 칸반 데이터 (block.content에 JSON으로 저장)
interface KanbanData {
  columns: KanbanColumn[]
}

interface KanbanBlockProps {
  blockId: string
  pageId: string
  content: string                        // block.content (JSON 문자열)
  onChange: (newContent: string) => void // 변경 시 저장 콜백
}

// -----------------------------------------------
// JSON 파싱 헬퍼 — 잘못된 JSON이면 기본 3열 구조 반환
// Python으로 치면: def parse(s): try: return json.loads(s) except: return default_kanban()
// -----------------------------------------------
function parseContent(content: string): KanbanData {
  try {
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.columns)) return parsed
  } catch { /* noop */ }
  return {
    columns: [
      { id: crypto.randomUUID(), title: '할 일',  color: '#f1f5f9', cards: [] },
      { id: crypto.randomUUID(), title: '진행 중', color: '#dbeafe', cards: [] },
      { id: crypto.randomUUID(), title: '완료',   color: '#dcfce7', cards: [] },
    ],
  }
}

// -----------------------------------------------
// SortableCard: dnd-kit으로 드래그 가능한 카드 컴포넌트
// Python으로 치면: class SortableCard(Widget): def render(self): ...
// -----------------------------------------------
function SortableCard({
  card,
  columnId,
  onDelete,
  onEdit,
}: {
  card: KanbanCard
  columnId: string
  onDelete: () => void
  onEdit: (title: string) => void
}) {
  // useSortable: 이 카드를 드래그 가능한 아이템으로 등록
  // data에 type/columnId/card 포함 → DragOver 핸들러에서 참조
  // Python으로 치면: sortable_id, drag_ref, listeners = useSortable(card.id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId, card },
  })

  // 인라인 편집 상태
  // Python으로 치면: self.is_editing = False; self.edit_value = card.title
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(card.title)

  // 편집 확정 — blur 또는 Enter 시 호출
  // Python으로 치면: def commit_edit(self): self.on_edit(self.edit_value.strip())
  function commitEdit() {
    setIsEditing(false)
    const final = editValue.trim() || '제목 없음'
    if (final !== card.title) onEdit(final)
    else setEditValue(card.title)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className="group/card relative bg-white rounded-md border border-gray-200 shadow-sm mb-2"
    >
      {isEditing ? (
        // 편집 모드: textarea로 제목 수정
        <textarea
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
            if (e.key === 'Escape') { setIsEditing(false); setEditValue(card.title) }
          }}
          className="w-full px-3 py-2 text-sm text-gray-800 resize-none outline-none bg-transparent rounded-md"
          rows={2}
        />
      ) : (
        // 보기 모드: 드래그 핸들 + 제목 + 삭제 버튼
        <div className="flex items-start px-2 py-2 gap-1.5">
          {/* 드래그 핸들 (hover 시 표시) */}
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover/card:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 shrink-0 mt-0.5 select-none transition-opacity text-xs"
          >
            ⠿
          </div>
          {/* 카드 제목 — 더블클릭으로 편집 진입 */}
          <p
            className="flex-1 text-sm text-gray-800 break-words cursor-text leading-snug"
            onDoubleClick={() => { setEditValue(card.title); setIsEditing(true) }}
          >
            {card.title || '제목 없음'}
          </p>
          {/* 삭제 버튼 (hover 시 표시) */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="opacity-0 group-hover/card:opacity-100 text-gray-300 hover:text-red-400 text-sm transition-opacity shrink-0 leading-none"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------
// DroppableColumn: 카드 드롭을 받는 열 컴포넌트
// Python으로 치면: class DroppableColumn(Widget): def render_cards(self): ...
// -----------------------------------------------
function DroppableColumn({
  column,
  onDeleteColumn,
  onRenameColumn,
  onAddCard,
  onDeleteCard,
  onEditCard,
}: {
  column: KanbanColumn
  onDeleteColumn: () => void
  onRenameColumn: (title: string) => void
  onAddCard: () => void
  onDeleteCard: (cardId: string) => void
  onEditCard: (cardId: string, title: string) => void
}) {
  // useDroppable: 이 div에 카드 드롭 가능하도록 등록
  // Python으로 치면: self.droppable_ref, self.is_over = useDroppable(column.id)
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column' },
  })

  // 열 제목 인라인 편집 상태
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(column.title)

  // 열 제목 편집 확정
  // Python으로 치면: def commit_title(self): self.on_rename(self.title_value.strip())
  function commitTitle() {
    setIsEditingTitle(false)
    const final = titleValue.trim() || '새 열'
    if (final !== column.title) onRenameColumn(final)
    else setTitleValue(column.title)
  }

  return (
    <div
      className="flex-shrink-0 w-64 flex flex-col rounded-xl transition-all"
      style={{
        background: column.color,
        outline: isOver ? '2px solid #3b82f6' : 'none',
        outlineOffset: '2px',
      }}
    >
      {/* 열 헤더: 제목 + 카드 개수 + 삭제 버튼 */}
      <div className="group/col flex items-center gap-1 px-3 pt-3 pb-2">
        {isEditingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') commitTitle()
              if (e.key === 'Escape') { setIsEditingTitle(false); setTitleValue(column.title) }
            }}
            className="flex-1 text-sm font-semibold text-gray-700 bg-transparent outline-none border-b border-gray-400"
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-gray-600 cursor-text select-none"
            onDoubleClick={() => { setTitleValue(column.title); setIsEditingTitle(true) }}
          >
            {column.title}
          </span>
        )}
        {/* 카드 개수 뱃지 */}
        <span className="text-xs text-gray-400 shrink-0">{column.cards.length}</span>
        {/* 열 삭제 버튼 (hover 시 표시) */}
        <button
          type="button"
          onClick={onDeleteColumn}
          className="opacity-0 group-hover/col:opacity-100 text-gray-400 hover:text-red-400 text-sm transition-opacity shrink-0"
        >
          ×
        </button>
      </div>

      {/* 카드 목록 드롭 영역 */}
      {/* min-h: 빈 열에도 드롭 가능하도록 최소 높이 보장 */}
      {/* Python으로 치면: with Droppable(id=column.id): render_cards() */}
      <div
        ref={setNodeRef}
        className="flex-1 px-2 pb-1 min-h-16"
      >
        <SortableContext
          items={column.cards.map(c => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map(card => (
            <SortableCard
              key={card.id}
              card={card}
              columnId={column.id}
              onDelete={() => onDeleteCard(card.id)}
              onEdit={title => onEditCard(card.id, title)}
            />
          ))}
        </SortableContext>
      </div>

      {/* + 카드 추가 버튼 */}
      <button
        type="button"
        onClick={onAddCard}
        className="mx-2 mb-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-black/5 rounded-lg transition-colors text-left px-2"
      >
        + 카드 추가
      </button>
    </div>
  )
}

// -----------------------------------------------
// KanbanBlock: 메인 칸반 보드 컴포넌트
// Python으로 치면: class KanbanBlock(Widget): def render(self): return KanbanBoard(self.data)
// -----------------------------------------------
export default function KanbanBlock({ blockId, pageId: _pageId, content, onChange }: KanbanBlockProps) {

  // content prop → 로컬 state 초기화 (마운트 시 한 번만)
  // Python으로 치면: self.data = parse_content(content)
  const [data, setData] = useState<KanbanData>(() => parseContent(content))

  // 드래그 중인 카드 정보 (DragOverlay 렌더링용)
  // Python으로 치면: self.active_card = None
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)

  // ── stale closure 방지용 refs ───────────────────
  // 드래그 이벤트 핸들러에서 최신 columns 접근
  // Python으로 치면: self._cols_ref = self.data.columns
  const columnsRef = useRef(data.columns)
  columnsRef.current = data.columns

  // 드래그 중 카드가 현재 어느 열에 있는지 추적
  // Python으로 치면: self._active_col_id = None
  const activeColumnIdRef = useRef<string | null>(null)

  // -----------------------------------------------
  // 변경사항 저장 — state 갱신 + onChange 호출 (백엔드 저장 트리거)
  // Python으로 치면: def save(self, cols): self.data.columns = cols; self.on_change(json_str)
  // -----------------------------------------------
  const save = useCallback((columns: KanbanColumn[]) => {
    columnsRef.current = columns
    setData({ columns })
    onChange(JSON.stringify({ columns }))
  }, [onChange])

  // PointerSensor: 8px 이동 후 드래그 시작 (클릭 오발동 방지)
  // Python으로 치면: sensor = PointerSensor(activation_distance=8)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // -----------------------------------------------
  // 드래그 시작 핸들러 — 어떤 카드가 드래그되는지 기록
  // Python으로 치면: def on_drag_start(self, e): self.active_card = find_card(e.active.id)
  // -----------------------------------------------
  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    if (active.data.current?.type !== 'card') return
    setActiveCard(active.data.current.card)
    activeColumnIdRef.current = active.data.current.columnId
  }

  // -----------------------------------------------
  // 드래그 이동 핸들러 — 카드 위치를 즉시 반영 (낙관적 업데이트)
  //   같은 열: arrayMove로 순서 변경
  //   다른 열: 원본에서 제거 후 대상에 삽입
  // Python으로 치면: def on_drag_over(self, e): reorder_or_move_card_in_state()
  // -----------------------------------------------
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || !activeColumnIdRef.current) return
    if (active.data.current?.type !== 'card') return
    if (active.id === over.id) return

    const cols = columnsRef.current
    const activeColId = activeColumnIdRef.current

    // over가 카드인지 열인지 판별
    let overColId: string
    let overCardIdx = -1

    if (over.data.current?.type === 'card') {
      overColId = over.data.current.columnId
      const overCol = cols.find(c => c.id === overColId)
      if (overCol) overCardIdx = overCol.cards.findIndex(c => c.id === over.id)
    } else if (over.data.current?.type === 'column') {
      overColId = over.id as string
    } else {
      return
    }

    // 드래그 중인 카드 찾기
    const movingCard = cols.find(c => c.id === activeColId)?.cards.find(c => c.id === active.id)
    if (!movingCard) return

    let newCols: KanbanColumn[]

    if (activeColId === overColId) {
      // 같은 열 내 순서 변경 (arrayMove)
      // Python으로 치면: col.cards = array_move(col.cards, from_idx, to_idx)
      const col = cols.find(c => c.id === activeColId)!
      const fromIdx = col.cards.findIndex(c => c.id === active.id)
      if (fromIdx < 0 || overCardIdx < 0 || fromIdx === overCardIdx) return
      newCols = cols.map(c =>
        c.id === activeColId ? { ...c, cards: arrayMove(c.cards, fromIdx, overCardIdx) } : c
      )
    } else {
      // 다른 열로 카드 이동
      // Python으로 치면: src_col.cards.remove(card); dst_col.cards.insert(idx, card)
      newCols = cols.map(col => {
        if (col.id === activeColId) return { ...col, cards: col.cards.filter(c => c.id !== active.id) }
        if (col.id === overColId) {
          const newCards = [...col.cards]
          if (overCardIdx >= 0) newCards.splice(overCardIdx, 0, movingCard)
          else newCards.push(movingCard)
          return { ...col, cards: newCards }
        }
        return col
      })
      // 이동 후 activeColumnId 업데이트
      activeColumnIdRef.current = overColId
    }

    // ref를 즉시 갱신 (다음 DragOver 이벤트에서 stale 읽기 방지)
    // Python으로 치면: self._cols_ref = new_cols
    columnsRef.current = newCols
    setData({ columns: newCols })
  }

  // -----------------------------------------------
  // 드래그 종료 핸들러 — 최종 상태를 onChange로 저장
  // Python으로 치면: def on_drag_end(self, e): self.save(self._cols_ref)
  // -----------------------------------------------
  function handleDragEnd(_event: DragEndEvent) {
    setActiveCard(null)
    activeColumnIdRef.current = null
    save(columnsRef.current)
  }

  // ── 카드 CRUD ────────────────────────────────

  // 카드 추가 — 열 끝에 새 빈 카드 삽입
  // Python으로 치면: def add_card(self, col_id): col.cards.append(KanbanCard(uuid(), '새 카드'))
  const addCard = useCallback((colId: string) => {
    const newCard: KanbanCard = { id: crypto.randomUUID(), title: '새 카드' }
    const newCols = data.columns.map(col =>
      col.id === colId ? { ...col, cards: [...col.cards, newCard] } : col
    )
    save(newCols)
  }, [data.columns, save])

  // 카드 삭제
  // Python으로 치면: def delete_card(self, col_id, card_id): col.cards.remove(card)
  const deleteCard = useCallback((colId: string, cardId: string) => {
    const newCols = data.columns.map(col =>
      col.id === colId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col
    )
    save(newCols)
  }, [data.columns, save])

  // 카드 제목 수정
  // Python으로 치면: def edit_card(self, col_id, card_id, title): card.title = title
  const editCard = useCallback((colId: string, cardId: string, title: string) => {
    const newCols = data.columns.map(col =>
      col.id === colId
        ? { ...col, cards: col.cards.map(c => c.id === cardId ? { ...c, title } : c) }
        : col
    )
    save(newCols)
  }, [data.columns, save])

  // ── 열 CRUD ──────────────────────────────────

  // 열 추가 — 오른쪽 끝에 새 열 삽입
  // Python으로 치면: def add_column(self): self.columns.append(KanbanColumn(...))
  const addColumn = useCallback(() => {
    const palette = ['#f1f5f9', '#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3', '#ede9fe']
    const newCol: KanbanColumn = {
      id: crypto.randomUUID(),
      title: '새 열',
      color: palette[data.columns.length % palette.length],
      cards: [],
    }
    save([...data.columns, newCol])
  }, [data.columns, save])

  // 열 삭제 (안에 카드가 있어도 삭제)
  // Python으로 치면: def delete_column(self, col_id): self.columns.remove(col)
  const deleteColumn = useCallback((colId: string) => {
    save(data.columns.filter(col => col.id !== colId))
  }, [data.columns, save])

  // 열 이름 변경
  // Python으로 치면: def rename_column(self, col_id, title): col.title = title
  const renameColumn = useCallback((colId: string, title: string) => {
    const newCols = data.columns.map(col =>
      col.id === colId ? { ...col, title } : col
    )
    save(newCols)
  }, [data.columns, save])

  return (
    <div className="py-2 select-none">
      {/* 칸반 전용 DndContext (외부 블록 DndContext와 중첩 — dnd-kit에서 공식 지원) */}
      {/* Python으로 치면: with DndContext(sensors=sensors, on_drag_start=...) as ctx: render() */}
      <DndContext
        id={`dnd-kanban-${blockId}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-3">
          {data.columns.map(column => (
            <DroppableColumn
              key={column.id}
              column={column}
              onDeleteColumn={() => deleteColumn(column.id)}
              onRenameColumn={title => renameColumn(column.id, title)}
              onAddCard={() => addCard(column.id)}
              onDeleteCard={cardId => deleteCard(column.id, cardId)}
              onEditCard={(cardId, title) => editCard(column.id, cardId, title)}
            />
          ))}

          {/* + 열 추가 버튼 */}
          <button
            type="button"
            onClick={addColumn}
            className="flex-shrink-0 w-64 h-12 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-400 text-sm transition-colors self-start"
          >
            + 열 추가
          </button>
        </div>

        {/* DragOverlay: 드래그 중 카드 고정 미리보기 */}
        {/* Python으로 치면: if self.active_card: render Ghost(self.active_card) */}
        <DragOverlay>
          {activeCard ? (
            <div className="bg-white rounded-md border border-gray-200 shadow-xl px-3 py-2 text-sm text-gray-800 w-60 rotate-2 cursor-grabbing">
              {activeCard.title || '제목 없음'}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
