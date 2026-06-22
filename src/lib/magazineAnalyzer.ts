// =============================================
// src/lib/magazineAnalyzer.ts
// 역할: 블록 배열을 분석해 각 블록의 잡지 레이아웃 역할(BlockRole)을 추론
// 룰 기반 분석 — Claude API 없이 로컬에서 즉시 동작
// Python으로 치면: def analyze_blocks(blocks: list[Block]) -> list[BlockAnalysis]: ...
// =============================================

import { Block, BlockRole, LayoutCell, LayoutDescriptor, LayoutTemplate, createLayoutDescriptor, DEFAULT_LAYOUT_THEME } from '@/types/block'

// 분석 결과 하나 — blockId + 역할 + 가중치
// Python으로 치면: @dataclass class BlockAnalysis: block_id, role, weight
export interface BlockAnalysis {
  blockId: string
  type: Block['type']
  role: BlockRole
  weight: number    // 1~10: 레이아웃에서 얼마나 큰 공간을 차지해야 하는지
  textLength?: number
}

// 텍스트 블록 타입 목록
// Python으로 치면: TEXT_TYPES = {'paragraph', 'heading1', ...}
const TEXT_TYPES = new Set([
  'paragraph', 'heading1', 'heading2', 'heading3',
  'heading4', 'heading5', 'heading6',
  'bulletList', 'orderedList', 'taskList', 'toggle',
])

// 비주얼 블록 타입 목록
// Python으로 치면: VISUAL_TYPES = {'chart', 'mermaid', 'mindmap', 'excalidraw', 'canvas'}
const VISUAL_TYPES = new Set([
  'chart', 'mermaid', 'mindmap', 'excalidraw', 'gantt',
])

// HTML 태그 제거 후 텍스트 길이 반환
// Python으로 치면: def strip_html(html): re.sub('<[^>]+>', '', html)
function textLength(content: string): number {
  return content.replace(/<[^>]+>/g, '').trim().length
}

// -----------------------------------------------
// 블록 배열 분석 — 각 블록에 역할(BlockRole)을 할당
// Python으로 치면: def analyze_blocks(blocks): ...
// -----------------------------------------------
export function analyzeBlocks(blocks: Block[]): BlockAnalysis[] {
  const results: BlockAnalysis[] = []
  let heroImageAssigned = false   // 히어로 이미지는 첫 번째 이미지 하나만

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const prevBlock = i > 0 ? blocks[i - 1] : null
    const len = textLength(block.content)

    let role: BlockRole = 'body_text'
    let weight = 5

    if (block.type === 'heading1') {
      // H1 → 항상 헤드라인
      role = 'headline'
      weight = 10
    } else if (block.type === 'heading2') {
      // H2 → 서브헤드라인
      role = 'subheadline'
      weight = 8
    } else if (block.type === 'image') {
      if (!heroImageAssigned) {
        // 첫 번째 이미지 → 히어로
        role = 'hero_image'
        weight = 9
        heroImageAssigned = true
      } else {
        // 나머지 이미지
        // 바로 앞이 텍스트 블록이면 캡션용 이미지로 취급
        role = prevBlock && TEXT_TYPES.has(prevBlock.type) ? 'hero_image' : 'hero_image'
        weight = 7
      }
    } else if (block.type === 'admonition') {
      // 인용구 or 콜아웃 → 풀쿼트
      role = 'pull_quote'
      weight = 7
    } else if (block.type === 'table') {
      // 표 → 데이터 테이블
      role = 'data_table'
      weight = 8
    } else if (VISUAL_TYPES.has(block.type)) {
      // 차트/다이어그램 → 시각 자료
      role = 'visual'
      weight = 8
    } else if (TEXT_TYPES.has(block.type)) {
      // 텍스트 계열: 길이로 role 분류
      if (len === 0) {
        // 빈 블록은 분석에서 제외 (weight 0)
        role = 'body_text'
        weight = 0
      } else if (len < 80) {
        // 짧은 텍스트 → 사이드바/캡션
        // 바로 앞이 이미지면 캡션, 아니면 사이드바
        if (prevBlock?.type === 'image') {
          role = 'caption'
          weight = 3
        } else {
          role = 'sidebar_text'
          weight = 4
        }
      } else if (len >= 200) {
        // 긴 텍스트 → 본문
        role = 'body_text'
        weight = 6
      } else {
        // 중간 길이 (80~199) → 사이드바
        role = 'sidebar_text'
        weight = 5
      }
    }

    results.push({
      blockId: block.id,
      type: block.type,
      role,
      weight,
      textLength: len,
    })
  }

  return results
}

// -----------------------------------------------
// 콘텐츠 조합 프로파일 — 템플릿 선택에 사용
// Python으로 치면: def profile_content(analyses): ...
// -----------------------------------------------
export interface ContentProfile {
  imageCount: number
  longTextCount: number
  shortTextCount: number
  hasTable: boolean
  hasQuote: boolean
  hasVisual: boolean
  hasHeadline: boolean
}

export function profileContent(analyses: BlockAnalysis[]): ContentProfile {
  return {
    imageCount: analyses.filter(a => a.role === 'hero_image').length,
    longTextCount: analyses.filter(a => a.role === 'body_text').length,
    shortTextCount: analyses.filter(a => a.role === 'sidebar_text' || a.role === 'caption').length,
    hasTable: analyses.some(a => a.role === 'data_table'),
    hasQuote: analyses.some(a => a.role === 'pull_quote'),
    hasVisual: analyses.some(a => a.role === 'visual'),
    hasHeadline: analyses.some(a => a.role === 'headline'),
  }
}

// -----------------------------------------------
// 프리셋 템플릿 5종 정의
// Python으로 치면: PRESET_TEMPLATES: list[LayoutTemplate] = [...]
// -----------------------------------------------

// 잡지 스프레드형 — 이미지 + 본문 조합
const TEMPLATE_MAGAZINE_SPREAD = 'magazine_spread'
// 신문형 — 텍스트 중심 멀티컬럼
const TEMPLATE_NEWSPAPER = 'newspaper'
// 갤러리형 — 이미지 많은 경우
const TEMPLATE_GALLERY = 'gallery'
// 리포트형 — 데이터(표/차트) 중심
const TEMPLATE_REPORT = 'report'
// 카드형 — 짧은 텍스트들
const TEMPLATE_CARDS = 'cards'

export const PRESET_TEMPLATES = [
  {
    id: TEMPLATE_MAGAZINE_SPREAD,
    name: '잡지 스프레드형',
    nameEn: 'Magazine Spread',
    description: '큰 이미지 + 옆 텍스트, 잡지 느낌',
  },
  {
    id: TEMPLATE_NEWSPAPER,
    name: '신문형',
    nameEn: 'Newspaper',
    description: '헤드라인 + 멀티컬럼 본문',
  },
  {
    id: TEMPLATE_GALLERY,
    name: '갤러리형',
    nameEn: 'Gallery',
    description: '이미지가 주인공, 텍스트는 보조',
  },
  {
    id: TEMPLATE_REPORT,
    name: '리포트형',
    nameEn: 'Report',
    description: '표/차트 중심, 학술/업무 문서',
  },
  {
    id: TEMPLATE_CARDS,
    name: '카드형',
    nameEn: 'Cards',
    description: '짧은 내용들을 카드로 배열',
  },
] as const

export type TemplateId = typeof PRESET_TEMPLATES[number]['id']

// -----------------------------------------------
// 콘텐츠 프로파일 → 최적 템플릿 자동 선택
// Python으로 치면: def pick_template(profile): ...
// -----------------------------------------------
export function pickTemplate(profile: ContentProfile): TemplateId {
  if (profile.imageCount >= 3) return TEMPLATE_GALLERY
  if (profile.hasTable || profile.hasVisual) return TEMPLATE_REPORT
  if (profile.imageCount >= 1 && profile.longTextCount >= 1) return TEMPLATE_MAGAZINE_SPREAD
  if (profile.shortTextCount >= 3) return TEMPLATE_CARDS
  return TEMPLATE_NEWSPAPER
}

// -----------------------------------------------
// 분석 결과 + 템플릿 → LayoutDescriptor 생성
// Python으로 치면: def build_layout(page_id, blocks, analyses, template_id): ...
// -----------------------------------------------
export function buildLayout(
  pageId: string,
  blocks: Block[],
  analyses: BlockAnalysis[],
  templateId: TemplateId,
  existingDescriptor?: LayoutDescriptor,
): LayoutDescriptor {
  const descriptor = existingDescriptor
    ? { ...existingDescriptor, cells: [...existingDescriptor.cells] }
    : createLayoutDescriptor(pageId)

  descriptor.templateId = templateId

  // weight 0인 블록(빈 블록) 제외
  const active = analyses.filter(a => a.weight > 0)

  // locked 셀 보존 — locked 셀의 blockId는 재배치 대상에서 제외
  const lockedBlockIds = new Set(
    descriptor.cells.filter(c => c.locked).map(c => c.blockId)
  )
  const lockedCells = descriptor.cells.filter(c => c.locked)

  // 재배치 대상 — locked 아닌 블록들만
  const toPlace = active.filter(a => !lockedBlockIds.has(a.blockId))

  // 템플릿별 배치 로직 실행
  const newCells = placeByTemplate(templateId, toPlace, blocks)

  descriptor.cells = [...lockedCells, ...newCells]
  descriptor.version += 1
  descriptor.updatedAt = new Date().toISOString()

  return descriptor
}

// -----------------------------------------------
// 템플릿별 셀 배치 로직
// Python으로 치면: def place_by_template(template_id, analyses, blocks): ...
// -----------------------------------------------
function placeByTemplate(
  templateId: TemplateId,
  analyses: BlockAnalysis[],
  blocks: Block[],
): LayoutCell[] {
  // blockId → Block 빠른 조회용 맵
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  switch (templateId) {
    case TEMPLATE_MAGAZINE_SPREAD: return placeMagazineSpread(analyses, blockMap)
    case TEMPLATE_NEWSPAPER:       return placeNewspaper(analyses, blockMap)
    case TEMPLATE_GALLERY:         return placeGallery(analyses, blockMap)
    case TEMPLATE_REPORT:          return placeReport(analyses, blockMap)
    case TEMPLATE_CARDS:           return placeCards(analyses, blockMap)
    default:                       return placeNewspaper(analyses, blockMap)
  }
}

// blockMap에서 블록을 찾아 row span 추정
// Python으로 치면: def get_row_span(analysis, block_map, fallback): int
function getRowSpan(
  analysis: BlockAnalysis,
  blockMap: Map<string, Block>,
  fallback = 3,
): number {
  const block = blockMap.get(analysis.blockId)
  if (!block) return fallback
  return estimateRowSpan(block.type, block.content)
}

// 헬퍼: 새 LayoutCell 생성
// Python으로 치면: def make_cell(block_id, col, row, role): ...
function makeCell(
  blockId: string,
  col: [number, number],
  row: [number, number],
  role?: BlockRole,
): LayoutCell {
  return {
    id: crypto.randomUUID(),
    blockId,
    col,
    row,
    locked: false,
    userEdited: false,
    role,
  }
}

// 블록 타입과 내용으로 최소 row span 추정
// 표: <tr> 개수 기반 / 비주얼: 고정 큰 값 / 텍스트: 글자 수 기반
// Python으로 치면: def estimate_row_span(block_type, content): int
function estimateRowSpan(type: Block['type'], content: string): number {
  if (type === 'table') {
    // <tr> 태그 수 × 1.1 (여유분) + 헤더·패딩용 2행, 최소 4행
    const trCount = (content.match(/<tr/gi) ?? []).length
    return Math.max(4, Math.ceil(trCount * 1.1) + 2)
  }
  if (type === 'chart' || type === 'gantt' || type === 'mermaid' ||
      type === 'mindmap' || type === 'excalidraw' || type === 'canvas' ||
      type === 'kanban' || type === 'dayplanner' || type === 'weekplanner' ||
      type === 'weeklyplanner' || type === 'routinematrix' || type === 'monthlycalendar' ||
      type === 'quarterlyplanner' || type === 'yearlyplanner') {
    return 10  // 복잡한 비주얼 블록 — 충분한 높이
  }
  if (type === 'image' || type === 'video' || type === 'embed') return 5
  if (type === 'code') {
    const lineCount = (content.match(/\n/g) ?? []).length
    return Math.max(3, Math.ceil(lineCount * 0.8) + 2)
  }
  if (type === 'heading1') return 1
  if (type === 'heading2' || type === 'heading3') return 1
  if (type === 'math') return 2
  if (type === 'divider' || type === 'toc') return 1
  // 텍스트 계열: 글자 수 기반
  const len = content.replace(/<[^>]+>/g, '').trim().length
  if (len === 0) return 1
  if (len < 100) return 2
  if (len < 400) return 3
  return Math.min(8, Math.ceil(len / 300) + 2)
}

// 잡지 스프레드형 배치
// 헤드라인(전체폭) → 히어로이미지(좌 7컬럼) + 본문(우 5컬럼) → 나머지 하단
// Python으로 치면: def place_magazine_spread(analyses, block_map): ...
function placeMagazineSpread(analyses: BlockAnalysis[], blockMap: Map<string, Block>): LayoutCell[] {
  const cells: LayoutCell[] = []
  let currentRow = 1

  const headline   = analyses.find(a => a.role === 'headline')
  const subhead    = analyses.find(a => a.role === 'subheadline')
  const heroImage  = analyses.find(a => a.role === 'hero_image')
  const bodyTexts  = analyses.filter(a => a.role === 'body_text')
  const pullQuote  = analyses.find(a => a.role === 'pull_quote')
  const sideTexts  = analyses.filter(a => a.role === 'sidebar_text' || a.role === 'caption')
  const remainder  = analyses.filter(a =>
    a !== headline && a !== subhead && a !== heroImage &&
    !bodyTexts.includes(a) && a !== pullQuote && !sideTexts.includes(a)
  )

  // 헤드라인 — 전체 폭
  if (headline) {
    cells.push(makeCell(headline.blockId, [1, 13], [currentRow, currentRow + 1], 'headline'))
    currentRow += 1
  }
  // 서브헤드라인 — 전체 폭
  if (subhead) {
    cells.push(makeCell(subhead.blockId, [1, 13], [currentRow, currentRow + 1], 'subheadline'))
    currentRow += 1
  }

  // 히어로 이미지(좌 7) + 첫 번째 본문(우 5)
  const heroRow = currentRow
  const heroSpan = heroImage ? getRowSpan(heroImage, blockMap, 4) : 4
  if (heroImage) {
    cells.push(makeCell(heroImage.blockId, [1, 8], [heroRow, heroRow + heroSpan], 'hero_image'))
  }
  if (bodyTexts.length > 0) {
    const bodySpan = Math.min(getRowSpan(bodyTexts[0], blockMap, 2), heroSpan)
    cells.push(makeCell(bodyTexts[0].blockId, [8, 13], [heroRow, heroRow + bodySpan], 'body_text'))
  }
  if (sideTexts.length > 0) {
    const sideSpan = Math.min(getRowSpan(sideTexts[0], blockMap, 2), heroSpan)
    const sideStart = heroRow + (heroSpan - sideSpan)
    cells.push(makeCell(sideTexts[0].blockId, [8, 13], [sideStart, sideStart + sideSpan], 'sidebar_text'))
  }
  currentRow = heroRow + heroSpan

  // 풀쿼트 — 전체 폭
  if (pullQuote) {
    cells.push(makeCell(pullQuote.blockId, [1, 13], [currentRow, currentRow + 1], 'pull_quote'))
    currentRow += 1
  }

  // 나머지 본문 — 2컬럼으로
  const remainingBody = bodyTexts.slice(1)
  for (let i = 0; i < remainingBody.length; i += 2) {
    const span = Math.max(
      getRowSpan(remainingBody[i], blockMap, 2),
      remainingBody[i + 1] ? getRowSpan(remainingBody[i + 1], blockMap, 2) : 0,
    )
    if (remainingBody[i + 1]) {
      cells.push(makeCell(remainingBody[i].blockId, [1, 7], [currentRow, currentRow + span], 'body_text'))
      cells.push(makeCell(remainingBody[i + 1].blockId, [7, 13], [currentRow, currentRow + span], 'body_text'))
    } else {
      cells.push(makeCell(remainingBody[i].blockId, [1, 13], [currentRow, currentRow + span], 'body_text'))
    }
    currentRow += span
  }

  // 나머지 블록 — 타입에 따라 넓이 결정 (표/차트는 전폭, 나머지는 3컬럼)
  for (const item of remainder) {
    const isWide = item.role === 'data_table' || item.role === 'visual'
    const rowSpan = getRowSpan(item, blockMap, 3)
    if (isWide) {
      cells.push(makeCell(item.blockId, [1, 13], [currentRow, currentRow + rowSpan], item.role))
      currentRow += rowSpan
    }
  }
  // 남은 비wide 블록 — 3컬럼
  const narrowRemainder = remainder.filter(a => a.role !== 'data_table' && a.role !== 'visual')
  for (let i = 0; i < narrowRemainder.length; i++) {
    const colIdx = i % 3
    if (colIdx === 0 && i > 0) currentRow += getRowSpan(narrowRemainder[i - 1], blockMap, 2)
    const col: [number, number] = [1 + colIdx * 4, 1 + colIdx * 4 + 4]
    const rowSpan = getRowSpan(narrowRemainder[i], blockMap, 2)
    cells.push(makeCell(narrowRemainder[i].blockId, col, [currentRow, currentRow + rowSpan]))
  }

  return cells
}

// 신문형 배치
// 헤드라인(전체) → 서브(전체) → 본문 3컬럼 분할 (표/차트는 전폭 우선)
// Python으로 치면: def place_newspaper(analyses, block_map): ...
function placeNewspaper(analyses: BlockAnalysis[], blockMap: Map<string, Block>): LayoutCell[] {
  const cells: LayoutCell[] = []
  let currentRow = 1

  const headline  = analyses.find(a => a.role === 'headline')
  const subhead   = analyses.find(a => a.role === 'subheadline')
  const heroImage = analyses.find(a => a.role === 'hero_image')
  const pullQuote = analyses.find(a => a.role === 'pull_quote')
  const rest = analyses.filter(a =>
    a !== headline && a !== subhead && a !== heroImage && a !== pullQuote
  )

  if (headline) {
    cells.push(makeCell(headline.blockId, [1, 13], [currentRow, currentRow + 1], 'headline'))
    currentRow += 1
  }
  if (subhead) {
    cells.push(makeCell(subhead.blockId, [1, 13], [currentRow, currentRow + 1], 'subheadline'))
    currentRow += 1
  }
  if (heroImage) {
    const imgSpan = getRowSpan(heroImage, blockMap, 3)
    cells.push(makeCell(heroImage.blockId, [1, 13], [currentRow, currentRow + imgSpan], 'hero_image'))
    currentRow += imgSpan
  }
  if (pullQuote) {
    cells.push(makeCell(pullQuote.blockId, [3, 11], [currentRow, currentRow + 1], 'pull_quote'))
    currentRow += 1
  }

  // 나머지 — 표/차트는 전폭, 일반 블록은 3컬럼
  let colIdx = 0
  let rowHeightInGroup = 0  // 현재 3컬럼 행에서 가장 큰 span
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i]
    const isWide = item.role === 'data_table' || item.role === 'visual'
    const rowSpan = getRowSpan(item, blockMap, 3)

    if (isWide) {
      // 진행 중인 3컬럼 그룹 마무리
      if (colIdx > 0) {
        currentRow += rowHeightInGroup
        colIdx = 0
        rowHeightInGroup = 0
      }
      cells.push(makeCell(item.blockId, [1, 13], [currentRow, currentRow + rowSpan], item.role))
      currentRow += rowSpan
    } else {
      if (colIdx === 3) {
        currentRow += rowHeightInGroup
        colIdx = 0
        rowHeightInGroup = 0
      }
      const col: [number, number] = [1 + colIdx * 4, 1 + colIdx * 4 + 4]
      cells.push(makeCell(item.blockId, col, [currentRow, currentRow + rowSpan], item.role))
      rowHeightInGroup = Math.max(rowHeightInGroup, rowSpan)
      colIdx++
    }
  }

  return cells
}

// 갤러리형 배치 — 이미지 중심
// Python으로 치면: def place_gallery(analyses, block_map): ...
function placeGallery(analyses: BlockAnalysis[], blockMap: Map<string, Block>): LayoutCell[] {
  const cells: LayoutCell[] = []
  let currentRow = 1

  const headline = analyses.find(a => a.role === 'headline')
  if (headline) {
    cells.push(makeCell(headline.blockId, [1, 13], [currentRow, currentRow + 1], 'headline'))
    currentRow += 1
  }

  const images = analyses.filter(a => a.role === 'hero_image')
  const tables = analyses.filter(a => a.role === 'data_table' || a.role === 'visual')
  const texts  = analyses.filter(a =>
    a.role !== 'hero_image' && a.role !== 'headline' &&
    a.role !== 'data_table' && a.role !== 'visual'
  )

  // 이미지 — 2컬럼 그리드 (6칸씩), 높이는 estimateRowSpan
  let imgRowHeight = 0
  for (let i = 0; i < images.length; i++) {
    const colIdx = i % 2
    const rowSpan = getRowSpan(images[i], blockMap, 5)
    if (colIdx === 0 && i > 0) {
      currentRow += imgRowHeight
      imgRowHeight = 0
    }
    const col: [number, number] = colIdx === 0 ? [1, 7] : [7, 13]
    cells.push(makeCell(images[i].blockId, col, [currentRow, currentRow + rowSpan], 'hero_image'))
    imgRowHeight = Math.max(imgRowHeight, rowSpan)
  }
  if (images.length > 0) currentRow += imgRowHeight

  // 표/차트 — 전폭
  for (const item of tables) {
    const rowSpan = getRowSpan(item, blockMap, 8)
    cells.push(makeCell(item.blockId, [1, 13], [currentRow, currentRow + rowSpan], item.role))
    currentRow += rowSpan
  }

  // 나머지 텍스트 — 하단에 3컬럼
  let textRowHeight = 0
  for (let i = 0; i < texts.length; i++) {
    const colIdx = i % 3
    const rowSpan = getRowSpan(texts[i], blockMap, 2)
    if (colIdx === 0 && i > 0) {
      currentRow += textRowHeight
      textRowHeight = 0
    }
    const col: [number, number] = [1 + colIdx * 4, 1 + colIdx * 4 + 4]
    cells.push(makeCell(texts[i].blockId, col, [currentRow, currentRow + rowSpan], texts[i].role))
    textRowHeight = Math.max(textRowHeight, rowSpan)
  }

  return cells
}

// 리포트형 배치 — 표/차트 중심
// 표/차트는 좌 9컬럼, 사이드 텍스트는 우 4컬럼 — 행 높이는 표의 실제 크기 기반
// Python으로 치면: def place_report(analyses, block_map): ...
function placeReport(analyses: BlockAnalysis[], blockMap: Map<string, Block>): LayoutCell[] {
  const cells: LayoutCell[] = []
  let currentRow = 1

  const headline = analyses.find(a => a.role === 'headline')
  const subhead  = analyses.find(a => a.role === 'subheadline')
  const dataBlocks = analyses.filter(a => a.role === 'data_table' || a.role === 'visual')
  const textBlocks = analyses.filter(a =>
    a !== headline && a !== subhead && !dataBlocks.includes(a)
  )

  if (headline) {
    cells.push(makeCell(headline.blockId, [1, 13], [currentRow, currentRow + 1], 'headline'))
    currentRow += 1
  }
  if (subhead) {
    cells.push(makeCell(subhead.blockId, [1, 13], [currentRow, currentRow + 1], 'subheadline'))
    currentRow += 1
  }

  // 데이터 블록 (표/차트) — 좌 9컬럼, 사이드 텍스트 우 4컬럼
  // row span은 데이터 블록의 실제 크기 추정값 사용
  for (let i = 0; i < dataBlocks.length; i++) {
    const sideText = textBlocks[i]
    const dataSpan = getRowSpan(dataBlocks[i], blockMap, 6)
    cells.push(makeCell(dataBlocks[i].blockId, [1, 9], [currentRow, currentRow + dataSpan], dataBlocks[i].role))
    if (sideText) {
      const sideSpan = Math.min(getRowSpan(sideText, blockMap, 3), dataSpan)
      cells.push(makeCell(sideText.blockId, [9, 13], [currentRow, currentRow + sideSpan], sideText.role))
    }
    currentRow += dataSpan
  }

  // 나머지 텍스트
  const extraTexts = textBlocks.slice(dataBlocks.length)
  for (let i = 0; i < extraTexts.length; i += 2) {
    const span0 = getRowSpan(extraTexts[i], blockMap, 2)
    if (extraTexts[i + 1]) {
      const span1 = getRowSpan(extraTexts[i + 1], blockMap, 2)
      const rowSpan = Math.max(span0, span1)
      cells.push(makeCell(extraTexts[i].blockId, [1, 7], [currentRow, currentRow + rowSpan], extraTexts[i].role))
      cells.push(makeCell(extraTexts[i + 1].blockId, [7, 13], [currentRow, currentRow + rowSpan], extraTexts[i + 1].role))
      currentRow += rowSpan
    } else {
      cells.push(makeCell(extraTexts[i].blockId, [1, 13], [currentRow, currentRow + span0], extraTexts[i].role))
      currentRow += span0
    }
  }

  return cells
}

// 카드형 배치 — 짧은 블록들을 균등하게 (표/차트는 전폭)
// Python으로 치면: def place_cards(analyses, block_map): ...
function placeCards(analyses: BlockAnalysis[], blockMap: Map<string, Block>): LayoutCell[] {
  const cells: LayoutCell[] = []
  let currentRow = 1

  const headline = analyses.find(a => a.role === 'headline')
  if (headline) {
    cells.push(makeCell(headline.blockId, [1, 13], [currentRow, currentRow + 1], 'headline'))
    currentRow += 1
  }

  const rest = analyses.filter(a => a !== headline)

  // 표/차트 → 전폭, 일반 → 3컬럼 카드
  let colIdx = 0
  let rowHeightInGroup = 0
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i]
    const isWide = item.role === 'data_table' || item.role === 'visual'
    const rowSpan = getRowSpan(item, blockMap, 3)

    if (isWide) {
      if (colIdx > 0) {
        currentRow += rowHeightInGroup
        colIdx = 0
        rowHeightInGroup = 0
      }
      cells.push(makeCell(item.blockId, [1, 13], [currentRow, currentRow + rowSpan], item.role))
      currentRow += rowSpan
    } else {
      if (colIdx === 3) {
        currentRow += rowHeightInGroup
        colIdx = 0
        rowHeightInGroup = 0
      }
      const col: [number, number] = [1 + colIdx * 4, 1 + colIdx * 4 + 4]
      cells.push(makeCell(item.blockId, col, [currentRow, currentRow + rowSpan], item.role))
      rowHeightInGroup = Math.max(rowHeightInGroup, rowSpan)
      colIdx++
    }
  }

  return cells
}

// -----------------------------------------------
// 공개 API — 블록 배열 → LayoutDescriptor 자동 생성
// Python으로 치면: def auto_layout(page_id, blocks, template_id=None, existing=None): ...
// -----------------------------------------------
export function autoLayout(
  pageId: string,
  blocks: Block[],
  templateId?: TemplateId,
  existingDescriptor?: LayoutDescriptor,
): LayoutDescriptor {
  const analyses = analyzeBlocks(blocks)
  const profile = profileContent(analyses)
  const selectedTemplate = templateId ?? pickTemplate(profile)
  return buildLayout(pageId, blocks, analyses, selectedTemplate, existingDescriptor)
}
