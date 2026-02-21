// =============================================
// src/store/settingsStore.ts
// 역할: 앱 전체 설정 관리 (테마, 편집기, 플러그인)
// Python으로 치면: class SettingsManager: 앱 전역 설정 싱글톤
// localStorage에 자동 저장/복원
// =============================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// -----------------------------------------------
// 플러그인 토글 설정
// 각 키는 플러그인 이름, 값은 활성화 여부
// Python으로 치면: @dataclass class PluginSettings: kanban: bool = True ...
// -----------------------------------------------
export interface PluginSettings {
  kanban: boolean       // 칸반 보드 블록
  calendar: boolean     // 캘린더 사이드바 위젯
  admonition: boolean   // 콜아웃(경고/정보) 블록
  excalidraw: boolean   // 손그림 다이어그램 블록
  recentFiles: boolean  // 최근 파일 목록
  quickAdd: boolean     // 빠른 노트 캡처
}

// -----------------------------------------------
// 전체 설정 스토어 인터페이스
// Python으로 치면: @dataclass class AppSettings: theme: str; font_family: str; ...
// -----------------------------------------------
export interface SettingsStore {
  // ── 모양 ────────────────────────────────────
  // 테마: 라이트 / 다크 / 시스템 자동
  // Python으로 치면: self.theme = 'light'
  theme: 'light' | 'dark' | 'auto'

  // ── 편집기 ──────────────────────────────────
  // 글꼴 패밀리: sans-serif / 명조 / 고정폭
  // Python으로 치면: self.font_family = 'sans'
  fontFamily: 'sans' | 'serif' | 'mono'
  // 글꼴 크기 (px)
  fontSize: 14 | 16 | 18 | 20
  // 줄 간격 (1.4 ~ 2.0)
  lineHeight: number

  // ── 플러그인 토글 ────────────────────────────
  plugins: PluginSettings

  // ── 액션 ────────────────────────────────────
  // Python으로 치면: def set_theme(self, t): self.theme = t; apply_theme(t)
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
  setFontFamily: (font: 'sans' | 'serif' | 'mono') => void
  setFontSize: (size: 14 | 16 | 18 | 20) => void
  setLineHeight: (lh: number) => void
  togglePlugin: (name: keyof PluginSettings) => void
}

// -----------------------------------------------
// 테마 적용 함수 — <html> 요소에 .dark 클래스 토글
// Python으로 치면: def apply_theme(theme): document.body.class_list.toggle('dark', ...)
// -----------------------------------------------
export function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
  } else if (theme === 'light') {
    html.classList.remove('dark')
  } else {
    // auto: 시스템 설정 따름
    // Python으로 치면: if system.prefers_dark: add_class('dark') else: remove_class
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.classList.toggle('dark', prefersDark)
  }
}

// -----------------------------------------------
// 편집기 CSS 변수 적용 — 글꼴/크기/줄간격을 :root 변수로 주입
// Python으로 치면: def apply_editor_style(font, size, lh): set_css_vars(...)
// -----------------------------------------------
export function applyEditorStyle(
  fontFamily: 'sans' | 'serif' | 'mono',
  fontSize: number,
  lineHeight: number
) {
  const fontMap = {
    sans:  "'Inter', 'Noto Sans KR', sans-serif",
    serif: "'Georgia', 'Noto Serif KR', serif",
    mono:  "'JetBrains Mono', 'Fira Code', monospace",
  }
  const root = document.documentElement
  root.style.setProperty('--editor-font', fontMap[fontFamily])
  root.style.setProperty('--editor-size', `${fontSize}px`)
  root.style.setProperty('--editor-lh',   String(lineHeight))
}

// -----------------------------------------------
// Zustand 스토어 정의
// persist: localStorage에 자동 저장/복원
// immer: 불변 업데이트를 mutable 스타일로 작성
// Python으로 치면: settings = SettingsManager(storage='localStorage')
// -----------------------------------------------
export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      // ── 기본값 ──────────────────────────────
      theme: 'light',
      fontFamily: 'sans',
      fontSize: 16,
      lineHeight: 1.6,
      plugins: {
        kanban:      true,
        calendar:    true,
        admonition:  true,
        excalidraw:  false,
        recentFiles: true,
        quickAdd:    true,
      },

      // ── 테마 변경 ────────────────────────────
      // Python으로 치면: def set_theme(self, t): self.theme = t; apply_theme(t)
      setTheme: (theme) => {
        set((state) => { state.theme = theme })
        applyTheme(theme)
      },

      // ── 편집기 글꼴 변경 ──────────────────────
      // Python으로 치면: def set_font_family(self, f): self.font_family = f; apply_style()
      setFontFamily: (font) => {
        set((state) => { state.fontFamily = font })
      },

      // ── 편집기 글꼴 크기 변경 ─────────────────
      setFontSize: (size) => {
        set((state) => { state.fontSize = size })
      },

      // ── 편집기 줄 간격 변경 ───────────────────
      setLineHeight: (lh) => {
        set((state) => { state.lineHeight = lh })
      },

      // ── 플러그인 ON/OFF 토글 ──────────────────
      // Python으로 치면: def toggle_plugin(self, name): self.plugins[name] = not self.plugins[name]
      togglePlugin: (name) => {
        set((state) => {
          state.plugins[name] = !state.plugins[name]
        })
      },
    })),
    {
      // localStorage 키 이름
      name: 'notion-clone-settings',
    }
  )
)
