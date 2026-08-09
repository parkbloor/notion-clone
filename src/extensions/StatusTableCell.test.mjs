import test from 'node:test'
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { addRowAfter, CellSelection } from '@tiptap/pm/tables'
import {
  StatusTableCell,
  deleteStatusOption,
  getStatusOptionsForCell,
  getSelectedStatusCellPositions,
  getStatusConfigForCell,
  moveStatusOption,
  normalizeStatusColumns,
  renameStatusOption,
  setStatusOptionTone,
  setStatusCellValue,
  setStatusCellValues,
  setSelectedColumnType,
} from './StatusTableCell.ts'

const schema = getSchema([
  StarterKit,
  Table,
  TableRow,
  TableHeader,
  StatusTableCell,
])

// 테스트용 표 문서를 만든다.
// Python으로 치면: def make_table(rows): return schema.node_from_json(...)
function makeTable(rows) {
  return schema.nodeFromJSON({
    type: 'doc',
    content: [{
      type: 'table',
      content: rows.map((row, rowIndex) => ({
        type: 'tableRow',
        content: row.map(cell => ({
          type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
          attrs: cell.status
            ? {
                cellType: 'status',
                statusOptions: cell.options ?? [],
                statusTones: cell.tones ?? {},
              }
            : undefined,
          content: [{
            type: 'paragraph',
            content: cell.text ? [{ type: 'text', text: cell.text }] : undefined,
          }],
        })),
      })),
    }],
  })
}

// 지정한 행/열 셀의 노드와 문서 위치를 찾는다.
// Python으로 치면: def cell_at(doc, row, col): ...
function cellAt(doc, wantedRow, wantedCol) {
  let result = null
  let row = -1
  doc.descendants((node, pos) => {
    if (node.type.name === 'tableRow') {
      row += 1
      let col = 0
      node.forEach((cell, offset) => {
        if (row === wantedRow && col === wantedCol) {
          result = { node: cell, pos: pos + 1 + offset }
        }
        col += cell.attrs.colspan ?? 1
      })
      return false
    }
    return result === null
  })
  assert.ok(result, `셀을 찾지 못했습니다: ${wantedRow}, ${wantedCol}`)
  return result
}

test('선택한 열을 상태 열로 바꾸면 기존 텍스트만 초기 상태 목록으로 수집한다', () => {
  const doc = makeTable([
    [{ text: '이름' }, { text: '미리캔버스' }],
    [{ text: '코스모스' }, { text: '승인' }],
    [{ text: '국화' }, { text: '' }],
  ])
  const selected = cellAt(doc, 1, 1)
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selected.pos + 2),
  })

  const transaction = setSelectedColumnType(state, 'status')
  assert.ok(transaction)
  const nextDoc = state.apply(transaction).doc

  assert.equal(cellAt(nextDoc, 1, 1).node.attrs.cellType, 'status')
  assert.equal(cellAt(nextDoc, 1, 1).node.textContent, '승인')
  assert.equal(cellAt(nextDoc, 2, 1).node.attrs.cellType, 'status')
  assert.equal(cellAt(nextDoc, 2, 1).node.textContent, '')
  assert.deepEqual(cellAt(nextDoc, 1, 1).node.attrs.statusOptions, ['승인'])
  assert.deepEqual(cellAt(nextDoc, 2, 1).node.attrs.statusOptions, ['승인'])
  assert.equal(cellAt(nextDoc, 1, 0).node.attrs.cellType, 'text')
  assert.equal(cellAt(nextDoc, 0, 1).node.attrs.cellType, undefined)
})

test('사용자가 입력한 새 상태를 열 목록에 추가하고 현재 셀 값으로 적용한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '판매 상태' }],
    [{ text: 'A' }, { text: '대기', status: true, options: ['대기'] }],
    [{ text: 'B' }, { text: '', status: true, options: ['대기'] }],
  ])
  const target = cellAt(doc, 2, 1)
  const state = EditorState.create({ doc })
  const transaction = setStatusCellValue(state, target.pos, '판매완료')
  assert.ok(transaction)
  const nextState = state.apply(transaction)

  assert.equal(cellAt(nextState.doc, 2, 1).node.textContent, '판매완료')
  assert.deepEqual(getStatusOptionsForCell(nextState, target.pos), ['대기', '판매완료'])
  assert.deepEqual(cellAt(nextState.doc, 1, 1).node.attrs.statusOptions, ['대기', '판매완료'])
  assert.deepEqual(cellAt(nextState.doc, 2, 1).node.attrs.statusOptions, ['대기', '판매완료'])
})

test('표에서 선택한 여러 상태 셀에 같은 값을 한 번에 적용한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '판매 상태' }],
    [{ text: 'A' }, { text: '대기', status: true, options: ['대기', '완료'] }],
    [{ text: 'B' }, { text: '검토', status: true, options: ['대기', '완료', '검토'] }],
    [{ text: 'C' }, { text: '대기', status: true, options: ['대기', '완료', '검토'] }],
  ])
  const first = cellAt(doc, 1, 1)
  const second = cellAt(doc, 2, 1)
  const state = EditorState.create({
    doc,
    selection: CellSelection.create(doc, first.pos, second.pos),
  })
  const selectedPositions = getSelectedStatusCellPositions(state, second.pos)
  assert.deepEqual(selectedPositions, [first.pos, second.pos])

  const transaction = setStatusCellValues(state, selectedPositions, '완료')
  assert.ok(transaction)
  const nextDoc = state.apply(transaction).doc

  assert.equal(cellAt(nextDoc, 1, 1).node.textContent, '완료')
  assert.equal(cellAt(nextDoc, 2, 1).node.textContent, '완료')
  assert.equal(cellAt(nextDoc, 3, 1).node.textContent, '대기')
})

test('상태 이름 변경은 목록과 해당 열의 기존 셀 값을 함께 갱신한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '상태' }],
    [{ text: 'A' }, { text: '대기', status: true, options: ['대기', '완료'], tones: { 대기: 1, 완료: 2 } }],
    [{ text: 'B' }, { text: '완료', status: true, options: ['대기', '완료'], tones: { 대기: 1, 완료: 2 } }],
  ])
  const target = cellAt(doc, 1, 1)
  const state = EditorState.create({ doc })
  const transaction = renameStatusOption(state, target.pos, '대기', '진행 중')
  assert.ok(transaction)
  const nextState = state.apply(transaction)

  assert.equal(cellAt(nextState.doc, 1, 1).node.textContent, '진행 중')
  assert.equal(cellAt(nextState.doc, 2, 1).node.textContent, '완료')
  assert.deepEqual(getStatusConfigForCell(nextState, target.pos), {
    options: ['진행 중', '완료'],
    tones: { '진행 중': 1, 완료: 2 },
  })
})

test('상태 삭제는 목록에서 제거하고 해당 상태를 사용한 셀을 비운다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '상태' }],
    [{ text: 'A' }, { text: '대기', status: true, options: ['대기', '완료'] }],
    [{ text: 'B' }, { text: '완료', status: true, options: ['대기', '완료'] }],
  ])
  const target = cellAt(doc, 1, 1)
  const state = EditorState.create({ doc })
  const transaction = deleteStatusOption(state, target.pos, '대기')
  assert.ok(transaction)
  const nextState = state.apply(transaction)

  assert.equal(cellAt(nextState.doc, 1, 1).node.textContent, '')
  assert.equal(cellAt(nextState.doc, 2, 1).node.textContent, '완료')
  assert.deepEqual(getStatusOptionsForCell(nextState, target.pos), ['완료'])
})

test('상태 순서와 색상을 열 전체 설정으로 변경한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '상태' }],
    [{ text: 'A' }, { text: '대기', status: true, options: ['대기', '완료'] }],
    [{ text: 'B' }, { text: '완료', status: true, options: ['대기', '완료'] }],
  ])
  const target = cellAt(doc, 1, 1)
  const state = EditorState.create({ doc })
  const moved = moveStatusOption(state, target.pos, '완료', -1)
  assert.ok(moved)
  const movedState = state.apply(moved)
  const colored = setStatusOptionTone(movedState, target.pos, '완료', 4)
  assert.ok(colored)
  const nextState = movedState.apply(colored)

  assert.deepEqual(getStatusConfigForCell(nextState, target.pos), {
    options: ['완료', '대기'],
    tones: { 완료: 4, 대기: 0 },
  })
  assert.deepEqual(cellAt(nextState.doc, 2, 1).node.attrs.statusTones, { 완료: 4, 대기: 0 })
})

test('새 행의 빈 셀은 같은 열의 사용자 상태 목록과 첫 번째 값을 상속한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '툴디' }],
    [{ text: 'A' }, { text: '대기', status: true, options: ['대기', '완료'] }],
  ])
  const selected = cellAt(doc, 1, 1)
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selected.pos + 2),
  })
  let rowTransaction = null
  assert.equal(addRowAfter(state, transaction => { rowTransaction = transaction }), true)
  assert.ok(rowTransaction)
  const stateWithNewRow = state.apply(rowTransaction)
  const normalizeTransaction = normalizeStatusColumns(stateWithNewRow)
  assert.ok(normalizeTransaction)
  const nextDoc = stateWithNewRow.apply(normalizeTransaction).doc

  assert.equal(cellAt(nextDoc, 2, 1).node.attrs.cellType, 'status')
  assert.equal(cellAt(nextDoc, 2, 1).node.textContent, '대기')
  assert.deepEqual(cellAt(nextDoc, 2, 1).node.attrs.statusOptions, ['대기', '완료'])
})

test('상태 셀만 data-cell-type 속성을 HTML 렌더 규칙에 포함한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: '상태' }],
    [{ text: 'A' }, { text: '승인', status: true, options: ['승인', '보류'] }],
  ])
  const statusCell = cellAt(doc, 1, 1).node
  const textCell = cellAt(doc, 1, 0).node
  const renderStatus = schema.nodes.tableCell.spec.toDOM(statusCell)
  const renderText = schema.nodes.tableCell.spec.toDOM(textCell)

  assert.equal(renderStatus[1]['data-cell-type'], 'status')
  assert.equal(renderStatus[1]['data-status-options'], '["승인","보류"]')
  assert.equal(renderStatus[1]['data-status-tones'], '{"승인":0,"보류":1}')
  assert.equal(renderText[1]['data-cell-type'], undefined)
})

test('텍스트 열로 되돌려도 기존 상태 문자열은 유지한다', () => {
  const doc = makeTable([
    [{ text: '이미지' }, { text: 'Adobe Stock' }],
    [{ text: 'A' }, { text: '승인', status: true }],
    [{ text: 'B' }, { text: '반려', status: true }],
  ])
  const selected = cellAt(doc, 2, 1)
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selected.pos + 2),
  })

  const transaction = setSelectedColumnType(state, 'text')
  assert.ok(transaction)
  const nextDoc = state.apply(transaction).doc

  assert.equal(cellAt(nextDoc, 1, 1).node.attrs.cellType, 'text')
  assert.equal(cellAt(nextDoc, 1, 1).node.textContent, '승인')
  assert.equal(cellAt(nextDoc, 2, 1).node.textContent, '반려')
})
