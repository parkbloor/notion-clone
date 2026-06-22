// =============================================
// src/lib/magazineLayout.ts
// 역할: 블록 배열을 의미 단위 섹션으로 그룹핑 + 존 할당
// 높이 제어 없음 — 콘텐츠가 스스로 높이 결정 (존 기반 레이아웃)
// Python으로 치면: def group_into_sections(blocks): list[MagazineSection]
// =============================================

import { Block, BlockType } from '@/types/block'

// -----------------------------------------------
// 섹션 타입 — H1/H2 기준으로 나뉜 콘텐츠 묶음
// Python으로 치면: @dataclass class MagazineSection: ...
// -----------------------------------------------
export interface MagazineSection {
  id: string
  headingBlock: Block | null        // 섹션을 시작하는 H1/H2 (없으면 null)
  featureBlocks: Block[]            // 이미지·표·차트 — 한쪽에 크게 배치
  bodyBlocks: Block[]               // 본문 텍스트 — 열 안에 자연스럽게 흐름
  accentBlocks: Block[]             // 콜아웃·인용 — 강조 박스
  featurePosition: 'left' | 'right' // 피처 위치 (섹션마다 교대 → 시각적 리듬)
}

// -----------------------------------------------
// 피처 블록 타입 — 이미지·표·차트·다이어그램 등 시각 자료
// 이 타입들은 항상 충분한 폭이 보장되는 피처 존에 배치
// Python으로 치면: FEATURE_TYPES = frozenset({'image', 'table', ...})
// -----------------------------------------------
const FEATURE_TYPES = new Set<BlockType>([
  'image', 'table', 'chart', 'gantt', 'mermaid',
  'mindmap', 'excalidraw', 'canvas', 'video', 'embed',
  'kanban', 'dayplanner', 'weekplanner', 'weeklyplanner', 'routinematrix',
  'monthlycalendar', 'quarterlyplanner', 'yearlyplanner',
])

// 섹션 구분자 — 이 타입이 나오면 새 섹션 시작
// Python으로 치면: SECTION_STARTERS = frozenset({'heading1', 'heading2'})
const SECTION_STARTERS = new Set<BlockType>(['heading1', 'heading2'])

// 강조 블록 타입 — 콜아웃·인용 등
const ACCENT_TYPES = new Set<BlockType>(['admonition'])

// -----------------------------------------------
// 블록에 실질적인 내용이 있는지 판단
// 빈 단락·구분선은 레이아웃에서 제외
// Python으로 치면: def has_content(block: Block) -> bool: ...
// -----------------------------------------------
function hasContent(block: Block): boolean {
  if (FEATURE_TYPES.has(block.type)) return true
  const text = block.content.replace(/<[^>]+>/g, '').trim()
  return text.length > 0
}

// -----------------------------------------------
// 블록 배열 → 섹션 배열로 그룹핑 (로컬 룰 기반)
// H1/H2가 나올 때마다 새 섹션 시작
// 피처 위치(left/right)는 섹션마다 자동 교대
// Python으로 치면: def group_into_sections(blocks): list[MagazineSection]
// -----------------------------------------------
export function groupIntoSections(blocks: Block[]): MagazineSection[] {
  const sections: MagazineSection[] = []
  let featureSide: 'left' | 'right' = 'right'

  // 빈 블록·구분선 제외
  const active = blocks.filter(b => b.type !== 'divider' && hasContent(b))

  // 새 섹션 생성 헬퍼 — 피처 위치 교대 포함
  // id는 헤딩 블록 ID 기반으로 결정적(deterministic) 생성 → 리렌더 시 안정적
  // Python으로 치면: def make_section(heading, index): MagazineSection
  function makeSection(heading: Block | null, sectionIndex: number): MagazineSection {
    const pos = featureSide
    featureSide = featureSide === 'left' ? 'right' : 'left'
    // 결정적 ID: 헤딩이 있으면 headingId, 없으면 index 기반
    // 같은 blocks 배열에서 항상 동일한 ID 생성 → React key 안정
    const id = heading ? `section-${heading.id}` : `section-noheading-${sectionIndex}`
    return {
      id,
      headingBlock: heading,
      featureBlocks: [],
      bodyBlocks: [],
      accentBlocks: [],
      featurePosition: pos,
    }
  }

  let current: MagazineSection | null = null
  let sectionCount = 0

  for (const block of active) {
    if (SECTION_STARTERS.has(block.type)) {
      // 헤딩 → 현재 섹션 저장하고 새 섹션 시작
      if (current) sections.push(current)
      current = makeSection(block, sectionCount++)
    } else {
      // 섹션이 없으면 헤딩 없는 섹션으로 시작
      if (!current) current = makeSection(null, sectionCount++)

      if (FEATURE_TYPES.has(block.type)) {
        current.featureBlocks.push(block)
      } else if (ACCENT_TYPES.has(block.type)) {
        current.accentBlocks.push(block)
      } else {
        current.bodyBlocks.push(block)
      }
    }
  }

  if (current) sections.push(current)
  return sections
}

// -----------------------------------------------
// Claude API 응답 타입
// Python으로 치면: @dataclass class AILayoutPlan: ...
// -----------------------------------------------
export interface AILayoutPlan {
  sections: Array<{
    headingBlockId: string | null
    featureBlockIds: string[]
    featurePosition: 'left' | 'right'
    bodyBlockIds: string[]
    accentBlockIds: string[]
  }>
}

// -----------------------------------------------
// Claude API 레이아웃 계획을 MagazineSection[] 으로 변환
// Python으로 치면: def apply_ai_layout(plan, all_blocks): list[MagazineSection]
// -----------------------------------------------
export function applyAILayout(
  aiPlan: AILayoutPlan,
  allBlocks: Block[],
): MagazineSection[] {
  const blockMap = new Map(allBlocks.map(b => [b.id, b]))

  // AI가 언급하지 않은 블록 추적 — 마지막 섹션에 fallback 배치
  const usedIds = new Set<string>()

  const sections: MagazineSection[] = aiPlan.sections.map((s, i) => {
    const resolve = (id: string) => {
      usedIds.add(id)
      return blockMap.get(id) ?? null
    }

    // 결정적 ID: 헤딩 블록 ID 기반 또는 인덱스 기반
    const headingId = s.headingBlockId ?? null
    return {
      id: headingId ? `section-${headingId}` : `section-ai-${i}`,
      headingBlock: s.headingBlockId ? resolve(s.headingBlockId) : null,
      featureBlocks: s.featureBlockIds.map(resolve).filter(Boolean) as Block[],
      bodyBlocks: s.bodyBlockIds.map(resolve).filter(Boolean) as Block[],
      accentBlocks: s.accentBlockIds.map(resolve).filter(Boolean) as Block[],
      featurePosition: s.featurePosition,
    }
  })

  // AI가 누락한 블록은 마지막 섹션 body에 추가
  const missed = allBlocks.filter(b => !usedIds.has(b.id) && hasContent(b) && b.type !== 'divider')
  if (missed.length > 0 && sections.length > 0) {
    sections[sections.length - 1].bodyBlocks.push(...missed)
  } else if (missed.length > 0) {
    sections.push({
      id: crypto.randomUUID(),
      headingBlock: null,
      featureBlocks: [],
      bodyBlocks: missed,
      accentBlocks: [],
      featurePosition: 'right',
    })
  }

  return sections
}
