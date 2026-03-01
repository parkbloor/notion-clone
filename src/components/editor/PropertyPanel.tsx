// ==============================================
// src/components/editor/PropertyPanel.tsx
// 역할: 페이지 속성 패널 — 날짜/상태/선택/텍스트 4종
//   - 속성 목록 표시 및 인라인 편집
//   - "+ 속성 추가" 드롭다운 메뉴
// Python으로 치면: class PropertyPanel(QWidget): ...
// ==============================================

'use client'

import { useRef, useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { PageProperty, PropertyType, STATUS_OPTIONS } from '@/types/block'

interface PropertyPanelProps {
  pageId: string
}

// ── 속성 타입 목록 (추가 드롭다운용) ────────────
// Python으로 치면: PROPERTY_TYPES = [('date', '날짜', '📅'), ...]
const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
  { type: 'date',   label: '날짜',   icon: '📅' },
  { type: 'status', label: '상태',   icon: '🔵' },
  { type: 'select', label: '선택',   icon: '🏷️' },
  { type: 'text',   label: '텍스트', icon: '📝' },
]

// ── 상태 배지 색상 매핑 ──────────────────────────
// Python으로 치면: STATUS_COLOR = {'미시작': 'gray', '진행 중': 'blue', ...}
const STATUS_COLOR: Record<string, string> = {
  '미시작': 'bg-gray-100 text-gray-600',
  '진행 중': 'bg-blue-100 text-blue-700',
  '완료': 'bg-green-100 text-green-700',
  '보류': 'bg-yellow-100 text-yellow-700',
}

export default function PropertyPanel({ pageId }: PropertyPanelProps) {
  // ── 스토어 ────────────────────────────────────
  const pages = usePageStore(s => s.pages)
  const setPageProperty = usePageStore(s => s.setPageProperty)
  const removePageProperty = usePageStore(s => s.removePageProperty)

  const page = pages.find(p => p.id === pageId)
  const properties = page?.properties ?? []

  // ── 로컬 상태 ─────────────────────────────────
  // 현재 편집 중인 속성 id (null이면 편집 없음)
  const [editingId, setEditingId] = useState<string | null>(null)
  // "+ 속성 추가" 드롭다운 표시 여부
  const [showAddMenu, setShowAddMenu] = useState(false)
  // 속성 이름 편집 중인 id
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  // select 타입의 새 옵션 입력값
  const [newOption, setNewOption] = useState('')

  const addMenuRef = useRef<HTMLDivElement>(null)

  // ── 속성 추가 ────────────────────────────────
  // Python으로 치면: def add_property(self, type): self.properties.append(...)
  function handleAdd(type: PropertyType) {
    const labels: Record<PropertyType, string> = {
      date: '날짜', status: '상태', select: '선택', text: '텍스트'
    }
    const newProp: PageProperty = {
      id: crypto.randomUUID(),
      name: labels[type],
      type,
      value: type === 'status' ? '미시작' : '',
      options: type === 'select' ? [] : undefined,
    }
    setPageProperty(pageId, newProp)
    setShowAddMenu(false)
    setEditingId(newProp.id)
  }

  // ── 속성값 변경 ──────────────────────────────
  // Python으로 치면: def update_value(self, prop_id, value): prop.value = value
  function handleValueChange(prop: PageProperty, value: string) {
    setPageProperty(pageId, { ...prop, value })
  }

  // ── 속성명 변경 ──────────────────────────────
  // Python으로 치면: def rename_property(self, prop_id, name): prop.name = name
  function handleNameChange(prop: PageProperty, name: string) {
    setPageProperty(pageId, { ...prop, name })
  }

  // ── select 옵션 추가 ─────────────────────────
  // Python으로 치면: def add_option(self, prop_id, option): prop.options.append(option)
  function handleAddOption(prop: PageProperty) {
    const trimmed = newOption.trim()
    if (!trimmed) return
    const options = [...(prop.options ?? []), trimmed]
    setPageProperty(pageId, { ...prop, options })
    setNewOption('')
  }

  // ── select 옵션 삭제 ─────────────────────────
  // Python으로 치면: def remove_option(self, prop_id, option): prop.options.remove(option)
  function handleRemoveOption(prop: PageProperty, opt: string) {
    const options = (prop.options ?? []).filter(o => o !== opt)
    const value = prop.value === opt ? '' : prop.value
    setPageProperty(pageId, { ...prop, options, value })
  }

  if (!page) return null

  return (
    <div className="mt-1 mb-4 text-sm">
      {/* ── 속성 목록 ── */}
      {properties.map(prop => (
        <div
          key={prop.id}
          className="flex items-start gap-2 py-1.5 group border-b border-gray-100 last:border-0"
        >
          {/* 속성명 */}
          <div className="w-28 shrink-0 flex items-center gap-1">
            {/* 타입 아이콘 */}
            <span className="text-xs text-gray-400">
              {PROPERTY_TYPES.find(t => t.type === prop.type)?.icon}
            </span>
            {/* 속성명 편집 */}
            {editingNameId === prop.id ? (
              <input
                autoFocus
                className="text-xs text-gray-600 bg-transparent border-b border-blue-400 outline-none w-full"
                defaultValue={prop.name}
                onBlur={e => {
                  handleNameChange(prop, e.target.value || prop.name)
                  setEditingNameId(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    handleNameChange(prop, (e.target as HTMLInputElement).value || prop.name)
                    setEditingNameId(null)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-700 truncate text-left"
                onClick={() => setEditingNameId(prop.id)}
              >
                {prop.name}
              </button>
            )}
          </div>

          {/* 속성값 편집 영역 */}
          <div className="flex-1 min-w-0">
            {/* ── 날짜 타입 ── */}
            {prop.type === 'date' && (
              <input
                type="date"
                className="text-xs text-gray-700 bg-transparent border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400 cursor-pointer"
                value={prop.value}
                onChange={e => handleValueChange(prop, e.target.value)}
              />
            )}

            {/* ── 상태 타입 ── */}
            {prop.type === 'status' && (
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleValueChange(prop, opt)}
                    className={[
                      'text-xs px-2 py-0.5 rounded-full transition-all',
                      prop.value === opt
                        ? (STATUS_COLOR[opt] ?? 'bg-gray-100 text-gray-600') + ' font-medium ring-1 ring-offset-1 ring-current'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* ── 선택 타입 ── */}
            {prop.type === 'select' && (
              <div>
                {/* 옵션 태그 목록 */}
                <div className="flex flex-wrap gap-1 mb-1">
                  {(prop.options ?? []).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleValueChange(prop, prop.value === opt ? '' : opt)}
                      className={[
                        'text-xs px-2 py-0.5 rounded-full transition-all group/opt flex items-center gap-1',
                        prop.value === opt
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      ].join(' ')}
                    >
                      {opt}
                      {/* 옵션 삭제 × 버튼 (hover 시 표시) */}
                      <span
                        role="button"
                        aria-label={`${opt} 옵션 삭제`}
                        className="hidden group-hover/opt:inline-block text-gray-400 hover:text-red-500 ml-0.5 leading-none"
                        onClick={e => { e.stopPropagation(); handleRemoveOption(prop, opt) }}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                  {/* 옵션 추가 입력 */}
                  {editingId === prop.id && (
                    <input
                      autoFocus
                      placeholder="옵션 추가..."
                      className="text-xs border-b border-gray-300 outline-none bg-transparent px-1 w-20"
                      value={newOption}
                      onChange={e => setNewOption(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddOption(prop)
                        if (e.key === 'Escape') { setNewOption(''); setEditingId(null) }
                      }}
                      onBlur={() => { handleAddOption(prop); setEditingId(null) }}
                    />
                  )}
                  {editingId !== prop.id && (
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-blue-500 px-1"
                      onClick={() => setEditingId(prop.id)}
                    >
                      + 옵션
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── 텍스트 타입 ── */}
            {prop.type === 'text' && (
              <input
                type="text"
                placeholder="값 입력..."
                className="text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none w-full py-0.5"
                value={prop.value}
                onChange={e => handleValueChange(prop, e.target.value)}
              />
            )}
          </div>

          {/* 삭제 버튼 (hover 시 표시) */}
          <button
            type="button"
            aria-label="속성 삭제"
            className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs transition-opacity"
            onClick={() => removePageProperty(pageId, prop.id)}
          >
            ✕
          </button>
        </div>
      ))}

      {/* ── "+ 속성 추가" 버튼 + 드롭다운 ── */}
      <div className="relative mt-1.5" ref={addMenuRef}>
        <button
          type="button"
          onClick={() => setShowAddMenu(v => !v)}
          className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1 py-0.5 px-1 rounded hover:bg-gray-50 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>속성 추가</span>
        </button>

        {/* 드롭다운 메뉴 */}
        {showAddMenu && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
            {PROPERTY_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
                onClick={() => handleAdd(type)}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
