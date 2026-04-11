// =============================================
// src/components/settings/tabs/EditorTab.tsx
// 역할: 편집기 설정 탭 — 글꼴, 크기, 줄간격
// FONT_PRESETS 기반으로 전체 폰트 목록 표시
// Python으로 치면: class EditorSettings(SettingsTab): def render_font_picker(): ...
// =============================================

'use client'

import { useState } from 'react'
import { useSettingsStore, applyEditorStyle } from '@/store/settingsStore'
import { FONT_PRESETS, CATEGORY_LABELS, getFontPreset, type FontCategory } from '@/lib/fonts'
import { useLocale } from '@/locales'

// -----------------------------------------------
// 에디터 전체 기본 크기 옵션 (px)
// 버블메뉴의 인라인 크기(8종)와는 별개 — 에디터 기본값만
// Python으로 치면: SIZE_OPTIONS: list[int] = [14, 16, 18, 20]
// -----------------------------------------------
const SIZE_OPTIONS: number[] = [14, 16, 18, 20]

// 카테고리 표시 순서
const CATEGORY_ORDER: FontCategory[] = ['sans', 'korean', 'serif', 'mono']

export default function EditorTab() {
  // Python으로 치면: t = get_locale()
  const t = useLocale()
  const { fontFamily, fontSize, lineHeight, editorMaxWidth, setFontFamily, setFontSize, setLineHeight,
          weatherLocation, setWeatherLocation,
          plannerStartHour, plannerSnapMin, plannerZoom, weekStartDay, plannerNotifyBefore,
          setPlannerStartHour, setPlannerSnapMin, setPlannerZoom, setWeekStartDay, setPlannerNotifyBefore } = useSettingsStore()

  // 날씨 위치 입력 로컬 상태 (저장 버튼 누를 때까지 임시 보관)
  // Python으로 치면: self._loc_input: str = weather_location
  const [locInput, setLocInput] = useState(weatherLocation)

  // -----------------------------------------------
  // 편집기 스타일 즉시 반영 헬퍼
  // setXxx: zustand 상태 갱신 (localStorage 저장)
  // applyEditorStyle: :root CSS 변수 즉시 주입 (화면 즉시 반영)
  // editorMaxWidth를 항상 같이 전달해야 --editor-max-width 변수가 768px로 초기화되지 않음
  // Python으로 치면: def update_and_apply(self, **kwargs): self.update(**kwargs); apply_style()
  // -----------------------------------------------
  function changeFont(fontId: string) {
    setFontFamily(fontId)
    applyEditorStyle(fontId, fontSize, lineHeight, editorMaxWidth)
  }

  function changeSize(size: number) {
    setFontSize(size)
    applyEditorStyle(fontFamily, size, lineHeight, editorMaxWidth)
  }

  function changeLH(lh: number) {
    const rounded = Math.round(lh * 10) / 10
    setLineHeight(rounded)
    applyEditorStyle(fontFamily, fontSize, rounded, editorMaxWidth)
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
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.editor.font}</h3>
        <p className="text-xs text-gray-400 mb-4">{t.settings.editor.fontDesc}</p>

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
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.editor.fontSize}</h3>
        <p className="text-xs text-gray-400 mb-4">{t.settings.editor.fontSizeDesc}</p>
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
          {t.settings.editor.lineHeight}
          <span className="ml-2 text-blue-600 font-bold">{lineHeight.toFixed(1)}</span>
        </h3>
        <p className="text-xs text-gray-400 mb-4">{t.settings.editor.lineHeightDesc}</p>
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
          <span>1.4 {t.settings.editor.lineHeightNarrow}</span>
          <span>2.0 {t.settings.editor.lineHeightWide}</span>
        </div>
      </section>

      {/* ── 날씨 위치 설정 ────────────────────────── */}
      {/* Day Planner / Weekly Planner 블록 날씨 자동 표시에 사용하는 기본 도시명 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.editor.weatherLocation}</h3>
        <p className="text-xs text-gray-400 mb-3">
          {t.settings.editor.weatherLocationDesc}<br />
          {t.settings.editor.weatherLocationDesc2}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t.settings.editor.weatherPlaceholder}
            value={locInput}
            onChange={e => setLocInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setWeatherLocation(locInput.trim()) }}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 transition-colors"
          />
          <button
            type="button"
            onClick={() => setWeatherLocation(locInput.trim())}
            className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            {t.settings.editor.weatherSave}
          </button>
          {weatherLocation && locInput.trim() === weatherLocation && (
            <span className="text-xs text-emerald-500 font-medium whitespace-nowrap">{t.settings.editor.weatherSaved}</span>
          )}
        </div>
        {weatherLocation && (
          <p className="text-xs text-gray-400 mt-2">
            {t.settings.editor.weatherCurrent} <span className="text-blue-500 font-medium">{weatherLocation}</span>
            <button
              type="button"
              onClick={() => { setWeatherLocation(''); setLocInput('') }}
              className="ml-2 text-gray-300 hover:text-red-400 transition-colors"
            >
              {t.settings.editor.weatherDelete}
            </button>
          </p>
        )}
      </section>

      {/* ── Day Planner 타임라인 설정 ────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{t.settings.editor.dayPlannerSection}</h3>
        <p className="text-xs text-gray-400 mb-3">
          {t.settings.editor.dayPlannerDesc}
        </p>
        <div className="flex flex-col gap-3">
          {/* 시작 시각 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 w-28 shrink-0">{t.settings.editor.plannerStartHour}</label>
            <select
              value={plannerStartHour}
              onChange={e => setPlannerStartHour(Number(e.target.value))}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            >
              {Array.from({ length: 13 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
              ))}
            </select>
          </div>
          {/* 스냅 간격 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 w-28 shrink-0">{t.settings.editor.plannerSnapMin}</label>
            <select
              value={plannerSnapMin}
              onChange={e => setPlannerSnapMin(Number(e.target.value))}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            >
              <option value={5}>{t.settings.editor.plannerSnapMin5}</option>
              <option value={10}>{t.settings.editor.plannerSnapMin10}</option>
              <option value={15}>{t.settings.editor.plannerSnapMin15}</option>
              <option value={30}>{t.settings.editor.plannerSnapMin30}</option>
            </select>
          </div>
          {/* 타임라인 줌 레벨 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 w-28 shrink-0">{t.settings.editor.plannerZoom}</label>
            <select
              value={plannerZoom}
              onChange={e => setPlannerZoom(Number(e.target.value))}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            >
              <option value={32}>{t.settings.editor.plannerZoomNarrow} (32px/h)</option>
              <option value={48}>{t.settings.editor.plannerZoomSlightlyNarrow} (48px/h)</option>
              <option value={64}>{t.settings.editor.plannerZoomDefault} (64px/h)</option>
              <option value={96}>{t.settings.editor.plannerZoomWide} (96px/h)</option>
            </select>
          </div>
          {/* 주간 뷰 시작 요일 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 w-28 shrink-0">{t.settings.editor.weekStartDay}</label>
            <select
              value={weekStartDay}
              onChange={e => setWeekStartDay(Number(e.target.value))}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            >
              <option value={0}>{t.settings.editor.weekStartSunday}</option>
              <option value={1}>{t.settings.editor.weekStartMonday}</option>
              <option value={6}>{t.settings.editor.weekStartSaturday}</option>
            </select>
          </div>
          {/* 데스크탑 알림 — 이벤트 시작 N분 전 */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 w-28 shrink-0">{t.settings.editor.plannerNotifyBefore}</label>
            <select
              value={plannerNotifyBefore}
              onChange={e => setPlannerNotifyBefore(Number(e.target.value))}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            >
              <option value={0}>{t.settings.editor.plannerNotifyNone}</option>
              <option value={5}>{t.settings.editor.plannerNotify5}</option>
              <option value={10}>{t.settings.editor.plannerNotify10}</option>
              <option value={15}>{t.settings.editor.plannerNotify15}</option>
              <option value={30}>{t.settings.editor.plannerNotify30}</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── 미리보기 ─────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t.settings.editor.preview}</h3>
        <div
          className="border border-gray-200 rounded-xl p-4 bg-gray-50 text-gray-800"
          style={{
            fontFamily: currentPreset.family,
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
          }}
        >
          <p className="text-lg font-bold mb-2">{t.settings.editor.previewTitle}</p>
          <p>{t.settings.editor.previewBody}</p>
        </div>
      </section>
    </div>
  )
}
