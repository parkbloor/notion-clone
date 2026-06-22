// ==============================================
// src/lib/themeVars.ts
// 역할: 커스텀 테마 프리셋별 CSS 변수 상수 정의
// settingsStore.ts의 applyThemePreset()에서 사용
// Python으로 치면: constants.py — PRESET_VARS, DEFAULT_VARS 딕셔너리
// ==============================================

// ── 프리셋별 CSS 변수 ────────────────────────────
// 각 프리셋은 라이트/다크 두 벌의 CSS 변수를 가짐
// Python으로 치면: PRESET_VARS: dict[str, dict[str, dict[str, str]]] = { ... }
export const PRESET_VARS: Record<string, { light: Record<string, string>; dark: Record<string, string> }> = {
  notion: {
    light: { '--bg-primary':'#fffef9','--bg-secondary':'#f9f8f3','--bg-hover':'#f0ede6','--bg-active':'#e8e4da','--text-primary':'#37352f','--text-secondary':'#787164','--text-tertiary':'#9b9a97','--border-color':'#e8e4da','--border-subtle':'#f0ede6' },
    dark:  { '--bg-primary':'#191919','--bg-secondary':'#1f1f1f','--bg-hover':'#282828','--bg-active':'#333333','--text-primary':'#e6e5e0','--text-secondary':'#9b9a97','--text-tertiary':'#6b6b6b','--border-color':'#373737','--border-subtle':'#2b2b2b' },
  },
  sepia: {
    light: { '--bg-primary':'#f5f0e8','--bg-secondary':'#ede7d8','--bg-hover':'#e3dbc8','--bg-active':'#d6ccb4','--text-primary':'#3c2f1e','--text-secondary':'#7a6048','--text-tertiary':'#a08060','--border-color':'#d6ccb4','--border-subtle':'#e3dbc8' },
    dark:  { '--bg-primary':'#261a0f','--bg-secondary':'#2e2012','--bg-hover':'#382818','--bg-active':'#45321e','--text-primary':'#e8d5b0','--text-secondary':'#b09070','--text-tertiary':'#806040','--border-color':'#45321e','--border-subtle':'#38281a' },
  },
  minimal: {
    light: { '--bg-primary':'#ffffff','--bg-secondary':'#fafafa','--bg-hover':'#f5f5f5','--bg-active':'#eeeeee','--text-primary':'#0a0a0a','--text-secondary':'#525252','--text-tertiary':'#a3a3a3','--border-color':'#e5e5e5','--border-subtle':'#f5f5f5' },
    dark:  { '--bg-primary':'#0a0a0a','--bg-secondary':'#141414','--bg-hover':'#1f1f1f','--bg-active':'#292929','--text-primary':'#f5f5f5','--text-secondary':'#a3a3a3','--text-tertiary':'#525252','--border-color':'#292929','--border-subtle':'#1f1f1f' },
  },
  forest: {
    light: { '--bg-primary':'#f0f5f0','--bg-secondary':'#e3ede3','--bg-hover':'#d4e4d4','--bg-active':'#c2d9c2','--text-primary':'#1a3a1a','--text-secondary':'#3d6b3d','--text-tertiary':'#6b8f6b','--border-color':'#c2d9c2','--border-subtle':'#d4e4d4' },
    dark:  { '--bg-primary':'#0f1f0f','--bg-secondary':'#162016','--bg-hover':'#1e2e1e','--bg-active':'#273d27','--text-primary':'#c0e8c0','--text-secondary':'#80b880','--text-tertiary':'#508850','--border-color':'#273d27','--border-subtle':'#1e2e1e' },
  },
  // warm-moss: 새 디자인 테마 — 따뜻한 오프화이트 + 모스 그린 강조
  // Python으로 치면: WARM_MOSS_PRESET = {'light': {...}, 'dark': {...}}
  'warm-moss': {
    light: {
      '--color-bg':            '#FAF7F2',
      '--color-surface':       '#FFFDF9',
      '--color-sunken':        '#F3EFE7',
      '--color-border':        'rgba(0,0,0,0.06)',
      '--color-border-strong': 'rgba(0,0,0,0.10)',
      '--color-text':          '#1F1B16',
      '--color-text-muted':    '#6B6459',
      '--color-text-subtle':   '#9C9488',
      '--color-text-faint':    '#C8C0B2',
      '--color-accent':        '#5B7F5A',
      '--color-accent-soft':   '#EDF1EC',
      '--color-accent-ink':    '#3C5A3C',
    },
    dark: {
      '--color-bg':            '#17140F',
      '--color-surface':       '#1D1A14',
      '--color-sunken':        '#121009',
      '--color-border':        'rgba(255,255,255,0.07)',
      '--color-border-strong': 'rgba(255,255,255,0.12)',
      '--color-text':          '#EEE8DD',
      '--color-text-muted':    '#9A9182',
      '--color-text-subtle':   '#6F6759',
      '--color-text-faint':    '#4A4339',
      '--color-accent':        '#8BB08A',
      '--color-accent-soft':   'rgba(139,176,138,0.12)',
      '--color-accent-ink':    '#B6D3B5',
    },
  },
}

// ── 기본 프리셋 CSS 변수 ──────────────────────────
// 'default' 선택 시 globals.css :root 기본값으로 복원할 때 사용
// Python으로 치면: DEFAULT_VARS: dict[str, dict[str, str]] = {'light': {...}, 'dark': {...}}
export const DEFAULT_VARS: { light: Record<string, string>; dark: Record<string, string> } = {
  light: { '--bg-primary':'#ffffff','--bg-secondary':'#f9fafb','--bg-hover':'#f3f4f6','--bg-active':'#e5e7eb','--text-primary':'#111827','--text-secondary':'#6b7280','--text-tertiary':'#9ca3af','--border-color':'#e5e7eb','--border-subtle':'#f3f4f6' },
  dark:  { '--bg-primary':'#1e1e1e','--bg-secondary':'#252525','--bg-hover':'#2e2e2e','--bg-active':'#3a3a3a','--text-primary':'#f3f4f6','--text-secondary':'#9ca3af','--text-tertiary':'#6b7280','--border-color':'#374151','--border-subtle':'#2d2d2d' },
}
