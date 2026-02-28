// =============================================
// src/components/settings/tabs/EditorTab.tsx
// 역할: 편집기 설정 탭 — 글꼴, 크기, 줄간격
// FONT_PRESETS 기반으로 전체 폰트 목록 표시
// Python으로 치면: class EditorSettings(SettingsTab): def render_font_picker(): ...
// =============================================

'use client'

import { useSettingsStore, applyEditorStyle } from '@/store/settingsStore'
import { FONT_PRESETS, CATEGORY_LABELS, getFontPreset, type FontCategory } from '@/lib/fonts'

// -----------------------------------------------
// 에디터 전체 기본 크기 옵션 (px)
// 버블메뉴의 인라인 크기(8종)와는 별개 — 에디터 기본값만
// Python으로 치면: SIZE_OPTIONS: list[int] = [14, 16, 18, 20]
// -----------------------------------------------
const SIZE_OPTIONS: number[] = [14, 16, 18, 20]

// 카테고리 표시 순서
const CATEGORY_ORDER: FontCategory[] = ['sans', 'korean', 'serif', 'mono']

export default function EditorTab() {
  const { fontFamily, fontSize, lineHeight, setFontFamily, setFontSize, setLineHeight } = useSettingsStore()

  // -----------------------------------------------
  // 편집기 스타일 즉시 반영 헬퍼
  // setXxx: zustand 상태 갱신 (localStorage 저장)
  // applyEditorStyle: :root CSS 변수 즉시 주입 (화면 즉시 반영)
  // Python으로 치면: def update_and_apply(self, **kwargs): self.update(**kwargs); apply_style()
  // -----------------------------------------------
  function changeFont(fontId: string) {
    setFontFamily(fontId)
    applyEditorStyle(fontId, fontSize, lineHeight)
  }

  function changeSize(size: number) {
    setFontSize(size)
    applyEditorStyle(fontFamily, size, lineHeight)
  }

  function changeLH(lh: number) {
    const rounded = Math.round(lh * 10) / 10
    setLineHeight(rounded)
    applyEditorStyle(fontFamily, fontSize, rounded)
  }

  // 현재 선택된 폰트 프리셋 (미리보기에 사용)
  // Python으로 치면: current_preset = get_preset(self.font_family)
  const currentPreset = getFontPreset(fontFamily)

  // 카테고리별 폰트 그룹화
  // Python으로 치면: groups = {cat: [p for p in PRESETS if p.category == cat] for cat in CATEGORIES}
  const fontGroups = FONT_PRESETS.reduce<Partial<Record<FontCategory, typeof FONT_PRESETS>>>((acc, preset) => {
    if (!acc[preset.category]) acc[preset.category] = []
    acc[preset.category]!.push(preset)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-8">

      {/* ── 글꼴 패밀리 ───────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">글꼴</h3>
        <p className="text-xs text-gray-400 mb-4">에디터 본문 전체에 적용할 기본 글꼴 (특정 텍스트만 바꾸려면 드래그 후 버블메뉴 사용)</p>

        {/* 카테고리별 폰트 그리드 */}
        {CATEGORY_ORDER.map((category) => {
          const presets = fontGroups[category]
          if (!presets || presets.length === 0) return null

          return (
            <div key={category} className="mb-4">
              {/* 카테고리 구분선 레이블 */}
              <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
                {CATEGORY_LABELS[category]}
              </p>

              {/* 폰트 카드 그리드 */}
              {/* Python으로 치면: for preset in presets: render_font_card(preset) */}
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => {
                  const isSelected = fontFamily === preset.id

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => changeFont(preset.id)}
                      className={isSelected
                        ? "flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border-2 border-blue-500 bg-blue-50 transition-colors"
                        : "flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      }
                    >
                      {/* 폰트로 미리보기 텍스트 렌더링 */}
                      <span
                        className="text-base text-gray-800"
                        style={{ fontFamily: preset.family }}
                      >
                        {preset.category === 'korean' ? '가나다 Abc' : 'Abc 123'}
                      </span>
                      {/* 폰트 이름 */}
                      <span className="text-xs font-medium text-gray-600">{preset.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* ── 글꼴 크기 ─────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">글꼴 크기</h3>
        <p className="text-xs text-gray-400 mb-4">에디터 본문 기본 텍스트 크기 (px)</p>
        <div className="flex gap-2">
          {SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => changeSize(size)}
              className={size === fontSize
                ? "w-16 py-2 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 text-sm font-semibold transition-colors"
                : "w-16 py-2 rounded-lg border-2 border-gray-200 bg-white text-gray-600 text-sm font-medium hover:border-gray-300 transition-colors"
              }
            >
              {size}px
            </button>
          ))}
        </div>
      </section>

      {/* ── 줄 간격 ───────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          줄 간격
          <span className="ml-2 text-blue-600 font-bold">{lineHeight.toFixed(1)}</span>
        </h3>
        <p className="text-xs text-gray-400 mb-4">텍스트 줄 사이의 간격 (1.4 ~ 2.0)</p>
        <input
          type="range"
          min="1.4"
          max="2.0"
          step="0.1"
          value={lineHeight}
          onChange={(e) => changeLH(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1.4 좁게</span>
          <span>2.0 넓게</span>
        </div>
      </section>

      {/* ── 미리보기 ─────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">미리보기</h3>
        <div
          className="border border-gray-200 rounded-xl p-4 bg-gray-50 text-gray-800"
          style={{
            fontFamily: currentPreset.family,
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
          }}
        >
          <p className="text-lg font-bold mb-2">페이지 제목 예시</p>
          <p>이것은 에디터 본문 텍스트 미리보기입니다. 선택한 글꼴과 크기, 줄 간격이 여기에 반영됩니다. The quick brown fox jumps over the lazy dog.</p>
        </div>
      </section>
    </div>
  )
}
