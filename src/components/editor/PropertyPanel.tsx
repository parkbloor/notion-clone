// ==============================================
// src/components/editor/PropertyPanel.tsx
// 역할: 페이지 속성 패널 — 태그 + 날짜/상태/선택/텍스트/관계 5종
//   - 태그 섹션: 칩 표시 + 자동완성 입력 + 추가/삭제
//   - 속성 목록 표시 및 인라인 편집
//   - "+ 속성 추가" 드롭다운 메뉴
//   - 관계 속성: 다른 페이지를 연결 (쉼표 구분 다중 연결 지원)
// Python으로 치면: class PropertyPanel(QWidget): ...
// ==============================================

'use client'

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { PageProperty, PropertyType, STATUS_OPTIONS } from '@/types/block'
import { useLocale } from '@/locales'

interface PropertyPanelProps {
  pageId: string
  // 관계 속성 클릭 시 해당 페이지로 이동하는 콜백
  // Python으로 치면: on_navigate: Callable[[str], None] = None
  onNavigate?: (targetPageId: string) => void
}


// ── WMO 날씨 코드 → 이모지 (date 속성 날씨 표시용) ──
// Python으로 치면: WMO_ICON: dict[int, str] = { 0: '☀️', ... }
const WMO_ICON: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌧️', 81: '🌧️', 82: '🌧️',
  85: '❄️', 86: '❄️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}
function wmoToIcon(code: number): string { return WMO_ICON[code] ?? '🌡️' }

// ── 상태 배지 색상 매핑 ──────────────────────────
// Python으로 치면: STATUS_COLOR = {'미시작': 'gray', '진행 중': 'blue', ...}
// Stitch "Digital Atelier" 스타일: 아웃라인 필 형태
const STATUS_COLOR: Record<string, string> = {
  '미시작': 'bg-gray-50 text-gray-500 border border-gray-200',
  '진행 중': 'bg-stone-50 text-stone-600 border border-stone-300',
  '완료': 'bg-stone-100 text-stone-700 border border-stone-400',
  '보류': 'bg-amber-50 text-amber-600 border border-amber-200',
}

export default function PropertyPanel({ pageId, onNavigate }: PropertyPanelProps) {
  // 로케일 훅
  const t = useLocale()

  // ── 속성 타입 목록 (추가 드롭다운용) — 로케일 기반
  // Python으로 치면: PROPERTY_TYPES = [('date', t.property.types.date, '📅'), ...]
  const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
    { type: 'date',     label: t.property.types.date,     icon: '📅' },
    { type: 'time',     label: t.property.types.time,     icon: '⏰' },
    { type: 'status',   label: t.property.types.status,   icon: '🔵' },
    { type: 'select',   label: t.property.types.select,   icon: '🏷️' },
    { type: 'text',     label: t.property.types.text,     icon: '📝' },
    { type: 'relation', label: t.property.types.relation, icon: '🔗' },
  ]

  // ── 스토어 ────────────────────────────────────
  const pages = usePageStore(s => s.pages)
  const setCurrentPage = usePageStore(s => s.setCurrentPage)
  const setPageProperty = usePageStore(s => s.setPageProperty)
  const removePageProperty = usePageStore(s => s.removePageProperty)
  const addTagToPage = usePageStore(s => s.addTagToPage)
  const removeTagFromPage = usePageStore(s => s.removeTagFromPage)
  // 전역 날씨 위치 — 설정 탭에서 저장된 도시명
  // Python으로 치면: weather_location = settings_store.weather_location
  const weatherLocation = useSettingsStore(s => s.weatherLocation)

  const page = pages.find(p => p.id === pageId)
  const properties = page?.properties ?? []
  // 현재 페이지의 태그 목록
  // Python으로 치면: tags = page.tags or []
  const tags = page?.tags ?? []

  // ── 전체 페이지에서 태그 집합 수집 (자동완성용) ──
  // Python으로 치면: all_tags = sorted({t for p in pages for t in p.tags})
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const p of pages) {
      for (const t of p.tags ?? []) set.add(t)
    }
    return [...set].sort()
  }, [pages])

  // ── 태그 입력 상태 ─────────────────────────────
  // Python으로 치면: self.tag_input = ''
  const [tagInput, setTagInput] = useState('')
  // 자동완성 드롭다운 표시 여부
  const [showSuggestions, setShowSuggestions] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // 입력값 기반 자동완성 후보 — 이미 추가된 태그는 제외
  // Python으로 치면: suggestions = [t for t in all_tags if input in t and t not in tags]
  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return allTags.filter(t => !tags.includes(t)).slice(0, 8)
    return allTags.filter(t => t.toLowerCase().includes(q) && !tags.includes(t)).slice(0, 8)
  }, [tagInput, allTags, tags])

  // 외부 클릭 시 자동완성 드롭다운 닫기
  // Python으로 치면: document.addEventListener('click', close_suggestions)
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (tagInputRef.current && !tagInputRef.current.closest('.tag-input-wrapper')?.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // ── 태그 추가 ─────────────────────────────────
  // Python으로 치면: def add_tag(tag): page.tags.append(tag); input = ''
  function handleAddTag(tag: string) {
    const trimmed = tag.trim().replace(/^#/, '') // # 접두사 자동 제거
    if (!trimmed) return
    addTagToPage(pageId, trimmed)
    setTagInput('')
    setShowSuggestions(false)
    tagInputRef.current?.focus()
  }

  // ── 태그 입력 키 이벤트 ───────────────────────
  // Python으로 치면: def on_key(e): if e.key == 'Enter': add_tag(input)
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag(tagInput)
    } else if (e.key === 'Escape') {
      setTagInput('')
      setShowSuggestions(false)
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      // 입력이 비어있을 때 Backspace → 마지막 태그 삭제
      removeTagFromPage(pageId, tags[tags.length - 1])
    }
  }

  // ── 로컬 상태 ─────────────────────────────────
  // 현재 편집 중인 속성 id (null이면 편집 없음)
  const [editingId, setEditingId] = useState<string | null>(null)
  // "+ 속성 추가" 드롭다운 표시 여부
  const [showAddMenu, setShowAddMenu] = useState(false)
  // 속성 이름 편집 중인 id
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  // select 타입의 새 옵션 입력값
  const [newOption, setNewOption] = useState('')

  const addMenuRef = useRef<HTMLDivElement>(null)

  // ── 날씨 fetch 로딩 상태 per-property ────────
  // Python으로 치면: self.weather_loading: dict[str, bool] = {}
  const [weatherLoading, setWeatherLoading] = useState<Record<string, boolean>>({})

  // 날씨 fetch — Open-Meteo 지오코딩 → 일일 예보 → prop.weatherData 저장
  // date 속성에 통합된 날씨 기능 (별도 속성 불필요)
  // Python으로 치면: async def fetch_weather_for_prop(prop, city): ...
  const fetchWeatherForProp = useCallback(async (prop: PageProperty, city: string) => {
    const dateStr = prop.value  // date 타입의 value = 'YYYY-MM-DD'
    if (!city.trim() || !dateStr) return
    setWeatherLoading(prev => ({ ...prev, [prop.id]: true }))
    try {
      // 1단계: 도시명 → 위도/경도
      const geoRes  = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ko&format=json`
      )
      const geoData = await geoRes.json()
      if (!geoData.results?.length) { setWeatherLoading(prev => ({ ...prev, [prop.id]: false })); return }
      const { latitude, longitude } = geoData.results[0]

      // 2단계: 날짜별 날씨코드 + 최저/최고기온 (최대 16일 예보)
      const wRes  = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`
      )
      const wData = await wRes.json()
      const idx   = (wData.daily.time as string[]).indexOf(dateStr)
      if (idx === -1) { setWeatherLoading(prev => ({ ...prev, [prop.id]: false })); return }

      // prop.weatherData에 날씨 저장 (value는 그대로 날짜 문자열 유지)
      setPageProperty(pageId, {
        ...prop,
        weatherData: {
          icon:     wmoToIcon(wData.daily.weathercode[idx]),
          tempMin:  Math.round(wData.daily.temperature_2m_min[idx]),
          tempMax:  Math.round(wData.daily.temperature_2m_max[idx]),
          location: city,
        },
      })
    } catch { /* 조용히 무시 */ }
    setWeatherLoading(prev => ({ ...prev, [prop.id]: false }))
  }, [pageId, setPageProperty])

  // ── 관계 속성 검색 상태 ─────────────────────
  // Python으로 치면: self.relation_search = {}  # { prop_id: '검색어' }
  const [relationSearch, setRelationSearch] = useState<Record<string, string>>({})
  // 관계 검색 드롭다운 표시 여부
  const [relationDropdown, setRelationDropdown] = useState<string | null>(null)
  const relationRef = useRef<HTMLDivElement>(null)

  // 관계 검색 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (relationRef.current && !relationRef.current.contains(e.target as Node)) {
        setRelationDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // ── 속성 추가 ────────────────────────────────
  // Python으로 치면: def add_property(self, type): self.properties.append(...)
  function handleAdd(type: PropertyType) {
    const labels: Record<PropertyType, string> = {
      date: t.property.types.date,
      time: t.property.types.time,
      status: t.property.types.status,
      select: t.property.types.select,
      text: t.property.types.text,
      relation: t.property.types.relation,
    }
    const newProp: PageProperty = {
      id: crypto.randomUUID(),
      name: labels[type],
      type,
      value: type === 'status' ? '미시작' : '',
      options: type === 'select' ? [] : undefined,
    }
    setPageProperty(pageId, newProp)
    setShowAddMenu(false)
    setEditingId(newProp.id)
  }

  // ── 속성값 변경 ──────────────────────────────
  // Python으로 치면: def update_value(self, prop_id, value): prop.value = value
  function handleValueChange(prop: PageProperty, value: string) {
    setPageProperty(pageId, { ...prop, value })
  }

  // ── 속성명 변경 ──────────────────────────────
  // Python으로 치면: def rename_property(self, prop_id, name): prop.name = name
  function handleNameChange(prop: PageProperty, name: string) {
    setPageProperty(pageId, { ...prop, name })
  }

  // ── select 옵션 추가 ─────────────────────────
  // Python으로 치면: def add_option(self, prop_id, option): prop.options.append(option)
  function handleAddOption(prop: PageProperty) {
    const trimmed = newOption.trim()
    if (!trimmed) return
    const options = [...(prop.options ?? []), trimmed]
    setPageProperty(pageId, { ...prop, options })
    setNewOption('')
  }

  // ── select 옵션 삭제 ─────────────────────────
  // Python으로 치면: def remove_option(self, prop_id, option): prop.options.remove(option)
  function handleRemoveOption(prop: PageProperty, opt: string) {
    const options = (prop.options ?? []).filter(o => o !== opt)
    const value = prop.value === opt ? '' : prop.value
    setPageProperty(pageId, { ...prop, options, value })
  }

  if (!page) return null

  return (
    <div className="mt-1 mb-4 text-sm print-hide select-none">

      {/* ── 태그 섹션 ─────────────────────────────────────────────
          태그 칩 목록 + 인라인 입력 + 자동완성 드롭다운
          Python으로 치면: render_tag_section(page.tags, all_tags) */}
      <div className="flex items-start gap-1.5 py-1.5 border-b border-black/5 dark:border-white/5 tag-input-wrapper relative">
        {/* 태그 아이콘 레이블 */}
        <div className="w-28 shrink-0 flex items-center gap-1 pt-0.5">
          <span className="text-xs text-gray-400">🏷️</span>
          <span className="text-xs text-gray-500">{t.property.tagLabel}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* 태그 칩 + 입력창 한 줄에 흘러넘치면 wrap */}
          <div className="flex flex-wrap gap-1 items-center">

            {/* 기존 태그 칩 — 클릭 X로 삭제 */}
            {/* Python으로 치면: for tag in tags: render_chip(tag) */}
            {tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 text-xs bg-stone-100 text-stone-600 border border-stone-200 rounded-full px-2 py-0.5 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700"
              >
                <span className="text-stone-400 text-[10px]">#</span>
                {tag}
                <button
                  type="button"
                  onClick={() => removeTagFromPage(pageId, tag)}
                  className="ml-0.5 text-stone-300 hover:text-stone-600 leading-none transition-colors dark:text-stone-500 dark:hover:text-stone-300"
                  title={t.property.tagDelete.replace('{tag}', tag)}
                >
                  ×
                </button>
              </span>
            ))}

            {/* 태그 입력창 */}
            {/* Python으로 치면: input.on_change = update_input; input.on_key = handle_key */}
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              placeholder={tags.length === 0 ? t.property.tagPlaceholder : ''}
              onChange={e => {
                setTagInput(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleTagKeyDown}
              className="text-xs text-gray-700 bg-transparent outline-none border-none placeholder-gray-300 min-w-16 flex-1"
            />
          </div>

          {/* 자동완성 드롭다운 */}
          {/* Python으로 치면: if show_suggestions and suggestions: render_dropdown(suggestions) */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-28 top-full mt-1 z-30 bg-white/95 dark:bg-gray-900/95 border border-black/8 dark:border-white/8 rounded-xl shadow-md backdrop-blur-sm py-1 min-w-32 max-h-48 overflow-y-auto">
              {suggestions.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleAddTag(tag) }}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-stone-50 hover:text-stone-800 dark:text-gray-300 dark:hover:bg-stone-800 text-left transition-colors"
                >
                  <span className="text-gray-400">#</span>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 속성 목록 ── */}
      {properties.map(prop => (
        <div
          key={prop.id}
          className="flex items-start gap-2 py-1.5 group border-b border-black/5 dark:border-white/5 last:border-0"
        >
          {/* 속성명 */}
          <div className="w-28 shrink-0 flex items-center gap-1">
            {/* 타입 아이콘 */}
            <span className="text-xs text-gray-400">
              {PROPERTY_TYPES.find(t => t.type === prop.type)?.icon}
            </span>
            {/* 속성명 편집 */}
            {editingNameId === prop.id ? (
              <input
                autoFocus
                className="text-xs text-gray-600 bg-transparent border-b border-blue-400 outline-none w-full"
                defaultValue={prop.name}
                onBlur={e => {
                  handleNameChange(prop, e.target.value || prop.name)
                  setEditingNameId(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    handleNameChange(prop, (e.target as HTMLInputElement).value || prop.name)
                    setEditingNameId(null)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700 truncate text-left"
                onClick={() => setEditingNameId(prop.id)}
              >
                {prop.name}
              </button>
            )}
          </div>

          {/* 속성값 편집 영역 */}
          <div className="flex-1 min-w-0">
            {/* ── 날짜 타입 (날씨 fetch 통합) ── */}
            {/* 날짜 picker + 알림 토글 + 날씨 가져오기 버튼 + 날씨 결과 표시 */}
            {/* Python으로 치면: if prop.type == 'date': render_date_with_weather(prop) */}
            {prop.type === 'date' && (() => {
              const wx      = prop.weatherData
              const loading = weatherLoading[prop.id] ?? false
              const city    = wx?.location || weatherLocation
              return (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* 날짜 입력 — 날짜 바꾸면 날씨 데이터 초기화 */}
                    <input
                      type="date"
                      className="text-xs text-gray-600 bg-transparent border border-gray-200/80 rounded-full px-2.5 py-0.5 focus:outline-none focus:border-stone-400 cursor-pointer dark:border-gray-700 dark:text-gray-300"
                      value={prop.value}
                      onChange={e => setPageProperty(pageId, { ...prop, value: e.target.value, weatherData: undefined })}
                    />
                    {/* 🔔 알림 토글 */}
                    <button
                      type="button"
                      onClick={() => setPageProperty(pageId, { ...prop, reminder: !prop.reminder })}
                      title={prop.reminder ? t.property.reminderOn : t.property.reminderOff}
                      className={['text-xs px-1.5 py-0.5 rounded transition-colors', prop.reminder ? 'bg-amber-100 text-amber-600' : 'text-gray-300 hover:text-amber-500'].join(' ')}
                    >
                      🔔
                    </button>
                    {/* 날씨 fetch 버튼 — prop.value(날짜)가 있을 때만 표시 */}
                    {prop.value && (
                      <button
                        type="button"
                        onClick={() => fetchWeatherForProp(prop, city)}
                        disabled={loading || !city}
                        title={city ? t.property.weatherFetch.replace('{city}', city) : t.property.weatherNoCity}
                        className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-stone-50 text-stone-500 border border-stone-200 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
                      >
                        {loading ? <span className="animate-pulse">{t.property.weatherLoading}</span> : <>🌤️ {wx ? t.property.weatherRefresh : t.property.weatherView}</>}
                      </button>
                    )}
                  </div>

                  {/* 날씨 결과 표시 */}
                  {wx?.icon && (
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-stone-50 border border-stone-200/80 rounded-lg w-fit dark:bg-stone-800 dark:border-stone-700">
                      <span className="text-xl leading-none">{wx.icon}</span>
                      <div>
                        <div className="text-xs font-semibold text-gray-700">{wx.tempMin}° / {wx.tempMax}°C</div>
                        <div className="text-[10px] text-gray-400">{wx.location}</div>
                      </div>
                      {/* 날씨 지우기 */}
                      <button
                        type="button"
                        onClick={() => setPageProperty(pageId, { ...prop, weatherData: undefined })}
                        className="text-gray-200 hover:text-gray-400 text-xs ml-1 transition-colors"
                        title={t.property.weatherClear}
                      >✕</button>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── 시간 블록 타입 ──
                value 형식: 'HH:MM-HH:MM' (예: '09:00-10:30')
                두 개의 time input으로 시작/종료 시간 분리 편집
                Python으로 치면: start, end = prop.value.split('-') if '-' in prop.value else ('', '')
            */}
            {prop.type === 'time' && (() => {
              // 'HH:MM-HH:MM' → [startTime, endTime] 분리
              const [startTime, endTime] = prop.value?.includes('-')
                ? prop.value.split('-') : [prop.value ?? '', '']
              return (
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    className="text-xs text-gray-600 bg-transparent border border-gray-200/80 rounded-full px-2.5 py-0.5 focus:outline-none focus:border-stone-400 cursor-pointer w-28 dark:border-gray-700 dark:text-gray-300"
                    value={startTime}
                    onChange={e => handleValueChange(prop, `${e.target.value}-${endTime}`)}
                  />
                  <span className="text-xs text-gray-400">~</span>
                  <input
                    type="time"
                    className="text-xs text-gray-600 bg-transparent border border-gray-200/80 rounded-full px-2.5 py-0.5 focus:outline-none focus:border-stone-400 cursor-pointer w-28 dark:border-gray-700 dark:text-gray-300"
                    value={endTime}
                    onChange={e => handleValueChange(prop, `${startTime}-${e.target.value}`)}
                  />
                  {/* 지속 시간 표시 */}
                  {startTime && endTime && (() => {
                    const [sh, sm] = startTime.split(':').map(Number)
                    const [eh, em] = endTime.split(':').map(Number)
                    const dur = (eh * 60 + em) - (sh * 60 + sm)
                    if (dur <= 0) return null
                    const h = Math.floor(dur / 60)
                    const m = dur % 60
                    return (
                      <span className="text-[10px] text-gray-400">
                        {h > 0 ? t.property.durationHour.replace('{h}', String(h)) : ''}{m > 0 ? t.property.durationMin.replace('{m}', String(m)) : ''}
                      </span>
                    )
                  })()}
                </div>
              )
            })()}

            {/* ── 상태 타입 ── */}
            {prop.type === 'status' && (
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleValueChange(prop, opt)}
                    className={[
                      'text-xs px-2.5 py-0.5 rounded-full transition-all',
                      prop.value === opt
                        ? (STATUS_COLOR[opt] ?? 'bg-stone-50 text-stone-500 border border-stone-200') + ' font-medium shadow-sm'
                        : 'bg-transparent text-gray-400 border border-gray-200 hover:bg-stone-50 hover:text-gray-600 dark:border-gray-700 dark:hover:bg-gray-800',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* ── 선택 타입 ── */}
            {prop.type === 'select' && (
              <div>
                {/* 옵션 태그 목록 */}
                <div className="flex flex-wrap gap-1 mb-1">
                  {(prop.options ?? []).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleValueChange(prop, prop.value === opt ? '' : opt)}
                      className={[
                        'text-xs px-2 py-0.5 rounded-full transition-all group/opt flex items-center gap-1',
                        prop.value === opt
                          ? 'bg-stone-200 text-stone-700 font-medium dark:bg-stone-700 dark:text-stone-200'
                          : 'bg-stone-50 text-stone-500 border border-stone-200 hover:bg-stone-100 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400',
                      ].join(' ')}
                    >
                      {opt}
                      {/* 옵션 삭제 × 버튼 (hover 시 표시) */}
                      <span
                        role="button"
                        aria-label={t.property.optionDelete.replace('{opt}', opt)}
                        className="hidden group-hover/opt:inline-block text-gray-400 hover:text-red-500 ml-0.5 leading-none"
                        onClick={e => { e.stopPropagation(); handleRemoveOption(prop, opt) }}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                  {/* 옵션 추가 입력 */}
                  {editingId === prop.id && (
                    <input
                      autoFocus
                      placeholder={t.property.optionPlaceholder}
                      className="text-xs border-b border-gray-300 outline-none bg-transparent px-1 w-20"
                      value={newOption}
                      onChange={e => setNewOption(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddOption(prop)
                        if (e.key === 'Escape') { setNewOption(''); setEditingId(null) }
                      }}
                      onBlur={() => { handleAddOption(prop); setEditingId(null) }}
                    />
                  )}
                  {editingId !== prop.id && (
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-stone-600 px-1"
                      onClick={() => setEditingId(prop.id)}
                    >
                      {t.property.addOption}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── 텍스트 타입 ── */}
            {prop.type === 'text' && (
              <input
                type="text"
                placeholder={t.property.textPlaceholder}
                className="text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none w-full py-0.5"
                value={prop.value}
                onChange={e => handleValueChange(prop, e.target.value)}
              />
            )}

            {/* ── 관계 타입 ──
                value = 쉼표 구분 pageId 목록 (예: "id1,id2")
                Python으로 치면: linked_pages = [store.get(id) for id in value.split(',') if id]
            */}
            {prop.type === 'relation' && (() => {
              // 연결된 페이지 ID 목록 (빈 문자열 제거)
              const linkedIds = prop.value.split(',').map(s => s.trim()).filter(Boolean)
              // ID → 페이지 객체 매핑
              const linkedPages = linkedIds.map(id => pages.find(p => p.id === id)).filter(Boolean)
              // 검색어 기반 후보 페이지 (현재 페이지 제외, 이미 연결된 페이지 제외)
              const searchQuery = (relationSearch[prop.id] ?? '').toLowerCase()
              const candidates = pages
                .filter(p => p.id !== pageId && !linkedIds.includes(p.id))
                .filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery))
                .slice(0, 8)

              return (
                <div ref={relationDropdown === prop.id ? relationRef : null}>
                  {/* 연결된 페이지 칩 목록 */}
                  <div className="flex flex-wrap gap-1 mb-1">
                    {linkedPages.map(p => p && (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-0.5 text-xs bg-stone-100 text-stone-600 border border-stone-200 rounded-full px-2 py-0.5 max-w-32 truncate dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700"
                      >
                        {/* 페이지 아이콘 + 제목 */}
                        <button
                          type="button"
                          title={t.property.navigateTo.replace('{title}', p.title)}
                          className="truncate hover:underline"
                          onClick={() => {
                            setCurrentPage(p.id)
                            onNavigate?.(p.id)
                          }}
                        >
                          {p.icon && <span className="mr-0.5">{p.icon}</span>}
                          {p.title || `(${t.common.untitled})`}
                        </button>
                        {/* 연결 해제 버튼 */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = linkedIds.filter(id => id !== p.id).join(',')
                            handleValueChange(prop, next)
                          }}
                          className="ml-0.5 text-stone-300 hover:text-stone-600 leading-none dark:text-stone-600 dark:hover:text-stone-300"
                          title={t.property.unlinkRelation}
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {/* 페이지 연결 버튼 */}
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-stone-600 px-1"
                      onClick={() => setRelationDropdown(prev => prev === prop.id ? null : prop.id)}
                    >
                      {t.property.addRelation}
                    </button>
                  </div>

                  {/* 페이지 검색 드롭다운 */}
                  {relationDropdown === prop.id && (
                    <div className="mt-1 bg-white/95 dark:bg-gray-900/95 border border-black/8 dark:border-white/8 rounded-xl shadow-md backdrop-blur-sm py-1 z-30 w-56">
                      <input
                        autoFocus
                        placeholder={t.property.relationSearch}
                        className="w-full px-3 py-1.5 text-xs border-b border-gray-100 outline-none"
                        value={relationSearch[prop.id] ?? ''}
                        onChange={e => setRelationSearch(prev => ({ ...prev, [prop.id]: e.target.value }))}
                      />
                      <div className="max-h-40 overflow-y-auto">
                        {candidates.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-400">{t.property.noSearchResults}</p>
                        ) : candidates.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-stone-50 hover:text-stone-800 dark:text-gray-300 dark:hover:bg-stone-800 text-left transition-colors"
                            onMouseDown={e => {
                              e.preventDefault()
                              const next = [...linkedIds, p.id].join(',')
                              handleValueChange(prop, next)
                              setRelationSearch(prev => ({ ...prev, [prop.id]: '' }))
                              setRelationDropdown(null)
                            }}
                          >
                            <span>{p.icon || '📄'}</span>
                            <span className="truncate">{p.title || `(${t.common.untitled})`}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* 삭제 버튼 (hover 시 표시) */}
          <button
            type="button"
            aria-label={t.property.deleteProperty}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs transition-opacity"
            onClick={() => removePageProperty(pageId, prop.id)}
          >
            ✕
          </button>
        </div>
      ))}

      {/* ── "+ 속성 추가" 버튼 + 드롭다운 ── */}
      <div className="relative mt-1.5" ref={addMenuRef}>
        <button
          type="button"
          onClick={() => setShowAddMenu(v => !v)}
          className="text-xs text-gray-400 hover:text-stone-600 flex items-center gap-1 py-0.5 px-1 rounded hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>{t.property.addProperty}</span>
        </button>

        {/* 드롭다운 메뉴 */}
        {showAddMenu && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white/95 dark:bg-gray-900/95 border border-black/8 dark:border-white/8 rounded-xl shadow-md backdrop-blur-sm py-1 min-w-30">
            {PROPERTY_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-stone-50 dark:text-gray-300 dark:hover:bg-stone-800 text-left transition-colors"
                onClick={() => handleAdd(type)}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
