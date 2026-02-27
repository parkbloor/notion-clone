// =============================================
// src/components/editor/ShortcutModal.tsx
// 역할: 도움말 모달 — 단축키 / 슬래시 커맨드 / 플러그인 탭 3개
// ? 버튼으로 열기, 외부 클릭/Escape로 닫기
// Python으로 치면: class HelpDialog(QDialog): tabs = ['단축키', '슬래시 커맨드', '플러그인']
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'

// -----------------------------------------------
// 탭 1 — 단축키 목록 데이터 (그룹별)
// Python으로 치면: SHORTCUTS = [{'group': ..., 'items': [...]}, ...]
// -----------------------------------------------
const SHORTCUT_GROUPS = [
  {
    group: '텍스트 서식',
    items: [
      { keys: ['Ctrl', 'B'], label: '굵게' },
      { keys: ['Ctrl', 'I'], label: '기울임' },
      { keys: ['Ctrl', 'U'], label: '밑줄' },
      { keys: ['Ctrl', 'Shift', 'S'], label: '취소선' },
      { keys: ['Ctrl', 'E'], label: '인라인 코드' },
    ],
  },
  {
    group: '블록 변환 (마크다운)',
    items: [
      { keys: ['#', 'Space'], label: '제목 1' },
      { keys: ['##', 'Space'], label: '제목 2' },
      { keys: ['###', 'Space'], label: '제목 3' },
      { keys: ['-', 'Space'], label: '글머리 기호 목록' },
      { keys: ['1.', 'Space'], label: '번호 목록' },
      { keys: ['[]', 'Space'], label: '체크박스' },
    ],
  },
  {
    group: '편집',
    items: [
      { keys: ['Ctrl', 'Z'], label: '실행 취소 (블록 구조)' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: '다시 실행' },
      { keys: ['Enter'], label: '새 블록 추가' },
      { keys: ['Backspace'], label: '빈 블록 삭제' },
      { keys: ['Tab'], label: '들여쓰기' },
      { keys: ['Shift', 'Tab'], label: '내어쓰기' },
    ],
  },
  {
    group: '탐색 · 링크',
    items: [
      { keys: ['Ctrl', 'K'], label: '전체 검색 열기' },
      { keys: ['@'], label: '페이지/블록 멘션 팝업' },
      { keys: ['[['], label: '페이지 링크 팝업' },
      { keys: ['Escape'], label: '팝업·메뉴 닫기' },
      { keys: ['?'], label: '도움말 열기' },
    ],
  },
  {
    group: '플러그인 단축키',
    items: [
      { keys: ['Ctrl', 'Alt', 'N'], label: '빠른 노트 캡처 (QuickAdd)' },
      { keys: ['Ctrl', 'Shift', 'F'], label: '집중 모드 ON/OFF' },
      { keys: ['Ctrl', 'Alt', 'D'], label: '오늘의 일간 노트 열기' },
    ],
  },
]

// -----------------------------------------------
// 탭 2 — 슬래시 커맨드 목록 (SlashCommand.tsx의 COMMANDS와 동기화)
// Python으로 치면: SLASH_COMMANDS = [{'group': ..., 'items': [...]}, ...]
// -----------------------------------------------
const SLASH_GROUPS = [
  {
    group: '기본 블록',
    items: [
      { icon: '📝', name: '텍스트',    desc: '일반 텍스트 단락' },
      { icon: '▶',  name: '토글',      desc: '클릭으로 접고 펼치는 블록' },
      { icon: '🔠', name: '제목 1',    desc: '가장 큰 제목 (H1)' },
      { icon: '🔡', name: '제목 2',    desc: '중간 크기 제목 (H2)' },
      { icon: '🔤', name: '제목 3',    desc: '작은 제목 (H3)' },
    ],
  },
  {
    group: '목록',
    items: [
      { icon: '•',   name: '글머리 기호', desc: '순서 없는 목록' },
      { icon: '1.',  name: '번호 목록',   desc: '순서 있는 목록' },
      { icon: '☑️', name: '체크박스',    desc: '할 일 목록 (Task List)' },
    ],
  },
  {
    group: '미디어 · 삽입',
    items: [
      { icon: '🖼️', name: '이미지',  desc: '이미지 파일 업로드' },
      { icon: '📊', name: '표',       desc: '3×3 테이블 삽입' },
      { icon: '💻', name: '코드',     desc: '코드 블록 (구문 강조)' },
      { icon: '➖', name: '구분선',   desc: '수평 구분선 삽입' },
      { icon: '🎬', name: '비디오',   desc: '로컬 비디오 파일 재생' },
    ],
  },
  {
    group: '고급 블록 (플러그인)',
    items: [
      { icon: '📋', name: '칸반',      desc: '칸반 보드 (드래그앤드롭 카드)' },
      { icon: '💡', name: '콜아웃',    desc: '팁/정보/경고/위험 강조 박스' },
      { icon: '🖼️', name: '캔버스',   desc: '무한 캔버스 — 노드·엣지 다이어그램' },
      { icon: '✏️', name: 'Excalidraw', desc: '손그림 스타일 다이어그램' },
      { icon: '📐', name: '레이아웃', desc: 'A4 다단 레이아웃 (잡지 편집 스타일)' },
    ],
  },
]

// -----------------------------------------------
// 탭 3 — 플러그인 목록 (설정 > 플러그인 탭과 동기화)
// Python으로 치면: PLUGINS = [{'icon': ..., 'name': ..., 'shortcut': ..., 'desc': ...}, ...]
// -----------------------------------------------
const PLUGIN_INFO = [
  { icon: '📋', name: '칸반 보드',      shortcut: '/ 칸반',         desc: '슬래시 커맨드로 삽입. 열 간 카드 드래그앤드롭.' },
  { icon: '🗓️', name: '캘린더',         shortcut: '사이드바',        desc: '메모 목록 상단 달력. 날짜 클릭으로 해당 날 메모 필터.' },
  { icon: '💡', name: '콜아웃 블록',    shortcut: '/ 콜아웃',        desc: '팁/정보/경고/위험. 아이콘 클릭으로 종류 순환.' },
  { icon: '✏️', name: 'Excalidraw',     shortcut: '/ Excalidraw',    desc: '손그림 다이어그램. 전체화면 토글 지원.' },
  { icon: '🕓', name: '최근 파일',      shortcut: '사이드바',        desc: '최근 열었던 페이지 최대 10개. localStorage 영속.' },
  { icon: '⚡', name: '빠른 캡처',      shortcut: 'Ctrl+Alt+N',      desc: '화면 중앙 미니 팝업. 제목+메모 즉시 저장.' },
  { icon: '📊', name: '단어 수 표시',   shortcut: '에디터 하단',     desc: '실시간 단어/글자 수. 모든 블록 합산.' },
  { icon: '🎯', name: '집중 모드',      shortcut: 'Ctrl+Shift+F',    desc: '사이드바 숨김, 에디터만 표시.' },
  { icon: '🍅', name: '포모도로',       shortcut: '플로팅 위젯',     desc: '25분+5분 타이머. 최소화 지원. 완료 횟수 🍅 표시.' },
  { icon: '📑', name: '목차(TOC)',       shortcut: 'xl 이상 우측',    desc: '헤딩 기반 목차. 클릭 시 해당 블록으로 스크롤.' },
  { icon: '📅', name: 'Periodic Notes', shortcut: 'Ctrl+Alt+D',      desc: '오늘의 일간 노트 생성·이동. 날짜별 페이지 관리.' },
  { icon: '🎨', name: '캔버스',         shortcut: '/ 캔버스',        desc: '무한 캔버스. 더블클릭 노드 추가, SVG 베지어 엣지.' },
  { icon: '🎬', name: '비디오 블록',    shortcut: '/ 비디오',        desc: '로컬 비디오 파일 업로드+재생. 자동재생/반복 설정 가능.' },
  { icon: '📐', name: '레이아웃 블록',  shortcut: '/ 레이아웃',      desc: 'A4 다단 레이아웃 8종. 인쇄 시 A4에 맞게 자동 조정.' },
  { icon: '🔗', name: '백링크 패널',    shortcut: '페이지 하단',     desc: '@멘션·[[ 링크로 이 페이지를 참조하는 페이지 목록.' },
]

// -----------------------------------------------
// 탭 버튼 레이블 목록
// Python으로 치면: TABS = ['단축키', '슬래시 커맨드', '플러그인']
// -----------------------------------------------
const TABS = ['단축키', '슬래시 커맨드', '플러그인'] as const

interface ShortcutModalProps {
  onClose: () => void
}

export default function ShortcutModal({ onClose }: ShortcutModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  // 활성 탭 인덱스 (0=단축키, 1=슬래시 커맨드, 2=플러그인)
  // Python으로 치면: self.active_tab = 0
  const [activeTab, setActiveTab] = useState(0)

  // -----------------------------------------------
  // Escape 키 → 모달 닫기
  // Python으로 치면: dialog.keyPressEvent = lambda e: e.key == Qt.Key_Escape and dialog.close()
  // -----------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // 오버레이 클릭 시 닫기 (모달 내부 클릭은 전파 차단)
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    // ── 반투명 오버레이 ────────────────────────────────
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
    >
      {/* ── 모달 컨테이너 ─────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">

        {/* ── 헤더: 탭 버튼 + 닫기 ──────────────── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0 border-b border-gray-100 dark:border-gray-800">
          {/* 탭 버튼 목록 */}
          {/* Python으로 치면: QTabBar with 3 tabs */}
          <div className="flex gap-1">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(i)}
                className={activeTab === i
                  ? "px-3 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px transition-colors"
                  : "px-3 py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"}
              >
                {tab}
              </button>
            ))}
          </div>
          {/* 닫기 버튼 */}
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none transition-colors mb-2"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* ── 탭 콘텐츠 (스크롤 가능) ──────────── */}
        <div className="overflow-y-auto px-5 py-4 flex-1">

          {/* ── 탭 0: 단축키 ────────────────────── */}
          {activeTab === 0 && (
            <div className="space-y-5">
              {SHORTCUT_GROUPS.map(group => (
                <div key={group.group}>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                    {group.group}
                  </h3>
                  <div className="space-y-1">
                    {group.items.map(item => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-gray-600 dark:text-gray-300">{item.label}</span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((key, i) => (
                            <span key={i} className="inline-flex items-center">
                              {i > 0 && <span className="text-gray-300 text-xs mx-0.5">+</span>}
                              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 shadow-sm">
                                {key}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 탭 1: 슬래시 커맨드 ──────────────── */}
          {/* Python으로 치면: for group in SLASH_GROUPS: render_group(group) */}
          {activeTab === 1 && (
            <div className="space-y-5">
              {/* 슬래시 입력 방법 안내 */}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                빈 블록에서 <kbd className="px-1 py-0.5 font-mono bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">/</kbd> 를 입력하면 커맨드 메뉴가 나타납니다. 검색어를 입력해 필터링할 수 있습니다.
              </p>
              {SLASH_GROUPS.map(group => (
                <div key={group.group}>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                    {group.group}
                  </h3>
                  <div className="space-y-1">
                    {group.items.map(item => (
                      <div key={item.name} className="flex items-center gap-3 py-1">
                        <span className="text-base w-6 text-center select-none shrink-0">{item.icon}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 w-24 shrink-0">{item.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 탭 2: 플러그인 ───────────────────── */}
          {/* Python으로 치면: for plugin in PLUGIN_INFO: render_row(plugin) */}
          {activeTab === 2 && (
            <div className="space-y-1">
              {/* 설정 안내 */}
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                각 플러그인은 <span className="font-medium">설정(⚙️) → 플러그인</span> 탭에서 ON/OFF 할 수 있습니다.
              </p>
              {PLUGIN_INFO.map(plugin => (
                <div key={plugin.name} className="flex items-start gap-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <span className="text-base w-6 text-center select-none shrink-0 mt-0.5">{plugin.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{plugin.name}</span>
                      {/* 단축키/진입점 뱃지 */}
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded font-mono shrink-0">
                        {plugin.shortcut}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{plugin.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* ── 푸터 ──────────────────────────────── */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-center shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            언제든지{' '}
            <kbd className="px-1 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded">?</kbd>
            {' '}키를 눌러 이 화면을 열 수 있습니다
          </p>
        </div>

      </div>
    </div>
  )
}
