// =============================================
// src/components/sidebar/PageInlineMenu.tsx
// 역할: 페이지 행의 "•••" 클릭 시 나타나는 컨텍스트 메뉴
// Python으로 치면: class PageInlineMenu(Widget): ...
// =============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { usePageStore } from '@/store/pageStore'
import { useLocale } from '@/locales'
import { Page } from '@/types/block'
import { templateApi } from '@/lib/api'
import { toast } from 'sonner'
import { blocksToMarkdown, FOLDER_COLOR_GROUPS } from './sidebarUtils'

// -----------------------------------------------
// 페이지 인라인 컨텍스트 메뉴 props
// fixed 포지셔닝 좌표 — overflow:hidden 사이드바에서 팝업이 잘리는 문제 해결
// Python으로 치면: (anchor_x, anchor_y) = button.get_bounding_rect()
// -----------------------------------------------
interface PageInlineMenuProps {
  page: Page
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
  anchorX: number
  anchorY: number
}

export default function PageInlineMenu({ page, onClose, onDelete, onDuplicate, anchorX, anchorY }: PageInlineMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  // 즐겨찾기 토글 — 메뉴 내부에서 직접 스토어 접근
  const { togglePageStar, updatePageColor } = usePageStore()
  // Python으로 치면: t = get_locale()
  const t = useLocale()

  // 템플릿 저장 폼 표시 여부
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [templateName, setTemplateName] = useState(page.title || '')
  const [templateDesc, setTemplateDesc] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 메뉴 외부 클릭 → 닫기
  // Python으로 치면: document.addEventListener('click', close_if_outside)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // 템플릿으로 저장
  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return
    setIsSaving(true)
    try {
      await templateApi.create({
        name: templateName.trim(),
        icon: page.icon || '📄',
        description: templateDesc.trim(),
        content: blocksToMarkdown(page),
      })
      toast.success(`"${templateName.trim()}" ${t.common.saveAsTemplate}!`)
      setIsSaving(false)
      onClose()
    } catch {
      toast.error(t.settings.templates.saveError)
      setIsSaving(false)
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      style={{
        width: showSaveForm ? '210px' : '224px',
        // z-9999는 Tailwind v4에서 생성되지 않으므로 인라인으로 직접 지정
        // Python으로 치면: popup.z_index = 9999
        zIndex: 9999,
        // 버튼 우측 하단에 팝업 표시, 화면 오른쪽 벗어나지 않도록 left 기준 배치
        // Python으로 치면: popup.x = min(anchor_x, screen_width - popup_width)
        left: `${anchorX}px`,
        top: `${anchorY}px`,
      }}
    >
      {showSaveForm ? (
        /* ── 템플릿 저장 폼 ── */
        <div className="px-3 py-2 space-y-2">
          <p className="text-xs font-medium text-gray-600">{t.common.saveAsTemplate}</p>
          <input
            type="text" autoFocus
            value={templateName} onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowSaveForm(false) }}
            placeholder={t.common.templateName}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400"
          />
          <input
            type="text"
            value={templateDesc} onChange={e => setTemplateDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowSaveForm(false) }}
            placeholder={t.common.templateDesc}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-400"
          />
          <div className="flex gap-1.5">
            <button
              type="button" onClick={handleSaveAsTemplate}
              disabled={!templateName.trim() || isSaving}
              className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isSaving ? t.common.saving : t.common.save}
            </button>
            <button
              type="button" onClick={() => setShowSaveForm(false)}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div>
            {/* 즐겨찾기 토글 */}
            <button
              onClick={() => { togglePageStar(page.id); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
            >
              <span>{page.starred ? '★' : '☆'}</span>
              <span>{page.starred ? t.common.removeFavorite : t.common.addFavorite}</span>
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() => { onDuplicate(); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
            >
              <span>📋</span><span>{t.common.duplicate}</span>
            </button>
            <button
              onClick={() => setShowSaveForm(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
            >
              <span>📑</span><span>{t.common.saveAsTemplate}</span>
            </button>
            <div className="my-1 border-t border-gray-100" />
            <div className="px-3 py-1.5">
              <div className="text-[10px] text-gray-400 mb-1">{t.sidebar.pageColor}</div>
              <div className="space-y-1.5">
                {FOLDER_COLOR_GROUPS.map(group => (
                  <div key={group.id}>
                    <div className="text-[10px] text-gray-400 mb-1">{(t.sidebar as Record<string, string>)[group.id]}</div>
                    <div className="flex flex-wrap gap-1">
                      {group.colors.map((color, index) => (
                        <button
                          key={index}
                          type="button"
                          title={color ?? t.sidebar.folderColorDefault}
                          onClick={() => { updatePageColor(page.id, color); onClose() }}
                          className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                          style={{
                            background: color ?? '#e5e7eb',
                            borderColor: page.color === color ? '#1d4ed8'
                              : (color === null && !page.color) ? '#93c5fd'
                              : 'transparent',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() => { onDelete(); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-red-500 hover:bg-red-50"
            >
              <span>🗑️</span><span>{t.common.delete}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
