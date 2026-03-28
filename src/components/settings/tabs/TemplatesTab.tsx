// =============================================
// src/components/settings/tabs/TemplatesTab.tsx
// 역할: 설정 > 템플릿 탭 — 사용자 정의 템플릿 CRUD
// 옵시디언 Templater 플러그인처럼 마크다운으로 직접 입력
// Python으로 치면: class TemplatesTab(SettingsTab): def render(self): ...
// =============================================

'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { templateApi, Template } from '@/lib/api'
import { isGridTemplate } from '@/lib/templateGrid'
import TemplateEditorModal from '@/components/editor/TemplateEditorModal'
import { useLocale } from '@/locales'

// ── 새 템플릿 초기값 ──────────────────────────
// Python으로 치면: EMPTY_FORM = {'name': '', 'icon': '📄', ...}
const EMPTY_FORM: Omit<Template, 'id'> = {
  name: '',
  icon: '📄',
  description: '',
  content: '',
}

export default function TemplatesTab() {
  // 로케일 훅 — Python으로 치면: t = get_translation()
  const t = useLocale()

  // 서버에서 불러온 템플릿 목록
  // Python으로 치면: self.templates: list[Template] = []
  const [templates, setTemplates] = useState<Template[]>([])

  // 현재 편집 중인 템플릿 ID (null = 새 템플릿 작성 모드)
  // Python으로 치면: self.editing_id: str | None = None
  const [editingId, setEditingId] = useState<string | null | 'new'>(null)

  // 편집 폼 데이터
  // Python으로 치면: self.form = {'name': '', 'icon': '', ...}
  const [form, setForm] = useState<Omit<Template, 'id'>>(EMPTY_FORM)

  // 저장 중 여부 (버튼 비활성화용)
  const [saving, setSaving] = useState(false)

  // 비주얼 템플릿 에디터 모달 상태
  // Python으로 치면: self.visual_editor_open = False; self.editing_visual_template = None
  const [visualEditorOpen, setVisualEditorOpen] = useState(false)
  const [editingVisualTemplate, setEditingVisualTemplate] = useState<Template | undefined>(undefined)

  // -----------------------------------------------
  // 컴포넌트 마운트 시 템플릿 목록 불러오기
  // Python으로 치면: self.templates = await api.get_all()
  // -----------------------------------------------
  useEffect(() => {
    templateApi.getAll().then(setTemplates).catch(() => {
      toast.error(t.settings.templates.loadError)
    })
  }, [])

  // -----------------------------------------------
  // 저장 (생성 또는 수정)
  // Python으로 치면: async def save(self): ...
  // -----------------------------------------------
  async function handleSave() {
    if (!form.name.trim()) {
      toast.error(t.settings.templates.nameRequired)
      return
    }
    setSaving(true)
    try {
      if (editingId === 'new') {
        // 새 템플릿 생성
        const created = await templateApi.create(form)
        setTemplates(prev => [...prev, created])
        toast.success(t.settings.templates.saveSuccess)
      } else if (editingId) {
        // 기존 템플릿 수정
        const updated = await templateApi.update(editingId, form)
        setTemplates(prev => prev.map(tmpl => tmpl.id === editingId ? updated : tmpl))
        toast.success(t.settings.templates.updateSuccess)
      }
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch {
      toast.error(t.settings.templates.saveError)
    } finally {
      setSaving(false)
    }
  }

  // -----------------------------------------------
  // 삭제
  // Python으로 치면: async def delete(self, template_id): ...
  // -----------------------------------------------
  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" - ${t.settings.templates.deleteConfirm}`)) return
    try {
      await templateApi.delete(id)
      setTemplates(prev => prev.filter(tmpl => tmpl.id !== id))
      // 삭제된 항목을 편집 중이었으면 폼 닫기
      if (editingId === id) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
      toast.success(t.settings.templates.deleteSuccess)
    } catch {
      toast.error(t.settings.templates.deleteError)
    }
  }

  // -----------------------------------------------
  // 편집 모드 시작 — 기존 값을 폼에 채움
  // Python으로 치면: def start_edit(self, template): self.form = template
  // -----------------------------------------------
  function startEdit(tmpl: Template) {
    setEditingId(tmpl.id)
    setForm({ name: tmpl.name, icon: tmpl.icon, description: tmpl.description, content: tmpl.content })
  }

  // -----------------------------------------------
  // 취소
  // Python으로 치면: def cancel_edit(self): self.editing_id = None; self.form = EMPTY
  // -----------------------------------------------
  function handleCancel() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  // 비주얼 에디터 저장 콜백 — 템플릿 목록에 반영
  // Python으로 치면: def on_visual_save(saved): update_list(saved)
  function handleVisualSave(saved: Template) {
    setTemplates(prev => {
      const idx = prev.findIndex(tmpl => tmpl.id === saved.id)
      if (idx !== -1) {
        // 기존 수정
        const next = [...prev]
        next[idx] = saved
        return next
      }
      // 신규 추가
      return [...prev, saved]
    })
    setVisualEditorOpen(false)
    setEditingVisualTemplate(undefined)
  }

  return (
    <>
    {/* 비주얼 그리드 템플릿 에디터 모달 */}
    {/* Python으로 치면: if visual_editor_open: render(TemplateEditorModal) */}
    {visualEditorOpen && (
      <TemplateEditorModal
        initialTemplate={editingVisualTemplate}
        onSave={handleVisualSave}
        onClose={() => { setVisualEditorOpen(false); setEditingVisualTemplate(undefined) }}
      />
    )}

    <div className="p-6 space-y-4">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{t.settings.templates.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {t.settings.templates.titleDesc}
          </p>
        </div>
        {/* 새 템플릿 버튼들 — 편집 중이 아닐 때만 표시 */}
        {editingId === null && (
          <div className="flex gap-2">
            {/* 마크다운 템플릿 */}
            <button
              type="button"
              onClick={() => { setEditingId('new'); setForm(EMPTY_FORM) }}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              {t.settings.templates.newMarkdown}
            </button>
            {/* 비주얼 그리드 템플릿 */}
            <button
              type="button"
              onClick={() => { setEditingVisualTemplate(undefined); setVisualEditorOpen(true) }}
              className="px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              {t.settings.templates.newVisual}
            </button>
          </div>
        )}
      </div>

      {/* ── 새 템플릿 작성 / 기존 편집 폼 ──────────── */}
      {editingId !== null && (
        <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700">
            {editingId === 'new' ? t.settings.templates.createTitle : t.settings.templates.editTitle}
          </p>

          {/* 이름 + 아이콘 */}
          <div className="flex gap-2">
            {/* 아이콘 입력 (이모지 한 글자) */}
            <input
              type="text"
              value={form.icon}
              onChange={e => setForm(f => ({ ...f, icon: e.target.value.slice(-2) || '📄' }))}
              className="w-12 text-center text-xl border border-gray-300 rounded-lg px-1 py-1.5 bg-white outline-none focus:border-blue-400"
              title={t.settings.templates.iconLabel}
              maxLength={2}
            />
            {/* 템플릿 이름 */}
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t.settings.templates.namePlaceholder}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
            />
          </div>

          {/* 설명 (선택) */}
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder={t.settings.templates.descPlaceholder}
            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
          />

          {/* 마크다운 내용 입력 — 핵심 영역 */}
          {/* Python으로 치면: self.content_textarea = QTextEdit() */}
          <div>
            <p className="text-xs text-gray-500 mb-1">
              {t.settings.templates.contentDesc} — <span className="font-mono text-gray-400"># 제목1 / ## 제목2 / - 항목 / - [ ] 할일 / --- 구분선</span>
            </p>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={`## 📅 날짜\n\n## 👥 참석자\n- \n\n## 📌 안건\n- \n\n## ✅ 결정사항\n- \n\n## 🎯 액션아이템\n- [ ] `}
              rows={12}
              className="w-full text-sm font-mono border border-gray-300 rounded-lg px-3 py-2 bg-white outline-none focus:border-blue-400 resize-y"
              spellCheck={false}
            />
          </div>

          {/* 저장 / 취소 버튼 */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t.settings.templates.cancelBtn}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? t.settings.templates.saving : t.settings.templates.saveBtn}
            </button>
          </div>
        </div>
      )}

      {/* ── 기존 템플릿 목록 ──────────────────────── */}
      {templates.length === 0 && editingId === null && (
        <div className="text-center py-10 text-gray-400 text-sm">
          <p className="text-2xl mb-2">📄</p>
          <p>{t.settings.templates.noTemplates}</p>
          <p className="text-xs mt-1">{t.settings.templates.noTemplatesHint}</p>
        </div>
      )}

      <div className="space-y-2">
        {templates.map(tmpl => (
          <div
            key={tmpl.id}
            className="border border-gray-200 rounded-xl bg-white overflow-hidden"
          >
            {/* 템플릿 행 */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0">{tmpl.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{tmpl.name}</p>
                  {tmpl.description && (
                    <p className="text-xs text-gray-400 truncate">{tmpl.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                {/* 그리드 템플릿 배지 */}
                {isGridTemplate(tmpl.content) && (
                  <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 rounded-md">
                    {t.settings.templates.gridBadge}
                  </span>
                )}
                {/* 비주얼 편집 버튼 (그리드 템플릿만) */}
                {isGridTemplate(tmpl.content) ? (
                  <button
                    type="button"
                    onClick={() => { setEditingVisualTemplate(tmpl); setVisualEditorOpen(true) }}
                    disabled={editingId !== null}
                    className="px-2.5 py-1 text-xs text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors disabled:opacity-30"
                  >
                    {t.settings.templates.gridEdit}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(tmpl)}
                    disabled={editingId !== null && editingId !== tmpl.id}
                    className="px-2.5 py-1 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-30"
                  >
                    {t.settings.templates.edit}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(tmpl.id, tmpl.name)}
                  className="px-2.5 py-1 text-xs text-red-500 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                >
                  {t.common.delete}
                </button>
              </div>
            </div>

            {/* 편집 폼 (인라인 확장) — 해당 템플릿 편집 시에만 표시 */}
            {editingId === tmpl.id && (
              <div className="border-t border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.icon}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value.slice(-2) || '📄' }))}
                    className="w-12 text-center text-xl border border-gray-300 rounded-lg px-1 py-1.5 bg-white outline-none focus:border-blue-400"
                    maxLength={2}
                  />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t.settings.templates.namePlaceholder}
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
                  />
                </div>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={t.settings.templates.descPlaceholder}
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
                />
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={10}
                  className="w-full text-sm font-mono border border-gray-300 rounded-lg px-3 py-2 bg-white outline-none focus:border-blue-400 resize-y"
                  spellCheck={false}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t.settings.templates.cancelBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? t.settings.templates.saving : t.settings.templates.saveBtn}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
    </>
  )
}
