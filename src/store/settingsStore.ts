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
import { PRESET_VARS, DEFAULT_VARS } from '@/lib/themeVars'
import type { Routine } from '@/types/block'
import { plannerApi } from '@/lib/api'

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
  chart: boolean           // 차트 블록 (Bar / Line / Pie)
  gantt: boolean           // 타임라인/갠트 차트 블록
  mindmap: boolean         // AI 마인드맵 블록 (방사형 트리 + AI 채팅)
  globalAiChat: boolean    // 우하단 글로벌 AI 채팅 플로팅 버튼
  math: boolean            // LaTeX 수식 (블록 수식 + 인라인 $...$)
  arrowConnect: boolean    // 텍스트 화살표 연결 오버레이
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
  // 색상 테마 프리셋: 'default'|'notion'|'sepia'|'minimal'|'forest'
  // html[data-theme="X"] 선택자로 CSS 변수 전환
  // Python으로 치면: self.theme_preset = 'default'
  themePreset: string

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

  // ── 날씨 위치 설정 ─────────────────────────────
  // Day Planner / Weekly Planner 날씨 자동 fetch에 사용하는 도시명
  // 한 번 설정하면 모든 플래너 블록에서 공유 (localStorage 영속)
  // Python으로 치면: self.weather_location: str = ''
  weatherLocation: string
  setWeatherLocation: (loc: string) => void

  // ── Day Planner 타임라인 설정 ────────────────
  // plannerStartHour: 타임라인 시작 시각 (기본 0 → 00:00)
  // plannerSnapMin: 드래그 스냅 간격 분 (기본 15)
  // plannerZoom: 1시간당 픽셀 높이 (32|48|64|96, 기본 64)
  // Python으로 치면: self.planner_start_hour: int = 0; self.planner_snap_min: int = 15; self.planner_zoom: int = 64
  plannerStartHour: number
  plannerSnapMin:   number
  plannerZoom:      number
  // weekStartDay: 주간 뷰 시작 요일 (0=일, 1=월(기본), 6=토)
  // plannerNotifyBefore: 이벤트 시작 N분 전 데스크탑 알림 (0=알림 없음, 기본 5)
  // Python으로 치면: self.week_start_day: int = 1; self.planner_notify_before: int = 5
  weekStartDay:          number
  plannerNotifyBefore:   number
  // plannerRoutines: 루틴 프리셋 목록 — settingsStore 영속 저장 (block.content와 분리)
  // Python으로 치면: self.planner_routines: list[Routine] = []
  plannerRoutines:    Routine[]
  // plannerAutoApply: 빈 날 이동 시 루틴 자동 적용 여부
  // Python으로 치면: self.planner_auto_apply: bool = True
  plannerAutoApply:   boolean
  setPlannerStartHour:   (h: number) => void
  setPlannerSnapMin:     (m: number) => void
  setPlannerZoom:        (z: number) => void
  setWeekStartDay:       (d: number) => void
  setPlannerNotifyBefore:(m: number) => void
  setPlannerRoutines:    (r: Routine[]) => void
  setPlannerAutoApply:   (v: boolean) => void
  loadRoutinesFromFile:  () => Promise<void>

  // ── AI 설정 ─────────────────────────────────
  // 제공자: 'openai' | 'claude' | 'ollama'
  // Python으로 치면: self.ai_provider: str = 'openai'
  aiProvider: string
  // 모델 ID (예: 'gpt-4o-mini', 'claude-sonnet-4-6', 'llama3.2')
  aiModel: string
  // API 키 — provider별로 분리 저장 (단일 aiApiKey는 하위호환용으로 유지)
  // Python으로 치면: self.openai_api_key: str = ''; self.anthropic_api_key: str = ''
  aiApiKey: string        // deprecated: 하위호환용 (기존 설정 마이그레이션에 사용)
  openaiApiKey: string    // OpenAI 전용 키
  anthropicApiKey: string // Claude(Anthropic) 전용 키
  // Ollama 전용 서버 URL (기본값: http://localhost:11434)
  // Python으로 치면: self.ollama_url: str = 'http://localhost:11434'
  ollamaUrl: string
  setAiProvider: (provider: string) => void
  setAiModel: (model: string) => void
  setAiApiKey: (key: string) => void        // deprecated: 하위호환용
  setOpenaiApiKey: (key: string) => void
  setAnthropicApiKey: (key: string) => void
  setOllamaUrl: (url: string) => void

  // ── 카테고리 사이드바 접힘 여부 (localStorage에 영속) ──
  // true = 아이콘만 표시(w-12), false = 전체 표시(sidebarWidth px)
  // Python으로 치면: self.sidebar_collapsed: bool = False
  sidebarCollapsed: boolean
  toggleSidebarCollapsed: () => void

  // ── 사이드바 너비 (px) — 마우스 드래그로 조절, localStorage에 영속 ──
  // min: 160px, max: 480px, 기본: 260px
  // Python으로 치면: self.sidebar_width: int = 260
  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  // ── 사이드바 폴더/메모 분할 높이 (px) — 수평 드래그로 조절, localStorage에 영속 ──
  // min: 80px, max: 500px, 기본: 220px
  // Python으로 치면: self.sidebar_folder_height: int = 220
  sidebarFolderHeight: number
  setSidebarFolderHeight: (height: number) => void

  // ── 레이아웃 기본값 ──────────────────────────────────────────────────
  // Python으로 치면: self.layout_default_orientation = 'portrait'
  layoutDefaultOrientation: 'portrait' | 'landscape'  // 새 레이아웃 블록 기본 방향
  layoutDefaultTemplate: string                        // 기본 템플릿 ID (빈 문자열 = 피커 표시)
  customLayoutTemplates: CustomLayoutTemplate[]        // 사용자 정의 템플릿 목록

  // ── 주기 노트 기본 템플릿 ─────────────────────────────────────────
  // 일간/주간/월간 노트 생성 시 사용할 Template id (빈 문자열 = 하드코딩 기본값 사용)
  // Python으로 치면: self.periodic_note_templates: dict[str, str] = {}
  periodicNoteTemplates: { daily: string; weekly: string; monthly: string; quarterly: string; yearly: string }
  setPeriodicNoteTemplate: (kind: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', templateId: string) => void

  // ── 주기 노트 내장 템플릿 오버라이드 ─────────────────────────────
  // 내장 기본 템플릿을 사용자가 직접 수정한 경우 마크다운 문자열로 저장
  // undefined = 하드코딩 기본 함수 사용 / 문자열 = parseTemplateContent()로 파싱
  // Python으로 치면: self.periodic_builtin_overrides: dict[str, str | None] = {}
  periodicBuiltinOverrides: { daily?: string; weekly?: string; monthly?: string; quarterly?: string; yearly?: string }
  setPeriodicBuiltinOverride: (kind: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', markdown: string) => void
  resetPeriodicBuiltinOverride: (kind: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly') => void

  // ── 언어 설정 ───────────────────────────────
  // 지원 로케일: 'ko' | 'en' — 새 언어 추가 시 src/locales/ 에 파일 추가 후 여기도 확장
  // Python으로 치면: self.locale: str = 'ko'
  locale: 'ko' | 'en'
  setLocale: (locale: 'ko' | 'en') => void

  // ── 액션 ────────────────────────────────────
  // Python으로 치면: def set_theme(self, t): self.theme = t; apply_theme(t)
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
  // 색상 테마 프리셋 변경 — html[data-theme] 속성 전환
  // Python으로 치면: def set_theme_preset(self, p): self.theme_preset = p; apply_theme_preset(p)
  setThemePreset: (preset: string) => void
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
// 테마 프리셋 적용 함수
// 1) html[data-theme] 속성 설정 (CSS 선택자용)
// 2) CSS 변수 직접 주입 (applyEditorStyle과 동일한 방식 — 가장 신뢰할 수 있는 방법)
// Python으로 치면: def apply_theme_preset(preset): html.dataset['theme'] = preset; inject_vars(preset)
// -----------------------------------------------
export function applyThemePreset(preset: string) {
  const html = document.documentElement
  const isDark = html.classList.contains('dark')

  // html[data-theme] 속성 설정 — CSS 선택자 매칭용
  if (!preset || preset === 'default') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', preset)
  }

  // CSS 변수 직접 주입 (style.setProperty → 인라인 스타일, CSS 레이어보다 항상 우선)
  // Python으로 치면: for k, v in vars.items(): document.root.style[k] = v
  const varSet = (preset && preset !== 'default')
    ? PRESET_VARS[preset]?.[isDark ? 'dark' : 'light']
    : DEFAULT_VARS[isDark ? 'dark' : 'light']
  if (varSet) {
    Object.entries(varSet).forEach(([k, v]) => html.style.setProperty(k, v))
  }
}

// -----------------------------------------------
// 테마 적용 함수 — <html> 요소에 .dark 클래스 토글
// 다크/라이트 전환 후 현재 프리셋 변수를 재주입 (인라인 스타일은 CSS보다 우선하므로 갱신 필요)
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
  // 다크/라이트 전환 후 현재 프리셋 CSS 변수 재주입 (dark/light에 따라 다른 값 필요)
  // Python으로 치면: apply_theme_preset(html.dataset.get('theme', 'default'))
  const currentPreset = html.getAttribute('data-theme') ?? 'default'
  applyThemePreset(currentPreset)
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
      // 색상 테마 프리셋 기본값 — 'default' = 현재 라이트/다크 방식 유지
      themePreset: 'default',
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
        chart:            true,   // 기본값: 차트 블록 ON
        gantt:            true,   // 기본값: 갠트 블록 ON
        mindmap:          true,   // 기본값: AI 마인드맵 블록 ON
        globalAiChat:     true,   // 기본값: 글로벌 AI 채팅 버튼 ON
        math:             true,   // 기본값: LaTeX 수식 ON
        arrowConnect:     true,   // 기본값: 화살표 연결 ON
      },
      // 집중 모드는 앱 재시작 시 항상 꺼진 상태로 시작
      isFocusMode: false,
      // 사이드바 접힘 여부 기본값 — false = 전체 표시
      sidebarCollapsed: false,
      // 사이드바 너비 기본값 — 260px (두 패널 합친 것보다 좁은 통합 너비)
      sidebarWidth: 260,
      // 사이드바 폴더/메모 분할 높이 기본값 — 220px
      sidebarFolderHeight: 220,
      // 레이아웃 기본값 — 빈 문자열 = 새 블록 추가 시 항상 피커 표시
      layoutDefaultOrientation: 'portrait',
      layoutDefaultTemplate: '',
      customLayoutTemplates: [],
      // 주기 노트 기본 템플릿 — 빈 문자열 = 하드코딩 기본값 사용
      periodicNoteTemplates: { daily: '', weekly: '', monthly: '', quarterly: '', yearly: '' },
      periodicBuiltinOverrides: {},
      // 언어 기본값 — 한국어
      // Python으로 치면: self.locale = 'ko'
      locale: 'ko',
      weatherLocation: '',
      plannerStartHour: 0,
      plannerSnapMin:   15,
      plannerZoom:      64,
      weekStartDay:          1,
      plannerNotifyBefore:   5,
      plannerRoutines:    [],
      plannerAutoApply:   true,
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      aiApiKey: '',
      openaiApiKey: '',
      anthropicApiKey: '',
      ollamaUrl: 'http://localhost:11434',

      // ── 테마 변경 ────────────────────────────
      // Python으로 치면: def set_theme(self, t): self.theme = t; apply_theme(t)
      setTheme: (theme) => {
        set((state) => { state.theme = theme })
        applyTheme(theme)
      },

      // ── 색상 테마 프리셋 변경 ────────────────
      // Python으로 치면: def set_theme_preset(self, p): self.theme_preset = p; apply_preset(p)
      setThemePreset: (preset) => {
        set((state) => { state.themePreset = preset })
        applyThemePreset(preset)
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

      // ── 사이드바 너비 변경 (드래그 핸들) ──────
      // min: 160, max: 480 범위로 제한
      // Python으로 치면: def set_sidebar_width(self, w): self.sidebar_width = max(160, min(480, w))
      setSidebarWidth: (width) => {
        set((state) => {
          state.sidebarWidth = Math.max(160, Math.min(480, width))
        })
      },

      // ── 사이드바 폴더/메모 분할 높이 변경 (수평 드래그 핸들) ──
      // min: 80, max: 500 범위로 제한
      // Python으로 치면: def set_sidebar_folder_height(self, h): self.sidebar_folder_height = max(80, min(500, h))
      setSidebarFolderHeight: (height) => {
        set((state) => {
          state.sidebarFolderHeight = Math.max(80, Math.min(500, height))
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

      // ── 날씨 위치 변경 ───────────────────────
      // Python으로 치면: def set_weather_location(self, loc): self.weather_location = loc
      setWeatherLocation:    (loc) => { set((state) => { state.weatherLocation    = loc }) },
      setPlannerStartHour:   (h)   => { set((state) => { state.plannerStartHour   = h   }) },
      setPlannerSnapMin:     (m)   => { set((state) => { state.plannerSnapMin     = m   }) },
      setPlannerZoom:        (z)   => { set((state) => { state.plannerZoom        = z   }) },
      setWeekStartDay:          (d) => { set((state) => { state.weekStartDay          = d }) },
      setPlannerNotifyBefore:   (m) => { set((state) => { state.plannerNotifyBefore   = m }) },
      // 루틴 프리셋 전체 교체 + vault 파일에 영속 저장
      // Python으로 치면: def set_planner_routines(self, r): self.planner_routines = r; save_to_file(r)
      setPlannerRoutines: (r) => {
        set((state) => { state.plannerRoutines = r })
        // vault/_planner_routines.json에 비동기 저장 (백엔드가 꺼져있으면 조용히 무시)
        plannerApi.saveRoutines(r).catch(() => {})
      },
      // vault 파일에서 루틴 로드 (앱 시작 시 호출) — localStorage보다 파일 우선
      // Python으로 치면: def load_routines_from_file(self): self.planner_routines = json.load(file)
      loadRoutinesFromFile: async () => {
        try {
          const routines = await plannerApi.getRoutines()
          set((state) => { state.plannerRoutines = routines as Routine[] })
        } catch {
          // 백엔드 미실행 시 기존 localStorage 값 유지
        }
      },
      setPlannerAutoApply:   (v) => { set((state) => { state.plannerAutoApply   = v }) },

      // ── 주기 노트 기본 템플릿 변경 ──────────────
      // Python으로 치면: def set_periodic_note_template(self, kind, id): self.periodic_note_templates[kind] = id
      setPeriodicNoteTemplate: (kind, templateId) => {
        set((state) => { state.periodicNoteTemplates[kind] = templateId })
      },
      // 내장 템플릿 오버라이드 저장 — Python: def set_builtin_override(kind, md): ...
      setPeriodicBuiltinOverride: (kind, markdown) => {
        set((state) => { state.periodicBuiltinOverrides[kind] = markdown })
      },
      // 내장 템플릿 초기화 — Python: def reset_builtin_override(kind): del overrides[kind]
      resetPeriodicBuiltinOverride: (kind) => {
        set((state) => { delete state.periodicBuiltinOverrides[kind] })
      },

      // ── 언어 변경 ────────────────────────────
      // Python으로 치면: def set_locale(self, l): self.locale = l
      setLocale: (locale) => { set((state) => { state.locale = locale }) },

      // ── AI 설정 변경 ─────────────────────────
      // Python으로 치면: def set_ai_provider(self, p): self.ai_provider = p
      setAiProvider:      (provider) => { set((state) => { state.aiProvider = provider }) },
      setAiModel:         (model)    => { set((state) => { state.aiModel = model }) },
      setAiApiKey:        (key)      => { set((state) => { state.aiApiKey = key }) },
      setOpenaiApiKey:    (key)      => { set((state) => { state.openaiApiKey = key }) },
      setAnthropicApiKey: (key)      => { set((state) => { state.anthropicApiKey = key }) },
      setOllamaUrl:       (url)      => { set((state) => { state.ollamaUrl = url }) },
    })),
    {
      // localStorage 키 이름
      name: 'notion-clone-settings',

      // isFocusMode는 휘발성 — 앱 재시작 시 항상 false로 시작 (false로 고정 직렬화)
      // Python으로 치면: serialized['is_focus_mode'] = False  # 세션 상태는 저장하지 않음
      partialize: (state) => ({ ...state, isFocusMode: false }),

      // ── 스토어 버전 관리 ────────────────────────
      // 새 키 추가 시: version 증가 + migrate에 해당 버전 블록 추가
      // Python으로 치면: SCHEMA_VERSION = 1; def migrate(old, from_ver): ...
      version: 1,

      // migrate: 구버전 저장값 → 현재 구조로 안전하게 업그레이드
      // 전략: "덮어쓰기 금지" — 기존 사용자 설정은 반드시 보존하고 누락된 키만 채움
      // Python으로 치면:
      //   def migrate(state, from_version):
      //       if from_version < 1: state['plugins'] = {**defaults, **state.get('plugins', {})}
      //       return state
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>

        if (fromVersion < 1) {
          // v0 → v1: plugins 중첩 객체 deep merge
          //   문제: Zustand persist는 최상위만 shallow merge → plugins 통째로 교체됨
          //   → 새 플러그인 키(globalAiChat, math, arrowConnect 등) 누락 버그
          //   해결: 저장된 plugins에 없는 키만 기본값으로 채움 (기존 OFF 설정 유지)
          // PluginSettings 타입 사용 → 새 키 추가 시 TypeScript가 누락 감지
          const defaultPlugins: PluginSettings = {
            kanban: true, calendar: true, admonition: true, excalidraw: false,
            recentFiles: true, quickAdd: true, wordCount: true, focusMode: true,
            pomodoro: true, tableOfContents: true, periodicNotes: true, canvas: true,
            videoAutoplay: false, videoLoop: false, layoutEnabled: true, backlinks: true,
            chart: true, gantt: true, mindmap: true, globalAiChat: true, math: true,
            arrowConnect: true,
          }
          // localStorage 손상 시 plugins가 객체가 아닐 수 있으므로 타입 방어
          const saved = (state.plugins && typeof state.plugins === 'object')
            ? (state.plugins as Partial<PluginSettings>)
            : {}
          state.plugins = { ...defaultPlugins, ...saved }

          // plannerRoutines 누락 또는 잘못된 타입 시 빈 배열로 초기화
          if (!Array.isArray(state.plannerRoutines)) state.plannerRoutines = []

          // periodicNoteTemplates 누락 시 기본값
          if (state.periodicNoteTemplates == null || typeof state.periodicNoteTemplates !== 'object') {
            state.periodicNoteTemplates = { daily: '', weekly: '', monthly: '', quarterly: '', yearly: '' }
          }

          // periodicBuiltinOverrides 누락 시 빈 객체
          if (!state.periodicBuiltinOverrides || typeof state.periodicBuiltinOverrides !== 'object') {
            state.periodicBuiltinOverrides = {}
          }

          // customLayoutTemplates 누락 시 빈 배열
          if (!Array.isArray(state.customLayoutTemplates)) state.customLayoutTemplates = []
        }

        return state
      },
    }
  )
)
