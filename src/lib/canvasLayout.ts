// =============================================
// src/lib/canvasLayout.ts
// 역할: 캔버스 위치(canvasX/Y/W) 기반으로 블록을 행(row)으로 그룹화
//       일반 모드에서 캔버스 레이아웃을 반영하는 핵심 유틸
// Python으로 치면: def group_blocks_into_rows(blocks): ...
// =============================================

import { Block } from '@/types/block'

// -----------------------------------------------
// 같은 행으로 판정하는 canvasY 거리 임계값 (px)
// 두 블록의 canvasY 차이가 이 값 이하면 같은 행으로 묶음
// DEFAULT_H(120)의 절반 — 살짝 어긋나게 배치한 블록도 같은 행으로 인식
// Python으로 치면: ROW_THRESHOLD = 60
// -----------------------------------------------
const ROW_THRESHOLD = 60

// -----------------------------------------------
// 블록 배열을 캔버스 행(row) 단위로 그룹화
//
// 동작:
//   1. canvasY 있는 블록 → canvasY 오름차순 정렬
//   2. 이전 행의 최소 canvasY와 현재 블록의 canvasY 차이 < ROW_THRESHOLD → 같은 행
//   3. 같은 행 내부는 canvasX 오름차순 정렬 (왼쪽→오른쪽)
//   4. canvasY 없는 블록 → 단독 행으로 맨 뒤에 추가
//
// 반환: Block[][] (각 원소가 한 행, 행 내부는 왼→오른 순)
//
// Python으로 치면:
//   def group_blocks_into_rows(blocks):
//       positioned = sorted([b for b in blocks if b.canvas_y], key=lambda b: b.canvas_y)
//       rows = []
//       for block in positioned:
//           if rows and block.canvas_y - rows[-1][0].canvas_y < ROW_THRESHOLD:
//               rows[-1].append(block)
//           else:
//               rows.append([block])
//       for row in rows: row.sort(key=lambda b: b.canvas_x)
//       for block in blocks: if not block.canvas_y: rows.append([block])
//       return rows
// -----------------------------------------------
export function groupBlocksIntoRows(blocks: Block[]): Block[][] {
  // canvasY 있는 블록과 없는 블록 분리
  // Python으로 치면: positioned = [b for b in blocks if b.canvas_y is not None]
  const positioned = blocks
    .filter(b => b.canvasY !== undefined)
    .sort((a, b) => (a.canvasY ?? 0) - (b.canvasY ?? 0))

  const unpositioned = blocks.filter(b => b.canvasY === undefined)

  // canvasY 기준으로 행 그룹화
  // Python으로 치면: rows: list[list[Block]] = []
  const rows: Block[][] = []

  for (const block of positioned) {
    const lastRow = rows[rows.length - 1]

    if (lastRow) {
      // 현재 행의 최소 canvasY (행 기준점)
      // Python으로 치면: row_base_y = min(b.canvas_y for b in last_row)
      const rowBaseY = Math.min(...lastRow.map(b => b.canvasY ?? 0))

      if ((block.canvasY ?? 0) - rowBaseY < ROW_THRESHOLD) {
        // 같은 행에 추가
        lastRow.push(block)
        continue
      }
    }

    // 새 행 시작
    rows.push([block])
  }

  // 각 행 내부를 canvasX 오름차순 정렬 (왼쪽→오른쪽)
  // Python으로 치면: for row in rows: row.sort(key=lambda b: b.canvas_x or 0)
  for (const row of rows) {
    row.sort((a, b) => (a.canvasX ?? 0) - (b.canvasX ?? 0))
  }

  // canvasY 없는 블록은 단독 행으로 맨 뒤에 추가 (기존 순서 유지)
  // Python으로 치면: rows.extend([[b] for b in unpositioned])
  for (const block of unpositioned) {
    rows.push([block])
  }

  return rows
}

// -----------------------------------------------
// 같은 행의 블록들의 flex 너비 비율 계산
//
// canvasW 비율 기반 → 캔버스에서 조절한 너비가 일반 모드에 반영됨
// canvasW 없으면 균등 분할 (1/n)
//
// 반환: CSS flex 값 문자열 배열 (예: ["3 1 0%", "2 1 0%"])
//       → <div style={{ flex: widths[i] }}> 에 바로 사용
//
// Python으로 치면:
//   def get_column_flex_values(row):
//       total = sum(b.canvas_w or DEFAULT_W for b in row)
//       return [f"{b.canvas_w or DEFAULT_W} 1 0%" for b in row]
// -----------------------------------------------
const DEFAULT_CANVAS_W = 520

export function getColumnFlexValues(row: Block[]): string[] {
  if (row.length === 1) return ['1 1 0%']

  // 모든 블록에 canvasW가 없으면 균등 분할
  // Python으로 치면: if all(b.canvas_w is None for b in row): return ['1 1 0%'] * len(row)
  const hasAnyWidth = row.some(b => b.canvasW !== undefined)
  if (!hasAnyWidth) {
    return row.map(() => '1 1 0%')
  }

  // canvasW 비율로 flex 값 설정
  // Python으로 치면: return [f"{b.canvas_w or DEFAULT_W} 1 0%" for b in row]
  return row.map(b => `${b.canvasW ?? DEFAULT_CANVAS_W} 1 0%`)
}

// -----------------------------------------------
// 페이지의 블록에 캔버스 위치 정보가 있는지 확인
// 하나라도 canvasY가 있으면 행 그룹화 렌더링 사용
// Python으로 치면: def has_canvas_layout(blocks): return any(b.canvas_y for b in blocks)
// -----------------------------------------------
export function hasCanvasLayout(blocks: Block[]): boolean {
  return blocks.some(b => b.canvasY !== undefined)
}
