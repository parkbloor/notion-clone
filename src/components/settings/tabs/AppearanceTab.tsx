// =============================================
// src/components/settings/tabs/AppearanceTab.tsx
// 역할: 모양 설정 탭 — 밝기 모드(라이트/다크/시스템) + 색상 테마 프리셋 + 언어 선택
// Python으로 치면: class AppearanceSettings(SettingsTab): def render_theme_picker(): ...
// =============================================

'use client'

import { useSettingsStore, applyTheme, applyThemePreset } from '@/store/settingsStore'
import { useLocale, LANGUAGE_OPTIONS } from '@/locales'

// -----------------------------------------------
// 밝기 모드 옵션 목록
// Python으로 치면: THEME_OPTIONS = [('light', '☀️'), ...]
// -----------------------------------------------
const THEME_OPTIONS = [
  { value: 'light', icon: '☀️' },
  { value: 'dark',  icon: '🌙' },
  { value: 'auto',  icon: '💻' },
] as const

// -----------------------------------------------
// 색상 테마 프리셋 목록
// swatches[0] = 사이드바 bg, swatches[1] = 에디터 bg, swatches[2] = 텍스트 색
// Python으로 치면: THEME_PRESETS = [{'id': 'default', ...}, ...]
// -----------------------------------------------
const THEME_PRESETS = [
  {
    id: 'default',
    swatches:     ['#f9fafb', '#ffffff', '#111827'] as const,
    darkSwatches: ['#252525', '#1e1e1e', '#f3f4f6'] as const,
  },
  {
    id: 'notion',
    swatches:     ['#f9f8f3', '#fffef9', '#37352f'] as const,
    darkSwatches: ['#1f1f1f', '#191919', '#e6e5e0'] as const,
  },
  {
    id: 'sepia',
    swatches:     ['#ede7d8', '#f5f0e8', '#3c2f1e'] as const,
    darkSwatches: ['#2e2012', '#261a0f', '#e8d5b0'] as const,
  },
  {
    id: 'minimal',
    swatches:     ['#fafafa', '#ffffff', '#0a0a0a'] as const,
    darkSwatches: ['#141414', '#0a0a0a', '#f5f5f5'] as const,
  },
  {
    id: 'forest',
    swatches:     ['#e3ede3', '#f0f5f0', '#1a3a1a'] as const,
    darkSwatches: ['#162016', '#0f1f0f', '#c0e8c0'] as const,
  },
] as const

export default function AppearanceTab() {
  const { theme, setTheme, themePreset, setThemePreset, locale, setLocale } = useSettingsStore()
  // Python으로 치면: t = locale_dict[settings.locale]
  const t = useLocale()

  // 밝기 모드 선택 핸들러
  // Python으로 치면: def on_select_theme(self, t): self.settings.set_theme(t); apply_theme(t)
  function handleThemeSelect(val: 'light' | 'dark' | 'auto') {
    setTheme(val)
    applyTheme(val)
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

  // 밝기 모드 라벨 — 로케일 적용
  const themeLabels = {
    light: { label: t.settings.appearance.light, desc: t.settings.appearance.lightDesc },
    dark:  { label: t.settings.appearance.dark,  desc: t.settings.appearance.darkDesc },
    auto:  { label: t.settings.appearance.system, desc: t.settings.appearance.systemDesc },
  }

  // 색상 테마 라벨 — 로케일 적용
  const presetLabels: Record<string, { label: string; desc: string }> = {
    default: { label: t.settings.appearance.themeDefault, desc: '' },
    notion:  { label: t.settings.appearance.themeNotion,  desc: '' },
    sepia:   { label: t.settings.appearance.themeSepia,   desc: '' },
    minimal: { label: t.settings.appearance.themeMinimal, desc: '' },
    forest:  { label: t.settings.appearance.themeForest,  desc: '' },
  }

  return (
    <div className="p-6 space-y-8">

      {/* ── 밝기 모드 섹션 ──────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.appearance.themeMode}</h3>

        {/* 밝기 모드 선택 카드 버튼 3개 */}
        {/* Python으로 치면: for opt in THEME_OPTIONS: render_card(opt, selected=(opt == theme)) */}
        <div className="flex gap-3">
          {THEME_OPTIONS.map((opt) => {
            const info = themeLabels[opt.value]
            return (
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
                <span className="text-sm font-medium">{info.label}</span>
                <span className="text-xs text-gray-400">{info.desc}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 색상 테마 프리셋 섹션 ────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.appearance.colorTheme}</h3>

        {/* 프리셋 카드 그리드 (5열) */}
        {/* Python으로 치면: for preset in THEME_PRESETS: render_preset_card(preset) */}
        <div className="grid grid-cols-5 gap-2">
          {THEME_PRESETS.map((preset) => {
            const isSelected = themePreset === preset.id
            // 현재 밝기에 맞는 스와치 색상 선택
            const sw = isDark ? preset.darkSwatches : preset.swatches
            const info = presetLabels[preset.id] ?? { label: preset.id, desc: '' }

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
                {/* 색상 스와치 미리보기 */}
                <div className="flex gap-0.5 w-full h-6 rounded overflow-hidden">
                  <div className="w-5 h-full shrink-0 rounded-l-sm" style={{ backgroundColor: sw[0] }} />
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
                  {info.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 언어 선택 섹션 ───────────────────────── */}
      {/* Python으로 치면: render_language_selector(selected=locale) */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.settings.appearance.language}</h3>
        <div className="flex gap-2">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLocale(opt.value)}
              className={locale === opt.value
                ? "px-4 py-2 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 text-sm font-medium transition-colors"
                : "px-4 py-2 rounded-lg border-2 border-gray-200 bg-white text-gray-600 text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors"
              }
            >
              {opt.nativeLabel}
            </button>
          ))}
        </div>
      </section>

      {/* ── 현재 적용 중 안내 ───────────────────── */}
      <section className="rounded-lg bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">
          {t.settings.appearance.themeMode}: <span className="font-medium text-gray-700">
            {themeLabels[theme]?.label}
          </span>
          {' · '}
          {t.settings.appearance.colorTheme}: <span className="font-medium text-gray-700">
            {presetLabels[themePreset]?.label ?? themePreset}
          </span>
          {' · '}
          {t.settings.appearance.language}: <span className="font-medium text-gray-700">
            {LANGUAGE_OPTIONS.find(o => o.value === locale)?.nativeLabel}
          </span>
        </p>
      </section>

    </div>
  )
}
