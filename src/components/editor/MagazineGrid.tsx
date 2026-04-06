// =============================================
// src/components/editor/MagazineGrid.tsx
// 역할: 존 기반 잡지 레이아웃 렌더러
// 구조: 섹션(헤딩 + 피처존 + 본문존) — 높이는 콘텐츠가 자동 결정
// Python으로 치면: class MagazineGrid(Component): def render(self): ...
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'
import { Block, LayoutDescriptor, LayoutTheme } from '@/types/block'
import { usePageStore } from '@/store/pageStore'
import { useSettingsStore } from '@/store/settingsStore'
import { MagazineSection, AILayoutPlan, groupIntoSections, applyAILayout } from '@/lib/magazineLayout'
import Editor from './Editor'

// ── 폰트 페어링 매핑 ──────────────────────────
// Python으로 치면: FONT_PAIRS: dict[str, dict] = {...}
const FONT_PAIR_STYLES: Record<LayoutTheme['fontPair'], { heading: string; body: string }> = {
  editorial: { heading: '"Playfair Display", Georgia, serif', body: '"Source Serif 4", Georgia, serif' },
  modern:    { heading: '"Inter", sans-serif',                body: '"Inter", sans-serif' },
  classic:   { heading: 'Garamond, "Times New Roman", serif', body: '"Gill Sans", "Trebuchet MS", sans-serif' },
  minimal:   { heading: '"Inter", sans-serif',                body: '"Inter", sans-serif' },
}

// 피처 존 너비 비율 — 섹션 전체 너비 대비
// Python으로 치면: FEATURE_WIDTH_RATIO = 0.45
const FEATURE_WIDTH_RATIO = 0.45

interface MagazineGridProps {
  pageId: string
  blocks: Block[]
  descriptor: LayoutDescriptor
  readMode?: boolean
}

// -----------------------------------------------
// MagazineGrid 메인 컴포넌트
// Python으로 치면: class MagazineGrid(Component): ...
// -----------------------------------------------
export default function MagazineGrid({ pageId, blocks, descriptor, readMode = false }: MagazineGridProps) {
  const { updateLayoutTheme } = usePageStore()
  // settingsStore에서 AI provider/model 읽기 — 사용자가 설정에서 바꾸면 여기도 반영
  // Python으로 치면: provider, model = settings.ai_provider, settings.ai_model
  const aiProvider = useSettingsStore(s => s.aiProvider)
  const aiModel = useSettingsStore(s => s.aiModel)
  // provider별 분리 키 — 전환해도 서로 지워지지 않음
  const openaiApiKey = useSettingsStore(s => s.openaiApiKey)
  const anthropicApiKey = useSettingsStore(s => s.anthropicApiKey)

  // 섹션 상태 — 초기값은 로컬 룰 기반 그룹핑
  const [sections, setSections] = useState<MagazineSection[]>(() => groupIntoSections(blocks))
  // AI 재생성 로딩 상태
  const [isGenerating, setIsGenerating] = useState(false)
  // AI 오류 메시지
  const [aiError, setAiError] = useState<string | null>(null)

  // blocks 변경 시 섹션 재계산 — 블록 ID 목록 기반으로 비교
  // 블록 내용(content) 변경만으로는 섹션 재배치하지 않음 (GIF 재생 등 안정성)
  // Python으로 치면: useEffect → watch block ids and types
  const blockSignature = blocks.map(b => `${b.id}:${b.type}`).join(',')
  useEffect(() => {
    if (!isGenerating) {
      setSections(groupIntoSections(blocks))
    }
  }, [blockSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 피처 위치 토글 ─────────────────────────
  // 특정 섹션의 피처를 좌↔우 전환
  // Python으로 치면: def toggle_feature_position(section_id): ...
  const toggleFeaturePosition = useCallback((sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, featurePosition: s.featurePosition === 'left' ? 'right' : 'left' }
        : s
    ))
  }, [])

  // ── AI 레이아웃 재생성 ──────────────────────
  // Claude API에 블록 목록을 보내고 레이아웃 계획을 받아 섹션 재구성
  // Python으로 치면: async def regenerate_with_ai(): ...
  const handleAIRegenerate = useCallback(async () => {
    setIsGenerating(true)
    setAiError(null)
    try {
      // provider, model, apiKey를 함께 전달 — .env.local 없이도 동작
      const isOpenAI = aiProvider === 'openai'
      const res = await fetch('/api/magazine-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: blocks.map(b => ({ id: b.id, type: b.type, content: b.content })),
          provider: isOpenAI ? 'openai' : 'claude',
          model: aiModel || undefined,
          apiKey: isOpenAI ? openaiApiKey : anthropicApiKey,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // detail이 있으면 포함해서 표시 (키 미설정, 모델 오류 등 진단용)
        const detail = json?.detail ? ` (${json.detail})` : ''
        throw new Error((json?.error ?? `HTTP ${res.status}`) + detail)
      }
      setSections(applyAILayout(json as AILayoutPlan, blocks))
    } catch (err) {
      console.error('[MagazineGrid] AI 재생성 실패:', err)
      const msg = err instanceof Error ? err.message : 'AI 레이아웃 생성에 실패했습니다.'
      setAiError(msg)
      setSections(groupIntoSections(blocks))
    } finally {
      setIsGenerating(false)
    }
  }, [blocks])

  const theme = descriptor.theme
  const fontStyle = FONT_PAIR_STYLES[theme.fontPair]
  const gap = theme.columnGap

  return (
    <div
      className="relative w-full"
      style={{ fontFamily: fontStyle.body, padding: theme.padding }}
    >
      {/* 상단 툴바 */}
      {!readMode && (
        <MagazineToolbar
          theme={theme}
          isGenerating={isGenerating}
          aiProvider={aiProvider}
          aiModel={aiModel}
          onAIRegenerate={handleAIRegenerate}
          onThemeChange={patch => updateLayoutTheme(pageId, patch)}
        />
      )}

      {/* AI 오류 알림 */}
      {aiError && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>{aiError}</span>
          <button onClick={() => setAiError(null)} className="text-red-400 hover:text-red-600 ml-4">×</button>
        </div>
      )}

      {/* 섹션 목록 — 각 섹션이 읽는 단위 */}
      <div className="flex flex-col" style={{ gap: gap * 3 }}>
        {sections.map((section, idx) => (
          <SectionView
            key={section.id}
            section={section}
            sectionIndex={idx}
            pageId={pageId}
            readMode={readMode}
            fontStyle={fontStyle}
            gap={gap}
            accentColor={theme.accentColor}
            onToggleFeature={() => toggleFeaturePosition(section.id)}
          />
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------
// 섹션 뷰 — 헤딩 + (피처 | 본문) 2단 구조
// 높이는 완전히 콘텐츠에 의해 결정됨
// Python으로 치면: class SectionView(Component): ...
// -----------------------------------------------
interface SectionViewProps {
  section: MagazineSection
  sectionIndex: number
  pageId: string
  readMode: boolean
  fontStyle: { heading: string; body: string }
  gap: number
  accentColor: string
  onToggleFeature: () => void
}

function SectionView({
  section, sectionIndex, pageId, readMode, fontStyle, gap, accentColor, onToggleFeature,
}: SectionViewProps) {
  const hasFeature = section.featureBlocks.length > 0
  const hasBody = section.bodyBlocks.length > 0 || section.accentBlocks.length > 0
  const isFeatureLeft = section.featurePosition === 'left'

  // 섹션 경계선: 첫 번째 섹션 제외하고 상단에 선 표시
  const showDivider = sectionIndex > 0

  return (
    <div className="relative">
      {/* 섹션 구분선 */}
      {showDivider && (
        <div
          className="w-full h-px mb-6 opacity-20"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* 피처 위치 토글 버튼 — 편집 모드에서만 */}
      {!readMode && hasFeature && (
        <button
          onClick={onToggleFeature}
          className="absolute -top-1 right-0 z-10 px-2 py-0.5 text-xs bg-white border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm"
          title="피처 블록 위치 좌↔우 전환"
        >
          {isFeatureLeft ? '◀ 피처 좌' : '피처 우 ▶'}
        </button>
      )}

      {/* 헤딩 — 항상 최상단, 전체 폭 */}
      {section.headingBlock && (
        <div
          className="w-full mb-4"
          style={{ fontFamily: fontStyle.heading }}
        >
          <Editor
            block={section.headingBlock}
            pageId={pageId}
            isLast={false}
            readMode={readMode}
            isSelected={false}
            onSelect={() => {}}
          />
        </div>
      )}

      {/* 콘텐츠 영역 — 피처 + 본문 좌우 배치 */}
      {(hasFeature || hasBody) && (
        <div
          className="flex w-full"
          style={{ gap, flexDirection: isFeatureLeft ? 'row' : 'row-reverse' }}
        >
          {/* 피처 존 — 이미지·표·차트: 자체 높이로 자연스럽게 */}
          {hasFeature && (
            <div
              className="shrink-0 flex flex-col"
              style={{ width: `${FEATURE_WIDTH_RATIO * 100}%`, gap: gap / 2 }}
            >
              {section.featureBlocks.map(block => (
                <div key={block.id} className="w-full">
                  <Editor
                    block={block}
                    pageId={pageId}
                    isLast={false}
                    readMode={readMode}
                    isSelected={false}
                    onSelect={() => {}}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 본문 존 — 텍스트 블록: 자연스럽게 흐름 */}
          {hasBody && (
            <div className="flex-1 flex flex-col" style={{ gap: gap / 2 }}>
              {/* 콜아웃·인용 — 본문 상단에 강조 표시 */}
              {section.accentBlocks.map(block => (
                <div
                  key={block.id}
                  className="rounded-lg p-4 mb-2"
                  style={{ borderLeft: `4px solid ${accentColor}`, backgroundColor: `${accentColor}10` }}
                >
                  <Editor
                    block={block}
                    pageId={pageId}
                    isLast={false}
                    readMode={readMode}
                    isSelected={false}
                    onSelect={() => {}}
                  />
                </div>
              ))}

              {/* 본문 블록 — 순서대로 자연스럽게 흐름 */}
              {section.bodyBlocks.map(block => (
                <div key={block.id}>
                  <Editor
                    block={block}
                    pageId={pageId}
                    isLast={false}
                    readMode={readMode}
                    isSelected={false}
                    onSelect={() => {}}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 피처도 본문도 없으면 헤딩만인 섹션 — 아무것도 렌더링 안 함 */}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------
// 상단 툴바
// Python으로 치면: class MagazineToolbar(Component): ...
// -----------------------------------------------
interface MagazineToolbarProps {
  theme: LayoutTheme
  isGenerating: boolean
  aiProvider: string
  aiModel: string
  onAIRegenerate: () => void
  onThemeChange: (patch: Partial<LayoutTheme>) => void
}

// provider → 표시 레이블
// Python으로 치면: PROVIDER_LABEL = {'claude': 'Claude', 'openai': 'OpenAI', ...}
const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  ollama: 'Ollama',
}

function MagazineToolbar({ theme, isGenerating, aiProvider, aiModel, onAIRegenerate, onThemeChange }: MagazineToolbarProps) {
  const providerLabel = PROVIDER_LABEL[aiProvider] ?? aiProvider
  const modelLabel = aiModel ? ` · ${aiModel}` : ''

  return (
    <div className="flex items-center gap-2 mb-6 p-2 bg-gray-50 rounded-lg border border-gray-200 text-sm flex-wrap">
      {/* AI 재배치 버튼 — 현재 provider/model 표시 */}
      <button
        onClick={onAIRegenerate}
        disabled={isGenerating}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait transition-colors text-xs font-medium"
        title={`${providerLabel}${modelLabel} 로 레이아웃을 분석·재배치합니다`}
      >
        {isGenerating ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {providerLabel} 분석 중...
          </>
        ) : (
          <>✨ AI 재배치 <span className="opacity-70 font-normal">{providerLabel}{modelLabel}</span></>
        )}
      </button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* 폰트 페어 선택 */}
      <select
        value={theme.fontPair}
        onChange={e => onThemeChange({ fontPair: e.target.value as LayoutTheme['fontPair'] })}
        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
      >
        <option value="editorial">Editorial (Playfair)</option>
        <option value="modern">Modern (Inter)</option>
        <option value="classic">Classic (Garamond)</option>
        <option value="minimal">Minimal</option>
      </select>

      {/* 강조 색상 */}
      <input
        type="color"
        value={theme.accentColor}
        onChange={e => onThemeChange({ accentColor: e.target.value })}
        className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
        title="강조 색상"
      />

      {/* 간격 슬라이더 */}
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        간격
        <input
          type="range"
          min={8}
          max={48}
          step={4}
          value={theme.columnGap}
          onChange={e => onThemeChange({ columnGap: +e.target.value, rowGap: +e.target.value })}
          className="w-16"
        />
        <span className="w-6 text-right">{theme.columnGap}</span>
      </label>
    </div>
  )
}
