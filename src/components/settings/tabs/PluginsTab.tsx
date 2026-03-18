// =============================================
// src/components/settings/tabs/PluginsTab.tsx
// 역할: 플러그인 관리 탭 — 옵시디언 스타일 마스터-디테일 레이아웃
// 좌측: 검색 + 플러그인 목록 / 우측: 선택된 플러그인 상세 정보
// Python으로 치면: class PluginsTab(QSplitter): left=PluginList, right=PluginDetail
// =============================================

'use client'

import { useState, useEffect } from 'react'
import { useSettingsStore, PluginSettings, CustomLayoutTemplate } from '@/store/settingsStore'

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
// 플러그인 전체 목록
// Python으로 치면: PLUGIN_REGISTRY: list[PluginMeta] = [...]
// -----------------------------------------------
const PLUGIN_LIST: PluginMeta[] = [
  {
    id: 'kanban',
    icon: '📋',
    name: '칸반 보드',
    author: '빌트인',
    version: '1.0.0',
    tags: ['작업관리', '시각화'],
    desc: '슬래시 명령어로 칸반 보드 블록을 삽입합니다',
    fullDesc: '슬래시 명령어(/)로 칸반 보드 블록을 삽입합니다. 여러 컬럼에 카드를 배치하고 드래그앤드롭으로 이동할 수 있습니다. 프로젝트 관리, 할 일 목록, 업무 흐름 추적에 적합합니다.',
    available: true,
  },
  {
    id: 'calendar',
    icon: '🗓️',
    name: '캘린더',
    author: '빌트인',
    version: '1.0.0',
    tags: ['시각화', '날짜'],
    desc: '메모 목록 상단에 달력을 표시합니다',
    fullDesc: '메모 목록 상단에 달력 위젯을 표시합니다. 날짜를 클릭하면 해당 날짜에 작성된 메모를 필터링해서 보여줍니다. 날짜별 메모 관리와 일정 추적에 유용합니다.',
    available: true,
  },
  {
    id: 'admonition',
    icon: '💡',
    name: '콜아웃 블록',
    author: '빌트인',
    version: '1.0.0',
    tags: ['편집기', '서식'],
    desc: '팁/정보/경고/위험 강조 블록을 삽입합니다',
    fullDesc: '슬래시 명령어(/)로 콜아웃(Admonition) 블록을 삽입합니다. 팁(💡), 정보(ℹ️), 경고(⚠️), 위험(❌) 네 가지 스타일을 지원하며, 중요한 내용을 시각적으로 강조할 때 사용합니다.',
    available: true,
  },
  {
    id: 'recentFiles',
    icon: '🕓',
    name: '최근 파일',
    author: '빌트인',
    version: '1.0.0',
    tags: ['탐색', '빠른접근'],
    desc: '최근 열었던 페이지 목록을 빠르게 접근합니다',
    fullDesc: '사이드바 상단에 최근 열었던 페이지 목록(최대 10개)을 표시합니다. 자주 작업하는 페이지로 빠르게 이동할 수 있으며, 브라우저 새로고침 후에도 목록이 유지됩니다.',
    available: true,
  },
  {
    id: 'quickAdd',
    icon: '⚡',
    name: '빠른 캡처',
    author: '빌트인',
    version: '1.0.0',
    tags: ['생산성', '캡처'],
    desc: 'Ctrl+Alt+N 단축키로 새 메모를 즉시 작성합니다',
    fullDesc: 'Ctrl+Alt+N 단축키를 누르면 화면 중앙에 빠른 메모 입력창이 나타납니다. 아이디어가 떠올랐을 때 현재 작업을 중단하지 않고 바로 메모를 남길 수 있습니다. 저장 후 전체 페이지로 전환됩니다.',
    available: true,
  },
  {
    id: 'wordCount',
    icon: '📊',
    name: '단어 수 표시',
    author: '빌트인',
    version: '1.0.0',
    tags: ['편집기', '통계'],
    desc: '에디터 하단에 단어·글자 수를 실시간으로 표시합니다',
    fullDesc: '페이지 에디터 하단에 현재 페이지의 단어 수와 글자 수를 실시간으로 표시합니다. 글을 작성하면서 분량을 즉시 확인할 수 있어 리포트, 에세이, 블로그 포스트 작성 시 유용합니다.',
    available: true,
  },
  {
    id: 'focusMode',
    icon: '🎯',
    name: '집중 모드',
    author: '빌트인',
    version: '1.0.0',
    tags: ['생산성', '편집기'],
    desc: 'Ctrl+Shift+F로 사이드바를 숨기고 에디터만 전체화면으로 표시합니다',
    fullDesc: 'Ctrl+Shift+F 단축키 또는 우상단 버튼으로 집중 모드를 활성화합니다. 활성화되면 카테고리 사이드바와 페이지 목록이 숨겨지고, 에디터가 전체 화면을 차지합니다. 글쓰기에 집중할 때 방해 요소를 제거해 줍니다.',
    available: true,
  },
  {
    id: 'tableOfContents',
    icon: '📑',
    name: '목차 (TOC)',
    author: '빌트인',
    version: '1.0.0',
    tags: ['편집기', '탐색'],
    desc: '페이지 우측에 헤딩 기반 목차를 자동으로 표시합니다',
    fullDesc: '페이지에 제목(H1/H2/H3) 블록이 있을 때 에디터 우측에 목차 패널을 자동으로 표시합니다. 항목을 클릭하면 해당 위치로 부드럽게 스크롤됩니다. 긴 문서 탐색에 유용합니다.',
    available: true,
  },
  {
    id: 'pomodoro',
    icon: '🍅',
    name: 'Pomodoro Timer',
    author: '빌트인',
    version: '1.0.0',
    tags: ['생산성', '타이머'],
    desc: '25분 집중 + 5분 휴식 포모도로 타이머 위젯을 표시합니다',
    fullDesc: '포모도로 기법 기반의 집중 타이머입니다. 25분 작업 → 5분 휴식을 반복하며 집중력을 유지합니다. 화면 우측 하단에 플로팅 위젯으로 표시되며, 최소화하여 작게 접을 수 있습니다. 완료된 포모도로 횟수를 🍅로 기록합니다.',
    available: true,
  },
  {
    id: 'periodicNotes',
    icon: '📅',
    name: 'Periodic Notes',
    author: '빌트인',
    version: '1.0.0',
    tags: ['날짜', '일지', '생산성'],
    desc: 'Ctrl+Alt+D 단축키로 오늘의 일간 노트를 즉시 엽니다',
    fullDesc: 'Ctrl+Alt+D 단축키를 누르면 오늘 날짜(YYYY-MM-DD) 형식의 일간 노트로 자동 이동합니다. 오늘 노트가 없으면 새로 생성합니다. 매일 일정한 형식으로 일지를 쓰고 싶을 때 유용합니다.',
    available: true,
  },
  {
    id: 'canvas',
    icon: '🖼️',
    name: '캔버스',
    author: '빌트인',
    version: '1.0.0',
    tags: ['시각화', '다이어그램', '편집기'],
    desc: '무한 캔버스 — 카드와 화살표로 다이어그램을 자유롭게 그립니다',
    fullDesc: '슬래시 명령어(/)로 캔버스 블록을 삽입합니다. 빈 캔버스 위에 더블클릭으로 카드를 추가하고, 카드 모서리의 연결 핸들을 드래그하여 화살표로 연결합니다. 마우스 휠로 줌, 드래그로 팬 이동이 가능합니다. 플로우차트, 마인드맵, 아이디어 정리에 적합합니다.',
    available: true,
  },
  {
    id: 'excalidraw',
    icon: '✏️',
    name: 'Excalidraw',
    author: '커뮤니티',
    version: '1.0.0',
    tags: ['시각화', '다이어그램', '손그림'],
    desc: '손그림 스타일의 다이어그램과 스케치를 그립니다',
    fullDesc: '손으로 그린 듯한 스타일의 다이어그램을 자유롭게 그릴 수 있습니다. 슬래시 명령어(/)로 Excalidraw 블록을 삽입한 뒤, 도형·화살표·텍스트·손그림 등 다양한 도구로 플로우차트, 마인드맵, 와이어프레임 등을 제작하세요. 전체화면 토글로 넓게 작업할 수 있으며, 변경 사항은 자동으로 저장됩니다. 기본값은 비활성화 — 설정에서 ON으로 전환하면 슬래시 메뉴에 Excalidraw 항목이 나타납니다.',
    available: true,
  },
  {
    id: 'videoAutoplay',
    icon: '🎬',
    name: 'Autoplay & Loop',
    author: '빌트인',
    version: '1.0.0',
    tags: ['비디오', '미디어', '자동재생', '반복'],
    desc: '비디오 블록을 자동 재생하고 반복합니다',
    fullDesc: '슬래시 명령어(/)로 비디오 블록을 삽입한 뒤 로컬 비디오 파일(MP4·WebM·OGG·MOV·AVI·MKV)을 업로드하면 HTML5 플레이어로 재생됩니다. 자동 재생을 ON으로 설정하면 페이지 로드 시 비디오가 자동으로 시작됩니다. 브라우저 보안 정책에 따라 자동 재생 중에는 음소거 상태로 시작되며, 플레이어에서 직접 소리를 켤 수 있습니다. 반복 재생은 아래 세부 설정에서 별도로 켜고 끌 수 있습니다.',
    available: true,
  },
  {
    id: 'layoutEnabled',
    icon: '📐',
    name: '레이아웃 블록',
    author: '빌트인',
    version: '1.0.0',
    tags: ['편집기', '레이아웃', '인쇄'],
    desc: 'A4 용지 기준 다단 레이아웃 블록 (잡지 편집 스타일)',
    fullDesc: '슬래시 명령어(/)로 레이아웃 블록을 삽입합니다. 세로 A4(6종)와 가로 A4(2종) 템플릿 중 선택하면 CSS Grid 기반 다단 레이아웃이 생성됩니다. 각 슬롯에는 텍스트를 직접 입력할 수 있습니다. 인쇄(PDF 내보내기) 시 A4 용지 크기에 맞게 자동 조정됩니다. 아래 설정에서 기본 템플릿을 지정하거나, 슬라이더로 원하는 열 비율의 커스텀 템플릿을 직접 만들어 저장할 수 있습니다.',
    available: true,
  },
  {
    id: 'backlinks',
    icon: '🔗',
    name: '백링크 패널',
    author: '빌트인',
    version: '1.0.0',
    tags: ['탐색', '지식관리'],
    desc: '이 페이지를 참조하는 다른 페이지 목록을 하단에 표시합니다',
    fullDesc: '@멘션이나 [[ 링크로 현재 페이지를 참조하는 다른 페이지들을 페이지 하단에 자동으로 표시합니다. 각 카드에는 참조 페이지의 제목과 링크가 포함된 블록 스니펫이 나타나며, 클릭하면 해당 페이지로 바로 이동합니다. 페이지 간 연결 관계를 시각적으로 파악하고 지식 그래프를 탐색하는 데 유용합니다.',
    available: true,
  },
  {
    id: 'chart',
    icon: '📈',
    name: '차트 블록',
    author: '빌트인',
    version: '1.0.0',
    tags: ['시각화', '데이터', '편집기'],
    desc: '막대 · 선 · 파이 차트로 데이터를 시각화합니다',
    fullDesc: '슬래시 명령어(/)로 차트 블록을 삽입합니다. 막대(Bar), 꺾은선(Line), 원형(Pie) 세 가지 차트 타입을 지원합니다. 표 형태의 편집 UI에서 라벨과 값을 직접 입력하고, 시리즈별 색상도 커스텀할 수 있습니다. 편집 완료 후 미리보기로 전환하면 recharts 기반의 인터랙티브 차트가 렌더링됩니다.',
    available: true,
  },
  {
    id: 'gantt',
    icon: '📅',
    name: '갠트 차트',
    author: '빌트인',
    version: '1.0.0',
    tags: ['시각화', '일정관리', '편집기'],
    desc: '태스크 일정과 기간을 타임라인으로 시각화합니다',
    fullDesc: '슬래시 명령어(/)로 갠트 차트 블록을 삽입합니다. 태스크 이름·시작일·종료일·진행률·색상을 표 형태로 입력하면, 가로 타임라인 위에 색상 막대로 일정이 시각화됩니다. 오늘 날짜 표시선으로 현재 진행 상황을 한눈에 파악할 수 있으며, 막대에 마우스를 올리면 상세 정보 툴팁이 나타납니다.',
    available: true,
  },
  {
    id: 'mindmap',
    icon: '🧠',
    name: 'AI 마인드맵',
    author: '빌트인',
    version: '1.0.0',
    tags: ['시각화', 'AI', '브레인스토밍', '편집기'],
    desc: 'AI와 대화하며 만드는 방사형 마인드맵 블록',
    fullDesc: '슬래시 명령어(/)로 마인드맵 블록을 삽입합니다. 왼쪽 SVG 캔버스에서 노드를 더블클릭해 직접 편집하거나, 오른쪽 AI 채팅 패널에서 "마케팅 전략 마인드맵 만들어줘"처럼 대화하면 AI가 전체 트리를 자동 생성합니다. 특정 노드를 우클릭 → AI로 확장을 누르면 해당 가지만 심화할 수 있습니다. Tab으로 자식 추가, Enter로 형제 추가, Delete로 삭제, Ctrl+스크롤로 줌을 지원합니다.',
    available: true,
  },
]

// -----------------------------------------------
// 레이아웃 기본 템플릿 목록 (cols[] 기반으로 SVG 미리보기 가능한 것만)
// top-split, big-left는 row-span 구조로 cols[]로 표현 불가 → 제외
// Python으로 치면: BUILTIN_LAYOUT_TEMPLATES = [{'id': 'two-col', 'cols': [50, 50], ...}, ...]
// -----------------------------------------------
const BUILTIN_LAYOUT_TEMPLATES = [
  { id: 'two-col',          name: '2단 균등',   cols: [50, 50],     orientation: 'portrait'  as const },
  { id: 'sidebar-left',     name: '사이드바 좌', cols: [33, 67],     orientation: 'portrait'  as const },
  { id: 'sidebar-right',    name: '사이드바 우', cols: [67, 33],     orientation: 'portrait'  as const },
  { id: 'three-col',        name: '3단 균등',   cols: [33, 34, 33], orientation: 'portrait'  as const },
  { id: 'landscape-two',    name: '가로 2단',   cols: [50, 50],     orientation: 'landscape' as const },
  { id: 'landscape-three',  name: '가로 3단',   cols: [33, 34, 33], orientation: 'landscape' as const },
]

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
        <label className="block text-xs font-medium text-gray-600 mb-1">템플릿 이름</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          placeholder="예: 본문+사이드 60:40"
          className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 transition-all"
        />
      </div>

      {/* 방향 선택 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">A4 방향</label>
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
              {o === 'portrait' ? '📄 세로' : '🖥️ 가로'}
            </button>
          ))}
        </div>
      </div>

      {/* 열 수 선택 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">열 수</label>
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
              {n}단
            </button>
          ))}
        </div>
      </div>

      {/* 비율 슬라이더 + 실시간 비율 표시 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">열 비율</label>

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
          <p>A4 {orientation === 'portrait' ? '세로' : '가로'} · {colCount}단</p>
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
        + 커스텀 템플릿 저장
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
      aria-label={on ? 'OFF로 전환' : 'ON으로 전환'}
      className={on && !disabled
        ? "relative w-11 h-6 rounded-full bg-blue-500 transition-colors shrink-0"
        : "relative w-11 h-6 rounded-full bg-gray-200 transition-colors shrink-0 cursor-not-allowed opacity-40"
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
          p.tags.some(t => t.toLowerCase().includes(q))
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
            placeholder="🔍 검색..."
            className="w-full text-xs px-2.5 py-1.5 bg-gray-100 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-300 transition-all"
          />
        </div>

        {/* 플러그인 목록 */}
        {/* Python으로 치면: for i, plugin in enumerate(filtered): render_row(plugin, selected=(i==safeIdx)) */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">검색 결과 없음</p>
          )}
          {filtered.map((plugin, idx) => (
            <button
              key={`${plugin.id}-${idx}`}
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
                  준비중
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
                  준비 중
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">세부 설정</p>
            {/* 반복 재생 토글 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 font-medium">🔁 반복 재생</p>
                <p className="text-xs text-gray-400 mt-0.5">비디오가 끝나면 처음부터 다시 재생합니다</p>
              </div>
              <Toggle
                on={plugins.videoLoop}
                onToggle={() => togglePlugin('videoLoop')}
                disabled={false}
              />
            </div>
          </div>
        )}

        {/* ── 레이아웃 블록 전용 서브 설정 ────────────────────────────
            기본 템플릿 선택 + 커스텀 템플릿 디자이너 + 저장된 커스텀 목록
            Python으로 치면: if selected.id == 'layoutEnabled': render_layout_settings() */}
        {selected.id === 'layoutEnabled' && (
          <div className="mt-4 border border-gray-200 rounded-xl p-4 space-y-5 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">레이아웃 설정</p>

            {/* ── 기본 템플릿 선택 ──────────────────────────────────
                새 레이아웃 블록 추가 시 자동으로 이 템플릿이 적용됨
                Python으로 치면: self.default_template_picker = TemplatePicker() */}
            <div className="space-y-2">
              <div>
                <p className="text-sm text-gray-700 font-medium">📐 기본 템플릿</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  새 레이아웃 블록 추가 시 자동으로 선택됩니다 (없음 = 피커 표시)
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
                  <p className="text-xs font-medium text-gray-600">없음</p>
                  <p className="text-xs text-gray-400">피커 표시</p>
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
              <p className="text-sm text-gray-700 font-medium mb-2">✏️ 커스텀 템플릿 만들기</p>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <CustomTemplateDesigner onSave={addCustomLayoutTemplate} />
              </div>
            </div>

            {/* ── 저장된 커스텀 템플릿 목록 ───────────────────────────
                각 항목: 미리보기 + 이름 + 비율 + 삭제 버튼
                Python으로 치면: for tpl in custom_templates: render(CustomTemplateRow(tpl)) */}
            {customLayoutTemplates.length > 0 && (
              <div>
                <p className="text-sm text-gray-700 font-medium mb-2">📁 저장된 커스텀 템플릿</p>
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
                          {tpl.orientation === 'portrait' ? '세로' : '가로'} ·{' '}
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
                        title="템플릿 삭제"
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
              ? '이 플러그인은 아직 사용할 수 없습니다'
              : isOn
                ? '✅ 활성화됨'
                : '⭕ 비활성화됨'
            }
          </span>

          {/* 토글 버튼 */}
          <div className="flex items-center gap-3">
            {/* 활성화/비활성화 버튼 텍스트 레이블 */}
            <span className="text-xs text-gray-500 select-none">
              {isOn ? '비활성화' : '활성화'}
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
