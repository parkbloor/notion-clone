// ==============================================
// src/lib/templateGrid.ts
// 역할: 비주얼 그리드 템플릿의 타입 정의 + 변환 로직
//   - TemplateCell: 그리드 위 배치된 블록 한 칸
//   - gridCellsToBlocks: 그리드 셀 → 페이지 블록 변환
//   - hasCollision: 충돌 감지
// Python으로 치면: template_grid.py — dataclass + helper functions
// ==============================================

import { Block, BlockType, createBlock } from '@/types/block'

// ── 그리드 상수 ───────────────────────────────
// Python으로 치면: COLS = 12; ROW_H = 64
export const GRID_COLS = 12
export const GRID_ROW_H = 44  // px — 1행 높이

// ── 그리드 셀 타입 ────────────────────────────
// 12칼럼 × N행 그리드 위에 배치된 블록 하나를 표현
// Python으로 치면: @dataclass class TemplateCell: ...
export interface TemplateCell {
  id: string
  type: BlockType
  gridX: number        // 0~11 (칼럼 시작 인덱스)
  gridY: number        // 0~N  (행 시작 인덱스)
  gridW: number        // 1~12 (칼럼 너비)
  gridH: number        // 1~N  (행 높이)
  defaultContent: string  // HTML 기본 내용
}

// ── content 필드에 저장되는 JSON 구조 ─────────
// Python으로 치면: @dataclass class GridTemplateContent: type: str; cells: list[TemplateCell]
export interface GridTemplateContent {
  type: 'grid'
  gridCols: number  // 편집 시 사용한 칼럼 수 (기본 12)
  cells: TemplateCell[]
}

// content 문자열이 그리드 템플릿인지 확인
// Python으로 치면: def is_grid_template(content: str) -> bool: ...
export function isGridTemplate(content: string): boolean {
  try {
    if (!content.startsWith('{')) return false
    const parsed = JSON.parse(content)
    return parsed.type === 'grid'
  } catch {
    return false
  }
}

// ── 팔레트 블록 정의 ──────────────────────────
// Python으로 치면: PALETTE_BLOCKS = [{'type': 'heading1', ...}, ...]
export interface PaletteBlock {
  type: BlockType
  label: string
  icon: string
  defaultH: number   // 기본 높이 (행 수)
  colorClass: string // Tailwind bg-* 클래스
  textClass: string  // Tailwind text-* 클래스
}

export const PALETTE_BLOCKS: PaletteBlock[] = [
  { type: 'heading1',    label: '제목 1',    icon: 'H1', defaultH: 1, colorClass: 'bg-blue-100',   textClass: 'text-blue-800' },
  { type: 'heading2',    label: '제목 2',    icon: 'H2', defaultH: 1, colorClass: 'bg-blue-100',   textClass: 'text-blue-700' },
  { type: 'heading3',    label: '제목 3',    icon: 'H3', defaultH: 1, colorClass: 'bg-blue-50',    textClass: 'text-blue-600' },
  { type: 'paragraph',   label: '텍스트',    icon: '¶',  defaultH: 2, colorClass: 'bg-gray-100',   textClass: 'text-gray-600' },
  { type: 'bulletList',  label: '글머리',    icon: '•',  defaultH: 3, colorClass: 'bg-green-100',  textClass: 'text-green-700' },
  { type: 'orderedList', label: '번호목록',  icon: '1.', defaultH: 3, colorClass: 'bg-green-100',  textClass: 'text-green-700' },
  { type: 'taskList',    label: '체크리스트', icon: '☑', defaultH: 3, colorClass: 'bg-green-50',   textClass: 'text-green-600' },
  { type: 'divider',     label: '구분선',    icon: '—',  defaultH: 1, colorClass: 'bg-gray-200',   textClass: 'text-gray-500' },
  { type: 'table',       label: '표',        icon: '⊞',  defaultH: 4, colorClass: 'bg-purple-100', textClass: 'text-purple-700' },
  { type: 'code',        label: '코드',      icon: '<>', defaultH: 3, colorClass: 'bg-orange-100', textClass: 'text-orange-700' },
  { type: 'admonition',  label: '콜아웃',    icon: '!',  defaultH: 2, colorClass: 'bg-yellow-100', textClass: 'text-yellow-700' },
  { type: 'kanban',      label: '칸반',      icon: '⊡',  defaultH: 6, colorClass: 'bg-red-100',    textClass: 'text-red-700' },
]

// 블록 타입 → 팔레트 정의 조회
// Python으로 치면: def get_palette(type: str) -> PaletteBlock: ...
export function getPaletteBlock(type: BlockType): PaletteBlock {
  return PALETTE_BLOCKS.find(p => p.type === type) ?? {
    type,
    label: type,
    icon: '?',
    defaultH: 2,
    colorClass: 'bg-gray-100',
    textClass: 'text-gray-600',
  }
}

// ── 충돌 감지 ─────────────────────────────────
// 두 셀이 겹치는지 확인 (excludeId = 이동 중인 셀 자신은 제외)
// Python으로 치면: def has_collision(cells, candidate, exclude_id=None) -> bool: ...
export function hasCollision(
  cells: TemplateCell[],
  candidate: Pick<TemplateCell, 'gridX' | 'gridY' | 'gridW' | 'gridH'>,
  excludeId?: string
): boolean {
  return cells.some(c => {
    if (c.id === excludeId) return false
    // AABB (axis-aligned bounding box) 겹침 검사
    // Python으로 치면: not (A.right <= B.left or A.left >= B.right or A.bottom <= B.top or A.top >= B.bottom)
    return (
      candidate.gridX < c.gridX + c.gridW &&
      candidate.gridX + candidate.gridW > c.gridX &&
      candidate.gridY < c.gridY + c.gridH &&
      candidate.gridY + candidate.gridH > c.gridY
    )
  })
}

// ── 행 그룹핑 ────────────────────────────────
// Y 범위가 겹치는 셀들을 같은 그룹으로 묶음 (LayoutBlock 변환용)
// Python으로 치면: def group_by_rows(cells) -> list[list[TemplateCell]]: ...
function groupByRows(cells: TemplateCell[]): TemplateCell[][] {
  const sorted = [...cells].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
  const groups: TemplateCell[][] = []
  const used = new Set<string>()

  for (const cell of sorted) {
    if (used.has(cell.id)) continue
    const group = [cell]
    used.add(cell.id)

    // Y 범위가 겹치는 다른 셀을 반복적으로 추가
    // Python으로 치면: while True: expand_group(); if not changed: break
    let changed = true
    while (changed) {
      changed = false
      const minY = Math.min(...group.map(c => c.gridY))
      const maxY = Math.max(...group.map(c => c.gridY + c.gridH))
      for (const other of sorted) {
        if (used.has(other.id)) continue
        if (other.gridY < maxY && other.gridY + other.gridH > minY) {
          group.push(other)
          used.add(other.id)
          changed = true
        }
      }
    }

    // 그룹 내 X 기준 정렬
    group.sort((a, b) => a.gridX - b.gridX)
    groups.push(group)
  }

  return groups
}

// 셀 하나를 일반 Block으로 변환
// Python으로 치면: def cell_to_block(cell) -> Block: ...
function cellToBlock(cell: TemplateCell): Block {
  const block = createBlock(cell.type)
  block.content = cell.defaultContent || ''
  return block
}

// ── 그리드 셀 → 페이지 블록 변환 ──────────────
// 같은 행에 있는 셀들 → LayoutBlock
// 혼자 전체 너비 → 일반 Block
// Python으로 치면: def grid_cells_to_blocks(cells, grid_cols=12) -> list[Block]: ...
export function gridCellsToBlocks(cells: TemplateCell[], gridCols = 12): Block[] {
  if (cells.length === 0) return [createBlock('paragraph')]

  const rowGroups = groupByRows(cells)
  const result: Block[] = []

  for (const group of rowGroups) {
    if (group.length === 1 && group[0].gridW === gridCols) {
      // 단독 전체 너비 → 일반 블록
      result.push(cellToBlock(group[0]))
    } else if (group.length >= 2 && group.length <= 3) {
      // 2~3칸 나란히 → LayoutBlock
      const totalW = group.reduce((sum, c) => sum + c.gridW, 0)
      const cols = group.map(c => Math.round((c.gridW / totalW) * 100))
      // 반올림 오차 보정 → 합계가 100이 되도록
      // Python으로 치면: cols[-1] += 100 - sum(cols)
      cols[cols.length - 1] += 100 - cols.reduce((a, b) => a + b, 0)

      const layoutBlock = createBlock('layout')
      const slotsKey = ['a', 'b', 'c'] as const
      const slots: Record<string, Block[]> = {}
      group.forEach((cell, i) => {
        slots[slotsKey[i]] = [cellToBlock(cell)]
      })

      const templateName = group.length === 2 ? 'two-col' : 'three-col'
      layoutBlock.content = JSON.stringify({
        template: templateName,
        orientation: 'portrait',
        slots,
        cols,
      })
      result.push(layoutBlock)
    } else {
      // 4개 이상이거나 혼자지만 전체 너비가 아닌 경우 → 첫 번째만 일반 블록으로 처리
      // (에디터에서 최대 3개 제한으로 사실상 발생하지 않음)
      for (const cell of group) {
        result.push(cellToBlock(cell))
      }
    }
  }

  return result
}
