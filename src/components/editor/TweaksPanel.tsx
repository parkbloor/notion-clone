// =============================================
// src/components/editor/TweaksPanel.tsx
// 역할: 우상단 ⚙ 버튼 클릭 시 열리는 빠른 설정 플로팅 패널
// 테마·강조색·배경 톤·글꼴·글자 크기·줄 간격 즉시 조정
// Python으로 치면: class TweaksPanel(FloatingWidget): settings = settingsStore
// =============================================

'use client'

import { useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useSettingsStore, applyEditorStyle } from '@/store/settingsStore'
import { FONT_PRESETS } from '@/lib/fonts'

// -----------------------------------------------
// 강조색 프리셋 (AppearanceTab과 동일)
// Python으로 치면: ACCENT_COLORS: list[dict] = [...]
// -----------------------------------------------
const ACCENT_COLORS = [
  { hex: '#5B7F5A', label: 'Moss' },
  { hex: '#4A7FA5', label: 'Ocean' },
  { hex: '#8B5CF6', label: 'Violet' },
  { hex: '#B8643A', label: 'Amber' },
  { hex: '#C2525A', label: 'Rose' },
] as const

// -----------------------------------------------
// 컬러 테마 프리셋 (AppearanceTab과 동일)
// Python으로 치면: THEME_PRESETS = [{'id': 'default', 'label': '기본'}, ...]
// -----------------------------------------------
const THEME_PRESETS = [
  { id: 'default',   label: '기본',    swatch: '#f8f9fa' },
  { id: 'notion',    label: 'Notion',  swatch: '#fffef9' },
  { id: 'sepia',     label: 'Sepia',   swatch: '#f5f0e8' },
  { id: 'minimal',   label: 'Minimal', swatch: '#ffffff' },
  { id: 'forest',    label: 'Forest',  swatch: '#f0f5f0' },
] as const

// Tweaks 패널에서 노출할 글꼴 (3종 요약)
// Python으로 치면: QUICK_FONTS = [f for f in FONT_PRESETS if f.id in {...}]
const QUICK_FONTS = FONT_PRESETS.filter(f => ['noto-sans', 'noto-serif', 'mono'].includes(f.id))

interface TweaksPanelProps {
  onClose: () => void
}

// -----------------------------------------------
// TweaksPanel: 빠른 외관 설정 플로팅 패널
// Python으로 치면: class TweaksPanel(tk.Toplevel): ...
// -----------------------------------------------
export default function TweaksPanel({ onClose }: TweaksPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    theme, setTheme,
    themePreset, setThemePreset,
    accentColor, setAccentColor,
    bgTone, setBgTone,
    fontFamily, setFontFamily,
    fontSize, setFontSize,
    lineHeight, setLineHeight,
  } = useSettingsStore()

  // 패널 외부 클릭 시 닫기
  // Python으로 치면: root.bind('<Button-1>', lambda e: close_if_outside(e))
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // 글꼴 변경 시 CSS 변수도 즉시 적용
  // Python으로 치면: def on_font_change(font_id): set_font(font_id); apply_css()
  function handleFontChange(fontId: string) {
    setFontFamily(fontId)
    applyEditorStyle(fontId, fontSize, lineHeight, useSettingsStore.getState().editorMaxWidth)
  }

  function handleSizeChange(size: number) {
    setFontSize(size)
    applyEditorStyle(fontFamily, size, lineHeight, useSettingsStore.getState().editorMaxWidth)
  }

  function handleLineHeightChange(lh: number) {
    setLineHeight(lh)
    applyEditorStyle(fontFamily, fontSize, lh, useSettingsStore.getState().editorMaxWidth)
  }

  return (
    // 패널 컨테이너 — 우상단 버튼 기준 absolute 위치는 부모에서 결정
    // Python으로 치면: panel = tk.Frame(root, relief='raised')
    <div
      ref={panelRef}
      className="absolute right-0 top-9 z-50 w-72 rounded-xl border shadow-xl print-hide"
      style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>⚙ Tweaks</span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-gray-100 transition-colors"
          style={{ color: "var(--color-text-muted)" }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 flex flex-col gap-4" style={{ maxHeight: '80vh', overflowY: 'auto' }}>

        {/* ── 1. 테마 (라이트/다크/자동) ── */}
        {/* Python으로 치면: render_3way_toggle('theme', ['light','dark','auto']) */}
        <section>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>테마</p>
          <div className="flex gap-1.5">
            {([
              { value: 'light', icon: '☀️', label: '라이트' },
              { value: 'dark',  icon: '🌙', label: '다크' },
              { value: 'auto',  icon: '💻', label: '자동' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs font-medium transition-colors"
                style={theme === opt.value
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent)" }
                  : { borderColor: "var(--color-border)", background: "transparent", color: "var(--color-text-muted)" }}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 2. 컬러 테마 ── */}
        {/* Python으로 치면: render_swatch_grid(THEME_PRESETS, selected=theme_preset) */}
        <section>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>컬러 테마</p>
          <div className="flex gap-1.5">
            {THEME_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setThemePreset(p.id)}
                title={p.label}
                className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg border text-xs transition-colors"
                style={themePreset === p.id
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent)" }
                  : { borderColor: "var(--color-border)", background: "transparent", color: "var(--color-text-muted)" }}
              >
                <span
                  className="w-5 h-5 rounded-full border"
                  style={{ background: p.swatch, borderColor: "var(--color-border)" }}
                />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 3. 강조색 ── */}
        {/* Python으로 치면: render_color_dots(ACCENT_COLORS, selected=accent_color) */}
        <section>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>강조색</p>
          <div className="flex items-center gap-2">
            {ACCENT_COLORS.map(c => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setAccentColor(c.hex)}
                title={c.label}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c.hex,
                  outline: accentColor === c.hex ? `3px solid ${c.hex}` : '3px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            ))}
            {/* 커스텀 hex 색상 선택기 */}
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              title="커스텀 색상"
              className="w-7 h-7 rounded-full border cursor-pointer"
              style={{ borderColor: "var(--color-border)" }}
            />
          </div>
        </section>

        {/* ── 4. 배경 톤 ── */}
        {/* Python으로 치면: render_3way_toggle('bg_tone', ['warm','neutral','cool']) */}
        <section>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>배경 톤</p>
          <div className="flex gap-1.5">
            {([
              { value: 'warm',    label: '웜',   swatch: '#FAF7F2' },
              { value: 'neutral', label: '뉴트럴', swatch: '#F5F5F5' },
              { value: 'cool',    label: '쿨',   swatch: '#F0F4F8' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBgTone(opt.value)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                style={bgTone === opt.value
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent)" }
                  : { borderColor: "var(--color-border)", background: "transparent", color: "var(--color-text-muted)" }}
              >
                <span className="w-3 h-3 rounded-full border" style={{ background: opt.swatch, borderColor: "var(--color-border)" }} />
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── 5. 본문 글꼴 ── */}
        {/* Python으로 치면: render_font_buttons(QUICK_FONTS, selected=font_family) */}
        <section>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>본문 글꼴</p>
          <div className="flex gap-1.5">
            {QUICK_FONTS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleFontChange(f.id)}
                className="flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                style={fontFamily === f.id
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent)", fontFamily: f.family }
                  : { borderColor: "var(--color-border)", background: "transparent", color: "var(--color-text-muted)", fontFamily: f.family }}
              >
                {f.id === 'noto-sans' ? 'Sans' : f.id === 'noto-serif' ? 'Serif' : 'Mono'}
              </button>
            ))}
          </div>
        </section>

        {/* ── 6. 본문 크기 ── */}
        {/* Python으로 치면: render_slider('font_size', min=12, max=24) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>본문 크기</p>
            <span className="text-xs font-mono" style={{ color: "var(--color-text)" }}>{fontSize}px</span>
          </div>
          <input
            type="range"
            min={12} max={24} step={0.5}
            value={fontSize}
            onChange={e => handleSizeChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "var(--color-accent)" }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>12</span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>24</span>
          </div>
        </section>

        {/* ── 7. 줄 간격 ── */}
        {/* Python으로 치면: render_slider('line_height', min=1.2, max=2.0) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>줄 간격</p>
            <span className="text-xs font-mono" style={{ color: "var(--color-text)" }}>{lineHeight.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1.2} max={2.0} step={0.1}
            value={lineHeight}
            onChange={e => handleLineHeightChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "var(--color-accent)" }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>좁게</span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>넓게</span>
          </div>
        </section>

      </div>
    </div>
  )
}
