// ==============================================
// src/components/editor/GanttBlock.tsx
// 역할: 타임라인/갠트 차트 블록
//   - 편집 모드: 태스크 테이블 (이름/시작일/종료일/진행률/색상)
//   - 미리보기 모드: 순수 CSS div 기반 갠트 차트
// content JSON 구조:
//   { title, tasks: [{id, name, start, end, color, progress}] }
// Python으로 치면: class GanttBlock(Widget): ...
// ==============================================

'use client'

import { useState, useCallback, useRef } from 'react'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

// ── 태스크 하나의 구조 ────────────────────────
// Python으로 치면: @dataclass class GanttTask: id:str; name:str; start:str; end:str; color:str; progress:int
interface GanttTask {
  id: string
  name: string
  start: string      // "YYYY-MM-DD"
  end: string        // "YYYY-MM-DD"
  color: string
  progress: number   // 0~100
}

// ── 갠트 데이터 전체 구조 ─────────────────────
// Python으로 치면: @dataclass class GanttData: title:str; tasks:list[GanttTask]
interface GanttData {
  title: string
  tasks: GanttTask[]
}

// ── 기본 태스크 색상 팔레트 ───────────────────
// Python으로 치면: PALETTE = ['#3b82f6', '#10b981', ...]
const PALETTE = [
  '#3b82f6', // 파랑
  '#10b981', // 초록
  '#f59e0b', // 주황
  '#ef4444', // 빨강
  '#8b5cf6', // 보라
  '#06b6d4', // 하늘
]

// ── 기본 갠트 데이터 ─────────────────────────
// Python으로 치면: DEFAULT_DATA = GanttData(title='', tasks=[...])
function defaultData(): GanttData {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (d: Date, n: number) => {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
  }
  return {
    title: '',
    tasks: [
      { id: crypto.randomUUID(), name: '기획', start: fmt(today), end: fmt(addDays(today, 7)), color: PALETTE[0], progress: 0 },
      { id: crypto.randomUUID(), name: '디자인', start: fmt(addDays(today, 5)), end: fmt(addDays(today, 14)), color: PALETTE[1], progress: 0 },
      { id: crypto.randomUUID(), name: '개발', start: fmt(addDays(today, 12)), end: fmt(addDays(today, 28)), color: PALETTE[2], progress: 0 },
    ],
  }
}

// ── JSON 파싱 헬퍼 ────────────────────────────
// content 문자열 → GanttData 객체 (파싱 실패 시 기본값 반환)
// Python으로 치면: def parse_gantt(content): return json.loads(content) or DEFAULT_DATA
function parseGantt(content: string): GanttData {
  try {
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.tasks)) return parsed as GanttData
  } catch { /* empty */ }
  return defaultData()
}

// ── 날짜 문자열 → Date 변환 ──────────────────
// Python으로 치면: def to_date(s): return datetime.fromisoformat(s)
function toDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

// ── 날짜 차이 (일수) ─────────────────────────
// Python으로 치면: def diff_days(a, b): return (b - a).days
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// ── 월 헤더 생성 ─────────────────────────────
// 전체 날짜 범위를 월 단위로 분할하여 헤더 배열 반환
// Python으로 치면: def get_month_headers(min_d, max_d, total_days): [...]
interface MonthHeader {
  label: string   // "2026년 3월"
  left: number    // 시작 위치 (%)
  width: number   // 너비 (%)
}
function getMonthHeaders(minDate: Date, totalDays: number): MonthHeader[] {
  const headers: MonthHeader[] = []
  // 첫 달의 1일부터 시작
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (diffDays(minDate, cursor) < totalDays) {
    // 이 달의 마지막 날
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    // 화면상 시작 위치 (min보다 이전이면 0으로 클램프)
    const startDay = Math.max(0, diffDays(minDate, cursor))
    const endDay = Math.min(totalDays, diffDays(minDate, nextMonth))
    const left = (startDay / totalDays) * 100
    const width = ((endDay - startDay) / totalDays) * 100
    if (width > 0) {
      headers.push({
        label: `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`,
        left,
        width,
      })
    }
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return headers
}

// ── 오늘 표시선 위치 계산 ─────────────────────
// Python으로 치면: def today_pct(min_d, total): return diff_days(min_d, today) / total * 100
function getTodayPct(minDate: Date, totalDays: number): number | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = diffDays(minDate, today)
  if (d < 0 || d > totalDays) return null
  return (d / totalDays) * 100
}

// ============================================
// GanttBlock 컴포넌트
// ============================================
interface GanttBlockProps {
  block: Block
  pageId: string
}

export default function GanttBlock({ block, pageId }: GanttBlockProps) {
  const { updateBlock } = usePageStore()
  // ── 상태 ────────────────────────────────────
  const [gantt, setGantt] = useState<GanttData>(() => parseGantt(block.content))
  // 편집 모드 (true = 테이블 편집, false = 갠트 차트 미리보기)
  // Python으로 치면: self.is_editing = True
  const [isEditing, setIsEditing] = useState(true)
  // hover 중인 태스크 id (툴팁 표시용)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // ── gantt ref — updater 밖에서 최신값 참조용 ─
  // Python으로 치면: self._gantt_ref = self.gantt  (항상 최신값 유지)
  const ganttRef = useRef(gantt)
  ganttRef.current = gantt

  // ── gantt 상태 변경 + 저장 ──────────────────
  // setGantt와 updateBlock을 분리 호출해야 "렌더 중 setState" 오류 방지
  // Python으로 치면: def update(self, fn): next = fn(self.gantt); self.gantt = next; save(next)
  const update = useCallback((updater: (prev: GanttData) => GanttData) => {
    const next = updater(ganttRef.current)
    setGantt(next)
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 태스크 필드 변경 ──────────────────────────
  // Python으로 치면: def set_task_field(tid, field, val): update task in list
  function setTaskField(id: string, field: keyof GanttTask, val: string | number) {
    update(g => ({
      ...g,
      tasks: g.tasks.map(t => t.id === id ? { ...t, [field]: val } : t),
    }))
  }

  // ── 태스크 추가 ──────────────────────────────
  // Python으로 치면: def add_task(): tasks.append(GanttTask(...))
  function addTask() {
    const last = ganttRef.current.tasks[ganttRef.current.tasks.length - 1]
    const start = last?.end ?? new Date().toISOString().slice(0, 10)
    const end = (() => {
      const d = toDate(start)
      d.setDate(d.getDate() + 7)
      return d.toISOString().slice(0, 10)
    })()
    update(g => ({
      ...g,
      tasks: [...g.tasks, {
        id: crypto.randomUUID(),
        name: `태스크 ${g.tasks.length + 1}`,
        start,
        end,
        color: PALETTE[g.tasks.length % PALETTE.length],
        progress: 0,
      }],
    }))
  }

  // ── 태스크 삭제 ──────────────────────────────
  // Python으로 치면: def remove_task(tid): tasks.remove(tid)
  function removeTask(id: string) {
    if (ganttRef.current.tasks.length <= 1) return
    update(g => ({ ...g, tasks: g.tasks.filter(t => t.id !== id) }))
  }

  // ── 갠트 차트 렌더링 계산 ──────────────────────
  // 전체 날짜 범위 → 각 태스크 막대 left/width% 계산
  // Python으로 치면: def calc_bar(task, min_d, total_days) -> (left_pct, width_pct)
  function calcChart() {
    const validTasks = gantt.tasks.filter(t => t.start && t.end && t.start <= t.end)
    if (validTasks.length === 0) return null

    const allDates = validTasks.flatMap(t => [toDate(t.start), toDate(t.end)])
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))
    // 양쪽에 1일씩 여백 추가
    minDate.setDate(minDate.getDate() - 1)
    maxDate.setDate(maxDate.getDate() + 1)
    const totalDays = Math.max(diffDays(minDate, maxDate), 1)

    return { minDate, totalDays, validTasks }
  }

  // ─────────────────────────────────────────────
  // 편집 모드 UI
  // ─────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="border border-gray-200 rounded-xl p-4 bg-white my-2">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📅</span>
            <input
              type="text"
              value={gantt.title}
              onChange={e => update(g => ({ ...g, title: e.target.value }))}
              placeholder="갠트 제목 (선택)"
              className="text-sm font-semibold text-gray-700 border-none outline-none bg-transparent placeholder-gray-300 w-48"
            />
          </div>
          {/* 미리보기 버튼 */}
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
          >
            차트 보기
          </button>
        </div>

        {/* 태스크 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1.5 px-2 text-gray-400 font-medium w-40">태스크</th>
                <th className="text-left py-1.5 px-2 text-gray-400 font-medium w-32">시작일</th>
                <th className="text-left py-1.5 px-2 text-gray-400 font-medium w-32">종료일</th>
                <th className="text-left py-1.5 px-2 text-gray-400 font-medium w-24">진행률 (%)</th>
                <th className="text-left py-1.5 px-2 text-gray-400 font-medium w-12">색상</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {gantt.tasks.map(task => (
                <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                  {/* 태스크 이름 */}
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={task.name}
                      onChange={e => setTaskField(task.id, 'name', e.target.value)}
                      className="w-full border-none outline-none bg-transparent text-gray-700 placeholder-gray-300"
                      placeholder="태스크 이름"
                    />
                  </td>
                  {/* 시작일 */}
                  <td className="py-1.5 px-2">
                    <input
                      type="date"
                      value={task.start}
                      onChange={e => setTaskField(task.id, 'start', e.target.value)}
                      className="border-none outline-none bg-transparent text-gray-700 text-xs"
                    />
                  </td>
                  {/* 종료일 */}
                  <td className="py-1.5 px-2">
                    <input
                      type="date"
                      value={task.end}
                      onChange={e => setTaskField(task.id, 'end', e.target.value)}
                      className="border-none outline-none bg-transparent text-gray-700 text-xs"
                    />
                  </td>
                  {/* 진행률 */}
                  <td className="py-1.5 px-2">
                    <input
                      type="number"
                      value={task.progress}
                      min={0}
                      max={100}
                      onChange={e => setTaskField(task.id, 'progress', Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 text-xs outline-none focus:border-blue-300"
                    />
                  </td>
                  {/* 색상 */}
                  <td className="py-1.5 px-2">
                    <input
                      type="color"
                      value={task.color}
                      onChange={e => setTaskField(task.id, 'color', e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border border-gray-200"
                      title="색상 선택"
                    />
                  </td>
                  {/* 삭제 버튼 */}
                  <td className="py-1.5 px-1">
                    <button
                      type="button"
                      onClick={() => removeTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-sm leading-none"
                      title="태스크 삭제"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 태스크 추가 버튼 */}
        <button
          type="button"
          onClick={addTask}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
        >
          <span>+</span>
          <span>태스크 추가</span>
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // 미리보기 모드 — 갠트 차트
  // ─────────────────────────────────────────────
  const chartInfo = calcChart()

  if (!chartInfo) {
    return (
      <div className="border border-gray-200 rounded-xl p-6 bg-white my-2 text-center">
        <p className="text-sm text-gray-400">유효한 태스크가 없습니다</p>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="mt-2 text-xs text-blue-500 hover:underline"
        >
          편집
        </button>
      </div>
    )
  }

  const { minDate, totalDays, validTasks } = chartInfo
  const monthHeaders = getMonthHeaders(minDate, totalDays)
  const todayPct = getTodayPct(minDate, totalDays)
  // 좌측 태스크 이름 컬럼 너비 (px)
  const LABEL_W = 120

  return (
    <div className="border border-gray-200 rounded-xl bg-white my-2 overflow-hidden group">
      {/* ── 헤더 영역 ────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm">📅</span>
          {gantt.title && (
            <span className="text-sm font-semibold text-gray-700">{gantt.title}</span>
          )}
        </div>
        {/* 편집 버튼 — hover 시 표시 */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
          title="편집"
        >
          ✏️ 편집
        </button>
      </div>

      {/* ── 갠트 차트 본체 ──────────────── */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 480 }}>

          {/* ── 월 헤더 행 ─────────────── */}
          <div className="flex border-b border-gray-100 bg-gray-50">
            {/* 태스크 이름 컬럼 헤더 */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="shrink-0 px-3 py-1.5 text-xs text-gray-400 font-medium border-r border-gray-100">
              태스크
            </div>
            {/* 월 헤더 — relative 컨테이너 */}
            <div className="flex-1 relative h-7">
              {monthHeaders.map((mh, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center px-2 text-xs text-gray-400 border-r border-gray-100 overflow-hidden"
                  style={{ left: `${mh.left}%`, width: `${mh.width}%` }}
                >
                  {mh.label}
                </div>
              ))}
            </div>
          </div>

          {/* ── 태스크 행 ──────────────── */}
          {validTasks.map(task => {
            const startD = toDate(task.start)
            const endD = toDate(task.end)
            const barLeft = (diffDays(minDate, startD) / totalDays) * 100
            const barWidth = Math.max(0.5, (diffDays(startD, endD) / totalDays) * 100)
            const isHovered = hoveredId === task.id

            return (
              <div key={task.id} className="flex border-b border-gray-50 hover:bg-gray-50 transition-colors" style={{ height: 36 }}>
                {/* 태스크 이름 */}
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                  className="shrink-0 px-3 flex items-center border-r border-gray-100 overflow-hidden"
                >
                  <div className="w-2 h-2 rounded-full shrink-0 mr-1.5" style={{ backgroundColor: task.color }} />
                  <span className="text-xs text-gray-700 truncate">{task.name}</span>
                </div>

                {/* 갠트 바 영역 */}
                <div
                  className="flex-1 relative flex items-center"
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* 오늘 표시선 */}
                  {todayPct !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}

                  {/* 갠트 막대 */}
                  <div
                    className="absolute h-5 rounded-full cursor-pointer transition-opacity"
                    style={{
                      left: `${barLeft}%`,
                      width: `${barWidth}%`,
                      backgroundColor: task.color + '33',  // 20% 투명도 배경
                      border: `1.5px solid ${task.color}`,
                    }}
                    onMouseEnter={() => setHoveredId(task.id)}
                  >
                    {/* 진행률 채우기 */}
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${task.progress}%`,
                        backgroundColor: task.color + '99',  // 60% 투명도
                      }}
                    />
                    {/* 진행률 텍스트 (막대가 충분히 넓을 때만) */}
                    {barWidth > 8 && (
                      <span
                        className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold"
                        style={{ color: task.color }}
                      >
                        {task.progress > 0 ? `${task.progress}%` : ''}
                      </span>
                    )}
                  </div>

                  {/* 툴팁 */}
                  {isHovered && (
                    <div
                      className="absolute z-20 bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg"
                      style={{ left: `${Math.min(barLeft + barWidth / 2, 70)}%`, top: -38, transform: 'translateX(-50%)' }}
                    >
                      <div className="font-medium">{task.name}</div>
                      <div className="text-gray-300 text-[10px]">{task.start} ~ {task.end}</div>
                      <div className="text-gray-300 text-[10px]">진행률: {task.progress}%</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* ── 범례 (오늘 표시선) ──────── */}
          {todayPct !== null && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-t border-gray-50">
              <div className="w-3 h-px bg-red-400" />
              <span className="text-[10px] text-gray-400">오늘</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
