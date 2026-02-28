// =============================================
// src/components/settings/tabs/AppearanceTab.tsx
// 역할: 모양 설정 탭 — 밝기 모드(라이트/다크/시스템) + 색상 테마 프리셋 선택
// Python으로 치면: class AppearanceSettings(SettingsTab): def render_theme_picker(): ...
// =============================================

'use client'

import { useSettingsStore, applyTheme, applyThemePreset } from '@/store/settingsStore'

// -----------------------------------------------
// 밝기 모드 옵션 목록
// Python으로 치면: THEME_OPTIONS = [('light', '라이트', '☀️'), ...]
// -----------------------------------------------
const THEME_OPTIONS = [
  { value: 'light', label: '라이트', icon: '☀️', desc: '밝은 배경' },
  { value: 'dark',  label: '다크',   icon: '🌙', desc: '어두운 배경' },
  { value: 'auto',  label: '시스템', icon: '💻', desc: '운영체제 설정 따름' },
] as const

// -----------------------------------------------
// 색상 테마 프리셋 목록
// swatches[0] = 사이드바 bg, swatches[1] = 에디터 bg, swatches[2] = 텍스트 색
// Python으로 치면: THEME_PRESETS = [{'id': 'default', 'label': '기본', ...}, ...]
// -----------------------------------------------
const THEME_PRESETS = [
  {
    id: 'default',
    label: '기본',
    desc: '클래식 화이트',
    swatches:     ['#f9fafb', '#ffffff', '#111827'] as const,
    darkSwatches: ['#252525', '#1e1e1e', '#f3f4f6'] as const,
  },
  {
    id: 'notion',
    label: '노션',
    desc: '따뜻한 크림 베이지',
    swatches:     ['#f9f8f3', '#fffef9', '#37352f'] as const,
    darkSwatches: ['#1f1f1f', '#191919', '#e6e5e0'] as const,
  },
  {
    id: 'sepia',
    label: '세피아',
    desc: '따뜻한 종이 질감',
    swatches:     ['#ede7d8', '#f5f0e8', '#3c2f1e'] as const,
    darkSwatches: ['#2e2012', '#261a0f', '#e8d5b0'] as const,
  },
  {
    id: 'minimal',
    label: '미니멀',
    desc: '순백/순흑 깔끔함',
    swatches:     ['#fafafa', '#ffffff', '#0a0a0a'] as const,
    darkSwatches: ['#141414', '#0a0a0a', '#f5f5f5'] as const,
  },
  {
    id: 'forest',
    label: '포레스트',
    desc: '자연 초록 포레스트',
    swatches:     ['#e3ede3', '#f0f5f0', '#1a3a1a'] as const,
    darkSwatches: ['#162016', '#0f1f0f', '#c0e8c0'] as const,
  },
] as const

export default function AppearanceTab() {
  const { theme, setTheme, themePreset, setThemePreset } = useSettingsStore()

  // 밝기 모드 선택 핸들러
  // Python으로 치면: def on_select_theme(self, t): self.settings.set_theme(t); apply_theme(t)
  function handleThemeSelect(t: 'light' | 'dark' | 'auto') {
    setTheme(t)
    applyTheme(t)
  }

  // 색상 프리셋 선택 핸들러
  // Python으로 치면: def on_select_preset(self, p): self.settings.set_preset(p); apply_preset(p)
  function handlePresetSelect(preset: string) {
    setThemePreset(preset)
    applyThemePreset(preset)
  }

  // 현재 다크 모드 여부 (스와치 색상 선택에 사용)
  // Python으로 치면: is_dark = theme == 'dark' or (theme == 'auto' and system.is_dark)
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="p-6 space-y-8">

      {/* ── 밝기 모드 섹션 ──────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">밝기 모드</h3>
        <p className="text-xs text-gray-400 mb-4">앱 전체의 밝기 수준을 선택합니다</p>

        {/* 밝기 모드 선택 카드 버튼 3개 */}
        {/* Python으로 치면: for opt in THEME_OPTIONS: render_card(opt, selected=(opt == theme)) */}
        <div className="flex gap-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleThemeSelect(opt.value)}
              className={opt.value === theme
                ? "flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 border-blue-500 bg-blue-50 text-blue-700 transition-colors"
                : "flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              }
            >
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs text-gray-400">{opt.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 색상 테마 프리셋 섹션 ────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">색상 테마</h3>
        <p className="text-xs text-gray-400 mb-4">앱 전체의 색감을 선택합니다 · 밝기 모드와 함께 적용됩니다</p>

        {/* 프리셋 카드 그리드 (5열) */}
        {/* Python으로 치면: for preset in THEME_PRESETS: render_preset_card(preset) */}
        <div className="grid grid-cols-5 gap-2">
          {THEME_PRESETS.map((preset) => {
            const isSelected = themePreset === preset.id
            // 현재 밝기에 맞는 스와치 색상 선택
            const sw = isDark ? preset.darkSwatches : preset.swatches

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id)}
                className={isSelected
                  ? "flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 border-blue-500 bg-blue-50 transition-colors"
                  : "flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 transition-colors"
                }
              >
                {/* 색상 스와치 미리보기 — 사이드바 + 에디터(텍스트 점 포함) */}
                {/* Python으로 치면: preview = ColorSwatch(sidebar, editor, text_dots) */}
                <div className="flex gap-0.5 w-full h-6 rounded overflow-hidden">
                  {/* 사이드바 색 */}
                  <div className="w-5 h-full shrink-0 rounded-l-sm" style={{ backgroundColor: sw[0] }} />
                  {/* 에디터 색 + 텍스트 점 3개 */}
                  <div
                    className="flex-1 h-full rounded-r-sm flex items-center justify-center"
                    style={{ backgroundColor: sw[1] }}
                  >
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1 rounded-full opacity-60" style={{ backgroundColor: sw[2] }} />
                      <div className="w-1 h-1 rounded-full opacity-40" style={{ backgroundColor: sw[2] }} />
                      <div className="w-1 h-1 rounded-full opacity-20" style={{ backgroundColor: sw[2] }} />
                    </div>
                  </div>
                </div>

                {/* 프리셋 이름 */}
                <span className={isSelected ? "text-xs font-semibold text-blue-700" : "text-xs font-medium text-gray-600"}>
                  {preset.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* 선택된 프리셋 설명 한 줄 */}
        {(() => {
          const cur = THEME_PRESETS.find(p => p.id === themePreset)
          return cur ? (
            <p className="text-xs text-gray-400 mt-2 pl-0.5">{cur.label} — {cur.desc}</p>
          ) : null
        })()}
      </section>

      {/* ── 현재 적용 중 안내 ───────────────────── */}
      <section className="rounded-lg bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">
          밝기: <span className="font-medium text-gray-700">
            {THEME_OPTIONS.find(o => o.value === theme)?.label}
          </span>
          {theme === 'auto' && ' (시스템 설정에 따라 자동 전환)'}
          {' · '}
          색상 테마: <span className="font-medium text-gray-700">
            {THEME_PRESETS.find(p => p.id === themePreset)?.label ?? '기본'}
          </span>
        </p>
      </section>

    </div>
  )
}
