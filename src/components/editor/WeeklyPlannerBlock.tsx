// =============================================
// src/components/editor/WeeklyPlannerBlock.tsx
// 역할: 주간 플래너 블록
//   - 7일 날짜 그리드 + 날씨(자동/수동) + 할 일 인라인 편집
//   - Open-Meteo API (무료, API 키 불필요) 자동 날씨 fetch
//   - 루틴 달성 매트릭스 (DayPlannerBlock done 데이터 집계)
// Python으로 치면: class WeeklyPlannerBlock(QWidget): ...
// =============================================

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { ChevronLeft, ChevronRight, MapPin, RefreshCw, X, Check } from 'lucide-react'
import type { PlannerData } from './DayPlannerBlock'
import { useLocale } from '@/locales'

// ── WMO 날씨 코드 → 이모지 ────────────────────
// Python으로 치면: WMO_ICON: dict[int, str] = { 0: '☀️', ... }
const WMO_ICON: Record<number, string> = {
  0: '☀️',
  1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌧️', 81: '🌧️', 82: '🌧️',
  85: '❄️', 86: '❄️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}
function wmoToIcon(code: number): string {
  return WMO_ICON[code] ?? '🌡️'
}

// ── 수동 날씨 아이콘 목록 ─────────────────────
const WEATHER_ICONS = ['☀️','🌤️','⛅','☁️','🌦️','🌧️','⛈️','❄️','🌫️','🌪️']

// ── 날짜 유틸 ─────────────────────────────────
// Python으로 치면: def format_date(d): return d.strftime('%Y-%m-%d')
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return fmtDate(d)
}
function todayStr(): string { return fmtDate(new Date()) }

// 해당 날짜가 속한 주의 월요일 반환
// Python으로 치면: def monday_of(ds): d = date.fromisoformat(ds); return d - timedelta(days=(d.weekday()))
function getMondayOf(ds: string): string {
  const d = new Date(ds + 'T00:00:00')
  const dow = d.getDay()           // 0=일 ~ 6=토
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return fmtDate(d)
}

// ── 데이터 타입 ───────────────────────────────
// Python으로 치면: @dataclass class WeekTask, WeekDayData, WeeklyPlannerData
interface WeekTask       { id: string; text: string; done: boolean }
interface WeekDayWeather { icon: string; temp: string }
interface WeekDayData    { weather?: WeekDayWeather; tasks: WeekTask[] }

export interface WeeklyPlannerData {
  weekStart: string                      // YYYY-MM-DD (월요일)
  days:      { [date: string]: WeekDayData }
  location?: string                      // 도시명 (Open-Meteo 자동 날씨용)
}

// =============================================
// WeeklyPlannerBlock — 메인 컴포넌트
// =============================================
interface Props { block: Block; pageId: string }

export default function WeeklyPlannerBlock({ block, pageId }: Props) {
  const t = useLocale()
  const updateBlock      = usePageStore(s => s.updateBlock)
  const pages            = usePageStore(s => s.pages)
  // 전역 날씨 위치 설정 — 한 번 저장하면 모든 플래너 블록에서 공유
  // Python으로 치면: global_location = settings_store.weather_location
  const globalLocation   = useSettingsStore(s => s.weatherLocation)
  const setGlobalLocation = useSettingsStore(s => s.setWeatherLocation)
  // 루틴 프리셋을 settingsStore에서 직접 읽음 (block.content와 분리됨)
  const plannerRoutines  = useSettingsStore(s => s.plannerRoutines)

  // ── 콘텐츠 파싱 ──────────────────────────────
  const data: WeeklyPlannerData = useMemo(() => {
    try {
      const p = JSON.parse(block.content || '{}')
      return {
        weekStart: p.weekStart ?? getMondayOf(todayStr()),
        days:      p.days      ?? {},
        location:  p.location  ?? '',
      }
    } catch {
      return { weekStart: getMondayOf(todayStr()), days: {}, location: '' }
    }
  }, [block.content])

  const save = useCallback((next: WeeklyPlannerData) => {
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 이번 주 7개 날짜 ─────────────────────────
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(data.weekStart, i)),
    [data.weekStart]
  )

  // ── 주차 이동 ─────────────────────────────────
  const prevWeek = () => save({ ...data, weekStart: addDays(data.weekStart, -7) })
  const nextWeek = () => save({ ...data, weekStart: addDays(data.weekStart,  7) })
  const goToday  = () => save({ ...data, weekStart: getMondayOf(todayStr()) })

  // ── 날짜 표시 레이블 ──────────────────────────
  const weekLabel = useMemo(() => {
    const end = addDays(data.weekStart, 6)
    const s = new Date(data.weekStart + 'T00:00:00')
    const e = new Date(end            + 'T00:00:00')
    return `${s.getFullYear()} ${s.getMonth()+1}/${s.getDate()} ~ ${e.getMonth()+1}/${e.getDate()}`
  }, [data.weekStart])

  // ── 할 일 CRUD ────────────────────────────────
  function getDayData(date: string): WeekDayData {
    return data.days[date] ?? { tasks: [] }
  }
  function patchDay(date: string, patch: Partial<WeekDayData>) {
    save({ ...data, days: { ...data.days, [date]: { ...getDayData(date), ...patch } } })
  }
  function addTask(date: string, text: string) {
    if (!text.trim()) return
    const day = getDayData(date)
    patchDay(date, { tasks: [...day.tasks, { id: crypto.randomUUID(), text: text.trim(), done: false }] })
  }
  function toggleTask(date: string, id: string) {
    const day = getDayData(date)
    patchDay(date, { tasks: day.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) })
  }
  function deleteTask(date: string, id: string) {
    const day = getDayData(date)
    patchDay(date, { tasks: day.tasks.filter(t => t.id !== id) })
  }

  // ── 날씨 수동 설정 ────────────────────────────
  function setWeather(date: string, w: WeekDayWeather) {
    patchDay(date, { weather: w })
  }

  // ── Open-Meteo 자동 날씨 fetch ────────────────
  // Python으로 치면: async def fetch_weather(city: str): ...
  const [fetchingWeather, setFetchingWeather] = useState(false)
  // 입력창 초기값: 블록 저장값 → 전역 설정값 → 빈 문자열 우선순위
  // Python으로 치면: location_input = data.location or global_location or ''
  const [locationInput,   setLocationInput]   = useState(data.location || globalLocation || '')

  // data.location 또는 globalLocation이 외부에서 변경될 때 입력창 동기화
  // (useState 초기값은 최초 마운트에만 적용되므로 useEffect로 보완)
  // Python으로 치면: @watch('data.location', 'global_location') def sync_input(): location_input = ...
  useEffect(() => {
    if (!showLocInput) setLocationInput(data.location || globalLocation || '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.location, globalLocation])
  const [showLocInput,    setShowLocInput]     = useState(false)
  const [fetchError,      setFetchError]       = useState('')

  async function fetchWeather(city: string) {
    if (!city.trim()) return
    setFetchingWeather(true)
    setFetchError('')
    try {
      // 1단계: 도시명 → 위도/경도 (Open-Meteo Geocoding)
      const geoRes  = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ko&format=json`
      )
      const geoData = await geoRes.json()
      if (!geoData.results?.length) { setFetchError(t.planner.week.cityNotFound); setFetchingWeather(false); return }
      const { latitude, longitude } = geoData.results[0]

      // 2단계: 7일 예보 (weathercode + 최고기온)
      const wRes  = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weathercode,temperature_2m_max&timezone=auto&forecast_days=14`
      )
      const wData = await wRes.json()

      const newDays = { ...data.days }
      ;(wData.daily.time as string[]).forEach((dateStr, i) => {
        if (!weekDates.includes(dateStr)) return
        const day = newDays[dateStr] ?? { tasks: [] }
        newDays[dateStr] = {
          ...day,
          weather: {
            icon: wmoToIcon(wData.daily.weathercode[i]),
            temp: `${Math.round(wData.daily.temperature_2m_max[i])}°`,
          },
        }
      })
      save({ ...data, days: newDays, location: city })
      // 전역 설정에도 저장 → 다른 플래너 블록에서도 재사용
      // Python으로 치면: settings_store.weather_location = city
      setGlobalLocation(city)
    } catch {
      setFetchError(t.planner.week.fetchError)
    }
    setFetchingWeather(false)
  }

  // 최초 마운트 or 주 변경 시 위치가 있으면 자동 fetch
  // 우선순위: 블록 저장 위치 → 전역 설정 위치
  // Python으로 치면: on_week_change: fetch_weather(data.location or global_location)
  useEffect(() => {
    const loc = data.location || globalLocation
    if (loc) fetchWeather(loc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.weekStart])  // 주 변경 시 재fetch

  // ── 루틴 달성 매트릭스 ────────────────────────
  // 모든 페이지의 DayPlannerBlock을 스캔해 이번 주 루틴 완료 여부 집계
  // Python으로 치면: def build_routine_matrix(pages, week_dates): ...
  const routineMatrix = useMemo(() => {
    // 루틴 목록: settingsStore에서 직접 읽음
    // 이벤트: eventsByDate에서 이번 주 날짜 데이터 수집
    const map: Record<string, Record<string, boolean | null>> = {}

    pages.forEach(page => {
      page.blocks.forEach(b => {
        if (b.type !== 'dayplanner') return
        try {
          const d = JSON.parse(b.content || '{}') as PlannerData
          weekDates.forEach(date => {
            const dayEvents = d.eventsByDate?.[date] ?? []
            dayEvents.forEach(ev => {
              const matched = plannerRoutines.find(r => r.title === ev.title && r.start === ev.start)
              if (!matched) return
              if (!map[matched.title]) map[matched.title] = {}
              map[matched.title][date] = ev.done
            })
          })
        } catch {}
      })
    })
    const titles = plannerRoutines.map(r => r.title)
    return { titles, map }
  }, [pages, weekDates, plannerRoutines])

  // ── 인라인 입력 상태 ──────────────────────────
  const [addingDay,    setAddingDay]    = useState<string | null>(null)
  const [newTaskText,  setNewTaskText]  = useState('')
  // 날씨 수동 선택 팝업
  const [wxPickDate,   setWxPickDate]   = useState<string | null>(null)
  const [wxTempInput,  setWxTempInput]  = useState('')

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white select-none w-full overflow-hidden"
      onContextMenu={e => e.stopPropagation()}
    >
      {/* ── 헤더 ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button type="button" onClick={prevWeek}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-bold text-gray-700">📆 {weekLabel}</span>
        <button type="button" onClick={nextWeek}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronRight size={14} />
        </button>
        <button type="button" onClick={goToday}
          className="text-[10px] text-blue-500 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors">
          {t.planner.week.thisWeek}
        </button>
        <div className="flex-1" />

        {/* 날씨 fetch 에러 */}
        {fetchError && <span className="text-[10px] text-red-400">{fetchError}</span>}

        {/* 위치 설정 버튼 */}
        <button type="button"
          onClick={() => { setShowLocInput(v => !v); setLocationInput(data.location ?? '') }}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-500 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
          <MapPin size={11} />
          {data.location || t.planner.week.setLocation}
        </button>

        {/* 날씨 새로고침 */}
        {data.location && (
          <button type="button"
            onClick={() => fetchWeather(data.location!)}
            disabled={fetchingWeather}
            title={t.planner.week.refreshWeather}
            className="text-gray-400 hover:text-blue-500 p-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-40">
            <RefreshCw size={11} className={fetchingWeather ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* ── 위치 입력 바 ──────────────────────── */}
      {showLocInput && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <MapPin size={12} className="text-blue-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder={t.planner.week.cityPlaceholder}
            value={locationInput}
            onChange={e => setLocationInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { fetchWeather(locationInput); setShowLocInput(false) }
              if (e.key === 'Escape') setShowLocInput(false)
            }}
            className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700"
          />
          <button type="button"
            onClick={() => { fetchWeather(locationInput); setShowLocInput(false) }}
            className="text-[10px] bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded transition-colors">
            {fetchingWeather ? '...' : t.planner.week.fetchWeatherBtn}
          </button>
          <button type="button" onClick={() => setShowLocInput(false)}
            className="text-gray-300 hover:text-gray-500 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── 7일 그리드 ───────────────────────── */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDates.map((date, i) => {
          const dayData = getDayData(date)
          const isToday = date === todayStr()
          const dow     = new Date(date + 'T00:00:00').getDay()
          const isSat   = dow === 6
          const isSun   = dow === 0

          return (
            <div key={date}
              className={['flex flex-col border-r last:border-r-0 border-gray-100', isToday ? 'bg-blue-50/40' : ''].join(' ')}>

              {/* 날짜 헤더 */}
              <div className={['text-center px-1 py-2 border-b border-gray-100', isToday ? 'bg-blue-100' : 'bg-gray-50'].join(' ')}>
                <div className={['text-[11px] font-bold',
                  isToday ? 'text-blue-600' : isSat ? 'text-blue-500' : isSun ? 'text-red-500' : 'text-gray-500',
                ].join(' ')}>
                  {t.planner.week.days[i]}
                </div>
                <div className={['text-sm font-bold', isToday ? 'text-blue-700' : 'text-gray-700'].join(' ')}>
                  {new Date(date + 'T00:00:00').getDate()}
                </div>
                {isToday && <div className="text-[8px] text-blue-500 font-semibold">{t.planner.week.today}</div>}
              </div>

              {/* 날씨 — 클릭 시 수동 선택 팝업 */}
              <div
                className="text-center px-1 py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setWxPickDate(wxPickDate === date ? null : date)
                  setWxTempInput(dayData.weather?.temp?.replace('°','') ?? '')
                }}
                title={t.planner.week.clickToSetWeather}
              >
                {dayData.weather ? (
                  <>
                    <div className="text-lg leading-none">{dayData.weather.icon}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5 font-medium">{dayData.weather.temp}</div>
                  </>
                ) : (
                  <div className="text-[10px] text-gray-200 py-1">─</div>
                )}
              </div>

              {/* 할 일 목록 — 고정 높이 + 스크롤 */}
              {/* 목록 영역: 최대 높이 고정, 항목 많으면 스크롤바 */}
              <div className="px-1.5 pt-1.5 overflow-y-auto max-h-28 space-y-1.5 scrollbar-thin">
                {dayData.tasks.map(task => (
                  <div key={task.id} className="flex items-start gap-1 group">
                    <button type="button"
                      onClick={() => toggleTask(date, task.id)}
                      className={[
                        'shrink-0 w-3.5 h-3.5 mt-0.5 rounded border transition-all flex items-center justify-center',
                        task.done ? 'bg-emerald-400 border-emerald-400' : 'border-gray-300 hover:border-blue-400',
                      ].join(' ')}>
                      {task.done && <Check size={9} className="text-white" strokeWidth={3} />}
                    </button>
                    {/* text-xs (12px) — 기존 text-[10px]에서 크게 */}
                    <span className={[
                      'text-xs leading-snug flex-1 wrap-break-word',
                      task.done ? 'line-through text-gray-300' : 'text-gray-600',
                    ].join(' ')}>
                      {task.text}
                    </span>
                    <button type="button"
                      onClick={() => deleteTask(date, task.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-200 hover:text-red-400 shrink-0 transition-all">
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>

              {/* + 추가 버튼 / 인라인 입력 — 스크롤 영역 밖에 고정 */}
              <div className="px-1.5 pb-1.5 pt-1 border-t border-gray-50">
                {addingDay === date ? (
                  <input
                    autoFocus
                    type="text"
                    value={newTaskText}
                    onChange={e => setNewTaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        addTask(date, newTaskText)
                        setNewTaskText('')
                        if (!e.shiftKey) setAddingDay(null)
                      }
                      if (e.key === 'Escape') { setAddingDay(null); setNewTaskText('') }
                    }}
                    onBlur={() => {
                      if (newTaskText.trim()) addTask(date, newTaskText)
                      setAddingDay(null); setNewTaskText('')
                    }}
                    placeholder={t.planner.week.taskPlaceholder}
                    className="w-full text-xs border-b border-blue-300 outline-none bg-transparent text-gray-700 py-0.5"
                  />
                ) : (
                  <button type="button"
                    onClick={() => setAddingDay(date)}
                    className="w-full text-left text-xs text-gray-300 hover:text-blue-400 transition-colors py-0.5">
                    {t.planner.week.addBtn}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 날씨 수동 선택 팝업 ───────────────── */}
      {wxPickDate && (
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-gray-500 font-medium shrink-0">
            {t.planner.week.weatherOf.replace('{month}', String(new Date(wxPickDate + 'T00:00:00').getMonth()+1)).replace('{day}', String(new Date(wxPickDate + 'T00:00:00').getDate()))}
          </span>
          <div className="flex gap-1 flex-wrap">
            {WEATHER_ICONS.map(icon => (
              <button key={icon} type="button"
                onClick={() => {
                  const cur = getDayData(wxPickDate).weather
                  setWeather(wxPickDate, { icon, temp: cur?.temp ?? '' })
                }}
                className={[
                  'text-xl w-8 h-8 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center',
                  getDayData(wxPickDate).weather?.icon === icon ? 'bg-blue-100 ring-1 ring-blue-300' : '',
                ].join(' ')}>
                {icon}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder={t.planner.week.tempPlaceholder}
              value={wxTempInput}
              onChange={e => setWxTempInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const icon = getDayData(wxPickDate).weather?.icon ?? '🌡️'
                  setWeather(wxPickDate, { icon, temp: wxTempInput ? `${wxTempInput}°` : '' })
                  setWxPickDate(null)
                }
              }}
              className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400"
            />
            <span className="text-xs text-gray-400">°C</span>
            <button type="button"
              onClick={() => {
                const icon = getDayData(wxPickDate).weather?.icon ?? '🌡️'
                setWeather(wxPickDate, { icon, temp: wxTempInput ? `${wxTempInput}°` : '' })
                setWxPickDate(null)
              }}
              className="text-[10px] bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg transition-colors">
              {t.planner.week.confirm}
            </button>
            <button type="button" onClick={() => setWxPickDate(null)}
              className="text-gray-300 hover:text-gray-500 p-1 transition-colors">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── 루틴 달성 매트릭스 ─────────────────── */}
      {routineMatrix.titles.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[11px] font-semibold text-gray-500 mb-2">{t.planner.week.routineTitle}</div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-[10px] text-gray-400 font-medium pb-1.5 pr-4 min-w-20">{t.planner.week.routineHeader}</th>
                  {weekDates.map((date, i) => {
                    const dow = new Date(date + 'T00:00:00').getDay()
                    return (
                      <th key={date} className={[
                        'text-center text-[10px] font-medium pb-1.5 w-9',
                        date === todayStr() ? 'text-blue-500' : dow === 6 ? 'text-blue-400' : dow === 0 ? 'text-red-400' : 'text-gray-400',
                      ].join(' ')}>
                        {t.planner.week.days[i]}
                      </th>
                    )
                  })}
                  <th className="text-center text-[10px] text-gray-400 font-medium pb-1.5 pl-2">{t.planner.week.achieveHeader}</th>
                </tr>
              </thead>
              <tbody>
                {routineMatrix.titles.map(title => {
                  const doneCount = weekDates.filter(d => routineMatrix.map[title]?.[d] === true).length
                  const totalSet  = weekDates.filter(d => routineMatrix.map[title]?.[d] !== undefined).length
                  return (
                    <tr key={title} className="border-t border-gray-50">
                      <td className="text-[10px] text-gray-600 pr-4 py-1.5 truncate max-w-24">{title}</td>
                      {weekDates.map(date => {
                        const status = routineMatrix.map[title]?.[date]
                        return (
                          <td key={date} className="text-center py-1.5">
                            {status === true  ? <span className="text-emerald-400 text-sm">✅</span>
                           : status === false ? <span className="text-red-300 text-xs font-bold">✗</span>
                           :                    <span className="text-gray-200 text-xs">─</span>}
                          </td>
                        )
                      })}
                      {/* 달성률 */}
                      <td className="text-center py-1.5 pl-2">
                        <span className={[
                          'text-[10px] font-semibold',
                          totalSet === 0 ? 'text-gray-300'
                            : doneCount / totalSet >= 0.8 ? 'text-emerald-500'
                            : doneCount / totalSet >= 0.5 ? 'text-amber-500'
                            : 'text-red-400',
                        ].join(' ')}>
                          {totalSet > 0 ? `${doneCount}/${totalSet}` : '─'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
