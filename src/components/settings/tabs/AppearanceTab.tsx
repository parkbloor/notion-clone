// =============================================
// src/components/settings/tabs/AppearanceTab.tsx
// 역할: 모양 설정 탭 — 테마(라이트/다크/시스템) 선택
// Python으로 치면: class AppearanceSettings(SettingsTab): def render_theme_picker(): ...
// =============================================

'use client'

import { useSettingsStore, applyTheme } from '@/store/settingsStore'

// -----------------------------------------------
// 테마 옵션 목록
// Python으로 치면: THEME_OPTIONS = [('light', '라이트', '☀️'), ...]
// -----------------------------------------------
const THEME_OPTIONS = [
  { value: 'light', label: '라이트', icon: '☀️', desc: '밝은 배경' },
  { value: 'dark',  label: '다크',   icon: '🌙', desc: '어두운 배경' },
  { value: 'auto',  label: '시스템', icon: '💻', desc: '운영체제 설정 따름' },
] as const

export default function AppearanceTab() {
  const { theme, setTheme } = useSettingsStore()

  // 테마 선택 핸들러
  // Python으로 치면: def on_select_theme(self, t): self.settings.set_theme(t); apply_theme(t)
  function handleThemeSelect(t: 'light' | 'dark' | 'auto') {
    setTheme(t)
    applyTheme(t)
  }

  return (
    <div className="p-6 space-y-8">
      {/* 테마 섹션 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">테마</h3>
        <p className="text-xs text-gray-400 mb-4">앱 전체의 색상 모드를 선택합니다</p>

        {/* 테마 선택 카드 버튼 3개 */}
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

      {/* 현재 적용 중 안내 */}
      <section className="rounded-lg bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">
          현재 테마: <span className="font-medium text-gray-700">
            {THEME_OPTIONS.find(o => o.value === theme)?.label}
          </span>
          {theme === 'auto' && ' (시스템 설정에 따라 자동 전환)'}
        </p>
      </section>
    </div>
  )
}
