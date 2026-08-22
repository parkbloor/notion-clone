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
import { Block, PlanEvent, SubTask, Routine } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { plannerApi } from '@/lib/api'
import { findBlockById } from '@/lib/blockTree'
import PlannerTimeline, {
  END_HOUR,
  EVENT_COLORS,
  START_HOUR,
  eventPx,
  getColor,
  isScheduledEvent,
  minToTime,
  timeToMin,
  yToTime,
} from '@/components/editor/planner/PlannerTimeline'
import { usePlannerEventDrag } from '@/components/editor/planner/usePlannerEventDrag'
import { Plus, Trash2, ChevronLeft, ChevronRight, Check, X, Bot, Timer, TimerOff, Eye, EyeOff, Archive, Pencil, Zap, Download, Upload } from 'lucide-react'
import AIChatPanel, { ChatMsg } from '@/components/ai/AIChatPanel'
import { useLocale } from '@/locales'

// ── 모듈 레벨: 마지막 활성 DayPlannerBlock ID ─────
// GlobalAIChatButton의 'ai-apply-schedule' 이벤트를 처리할 블록 결정
// Python으로 치면: _active_planner_id: str | None = None
let _activePlannerBlockId: string | null = null

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
// HOUR_PX 제거 → settingsStore.plannerZoom 으로 동적 결정 (컴포넌트 내부에서 사용)
const ZOOM_STEPS = [32, 48, 64, 96] as const  // 줌 단계 (px/hour)

// ── DayPlannerBlock 콘텐츠 JSON 구조 ─────────
// date별 이벤트 맵 — 날짜 이동해도 각 날짜 데이터 독립 보존
// 루틴·autoApply는 settingsStore로 이동 (block.content와 분리)
// Python으로 치면: @dataclass class PlannerData: events_by_date: dict[str, list[PlanEvent]]
export interface PlannerData {
  eventsByDate:  Record<string, PlanEvent[]>  // 'YYYY-MM-DD' → PlanEvent[]
  reviewByDate?: Record<string, string>        // 'YYYY-MM-DD' → 일일 회고 텍스트
}

// 90일 초과 이벤트를 아카이브로 이동할 기준
// Python으로 치면: HISTORY_DAYS = 90
const HISTORY_DAYS = 90

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

// =============================================
// TimeInput — 24시간제 시:분 분리 입력 컴포넌트
// Python으로 치면: class TimeInput(QWidget): ...
// =============================================
interface TimeInputProps {
  value: string                        // "HH:MM" 형식
  onChange: (v: string) => void
  focusColor?: string                  // focus 테두리 색 (Tailwind 클래스)
}

function TimeInput({ value, onChange, focusColor = 'focus:border-emerald-400' }: TimeInputProps) {
  const minRef = useRef<HTMLInputElement>(null)

  // "HH:MM" → [hh, mm] 파싱
  const [hh, mm] = value.split(':')

  // 시간 값 변경 핸들러 — 2자리 입력 시 분으로 자동 포커스 이동
  const handleHour = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    const num = parseInt(raw || '0', 10)
    const clamped = Math.min(23, num)
    const padded = raw.length === 2 ? String(clamped).padStart(2, '0') : raw
    onChange(`${padded}:${mm ?? '00'}`)
    if (raw.length === 2) minRef.current?.focus()
  }

  // 분 값 변경 핸들러
  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    const num = parseInt(raw || '0', 10)
    const clamped = Math.min(59, num)
    const padded = raw.length === 2 ? String(clamped).padStart(2, '0') : raw
    onChange(`${hh ?? '00'}:${padded}`)
  }

  // 방향키 위/아래로 값 조정 (시간/분 공통)
  const handleKeyDown = (type: 'h' | 'm') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const delta = e.key === 'ArrowUp' ? 1 : -1
      if (type === 'h') {
        const next = ((parseInt(hh || '0', 10) + delta + 24) % 24)
        onChange(`${String(next).padStart(2, '0')}:${mm ?? '00'}`)
      } else {
        const next = ((parseInt(mm || '0', 10) + delta + 60) % 60)
        onChange(`${hh ?? '00'}:${String(next).padStart(2, '0')}`)
      }
    }
  }

  const base = `w-7 text-center text-xs border-0 outline-none bg-transparent p-0 leading-none`

  return (
    <div className={`flex items-center border border-gray-200 rounded-lg px-2 py-1.5 focus-within:border-emerald-400 ${focusColor.replace('focus:', 'focus-within:')}`}>
      {/* lang="en" — 한글 IME 비활성화, 숫자 직접 입력 보장 */}
      <input
        type="text" inputMode="numeric" maxLength={2} lang="en"
        placeholder="HH" value={hh ?? ''}
        onChange={handleHour}
        onKeyDown={handleKeyDown('h')}
        onFocus={e => e.target.select()}
        className={base}
      />
      <span className="text-xs text-gray-400 select-none">:</span>
      <input
        ref={minRef}
        type="text" inputMode="numeric" maxLength={2} lang="en"
        placeholder="MM" value={mm ?? ''}
        onChange={handleMin}
        onKeyDown={handleKeyDown('m')}
        onFocus={e => e.target.select()}
        className={base}
      />
    </div>
  )
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
  // 로컬 title 상태 — 한글 IME 조합 중 리렌더로 인한 조합 깨짐 방지
  const [localTitle, setLocalTitle] = useState(form.title)
  const composingRef = useRef(false)

  // 조합 완료 또는 blur 시 상위에 전파
  const flushTitle = (v: string) => onChange({ ...form, title: v })

  return (
    <div className="p-3 flex flex-col gap-2">
      {/* 제목 — IME 조합 중에는 상위 전파 지연 */}
      <input
        autoFocus
        type="text"
        placeholder="루틴 이름 (예: 기상, 운동, 취침)"
        value={localTitle}
        onChange={e => {
          setLocalTitle(e.target.value)
          if (!composingRef.current) flushTitle(e.target.value)
        }}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={e => {
          composingRef.current = false
          flushTitle((e.target as HTMLInputElement).value)
        }}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        onBlur={e => flushTitle(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 w-full"
      />
      {/* 시간 */}
      <div className="flex items-center gap-2">
        {/* TimeInput — 24시간 분리 입력 (시/분 자동 포커스 이동) */}
        <TimeInput value={form.start} onChange={v => onChange({ ...form, start: v })} />
        <span className="text-xs text-gray-400">~</span>
        <TimeInput value={form.end} onChange={v => onChange({ ...form, end: v })} />
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
// PlannerArchiveModal — 아카이브 열람 전용 모달 (읽기 전용)
// 90일 초과 이벤트를 월별로 탐색, 수정/삭제 불가
// Python으로 치면: class PlannerArchiveModal(QDialog): ...
// =============================================
interface ArchiveModalProps {
  onClose: () => void
}
function PlannerArchiveModal({ onClose }: ArchiveModalProps) {
  // 아카이브 데이터: { "YYYY-MM-DD": PlanEvent[] }
  const [archive, setArchive] = useState<Record<string, PlanEvent[]>>({})
  const [loading, setLoading] = useState(true)
  // 현재 보고 있는 월 ('YYYY-MM')
  const [viewMonth, setViewMonth] = useState<string>(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)  // 기본: 지난달 (90일 이상 지난 데이터)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  // 선택된 날짜 — 타임라인 표시용
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 마운트 시 아카이브 fetch
  useEffect(() => {
    setLoading(true)
    plannerApi.getArchive()
      .then((d) => { setArchive(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // 아카이브에 있는 월 목록 (YYYY-MM)
  const months = useMemo(() => {
    const set = new Set<string>()
    Object.keys(archive).forEach(d => set.add(d.slice(0, 7)))
    return Array.from(set).sort().reverse()
  }, [archive])

  // 현재 월의 날짜 목록 (이벤트 있는 날만)
  const datesInMonth = useMemo(() => {
    return Object.keys(archive)
      .filter(d => d.startsWith(viewMonth) && archive[d].length > 0)
      .sort()
  }, [archive, viewMonth])

  // 선택된 날짜의 이벤트
  const selectedEvents = selectedDate ? (archive[selectedDate] ?? []) : []

  const formatDateLabel = (ds: string) => {
    const d = new Date(ds + 'T00:00:00')
    const dow = ['일','월','화','수','목','금','토'][d.getDay()]
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${dow})`
  }

  const HOUR_PX_ARCHIVE = 48  // 아카이브 뷰 고정 줌

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl flex overflow-hidden"
        style={{ width: 680, maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}>

        {/* ── 왼쪽: 날짜 목록 패널 ── */}
        <div className="w-52 border-r border-gray-100 flex flex-col shrink-0">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <Archive size={14} className="text-gray-500" />
              <span className="text-sm font-bold text-gray-700">아카이브</span>
            </div>
            <button type="button" onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* 월 선택 */}
          <div className="px-3 py-2 border-b border-gray-100">
            <select
              value={viewMonth}
              onChange={e => { setViewMonth(e.target.value); setSelectedDate(null) }}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400"
            >
              {months.map(m => {
                const [y, mo] = m.split('-')
                return <option key={m} value={m}>{y}년 {Number(mo)}월</option>
              })}
            </select>
          </div>

          {/* 날짜 목록 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-[11px] text-gray-400 text-center mt-6">불러오는 중...</p>
            ) : datesInMonth.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center mt-6 px-3">
                이 달에 보관된 기록이 없습니다
              </p>
            ) : (
              datesInMonth.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={[
                    'w-full text-left px-4 py-2.5 border-b border-gray-50 transition-colors',
                    selectedDate === d
                      ? 'bg-blue-50 border-l-2 border-l-blue-400'
                      : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  <div className="text-[12px] font-medium text-gray-700">{formatDateLabel(d)}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {archive[d].length}개 일정
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── 오른쪽: 타임라인 + 목록 (읽기 전용) ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedDate ? (
            <>
              {/* 선택 날짜 헤더 */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
                <span className="text-sm font-semibold text-gray-700">{formatDateLabel(selectedDate)}</span>
                <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">읽기 전용</span>
                <div className="flex-1" />
                <span className="text-xs text-gray-400">{selectedEvents.length}개 일정</span>
              </div>

              {/* 타임라인 (읽기 전용 — 클릭 이벤트 없음) */}
              <div className="flex flex-1 overflow-hidden">
                <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(80vh - 100px)' }}>
                  <PlannerTimeline
                    events={selectedEvents.filter(isScheduledEvent)}
                    hourPx={HOUR_PX_ARCHIVE}
                    editable={false}
                    showHalfHours={false}
                    timeLabelWidthClass="w-10"
                    timeLabelClassName="text-[9px] text-gray-300 pr-1"
                    eventTitleClassName="text-[10px]"
                    eventTimeClassName="text-[9px]"
                  />
                </div>

                {/* 이벤트 목록 (읽기 전용) */}
                <div className="w-44 border-l border-gray-200 overflow-y-auto shrink-0">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-medium text-gray-500">일정 목록</span>
                  </div>
                  {selectedEvents.map(ev => {
                    const c = getColor(ev.color)
                    return (
                      <div key={ev.id} className="flex items-start gap-2 px-3 py-2 border-b border-gray-50">
                        <div className={['w-2 h-2 rounded-full shrink-0 mt-1', c.dot].join(' ')} />
                        <div className="flex-1 min-w-0">
                          <div className={[
                            'text-[11px] font-medium text-gray-700 truncate',
                            ev.done ? 'line-through text-gray-400' : '',
                          ].join(' ')}>
                            {ev.title}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {isScheduledEvent(ev) ? `${ev.start}–${ev.end}` : '시간 미지정'}
                          </div>
                          {ev.elapsed !== undefined && ev.elapsed > 0 && (
                            <div className="text-[10px] text-gray-400">⏱ {ev.elapsed}분</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] text-gray-400 text-center">
                {loading ? '불러오는 중...' : '왼쪽에서 날짜를 선택하세요'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================
// EventDetailPanel — 이벤트 상세 기록 패널
// 스토어 직접 바인딩 대신 로컬 state를 사용해 타이핑 시 전역 리렌더 방지
// Python으로 치면: class EventDetailPanel(QWidget): ...
// =============================================
interface EventDetailPanelProps {
  ev: PlanEvent
  // Python으로 치면: Callable[[str, dict, bool], None]
  patchEvent: (id: string, patch: Partial<PlanEvent>, immediate?: boolean) => void
  toggleDone: (id: string) => void
  setSelectedEventId: (id: string | null) => void
  t: ReturnType<typeof useLocale>
}

function EventDetailPanel({ ev, patchEvent, toggleDone, setSelectedEventId, t }: EventDetailPanelProps) {
  // 로컬 상태 — onChange 시 스토어 업데이트 없이 즉시 반영
  // onBlur 시점에만 patchEvent(immediate=true)로 저장
  // key={ev.id}로 이벤트 전환 시 컴포넌트 완전 재마운트 → 스크롤 자동 0
  // Python으로 치면: self.local_log: str = ev.log or ''
  const [localLog, setLocalLog] = useState(ev.log ?? '')
  const [localSubtasks, setLocalSubtasks] = useState<SubTask[]>(ev.subtasks ?? [])
  // textarea 마운트 순간 커서+스크롤을 처음으로 강제 이동
  // useCallback(fn, []) → 안정된 참조 → 마운트/언마운트 시에만 호출됨
  // Python으로 치면: def on_textarea_mount(el): el.setSelection(0, 0)
  const logRefCallback = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.scrollTop = 0
    el.selectionStart = 0
    el.selectionEnd = 0
  }, [])

  const c = getColor(ev.color)
  // 계획 시간 (분) — start/end 차이
  const plannedMin = isScheduledEvent(ev)
    ? Math.max(0, timeToMin(ev.end) - timeToMin(ev.start))
    : null
  const actualMin = ev.elapsed ?? null
  const fmtMin = (m: number) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`
  // 서브태스크 완료 수 (로컬 state 기준)
  const doneSubCnt = localSubtasks.filter(s => s.done).length

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 — 뒤로 버튼 + 이벤트 제목 */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <button type="button"
          onClick={() => setSelectedEventId(null)}
          className="text-[10px] text-gray-400 hover:text-gray-600 mb-1.5 transition-colors">
          {t.planner.day.detailBack}
        </button>
        <div className="flex items-center gap-2">
          <div className={['w-2.5 h-2.5 rounded-full shrink-0', c.dot].join(' ')} />
          <span className="text-[12px] font-semibold text-gray-800 truncate flex-1">{ev.title}</span>
        </div>
        {isScheduledEvent(ev) && (
          <div className="text-[10px] text-gray-400 mt-0.5 ml-4.5">{ev.start} – {ev.end}</div>
        )}
      </div>

      {/* 상태바 — 완료 토글 + 에너지 + 소요시간 */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        {/* 완료 토글 */}
        <button type="button"
          onClick={() => toggleDone(ev.id)}
          className={[
            'flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg border transition-all w-full mb-2',
            ev.done
              ? `${c.bg} ${c.text} border-transparent`
              : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600',
          ].join(' ')}>
          <div className={['w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0', ev.done ? 'border-transparent bg-white/30' : 'border-current'].join(' ')}>
            {ev.done && <Check size={9} />}
          </div>
          {ev.done ? '완료됨' : '완료로 표시'}
        </button>

        {/* 에너지 레벨 */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-gray-400 shrink-0">{t.planner.day.detailEnergy}</span>
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button"
                onClick={() => patchEvent(ev.id, { energy: ev.energy === n ? 0 : n }, true)}
                className="transition-transform hover:scale-110">
                <Zap size={12} className={n <= (ev.energy ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
              </button>
            ))}
          </div>
        </div>

        {/* 소요시간 비교 */}
        {plannedMin !== null && (
          <div className="flex gap-2 text-[10px]">
            <span className="text-gray-400">{t.planner.day.detailPlannedTime} <span className="text-gray-600 font-medium">{fmtMin(plannedMin)}</span></span>
            {actualMin !== null && actualMin > 0 && (
              <>
                <span className="text-gray-400">{t.planner.day.detailActualTime} <span className="text-gray-600 font-medium">{fmtMin(actualMin)}</span></span>
                {actualMin > plannedMin
                  ? <span className="text-red-500 font-medium">+{fmtMin(actualMin - plannedMin)} {t.planner.day.detailOvertime}</span>
                  : actualMin < plannedMin
                    ? <span className="text-emerald-500 font-medium">-{fmtMin(plannedMin - actualMin)} {t.planner.day.detailUndertime}</span>
                    : null
                }
              </>
            )}
          </div>
        )}
      </div>

      {/* 스크롤 영역 — 로그 + 서브태스크 */}
      <div className="flex-1 overflow-auto px-3 py-2 flex flex-col gap-3">

        {/* 실제 기록 textarea — 로컬 state 바인딩, blur 시 저장 */}
        <div>
          <div className="text-[10px] font-medium text-gray-500 mb-1">📝 {t.planner.day.detailLog}</div>
          <textarea
            ref={logRefCallback}
            value={localLog}
            onChange={e => setLocalLog(e.target.value)}
            onBlur={() => patchEvent(ev.id, { log: localLog }, true)}
            placeholder={t.planner.day.detailLogPlaceholder}
            rows={4}
            className="w-full text-[11px] text-gray-700 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-blue-300 transition-colors"
          />
        </div>

        {/* 서브태스크 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] font-medium text-gray-500">
              ☑ {t.planner.day.detailSubtasks}
              {localSubtasks.length > 0 && (
                <span className="ml-1 text-[9px] text-gray-400">{doneSubCnt}/{localSubtasks.length}</span>
              )}
            </div>
            <button type="button"
              onClick={() => {
                const newSub: SubTask = { id: crypto.randomUUID(), text: '', done: false }
                const updated = [...localSubtasks, newSub]
                setLocalSubtasks(updated)
                patchEvent(ev.id, { subtasks: updated }, true)
              }}
              className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors">
              {t.planner.day.detailSubtaskAdd}
            </button>
          </div>

          {/* 서브태스크 목록 — 로컬 state 바인딩, blur 시 저장 */}
          <div className="flex flex-col gap-1">
            {localSubtasks.map((sub, idx) => (
              <div key={sub.id} className="flex items-center gap-1.5 group">
                {/* 체크박스 — 즉시 저장 */}
                <button type="button"
                  onClick={() => {
                    const updated = localSubtasks.map((s, i) => i === idx ? { ...s, done: !s.done } : s)
                    setLocalSubtasks(updated)
                    patchEvent(ev.id, { subtasks: updated }, true)
                  }}
                  className={[
                    'shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-all',
                    sub.done ? 'bg-blue-400 border-transparent' : 'border-gray-300 hover:border-blue-400',
                  ].join(' ')}>
                  {sub.done && <Check size={8} className="text-white" />}
                </button>
                {/* 텍스트 input — 로컬 state, blur 시 저장 */}
                <input
                  type="text"
                  value={sub.text}
                  placeholder={t.planner.day.detailSubtaskPlaceholder}
                  onChange={e => {
                    const updated = localSubtasks.map((s, i) => i === idx ? { ...s, text: e.target.value } : s)
                    setLocalSubtasks(updated)
                  }}
                  onBlur={() => patchEvent(ev.id, { subtasks: localSubtasks }, true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      // Enter → 다음 서브태스크 추가 (즉시 저장)
                      const newSub: SubTask = { id: crypto.randomUUID(), text: '', done: false }
                      const updated = [...localSubtasks, newSub]
                      setLocalSubtasks(updated)
                      patchEvent(ev.id, { subtasks: updated }, true)
                    }
                    if (e.key === 'Backspace' && sub.text === '') {
                      // 빈 항목에서 Backspace → 삭제 (즉시 저장)
                      const updated = localSubtasks.filter((_, i) => i !== idx)
                      setLocalSubtasks(updated)
                      patchEvent(ev.id, { subtasks: updated }, true)
                    }
                  }}
                  className={[
                    'flex-1 text-[11px] bg-transparent border-none outline-none',
                    sub.done ? 'line-through text-gray-400' : 'text-gray-700',
                  ].join(' ')}
                />
                {/* 삭제 버튼 */}
                <button type="button"
                  onClick={() => {
                    const updated = localSubtasks.filter((_, i) => i !== idx)
                    setLocalSubtasks(updated)
                    patchEvent(ev.id, { subtasks: updated }, true)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 rounded transition-all shrink-0">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
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
  // ── 로케일 ────────────────────────────────
  // Python으로 치면: t = use_locale()
  const t = useLocale()

  const updateBlock    = usePageStore(s => s.updateBlock)
  // 이벤트 변경 후 즉시 서버 저장 — HMR 리로드나 탭 닫기 시 유실 방지
  // Python으로 치면: save_page_now = store.save_page_now
  const savePageNow    = usePageStore(s => s.savePageNow)
  // 전역 날씨 위치 — settingsStore에서 영속 저장된 도시명
  // Python으로 치면: weather_location = settings_store.weather_location
  const weatherLocation    = useSettingsStore(s => s.weatherLocation)
  // 플래너 타임라인 설정 — 시작 시각(시), 드래그 스냅 간격(분), 줌(px/hour)
  // Python으로 치면: self.start_hour = settings.planner_start_hour
  const plannerStartHour      = useSettingsStore(s => s.plannerStartHour)
  const plannerEndHour        = useSettingsStore(s => s.plannerEndHour)
  const plannerSnapMin        = useSettingsStore(s => s.plannerSnapMin)
  const plannerZoom           = useSettingsStore(s => s.plannerZoom)
  const setPlannerZoom        = useSettingsStore(s => s.setPlannerZoom)
  const plannerNotifyBefore   = useSettingsStore(s => s.plannerNotifyBefore)
  // 루틴 프리셋 + 자동 적용 — settingsStore에서 관리 (block.content와 분리)
  // Python으로 치면: self.planner_routines = settings.planner_routines
  const plannerRoutines    = useSettingsStore(s => s.plannerRoutines)
  const plannerAutoApply   = useSettingsStore(s => s.plannerAutoApply)
  const setPlannerRoutines = useSettingsStore(s => s.setPlannerRoutines)
  const setPlannerAutoApply = useSettingsStore(s => s.setPlannerAutoApply)
  // HOUR_PX 동적 값 — plannerZoom 기준 (32|48|64|96)
  const HOUR_PX = plannerZoom
  const timelineStartHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, Math.floor(plannerStartHour)))
  const timelineEndHour   = Math.max(timelineStartHour + 1, Math.min(END_HOUR, Math.floor(plannerEndHour)))

  // ── 현재 보고 있는 날짜 (로컬 state) ─────────
  // 일간 노트 제목에서 YYYY-MM-DD 파싱 → 없으면 오늘 날짜 fallback
  // Python으로 치면: self.current_date = parse_date_from_title(page.title) or today_str()
  const [currentDate, setCurrentDate] = useState(() => {
    const pageTitle = usePageStore.getState().pages.find(p => p.id === pageId)?.title ?? ''
    const m = pageTitle.match(/(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] : todayStr()
  })

  // ── 콘텐츠 파싱 ──────────────────────────────
  // eventsByDate: 날짜별 이벤트 맵 (최근 90일)
  // Python으로 치면: data = json.loads(block.content) if block.content else default
  const data: PlannerData = useMemo(() => {
    try {
      const parsed = JSON.parse(block.content || '{}')
      // 구버전 데이터(date/events/routines 구조)는 무시하고 빈 맵으로 초기화
      return {
        eventsByDate:  parsed.eventsByDate  ?? {},
        reviewByDate:  parsed.reviewByDate  ?? {},
      }
    } catch {
      return { eventsByDate: {}, reviewByDate: {} }
    }
  }, [block.content])

  // 현재 날짜의 이벤트 배열 (편의상 변수화)
  // Python으로 치면: events = data.events_by_date.get(current_date, [])
  const events: PlanEvent[] = useMemo(
    () => data.eventsByDate[currentDate] ?? [],
    [data.eventsByDate, currentDate],
  )

  // ── 최신 플래너 데이터 읽기·부분 업데이트 공통화 ──
  // 이벤트·회고·루틴 자동 적용이 같은 block.content를 갱신하므로,
  // 항상 스토어의 최신 JSON을 기준으로 수정한 뒤 한 번에 커밋한다.
  // Python으로 치면: def update_planner(mutator): latest = load(); save(mutator(latest))
  const readLatestPlannerData = useCallback((): PlannerData => {
    try {
      const page = usePageStore.getState().pages.find(p => p.id === pageId)
      const content = findBlockById(page?.blocks, block.id)?.content ?? '{}'
      const parsed = JSON.parse(content) as Partial<PlannerData>
      return {
        eventsByDate: parsed.eventsByDate ?? {},
        reviewByDate: parsed.reviewByDate ?? {},
      }
    } catch {
      return { eventsByDate: {}, reviewByDate: {} }
    }
  }, [pageId, block.id])

  // archiveOld=true이면 90일이 지난 이벤트를 아카이브로 분리한다.
  // Python으로 치면: def commit(mutator, archive_old=False): ...
  const commitPlannerData = useCallback((
    mutator: (latest: PlannerData) => PlannerData,
    archiveOld = false,
  ): PlannerData => {
    const next = mutator(readLatestPlannerData())
    let eventsByDate = next.eventsByDate

    if (archiveOld) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - HISTORY_DAYS)
      const cutoffDate = cutoff.toISOString().slice(0, 10)
      const toArchive: Record<string, PlanEvent[]> = {}
      const toKeep: Record<string, PlanEvent[]> = {}
      for (const [date, dayEvents] of Object.entries(eventsByDate)) {
        if (date < cutoffDate) toArchive[date] = dayEvents
        else toKeep[date] = dayEvents
      }
      if (Object.keys(toArchive).length > 0) plannerApi.appendArchive(toArchive).catch(() => {})
      eventsByDate = toKeep
    }

    const committed = { eventsByDate, reviewByDate: next.reviewByDate ?? {} }
    // Keep schedule changes in page undo history so Ctrl+Z restores the
    // previous schedule instead of undoing the creation of this block.
    updateBlock(pageId, block.id, JSON.stringify(committed), true)
    return committed
  }, [readLatestPlannerData, updateBlock, pageId, block.id])

  // ── 콘텐츠 저장 — 90일 초과 데이터 아카이브 처리 포함 ──
  // 1) 현재 날짜 이벤트 업데이트
  // 2) 90일 초과 날짜 분리 → 백엔드 아카이브 API에 fire-and-forget
  // 3) block.content는 90일 이내 데이터만 저장
  // Python으로 치면: def save_events(date, evs): archive_old(); block.content = json.dumps(recent)
  const save = useCallback((
    date: string,
    update: PlanEvent[] | ((latestEvents: PlanEvent[]) => PlanEvent[]),
  ) => {
    commitPlannerData(latest => {
      const latestEvents = latest.eventsByDate[date] ?? []
      return {
        eventsByDate: {
          ...latest.eventsByDate,
          [date]: typeof update === 'function' ? update(latestEvents) : update,
        },
        reviewByDate: latest.reviewByDate ?? {},
      }
    }, true)
    // 이벤트 변경은 즉시 서버에 flush — 500ms 디바운스 대기 중 HMR/탭닫기로 유실 방지
    // Python으로 치면: await save_page_now(page_id)  # fire-and-forget
    savePageNow(pageId).catch(() => {})
  }, [commitPlannerData, savePageNow, pageId])

  // ── 이벤트 배열 시간순 정렬 헬퍼 ─────────────
  // Python으로 치면: def sort_events(evs): return sorted(evs, key=lambda e: e.start)
  function sortEvents(evs: PlanEvent[]): PlanEvent[] {
    return [...evs].sort((a, b) => a.start.localeCompare(b.start))
  }

  // ── 이벤트 추가/수정/삭제 헬퍼 ───────────────
  // upsertEvent: 저장 후 항상 start 오름차순 정렬
  // Python으로 치면: def upsert_event(ev): evs = sort_events(upsert(evs, ev)); save()
  const upsertEvent = useCallback((ev: PlanEvent) => {
    save(currentDate, latestEvents => sortEvents(
      latestEvents.some(e => e.id === ev.id)
        ? latestEvents.map(e => e.id === ev.id ? ev : e)
        : [...latestEvents, ev]
    ))
  }, [currentDate, save])

  const deleteEvent = useCallback((id: string) => {
    save(currentDate, latestEvents => latestEvents.filter(e => e.id !== id))
  }, [currentDate, save])

  const toggleDone = useCallback((id: string) => {
    save(currentDate, latestEvents => latestEvents.map(
      e => e.id === id ? { ...e, done: !e.done } : e
    ))
  }, [currentDate, save])

  // ── Clock in/out 헬퍼 ─────────────────────────
  // 현재 시각 'HH:MM:SS' 반환
  // Python으로 치면: def now_time_str(): return datetime.now().strftime('%H:%M:%S')
  function nowTimeStr(): string {
    const n = new Date()
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`
  }

  // Clock In: 이미 clockIn 중이면 무시
  // Python으로 치면: def clock_in(id): event.clockIn = now; event.clockOut = None
  const handleClockIn = useCallback((id: string) => {
    save(currentDate, latestEvents => latestEvents.map(e => {
      if (e.id !== id) return e
      if (e.clockIn && !e.clockOut) return e  // 이미 활성 클럭
      return { ...e, clockIn: nowTimeStr(), clockOut: undefined }
    }))
  }, [currentDate, save])

  // Clock Out: clockIn → clockOut 기록, elapsed 누적
  // Python으로 치면: def clock_out(id): event.clockOut = now; event.elapsed += duration
  const handleClockOut = useCallback((id: string) => {
    save(currentDate, latestEvents => latestEvents.map(e => {
      if (e.id !== id || !e.clockIn || e.clockOut) return e
      const outStr = nowTimeStr()
      const [ih, im, is_] = e.clockIn.split(':').map(Number)
      const [oh, om, os]  = outStr.split(':').map(Number)
      const diffMin = Math.round(((oh*3600+om*60+os) - (ih*3600+im*60+is_)) / 60)
      return { ...e, clockOut: outStr, elapsed: (e.elapsed ?? 0) + Math.max(0, diffMin) }
    }))
  }, [currentDate, save])

  // 활성 클럭(clockIn 있고 clockOut 없는) 이벤트 목록
  // Python으로 치면: active_clocks = [e for e in events if e.clock_in and not e.clock_out]
  const activeClocks = useMemo(
    () => events.filter(e => e.clockIn && !e.clockOut),
    [events]
  )

  // ── 활성 클럭 경과 시간 실시간 표시 (1초 갱신) ──
  // Python으로 치면: self._clock_timer = QTimer(interval=1000)
  const [, setClockTick] = useState(0)
  useEffect(() => {
    if (activeClocks.length === 0) return
    const timer = setInterval(() => setClockTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [activeClocks.length])

  // ── 데스크탑 알림 스케줄링 ───────────────────
  // 오늘 날짜 + plannerNotifyBefore > 0 일 때만 활성화
  // Python으로 치면: for ev in events: schedule_notification(ev.start - notify_before_min)
  useEffect(() => {
    if (!plannerNotifyBefore || currentDate !== todayStr()) return
    // 브라우저 알림 권한 확인 (요청은 권한 미확인 시만)
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') Notification.requestPermission()
    if (Notification.permission !== 'granted') return

    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()

    const timers = events
      .filter(e => !e.done && isScheduledEvent(e))
      .map(ev => {
        const startMin = timeToMin(ev.start)
        const fireMin  = startMin - plannerNotifyBefore
        const diffMs   = (fireMin - nowMin) * 60_000
        if (diffMs <= 0) return null  // 이미 지난 알림 건너뜀
        return setTimeout(() => {
          new Notification(`📅 ${ev.title}`, {
            body: `${ev.start} 시작 — ${plannerNotifyBefore}분 후`,
          })
        }, diffMs)
      })
      .filter(Boolean) as ReturnType<typeof setTimeout>[]

    return () => timers.forEach(t => clearTimeout(t))
  }, [currentDate, events, plannerNotifyBefore])

  // ── 알림 권한 상태 (헤더 경고 뱃지용) ─────────
  // Python으로 치면: self.notify_denied: bool = False
  const [notifyDenied, setNotifyDenied] = useState(false)
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    setNotifyDenied(plannerNotifyBefore > 0 && Notification.permission === 'denied')
  }, [plannerNotifyBefore])

  // clockIn 시각 → 현재까지 경과 분:초 문자열
  // Python으로 치면: def elapsed_str(clock_in): return format_duration(now - clock_in)
  function elapsedStr(clockIn: string): string {
    const [h, m, s] = clockIn.split(':').map(Number)
    const n = new Date()
    const totalSec = (n.getHours()*3600 + n.getMinutes()*60 + n.getSeconds()) - (h*3600 + m*60 + s)
    if (totalSec < 0) return '0:00'
    const mm = Math.floor(totalSec / 60)
    const ss = totalSec % 60
    return mm >= 60
      ? `${Math.floor(mm/60)}h ${mm%60}m`
      : `${mm}:${String(ss).padStart(2,'0')}`
  }

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
      const res = await fetch(`/api/weather/day?city=${encodeURIComponent(city)}&date=${encodeURIComponent(dateStr)}`)
      if (!res.ok) return

      const data = await res.json()
      if (!data.weather) return

      setWeather({
        icon: wmoToIcon(data.weather.weathercode),
        temp: `${Math.round(data.weather.tempMin)}°/${Math.round(data.weather.tempMax)}°`,
      })
    } catch {
      // 날씨 fetch 실패 시 조용히 무시 (헤더에 표시 안 됨)
    } finally {
      setWeatherLoading(false)
    }
  }, [])

  // 날짜 변경 or weatherLocation 변경 시 자동 fetch
  // Python으로 치면: @watch('current_date', 'weather_location') def on_date_change(): fetch_day_weather()
  useEffect(() => {
    setWeather(null)
    if (weatherLocation) fetchDayWeather(weatherLocation, currentDate)
  }, [currentDate, weatherLocation, fetchDayWeather])

  // ── 현재 시각 표시선 ──────────────────────────
  const [nowTop, setNowTop] = useState<number | null>(null)
  useEffect(() => {
    function update() {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const baseMin = timelineStartHour * 60
      const endMin  = timelineEndHour  * 60
      if (nowMin >= baseMin && nowMin <= endMin) {
        setNowTop((nowMin - baseMin) * (HOUR_PX / 60))
      } else {
        setNowTop(null)
      }
    }
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [HOUR_PX, timelineStartHour, timelineEndHour])

  // ── 인라인 이벤트 생성 폼 상태 ───────────────
  // Python으로 치면: self.new_form = None | { start, end, screenX, screenY }
  // screenX/Y: 클릭한 화면 좌표 → fixed 포지션 폼 배치에 사용 (overflow clipping 방지)
  const [newForm, setNewForm] = useState<{ start: string; end: string; screenX: number; screenY: number } | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState('blue')
  // 새 이벤트 시간 미지정 여부 — true 시 scheduled=false로 저장
  // Python으로 치면: self.new_unscheduled: bool = False
  const [newUnscheduled, setNewUnscheduled] = useState(false)
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
  // ── 타임라인 스크롤 컨테이너 ref (초기 스크롤 위치 설정용) ──
  const scrollRef = useRef<HTMLDivElement>(null)
  // ── 블록 전체 영역 ref (fixed 폼 외부 클릭 감지 기준) ──
  const blockRef = useRef<HTMLDivElement>(null)

  // ── 타임라인 초기 스크롤: plannerStartHour 위치로 이동 ──
  // Python으로 치면: def on_mount(self): self.scroll_to(start_hour * HOUR_PX)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [timelineStartHour])

  // ── 우측 패널 모드: list | detail ───────────
  // selectedEventId: null 이면 list 모드, id 있으면 detail 모드
  // Python으로 치면: self.selected_event_id: str | None = None
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  // ── 이벤트 드래그·리사이즈 컨트롤러 ───────────
  // Python으로 치면: drag_controller = PlannerEventDragController(...)
  const {
    draggingId,
    dragPreviewTop,
    resizingId,
    resizePreviewHeight,
    startDrag,
    startResize,
    consumeDraggedClick,
  } = usePlannerEventDrag({
    hourPx: HOUR_PX,
    startHour: timelineStartHour,
    endHour: timelineEndHour,
    snapMin: plannerSnapMin,
    onUpsertEvent: upsertEvent,
    onSelectEvent: setSelectedEventId,
  })

  // ── 빈 슬롯 클릭 → 폼 열기 ──────────────────
  // Python으로 치면: def on_slot_click(y): new_form = { start: y_to_time(y), end: y_to_time(y+60) }
  // screenX/Y 저장 → fixed 폼이 overflow-y-auto에 잘리지 않도록
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (consumeDraggedClick()) return
    // 일정 카드/리사이즈 핸들에서 버블된 click은 빈 타임라인 클릭이 아니다.
    // Python으로 치면: if event.target.closest('button'): return
    if ((e.target as HTMLElement).closest('button')) return
    if (newForm || editingEvent || draggingId) return
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return
    const y     = e.clientY - rect.top
    const start = yToTime(y, HOUR_PX, timelineStartHour, timelineEndHour, plannerSnapMin)
    const startMin = timeToMin(start)
    const end   = minToTime(Math.min(startMin + 60, timelineEndHour * 60))
    setNewForm({ start, end, screenX: e.clientX, screenY: e.clientY })
    setNewTitle('')
    setNewColor('blue')
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }

  // ── 새 이벤트 저장 ────────────────────────────
  // newUnscheduled=true 이면 scheduled=false로 저장 (자정 일정과 충돌 방지)
  // Python으로 치면: def save_new(): scheduled = not unscheduled
  function handleSaveNew() {
    if (!newForm || !newTitle.trim()) { setNewForm(null); return }
    upsertEvent({
      id:    crypto.randomUUID(),
      title: newTitle.trim(),
      start: newUnscheduled ? '' : newForm.start,
      end:   newUnscheduled ? '' : newForm.end,
      color: newColor,
      done:  false,
      scheduled: !newUnscheduled,
      source: 'manual',
    })
    setNewForm(null)
    setNewTitle('')
    setNewUnscheduled(false)
  }

  // ── 이벤트 클릭 → 상세 기록 패널 열기 ───────
  // Python으로 치면: def open_detail(ev): self.selected_event_id = ev.id
  function openDetail(ev: PlanEvent) {
    setSelectedEventId(ev.id)
  }

  // ── 이벤트 클릭 → 수정 팝업 (이벤트 목록에서 연필 아이콘 클릭 시) ──
  // Python으로 치면: def open_edit(ev): self.editing_event = ev
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

  // ── 사이드바 너비 리사이즈 상태 ──────────────
  // sidebarWidth: 우측 패널 너비 (px), 최소 160 ~ 최대 480
  // Python으로 치면: self.sidebar_width: int = 256
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // ── 사이드바 리사이즈 핸들 mousedown ──────────
  // Python으로 치면: def on_resize_handle_mousedown(e): resize_ref = { startX, startWidth }
  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault()
    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }
  }

  // ── window mousemove/mouseup 에 사이드바 리사이즈 추가 ──
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = sidebarResizeRef.current
      if (!r) return
      // 핸들을 왼쪽으로 드래그 → 사이드바 넓어짐 (delta 반전)
      const delta = r.startX - e.clientX
      setSidebarWidth(Math.min(480, Math.max(160, r.startWidth + delta)))
    }
    function onUp() { sidebarResizeRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── 완료 이벤트 숨기기 토글 ──────────────────
  // Python으로 치면: self.hide_done: bool = False
  const [hideDone, setHideDone] = useState(false)

  // ── 완료 이벤트 수 + 표시할 이벤트 필터 ────────
  // hideDone=true 이면 done 이벤트를 타임라인·목록 양쪽에서 제거
  // Python으로 치면: visible = [e for e in events if not (hide_done and e.done)]
  const doneCount     = events.filter(e => e.done).length
  const visibleEvents = hideDone ? events.filter(e => !e.done) : events

  // ── 특정 날짜에 해당하는 루틴 이벤트 생성 ─────
  // Python으로 치면: def routines_for_date(ds): return [r for r in routines if matches_day(r, ds)]
  function routineEventsForDate(ds: string, sourceRoutines: Routine[] = plannerRoutines): PlanEvent[] {
    const dow = new Date(ds + 'T00:00:00').getDay() // 0=일~6=토
    return sourceRoutines
      .filter(r => {
        const days = Array.isArray(r.days) ? r.days : []
        return days.length === 0 || days.includes(dow)
      })
      .map(r => ({
        id:    crypto.randomUUID(),
        title: r.title,
        start: r.start,
        end:   r.end,
        color: r.color,
        done:  false,
        scheduled: true,
        source: 'routine',
        routineId: r.id,
      }))
  }

  // ── 이 날에 루틴 수동 적용 ────────────────────
  // Python으로 치면: def apply_routines_today(): events += routines_for_date(current_date)
  function applyRoutinesToday() {
    const latestRoutines = useSettingsStore.getState().plannerRoutines
    const toAdd = routineEventsForDate(currentDate, latestRoutines)
    if (!toAdd.length) return
    // 중복 제목+시간 건너뜀
    save(currentDate, latestEvents => {
      const existing = new Set(latestEvents.map(e => `${e.title}|${e.start}`))
      const filtered = toAdd.filter(e => !existing.has(`${e.title}|${e.start}`))
      return filtered.length > 0 ? sortEvents([...latestEvents, ...filtered]) : latestEvents
    })
  }

  // ── 날짜 변경 — autoApply 시 루틴 자동 삽입 ──
  // 날짜 이동은 currentDate 로컬 state만 변경 (block.content 수정 없음)
  // 이동 날짜에 이벤트가 없고 plannerAutoApply=true 이면 루틴 이벤트 자동 저장
  // Python으로 치면: def change_date(delta): current_date = ds; if auto_apply and no_events: save_routines()
  function changeDate(delta: number) {
    const d = new Date(currentDate + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    setCurrentDate(ds)

    // 이동 날짜에 autoApply=true 이면 누락된 루틴만 보충 적용
    const latestData = readLatestPlannerData()
    const destEvents = latestData.eventsByDate[ds] ?? []
    if (plannerAutoApply) {
      const routineEvs = routineEventsForDate(ds)
      const existing = new Set(destEvents.map(e => `${e.title}|${e.start}`))
      const filtered = routineEvs.filter(e => !existing.has(`${e.title}|${e.start}`))
      if (filtered.length > 0) {
        // 현재 data는 setCurrentDate 이전 기준이므로 대상 날짜를 명시해 저장
        save(ds, sortEvents([...destEvents, ...filtered]))
      }
    }
    // 날짜 이동 시 선택된 이벤트 초기화
    setSelectedEventId(null)
  }

  // ── 텍스트 입력 디바운스 타이머 ref ──────────
  // patchEvent / saveReview 의 타이머를 각각 관리
  // Python으로 치면: self._patch_timer: int | None = None
  const patchTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 일일 회고 저장 헬퍼 (300ms 디바운스) ─────
  // 타이핑마다 호출되므로 디바운스 적용 — 서버 응답 레이스 컨디션 방지
  // 스테일 클로저 방지: 타이머 발화 시 스토어에서 최신 데이터를 직접 읽음
  // (이벤트 추가 직후 회고 저장 시 eventsByDate가 이전 버전으로 덮어쓰이는 버그 방지)
  // Python으로 치면: def save_review(date, text): debounce(300, _do_save)(date, text)
  const saveReview = useCallback((date: string, text: string) => {
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current)
    reviewTimerRef.current = setTimeout(() => {
      reviewTimerRef.current = null
      commitPlannerData(latest => ({
        eventsByDate: latest.eventsByDate,
        reviewByDate: { ...(latest.reviewByDate ?? {}), [date]: text },
      }))
    }, 300)
  }, [commitPlannerData])

  // ── 이벤트 단일 필드 업데이트 헬퍼 ──────────
  // immediate=true: 에너지 클릭 등 즉각 반응 필요한 경우 디바운스 없이 저장
  // immediate=false(기본): log textarea 타이핑 등 300ms 디바운스 적용
  // Python으로 치면: def patch_event(id, immediate=False, **kwargs): ...
  const patchEvent = useCallback((id: string, patch: Partial<PlanEvent>, immediate = false) => {
    const doSave = () => {
      patchTimerRef.current = null
      // 최신 events를 스토어에서 직접 읽어 stale 클로저 방지
      // Python으로 치면: events = store.get_events(page_id, block_id, date)
      save(currentDate, latestEvents => latestEvents.map(
        e => e.id === id ? { ...e, ...patch } : e
      ))
    }
    if (immediate) {
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
      doSave()
    } else {
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
      patchTimerRef.current = setTimeout(doSave, 300)
    }
  }, [currentDate, save])

  // ── 루틴 모달 상태 ───────────────────────────
  // Python으로 치면: self.routine_modal_open: bool = False
  const [routineOpen, setRoutineOpen] = useState(false)

  // ── 파일 Import용 숨겨진 input ref ─────────────
  // Python으로 치면: self.import_file_input = QFileDialog()
  const importFileRef = useRef<HTMLInputElement>(null)

  // ── 플래너 전체 데이터 Export (루틴 + 이벤트) ─────
  // Python으로 치면: def export_planner_data(): json.dump({routines, events}, file)
  function exportPlannerData() {
    const payload = {
      version:     1,
      exportedAt:  new Date().toISOString(),
      routines:    plannerRoutines,
      eventsByDate: data.eventsByDate,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `planner-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 플래너 전체 데이터 Import (루틴 + 이벤트 병합) ─
  // Python으로 치면: def import_planner_data(file): routines = json.load(file)['routines']
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        if (json.version !== 1) { alert('지원하지 않는 백업 형식입니다.'); return }
        let routinesImported = true
        // 루틴: 기존 루틴과 병합 (id 기준, 중복 시 가져온 것 우선)
        if (Array.isArray(json.routines)) {
          const merged = [...plannerRoutines]
          for (const raw of json.routines) {
            if (!raw || typeof raw !== 'object') continue
            const r = raw as Partial<Routine>
            if (!r.title || !r.start || !r.end) continue
            const color = typeof r.color === 'string' && EVENT_COLORS.some(c => c.id === r.color) ? r.color : 'blue'
            const normalized: Routine = {
              id:    r.id || crypto.randomUUID(),
              title: r.title,
              start: r.start,
              end:   r.end,
              color,
              days:  Array.isArray(r.days) ? r.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [],
            }
            const idx = merged.findIndex(x => x.id === normalized.id)
            if (idx >= 0) merged[idx] = normalized
            else merged.push(normalized)
          }
          const saved = setPlannerRoutines(merged)
          routinesImported = saved
        }
        // 이벤트: 기존 eventsByDate와 병합 (날짜 기준, 중복 시 가져온 것 우선)
        if (json.eventsByDate && typeof json.eventsByDate === 'object') {
          commitPlannerData(latest => ({
            eventsByDate: { ...latest.eventsByDate, ...json.eventsByDate },
            reviewByDate: latest.reviewByDate ?? {},
          }))
          savePageNow(pageId).catch(() => {})
        }
        alert(routinesImported
          ? '가져오기 완료! 루틴과 이벤트가 복원됐습니다.'
          : '일정 데이터는 복원됐지만, 현재 볼트의 루틴 파일을 보호하기 위해 루틴은 가져오지 않았습니다.')
      } catch {
        alert('파일을 읽는 중 오류가 발생했습니다. 올바른 백업 파일인지 확인하세요.')
      }
    }
    reader.readAsText(file)
    // 같은 파일 재선택 가능하도록 초기화
    e.target.value = ''
  }

  // ── 아카이브 모달 상태 ────────────────────────
  // Python으로 치면: self.archive_open: bool = False
  const [archiveOpen, setArchiveOpen] = useState(false)

  // 루틴 추가/수정 폼 상태
  // Python으로 치면: self.routine_form: Routine | None = None
  const EMPTY_ROUTINE = (): Routine => ({
    id: '', title: '', start: '09:00', end: '10:00', color: 'blue', days: [1,2,3,4,5],
  })
  const [routineForm, setRoutineForm] = useState<Routine | null>(null)

  // ── 루틴 저장/삭제 헬퍼 — settingsStore 사용 ─
  // Python으로 치면: def upsert_routine(r): settings.planner_routines = upsert(routines, r)
  function upsertRoutine(r: Routine) {
    const updated = plannerRoutines.some(x => x.id === r.id)
      ? plannerRoutines.map(x => x.id === r.id ? r : x)
      : [...plannerRoutines, { ...r, id: crypto.randomUUID() }]
    if (!setPlannerRoutines(updated)) return
    setRoutineForm(null)
  }
  function deleteRoutine(id: string) {
    setPlannerRoutines(plannerRoutines.filter(r => r.id !== id))
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
      date: currentDate,
      events: events.map(e => ({
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
        scheduled: true,
        source: 'manual',
      }))

      const action = parsed.action ?? 'add'
      if (action === 'replace') {
        save(currentDate, sortEvents(newEvents))
      } else {
        save(currentDate, latestEvents => sortEvents([...latestEvents, ...newEvents]))
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
          scheduled: true,
          source: 'manual',
        }))
      setPendingEvents(previews)
    } catch {
      setPendingEvents([])
    }
  }

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
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b hairline"
           style={{ background: 'var(--color-sunken)' }}>
        {/* 날짜 네비게이션 */}
        {/* 기록 dot: 해당 날짜에 log/subtasks/review 있으면 주황 dot 표시 */}
        {/* Python으로 치면: def has_record(ds): return bool(events[ds].log or events[ds].subtasks or review[ds]) */}
        {(() => {
          // 날짜 문자열 → 하루 전/후 계산
          const prevDate = (() => { const d = new Date(currentDate + 'T00:00:00'); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10) })()
          const nextDate = (() => { const d = new Date(currentDate + 'T00:00:00'); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10) })()
          const hasRecord = (ds: string) => {
            const evs = data.eventsByDate[ds] ?? []
            return evs.some(e => e.log || (e.subtasks && e.subtasks.length > 0)) || !!(data.reviewByDate?.[ds])
          }
          return (
            <>
              <div className="flex flex-col items-center">
                <button type="button" onClick={() => changeDate(-1)}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                  <ChevronLeft size={14} />
                </button>
                {hasRecord(prevDate) && <span className="w-1 h-1 rounded-full bg-orange-400 -mt-0.5" />}
              </div>
              <input
                type="date"
                value={currentDate}
                onChange={e => { setCurrentDate(e.target.value); setSelectedEventId(null) }}
                className="h-7 text-sm font-semibold bg-transparent border-none outline-none cursor-pointer"
                style={{ color: 'var(--color-text)' }}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-subtle)' }}>{formatDate(currentDate)}</span>
              {currentDate === todayStr() && (
                <span className="inline-flex h-6 items-center rounded-md px-2 text-[10px] font-semibold"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}>오늘</span>
              )}
              {/* 현재 날짜 기록 dot */}
              {hasRecord(currentDate) && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
              <div className="flex flex-col items-center">
                <button type="button" onClick={() => changeDate(1)}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                  <ChevronRight size={14} />
                </button>
                {hasRecord(nextDate) && <span className="w-1 h-1 rounded-full bg-orange-400 -mt-0.5" />}
              </div>
            </>
          )
        })()}

        {/* 날씨 표시 — weatherLocation 설정 시 Open-Meteo에서 자동 fetch */}
        {weatherLoading && (
          <span className="inline-flex h-7 items-center rounded-md px-2 text-xs animate-pulse"
                style={{ color: 'var(--color-text-subtle)', background: 'var(--color-surface)' }}>날씨 로딩...</span>
        )}
        {!weatherLoading && weather && (
          <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs"
                style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <span className="text-sm leading-none">{weather.icon}</span>
            <span className="font-medium">{weather.temp}</span>
          </span>
        )}

        <div className="flex-1" />

        {/* 이벤트 수 / 완료 수 + 숨기기 토글 */}
        <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-subtle)' }}>
          {doneCount}/{events.length} 완료
        </span>
        {/* 완료 이벤트 숨기기 토글 — hideDone=true 시 파란 배경 */}
        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => setHideDone(v => !v)}
            title={hideDone ? '완료 이벤트 보기' : '완료 이벤트 숨기기'}
            className={[
              'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-all border',
              hideDone
                ? 'bg-blue-500 text-white border-blue-500'
                : 'text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-500',
            ].join(' ')}
          >
            {hideDone ? <EyeOff size={11} /> : <Eye size={11} />}
            {hideDone ? '숨김' : '표시'}
          </button>
        )}
        {/* 활성 클럭 배지 — clockIn 중인 이벤트 수 + 경과 시간 */}
        {activeClocks.length > 0 && (
          <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] bg-green-50 text-green-600 border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
            {activeClocks.length === 1
              ? elapsedStr(activeClocks[0].clockIn!)
              : `${activeClocks.length}개 실행 중`
            }
          </span>
        )}

        {/* 오늘로 이동 */}
        {currentDate !== todayStr() && (
          <button type="button" onClick={() => setCurrentDate(todayStr())}
            className="inline-flex h-7 items-center rounded-md border px-2 text-[10px] font-medium transition-colors"
            style={{ color: 'var(--color-accent-ink)', borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)' }}>
            오늘
          </button>
        )}

        {/* 알림 권한 거부 경고 뱃지 — 클릭 시 재요청 */}
        {notifyDenied && (
          <button
            type="button"
            onClick={() => Notification.requestPermission().then(p => setNotifyDenied(p === 'denied'))}
            title="알림이 차단되었습니다. 클릭하여 권한 요청"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10px] bg-amber-50 border border-amber-300 text-amber-600 hover:bg-amber-100 transition-colors"
          >
            🔔 알림 차단됨
          </button>
        )}

        {/* 타임라인 줌 조절 — ZOOM_STEPS: 32|48|64|96 px/hour */}
        <div className="flex h-7 items-center gap-0.5 rounded-md px-0.5"
             style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <button
            type="button"
            onClick={() => {
              const idx = ZOOM_STEPS.indexOf(plannerZoom as typeof ZOOM_STEPS[number])
              if (idx > 0) setPlannerZoom(ZOOM_STEPS[idx - 1])
            }}
            disabled={plannerZoom <= ZOOM_STEPS[0]}
            title="타임라인 축소"
            className="w-6 h-6 inline-flex items-center justify-center rounded text-xs font-bold leading-none transition-colors disabled:opacity-30"
            style={{ color: 'var(--color-text-muted)' }}
          >−</button>
          <span className="w-8 text-center text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{plannerZoom}px</span>
          <button
            type="button"
            onClick={() => {
              const idx = ZOOM_STEPS.indexOf(plannerZoom as typeof ZOOM_STEPS[number])
              if (idx < ZOOM_STEPS.length - 1) setPlannerZoom(ZOOM_STEPS[idx + 1])
            }}
            disabled={plannerZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            title="타임라인 확대"
            className="w-6 h-6 inline-flex items-center justify-center rounded text-xs font-bold leading-none transition-colors disabled:opacity-30"
            style={{ color: 'var(--color-text-muted)' }}
          >+</button>
        </div>

        {/* 데이터 백업 Export 버튼 */}
        <button
          type="button"
          onClick={exportPlannerData}
          title="루틴·일정 전체 백업 (JSON 다운로드)"
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-200"
        >
          <Download size={13} /> 백업
        </button>

        {/* 루틴 관리 버튼 */}
        <button
          type="button"
          onClick={() => setRoutineOpen(v => !v)}
          title="반복 루틴 관리"
          className={[
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all',
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
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all',
            aiOpen
              ? 'bg-violet-500 text-white shadow-sm'
              : 'text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200',
          ].join(' ')}
        >
          <Bot size={13} />
          AI 도우미
        </button>

        {/* 아카이브 열람 버튼 — 90일 초과 기록 열람 전용 */}
        <button
          type="button"
          onClick={() => setArchiveOpen(true)}
          title="아카이브 — 90일 이전 기록 열람 (읽기 전용)"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all"
          style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <Archive size={13} />
        </button>
      </div>

      {/* 본문 flex — 블록 최대 높이를 680px로 고정하여 타임라인·이벤트 목록이 같은 높이로 나란히 스크롤 */}
      {/* Python으로 치면: body_frame = tk.Frame(self, height=680) */}
      <div className="flex" style={{ height: '680px' }}>

        {/* ── 타임라인 영역 ─────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <PlannerTimeline
            events={visibleEvents}
            hourPx={HOUR_PX}
            startHour={timelineStartHour}
            endHour={timelineEndHour}
            nowTop={nowTop}
            timelineRef={timelineRef}
            onTimelineClick={handleTimelineClick}
            onEventMouseDown={startDrag}
            onResizeMouseDown={startResize}
            selectedEventId={selectedEventId}
            draggingId={draggingId}
            resizingId={resizingId}
            editable
          >

              {/* 드래그 프리뷰 — 실제 이벤트 위치에 따라 이동 */}
              {draggingId && dragPreviewTop !== null && (() => {
                const draggedEv = events.find(e => e.id === draggingId)
                if (!draggedEv) return null
                const px = eventPx(draggedEv, HOUR_PX, timelineStartHour, timelineEndHour)
                if (!px) return null
                const c = getColor(draggedEv.color)
                const duration = timeToMin(draggedEv.end) - timeToMin(draggedEv.start)
                const previewStartMin = Math.round(dragPreviewTop / (HOUR_PX / 60) / plannerSnapMin) * plannerSnapMin + timelineStartHour * 60
                const clamped = Math.max(timelineStartHour * 60, Math.min(timelineEndHour * 60 - duration, previewStartMin))
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

              {/* 리사이즈 프리뷰 — 하단 핸들 드래그 중 새 종료 시간 미리보기 */}
              {resizingId && resizePreviewHeight !== null && (() => {
                const resizingEv = events.find(e => e.id === resizingId)
                if (!resizingEv) return null
                const px = eventPx(resizingEv, HOUR_PX, timelineStartHour, timelineEndHour)
                if (!px) return null
                const c = getColor(resizingEv.color)
                const pxPerMin = HOUR_PX / 60
                const newEndMin = Math.min(timelineEndHour * 60,
                  Math.max(timeToMin(resizingEv.start) + plannerSnapMin,
                    Math.round(resizePreviewHeight / pxPerMin / plannerSnapMin) * plannerSnapMin + timeToMin(resizingEv.start)
                  )
                )
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top:    px.top + 1,
                      height: resizePreviewHeight - 2,
                      left: 2, right: 2,
                      zIndex: 25,
                      pointerEvents: 'none',
                    }}
                    className={['rounded-lg px-2 overflow-hidden flex flex-col justify-start shadow-lg ring-2 ring-white/60', c.bg, c.text].join(' ')}
                  >
                    <span className="text-[11px] font-semibold truncate leading-tight mt-0.5">
                      {resizingEv.title}
                    </span>
                    <span className="text-[9px] opacity-80 leading-tight">
                      {resizingEv.start} – {minToTime(newEndMin)}
                    </span>
                  </div>
                )
              })()}

              {/* AI 제안 ghost 미리보기 — 점선 테두리로 타임라인에 표시 */}
              {pendingEvents.map((ev, idx) => {
                const px = eventPx(ev, HOUR_PX, timelineStartHour, timelineEndHour)
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
          </PlannerTimeline>
        </div>

        {/* ── 리사이즈 핸들 — 타임라인 / 사이드바 경계 ── */}
        {/* mousedown → startSidebarResize, mousemove/mouseup → window 리스너에서 처리 */}
        {/* Python으로 치면: resize_handle = QSplitterHandle() */}
        <div
          onMouseDown={startSidebarResize}
          className="w-1 shrink-0 cursor-col-resize hover:bg-blue-300 bg-transparent transition-colors group relative"
          style={{ zIndex: 10 }}
        >
          {/* 시각적 핸들 — hover 시 파란 선 */}
          <div className="absolute inset-y-0 left-0 w-px bg-gray-200 group-hover:bg-blue-400 transition-colors" />
        </div>

        {/* ── 오른쪽: 이벤트 목록 / 상세 기록 패널 ─ */}
        {/* selectedEventId 없으면 list 모드, 있으면 detail 모드 */}
        {/* Python으로 치면: if selected_event_id: render_detail() else: render_list() */}
        {/* 오른쪽 패널 — flex-col + overflow-hidden으로 내부 이벤트 목록만 스크롤 */}
        <div className="border-l border-gray-200 flex flex-col shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>
          {selectedEventId === null ? (
            /* ── LIST 모드 ──────────────────────────── */
            <>
              {/* 헤더 */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
                <span className="text-[11px] font-medium text-gray-500">{t.planner.day.eventList}</span>
                <button type="button"
                  onClick={(e) => {
                    const h = new Date().getHours()
                    const startHour = Math.max(timelineStartHour, Math.min(timelineEndHour - 1, h))
                    const start = `${String(startHour).padStart(2,'0')}:00`
                    const end   = `${String(Math.min(timelineEndHour, startHour + 1)).padStart(2,'0')}:00`
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

              {/* 완료율 요약 바 */}
              {events.length > 0 && (() => {
                // 계획 시간 합산 (분), 완료된 이벤트 기준 실제 시간 합산
                // Python으로 치면: total_planned = sum(end-start for e in scheduled_events)
                const scheduledEvs = events.filter(isScheduledEvent)
                const totalPlanned = scheduledEvs.reduce((acc, e) => acc + Math.max(0, timeToMin(e.end) - timeToMin(e.start)), 0)
                const donePlanned  = scheduledEvs.filter(e => e.done).reduce((acc, e) => acc + Math.max(0, timeToMin(e.end) - timeToMin(e.start)), 0)
                const doneEvCount  = events.filter(e => e.done).length
                const pct          = events.length > 0 ? Math.round((doneEvCount / events.length) * 100) : 0
                const fmtMin       = (m: number) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`
                return (
                  <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                    {/* 진행률 바 */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                        {doneEvCount}/{events.length} {t.planner.day.summaryComplete}
                      </span>
                    </div>
                    {/* 시간 요약 */}
                    {totalPlanned > 0 && (
                      <div className="flex gap-2 text-[9px] text-gray-400">
                        <span>{t.planner.day.summaryTotalPlan} {fmtMin(totalPlanned)}</span>
                        <span className="text-emerald-500">{t.planner.day.summaryDone} {fmtMin(donePlanned)}</span>
                        <span className="text-orange-400">{t.planner.day.summaryRemain} {fmtMin(Math.max(0, totalPlanned - donePlanned))}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* 하루 흐름 요약 — 시간표만 나열하지 않고 계획·실행·마감 상태를 한눈에 보여준다. */}
              {/* Python으로 치면: stages = {plan: pending, executed: done, closeout: has_review} */}
              <div className="grid grid-cols-3 border-b border-gray-100 shrink-0 text-center">
                <div className="border-r border-gray-100 px-1 py-2">
                  <div className="text-[9px] text-blue-500">{t.planner.day.planStage}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-gray-700">{events.filter(event => !event.done).length}</div>
                </div>
                <div className="border-r border-gray-100 px-1 py-2">
                  <div className="text-[9px] text-emerald-500">{t.planner.day.executedStage}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-gray-700">{doneCount}</div>
                </div>
                <div className="px-1 py-2">
                  <div className="text-[9px] text-violet-500">{t.planner.day.closeoutStage}</div>
                  <div className="mt-0.5 truncate text-[10px] font-medium text-gray-600">
                    {data.reviewByDate?.[currentDate]?.trim()
                      ? t.planner.day.closeoutRecorded
                      : t.planner.day.closeoutPending}
                  </div>
                </div>
              </div>

              {/* 이벤트 목록 — 예정과 실행 완료를 분리해 다음 행동과 결과를 함께 읽는다. */}
              <div className="flex-1 overflow-auto">
                {events.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center mt-6 px-3 whitespace-pre-line">
                    {t.planner.day.noEventsHint}
                  </p>
                ) : (() => {
                  // 계획(미완료) / 실행 완료를 먼저 분리한 뒤, 같은 단계 안에서는 시간순으로 정렬한다.
                  // Python으로 치면: planned, executed = partition(visible_events, lambda event: not event.done)
                  const sortStageEvents = (stageEvents: PlanEvent[]) => [...stageEvents].sort((a, b) => {
                    const aScheduled = isScheduledEvent(a)
                    const bScheduled = isScheduledEvent(b)
                    if (aScheduled && bScheduled) return a.start.localeCompare(b.start)
                    if (aScheduled) return -1
                    if (bScheduled) return 1
                    return a.title.localeCompare(b.title)
                  })
                  const plannedEvents = sortStageEvents(visibleEvents.filter(event => !event.done))
                  const executedEvents = sortStageEvents(visibleEvents.filter(event => event.done))

                  // 이벤트 행 렌더 — 클릭 시 detail 패널로 전환
                  // Python으로 치면: def render_event_row(ev): ...
                  const renderRow = (ev: PlanEvent) => {
                    const c = getColor(ev.color)
                    const hasRecord = !!(ev.log || (ev.subtasks && ev.subtasks.length > 0))
                    return (
                      <div key={ev.id}
                        className="flex items-start gap-2 px-3 py-2 border-b border-gray-50 group hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => openDetail(ev)}
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
                          <div className="flex items-center gap-1">
                            <span className={['text-[11px] font-medium text-gray-700 truncate', ev.done ? 'line-through text-gray-400' : ''].join(' ')}>
                              {ev.title}
                            </span>
                            {/* 기록 있음 표시 dot */}
                            {hasRecord && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {isScheduledEvent(ev) ? `${ev.start} – ${ev.end}` : t.planner.day.unscheduled}
                          </div>
                          {/* 활성 클럭 표시 */}
                          {ev.clockIn && !ev.clockOut && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                              <span className="text-[10px] text-green-600 font-medium tabular-nums">{elapsedStr(ev.clockIn)}</span>
                            </div>
                          )}
                          {ev.elapsed !== undefined && ev.elapsed > 0 && ev.clockOut && (
                            <div className="text-[10px] text-gray-400 mt-0.5">⏱ 총 {ev.elapsed}분</div>
                          )}
                        </div>
                        {/* hover 액션 버튼 */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <button type="button"
                            onClick={e => { e.stopPropagation(); openEdit(ev) }}
                            title="수정"
                            className="p-0.5 text-gray-300 hover:text-blue-500 rounded transition-all">
                            <Pencil size={11} />
                          </button>
                          {!ev.done && (!ev.clockIn || ev.clockOut) && (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); handleClockIn(ev.id) }}
                              title="Clock In — 작업 시작"
                              className="p-0.5 text-gray-300 hover:text-green-500 rounded transition-all">
                              <Timer size={11} />
                            </button>
                          )}
                          {!ev.done && ev.clockIn && !ev.clockOut && (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); handleClockOut(ev.id) }}
                              title="Clock Out — 작업 종료"
                              className="p-0.5 text-green-500 hover:text-orange-500 rounded transition-all">
                              <TimerOff size={11} />
                            </button>
                          )}
                          <button type="button"
                            onClick={e => { e.stopPropagation(); deleteEvent(ev.id) }}
                            className="p-0.5 text-gray-300 hover:text-red-500 rounded transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    )
                  }

                  const renderStage = (
                    title: string,
                    accentClass: string,
                    stageEvents: PlanEvent[],
                    emptyText: string,
                  ) => (
                    <section className="border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50/70">
                        <span className={`h-1.5 w-1.5 rounded-full ${accentClass}`} />
                        <span className="text-[10px] font-semibold text-gray-500">{title}</span>
                        <span className="text-[9px] text-gray-400">{stageEvents.length}</span>
                      </div>
                      {stageEvents.length > 0
                        ? stageEvents.map(renderRow)
                        : <p className="px-3 py-3 text-[10px] text-gray-400">{emptyText}</p>}
                    </section>
                  )

                  return <>
                    {renderStage(t.planner.day.planStage, 'bg-blue-400', plannedEvents, t.planner.day.noPlannedEvents)}
                    {!hideDone && renderStage(t.planner.day.executedStage, 'bg-emerald-400', executedEvents, t.planner.day.noExecutedEvents)}
                  </>
                })()}
              </div>

              {/* 마감 기록 섹션 (하단 고정) */}
              <div className="border-t border-gray-100 px-3 py-2 shrink-0">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] font-medium text-gray-500">🌙 {t.planner.day.closeoutStage}</span>
                </div>
                <textarea
                  value={data.reviewByDate?.[currentDate] ?? ''}
                  onChange={e => saveReview(currentDate, e.target.value)}
                  placeholder={t.planner.day.dailyReviewPlaceholder}
                  rows={3}
                  className="w-full text-[11px] text-gray-700 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-blue-300 transition-colors"
                />
              </div>
            </>
          ) : (
            /* ── DETAIL 모드 ────────────────────────── */
            /* selectedEventId에 해당하는 이벤트 상세 기록 패널 */
            /* EventDetailPanel로 분리하여 로컬 state 사용 (타이핑 성능 개선) */
            (() => {
              const ev = events.find(e => e.id === selectedEventId)
              if (!ev) {
                setSelectedEventId(null)
                return null
              }
              return (
                <EventDetailPanel
                  key={ev.id}
                  ev={ev}
                  patchEvent={patchEvent}
                  toggleDone={toggleDone}
                  setSelectedEventId={setSelectedEventId}
                  t={t}
                />
              )
            })()
          )}
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
        const FORM_W = 268
        const FORM_H = 185
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
            {/* 시간 미지정 토글 */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newUnscheduled}
                onChange={e => setNewUnscheduled(e.target.checked)}
                className="w-3 h-3 rounded accent-blue-500"
              />
              <span className="text-[10px] text-gray-500">시간 미지정</span>
            </label>
            {/* 시간 범위 — 24시간 select (오전/오후 혼란 방지) */}
            {/* Python으로 치면: start_h, start_m = start.split(':'); end_h, end_m = end.split(':') */}
            <div className={['flex items-center gap-1 transition-opacity', newUnscheduled ? 'opacity-30 pointer-events-none' : ''].join(' ')}>
              {/* 시작 시 */}
              <select
                value={newForm.start.split(':')[0] ?? '09'}
                onChange={e => setNewForm(f => f ? { ...f, start: `${e.target.value}:${f.start.split(':')[1] ?? '00'}` } : f)}
                className="text-xs text-gray-600 border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white">
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-[10px] text-gray-400 shrink-0">:</span>
              {/* 시작 분 */}
              <select
                value={newForm.start.split(':')[1] ?? '00'}
                onChange={e => setNewForm(f => f ? { ...f, start: `${f.start.split(':')[0] ?? '09'}:${e.target.value}` } : f)}
                className="text-xs text-gray-600 border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white">
                {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="text-xs text-gray-400 shrink-0 mx-0.5">~</span>
              {/* 종료 시 */}
              <select
                value={newForm.end.split(':')[0] ?? '10'}
                onChange={e => setNewForm(f => f ? { ...f, end: `${e.target.value}:${f.end.split(':')[1] ?? '00'}` } : f)}
                className="text-xs text-gray-600 border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white">
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-[10px] text-gray-400 shrink-0">:</span>
              {/* 종료 분 */}
              <select
                value={newForm.end.split(':')[1] ?? '00'}
                onChange={e => setNewForm(f => f ? { ...f, end: `${f.end.split(':')[0] ?? '10'}:${e.target.value}` } : f)}
                className="text-xs text-gray-600 border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white">
                {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
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
                  onClick={() => setPlannerAutoApply(!plannerAutoApply)}
                  className={[
                    'w-9 h-5 rounded-full transition-all relative',
                    plannerAutoApply ? 'bg-emerald-400' : 'bg-gray-200',
                  ].join(' ')}
                >
                  <span className={[
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                    plannerAutoApply ? 'left-4.5' : 'left-0.5',
                  ].join(' ')} />
                </button>
              </div>
            </div>

            {/* 루틴 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {plannerRoutines.length === 0 && !routineForm && (
                <p className="text-[12px] text-gray-400 text-center py-8">
                  아직 루틴이 없습니다.<br />아래 버튼으로 추가해보세요.
                </p>
              )}
              {plannerRoutines.map(r => {
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRoutineForm(EMPTY_ROUTINE())}
                  disabled={!!routineForm}
                  className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-40 transition-colors"
                >
                  <Plus size={13} /> 루틴 추가
                </button>
                {/* 숨겨진 파일 선택 input — Import 버튼 클릭 시 트리거 */}
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportFile}
                />
                {/* 백업 복원 버튼 */}
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  title="JSON 백업 파일에서 루틴·일정 복원"
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium transition-colors"
                >
                  <Upload size={12} /> 복원
                </button>
              </div>
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
              {/* TimeInput — 24시간 분리 입력 */}
              <TimeInput value={editStart} onChange={setEditStart} focusColor="focus:border-blue-400" />
              <span className="text-xs text-gray-400">~</span>
              <TimeInput value={editEnd} onChange={setEditEnd} focusColor="focus:border-blue-400" />
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

      {/* ── 아카이브 열람 모달 (읽기 전용) ─────────
          90일 초과 데이터를 월별로 탐색, 수정 불가
          Python으로 치면: if archive_open: render ArchiveModal()
      ──────────────────────────────────────── */}
      {archiveOpen && (
        <PlannerArchiveModal onClose={() => setArchiveOpen(false)} />
      )}
    </div>
  )
}
