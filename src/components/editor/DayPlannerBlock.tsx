// =============================================
// src/components/editor/DayPlannerBlock.tsx
// 역할: Day Planner 인라인 타임라인 블록 (A안)
//   - 페이지 안에 /일정표 슬래시 커맨드로 삽입
//   - 6:00~23:00 시간 축에 이벤트 블록 시각화
//   - 빈 슬롯 클릭 → 인라인 이벤트 생성 폼
//   - 이벤트 클릭 → 수정/삭제 팝업
//   - 현재 시각 표시선 (실시간 1분 갱신)
// Python으로 치면: class DayPlannerBlock(QWidget): ...
// =============================================

'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { Plus, Trash2, ChevronLeft, ChevronRight, Check, X, Bot } from 'lucide-react'
import AIChatPanel, { ChatMsg } from '@/components/ai/AIChatPanel'

// ── 모듈 레벨: 마지막 활성 DayPlannerBlock ID ─────
// GlobalAIChatButton의 'ai-apply-schedule' 이벤트를 처리할 블록 결정
// Python으로 치면: _active_planner_id: str | None = None
let _activePlannerBlockId: string | null = null

// ── 이벤트 컬러 팔레트 ────────────────────────
// Python으로 치면: COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'gray']
const EVENT_COLORS = [
  // 기본 계열
  { id: 'blue',     bg: 'bg-blue-400',     text: 'text-white', dot: 'bg-blue-400'     },
  { id: 'sky',      bg: 'bg-sky-400',      text: 'text-white', dot: 'bg-sky-400'      },
  { id: 'cyan',     bg: 'bg-cyan-400',     text: 'text-white', dot: 'bg-cyan-400'     },
  { id: 'teal',     bg: 'bg-teal-400',     text: 'text-white', dot: 'bg-teal-400'     },
  { id: 'green',    bg: 'bg-emerald-400',  text: 'text-white', dot: 'bg-emerald-400'  },
  { id: 'lime',     bg: 'bg-lime-400',     text: 'text-gray-800', dot: 'bg-lime-400'  },
  // 따뜻한 계열
  { id: 'yellow',   bg: 'bg-yellow-400',   text: 'text-gray-800', dot: 'bg-yellow-400'},
  { id: 'amber',    bg: 'bg-amber-400',    text: 'text-white', dot: 'bg-amber-400'    },
  { id: 'orange',   bg: 'bg-orange-400',   text: 'text-white', dot: 'bg-orange-400'   },
  { id: 'red',      bg: 'bg-rose-400',     text: 'text-white', dot: 'bg-rose-400'     },
  { id: 'pink',     bg: 'bg-pink-400',     text: 'text-white', dot: 'bg-pink-400'     },
  // 보라/중성 계열
  { id: 'fuchsia',  bg: 'bg-fuchsia-400',  text: 'text-white', dot: 'bg-fuchsia-400'  },
  { id: 'purple',   bg: 'bg-violet-400',   text: 'text-white', dot: 'bg-violet-400'   },
  { id: 'indigo',   bg: 'bg-indigo-400',   text: 'text-white', dot: 'bg-indigo-400'   },
  { id: 'slate',    bg: 'bg-slate-400',    text: 'text-white', dot: 'bg-slate-400'    },
  { id: 'gray',     bg: 'bg-gray-400',     text: 'text-white', dot: 'bg-gray-400'     },
]
function getColor(id: string) {
  return EVENT_COLORS.find(c => c.id === id) ?? EVENT_COLORS[0]
}

// ── AI 시스템 프롬프트 ────────────────────────
// export: GlobalAIChatButton의 일정 모드에서 동일 프롬프트 재사용
// Python으로 치면: PLANNER_SYSTEM_PROMPT: str = "..."
export const PLANNER_SYSTEM_PROMPT = `당신은 일정 관리 전문 AI 어시스턴트입니다.
사용자의 요청을 분석해 아래 JSON 형식으로 일정을 제안하세요.

## 응답 규칙
- 일정 추가/변경 제안 시 반드시 JSON 코드블록을 포함하세요.
- 설명 텍스트는 JSON 앞뒤에 자유롭게 써도 됩니다.
- 일정이 없는 질문(인사, 조언 요청 등)은 JSON 없이 자연어로 답하세요.

## JSON 형식
\`\`\`json
{
  "action": "add" | "replace",
  "events": [
    { "title": "일정 제목", "start": "HH:MM", "end": "HH:MM", "color": "컬러ID" }
  ]
}
\`\`\`

## action 설명
- add: 기존 일정에 추가
- replace: 기존 일정 전체를 새 목록으로 교체

## 사용 가능한 color 값
blue, sky, cyan, teal, green, lime, yellow, amber, orange, red, pink, fuchsia, purple, indigo, slate, gray

## 주의사항
- 시간은 반드시 HH:MM 24시간 형식 (예: 09:00, 14:30)
- 현재 일정 컨텍스트를 참고해 겹치지 않도록 제안하세요
- 휴식, 식사, 운동 등 루틴 일정도 제안할 수 있습니다`

// ── 타임라인 설정 ─────────────────────────────
// Python으로 치면: START_HOUR = 6; END_HOUR = 23; HOUR_PX = 60
const START_HOUR = 0    // 표시 시작 시각
const END_HOUR   = 24   // 표시 종료 시각
const HOUR_PX    = 64   // 1시간당 픽셀 높이

// ── 이벤트 데이터 타입 ───────────────────────
// Python으로 치면: @dataclass class PlanEvent: id, title, start, end, color, done
export interface PlanEvent {
  id:    string
  title: string
  start: string   // 'HH:MM'
  end:   string   // 'HH:MM'
  color: string   // EVENT_COLORS의 id
  done:  boolean
}

// ── 루틴 데이터 타입 ──────────────────────────
// Python으로 치면: @dataclass class Routine: id, title, start, end, color, days
// days: 0=일 1=월 2=화 3=수 4=목 5=금 6=토, 빈 배열 = 매일
export interface Routine {
  id:    string
  title: string
  start: string   // 'HH:MM'
  end:   string   // 'HH:MM'
  color: string
  days:  number[] // 요일 배열
}

// ── DayPlannerBlock 콘텐츠 JSON 구조 ─────────
// Python으로 치면: @dataclass class PlannerData: date, events, routines, autoApply
export interface PlannerData {
  date:        string     // 'YYYY-MM-DD'
  events:      PlanEvent[]
  routines:    Routine[]  // 루틴 프리셋 목록
  autoApply:   boolean    // true: 빈 날 이동 시 루틴 자동 적용
}

// ── WMO 날씨 코드 → 이모지 (Open-Meteo 공통) ──
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

// ── 요일 레이블 ────────────────────────────────
const DAY_LABELS = ['일','월','화','수','목','금','토']

// ── 오늘 날짜 문자열 반환 ─────────────────────
// Python으로 치면: def today_str(): return datetime.today().strftime('%Y-%m-%d')
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── 'HH:MM' → 분(minutes) 변환 ───────────────
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return isNaN(h) ? -1 : h * 60 + m
}

// ── 분 → 'HH:MM' 변환 ────────────────────────
function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

// ── 이벤트 top/height (px) 계산 ──────────────
// Python으로 치면: def event_px(event): top = (start_min - start_hour*60) * px_per_min
function eventPx(event: PlanEvent): { top: number; height: number } | null {
  const startMin = timeToMin(event.start)
  const endMin   = timeToMin(event.end)
  if (startMin < 0 || endMin <= startMin) return null
  const baseMin    = START_HOUR * 60
  const pxPerMin   = HOUR_PX / 60
  return {
    top:    Math.max(0, (startMin - baseMin) * pxPerMin),
    height: Math.max(24, (endMin - startMin) * pxPerMin),
  }
}

// ── 겹치는 이벤트 레이아웃 계산 (주석은 CalendarOverlay와 동일 패턴) ──
interface LayoutEvent { event: PlanEvent; top: number; height: number; col: number; totalCols: number }
function layoutEvents(events: PlanEvent[]): LayoutEvent[] {
  const items = events
    .map(ev => { const px = eventPx(ev); return px ? { event: ev, ...px } : null })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.top - b.top)

  const columns: { event: PlanEvent; top: number; height: number; end: number }[][] = []
  for (const item of items) {
    let placed = false
    for (const col of columns) {
      if (col[col.length - 1].end <= item.top) {
        col.push({ ...item, end: item.top + item.height })
        placed = true
        break
      }
    }
    if (!placed) columns.push([{ ...item, end: item.top + item.height }])
  }

  const result: LayoutEvent[] = []
  columns.forEach((col, colIdx) => {
    for (const item of col) {
      const overlapping = columns.filter(c =>
        c.some(b => b.top < item.top + item.height && b.end > item.top)
      ).length
      result.push({ event: item.event, top: item.top, height: item.height, col: colIdx, totalCols: overlapping })
    }
  })
  return result
}

// ── 클릭 Y좌표 → 시간 변환 ────────────────────
// Python으로 치면: def y_to_time(y): return min_to_time(start_hour*60 + y/px_per_min)
function yToTime(y: number): string {
  const min = START_HOUR * 60 + Math.round(y / (HOUR_PX / 60) / 15) * 15
  return minToTime(Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, min)))
}


// =============================================
// RoutineForm — 루틴 추가/수정 인라인 폼 컴포넌트
// Python으로 치면: class RoutineForm(QWidget): ...
// =============================================
interface RoutineFormProps {
  form:         Routine
  onChange:     (r: Routine) => void
  onToggleDay:  (day: number) => void
  onSave:       () => void
  onCancel:     () => void
}
function RoutineForm({ form, onChange, onToggleDay, onSave, onCancel }: RoutineFormProps) {
  return (
    <div className="p-3 flex flex-col gap-2">
      {/* 제목 */}
      <input
        autoFocus
        type="text"
        placeholder="루틴 이름 (예: 기상, 운동, 취침)"
        value={form.title}
        onChange={e => onChange({ ...form, title: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 w-full"
      />
      {/* 시간 */}
      <div className="flex items-center gap-2">
        <input type="time" value={form.start}
          onChange={e => onChange({ ...form, start: e.target.value })}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400" />
        <span className="text-xs text-gray-400">~</span>
        <input type="time" value={form.end}
          onChange={e => onChange({ ...form, end: e.target.value })}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400" />
      </div>
      {/* 요일 선택 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 shrink-0">반복 요일</span>
        <div className="flex gap-1">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i} type="button"
              onClick={() => onToggleDay(i)}
              className={[
                'w-6 h-6 rounded-full text-[10px] font-semibold transition-all',
                form.days.includes(i)
                  ? 'bg-emerald-400 text-white'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...form, days: [] })}
            className={[
              'px-1.5 h-6 rounded-full text-[9px] font-semibold transition-all',
              form.days.length === 0
                ? 'bg-emerald-400 text-white'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
            ].join(' ')}
          >
            매일
          </button>
        </div>
      </div>
      {/* 색상 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 shrink-0">색상</span>
        <div className="flex flex-wrap gap-1">
          {EVENT_COLORS.map(c => (
            <button key={c.id} type="button"
              onClick={() => onChange({ ...form, color: c.id })}
              className={['w-4 h-4 rounded-full transition-all shrink-0', c.dot,
                form.color === c.id ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110',
              ].join(' ')} />
          ))}
        </div>
      </div>
      {/* 저장/취소 */}
      <div className="flex gap-2 mt-0.5">
        <button type="button" onClick={onSave}
          className="flex-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1">
          <Check size={11} /> 저장
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          취소
        </button>
      </div>
    </div>
  )
}

// =============================================
// DayPlannerBlock — 메인 컴포넌트
// =============================================
interface DayPlannerBlockProps {
  block:  Block
  pageId: string
}

export default function DayPlannerBlock({ block, pageId }: DayPlannerBlockProps) {
  const updateBlock    = usePageStore(s => s.updateBlock)
  // 전역 날씨 위치 — settingsStore에서 영속 저장된 도시명
  // Python으로 치면: weather_location = settings_store.weather_location
  const weatherLocation = useSettingsStore(s => s.weatherLocation)

  // ── 콘텐츠 파싱 ──────────────────────────────
  // Python으로 치면: data = json.loads(block.content) if block.content else default
  const data: PlannerData = useMemo(() => {
    try {
      const parsed = JSON.parse(block.content || '{}')
      return {
        date:      parsed.date      ?? todayStr(),
        events:    parsed.events    ?? [],
        routines:  parsed.routines  ?? [],
        autoApply: parsed.autoApply ?? true,
      }
    } catch {
      return { date: todayStr(), events: [], routines: [], autoApply: true }
    }
  }, [block.content])

  // ── 콘텐츠 저장 ──────────────────────────────
  // Python으로 치면: def save(data): block.content = json.dumps(data); update_block()
  const save = useCallback((next: PlannerData) => {
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 이벤트 추가/수정/삭제 헬퍼 ───────────────
  const upsertEvent = useCallback((ev: PlanEvent) => {
    const events = data.events.some(e => e.id === ev.id)
      ? data.events.map(e => e.id === ev.id ? ev : e)
      : [...data.events, ev]
    save({ ...data, events })
  }, [data, save])

  const deleteEvent = useCallback((id: string) => {
    save({ ...data, events: data.events.filter(e => e.id !== id) })
  }, [data, save])

  const toggleDone = useCallback((id: string) => {
    const events = data.events.map(e => e.id === id ? { ...e, done: !e.done } : e)
    save({ ...data, events })
  }, [data, save])

  // ── 날씨 상태 — Open-Meteo에서 해당 날짜 날씨 fetch ──
  // Python으로 치면: self.weather: dict | None = None
  const [weather,        setWeather]        = useState<{ icon: string; temp: string } | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // 도시명 + 날짜로 Open-Meteo 1일 날씨 fetch
  // Python으로 치면: async def fetch_day_weather(city, date): ...
  const fetchDayWeather = useCallback(async (city: string, dateStr: string) => {
    if (!city.trim()) return
    setWeatherLoading(true)
    try {
      // 1단계: 도시명 → 위도/경도 (Geocoding)
      const geoRes  = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ko&format=json`
      )
      const geoData = await geoRes.json()
      if (!geoData.results?.length) { setWeatherLoading(false); return }
      const { latitude, longitude } = geoData.results[0]

      // 2단계: 해당 날짜 날씨코드 + 최고기온 (forecast_days 최대 16일)
      const wRes  = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`
      )
      const wData = await wRes.json()
      const idx   = (wData.daily.time as string[]).indexOf(dateStr)
      if (idx === -1) { setWeatherLoading(false); return }

      setWeather({
        icon: wmoToIcon(wData.daily.weathercode[idx]),
        temp: `${Math.round(wData.daily.temperature_2m_min[idx])}°/${Math.round(wData.daily.temperature_2m_max[idx])}°`,
      })
    } catch {
      // 날씨 fetch 실패 시 조용히 무시 (헤더에 표시 안 됨)
    }
    setWeatherLoading(false)
  }, [])

  // 날짜 변경 or weatherLocation 변경 시 자동 fetch
  // Python으로 치면: @watch('data.date', 'weather_location') def on_date_change(): fetch_day_weather()
  useEffect(() => {
    setWeather(null)
    if (weatherLocation) fetchDayWeather(weatherLocation, data.date)
  }, [data.date, weatherLocation, fetchDayWeather])

  // ── 현재 시각 표시선 ──────────────────────────
  const [nowTop, setNowTop] = useState<number | null>(null)
  useEffect(() => {
    function update() {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const baseMin = START_HOUR * 60
      const endMin  = END_HOUR  * 60
      if (nowMin >= baseMin && nowMin <= endMin) {
        setNowTop((nowMin - baseMin) * (HOUR_PX / 60))
      } else {
        setNowTop(null)
      }
    }
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [])

  // ── 인라인 이벤트 생성 폼 상태 ───────────────
  // Python으로 치면: self.new_form = None | { start, end, screenX, screenY }
  // screenX/Y: 클릭한 화면 좌표 → fixed 포지션 폼 배치에 사용 (overflow clipping 방지)
  const [newForm, setNewForm] = useState<{ start: string; end: string; screenX: number; screenY: number } | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const titleInputRef = useRef<HTMLInputElement>(null)
  // applyScheduleRef: 전역 AI 이벤트 핸들러에서 최신 applyAiSchedule 참조 (stale closure 방지)
  // Python으로 치면: self._apply_ref = WeakRef(self.apply_ai_schedule)
  const applyScheduleRef = useRef<(text: string) => string | void>(() => {})

  // ── 이벤트 수정 팝업 상태 ────────────────────
  // Python으로 치면: self.editing_event: PlanEvent | None = None
  const [editingEvent, setEditingEvent] = useState<PlanEvent | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd,   setEditEnd]   = useState('')
  const [editColor, setEditColor] = useState('blue')

  // ── 타임라인 영역 ref (클릭 Y좌표 계산용) ────
  const timelineRef = useRef<HTMLDivElement>(null)
  // ── 블록 전체 영역 ref (fixed 폼 외부 클릭 감지 기준) ──
  const blockRef = useRef<HTMLDivElement>(null)

  // ── 이벤트 드래그 상태 ────────────────────────
  // ref: 렌더 없이 최신값 유지 (mousemove 핸들러 stale closure 방지)
  // Python으로 치면: self.drag_ref = None | { event, startY, origStartMin, duration, currentTop, moved }
  interface DragState {
    event: PlanEvent
    startClientY: number
    origStartMin: number
    duration: number       // 분 단위
    currentTop: number     // 현재 프리뷰 top (px)
    moved: boolean         // 4px 이상 이동 시 true
  }
  const dragRef = useRef<DragState | null>(null)
  const justDraggedRef = useRef(false)  // 드래그 직후 click 이벤트 무시용
  const [draggingId,    setDraggingId]    = useState<string | null>(null)  // 원본 ghost 표시용
  const [dragPreviewTop, setDragPreviewTop] = useState<number | null>(null) // 프리뷰 위치

  // ── 이벤트 블록 mousedown → 드래그 시작 ──────
  // Python으로 치면: def on_event_mousedown(e, ev): drag_ref = { ... }
  function startDrag(e: React.MouseEvent, ev: PlanEvent) {
    e.stopPropagation()
    e.preventDefault()
    const px = eventPx(ev)
    if (!px) return
    dragRef.current = {
      event: ev,
      startClientY: e.clientY,
      origStartMin: timeToMin(ev.start),
      duration: timeToMin(ev.end) - timeToMin(ev.start),
      currentTop: px.top,
      moved: false,
    }
    setDraggingId(ev.id)
    setDragPreviewTop(px.top)
  }

  // ── window mousemove/mouseup 리스너 ──────────
  // Python으로 치면: QApplication.instance().installEventFilter(self)
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const dr = dragRef.current
      if (!dr) return
      const deltaY = e.clientY - dr.startClientY
      if (Math.abs(deltaY) > 4) dr.moved = true
      if (!dr.moved) return
      // 15분 단위 스냅
      const pxPerMin  = HOUR_PX / 60
      const deltaMin  = Math.round(deltaY / pxPerMin / 15) * 15
      const newStartMin = Math.max(
        START_HOUR * 60,
        Math.min(END_HOUR * 60 - dr.duration, dr.origStartMin + deltaMin)
      )
      const newTop = (newStartMin - START_HOUR * 60) * pxPerMin
      dr.currentTop = newTop
      setDragPreviewTop(newTop)
    }

    function onMouseUp() {
      const dr = dragRef.current
      if (!dr) return
      dragRef.current = null
      setDraggingId(null)
      setDragPreviewTop(null)

      if (dr.moved) {
        // 드래그 완료 → 새 시간으로 저장, 뒤따라오는 click 이벤트 차단
        justDraggedRef.current = true
        const pxPerMin    = HOUR_PX / 60
        const newStartMin = Math.round(dr.currentTop / pxPerMin / 15) * 15 + START_HOUR * 60
        const clamped     = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - dr.duration, newStartMin))
        upsertEvent({ ...dr.event, start: minToTime(clamped), end: minToTime(clamped + dr.duration) })
      } else {
        // 클릭 (이동 없음) → 수정 모달 열기
        setEditingEvent(dr.event)
        setEditTitle(dr.event.title)
        setEditStart(dr.event.start)
        setEditEnd(dr.event.end)
        setEditColor(dr.event.color)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [upsertEvent])   // upsertEvent만 의존 — 나머지는 ref/setState로 접근

  // ── 빈 슬롯 클릭 → 폼 열기 ──────────────────
  // Python으로 치면: def on_slot_click(y): new_form = { start: y_to_time(y), end: y_to_time(y+60) }
  // screenX/Y 저장 → fixed 폼이 overflow-y-auto에 잘리지 않도록
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (justDraggedRef.current) { justDraggedRef.current = false; return }
    if (newForm || editingEvent || draggingId) return
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return
    const y     = e.clientY - rect.top
    const start = yToTime(y)
    const startMin = timeToMin(start)
    const end   = minToTime(Math.min(startMin + 60, END_HOUR * 60))
    setNewForm({ start, end, screenX: e.clientX, screenY: e.clientY })
    setNewTitle('')
    setNewColor('blue')
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }

  // ── 새 이벤트 저장 ────────────────────────────
  function handleSaveNew() {
    if (!newForm || !newTitle.trim()) { setNewForm(null); return }
    upsertEvent({
      id:    crypto.randomUUID(),
      title: newTitle.trim(),
      start: newForm.start,
      end:   newForm.end,
      color: newColor,
      done:  false,
    })
    setNewForm(null)
    setNewTitle('')
  }

  // ── 이벤트 클릭 → 수정 팝업 ──────────────────
  function openEdit(ev: PlanEvent) {
    setEditingEvent(ev)
    setEditTitle(ev.title)
    setEditStart(ev.start)
    setEditEnd(ev.end)
    setEditColor(ev.color)
  }

  // ── 수정 저장 ─────────────────────────────────
  function handleSaveEdit() {
    if (!editingEvent) return
    upsertEvent({ ...editingEvent, title: editTitle, start: editStart, end: editEnd, color: editColor })
    setEditingEvent(null)
  }

  // ── 날짜 레이블 포맷 ─────────────────────────
  function formatDate(ds: string): string {
    const d = new Date(ds + 'T00:00:00')
    if (isNaN(d.getTime())) return ds
    const wd = ['일','월','화','수','목','금','토'][d.getDay()]
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${wd})`
  }

  const layoutItems = useMemo(() => layoutEvents(data.events), [data.events])
  const totalHours  = END_HOUR - START_HOUR
  const totalHeight = totalHours * HOUR_PX

  // ── 특정 날짜에 해당하는 루틴 이벤트 생성 ─────
  // Python으로 치면: def routines_for_date(ds): return [r for r in routines if matches_day(r, ds)]
  function routineEventsForDate(ds: string): PlanEvent[] {
    const dow = new Date(ds + 'T00:00:00').getDay() // 0=일~6=토
    return data.routines
      .filter(r => r.days.length === 0 || r.days.includes(dow))
      .map(r => ({
        id:    crypto.randomUUID(),
        title: r.title,
        start: r.start,
        end:   r.end,
        color: r.color,
        done:  false,
      }))
  }

  // ── 이 날에 루틴 수동 적용 ────────────────────
  // Python으로 치면: def apply_routines_today(): events += routines_for_date(date)
  function applyRoutinesToday() {
    const toAdd = routineEventsForDate(data.date)
    if (!toAdd.length) return
    // 중복 제목+시간 건너뜀
    const existing = new Set(data.events.map(e => `${e.title}|${e.start}`))
    const filtered = toAdd.filter(e => !existing.has(`${e.title}|${e.start}`))
    save({ ...data, events: [...data.events, ...filtered] })
  }

  // ── 날짜 변경 — autoApply 시 루틴 자동 삽입 ──
  // Python으로 치면: def change_date(delta): date += delta; if auto_apply and no_events: apply_routines()
  function changeDate(delta: number) {
    const d = new Date(data.date + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    // autoApply ON + 이동할 날짜에 이벤트가 없으면 루틴 자동 적용
    // (현재 events는 이전 날짜 것이므로 새 날짜엔 항상 0 → 루틴 적용)
    const routineEvs = data.autoApply ? (() => {
      const dow = new Date(ds + 'T00:00:00').getDay()
      return data.routines
        .filter(r => r.days.length === 0 || r.days.includes(dow))
        .map(r => ({ id: crypto.randomUUID(), title: r.title, start: r.start, end: r.end, color: r.color, done: false }))
    })() : []
    save({ ...data, date: ds, events: routineEvs })
  }

  // ── 루틴 모달 상태 ───────────────────────────
  // Python으로 치면: self.routine_modal_open: bool = False
  const [routineOpen, setRoutineOpen] = useState(false)

  // 루틴 추가/수정 폼 상태
  // Python으로 치면: self.routine_form: Routine | None = None
  const EMPTY_ROUTINE = (): Routine => ({
    id: '', title: '', start: '09:00', end: '10:00', color: 'blue', days: [1,2,3,4,5],
  })
  const [routineForm, setRoutineForm] = useState<Routine | null>(null)

  // ── 루틴 저장/삭제 헬퍼 ──────────────────────
  function upsertRoutine(r: Routine) {
    const routines = data.routines.some(x => x.id === r.id)
      ? data.routines.map(x => x.id === r.id ? r : x)
      : [...data.routines, { ...r, id: crypto.randomUUID() }]
    save({ ...data, routines })
    setRoutineForm(null)
  }
  function deleteRoutine(id: string) {
    save({ ...data, routines: data.routines.filter(r => r.id !== id) })
  }
  function toggleRoutineDay(day: number) {
    if (!routineForm) return
    const days = routineForm.days.includes(day)
      ? routineForm.days.filter(d => d !== day)
      : [...routineForm.days, day].sort()
    setRoutineForm({ ...routineForm, days })
  }

  // ── AI 패널 상태 ─────────────────────────────
  // Python으로 치면: self.ai_open: bool = False
  const [aiOpen, setAiOpen] = useState(false)
  const [aiHistory, setAiHistory] = useState<ChatMsg[]>([])

  // ── AI 컨텍스트: 현재 날짜 + 이벤트 목록 직렬화 ──
  // Python으로 치면: def get_planner_context(self): return json.dumps(...)
  function getPlannerContext(): string {
    return JSON.stringify({
      date: data.date,
      events: data.events.map(e => ({
        title: e.title, start: e.start, end: e.end, color: e.color, done: e.done,
      })),
    }, null, 2)
  }

  // ── AI 응답 파싱 → 이벤트 적용 ───────────────
  // Python으로 치면: def apply_ai_schedule(self, text: str) -> str | None: ...
  // action: 'add' → 기존 일정에 추가 / 'replace' → 전체 교체
  function applyAiSchedule(text: string): string | void {
    try {
      // JSON 코드블록 또는 순수 JSON 추출
      const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
      if (!match) return '⚠️ JSON 형식을 찾을 수 없습니다.'
      const parsed = JSON.parse(match[1] ?? match[0])
      const rawEvents: Partial<PlanEvent>[] = Array.isArray(parsed) ? parsed : (parsed.events ?? [])
      if (!rawEvents.length) return '⚠️ 이벤트 목록이 비어 있습니다.'

      // 유효성 보정 후 PlanEvent 배열 생성
      const newEvents: PlanEvent[] = rawEvents.map(e => ({
        id:    crypto.randomUUID(),
        title: e.title ?? '새 일정',
        start: e.start ?? '09:00',
        end:   e.end   ?? '10:00',
        color: EVENT_COLORS.some(c => c.id === e.color) ? e.color! : 'blue',
        done:  false,
      }))

      const action = parsed.action ?? 'add'
      if (action === 'replace') {
        save({ ...data, events: newEvents })
      } else {
        save({ ...data, events: [...data.events, ...newEvents] })
      }
      return `✅ ${newEvents.length}개 일정이 적용되었습니다.`
    } catch (err) {
      return `⚠️ 파싱 실패: ${String(err)}`
    }
  }

  // ── 전역 AI → 일정 삽입 연동 ─────────────────
  // 매 렌더마다 최신 applyAiSchedule로 ref 동기화 (stale closure 방지)
  // Python으로 치면: def on_render(self): self._apply_ref.current = self.apply_ai_schedule
  applyScheduleRef.current = applyAiSchedule

  // 마운트 시 이 블록을 전역 활성 플래너로 등록 + 이벤트 리스너 등록
  // GlobalAIChatButton의 📅 모드 '적용' 버튼이 'ai-apply-schedule' 이벤트 발행
  // Python으로 치면: def on_mount(self): global _active; _active = self; window.on('ai-apply-schedule', self._handle)
  useEffect(() => {
    _activePlannerBlockId = block.id
    function handleGlobalSchedule(e: Event) {
      if (_activePlannerBlockId !== block.id) return
      applyScheduleRef.current((e as CustomEvent<string>).detail)
    }
    window.addEventListener('ai-apply-schedule', handleGlobalSchedule)
    return () => {
      window.removeEventListener('ai-apply-schedule', handleGlobalSchedule)
      if (_activePlannerBlockId === block.id) _activePlannerBlockId = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  // ── AI 블록 선택 인디케이터 ──────────────────
  // 전역 AI가 이 블록을 대상으로 선택했을 때 파란 링 + 배지 표시
  // Python으로 치면: self.is_ai_target = False
  const [isAiTarget, setIsAiTarget] = useState(false)
  useEffect(() => {
    function handleSelect(e: Event) {
      const { blockId } = (e as CustomEvent<{ blockId: string; blockType: string }>).detail
      setIsAiTarget(blockId === block.id)
    }
    function handleDeselect() { setIsAiTarget(false) }
    window.addEventListener('ai-block-select', handleSelect)
    window.addEventListener('ai-block-deselect', handleDeselect)
    return () => {
      window.removeEventListener('ai-block-select', handleSelect)
      window.removeEventListener('ai-block-deselect', handleDeselect)
    }
  }, [block.id])

  // ── AI 제안 ghost 미리보기 이벤트 ────────────
  // '적용' 클릭 전 타임라인에 점선으로 미리 표시
  // Python으로 치면: self.pending_events: list[PlanEvent] = []
  const [pendingEvents, setPendingEvents] = useState<PlanEvent[]>([])

  // AI 응답 메시지 → pending 파싱 (채팅에 새 assistant 메시지 올 때마다 호출)
  // Python으로 치면: def on_ai_message(self, text: str): self.pending_events = parse(text)
  function parsePendingFromAi(text: string) {
    try {
      const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/)
      if (!match) { setPendingEvents([]); return }
      const parsed = JSON.parse(match[1] ?? match[0])
      const rawEvents: Partial<PlanEvent>[] = Array.isArray(parsed) ? parsed : (parsed.events ?? [])
      const previews: PlanEvent[] = rawEvents
        .filter(e => e.start && e.end)
        .map(e => ({
          id:    'pending-' + (e.title ?? ''),
          title: e.title ?? '새 일정',
          start: e.start!,
          end:   e.end!,
          color: EVENT_COLORS.some(c => c.id === e.color) ? e.color! : 'blue',
          done:  false,
        }))
      setPendingEvents(previews)
    } catch {
      setPendingEvents([])
    }
  }

  // ── 완료 이벤트 수 ────────────────────────────
  const doneCount = data.events.filter(e => e.done).length

  return (
    <div
      ref={blockRef}
      data-ai-block="dayplanner"
      onClick={() => window.dispatchEvent(new CustomEvent('ai-block-select', { detail: { blockId: block.id, blockType: 'dayplanner' } }))}
      onContextMenu={e => e.stopPropagation()}
      className={`relative rounded-xl border bg-white overflow-hidden select-none w-full transition-shadow ${isAiTarget ? 'border-blue-400 ring-2 ring-blue-400 ring-offset-1 shadow-blue-100 shadow-md' : 'border-gray-200'}`}
    >
      {/* ── AI 대상 배지 ──────────────────────────
          isAiTarget일 때만 표시 — 파란 링과 함께 우상단에 떠있음
          Python으로 치면: if self.is_ai_target: render Badge('🤖 AI 대상') */}
      {isAiTarget && (
        <span className="absolute top-1.5 right-1.5 z-10 text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full pointer-events-none select-none">
          🤖 AI 대상
        </span>
      )}

      {/* ── 헤더 ─────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        {/* 날짜 네비게이션 */}
        <button type="button" onClick={() => changeDate(-1)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <input
          type="date"
          value={data.date}
          onChange={e => save({ ...data, date: e.target.value })}
          className="text-sm font-semibold text-gray-700 bg-transparent border-none outline-none cursor-pointer"
        />
        <span className="text-xs text-gray-400">{formatDate(data.date)}</span>
        {data.date === todayStr() && (
          <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">오늘</span>
        )}
        <button type="button" onClick={() => changeDate(1)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors">
          <ChevronRight size={14} />
        </button>

        {/* 날씨 표시 — weatherLocation 설정 시 Open-Meteo에서 자동 fetch */}
        {weatherLoading && (
          <span className="text-xs text-gray-300 animate-pulse">날씨 로딩...</span>
        )}
        {!weatherLoading && weather && (
          <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            <span className="text-base leading-none">{weather.icon}</span>
            <span className="font-medium">{weather.temp}</span>
          </span>
        )}

        <div className="flex-1" />

        {/* 이벤트 수 / 완료 수 */}
        <span className="text-xs text-gray-400">
          {doneCount}/{data.events.length} 완료
        </span>

        {/* 오늘로 이동 */}
        {data.date !== todayStr() && (
          <button type="button" onClick={() => save({ ...data, date: todayStr() })}
            className="text-[10px] text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded transition-colors">
            오늘
          </button>
        )}

        {/* 루틴 관리 버튼 */}
        <button
          type="button"
          onClick={() => setRoutineOpen(v => !v)}
          title="반복 루틴 관리"
          className={[
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
            routineOpen
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200',
          ].join(' ')}
        >
          🔄 루틴
        </button>

        {/* AI 패널 토글 버튼 — 아이콘 + 텍스트 */}
        <button
          type="button"
          onClick={() => setAiOpen(v => !v)}
          title="AI 일정 도우미 (일정 추가·분석·최적화)"
          className={[
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
            aiOpen
              ? 'bg-violet-500 text-white shadow-sm'
              : 'text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200',
          ].join(' ')}
        >
          <Bot size={13} />
          AI 도우미
        </button>
      </div>

      <div className="flex">

        {/* ── 타임라인 영역 ─────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: '520px' }}>
          <div className="flex">

            {/* 시간 레이블 열 */}
            <div className="w-12 shrink-0 relative" style={{ height: totalHeight }}>
              {Array.from({ length: totalHours + 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute text-[10px] text-gray-400 text-right pr-2 leading-none"
                  style={{ top: i === 0 ? 2 : i * HOUR_PX - 6, right: 0, width: '100%' }}
                >
                  {String(START_HOUR + i).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* 타임라인 그리드 + 이벤트 */}
            <div
              ref={timelineRef}
              onClick={handleTimelineClick}
              className="flex-1 relative border-l border-gray-200 cursor-cell"
              style={{ height: totalHeight }}
            >
              {/* 시간 그리드 선 */}
              {Array.from({ length: totalHours }, (_, i) => (
                <div key={i} className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ top: i * HOUR_PX }} />
              ))}
              {/* 30분 점선 */}
              {Array.from({ length: totalHours }, (_, i) => (
                <div key={`half-${i}`} className="absolute left-0 right-0 border-t border-dashed border-gray-50"
                  style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
              ))}

              {/* 현재 시각 표시선 */}
              {nowTop !== null && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: nowTop }}>
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                  <div className="flex-1 border-t-2 border-red-400" />
                </div>
              )}

              {/* 이벤트 블록 — mousedown으로 드래그 시작, 클릭(이동 없음)은 수정 모달 */}
              {layoutItems.map((li, idx) => {
                const c          = getColor(li.event.color)
                const widthPct   = 100 / li.totalCols
                const leftPct    = li.col * widthPct
                const isDragging = draggingId === li.event.id
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={e => startDrag(e, li.event)}
                    style={{
                      position: 'absolute',
                      top:    li.top + 1,
                      height: li.height - 2,
                      left:   `calc(${leftPct}% + 2px)`,
                      width:  `calc(${widthPct}% - 4px)`,
                      cursor: isDragging ? 'grabbing' : 'grab',
                    }}
                    className={[
                      'rounded-lg text-left px-2 overflow-hidden flex flex-col justify-start z-10 shadow-sm',
                      c.bg, c.text,
                      isDragging ? 'opacity-30' : 'hover:brightness-110',
                      li.event.done ? 'opacity-50' : '',
                    ].join(' ')}
                  >
                    <span className={[
                      'text-[11px] font-semibold truncate leading-tight mt-0.5',
                      li.event.done ? 'line-through opacity-70' : '',
                    ].join(' ')}>
                      {li.event.title}
                    </span>
                    {li.height > 32 && (
                      <span className="text-[9px] opacity-80 leading-tight">
                        {li.event.start} – {li.event.end}
                      </span>
                    )}
                  </button>
                )
              })}

              {/* 드래그 프리뷰 — 실제 이벤트 위치에 따라 이동 */}
              {draggingId && dragPreviewTop !== null && (() => {
                const draggedEv = data.events.find(e => e.id === draggingId)
                if (!draggedEv) return null
                const px = eventPx(draggedEv)
                if (!px) return null
                const c = getColor(draggedEv.color)
                const previewStartMin = Math.round(dragPreviewTop / (HOUR_PX / 60) / 15) * 15 + START_HOUR * 60
                const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - (timeToMin(draggedEv.end) - timeToMin(draggedEv.start)), previewStartMin))
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top:    dragPreviewTop + 1,
                      height: px.height - 2,
                      left: 2, right: 2,
                      zIndex: 25,
                      pointerEvents: 'none',
                    }}
                    className={['rounded-lg px-2 overflow-hidden flex flex-col justify-start shadow-lg ring-2 ring-white/60', c.bg, c.text].join(' ')}
                  >
                    <span className="text-[11px] font-semibold truncate leading-tight mt-0.5">
                      {draggedEv.title}
                    </span>
                    {px.height > 32 && (
                      <span className="text-[9px] opacity-80 leading-tight">
                        {minToTime(clamped)} – {minToTime(clamped + timeToMin(draggedEv.end) - timeToMin(draggedEv.start))}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* AI 제안 ghost 미리보기 — 점선 테두리로 타임라인에 표시 */}
              {pendingEvents.map((ev, idx) => {
                const px = eventPx(ev)
                if (!px) return null
                const c = getColor(ev.color)
                return (
                  <div
                    key={`pending-${idx}`}
                    style={{
                      position: 'absolute',
                      top: px.top + 1,
                      height: px.height - 2,
                      left: 2, right: 2,
                      zIndex: 8,
                      pointerEvents: 'none',
                    }}
                    className={['rounded-lg px-2 flex flex-col justify-start border-2 border-dashed border-violet-400 bg-violet-50 opacity-70', c.text].join(' ')}
                  >
                    <span className="text-[10px] font-semibold text-violet-700 truncate leading-tight mt-0.5">
                      ✨ {ev.title}
                    </span>
                    {px.height > 28 && (
                      <span className="text-[9px] text-violet-500 leading-tight">{ev.start} – {ev.end}</span>
                    )}
                  </div>
                )
              })}

              {/* 새 이벤트 폼은 overflow 밖 fixed 위치로 렌더링 — 아래 참고 */}
            </div>
          </div>
        </div>

        {/* ── 오른쪽: 이벤트 목록 패널 ─────────── */}
        <div className="w-52 border-l border-gray-200 flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-500">일정 목록</span>
            <button type="button"
              onClick={(e) => {
                const h = new Date().getHours()
                const start = `${String(Math.max(START_HOUR, h)).padStart(2,'0')}:00`
                const end   = `${String(Math.min(END_HOUR, h+1)).padStart(2,'0')}:00`
                setNewForm({ start, end, screenX: e.clientX, screenY: e.clientY })
                setNewTitle('')
                setNewColor('blue')
                setTimeout(() => titleInputRef.current?.focus(), 50)
              }}
              className="text-gray-400 hover:text-blue-500 p-0.5 rounded hover:bg-blue-50 transition-colors"
              title="새 일정 추가">
              <Plus size={13} />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {data.events.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center mt-6 px-3">
                타임라인을 클릭해서<br />일정을 추가하세요
              </p>
            ) : (
              [...data.events]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map(ev => {
                  const c = getColor(ev.color)
                  return (
                    <div key={ev.id}
                      className="flex items-start gap-2 px-3 py-2 border-b border-gray-50 group hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => openEdit(ev)}
                    >
                      {/* 완료 토글 버튼 */}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); toggleDone(ev.id) }}
                        className={[
                          'shrink-0 w-4 h-4 rounded border mt-0.5 flex items-center justify-center transition-all',
                          ev.done ? `${c.bg} border-transparent` : 'border-gray-300 hover:border-blue-400',
                        ].join(' ')}>
                        {ev.done && <Check size={10} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={['text-[11px] font-medium text-gray-700 truncate', ev.done ? 'line-through text-gray-400' : ''].join(' ')}>
                          {ev.title}
                        </div>
                        <div className="text-[10px] text-gray-400">{ev.start} – {ev.end}</div>
                      </div>
                      {/* 삭제 버튼 (hover 시) */}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); deleteEvent(ev.id) }}
                        className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 text-gray-300 hover:text-red-500 rounded transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                })
            )}
          </div>
        </div>

        {/* ── AI 일정 도우미 패널 (sidebar 모드) ─────
            aiOpen=true 일 때 이벤트 목록 패널 오른쪽에 붙어서 표시
            onApply: JSON 파싱 → 이벤트 적용
            onHistoryChange: 채팅 히스토리 유지 (패널 닫아도 대화 유지)
            context: 현재 날짜+이벤트 실시간 전달 (함수 형태로 매 요청 시 최신값)
        ────────────────────────────────────── */}
        {/* AI 패널은 floating 모드 — 글로벌 AI 패널(Ctrl+I)과 동일한 UX */}
      </div>

      {/* ── 새 이벤트 폼 (fixed — overflow clipping 방지) ──────────────
          타임라인 클릭 또는 + 버튼 클릭 좌표 기준으로 화면 안에 배치
          Python으로 치면: form_window.setGeometry(x, y, 240, auto)
      ────────────────────────────────────────────────────────── */}
      {newForm && (() => {
        // 폼 크기 (w-60 = 240px, 예상 높이 약 170px)
        const FORM_W = 248
        const FORM_H = 175
        // 화면 밖으로 나가지 않도록 보정
        const rawLeft = newForm.screenX + 8
        const rawTop  = newForm.screenY + 8
        const left = Math.min(rawLeft, window.innerWidth  - FORM_W - 8)
        const top  = rawTop + FORM_H > window.innerHeight - 8
          ? newForm.screenY - FORM_H - 4
          : rawTop
        return (
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', top, left, width: FORM_W, zIndex: 9999 }}
            className="bg-white border-2 border-blue-400 rounded-xl shadow-xl p-3 flex flex-col gap-2"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-600">새 일정</span>
              <button type="button" onClick={() => setNewForm(null)}
                className="text-gray-300 hover:text-gray-500 p-0.5 rounded transition-colors">
                <X size={12} />
              </button>
            </div>
            {/* 제목 입력 */}
            <input
              ref={titleInputRef}
              type="text"
              placeholder="일정 이름..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveNew()
                if (e.key === 'Escape') setNewForm(null)
              }}
              className="text-xs font-medium text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 w-full"
            />
            {/* 시간 범위 */}
            <div className="flex items-center gap-1.5">
              <input type="time" value={newForm.start}
                onChange={e => setNewForm(f => f ? { ...f, start: e.target.value } : f)}
                className="flex-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400" />
              <span className="text-xs text-gray-400 shrink-0">~</span>
              <input type="time" value={newForm.end}
                onChange={e => setNewForm(f => f ? { ...f, end: e.target.value } : f)}
                className="flex-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400" />
            </div>
            {/* 컬러 선택 — flex-wrap으로 2행 표시 */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400">색상</span>
              <div className="flex flex-wrap gap-1">
                {EVENT_COLORS.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => setNewColor(c.id)}
                    className={['w-4 h-4 rounded-full transition-all shrink-0', c.dot, newColor === c.id ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'].join(' ')} />
                ))}
              </div>
            </div>
            {/* 저장/취소 버튼 */}
            <div className="flex gap-1.5 mt-0.5">
              <button type="button" onClick={handleSaveNew}
                className="flex-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1">
                <Check size={11} /> 저장
              </button>
              <button type="button" onClick={() => setNewForm(null)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                취소
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── 루틴 관리 모달 ──────────────────────────
          루틴 목록 + 추가/수정/삭제 + 자동 적용 토글
          Python으로 치면: class RoutineModal(QDialog): ...
      ─────────────────────────────────────────── */}
      {routineOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setRoutineOpen(false); setRoutineForm(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-120 max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-800">🔄 반복 루틴 관리</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">요일마다 자동으로 채워지는 고정 일정</p>
              </div>
              {/* 자동 적용 토글 */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500">날짜 이동 시 자동 적용</span>
                <button
                  type="button"
                  onClick={() => save({ ...data, autoApply: !data.autoApply })}
                  className={[
                    'w-9 h-5 rounded-full transition-all relative',
                    data.autoApply ? 'bg-emerald-400' : 'bg-gray-200',
                  ].join(' ')}
                >
                  <span className={[
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                    data.autoApply ? 'left-4.5' : 'left-0.5',
                  ].join(' ')} />
                </button>
              </div>
            </div>

            {/* 루틴 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {data.routines.length === 0 && !routineForm && (
                <p className="text-[12px] text-gray-400 text-center py-8">
                  아직 루틴이 없습니다.<br />아래 버튼으로 추가해보세요.
                </p>
              )}
              {data.routines.map(r => {
                const c = getColor(r.color)
                const isEditing = routineForm?.id === r.id
                return (
                  <div key={r.id} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                    {/* 루틴 행 */}
                    {!isEditing && (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className={['w-3 h-3 rounded-full shrink-0', c.dot].join(' ')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-700 truncate">{r.title}</div>
                          <div className="text-[10px] text-gray-400">{r.start} – {r.end}</div>
                        </div>
                        {/* 요일 칩 */}
                        <div className="flex gap-0.5">
                          {DAY_LABELS.map((label, i) => (
                            <span key={i} className={[
                              'text-[9px] px-1 py-0.5 rounded font-medium',
                              r.days.length === 0
                                ? 'bg-emerald-100 text-emerald-600'
                                : r.days.includes(i)
                                  ? 'bg-blue-100 text-blue-600'
                                  : 'bg-gray-100 text-gray-300',
                            ].join(' ')}>
                              {r.days.length === 0 ? '매' : label}
                            </span>
                          ))}
                          {r.days.length === 0 && <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-emerald-100 text-emerald-600">일</span>}
                        </div>
                        <button type="button" onClick={() => setRoutineForm({ ...r })}
                          className="text-[10px] text-gray-400 hover:text-blue-500 px-1.5 py-1 rounded hover:bg-blue-50 transition-colors">수정</button>
                        <button type="button" onClick={() => deleteRoutine(r.id)}
                          className="text-gray-300 hover:text-red-400 p-1 rounded hover:bg-red-50 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                    {/* 인라인 수정 폼 */}
                    {isEditing && routineForm && (
                      <RoutineForm
                        form={routineForm}
                        onChange={setRoutineForm}
                        onToggleDay={toggleRoutineDay}
                        onSave={() => upsertRoutine(routineForm)}
                        onCancel={() => setRoutineForm(null)}
                      />
                    )}
                  </div>
                )
              })}

              {/* 새 루틴 추가 폼 */}
              {routineForm && !routineForm.id && (
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 overflow-hidden">
                  <RoutineForm
                    form={routineForm}
                    onChange={setRoutineForm}
                    onToggleDay={toggleRoutineDay}
                    onSave={() => upsertRoutine(routineForm)}
                    onCancel={() => setRoutineForm(null)}
                  />
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRoutineForm(EMPTY_ROUTINE())}
                disabled={!!routineForm}
                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-40 transition-colors"
              >
                <Plus size={13} /> 루틴 추가
              </button>
              <button
                type="button"
                onClick={() => { applyRoutinesToday(); setRoutineOpen(false) }}
                className="flex items-center gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <Check size={12} /> 오늘에 루틴 적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이벤트 수정 모달 ────────────────────── */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setEditingEvent(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-72 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">일정 수정</span>
              <button type="button" onClick={() => setEditingEvent(null)}
                className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
                <X size={15} />
              </button>
            </div>

            {/* 제목 */}
            <input
              autoFocus
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit() }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 w-full"
              placeholder="일정 이름"
            />

            {/* 시간 */}
            <div className="flex items-center gap-2">
              <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400" />
              <span className="text-xs text-gray-400">~</span>
              <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400" />
            </div>

            {/* 색상 — flex-wrap으로 2행 표시 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">색상</span>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_COLORS.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => setEditColor(c.id)}
                    className={['w-5 h-5 rounded-full transition-all shrink-0', c.dot, editColor === c.id ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'].join(' ')} />
                ))}
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveEdit}
                className="flex-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors">
                저장
              </button>
              <button type="button"
                onClick={() => { deleteEvent(editingEvent.id); setEditingEvent(null) }}
                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors border border-red-200">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI 일정 도우미 (floating 모드 — 글로벌 AI 패널과 동일한 UX) ──
          position:fixed 이므로 DOM 위치 무관, 어디서나 화면 위에 떠 있음
          Python으로 치면: if ai_open: render_floating_panel()
      ─────────────────────────────────────────────────────────────── */}
      {aiOpen && (
        <AIChatPanel
          title="AI 일정 도우미"
          icon="📅"
          emptyHint={'현재 일정을 읽고 도움을 드립니다.\n\n예시:\n"오전에 운동 1시간 추가해줘"\n"오늘 일정 분석해줘"\n"점심 후 휴식 시간 넣어줘"\n"전체 일정 최적화해줘"'}
          systemPrompt={PLANNER_SYSTEM_PROMPT}
          context={getPlannerContext}
          placeholder="일정을 말해보세요… (Enter 전송)"
          quickCommands={[
            '오늘 일정 분석해줘',
            '빈 시간에 휴식 추가해줘',
            '오전 루틴 만들어줘',
            '전체 일정 최적화해줘',
          ]}
          mode="floating"
          applyLabel="📅 일정에 적용"
          onApply={(text) => {
            const result = applyAiSchedule(text)
            setPendingEvents([])
            return result
          }}
          onClose={() => { setAiOpen(false); setPendingEvents([]) }}
          initialHistory={aiHistory}
          onHistoryChange={(h) => {
            setAiHistory(h)
            const last = [...h].reverse().find(m => m.role === 'assistant')
            if (last) parsePendingFromAi(last.content)
            else setPendingEvents([])
          }}
        />
      )}
    </div>
  )
}
