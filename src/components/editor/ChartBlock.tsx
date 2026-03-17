// ==============================================
// src/components/editor/ChartBlock.tsx
// 역할: 차트 블록 — 데이터 직접 입력 + Bar/Line/Pie 시각화
// content JSON 구조:
//   { chartType, title, labels: string[], series: [{name, data, color}] }
// Python으로 치면: class ChartBlock(Widget): ...
// ==============================================

'use client'

import { useState, useCallback, useRef } from 'react'
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'

// ── 차트 데이터 타입 ────────────────────────────
// Python으로 치면: @dataclass class ChartSeries: name: str; data: list[float]; color: str
interface ChartSeries {
  name: string
  data: number[]
  color: string
}

interface ChartData {
  chartType: 'bar' | 'line' | 'pie'
  title: string
  labels: string[]
  series: ChartSeries[]
}

// ── 기본 시리즈 색상 팔레트 ─────────────────────
// Python으로 치면: PALETTE = ['#3b82f6', '#10b981', ...]
const PALETTE = [
  '#3b82f6', // 파랑
  '#10b981', // 초록
  '#f59e0b', // 주황
  '#ef4444', // 빨강
  '#8b5cf6', // 보라
  '#06b6d4', // 청록
]

// ── 빈 ChartData 생성 ───────────────────────────
// Python으로 치면: def make_default_chart(): return ChartData(...)
function makeDefaultChart(): ChartData {
  return {
    chartType: 'bar',
    title: '',
    labels: ['항목 1', '항목 2', '항목 3'],
    series: [{ name: '데이터', data: [0, 0, 0], color: PALETTE[0] }],
  }
}

// ── JSON 파싱 헬퍼 ──────────────────────────────
// Python으로 치면: def parse_chart(content: str) -> ChartData: ...
function parseChart(content: string): ChartData {
  try {
    const p = JSON.parse(content)
    if (p && Array.isArray(p.labels) && Array.isArray(p.series)) return p as ChartData
  } catch {}
  return makeDefaultChart()
}

// ── recharts용 데이터 변환 ──────────────────────
// [{ name:'1월', 제품A:120, 제품B:80 }, ...] 형식으로 변환
// Python으로 치면: def to_recharts(chart): return [{label: ..., **{s.name: s.data[i]}} for i, label in enumerate(labels)]
function toRechartsData(chart: ChartData): Record<string, string | number>[] {
  return chart.labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label }
    for (const s of chart.series) {
      row[s.name] = s.data[i] ?? 0
    }
    return row
  })
}

// ── Pie용 데이터 변환 (시리즈 첫 번째만 사용) ────
// Python으로 치면: def to_pie_data(chart): return [{'name': l, 'value': v} for l, v in zip(labels, series[0].data)]
function toPieData(chart: ChartData): { name: string; value: number }[] {
  const s = chart.series[0]
  if (!s) return []
  return chart.labels.map((label, i) => ({ name: label, value: s.data[i] ?? 0 }))
}

// ── 차트 타입 탭 목록 ────────────────────────────
const CHART_TYPES = [
  { type: 'bar' as const,  label: '막대', icon: '▬' },
  { type: 'line' as const, label: '선',   icon: '〜' },
  { type: 'pie' as const,  label: '파이', icon: '◔' },
]

interface ChartBlockProps {
  block: Block
  pageId: string
}

export default function ChartBlock({ block, pageId }: ChartBlockProps) {
  const { updateBlock } = usePageStore()
  // ── 상태 ────────────────────────────────────────
  const [chart, setChart] = useState<ChartData>(() => parseChart(block.content))
  // 편집 모드 여부 (false = 차트 미리보기, true = 데이터 편집)
  // Python으로 치면: self.is_editing = chart.labels == default
  const [isEditing, setIsEditing] = useState(() => {
    const c = parseChart(block.content)
    // 데이터가 모두 0이면 처음 삽입된 것으로 판단 → 편집 모드로 시작
    return c.series.every(s => s.data.every(v => v === 0))
  })

  // ── chart ref — setChart updater 안에서 최신 값 참조용 ──
  // setChart updater 내부에서 Zustand 스토어를 업데이트하면
  // React 렌더 단계에서 다른 컴포넌트의 setState를 호출하는 문제 발생
  // → updater 밖에서 호출하기 위해 ref로 최신 값 유지
  // Python으로 치면: self._chart_ref = self.chart  (항상 최신값 유지)
  const chartRef = useRef(chart)
  chartRef.current = chart

  // ── chart 상태 변경 + 저장 ──────────────────────
  // setChart와 updateBlock을 분리 호출해야 "렌더 중 setState" 오류 방지
  // Python으로 치면: def update(self, fn): next = fn(self.chart); self.chart = next; save(next)
  const update = useCallback((updater: (prev: ChartData) => ChartData) => {
    const next = updater(chartRef.current)
    setChart(next)
    updateBlock(pageId, block.id, JSON.stringify(next))
  }, [updateBlock, pageId, block.id])

  // ── 라벨 변경 ────────────────────────────────────
  function setLabel(i: number, val: string) {
    update(c => {
      const labels = [...c.labels]
      labels[i] = val
      return { ...c, labels }
    })
  }

  // ── 라벨 추가 ────────────────────────────────────
  function addLabel() {
    update(c => ({
      ...c,
      labels: [...c.labels, `항목 ${c.labels.length + 1}`],
      series: c.series.map(s => ({ ...s, data: [...s.data, 0] })),
    }))
  }

  // ── 라벨 삭제 ────────────────────────────────────
  function removeLabel(i: number) {
    if (chart.labels.length <= 1) return
    update(c => ({
      ...c,
      labels: c.labels.filter((_, idx) => idx !== i),
      series: c.series.map(s => ({ ...s, data: s.data.filter((_, idx) => idx !== i) })),
    }))
  }

  // ── 시리즈 값 변경 ───────────────────────────────
  function setSeriesValue(si: number, li: number, val: string) {
    update(c => {
      const series = c.series.map((s, idx) => {
        if (idx !== si) return s
        const data = [...s.data]
        data[li] = parseFloat(val) || 0
        return { ...s, data }
      })
      return { ...c, series }
    })
  }

  // ── 시리즈 이름 변경 ─────────────────────────────
  function setSeriesName(si: number, val: string) {
    update(c => ({
      ...c,
      series: c.series.map((s, idx) => idx === si ? { ...s, name: val } : s),
    }))
  }

  // ── 시리즈 추가 ──────────────────────────────────
  function addSeries() {
    update(c => ({
      ...c,
      series: [
        ...c.series,
        {
          name: `시리즈 ${c.series.length + 1}`,
          data: new Array(c.labels.length).fill(0),
          color: PALETTE[c.series.length % PALETTE.length],
        },
      ],
    }))
  }

  // ── 시리즈 삭제 ──────────────────────────────────
  function removeSeries(si: number) {
    if (chart.series.length <= 1) return
    update(c => ({ ...c, series: c.series.filter((_, idx) => idx !== si) }))
  }

  // ── recharts 공통 Props ──────────────────────────
  const rechartsData = toRechartsData(chart)
  const chartHeight = 240

  // ── 차트 렌더링 ──────────────────────────────────
  function renderChart() {
    if (chart.chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={rechartsData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={36} />
            <Tooltip />
            {chart.series.length > 1 && <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
            {chart.series.map(s => (
              <Bar key={s.name} dataKey={s.name} fill={s.color} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )
    }
    if (chart.chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={rechartsData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={36} />
            <Tooltip />
            {chart.series.length > 1 && <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
            {chart.series.map(s => (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )
    }
    // Pie 차트 — 시리즈 첫 번째 데이터만 사용
    const pieData = toPieData(chart)
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(props) => `${props.name ?? ''} ${(((props.percent) ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {pieData.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  // ── 미리보기 모드 ────────────────────────────────
  if (!isEditing) {
    return (
      <div className="group relative my-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        {/* 제목 */}
        {chart.title && (
          <div className="mb-2 text-sm font-semibold text-gray-700 text-center">{chart.title}</div>
        )}
        {/* 차트 */}
        {renderChart()}
        {/* 편집 버튼 — hover 시 표시 */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-all"
          title="차트 편집"
        >
          ✏️
        </button>
      </div>
    )
  }

  // ── 편집 모드 ────────────────────────────────────
  return (
    <div className="my-2 rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">

      {/* ── 헤더: 차트 타입 탭 + 제목 입력 ──────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        {/* 차트 타입 탭 */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0">
          {CHART_TYPES.map(ct => (
            <button
              key={ct.type}
              type="button"
              onClick={() => update(c => ({ ...c, chartType: ct.type }))}
              className={chart.chartType === ct.type
                ? "px-2.5 py-1 text-xs font-medium bg-blue-500 text-white transition-colors"
                : "px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"}
            >
              {ct.icon} {ct.label}
            </button>
          ))}
        </div>
        {/* 차트 제목 입력 */}
        <input
          type="text"
          value={chart.title}
          onChange={e => update(c => ({ ...c, title: e.target.value }))}
          placeholder="차트 제목 (선택)"
          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-md outline-none focus:border-blue-300 bg-white"
        />
      </div>

      {/* ── 데이터 테이블 ───────────────────────── */}
      <div className="p-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {/* 시리즈 이름 열 헤더 */}
              <th className="text-left px-2 py-1 text-gray-400 font-normal w-24">시리즈</th>
              {/* 라벨 열 헤더 (각 항목별) */}
              {chart.labels.map((label, li) => (
                <th key={li} className="px-1 py-1 min-w-16">
                  <div className="flex items-center gap-0.5">
                    <input
                      type="text"
                      value={label}
                      onChange={e => setLabel(li, e.target.value)}
                      className="w-full text-center px-1 py-0.5 border border-gray-200 rounded text-xs outline-none focus:border-blue-300"
                    />
                    {/* 라벨 삭제 */}
                    {chart.labels.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLabel(li)}
                        className="text-gray-300 hover:text-red-400 shrink-0 leading-none"
                        title="이 열 삭제"
                      >×</button>
                    )}
                  </div>
                </th>
              ))}
              {/* 열 추가 버튼 */}
              <th className="px-1 py-1 w-8">
                <button
                  type="button"
                  onClick={addLabel}
                  className="w-full text-gray-300 hover:text-blue-400 font-bold text-sm leading-none"
                  title="열 추가"
                >+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {chart.series.map((s, si) => (
              <tr key={si} className="border-t border-gray-50">
                {/* 시리즈 이름 + 색상 */}
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    {/* 색상 선택 */}
                    <input
                      type="color"
                      value={s.color}
                      onChange={e => update(c => ({
                        ...c,
                        series: c.series.map((sr, idx) => idx === si ? { ...sr, color: e.target.value } : sr),
                      }))}
                      className="w-5 h-5 rounded cursor-pointer border-0 p-0 shrink-0"
                      title="색상 변경"
                    />
                    <input
                      type="text"
                      value={s.name}
                      onChange={e => setSeriesName(si, e.target.value)}
                      className="flex-1 px-1 py-0.5 border border-gray-200 rounded text-xs outline-none focus:border-blue-300 min-w-0"
                    />
                    {/* 시리즈 삭제 */}
                    {chart.series.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSeries(si)}
                        className="text-gray-300 hover:text-red-400 shrink-0 leading-none"
                        title="이 행 삭제"
                      >×</button>
                    )}
                  </div>
                </td>
                {/* 데이터 셀 */}
                {chart.labels.map((_, li) => (
                  <td key={li} className="px-1 py-1">
                    <input
                      type="number"
                      value={s.data[li] ?? 0}
                      onChange={e => setSeriesValue(si, li, e.target.value)}
                      className="w-full text-center px-1 py-0.5 border border-gray-200 rounded text-xs outline-none focus:border-blue-300"
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        {/* 시리즈 추가 버튼 */}
        {chart.chartType !== 'pie' && (
          <button
            type="button"
            onClick={addSeries}
            className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            <span className="font-bold">+</span>
            <span>시리즈 추가</span>
          </button>
        )}
      </div>

      {/* ── 미리보기 + 완료 버튼 ────────────────── */}
      <div className="border-t border-gray-100 px-3 py-2 bg-gray-50">
        {/* 소형 미리보기 */}
        <div className="mb-2 pointer-events-none">
          {renderChart()}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
