// ==============================================
// src/components/editor/ChartBlock.tsx
// 역할: 차트 블록 — 데이터 직접 입력 + Bar/Line/Pie 시각화
// content JSON 구조:
//   { chartType, title, labels: string[], series: [{name, data, color}] }
// Python으로 치면: class ChartBlock(Widget): ...
// ==============================================

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { Block } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import AIChatPanel from '@/components/ai/AIChatPanel'
import { useLocale } from '@/locales'

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
// 모듈 레벨 상수 대신 컴포넌트 내부에서 로케일 적용 후 생성
// Python으로 치면: CHART_TYPES는 컴포넌트 내부에서 t를 활용해 생성

interface ChartBlockProps {
  block: Block
  pageId: string
}

// ── AI 시스템 프롬프트 ────────────────────────────
// Python으로 치면: CHART_SYSTEM_PROMPT: str = "..."
const CHART_SYSTEM_PROMPT = `당신은 데이터 시각화 전문가입니다.
사용자의 요청에 따라 차트 데이터를 아래 JSON 형식으로만 반환하세요.
설명이나 다른 텍스트 없이 JSON만 출력하세요.

형식:
{"chartType":"bar","title":"차트 제목","labels":["항목1","항목2","항목3"],"series":[{"name":"시리즈명","data":[값1,값2,값3],"color":"#3b82f6"}]}

규칙:
- chartType: "bar" | "line" | "pie" 중 하나
- labels 배열 길이와 각 series의 data 배열 길이는 반드시 동일
- series color는 hex 코드 (예: "#3b82f6")
- 숫자 데이터는 정수 또는 소수점 1자리`

// ── 모듈 레벨: 마지막 활성 ChartBlock ID ────────
// GlobalAIChatButton의 'ai-apply-chart' 이벤트를 처리할 블록 결정
// Python으로 치면: _active_chart_id: str | None = None
let _activeChartBlockId: string | null = null

export default function ChartBlock({ block, pageId }: ChartBlockProps) {
  const t = useLocale()
  const { updateBlock } = usePageStore()

  // ── 차트 타입 탭 목록 (로케일 적용) ──────────────
  const CHART_TYPES = [
    { type: 'bar' as const,  label: t.blocks.chart.types.bar,  icon: '▬' },
    { type: 'line' as const, label: t.blocks.chart.types.line, icon: '〜' },
    { type: 'pie' as const,  label: t.blocks.chart.types.pie,  icon: '◔' },
  ]

  // ── 상태 ────────────────────────────────────────
  const [chart, setChart] = useState<ChartData>(() => parseChart(block.content))
  // 편집 모드 여부 (false = 차트 미리보기, true = 데이터 편집)
  // Python으로 치면: self.is_editing = chart.labels == default
  const [isEditing, setIsEditing] = useState(() => {
    const c = parseChart(block.content)
    // 데이터가 모두 0이면 처음 삽입된 것으로 판단 → 편집 모드로 시작
    return c.series.every(s => s.data.every(v => v === 0))
  })

  // AI 패널 열림 여부
  // Python으로 치면: self.ai_open: bool = False
  const [aiOpen, setAiOpen] = useState(false)

  // isAiTarget: 전역 AI가 이 블록을 선택했을 때 링 + 배지 표시
  // Python으로 치면: self.is_ai_target = False
  const [isAiTarget, setIsAiTarget] = useState(false)

  // applyChartRef: 전역 AI 이벤트에서 최신 applyAiChart 참조 (stale closure 방지)
  // Python으로 치면: self._apply_ref = WeakRef(self.apply_ai_chart)
  const applyChartRef = useRef<(text: string) => string | void>(() => {})

  // ── chart ref — setChart updater 안에서 최신 값 참조용 ──
  // setChart updater 내부에서 Zustand 스토어를 업데이트하면
  // React 렌더 단계에서 다른 컴포넌트의 setState를 호출하는 문제 발생
  // → updater 밖에서 호출하기 위해 ref로 최신 값 유지
  // Python으로 치면: self._chart_ref = self.chart  (항상 최신값 유지)
  const chartRef = useRef(chart)
  chartRef.current = chart

  // ── 디바운스 타이머 ref — 저장 요청 과다 방지 ───
  // 셀 입력마다 서버 요청이 발생하는 것을 막기 위해 500ms 디바운스
  // Python으로 치면: self._save_timer: threading.Timer | None = None
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 언마운트 시 미실행 타이머 정리
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  // ── chart 상태 변경 + 저장 ──────────────────────
  // setChart와 updateBlock을 분리 호출해야 "렌더 중 setState" 오류 방지
  // immediate=true이면 즉시 저장 (AI 응답 적용 등 완결 동작), false면 500ms 디바운스
  // Python으로 치면: def update(self, fn, immediate=False): next = fn(self.chart); self.chart = next; save(next)
  const update = useCallback((updater: (prev: ChartData) => ChartData, immediate = false) => {
    const next = updater(chartRef.current)
    setChart(next)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (immediate) {
      // AI 응답 등 완결 동작 — 즉시 저장
      updateBlock(pageId, block.id, JSON.stringify(next))
    } else {
      // 일반 셀 입력 — 500ms 디바운스로 서버 요청 최소화
      saveTimerRef.current = setTimeout(() => {
        updateBlock(pageId, block.id, JSON.stringify(next))
      }, 500)
    }
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
      labels: [...c.labels, `${t.blocks.chart.newLabelPrefix}${c.labels.length + 1}`],
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
          name: `${t.blocks.chart.newSeriesPrefix}${c.series.length + 1}`,
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

  // ── AI 응답에서 차트 데이터 파싱 후 적용 ──────────
  // Python으로 치면: def apply_ai_chart(self, text: str) -> str | None: ...
  function applyAiChart(text: string): string | void {
    try {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return t.blocks.chart.aiFormatError
      const parsed = JSON.parse(match[0])
      if (!Array.isArray(parsed.labels) || !Array.isArray(parsed.series)) {
        return t.blocks.chart.aiDataError
      }
      // 색상 없는 시리즈에 기본 팔레트 적용
      const fixed: ChartData = {
        chartType: parsed.chartType || 'bar',
        title: parsed.title || '',
        labels: parsed.labels,
        series: parsed.series.map((s: Partial<ChartSeries>, i: number) => ({
          name: s.name || `${t.blocks.chart.newSeriesPrefix}${i + 1}`,
          data: Array.isArray(s.data) ? s.data : [],
          color: s.color || PALETTE[i % PALETTE.length],
        })),
      }
      update(() => fixed, true)  // AI 응답 확정 — 즉시 저장
      return t.blocks.chart.aiApplied.replace('{count}', String(fixed.labels.length))
    } catch {
      return t.blocks.chart.aiParseError
    }
  }

  // ── 전역 AI → 차트 적용 연동 ─────────────────────
  // 매 렌더마다 최신 applyAiChart로 ref 동기화 (stale closure 방지)
  // Python으로 치면: def on_render(self): self._apply_ref.current = self.apply_ai_chart
  applyChartRef.current = applyAiChart

  // 마운트 시 전역 활성 차트로 등록 + 이벤트 리스너 등록
  // GlobalAIChatButton의 📊 모드 '적용' 버튼이 'ai-apply-chart' 이벤트 발행
  // + AI 블록 선택/해제 인디케이터
  // Python으로 치면: def on_mount(self): global _active; _active = self; window.on(...)
  useEffect(() => {
    _activeChartBlockId = block.id
    function handleGlobalChart(e: Event) {
      if (_activeChartBlockId !== block.id) return
      applyChartRef.current((e as CustomEvent<string>).detail)
    }
    function handleSelect(e: Event) {
      const { blockId } = (e as CustomEvent<{ blockId: string; blockType: string }>).detail
      setIsAiTarget(blockId === block.id)
    }
    function handleDeselect() { setIsAiTarget(false) }
    window.addEventListener('ai-apply-chart', handleGlobalChart)
    window.addEventListener('ai-block-select', handleSelect)
    window.addEventListener('ai-block-deselect', handleDeselect)
    return () => {
      window.removeEventListener('ai-apply-chart', handleGlobalChart)
      window.removeEventListener('ai-block-select', handleSelect)
      window.removeEventListener('ai-block-deselect', handleDeselect)
      if (_activeChartBlockId === block.id) _activeChartBlockId = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

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
        {/* 버튼들 — hover 시 표시 */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
          <button
            type="button"
            onClick={() => { setAiOpen(v => !v); setIsEditing(true) }}
            className="p-1.5 text-xs text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-md"
            title={t.blocks.chart.aiGenerate}
          >✨</button>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
            title={t.blocks.chart.editChart}
          >✏️</button>
        </div>
      </div>
    )
  }

  // ── 편집 모드 ────────────────────────────────────
  return (
    <div
      data-ai-block="chart"
      onClick={() => window.dispatchEvent(new CustomEvent('ai-block-select', { detail: { blockId: block.id, blockType: 'chart' } }))}
      className={`chart-block my-2 relative rounded-xl bg-white shadow-sm overflow-hidden transition-shadow ${isAiTarget ? 'border-2 border-emerald-400 ring-2 ring-emerald-400 ring-offset-1 shadow-emerald-100 shadow-md' : 'border border-blue-200'}`}
    >
      {/* ── AI 대상 배지 ──────────────────────────
          isAiTarget일 때만 표시 — 초록 링과 함께 우상단에 위치
          Python으로 치면: if self.is_ai_target: render Badge('🤖 AI 대상') */}
      {isAiTarget && (
        <span className="absolute top-1.5 right-1.5 z-10 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full pointer-events-none select-none">
          {t.blocks.chart.aiTarget}
        </span>
      )}

      {/* ── 헤더: 차트 타입 탭 + 제목 입력 + AI 버튼 ──────── */}
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
          placeholder={t.blocks.chart.titlePlaceholder}
          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded-md outline-none focus:border-blue-300 bg-white"
        />
        {/* AI 패널 토글 버튼 */}
        <button
          type="button"
          onClick={() => setAiOpen(v => !v)}
          title={t.blocks.chart.aiGenerate}
          className={aiOpen
            ? "px-2.5 py-1 text-xs rounded-md font-medium bg-purple-500 text-white transition-colors shrink-0"
            : "px-2.5 py-1 text-xs rounded-md text-purple-500 hover:bg-purple-50 border border-purple-200 transition-colors shrink-0"}
        >✨ AI</button>
      </div>

      {/* ── 메인 영역: 테이블 + AI 패널 (flex row) ──── */}
      <div className="flex">

      {/* ── 데이터 테이블 ───────────────────────── */}
      <div className="flex-1 p-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {/* 시리즈 이름 열 헤더 */}
              <th className="text-left px-2 py-1 text-gray-400 font-normal w-24">{t.blocks.chart.seriesHeader}</th>
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
                        title={t.blocks.chart.deleteColumn}
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
                  title={t.blocks.chart.addColumn}
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
                      title={t.blocks.chart.changeColor}
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
                        title={t.blocks.chart.deleteRow}
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
            <span>{t.blocks.chart.addSeries}</span>
          </button>
        )}
      </div>

      {/* ── AI 패널 (사이드바) ──────────────────── */}
      {aiOpen && (
        <AIChatPanel
          title={t.blocks.chart.aiChartTitle}
          icon="📊"
          emptyHint={t.blocks.chart.aiEmptyHint}
          systemPrompt={CHART_SYSTEM_PROMPT}
          context={() => JSON.stringify(chart)}
          placeholder={t.blocks.chart.chatPlaceholder}
          quickCommands={t.blocks.chart.quickCommands}
          mode="sidebar"
          applyLabel={t.blocks.chart.applyLabel}
          onApply={applyAiChart}
          onClose={() => setAiOpen(false)}
        />
      )}

      </div>{/* flex row 닫기 */}

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
            {t.blocks.chart.done}
          </button>
        </div>
      </div>
    </div>
  )
}
