// =============================================
// src/components/settings/tabs/TemplatesTab.tsx
// 역할: 설정 > 템플릿 탭 — 사용자 정의 템플릿 CRUD
// 옵시디언 Templater 플러그인처럼 마크다운으로 직접 입력
// Python으로 치면: class TemplatesTab(SettingsTab): def render(self): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { templateApi, Template } from '@/lib/api'
import { isGridTemplate } from '@/lib/templateGrid'
import TemplateEditorModal from '@/components/editor/TemplateEditorModal'
import { useLocale } from '@/locales'
import { useSettingsStore } from '@/store/settingsStore'

// ── 특수 블록 메타데이터 ────────────────────────────────────────────────
// 버튼 바 + 도움말 모달에서 공통으로 사용
// Python으로 치면: SPECIAL_BLOCKS = [{'syntax': ':::dayplanner', ...}, ...]
const SPECIAL_BLOCKS = [
  {
    syntax: ':::dayplanner',
    label: 'Day Planner',
    icon: '⏰',
    badge: '일간',
    desc: '시간대별 타임라인 블록. 이벤트 드래그, 루틴 자동 적용 지원.',
  },
  {
    syntax: ':::weeklyplanner',
    label: 'Weekly Planner',
    icon: '📅',
    badge: '주간',
    desc: '한 주의 날씨 + 요일별 태스크를 한눈에 볼 수 있는 주간 캘린더.',
  },
  {
    syntax: ':::routinematrix',
    label: 'Routine Matrix',
    icon: '🔄',
    badge: '주간',
    desc: 'Day Planner에서 설정한 루틴의 달성 현황을 주간 단위로 시각화.',
  },
  {
    syntax: ':::monthlycalendar',
    label: 'Monthly Calendar',
    icon: '🗓️',
    badge: '월간',
    desc: '월간 달력 그리드. 날짜 클릭 시 해당 일간 노트로 바로 이동.',
  },
  {
    syntax: ':::quarterlyplanner',
    label: 'Quarterly Planner',
    icon: '📊',
    badge: '분기',
    desc: '분기 OKR 플래너. Objective + Key Results 구조로 목표 관리.',
  },
  {
    syntax: ':::yearlyplanner',
    label: 'Yearly Planner',
    icon: '🌟',
    badge: '연간',
    desc: '연간 목표와 월별 하이라이트를 한 페이지에서 관리.',
  },
] as const

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

  // 주기 노트 기본 템플릿 설정 — Python으로 치면: self.periodic_settings = store.periodic_note_templates
  const periodicNoteTemplates  = useSettingsStore(s => s.periodicNoteTemplates)
  const setPeriodicNoteTemplate = useSettingsStore(s => s.setPeriodicNoteTemplate)

  // 도움말 모달 열림 여부 — Python으로 치면: self.help_open = False
  const [helpOpen, setHelpOpen] = useState(false)

  // textarea ref — 커서 위치에 특수 블록 삽입 시 사용
  // Python으로 치면: self.textarea_ref = None
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 현재 활성 textarea의 커서 위치에 텍스트 삽입
  // Python으로 치면: def insert_at_cursor(self, text): ... textarea.setSelectionRange(...)
  function insertAtCursor(syntax: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end   = el.selectionEnd   ?? el.value.length
    const insert = `${syntax}\n`
    const newVal = el.value.slice(0, start) + insert + el.value.slice(end)
    setForm(f => ({ ...f, content: newVal }))
    // 커서를 삽입 텍스트 끝으로 이동 (다음 프레임에서 실행)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + insert.length, start + insert.length)
    })
  }

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

  // ── 버튼 바 공통 렌더러 ──────────────────────────────────────────────
  // 새 템플릿 폼 + 인라인 편집 폼 양쪽에서 동일하게 사용
  // Python으로 치면: def render_block_toolbar(self): ...
  function BlockToolbar() {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className="text-xs text-gray-400 mr-0.5">{t.settings.templates.blockInsertLabel}:</span>
        {SPECIAL_BLOCKS.map(b => (
          <button
            key={b.syntax}
            type="button"
            onClick={() => insertAtCursor(b.syntax)}
            title={b.desc}
            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-600 rounded-md transition-colors font-mono"
          >
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </button>
        ))}
        {/* ? 도움말 버튼 */}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          title={t.settings.templates.blockHelpBtn}
          className="ml-auto w-5 h-5 flex items-center justify-center text-xs text-gray-400 hover:text-blue-500 border border-gray-300 hover:border-blue-400 rounded-full transition-colors"
        >
          ?
        </button>
      </div>
    )
  }

  return (
    <>
    {/* 특수 블록 도움말 모달 */}
    {/* Python으로 치면: if help_open: render(HelpModal) */}
    {helpOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => setHelpOpen(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* 모달 헤더 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{t.settings.templates.blockHelpTitle}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{t.settings.templates.blockHelpDesc}</p>
            </div>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4"
            >
              ✕
            </button>
          </div>
          {/* 블록 목록 */}
          <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {SPECIAL_BLOCKS.map(b => (
              <div key={b.syntax} className="flex gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors">
                {/* 아이콘 */}
                <div className="text-2xl shrink-0 w-8 text-center">{b.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 문법 */}
                    <code className="text-xs font-mono bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                      {b.syntax}
                    </code>
                    {/* 용도 배지 */}
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-md">
                      {b.badge}
                    </span>
                    {/* 이름 */}
                    <span className="text-xs font-medium text-gray-700">{b.label}</span>
                  </div>
                  {/* 설명 */}
                  <p className="text-xs text-gray-500 mt-1">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* 모달 푸터 */}
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="px-4 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              {t.settings.templates.blockHelpClose}
            </button>
          </div>
        </div>
      </div>
    )}

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
            <p className="text-xs text-gray-500 mb-1.5">
              {t.settings.templates.contentDesc} — <span className="font-mono text-gray-400"># 제목1 / ## 제목2 / - 항목 / - [ ] 할일 / --- 구분선</span>
            </p>
            {/* 특수 블록 삽입 버튼 바 */}
            <BlockToolbar />
            <textarea
              ref={textareaRef}
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
                {/* 비주얼 에디터 열린 중이거나 다른 항목 편집 중일 때 삭제 비활성 */}
                <button
                  type="button"
                  onClick={() => handleDelete(tmpl.id, tmpl.name)}
                  disabled={visualEditorOpen || (editingId !== null && editingId !== tmpl.id)}
                  className="px-2.5 py-1 text-xs text-red-500 bg-red-50 rounded-md hover:bg-red-100 transition-colors disabled:opacity-30"
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
                {/* 특수 블록 삽입 버튼 바 */}
                <BlockToolbar />
                <textarea
                  ref={textareaRef}
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

      {/* ── 주기 노트 기본 템플릿 섹션 ──────────────────── */}
      {/* Python으로 치면: render PeriodicNoteTemplateSection(templates, periodic_note_templates) */}
      <div className="border-t border-gray-100 pt-5 mt-2 space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-700">{t.settings.templates.periodicSection}</h4>
          <p className="text-xs text-gray-400 mt-0.5">{t.settings.templates.periodicDesc}</p>
        </div>

        {/* 일간 / 주간 / 월간 / 분기 / 연간 각 행 */}
        {(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const).map(kind => {
          // 각 kind에 맞는 레이블 — Python: label = {'daily':..., ...}[kind]
          const label = kind === 'daily'   ? t.settings.templates.periodicDaily
            : kind === 'weekly'            ? t.settings.templates.periodicWeekly
            : kind === 'monthly'           ? t.settings.templates.periodicMonthly
            : kind === 'quarterly'         ? t.settings.templates.periodicQuarterly
            : t.settings.templates.periodicYearly

          const currentId = periodicNoteTemplates[kind]

          return (
            <div key={kind} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
              {/* 템플릿 선택 셀렉트 — Python으로 치면: <select> tag */}
              <select
                value={currentId}
                onChange={e => setPeriodicNoteTemplate(kind, e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-blue-400 text-gray-700"
              >
                <option value="">{t.settings.templates.periodicNone}</option>
                {/* 마크다운 템플릿만 표시 (그리드 템플릿은 주기 노트에 적용 불가) */}
                {templates.filter(tmpl => !isGridTemplate(tmpl.content)).map(tmpl => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.icon} {tmpl.name}
                  </option>
                ))}
              </select>
              {/* 현재 기본값 뱃지 */}
              {currentId && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-md shrink-0">
                  {t.settings.templates.periodicActive}
                </span>
              )}
            </div>
          )
        })}
      </div>

    </div>
    </>
  )
}
