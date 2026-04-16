// =============================================
// src/components/settings/tabs/PluginsTab.tsx
// 역할: 플러그인 관리 탭 — 옵시디언 스타일 마스터-디테일 레이아웃
// 좌측: 검색 + 플러그인 목록 / 우측: 선택된 플러그인 상세 정보
// Python으로 치면: class PluginsTab(QSplitter): left=PluginList, right=PluginDetail
// =============================================

'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore, PluginSettings, CustomLayoutTemplate } from '@/store/settingsStore'
import { useLocale } from '@/locales'

// -----------------------------------------------
// 플러그인 메타데이터 타입 (옵시디언 스타일 확장)
// Python으로 치면: @dataclass class PluginMeta: id, icon, name, author, ...
// -----------------------------------------------
interface PluginMeta {
  id: keyof PluginSettings
  icon: string
  name: string
  author: string       // "빌트인" or "커뮤니티"
  version: string      // "1.0.0"
  tags: string[]       // 분류 태그
  desc: string         // 한 줄 요약 (목록용)
  fullDesc: string     // 긴 설명 (상세 패널용)
  available: boolean   // false → "준비 중" 배지
}

// -----------------------------------------------
// 플러그인 전체 목록 — 로케일(t)을 받아 현재 언어로 반환
// Python으로 치면: def get_plugin_list(t) -> list[PluginMeta]: ...
// -----------------------------------------------
function getPluginList(t: ReturnType<typeof useLocale>): PluginMeta[] {
  // 로케일 단축 참조
  const p = t.plugins
  const sp = t.settings.plugins
  return [
    {
      id: 'kanban',
      icon: '📋',
      name: p.kanban.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.kanban.tags,
      desc: p.kanban.desc,
      fullDesc: p.kanban.fullDesc,
      available: true,
    },
    {
      id: 'calendar',
      icon: '🗓️',
      name: p.calendar.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.calendar.tags,
      desc: p.calendar.desc,
      fullDesc: p.calendar.fullDesc,
      available: true,
    },
    {
      id: 'admonition',
      icon: '💡',
      name: p.admonition.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.admonition.tags,
      desc: p.admonition.desc,
      fullDesc: p.admonition.fullDesc,
      available: true,
    },
    {
      id: 'recentFiles',
      icon: '🕓',
      name: p.recentFiles.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.recentFiles.tags,
      desc: p.recentFiles.desc,
      fullDesc: p.recentFiles.fullDesc,
      available: true,
    },
    {
      id: 'quickAdd',
      icon: '⚡',
      name: p.quickAdd.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.quickAdd.tags,
      desc: p.quickAdd.desc,
      fullDesc: p.quickAdd.fullDesc,
      available: true,
    },
    {
      id: 'wordCount',
      icon: '📊',
      name: p.wordCount.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.wordCount.tags,
      desc: p.wordCount.desc,
      fullDesc: p.wordCount.fullDesc,
      available: true,
    },
    {
      id: 'focusMode',
      icon: '🎯',
      name: p.focusMode.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.focusMode.tags,
      desc: p.focusMode.desc,
      fullDesc: p.focusMode.fullDesc,
      available: true,
    },
    {
      id: 'tableOfContents',
      icon: '📑',
      name: p.tableOfContents.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.tableOfContents.tags,
      desc: p.tableOfContents.desc,
      fullDesc: p.tableOfContents.fullDesc,
      available: true,
    },
    {
      id: 'pomodoro',
      icon: '🍅',
      name: p.pomodoro.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.pomodoro.tags,
      desc: p.pomodoro.desc,
      fullDesc: p.pomodoro.fullDesc,
      available: true,
    },
    {
      id: 'periodicNotes',
      icon: '📅',
      name: p.periodicNotes.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.periodicNotes.tags,
      desc: p.periodicNotes.desc,
      fullDesc: p.periodicNotes.fullDesc,
      available: true,
    },
    {
      id: 'canvas',
      icon: '🖼️',
      name: p.canvas.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.canvas.tags,
      desc: p.canvas.desc,
      fullDesc: p.canvas.fullDesc,
      available: true,
    },
    {
      id: 'excalidraw',
      icon: '✏️',
      name: p.excalidraw.name,
      author: sp.authorCommunity,
      version: '1.0.0',
      tags: p.excalidraw.tags,
      desc: p.excalidraw.desc,
      fullDesc: p.excalidraw.fullDesc,
      available: true,
    },
    {
      id: 'videoAutoplay',
      icon: '🎬',
      name: p.videoAutoplay.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.videoAutoplay.tags,
      desc: p.videoAutoplay.desc,
      fullDesc: p.videoAutoplay.fullDesc,
      available: true,
    },
    {
      id: 'layoutEnabled',
      icon: '📐',
      name: p.layoutEnabled.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.layoutEnabled.tags,
      desc: p.layoutEnabled.desc,
      fullDesc: p.layoutEnabled.fullDesc,
      available: true,
    },
    {
      id: 'backlinks',
      icon: '🔗',
      name: p.backlinks.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.backlinks.tags,
      desc: p.backlinks.desc,
      fullDesc: p.backlinks.fullDesc,
      available: true,
    },
    {
      id: 'chart',
      icon: '📈',
      name: p.chart.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.chart.tags,
      desc: p.chart.desc,
      fullDesc: p.chart.fullDesc,
      available: true,
    },
    {
      id: 'gantt',
      icon: '📅',
      name: p.gantt.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.gantt.tags,
      desc: p.gantt.desc,
      fullDesc: p.gantt.fullDesc,
      available: true,
    },
    {
      id: 'mindmap',
      icon: '🧠',
      name: p.mindmap.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.mindmap.tags,
      desc: p.mindmap.desc,
      fullDesc: p.mindmap.fullDesc,
      available: true,
    },
    {
      id: 'globalAiChat',
      icon: '🤖',
      name: p.globalAiChat.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.globalAiChat.tags,
      desc: p.globalAiChat.desc,
      fullDesc: p.globalAiChat.fullDesc,
      available: true,
    },
    {
      id: 'math',
      icon: '∑',
      name: p.math.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.math.tags,
      desc: p.math.desc,
      fullDesc: p.math.fullDesc,
      available: true,
    },
    {
      id: 'arrowConnect',
      icon: '↗',
      name: p.arrowConnect.name,
      author: sp.authorBuiltin,
      version: '1.0.0',
      tags: p.arrowConnect.tags,
      desc: p.arrowConnect.desc,
      fullDesc: p.arrowConnect.fullDesc,
      available: true,
    },
  ]
}

// -----------------------------------------------
// 레이아웃 기본 템플릿 목록 — 로케일(t)을 받아 현재 언어로 이름 반환
// top-split, big-left는 row-span 구조로 cols[]로 표현 불가 → 제외
// Python으로 치면: def get_builtin_layout_templates(t) -> list[dict]: ...
// -----------------------------------------------
function getBuiltinLayoutTemplates(t: ReturnType<typeof useLocale>) {
  const sp = t.settings.plugins
  return [
    { id: 'two-col',         name: sp.layoutTwoCol,       cols: [50, 50],     orientation: 'portrait'  as const },
    { id: 'sidebar-left',    name: sp.layoutSidebarLeft,  cols: [33, 67],     orientation: 'portrait'  as const },
    { id: 'sidebar-right',   name: sp.layoutSidebarRight, cols: [67, 33],     orientation: 'portrait'  as const },
    { id: 'three-col',       name: sp.layoutThreeCol,     cols: [33, 34, 33], orientation: 'portrait'  as const },
    { id: 'landscape-two',   name: sp.layoutLandscapeTwo, cols: [50, 50],     orientation: 'landscape' as const },
    { id: 'landscape-three', name: sp.layoutLandscapeThree, cols: [33, 34, 33], orientation: 'landscape' as const },
  ]
}

// -----------------------------------------------
// 범용 레이아웃 SVG 미리보기 — cols[] 배열 기반
// Python으로 치면: def draw_layout_svg(cols, is_portrait, w, h) -> SVGElement
// -----------------------------------------------
function LayoutPreviewSvg({
  cols,
  isPortrait,
  w = 44,
  accent = '#cbd5e1',
}: {
  cols: number[]
  isPortrait: boolean
  w?: number
  accent?: string
}) {
  const W = w
  const H = isPortrait ? Math.round(W * 297 / 210) : Math.round(W * 210 / 297)
  const PAD = 3
  const GAP = 1
  // 열 간격을 제외한 실제 내부 너비
  const IW = W - PAD * 2 - GAP * (cols.length - 1)
  const IH = H - PAD * 2
  const total = cols.reduce((s, c) => s + c, 0) || 100

  const rects: { x: number; y: number; w: number; h: number }[] = []
  let curX = PAD
  cols.forEach(c => {
    const cw = Math.round(IW * c / total)
    rects.push({ x: curX, y: PAD, w: Math.max(cw, 1), h: IH })
    curX += cw + GAP
  })

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <rect x={0} y={0} width={W} height={H} rx={2} fill="#f3f4f6" stroke="#e5e7eb" strokeWidth={1} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={1} fill={accent} />
      ))}
    </svg>
  )
}

// -----------------------------------------------
// 커스텀 레이아웃 템플릿 디자이너
// 이름 입력 + 방향 + 열 수 + 슬라이더 비율 + 실시간 SVG 미리보기
// Python으로 치면: class CustomTemplateDesigner(Widget): def render(self): ...
// -----------------------------------------------
function CustomTemplateDesigner({
  onSave,
}: {
  onSave: (tpl: CustomLayoutTemplate) => void
}) {
  // Python으로 치면: t = get_locale()
  const t = useLocale()
  const [name, setName]           = useState('')
  const [orientation, setOrient]  = useState<'portrait' | 'landscape'>('portrait')
  const [colCount, setColCount]   = useState<2 | 3>(2)
  // 슬롯 A 비율 (%), B 슬롯 비율 (3단에서만 사용)
  const [colA, setColA]           = useState(50)
  const [colB, setColB]           = useState(30)

  // 열 수 변경 시 슬라이더 초기화 — 각 열에 적절한 비율 할당
  // Python으로 치면: def on_col_count_change(n): reset_sliders(n)
  useEffect(() => {
    if (colCount === 2) { setColA(50) }
    else { setColA(40); setColB(30) }
  }, [colCount])

  // 실제 cols 계산: A+B+C = 100 (C = 100 - A - B, 최소 10%)
  // Python으로 치면: cols = [colA, 100-colA] if 2단 else [colA, colB, max(10, 100-A-B)]
  const cols = colCount === 2
    ? [colA, 100 - colA]
    : [colA, colB, Math.max(10, 100 - colA - colB)]

  // A 슬라이더 변경 — B가 범위를 넘으면 함께 조정 (3단)
  // Python으로 치면: def on_a_change(val): if 3단 and B > 90-val: set_B(90-val)
  function handleColAChange(val: number) {
    setColA(val)
    if (colCount === 3 && colB > 90 - val) {
      setColB(90 - val)
    }
  }

  // 커스텀 템플릿 저장
  // Python으로 치면: def save(): on_save({id: uuid, name, orientation, cols}); reset()
  function handleSave() {
    if (!name.trim()) return
    const id = Date.now().toString(36)
    onSave({ id, name: name.trim(), orientation, cols })
    setName('')
  }

  const maxA = colCount === 3 ? Math.max(10, 80 - colB) : 90

  return (
    <div className="space-y-3">

      {/* 이름 입력 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t.settings.plugins.templateNameLabel}</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          placeholder={t.settings.plugins.templateNamePlaceholder}
          className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 transition-all"
        />
      </div>

      {/* 방향 선택 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t.settings.plugins.a4Orientation}</label>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg w-fit">
          {(['portrait', 'landscape'] as const).map(o => (
            <button
              key={o}
              type="button"
              onClick={() => setOrient(o)}
              className={orientation === o
                ? "px-3 py-1 text-xs font-medium bg-white rounded-md shadow-sm text-gray-800 transition-all"
                : "px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"}
            >
              {o === 'portrait' ? `📄 ${t.settings.plugins.portrait}` : `🖥️ ${t.settings.plugins.landscape}`}
            </button>
          ))}
        </div>
      </div>

      {/* 열 수 선택 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t.settings.plugins.colCountLabel}</label>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg w-fit">
          {([2, 3] as const).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setColCount(n)}
              className={colCount === n
                ? "px-3 py-1 text-xs font-medium bg-white rounded-md shadow-sm text-gray-800 transition-all"
                : "px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"}
            >
              {n}{t.settings.plugins.colUnit}
            </button>
          ))}
        </div>
      </div>

      {/* 비율 슬라이더 + 실시간 비율 표시 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">{t.settings.plugins.colRatio}</label>

        {/* 슬롯 A 슬라이더 */}
        {/* Python으로 치면: slider_a = QSlider(min=10, max=maxA) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-4">A</span>
          <input
            type="range"
            min={10}
            max={maxA}
            value={colA}
            onChange={e => handleColAChange(Number(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="text-xs text-gray-600 w-8 text-right">{cols[0]}%</span>
        </div>

        {/* 슬롯 B (3단에서만 표시) */}
        {colCount === 3 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 w-4">B</span>
            <input
              type="range"
              min={10}
              max={Math.max(10, 90 - colA)}
              value={colB}
              onChange={e => setColB(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs text-gray-600 w-8 text-right">{cols[1]}%</span>
          </div>
        )}

        {/* 결과 비율 요약 */}
        <p className="text-xs text-gray-400 text-center">
          {cols.map((c, i) => `${String.fromCharCode(65 + i)}: ${c}%`).join(' · ')}
        </p>
      </div>

      {/* 실시간 SVG 미리보기 */}
      <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
        <LayoutPreviewSvg cols={cols} isPortrait={orientation === 'portrait'} w={60} accent="#a78bfa" />
        <div className="flex-1 text-xs text-gray-400 space-y-0.5">
          <p>A4 {orientation === 'portrait' ? t.settings.plugins.portrait : t.settings.plugins.landscape} · {colCount}{t.settings.plugins.colUnit}</p>
          <p>{cols.map((c, i) => `${String.fromCharCode(65 + i)}:${c}%`).join(' / ')}</p>
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!name.trim()}
        className={name.trim()
          ? "w-full py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:scale-95 transition-all"
          : "w-full py-2 text-sm font-medium bg-gray-200 text-gray-400 rounded-lg cursor-not-allowed"}
      >
        {t.settings.plugins.saveCustomTemplate}
      </button>
    </div>
  )
}

// -----------------------------------------------
// ON/OFF 토글 버튼
// Python으로 치면: class Toggle(QCheckBox): def render(self): ...
// -----------------------------------------------
function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={on ? 'Switch OFF' : 'Switch ON'}
      className={
        disabled
          ? "relative w-11 h-6 rounded-full bg-gray-200 transition-colors shrink-0 cursor-not-allowed opacity-40"
          : on
            ? "relative w-11 h-6 rounded-full bg-blue-500 transition-colors shrink-0"
            : "relative w-11 h-6 rounded-full bg-gray-200 transition-colors shrink-0"
      }
    >
      <span
        className={on
          ? "absolute top-0.5 left-5 w-5 h-5 rounded-full bg-white shadow transition-all"
          : "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
        }
      />
    </button>
  )
}

export default function PluginsTab() {
  // Python으로 치면: t = get_locale()
  const t = useLocale()
  const {
    plugins,
    togglePlugin,
    layoutDefaultOrientation,
    layoutDefaultTemplate,
    customLayoutTemplates,
    setLayoutDefaults,
    addCustomLayoutTemplate,
    deleteCustomLayoutTemplate,
  } = useSettingsStore()

  // 현재 로케일로 플러그인 목록 / 레이아웃 템플릿 목록 생성
  // Python으로 치면: plugin_list = get_plugin_list(t)
  const PLUGIN_LIST = getPluginList(t)
  // Python으로 치면: layout_templates = get_builtin_layout_templates(t)
  const BUILTIN_LAYOUT_TEMPLATES = getBuiltinLayoutTemplates(t)

  // ── 선택된 플러그인 인덱스 (상세 패널에 표시)
  // Python으로 치면: self.selected_plugin = PLUGIN_LIST[0]
  const [selectedIdx, setSelectedIdx] = useState(0)

  // ── 검색어
  // Python으로 치면: self.search_query = ''
  const [query, setQuery] = useState('')

  // ── 검색 필터 적용
  // Python으로 치면: filtered = [p for p in PLUGIN_LIST if query in p.name + p.desc + p.tags]
  const filtered = query.trim()
    ? PLUGIN_LIST.filter(p => {
        const q = query.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          p.desc.toLowerCase().includes(q) ||
          p.tags.some(tag => tag.toLowerCase().includes(q))
        )
      })
    : PLUGIN_LIST

  // 선택 인덱스를 필터 결과 안에서 안전하게 조정
  const safeIdx = Math.min(selectedIdx, filtered.length - 1)
  const selected = filtered[safeIdx] ?? PLUGIN_LIST[0]

  // ── 선택된 플러그인의 토글 상태 (available=false이면 항상 false)
  // Python으로 치면: is_on = plugins[selected.id] if selected.available else False
  const isOn = selected.available ? plugins[selected.id] : false

  return (
    // 모달 내부 높이를 꽉 채우는 2단 레이아웃
    // Python으로 치면: splitter = QSplitter(Qt.Horizontal)
    <div className="flex h-full overflow-hidden">

      {/* ── 좌측: 검색 + 플러그인 목록 ─────────────── */}
      <div className="w-48 border-r border-gray-200 flex flex-col shrink-0">

        {/* 검색창 */}
        {/* Python으로 치면: self.search_input = QLineEdit(placeholder='검색...') */}
        <div className="p-2 border-b border-gray-100">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            placeholder={t.settings.plugins.searchPlaceholder}
            className="w-full text-xs px-2.5 py-1.5 bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-300 transition-all"
          />
        </div>

        {/* 플러그인 목록 */}
        {/* Python으로 치면: for i, plugin in enumerate(filtered): render_row(plugin, selected=(i==safeIdx)) */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">{t.settings.plugins.noResults}</p>
          )}
          {filtered.map((plugin, idx) => (
            <button
              key={plugin.id}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={idx === safeIdx
                ? "w-full flex items-center gap-2 px-3 py-2 text-left bg-blue-50 border-r-2 border-blue-500 transition-colors"
                : "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              }
            >
              {/* 플러그인 아이콘 */}
              <span className="text-base shrink-0">{plugin.icon}</span>

              {/* 이름 + 상태 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-800 truncate">{plugin.name}</span>
                </div>
                {/* 활성화 여부 점 표시 */}
                {plugin.available && (
                  <div className={`mt-0.5 w-1.5 h-1.5 rounded-full ${plugins[plugin.id] ? 'bg-green-400' : 'bg-gray-300'}`} />
                )}
              </div>

              {/* 준비 중 배지 */}
              {!plugin.available && (
                <span className="text-xs px-1 py-0.5 rounded bg-gray-100 text-gray-400 font-medium shrink-0">
                  {t.settings.plugins.notReady}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── 우측: 선택된 플러그인 상세 패널 ───────── */}
      {/* Python으로 치면: self.detail_panel = PluginDetailWidget(selected_plugin) */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col">

        {/* 아이콘 + 이름 + 메타 */}
        <div className="flex items-start gap-4 mb-5">
          {/* 큰 아이콘 */}
          <span className="text-4xl shrink-0">{selected.icon}</span>

          <div className="flex-1 min-w-0">
            {/* 플러그인 이름 */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900">{selected.name}</h3>
              {/* 준비 중 배지 */}
              {!selected.available && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
                  {t.settings.plugins.notReady}
                </span>
              )}
            </div>

            {/* 버전 · 작성자 */}
            <p className="text-xs text-gray-400 mt-0.5">
              {selected.version} · {selected.author}
            </p>

            {/* 태그 */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selected.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-gray-100 mb-4" />

        {/* 한 줄 요약 */}
        <p className="text-sm text-gray-700 font-medium mb-2">{selected.desc}</p>

        {/* 긴 설명 */}
        <p className="text-sm text-gray-500 leading-relaxed">
          {selected.fullDesc}
        </p>

        {/* ── Autoplay & Loop 전용 서브 설정 ──────────────────────── */}
        {selected.id === 'videoAutoplay' && (
          <div className="mt-4 border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.plugins.subSettings}</p>
            {/* 반복 재생 토글 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 font-medium">{t.settings.plugins.videoLoop}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.settings.plugins.videoLoopDesc}</p>
              </div>
              <Toggle
                on={plugins.videoLoop}
                onToggle={() => togglePlugin('videoLoop')}
                disabled={!plugins.videoAutoplay}
              />
            </div>
          </div>
        )}

        {/* ── 레이아웃 블록 전용 서브 설정 ────────────────────────────
            기본 템플릿 선택 + 커스텀 템플릿 디자이너 + 저장된 커스텀 목록
            Python으로 치면: if selected.id == 'layoutEnabled': render_layout_settings() */}
        {selected.id === 'layoutEnabled' && (
          <div className="mt-4 border border-gray-200 rounded-xl p-4 space-y-5 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t.settings.plugins.layoutSettings}</p>

            {/* ── 기본 템플릿 선택 ──────────────────────────────────
                새 레이아웃 블록 추가 시 자동으로 이 템플릿이 적용됨
                Python으로 치면: self.default_template_picker = TemplatePicker() */}
            <div className="space-y-2">
              <div>
                <p className="text-sm text-gray-700 font-medium">{t.settings.plugins.layoutDefaultTemplate}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t.settings.plugins.layoutDefaultTemplateDesc}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">

                {/* "없음" 옵션 — 매번 피커를 표시 */}
                <button
                  type="button"
                  onClick={() => setLayoutDefaults(layoutDefaultOrientation, '')}
                  className={layoutDefaultTemplate === ''
                    ? "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 border-blue-400 bg-blue-50 transition-all"
                    : "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all"}
                >
                  <span className="text-xl">📋</span>
                  <p className="text-xs font-medium text-gray-600">{t.settings.plugins.layoutNone}</p>
                  <p className="text-xs text-gray-400">{t.settings.plugins.layoutNoneDesc}</p>
                </button>

                {/* 빌트인 템플릿들 */}
                {/* Python으로 치면: for tpl in BUILTIN_LAYOUT_TEMPLATES: render(TemplateCard(tpl)) */}
                {BUILTIN_LAYOUT_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setLayoutDefaults(tpl.orientation, tpl.id)}
                    className={layoutDefaultTemplate === tpl.id
                      ? "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 border-blue-400 bg-blue-50 transition-all"
                      : "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all"}
                  >
                    <LayoutPreviewSvg cols={tpl.cols} isPortrait={tpl.orientation === 'portrait'} w={36} />
                    <p className="text-xs font-medium text-gray-600 text-center leading-tight">{tpl.name}</p>
                  </button>
                ))}

                {/* 커스텀 템플릿들 */}
                {customLayoutTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setLayoutDefaults(tpl.orientation, `custom:${tpl.id}`)}
                    className={layoutDefaultTemplate === `custom:${tpl.id}`
                      ? "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 border-purple-400 bg-purple-50 transition-all"
                      : "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50 transition-all"}
                  >
                    <LayoutPreviewSvg cols={tpl.cols} isPortrait={tpl.orientation === 'portrait'} w={36} accent="#a78bfa" />
                    <p className="text-xs font-medium text-gray-600 text-center leading-tight truncate w-full">{tpl.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── 커스텀 템플릿 디자이너 ───────────────────────────────
                슬라이더 기반 비율 조정 + 실시간 SVG 미리보기 + 저장
                Python으로 치면: self.designer = CustomTemplateDesigner(on_save=save) */}
            <div>
              <p className="text-sm text-gray-700 font-medium mb-2">{t.settings.plugins.layoutCustomCreate}</p>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <CustomTemplateDesigner onSave={addCustomLayoutTemplate} />
              </div>
            </div>

            {/* ── 저장된 커스텀 템플릿 목록 ───────────────────────────
                각 항목: 미리보기 + 이름 + 비율 + 삭제 버튼
                Python으로 치면: for tpl in custom_templates: render(CustomTemplateRow(tpl)) */}
            {customLayoutTemplates.length > 0 && (
              <div>
                <p className="text-sm text-gray-700 font-medium mb-2">{t.settings.plugins.layoutCustomSaved}</p>
                <div className="space-y-2">
                  {customLayoutTemplates.map(tpl => (
                    <div
                      key={tpl.id}
                      className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <LayoutPreviewSvg
                        cols={tpl.cols}
                        isPortrait={tpl.orientation === 'portrait'}
                        w={32}
                        accent="#a78bfa"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 font-medium truncate">{tpl.name}</p>
                        <p className="text-xs text-gray-400">
                          {tpl.orientation === 'portrait' ? t.settings.plugins.portrait : t.settings.plugins.landscape} ·{' '}
                          {tpl.cols.map((c, i) => `${String.fromCharCode(65 + i)}:${c}%`).join(' / ')}
                        </p>
                      </div>
                      {/* 삭제 버튼 */}
                      <button
                        type="button"
                        onClick={() => {
                          // 기본 템플릿으로 설정되어 있었다면 초기화
                          if (layoutDefaultTemplate === `custom:${tpl.id}`) {
                            setLayoutDefaults(layoutDefaultOrientation, '')
                          }
                          deleteCustomLayoutTemplate(tpl.id)
                        }}
                        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none px-1 py-0.5 rounded hover:bg-red-50"
                        title={t.settings.plugins.templateDelete}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 하단 액션 버튼 ──────────────────────── */}
        <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">

          {/* 활성화/비활성화 상태 텍스트 */}
          <span className="text-xs text-gray-400">
            {!selected.available
              ? t.settings.plugins.notAvailable
              : isOn
                ? t.settings.plugins.statusEnabled
                : t.settings.plugins.statusDisabled
            }
          </span>

          {/* 토글 버튼 */}
          <div className="flex items-center gap-3">
            {/* 활성화/비활성화 버튼 텍스트 레이블 */}
            <span className="text-xs text-gray-500 select-none">
              {isOn ? t.settings.plugins.disableBtn : t.settings.plugins.enableBtn}
            </span>
            <Toggle
              on={isOn}
              onToggle={() => selected.available && togglePlugin(selected.id)}
              disabled={!selected.available}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
