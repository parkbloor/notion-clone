// =============================================
// src/store/settingsStore.ts
// 역할: 앱 전체 설정 관리 (테마, 편집기, 플러그인)
// Python으로 치면: class SettingsManager: 앱 전역 설정 싱글톤
// localStorage에 자동 저장/복원
// =============================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { getFontPreset, DEFAULT_FONT_ID } from '@/lib/fonts'

// -----------------------------------------------
// 커스텀 레이아웃 템플릿 저장 포맷
// Python으로 치면: @dataclass class CustomLayoutTemplate: id, name, orientation, cols
// -----------------------------------------------
export interface CustomLayoutTemplate {
  id: string                          // raw UUID (저장 시 'custom:' prefix 없음)
  name: string                        // 사용자 지정 이름
  orientation: 'portrait' | 'landscape'
  cols: number[]                      // 퍼센트 배열 (합계 100), 예: [40, 60] or [30, 40, 30]
}

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
  wordCount: boolean       // 에디터 하단 단어/글자 수 표시
  focusMode: boolean       // 집중 모드 (사이드바 숨김)
  pomodoro: boolean        // 포모도로 타이머 위젯
  tableOfContents: boolean // 페이지 내 목차(TOC) 사이드 패널
  periodicNotes: boolean   // 일간/주간 노트 자동 생성
  canvas: boolean          // 무한 캔버스 블록
  videoAutoplay: boolean   // 비디오 자동 재생 (Autoplay & Loop 플러그인)
  videoLoop: boolean       // 비디오 반복 재생 (Autoplay & Loop 플러그인)
  layoutEnabled: boolean   // 레이아웃 블록 (슬래시 메뉴 표시 여부)
  backlinks: boolean       // 페이지 하단 백링크 패널 표시
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
  // 글꼴 패밀리: FONT_PRESETS의 id 문자열 (예: 'noto-sans', 'inter', 'mono' ...)
  // 기본값: DEFAULT_FONT_ID = 'noto-sans'
  // Python으로 치면: self.font_family: str = DEFAULT_FONT_ID
  fontFamily: string
  // 글꼴 크기 (px) — 에디터 전체 기본 크기 (인라인 크기는 BubbleMenu에서 별도)
  fontSize: number
  // 줄 간격 (1.4 ~ 2.0)
  lineHeight: number
  // 에디터 본문 최대 너비 (px) — 400~1400, 기본 768 (max-w-3xl 동일)
  // Python으로 치면: self.editor_max_width: int = 768
  editorMaxWidth: number

  // ── 플러그인 토글 ────────────────────────────
  plugins: PluginSettings

  // ── 집중 모드 활성 여부 (앱 재시작 시 초기화 — localStorage 저장 안 함) ──
  // Python으로 치면: self._focus_mode_active: bool = False  # volatile
  isFocusMode: boolean

  // ── 카테고리 사이드바 접힘 여부 (localStorage에 영속) ──
  // true = 아이콘만 표시(w-12), false = 전체 표시(w-44)
  // Python으로 치면: self.sidebar_collapsed: bool = False
  sidebarCollapsed: boolean
  toggleSidebarCollapsed: () => void

  // ── 레이아웃 기본값 ──────────────────────────────────────────────────
  // Python으로 치면: self.layout_default_orientation = 'portrait'
  layoutDefaultOrientation: 'portrait' | 'landscape'  // 새 레이아웃 블록 기본 방향
  layoutDefaultTemplate: string                        // 기본 템플릿 ID (빈 문자열 = 피커 표시)
  customLayoutTemplates: CustomLayoutTemplate[]        // 사용자 정의 템플릿 목록

  // ── 액션 ────────────────────────────────────
  // Python으로 치면: def set_theme(self, t): self.theme = t; apply_theme(t)
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
  // font: FONT_PRESETS의 id 문자열
  setFontFamily: (font: string) => void
  setFontSize: (size: number) => void
  setLineHeight: (lh: number) => void
  // 에디터 최대 너비 변경 (하단 슬라이더 + 설정 탭에서 호출)
  // Python으로 치면: def set_editor_max_width(self, w: int): self.editor_max_width = w
  setEditorMaxWidth: (width: number) => void
  togglePlugin: (name: keyof PluginSettings) => void
  // 집중 모드 on/off 토글 (Ctrl+Shift+F 또는 버튼)
  // Python으로 치면: def toggle_focus_mode(self): self._focus_mode_active ^= True
  toggleFocusMode: () => void
  // 레이아웃 기본값 변경 (방향 + 기본 템플릿 ID 동시 설정)
  // Python으로 치면: def set_layout_defaults(self, orient, tpl_id): ...
  setLayoutDefaults: (orientation: 'portrait' | 'landscape', template: string) => void
  // 커스텀 템플릿 추가 / 삭제
  // Python으로 치면: def add_custom_template(self, tpl): self.custom_templates.append(tpl)
  addCustomLayoutTemplate: (tpl: CustomLayoutTemplate) => void
  deleteCustomLayoutTemplate: (id: string) => void
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
// fontFamily: FONT_PRESETS의 id 문자열 (예: 'noto-sans', 'inter', 'mono')
// getFontPreset()으로 family 문자열을 조회해 CSS 변수에 주입
// Python으로 치면: def apply_editor_style(font_id, size, lh): css_vars['--editor-font'] = PRESETS[font_id].family
// -----------------------------------------------
export function applyEditorStyle(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  editorMaxWidth: number = 768
) {
  // FONT_PRESETS에서 id로 폰트 조회 → CSS family 문자열 얻기
  // 없는 id면 getFontPreset()이 첫 번째 프리셋(시스템 기본)을 반환
  const preset = getFontPreset(fontFamily)
  const root = document.documentElement
  root.style.setProperty('--editor-font', preset.family)
  root.style.setProperty('--editor-size', `${fontSize}px`)
  root.style.setProperty('--editor-lh',   String(lineHeight))
  // 에디터 본문 최대 너비 — 하단 슬라이더로 실시간 조절
  // Python으로 치면: document.root.style['--editor-max-width'] = f'{editor_max_width}px'
  root.style.setProperty('--editor-max-width', `${editorMaxWidth}px`)
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
      fontFamily: DEFAULT_FONT_ID,  // 'noto-sans'
      fontSize: 16,
      lineHeight: 1.6,
      editorMaxWidth: 768,          // px, max-w-3xl(48rem)과 동일한 기본값
      plugins: {
        kanban:      true,
        calendar:    true,
        admonition:  true,
        excalidraw:  false,
        recentFiles: true,
        quickAdd:    true,
        wordCount:        true,
        focusMode:        true,
        pomodoro:         true,
        tableOfContents:  true,
        periodicNotes:    true,
        canvas:           true,
        videoAutoplay:    false,  // 기본값: 자동재생 OFF (사용자가 직접 켜야 함)
        videoLoop:        false,  // 기본값: 반복재생 OFF
        layoutEnabled:    true,   // 기본값: 레이아웃 블록 ON (슬래시 메뉴에 표시)
        backlinks:        true,   // 기본값: 백링크 패널 ON
      },
      // 집중 모드는 앱 재시작 시 항상 꺼진 상태로 시작
      isFocusMode: false,
      // 사이드바 접힘 여부 기본값 — false = 전체 표시
      sidebarCollapsed: false,
      // 레이아웃 기본값 — 빈 문자열 = 새 블록 추가 시 항상 피커 표시
      layoutDefaultOrientation: 'portrait',
      layoutDefaultTemplate: '',
      customLayoutTemplates: [],

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

      // ── 에디터 최대 너비 변경 (하단 슬라이더) ──
      // Python으로 치면: def set_editor_max_width(self, w): self.editor_max_width = w
      setEditorMaxWidth: (width) => {
        set((state) => { state.editorMaxWidth = width })
      },

      // ── 플러그인 ON/OFF 토글 ──────────────────
      // Python으로 치면: def toggle_plugin(self, name): self.plugins[name] = not self.plugins[name]
      togglePlugin: (name) => {
        set((state) => {
          state.plugins[name] = !state.plugins[name]
        })
      },

      // ── 집중 모드 토글 ────────────────────────
      // Python으로 치면: def toggle_focus_mode(self): self.is_focus_mode ^= True
      toggleFocusMode: () => {
        set((state) => {
          state.isFocusMode = !state.isFocusMode
        })
      },

      // ── 사이드바 접힘 토글 ────────────────────
      // Python으로 치면: def toggle_sidebar_collapsed(self): self.sidebar_collapsed ^= True
      toggleSidebarCollapsed: () => {
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed
        })
      },

      // ── 레이아웃 기본값 변경 ──────────────────
      // Python으로 치면: def set_layout_defaults(self, orient, tpl): self.layout_default = (orient, tpl)
      setLayoutDefaults: (orientation, template) => {
        set((state) => {
          state.layoutDefaultOrientation = orientation
          state.layoutDefaultTemplate = template
        })
      },

      // ── 커스텀 템플릿 추가 ────────────────────
      // Python으로 치면: def add_custom_template(self, tpl): self.custom_templates.append(tpl)
      addCustomLayoutTemplate: (tpl) => {
        set((state) => {
          state.customLayoutTemplates.push(tpl)
        })
      },

      // ── 커스텀 템플릿 삭제 ────────────────────
      // Python으로 치면: def delete_custom_template(self, id): self.custom_templates = [t for t in ... if t.id != id]
      deleteCustomLayoutTemplate: (id) => {
        set((state) => {
          state.customLayoutTemplates = state.customLayoutTemplates.filter(t => t.id !== id)
        })
      },
    })),
    {
      // localStorage 키 이름
      name: 'notion-clone-settings',
    }
  )
)
