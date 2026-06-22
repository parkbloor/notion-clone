// =============================================
// src/components/settings/tabs/AppearanceTab.tsx
// 역할: 모양 설정 탭 — 밝기 모드(라이트/다크/시스템) + 색상 테마 프리셋 + 언어 선택
// Python으로 치면: class AppearanceSettings(SettingsTab): def render_theme_picker(): ...
// =============================================

'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore, applyThemePreset } from '@/store/settingsStore'
import { useLocale, LANGUAGE_OPTIONS } from '@/locales'

// 강조색 팔레트 — 5가지 사전 정의 색상
// Python으로 치면: ACCENT_COLORS = [('#5B7F5A', 'Moss'), ...]
const ACCENT_COLORS = [
  { hex: '#5B7F5A', label: 'Moss' },
  { hex: '#4A7FA5', label: 'Ocean' },
  { hex: '#8B5CF6', label: 'Violet' },
  { hex: '#B8643A', label: 'Amber' },
  { hex: '#C2525A', label: 'Rose' },
] as const

// 배경 톤 옵션
// Python으로 치면: BG_TONE_OPTIONS = [('warm', '따뜻함', '#FAF7F2'), ...]
const BG_TONE_OPTIONS = [
  { value: 'warm',    label: '따뜻함', swatch: '#FAF7F2' },
  { value: 'neutral', label: '중립',   swatch: '#F5F5F5' },
  { value: 'cool',    label: '시원함', swatch: '#F0F4F8' },
] as const

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
  const { theme, setTheme, themePreset, setThemePreset, locale, setLocale, accentColor, setAccentColor, bgTone, setBgTone } = useSettingsStore()
  // Python으로 치면: t = locale_dict[settings.locale]
  const t = useLocale()

  // 밝기 모드 선택 핸들러
  // Python으로 치면: def on_select_theme(self, t): self.settings.set_theme(t); apply_theme(t)
  function handleThemeSelect(val: 'light' | 'dark' | 'auto') {
    setTheme(val)  // setTheme 내부에서 bgTone 포함 applyTheme 호출
  }

  // 색상 프리셋 선택 핸들러
  // Python으로 치면: def on_select_preset(self, p): self.settings.set_preset(p); apply_preset(p)
  function handlePresetSelect(preset: string) {
    setThemePreset(preset)
    applyThemePreset(preset)
  }

  // 시스템 다크 모드 여부 — matchMedia 이벤트를 구독하여 실시간 반응
  // Python으로 치면: system_dark = subscribe(media_query_changed)
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 현재 다크 모드 여부 (스와치 색상 선택에 사용)
  // Python으로 치면: is_dark = theme == 'dark' or (theme == 'auto' and system_dark)
  const isDark = theme === 'dark' || (theme === 'auto' && systemDark)

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
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>{t.settings.appearance.themeMode}</h3>

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
                className="flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-colors"
              style={opt.value === theme
                ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }
                : { borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }
              }
              >
                <span className="text-2xl">{opt.icon}</span>
                <span className="text-sm font-medium">{info.label}</span>
                <span className="text-xs" style={{ color: "var(--color-text-faint)" }}>{info.desc}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 색상 테마 프리셋 섹션 ────────────────── */}
      <section>
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>{t.settings.appearance.colorTheme}</h3>

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
                className="flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-colors"
                style={isSelected
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }
                  : { borderColor: "var(--color-border)", background: "var(--color-surface)" }
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
                <span className="text-xs font-medium" style={{ color: isSelected ? "var(--color-accent-ink)" : "var(--color-text-muted)" }}>
                  {info.label}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 강조색 섹션 ─────────────────────────── */}
      {/* Python으로 치면: render_accent_color_picker(selected=accent_color) */}
      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>강조색</h3>
        <div className="flex gap-2 items-center">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={c.label}
              onClick={() => setAccentColor(c.hex)}
              className="w-8 h-8 rounded-full transition-all"
              style={{
                backgroundColor: c.hex,
                outline: accentColor === c.hex ? `3px solid ${c.hex}` : '3px solid transparent',
                outlineOffset: 2,
              }}
            />
          ))}
          {/* 커스텀 색상 입력 */}
          <label className="flex items-center gap-1.5 cursor-pointer ml-2">
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0"
              style={{ padding: 0 }}
              title="커스텀 색상"
            />
            <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{accentColor}</span>
          </label>
        </div>
      </section>

      {/* ── 배경 톤 섹션 ─────────────────────────── */}
      {/* Python으로 치면: render_bg_tone_selector(selected=bg_tone) */}
      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>배경 톤</h3>
        <div className="flex gap-2" style={{ background: "var(--color-sunken)", borderRadius: 8, padding: 3 }}>
          {BG_TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setBgTone(opt.value)}
              className="flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={bgTone === opt.value
                ? { background: "var(--color-surface)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
                : { color: "var(--color-text-muted)" }
              }
            >
              <span className="w-3 h-3 rounded-full border shrink-0"
                style={{ backgroundColor: opt.swatch, borderColor: "var(--color-border-strong)" }} />
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── 언어 선택 섹션 ───────────────────────── */}
      {/* Python으로 치면: render_language_selector(selected=locale) */}
      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>{t.settings.appearance.language}</h3>
        <div className="flex gap-2">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLocale(opt.value)}
              className="px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors"
              style={locale === opt.value
                ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }
                : { borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }
              }
            >
              {opt.nativeLabel}
            </button>
          ))}
        </div>
      </section>

      {/* ── 현재 적용 중 안내 ───────────────────── */}
      <section className="rounded-lg px-4 py-3" style={{ background: "var(--color-sunken)" }}>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          {t.settings.appearance.themeMode}: <span className="font-medium" style={{ color: "var(--color-text)" }}>
            {themeLabels[theme]?.label}
          </span>
          {' · '}
          {t.settings.appearance.colorTheme}: <span className="font-medium" style={{ color: "var(--color-text)" }}>
            {presetLabels[themePreset]?.label ?? themePreset}
          </span>
          {' · '}
          강조색: <span className="font-mono font-medium" style={{ color: "var(--color-accent)" }}>
            {accentColor}
          </span>
          {' · '}
          {t.settings.appearance.language}: <span className="font-medium" style={{ color: "var(--color-text)" }}>
            {LANGUAGE_OPTIONS.find(o => o.value === locale)?.nativeLabel}
          </span>
        </p>
      </section>

    </div>
  )
}
