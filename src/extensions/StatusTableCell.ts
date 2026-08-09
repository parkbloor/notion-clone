// =============================================
// src/extensions/StatusTableCell.ts
// 역할: 사용자 정의 상태 목록을 가진 Tiptap 표 열 저장·상속 처리
// Python으로 치면: class StatusTableCell(TableCell): ...
// =============================================

import { TableCell } from '@tiptap/extension-table-cell'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { CellSelection, TableMap, selectionCell } from '@tiptap/pm/tables'

export type TableStatusValue = string
export type TableColumnType = 'text' | 'status'
export type TableStatusTone = 0 | 1 | 2 | 3 | 4
export interface TableStatusConfig {
  options: string[]
  tones: Record<string, TableStatusTone>
}

interface TableContext {
  table: ProseMirrorNode
  tableStart: number
  map: TableMap
  column: number
}

interface ColumnCell {
  pos: number
  node: ProseMirrorNode
}

interface CellChange extends ColumnCell {
  cellType: TableColumnType
  statusOptions: string[]
  statusTones: Record<string, TableStatusTone>
  fillDefault: boolean
}

const statusTablePluginKey = new PluginKey('statusTableCell')

// 사용자 입력 목록에서 공백과 중복을 제거한다.
// Python으로 치면: def normalize_options(values): return list(dict.fromkeys(...))
export function normalizeStatusOptions(values: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach(value => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })
  return result
}

// 저장된 data-status-options JSON을 안전하게 읽는다.
// Python으로 치면: def parse_status_options(raw): return json.loads(raw) or []
function parseStatusOptions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? normalizeStatusOptions(parsed) : []
  } catch {
    return []
  }
}

function normalizeStatusTones(raw: unknown, options: string[]): Record<string, TableStatusTone> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  return Object.fromEntries(options.map((option, index) => {
    const tone = source[option]
    return [option, Number.isInteger(tone) && Number(tone) >= 0 && Number(tone) <= 4
      ? Number(tone) as TableStatusTone
      : index % 5 as TableStatusTone]
  }))
}

function parseStatusTones(raw: string | null): Record<string, TableStatusTone> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, TableStatusTone>
      : {}
  } catch {
    return {}
  }
}

// 현재 선택 셀이 속한 표와 논리 열 번호를 찾는다.
// Python으로 치면: def selected_table_context(state): ...
function getSelectedTableContext(state: EditorState): TableContext | null {
  try {
    const $cell = selectionCell(state)
    const table = $cell.node(-1)
    if (table.type.spec.tableRole !== 'table') return null
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)
    const column = map.colCount($cell.pos - tableStart)
    return { table, tableStart, map, column }
  } catch {
    return null
  }
}

// 셀 노드 시작 위치에서 해당 표와 논리 열 번호를 찾는다.
// Python으로 치면: def table_context_at_cell(state, cell_pos): ...
function getTableContextAtCell(state: EditorState, cellPos: number): TableContext | null {
  try {
    const $cell = state.doc.resolve(cellPos)
    const cell = $cell.nodeAfter
    const table = $cell.node(-1)
    if (!cell || cell.type.spec.tableRole !== 'cell' || table.type.spec.tableRole !== 'table') return null
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)
    const column = map.colCount(cellPos - tableStart)
    return { table, tableStart, map, column }
  } catch {
    return null
  }
}

// 셀이 헤더인지 판별한다. 헤더에는 상태 UI를 표시하지 않는다.
// Python으로 치면: def is_header_cell(node): return node.table_role == 'header_cell'
function isHeaderCell(node: ProseMirrorNode): boolean {
  return node.type.spec.tableRole === 'header_cell'
}

// 한 표의 특정 논리 열에 속한 데이터 셀을 수집한다. colspan 중복은 제거한다.
// Python으로 치면: def collect_column_cells(context): ...
function collectColumnCells(context: TableContext): ColumnCell[] {
  const { table, tableStart, map, column } = context
  const seen = new Set<number>()
  const cells: ColumnCell[] = []

  for (let row = 0; row < map.height; row += 1) {
    const relativePos = map.map[row * map.width + column]
    if (seen.has(relativePos)) continue
    seen.add(relativePos)
    const cell = table.nodeAt(relativePos)
    if (!cell || isHeaderCell(cell)) continue
    cells.push({ pos: tableStart + relativePos, node: cell })
  }
  return cells
}

// 열에 저장된 목록과 현재 셀 문자열을 합쳐 하위 호환 가능한 상태 목록을 만든다.
// Python으로 치면: def collect_options(cells): return unique(saved + current_values)
function collectStatusOptions(cells: ColumnCell[]): string[] {
  return normalizeStatusOptions(cells.flatMap(({ node }) => [
    ...(Array.isArray(node.attrs.statusOptions) ? node.attrs.statusOptions : []),
    node.textContent,
  ]))
}

function collectStatusTones(
  cells: ColumnCell[],
  options: string[],
): Record<string, TableStatusTone> {
  const savedTones: Record<string, unknown> = {}
  cells.forEach(({ node }) => {
    const tones = node.attrs.statusTones
    if (!tones || typeof tones !== 'object' || Array.isArray(tones)) return
    Object.entries(tones as Record<string, unknown>).forEach(([status, tone]) => {
      if (savedTones[status] === undefined) savedTones[status] = tone
    })
  })
  return normalizeStatusTones(savedTones, options)
}

// 셀 타입, 열 상태 목록, 새 행 기본값을 한 셀에 적용한다.
// Python으로 치면: def apply_cell_change(tr, change): ...
function applyCellChange(tr: Transaction, change: CellChange): void {
  const { node, pos, cellType, statusOptions, statusTones, fillDefault } = change
  const nextAttrs = { ...node.attrs, cellType, statusOptions, statusTones }
  const defaultValue = statusOptions[0] ?? ''

  if (fillDefault && defaultValue && node.textContent.trim() === '') {
    const paragraph = node.type.schema.nodes.paragraph?.create(null, node.type.schema.text(defaultValue))
    if (paragraph) {
      tr.replaceWith(pos, pos + node.nodeSize, node.type.create(nextAttrs, paragraph))
      return
    }
  }

  const optionsChanged = JSON.stringify(node.attrs.statusOptions ?? []) !== JSON.stringify(statusOptions)
  const tonesChanged = JSON.stringify(node.attrs.statusTones ?? {}) !== JSON.stringify(statusTones)
  if (node.attrs.cellType !== cellType || optionsChanged || tonesChanged) {
    tr.setNodeMarkup(pos, undefined, nextAttrs)
  }
}

// 선택 열의 현재 타입을 반환한다. 속성이 없는 기존 셀은 텍스트 열이다.
// Python으로 치면: def selected_column_type(state): ...
export function getSelectedColumnType(state: EditorState): TableColumnType {
  const context = getSelectedTableContext(state)
  if (!context) return 'text'
  return collectColumnCells(context).some(({ node }) => node.attrs.cellType === 'status')
    ? 'status'
    : 'text'
}

// 선택한 논리 열 전체를 텍스트 또는 상태 열로 바꾼다.
// Python으로 치면: def set_selected_column_type(state, cell_type): return transaction
export function setSelectedColumnType(
  state: EditorState,
  cellType: TableColumnType,
): Transaction | null {
  const context = getSelectedTableContext(state)
  if (!context) return null
  const cells = collectColumnCells(context)
  const statusOptions = cellType === 'status' ? collectStatusOptions(cells) : []
  const statusTones = cellType === 'status' ? collectStatusTones(cells, statusOptions) : {}
  const tr = state.tr

  cells
    .map(({ pos, node }): CellChange => ({
      pos,
      node,
      cellType,
      statusOptions,
      statusTones,
      fillDefault: false,
    }))
    .sort((a, b) => b.pos - a.pos)
    .forEach(change => applyCellChange(tr, change))
  return tr.docChanged ? tr : null
}

// 특정 상태 셀이 속한 열의 사용자 상태 목록을 반환한다.
// Python으로 치면: def get_status_options_for_cell(state, cell_pos): ...
export function getStatusOptionsForCell(state: EditorState, cellPos: number): string[] {
  return getStatusConfigForCell(state, cellPos).options
}

export function getStatusConfigForCell(state: EditorState, cellPos: number): TableStatusConfig {
  const context = getTableContextAtCell(state, cellPos)
  if (!context) return { options: [], tones: {} }
  const cells = collectColumnCells(context).filter(({ node }) => node.attrs.cellType === 'status')
  const options = collectStatusOptions(cells)
  return { options, tones: collectStatusTones(cells, options) }
}

// 클릭한 셀이 표 셀 다중 선택에 포함되어 있으면 선택된 상태 셀 위치를 반환한다.
// Python으로 치면: def selected_status_cell_positions(state, clicked_pos): ...
export function getSelectedStatusCellPositions(state: EditorState, cellPos: number): number[] {
  if (!(state.selection instanceof CellSelection)) return [cellPos]
  const selectedPositions: number[] = []
  state.selection.forEachCell((node, pos) => {
    if (!isHeaderCell(node) && node.attrs.cellType === 'status') selectedPositions.push(pos)
  })
  return selectedPositions.includes(cellPos) ? selectedPositions : [cellPos]
}

// 사용자 입력 상태를 각 열 목록에 추가하고 선택한 상태 셀들에 일괄 적용한다.
// Python으로 치면: def set_status_cell_values(state, cell_positions, value): ...
export function setStatusCellValues(
  state: EditorState,
  cellPositions: number[],
  value: string,
): Transaction | null {
  const normalizedValue = value.trim()
  if (!normalizedValue) return null

  const requestedPositions = new Set(cellPositions)
  const columnGroups = new Map<string, ColumnCell[]>()
  requestedPositions.forEach(cellPos => {
    const context = getTableContextAtCell(state, cellPos)
    if (!context) return
    const cells = collectColumnCells(context).filter(({ node }) => node.attrs.cellType === 'status')
    if (!cells.some(cell => cell.pos === cellPos)) return
    columnGroups.set(`${context.tableStart}:${context.column}`, cells)
  })
  if (columnGroups.size === 0) return null

  const changes = new Map<number, {
    node: ProseMirrorNode
    statusOptions: string[]
    statusTones: Record<string, TableStatusTone>
    applyValue: boolean
  }>()
  columnGroups.forEach(cells => {
    const statusOptions = normalizeStatusOptions([...collectStatusOptions(cells), normalizedValue])
    const statusTones = collectStatusTones(cells, statusOptions)
    cells.forEach(({ pos, node }) => {
      changes.set(pos, { node, statusOptions, statusTones, applyValue: requestedPositions.has(pos) })
    })
  })
  const tr = state.tr

  Array.from(changes.entries()).sort(([a], [b]) => b - a).forEach(([pos, change]) => {
    const { node, statusOptions, statusTones, applyValue } = change
    const nextAttrs = { ...node.attrs, cellType: 'status', statusOptions, statusTones }
    if (applyValue) {
      const paragraph = node.type.schema.nodes.paragraph?.create(null, node.type.schema.text(normalizedValue))
      if (paragraph) tr.replaceWith(pos, pos + node.nodeSize, node.type.create(nextAttrs, paragraph))
    } else if (
      JSON.stringify(node.attrs.statusOptions ?? []) !== JSON.stringify(statusOptions)
      || JSON.stringify(node.attrs.statusTones ?? {}) !== JSON.stringify(statusTones)
    ) {
      tr.setNodeMarkup(pos, undefined, nextAttrs)
    }
  })
  return tr.docChanged ? tr : null
}

// 기존 단일 셀 호출부를 위한 호환 함수.
// Python으로 치면: def set_status_cell_value(state, cell_pos, value): ...
export function setStatusCellValue(
  state: EditorState,
  cellPos: number,
  value: string,
): Transaction | null {
  return setStatusCellValues(state, [cellPos], value)
}

function changeStatusColumnConfig(
  state: EditorState,
  cellPos: number,
  options: string[],
  tones: Record<string, TableStatusTone>,
  replaceValue?: { from: string; to: string },
): Transaction | null {
  const context = getTableContextAtCell(state, cellPos)
  if (!context) return null
  const cells = collectColumnCells(context).filter(({ node }) => node.attrs.cellType === 'status')
  if (!cells.some(cell => cell.pos === cellPos)) return null
  const normalizedOptions = normalizeStatusOptions(options)
  const normalizedTones = normalizeStatusTones(tones, normalizedOptions)
  const tr = state.tr

  cells.sort((a, b) => b.pos - a.pos).forEach(({ pos, node }) => {
    const nextAttrs = {
      ...node.attrs,
      statusOptions: normalizedOptions,
      statusTones: normalizedTones,
    }
    if (replaceValue && node.textContent.trim() === replaceValue.from) {
      const paragraph = replaceValue.to
        ? node.type.schema.nodes.paragraph?.create(null, node.type.schema.text(replaceValue.to))
        : node.type.schema.nodes.paragraph?.create()
      if (paragraph) tr.replaceWith(pos, pos + node.nodeSize, node.type.create(nextAttrs, paragraph))
    } else if (
      JSON.stringify(node.attrs.statusOptions ?? []) !== JSON.stringify(normalizedOptions)
      || JSON.stringify(node.attrs.statusTones ?? {}) !== JSON.stringify(normalizedTones)
    ) {
      tr.setNodeMarkup(pos, undefined, nextAttrs)
    }
  })
  return tr.docChanged ? tr : null
}

export function renameStatusOption(
  state: EditorState,
  cellPos: number,
  oldValue: string,
  newValue: string,
): Transaction | null {
  const config = getStatusConfigForCell(state, cellPos)
  const normalizedValue = newValue.trim()
  if (!normalizedValue || !config.options.includes(oldValue)) return null
  if (normalizedValue !== oldValue && config.options.includes(normalizedValue)) return null
  const options = config.options.map(option => option === oldValue ? normalizedValue : option)
  const tones = { ...config.tones, [normalizedValue]: config.tones[oldValue] }
  if (normalizedValue !== oldValue) delete tones[oldValue]
  return changeStatusColumnConfig(state, cellPos, options, tones, {
    from: oldValue,
    to: normalizedValue,
  })
}

export function deleteStatusOption(
  state: EditorState,
  cellPos: number,
  value: string,
): Transaction | null {
  const config = getStatusConfigForCell(state, cellPos)
  if (!config.options.includes(value)) return null
  const options = config.options.filter(option => option !== value)
  const tones = { ...config.tones }
  delete tones[value]
  return changeStatusColumnConfig(state, cellPos, options, tones, { from: value, to: '' })
}

export function moveStatusOption(
  state: EditorState,
  cellPos: number,
  value: string,
  direction: -1 | 1,
): Transaction | null {
  const config = getStatusConfigForCell(state, cellPos)
  const index = config.options.indexOf(value)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= config.options.length) return null
  const options = [...config.options]
  ;[options[index], options[nextIndex]] = [options[nextIndex], options[index]]
  return changeStatusColumnConfig(state, cellPos, options, config.tones)
}

export function setStatusOptionTone(
  state: EditorState,
  cellPos: number,
  value: string,
  tone: TableStatusTone,
): Transaction | null {
  const config = getStatusConfigForCell(state, cellPos)
  if (!config.options.includes(value)) return null
  return changeStatusColumnConfig(state, cellPos, config.options, {
    ...config.tones,
    [value]: tone,
  })
}

// 새 행의 셀에 같은 열의 타입, 사용자 목록, 첫 번째 기본값을 상속한다.
// Python으로 치면: def normalize_status_columns(state): ...
export function normalizeStatusColumns(state: EditorState): Transaction | null {
  const changes = new Map<number, CellChange>()

  state.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole !== 'table') return true
    const tableStart = pos + 1
    const map = TableMap.get(node)

    for (let column = 0; column < map.width; column += 1) {
      const context = { table: node, tableStart, map, column }
      const cells = collectColumnCells(context)
      const statusCells = cells.filter(cell => cell.node.attrs.cellType === 'status')
      if (statusCells.length === 0) continue
      const statusOptions = collectStatusOptions(statusCells)
      const statusTones = collectStatusTones(statusCells, statusOptions)

      cells.forEach(({ pos: cellPos, node: cell }) => {
        const isNewStatusCell = cell.attrs.cellType !== 'status'
        const optionsChanged = JSON.stringify(cell.attrs.statusOptions ?? []) !== JSON.stringify(statusOptions)
        const tonesChanged = JSON.stringify(cell.attrs.statusTones ?? {}) !== JSON.stringify(statusTones)
        if (isNewStatusCell || optionsChanged || tonesChanged) {
          changes.set(cellPos, {
            pos: cellPos,
            node: cell,
            cellType: 'status',
            statusOptions,
            statusTones,
            fillDefault: isNewStatusCell,
          })
        }
      })
    }
    return false
  })

  if (changes.size === 0) return null
  const tr = state.tr
  Array.from(changes.values())
    .sort((a, b) => b.pos - a.pos)
    .forEach(change => applyCellChange(tr, change))
  return tr.docChanged ? tr : null
}

// 현재 커서가 상태 데이터 셀 안에 있는지 확인한다.
// Python으로 치면: def selection_is_in_status_cell(state): ...
function selectionIsInStatusCell(state: EditorState): boolean {
  try {
    const cell = selectionCell(state).nodeAfter
    return Boolean(cell && !isHeaderCell(cell) && cell.attrs.cellType === 'status')
  } catch {
    return false
  }
}

// 사용자 지정 색상이 없으면 목록 순서에 따라 다섯 가지 배지 색상을 순환한다.
// Python으로 치면: def status_tone(node): return saved_tone or options.index(value) % 5
function statusToneClass(node: ProseMirrorNode): string {
  const options = Array.isArray(node.attrs.statusOptions)
    ? normalizeStatusOptions(node.attrs.statusOptions)
    : []
  const index = options.indexOf(node.textContent.trim())
  if (index < 0) return 'status-table-cell--unknown'
  const tones = normalizeStatusTones(node.attrs.statusTones, options)
  return `status-table-cell--tone-${tones[options[index]]}`
}

// TableCell을 같은 노드 이름으로 확장해 기존 표 명령과 HTML 구조를 유지한다.
// Python으로 치면: class StatusTableCell(TableCell): add_attributes(...)
export const StatusTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cellType: {
        default: 'text',
        parseHTML: element => element.getAttribute('data-cell-type') === 'status' ? 'status' : 'text',
        renderHTML: attributes => attributes.cellType === 'status'
          ? { 'data-cell-type': 'status' }
          : {},
      },
      statusOptions: {
        default: [],
        parseHTML: element => parseStatusOptions(element.getAttribute('data-status-options')),
        renderHTML: attributes => attributes.cellType === 'status' && Array.isArray(attributes.statusOptions)
          ? { 'data-status-options': JSON.stringify(normalizeStatusOptions(attributes.statusOptions)) }
          : {},
      },
      statusTones: {
        default: {},
        parseHTML: element => parseStatusTones(element.getAttribute('data-status-tones')),
        renderHTML: attributes => attributes.cellType === 'status'
          && attributes.statusTones
          && typeof attributes.statusTones === 'object'
          ? {
              'data-status-tones': JSON.stringify(normalizeStatusTones(
                attributes.statusTones,
                Array.isArray(attributes.statusOptions)
                  ? normalizeStatusOptions(attributes.statusOptions)
                  : [],
              )),
            }
          : {},
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: statusTablePluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(transaction => transaction.docChanged)) return null
          return normalizeStatusColumns(newState)
        },
        props: {
          decorations: state => {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.spec.tableRole === 'cell' && node.attrs.cellType === 'status') {
                decorations.push(Decoration.node(
                  pos,
                  pos + node.nodeSize,
                  { class: `status-table-cell ${statusToneClass(node)}` },
                ))
              }
              return true
            })
            return DecorationSet.create(state.doc, decorations)
          },
          handleTextInput: view => selectionIsInStatusCell(view.state),
          handlePaste: view => selectionIsInStatusCell(view.state),
          handleKeyDown: (view, event) => {
            if (!selectionIsInStatusCell(view.state)) return false
            return event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key)
          },
        },
      }),
    ]
  },
})
