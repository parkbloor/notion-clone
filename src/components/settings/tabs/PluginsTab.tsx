// =============================================
// src/components/settings/tabs/PluginsTab.tsx
// 역할: 플러그인 관리 탭 — 옵시디언 스타일 마스터-디테일 레이아웃
// 좌측: 검색 + 플러그인 목록 / 우측: 선택된 플러그인 상세 정보
// Python으로 치면: class PluginsTab(QSplitter): left=PluginList, right=PluginDetail
// =============================================

'use client'

import { useState } from 'react'
import { useSettingsStore, PluginSettings } from '@/store/settingsStore'

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
]

// -----------------------------------------------
// ON/OFF 토글 버튼 (기존과 동일)
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
  const { plugins, togglePlugin } = useSettingsStore()

  // ── 선택된 플러그인 ID (상세 패널에 표시)
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
        <p className="text-sm text-gray-500 leading-relaxed mb-auto">
          {selected.fullDesc}
        </p>

        {/* ── 하단 액션 버튼 ──────────────────────── */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">

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
