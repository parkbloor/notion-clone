// =============================================
// src/components/editor/RightPanel.tsx
// 역할: TOC / 백링크 / 버전 히스토리를 하나의 탭 패널로 통합
// 새 디자인: width 240px, xl 이상 표시, ds-tab 클래스 사용
// Python으로 치면: class RightPanel(TabWidget): tabs = [TocPanel, BacklinkPanel, VersionHistoryPanel]
// =============================================

'use client'

import { useMemo, useState } from 'react'
import { Block } from '@/types/block'
import TocPanel from './TocPanel'
import BacklinkPanel from './BacklinkPanel'
import VersionHistoryPanel from './VersionHistoryPanel'

// -----------------------------------------------
// 탭 타입 정의
// Python으로 치면: Tab = Literal['toc', 'backlinks', 'versions']
// -----------------------------------------------
type Tab = 'toc' | 'backlinks' | 'versions'

interface RightPanelProps {
  pageId: string
  blocks: Block[]
  collapsedIds: Set<string>
  onToggleCollapse: (id: string) => void
  showToc: boolean
  showBacklinks: boolean
}

const TAB_LABELS: Record<Tab, string> = {
  toc:       '목차',
  backlinks: '백링크',
  versions:  '버전',
}

// -----------------------------------------------
// RightPanel: 세 패널을 탭으로 묶은 우측 패널
// Python으로 치면: class RightPanel(QTabWidget): ...
// -----------------------------------------------
export default function RightPanel({
  pageId, blocks, collapsedIds, onToggleCollapse, showToc, showBacklinks,
}: RightPanelProps) {
  const tabs = useMemo(() => ([
    ...(showToc ? ['toc'] : []),
    ...(showBacklinks ? ['backlinks'] : []),
    'versions',
  ] as Tab[]), [showToc, showBacklinks])
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0])
  // 설정 화면에서 플러그인을 끄면 현재 탭이 사라질 수 있다.
  // 렌더링 시 첫 번째 사용 가능한 탭으로 안전하게 대체한다.
  const selectedTab = tabs.includes(activeTab) ? activeTab : tabs[0]

  return (
    <aside
      className="hidden xl:flex flex-col border-l hairline print-hide shrink-0 sticky top-0 self-start max-h-screen"
      style={{ width: 240, background: "var(--color-bg)" }}
      onWheel={e => e.stopPropagation()}
    >
      {/* 탭 헤더 */}
      <div className="flex border-b hairline">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 text-[12px] transition-colors"
            style={{
              color:       selectedTab === tab ? "var(--color-text)" : "var(--color-text-subtle)",
              fontWeight:  selectedTab === tab ? 600 : 400,
              borderBottom: selectedTab === tab
                ? "2px solid var(--color-accent)"
                : "2px solid transparent",
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-y-auto panel-scroll">
        {selectedTab === 'toc' && (
          <TocPanel
            blocks={blocks}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
            inline
          />
        )}
        {selectedTab === 'backlinks' && (
          <div className="px-3 py-4">
            <BacklinkPanel pageId={pageId} inline />
          </div>
        )}
        {selectedTab === 'versions' && (
          <VersionHistoryPanel pageId={pageId} inline />
        )}
      </div>
    </aside>
  )
}
