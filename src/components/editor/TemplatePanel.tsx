// =============================================
// src/components/editor/TemplatePanel.tsx
// 역할: 빈 페이지에 표시되는 인라인 템플릿 선택 패널
// 페이지에 내용이 생기면 자동으로 사라짐
// Python으로 치면: class TemplatePanel(Widget): def render_if_empty(): ...
// =============================================

'use client'

import { useEffect, useState } from 'react'
import { templateApi, Template } from '@/lib/api'

interface TemplatePanelProps {
  // 템플릿 적용 콜백 — content는 마크다운 텍스트
  // Python으로 치면: on_select: Callable[[str], None]
  onSelect: (content: string) => void
}

export default function TemplatePanel({ onSelect }: TemplatePanelProps) {

  // 서버에서 불러온 템플릿 목록
  // Python으로 치면: self.templates: list[Template] = []
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  // -----------------------------------------------
  // 마운트 시 템플릿 목록 불러오기
  // Python으로 치면: async def on_mount(self): self.templates = await api.get_all()
  // -----------------------------------------------
  useEffect(() => {
    templateApi.getAll()
      .then(setTemplates)
      .finally(() => setLoading(false))
  }, [])

  // 템플릿이 없고 로딩도 끝났으면 패널 자체를 숨김
  if (!loading && templates.length === 0) return null

  return (
    // 제목 인풋 바로 아래, 블록 목록 위에 표시
    // Python으로 치면: panel = QFrame(); panel.setStyleSheet('...')
    <div className="mb-6 select-none">
      <p className="text-xs text-gray-400 mb-2 font-medium tracking-wide uppercase">
        템플릿으로 시작하기
      </p>

      {loading ? (
        // 로딩 중 스켈레톤
        <div className="flex gap-2">
          {[1, 2, 3].map(n => (
            <div key={n} className="h-14 w-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        // 템플릿 카드 목록 (가로 스크롤)
        // Python으로 치면: self.template_list = HScrollLayout([TemplateCard(t) for t in templates])
        <div className="flex flex-wrap gap-2">
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.content)}
              className="flex flex-col items-center justify-center gap-1 w-24 h-16 border border-gray-200 rounded-xl bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors group"
              title={t.description || t.name}
            >
              {/* 아이콘 */}
              <span className="text-xl group-hover:scale-110 transition-transform">
                {t.icon}
              </span>
              {/* 이름 (2줄까지) */}
              <span className="text-xs text-gray-600 text-center leading-tight px-1 line-clamp-2">
                {t.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 구분선 */}
      <div className="mt-4 border-b border-gray-100" />
    </div>
  )
}
