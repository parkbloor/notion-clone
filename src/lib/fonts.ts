// =============================================
// src/lib/fonts.ts
// 역할: 에디터에서 사용 가능한 폰트 프리셋 목록 정의
// 이 배열이 버블메뉴 드롭다운과 설정 스토어의 단일 진실 공급원
// Python으로 치면: FONT_PRESETS: list[dict] = [...]
// =============================================

// -----------------------------------------------
// 폰트 카테고리
// Python으로 치면: FontCategory = Literal['sans', 'korean', 'serif', 'mono']
// -----------------------------------------------
export type FontCategory = 'sans' | 'korean' | 'serif' | 'mono'

// -----------------------------------------------
// 폰트 프리셋 하나의 구조
// id: settingsStore에 저장되는 식별자
// label: UI에 표시되는 이름
// family: CSS font-family 값 (직접 style 속성에 주입)
// category: 드롭다운에서 구분선/그룹 표시용
// Python으로 치면: @dataclass class FontPreset: id, label, family, category
// -----------------------------------------------
export interface FontPreset {
  id: string
  label: string
  family: string
  category: FontCategory
}

// -----------------------------------------------
// 폰트 프리셋 목록
// 순서 = 드롭다운에 표시되는 순서
// 한국어 폰트는 globals.css에서 Google Fonts @import로 로딩
// 영문 폰트는 layout.tsx에서 next/font/google로 로딩
// 커스텀 폰트 추가: public/fonts/README.md 참고
// Python으로 치면: FONT_PRESETS = [FontPreset(...), ...]
// -----------------------------------------------
export const FONT_PRESETS: FontPreset[] = [
  // ── sans-serif ────────────────────────────────
  {
    id: 'system',
    label: '시스템 기본',
    family: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    category: 'sans',
  },
  {
    id: 'inter',
    label: 'Inter',
    family: "'Inter', sans-serif",
    category: 'sans',
  },

  // ── 한국어 ──────────────────────────────────
  {
    id: 'noto-sans',
    label: 'Noto Sans KR',
    family: "'Noto Sans KR', sans-serif",
    category: 'korean',
  },
  {
    id: 'noto-serif',
    label: 'Noto Serif KR',
    family: "'Noto Serif KR', serif",
    category: 'korean',
  },
  {
    id: 'gowun',
    label: 'Gowun Dodum',
    family: "'Gowun Dodum', sans-serif",
    category: 'korean',
  },

  // ── serif ─────────────────────────────────────
  {
    id: 'playfair',
    label: 'Playfair Display',
    family: "'Playfair Display', serif",
    category: 'serif',
  },

  // ── monospace ─────────────────────────────────
  {
    id: 'mono',
    label: 'JetBrains Mono',
    family: "'JetBrains Mono', monospace",
    category: 'mono',
  },
]

// -----------------------------------------------
// 기본 폰트 ID (settingsStore 초기값과 동일하게 맞춤)
// Python으로 치면: DEFAULT_FONT_ID = 'noto-sans'
// -----------------------------------------------
export const DEFAULT_FONT_ID = 'noto-sans'

// -----------------------------------------------
// id로 FontPreset 조회 헬퍼
// 못 찾으면 첫 번째(시스템 기본) 반환
// Python으로 치면: def get_preset(id): return next((f for f in FONT_PRESETS if f.id == id), FONT_PRESETS[0])
// -----------------------------------------------
export function getFontPreset(id: string): FontPreset {
  return FONT_PRESETS.find(f => f.id === id) ?? FONT_PRESETS[0]
}

// -----------------------------------------------
// 카테고리 레이블 (드롭다운 구분선 텍스트)
// Python으로 치면: CATEGORY_LABELS: dict[str, str] = {...}
// -----------------------------------------------
export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans:   '고딕',
  korean: '한국어',
  serif:  '명조',
  mono:   '모노스페이스',
}

// -----------------------------------------------
// 폰트 크기 프리셋 목록
// 값: px 단위 숫자, 라벨: UI 표시용
// Python으로 치면: FONT_SIZE_PRESETS: list[dict] = [...]
// -----------------------------------------------
export const FONT_SIZE_PRESETS = [
  { value: 12, label: '12px' },
  { value: 14, label: '14px' },
  { value: 16, label: '16px' },
  { value: 18, label: '18px' },
  { value: 20, label: '20px' },
  { value: 24, label: '24px' },
  { value: 28, label: '28px' },
  { value: 32, label: '32px' },
] as const

export type FontSizeValue = typeof FONT_SIZE_PRESETS[number]['value']
