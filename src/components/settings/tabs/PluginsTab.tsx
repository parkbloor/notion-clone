// =============================================
// src/components/settings/tabs/PluginsTab.tsx
// 역할: 플러그인 관리 탭 — 각 기능 ON/OFF 토글
// Python으로 치면: class PluginSettings(SettingsTab): def render_plugin_list(): ...
// =============================================

'use client'

import { useSettingsStore, PluginSettings } from '@/store/settingsStore'

// -----------------------------------------------
// 플러그인 메타데이터 목록
// Python으로 치면: PLUGIN_LIST = [{'id': 'kanban', 'name': '칸반 보드', ...}, ...]
// -----------------------------------------------
const PLUGIN_LIST: Array<{
  id: keyof PluginSettings
  icon: string
  name: string
  desc: string
  available: boolean   // false이면 "준비 중" 배지 표시
}> = [
  {
    id: 'kanban',
    icon: '📋',
    name: '칸반 보드',
    desc: '/ 명령어로 칸반 보드 블록을 삽입합니다',
    available: true,
  },
  {
    id: 'calendar',
    icon: '🗓️',
    name: '캘린더',
    desc: '메모 목록 상단에 달력을 표시합니다. 날짜 클릭으로 해당 날짜 메모 필터',
    available: true,
  },
  {
    id: 'admonition',
    icon: '💡',
    name: '콜아웃 블록',
    desc: '정보/경고/팁 등 강조 블록을 삽입합니다',
    available: true,
  },
  {
    id: 'excalidraw',
    icon: '✏️',
    name: 'Excalidraw',
    desc: '손그림 스타일의 다이어그램을 그립니다',
    available: false,
  },
  {
    id: 'recentFiles',
    icon: '🕓',
    name: '최근 파일',
    desc: '최근 열었던 페이지 목록을 빠르게 접근합니다',
    available: true,
  },
  {
    id: 'quickAdd',
    icon: '⚡',
    name: '빠른 캡처',
    desc: 'Ctrl+Alt+N 단축키로 새 메모를 즉시 작성합니다',
    available: true,
  },
]

// -----------------------------------------------
// ON/OFF 토글 버튼 컴포넌트
// Python으로 치면: class ToggleButton(Widget): def render(self): ...
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
        : "relative w-11 h-6 rounded-full bg-gray-300 transition-colors shrink-0 cursor-not-allowed opacity-50"
      }
    >
      {/* 토글 핸들 원 */}
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

  return (
    <div className="p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">플러그인 관리</h3>
      <p className="text-xs text-gray-400 mb-6">
        각 기능을 켜거나 끕니다. 비활성화된 기능은 슬래시 메뉴와 UI에서 숨겨집니다.
      </p>

      {/* 플러그인 목록 */}
      <div className="space-y-2">
        {PLUGIN_LIST.map((plugin) => (
          <div
            key={plugin.id}
            className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            {/* 아이콘 */}
            <span className="text-2xl shrink-0">{plugin.icon}</span>

            {/* 이름 + 설명 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{plugin.name}</span>
                {/* 준비 중 배지 */}
                {!plugin.available && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                    준비 중
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{plugin.desc}</p>
            </div>

            {/* ON/OFF 토글 */}
            <Toggle
              on={plugins[plugin.id]}
              onToggle={() => plugin.available && togglePlugin(plugin.id)}
              disabled={!plugin.available}
            />
          </div>
        ))}
      </div>

      {/* 안내 문구 */}
      <p className="mt-6 text-xs text-gray-400 text-center">
        "준비 중" 플러그인은 향후 업데이트에서 추가됩니다
      </p>
    </div>
  )
}
