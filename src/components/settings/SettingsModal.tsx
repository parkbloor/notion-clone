// =============================================
// src/components/settings/SettingsModal.tsx
// 역할: 설정 모달 — 좌측 탭 메뉴 + 우측 탭 콘텐츠
// Python으로 치면: class SettingsDialog(Dialog): def render(self): ...
// =============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { useLocale } from '@/locales'
import AppearanceTab from './tabs/AppearanceTab'
import EditorTab     from './tabs/EditorTab'
import PluginsTab    from './tabs/PluginsTab'
import DataTab       from './tabs/DataTab'
import StorageTab    from './tabs/StorageTab'
import DebugTab      from './tabs/DebugTab'
import TemplatesTab  from './tabs/TemplatesTab'
import AITab        from './tabs/AITab'
import CloudSyncTab from './tabs/CloudSyncTab'

interface SettingsModalProps {
  onClose: () => void
}

// -----------------------------------------------
// 탭 목록 정의
// Python으로 치면: TABS = [{'id': 'appearance', 'icon': '🎨'}, ...]
// -----------------------------------------------
type TabId = 'appearance' | 'editor' | 'plugins' | 'data' | 'storage' | 'cloud' | 'debug' | 'templates' | 'ai'

const TAB_ICONS: Record<TabId, string> = {
  appearance: '🎨',
  editor:     '✏️',
  plugins:    '🧩',
  templates:  '📋',
  ai:         '✨',
  data:       '📦',
  storage:    '📁',
  cloud:      '☁️',
  debug:      '🔍',
}

const TAB_IDS: TabId[] = ['appearance', 'editor', 'plugins', 'templates', 'ai', 'data', 'storage', 'cloud', 'debug']

// 탭 ID → 컴포넌트 매핑
// Python으로 치면: TAB_COMPONENTS = {'appearance': AppearanceTab, ...}
const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  appearance: AppearanceTab,
  editor:     EditorTab,
  plugins:    PluginsTab,
  templates:  TemplatesTab,
  ai:         AITab,
  data:       DataTab,
  storage:    StorageTab,
  cloud:      CloudSyncTab,
  debug:      DebugTab,
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  // 번역 훅
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 현재 선택된 탭
  // Python으로 치면: self.active_tab = 'appearance'
  const [activeTab, setActiveTab] = useState<TabId>('appearance')
  const modalRef = useRef<HTMLDivElement>(null)

  // Escape 키로 모달 닫기
  // Python으로 치면: def on_key_press(self, e): if e.key == 'Escape': self.close()
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // 오버레이 클릭 시 모달 닫기
  // Python으로 치면: def on_overlay_click(self, e): if e.target == overlay: self.close()
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  // 현재 탭 컴포넌트 (StorageTab 제외)
  const ActiveTabComponent = TAB_COMPONENTS[activeTab]

  return (
    // 오버레이 (반투명 배경)
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      {/* 모달 컨테이너 */}
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-180 h-135 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">⚙️ {t.settings.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg"
            aria-label={t.common.close}
          >
            ×
          </button>
        </div>

        {/* 모달 본문: 좌측 탭 메뉴 + 우측 콘텐츠 */}
        <div className="flex flex-1 overflow-hidden">

          {/* 좌측 탭 네비게이션 */}
          {/* Python으로 치면: self.tab_menu = TabMenu(items=TABS) */}
          <nav className="w-44 bg-gray-50 border-r border-gray-200 py-2 shrink-0 overflow-y-auto">
            {TAB_IDS.map((tabId) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                className={tabId === activeTab
                  ? "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border-r-2 border-blue-500 transition-colors text-left"
                  : "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors text-left"
                }
              >
                <span className="text-base shrink-0">{TAB_ICONS[tabId]}</span>
                <span>{t.settings.tabs[tabId]}</span>
              </button>
            ))}
          </nav>

          {/* 우측 탭 콘텐츠 — 스크롤 가능 */}
          {/* Python으로 치면: self.content_area.render(self.active_tab_component) */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'storage'
              ? <StorageTab onClose={onClose} />
              : <ActiveTabComponent />
            }
          </div>
        </div>
      </div>
    </div>
  )
}
