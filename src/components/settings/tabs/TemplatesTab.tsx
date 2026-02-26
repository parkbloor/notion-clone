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

// ── 새 템플릿 초기값 ──────────────────────────
// Python으로 치면: EMPTY_FORM = {'name': '', 'icon': '📄', ...}
const EMPTY_FORM: Omit<Template, 'id'> = {
  name: '',
  icon: '📄',
  description: '',
  content: '',
}

export default function TemplatesTab() {

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

  // -----------------------------------------------
  // 컴포넌트 마운트 시 템플릿 목록 불러오기
  // Python으로 치면: self.templates = await api.get_all()
  // -----------------------------------------------
  useEffect(() => {
    templateApi.getAll().then(setTemplates).catch(() => {
      toast.error('템플릿 목록을 불러오지 못했습니다.')
    })
  }, [])

  // -----------------------------------------------
  // 저장 (생성 또는 수정)
  // Python으로 치면: async def save(self): ...
  // -----------------------------------------------
  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('템플릿 이름을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      if (editingId === 'new') {
        // 새 템플릿 생성
        const created = await templateApi.create(form)
        setTemplates(prev => [...prev, created])
        toast.success('템플릿이 저장됐습니다.')
      } else if (editingId) {
        // 기존 템플릿 수정
        const updated = await templateApi.update(editingId, form)
        setTemplates(prev => prev.map(t => t.id === editingId ? updated : t))
        toast.success('템플릿이 수정됐습니다.')
      }
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch {
      toast.error('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // -----------------------------------------------
  // 삭제
  // Python으로 치면: async def delete(self, template_id): ...
  // -----------------------------------------------
  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 템플릿을 삭제할까요?`)) return
    try {
      await templateApi.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      // 삭제된 항목을 편집 중이었으면 폼 닫기
      if (editingId === id) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
      toast.success('템플릿이 삭제됐습니다.')
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.')
    }
  }

  // -----------------------------------------------
  // 편집 모드 시작 — 기존 값을 폼에 채움
  // Python으로 치면: def start_edit(self, template): self.form = template
  // -----------------------------------------------
  function startEdit(t: Template) {
    setEditingId(t.id)
    setForm({ name: t.name, icon: t.icon, description: t.description, content: t.content })
  }

  // -----------------------------------------------
  // 취소
  // Python으로 치면: def cancel_edit(self): self.editing_id = None; self.form = EMPTY
  // -----------------------------------------------
  function handleCancel() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  return (
    <div className="p-6 space-y-4">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">템플릿 관리</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            마크다운으로 템플릿을 작성하면 새 페이지에 자동으로 블록이 채워집니다
          </p>
        </div>
        {/* 새 템플릿 버튼 — 편집 중이 아닐 때만 표시 */}
        {editingId === null && (
          <button
            type="button"
            onClick={() => { setEditingId('new'); setForm(EMPTY_FORM) }}
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            + 새 템플릿
          </button>
        )}
      </div>

      {/* ── 새 템플릿 작성 / 기존 편집 폼 ──────────── */}
      {editingId !== null && (
        <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700">
            {editingId === 'new' ? '새 템플릿 작성' : '템플릿 수정'}
          </p>

          {/* 이름 + 아이콘 */}
          <div className="flex gap-2">
            {/* 아이콘 입력 (이모지 한 글자) */}
            <input
              type="text"
              value={form.icon}
              onChange={e => setForm(f => ({ ...f, icon: e.target.value.slice(-2) || '📄' }))}
              className="w-12 text-center text-xl border border-gray-300 rounded-lg px-1 py-1.5 bg-white outline-none focus:border-blue-400"
              title="아이콘 이모지"
              maxLength={2}
            />
            {/* 템플릿 이름 */}
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="템플릿 이름 (예: 회의록)"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
            />
          </div>

          {/* 설명 (선택) */}
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="설명 (선택)"
            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
          />

          {/* 마크다운 내용 입력 — 핵심 영역 */}
          {/* Python으로 치면: self.content_textarea = QTextEdit() */}
          <div>
            <p className="text-xs text-gray-500 mb-1">
              내용 (마크다운 형식) — <span className="font-mono text-gray-400"># 제목1 / ## 제목2 / - 항목 / - [ ] 할일 / --- 구분선</span>
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
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* ── 기존 템플릿 목록 ──────────────────────── */}
      {templates.length === 0 && editingId === null && (
        <div className="text-center py-10 text-gray-400 text-sm">
          <p className="text-2xl mb-2">📄</p>
          <p>아직 템플릿이 없습니다.</p>
          <p className="text-xs mt-1">위의 "새 템플릿" 버튼으로 추가하세요.</p>
        </div>
      )}

      <div className="space-y-2">
        {templates.map(t => (
          <div
            key={t.id}
            className="border border-gray-200 rounded-xl bg-white overflow-hidden"
          >
            {/* 템플릿 행 */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0">{t.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                  {t.description && (
                    <p className="text-xs text-gray-400 truncate">{t.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <button
                  type="button"
                  onClick={() => startEdit(t)}
                  disabled={editingId !== null && editingId !== t.id}
                  className="px-2.5 py-1 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-30"
                >
                  편집
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id, t.name)}
                  className="px-2.5 py-1 text-xs text-red-500 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>

            {/* 편집 폼 (인라인 확장) — 해당 템플릿 편집 시에만 표시 */}
            {editingId === t.id && (
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
                    placeholder="템플릿 이름"
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-blue-400"
                  />
                </div>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="설명 (선택)"
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
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  )
}
