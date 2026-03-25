// ==============================================
// src/components/editor/PropertyPanel.tsx
// 역할: 페이지 속성 패널 — 태그 + 날짜/상태/선택/텍스트/관계 5종
//   - 태그 섹션: 칩 표시 + 자동완성 입력 + 추가/삭제
//   - 속성 목록 표시 및 인라인 편집
//   - "+ 속성 추가" 드롭다운 메뉴
//   - 관계 속성: 다른 페이지를 연결 (쉼표 구분 다중 연결 지원)
// Python으로 치면: class PropertyPanel(QWidget): ...
// ==============================================

'use client'

import { useRef, useState, useMemo, useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'
import { PageProperty, PropertyType, STATUS_OPTIONS } from '@/types/block'

interface PropertyPanelProps {
  pageId: string
  // 관계 속성 클릭 시 해당 페이지로 이동하는 콜백
  // Python으로 치면: on_navigate: Callable[[str], None] = None
  onNavigate?: (targetPageId: string) => void
}

// ── 속성 타입 목록 (추가 드롭다운용) ────────────
// Python으로 치면: PROPERTY_TYPES = [('date', '날짜', '📅'), ...]
const PROPERTY_TYPES: { type: PropertyType; label: string; icon: string }[] = [
  { type: 'date',     label: '날짜',   icon: '📅' },
  { type: 'status',   label: '상태',   icon: '🔵' },
  { type: 'select',   label: '선택',   icon: '🏷️' },
  { type: 'text',     label: '텍스트', icon: '📝' },
  { type: 'relation', label: '관계',   icon: '🔗' },
]

// ── 상태 배지 색상 매핑 ──────────────────────────
// Python으로 치면: STATUS_COLOR = {'미시작': 'gray', '진행 중': 'blue', ...}
const STATUS_COLOR: Record<string, string> = {
  '미시작': 'bg-gray-100 text-gray-600',
  '진행 중': 'bg-blue-100 text-blue-700',
  '완료': 'bg-green-100 text-green-700',
  '보류': 'bg-yellow-100 text-yellow-700',
}

export default function PropertyPanel({ pageId, onNavigate }: PropertyPanelProps) {
  // ── 스토어 ────────────────────────────────────
  const pages = usePageStore(s => s.pages)
  const setCurrentPage = usePageStore(s => s.setCurrentPage)
  const setPageProperty = usePageStore(s => s.setPageProperty)
  const removePageProperty = usePageStore(s => s.removePageProperty)
  const addTagToPage = usePageStore(s => s.addTagToPage)
  const removeTagFromPage = usePageStore(s => s.removeTagFromPage)

  const page = pages.find(p => p.id === pageId)
  const properties = page?.properties ?? []
  // 현재 페이지의 태그 목록
  // Python으로 치면: tags = page.tags or []
  const tags = page?.tags ?? []

  // ── 전체 페이지에서 태그 집합 수집 (자동완성용) ──
  // Python으로 치면: all_tags = sorted({t for p in pages for t in p.tags})
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const p of pages) {
      for (const t of p.tags ?? []) set.add(t)
    }
    return [...set].sort()
  }, [pages])

  // ── 태그 입력 상태 ─────────────────────────────
  // Python으로 치면: self.tag_input = ''
  const [tagInput, setTagInput] = useState('')
  // 자동완성 드롭다운 표시 여부
  const [showSuggestions, setShowSuggestions] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // 입력값 기반 자동완성 후보 — 이미 추가된 태그는 제외
  // Python으로 치면: suggestions = [t for t in all_tags if input in t and t not in tags]
  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return allTags.filter(t => !tags.includes(t)).slice(0, 8)
    return allTags.filter(t => t.toLowerCase().includes(q) && !tags.includes(t)).slice(0, 8)
  }, [tagInput, allTags, tags])

  // 외부 클릭 시 자동완성 드롭다운 닫기
  // Python으로 치면: document.addEventListener('click', close_suggestions)
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (tagInputRef.current && !tagInputRef.current.closest('.tag-input-wrapper')?.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // ── 태그 추가 ─────────────────────────────────
  // Python으로 치면: def add_tag(tag): page.tags.append(tag); input = ''
  function handleAddTag(tag: string) {
    const trimmed = tag.trim().replace(/^#/, '') // # 접두사 자동 제거
    if (!trimmed) return
    addTagToPage(pageId, trimmed)
    setTagInput('')
    setShowSuggestions(false)
    tagInputRef.current?.focus()
  }

  // ── 태그 입력 키 이벤트 ───────────────────────
  // Python으로 치면: def on_key(e): if e.key == 'Enter': add_tag(input)
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTag(tagInput)
    } else if (e.key === 'Escape') {
      setTagInput('')
      setShowSuggestions(false)
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      // 입력이 비어있을 때 Backspace → 마지막 태그 삭제
      removeTagFromPage(pageId, tags[tags.length - 1])
    }
  }

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

  // ── 관계 속성 검색 상태 ─────────────────────
  // Python으로 치면: self.relation_search = {}  # { prop_id: '검색어' }
  const [relationSearch, setRelationSearch] = useState<Record<string, string>>({})
  // 관계 검색 드롭다운 표시 여부
  const [relationDropdown, setRelationDropdown] = useState<string | null>(null)
  const relationRef = useRef<HTMLDivElement>(null)

  // 관계 검색 드롭다운 외부 클릭 닫기
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (relationRef.current && !relationRef.current.contains(e.target as Node)) {
        setRelationDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // ── 속성 추가 ────────────────────────────────
  // Python으로 치면: def add_property(self, type): self.properties.append(...)
  function handleAdd(type: PropertyType) {
    const labels: Record<PropertyType, string> = {
      date: '날짜', status: '상태', select: '선택', text: '텍스트', relation: '관계',
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
    <div className="mt-1 mb-4 text-sm print-hide">

      {/* ── 태그 섹션 ─────────────────────────────────────────────
          태그 칩 목록 + 인라인 입력 + 자동완성 드롭다운
          Python으로 치면: render_tag_section(page.tags, all_tags) */}
      <div className="flex items-start gap-1.5 py-1.5 border-b border-gray-100 tag-input-wrapper relative">
        {/* 태그 아이콘 레이블 */}
        <div className="w-28 shrink-0 flex items-center gap-1 pt-0.5">
          <span className="text-xs text-gray-400">🏷️</span>
          <span className="text-xs text-gray-500">태그</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* 태그 칩 + 입력창 한 줄에 흘러넘치면 wrap */}
          <div className="flex flex-wrap gap-1 items-center">

            {/* 기존 태그 칩 — 클릭 X로 삭제 */}
            {/* Python으로 치면: for tag in tags: render_chip(tag) */}
            {tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5"
              >
                <span className="text-blue-400 text-[10px]">#</span>
                {tag}
                <button
                  type="button"
                  onClick={() => removeTagFromPage(pageId, tag)}
                  className="ml-0.5 text-blue-300 hover:text-blue-600 leading-none transition-colors"
                  title={`${tag} 태그 삭제`}
                >
                  ×
                </button>
              </span>
            ))}

            {/* 태그 입력창 */}
            {/* Python으로 치면: input.on_change = update_input; input.on_key = handle_key */}
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              placeholder={tags.length === 0 ? '태그 추가...' : ''}
              onChange={e => {
                setTagInput(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleTagKeyDown}
              className="text-xs text-gray-700 bg-transparent outline-none border-none placeholder-gray-300 min-w-16 flex-1"
            />
          </div>

          {/* 자동완성 드롭다운 */}
          {/* Python으로 치면: if show_suggestions and suggestions: render_dropdown(suggestions) */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-28 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-32 max-h-48 overflow-y-auto">
              {suggestions.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleAddTag(tag) }}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 text-left transition-colors"
                >
                  <span className="text-gray-400">#</span>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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

            {/* ── 관계 타입 ──
                value = 쉼표 구분 pageId 목록 (예: "id1,id2")
                Python으로 치면: linked_pages = [store.get(id) for id in value.split(',') if id]
            */}
            {prop.type === 'relation' && (() => {
              // 연결된 페이지 ID 목록 (빈 문자열 제거)
              const linkedIds = prop.value.split(',').map(s => s.trim()).filter(Boolean)
              // ID → 페이지 객체 매핑
              const linkedPages = linkedIds.map(id => pages.find(p => p.id === id)).filter(Boolean)
              // 검색어 기반 후보 페이지 (현재 페이지 제외, 이미 연결된 페이지 제외)
              const searchQuery = (relationSearch[prop.id] ?? '').toLowerCase()
              const candidates = pages
                .filter(p => p.id !== pageId && !linkedIds.includes(p.id))
                .filter(p => !searchQuery || p.title.toLowerCase().includes(searchQuery))
                .slice(0, 8)

              return (
                <div ref={relationDropdown === prop.id ? relationRef : null}>
                  {/* 연결된 페이지 칩 목록 */}
                  <div className="flex flex-wrap gap-1 mb-1">
                    {linkedPages.map(p => p && (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-0.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 max-w-32 truncate"
                      >
                        {/* 페이지 아이콘 + 제목 */}
                        <button
                          type="button"
                          title={`${p.title} 페이지로 이동`}
                          className="truncate hover:underline"
                          onClick={() => {
                            setCurrentPage(p.id)
                            onNavigate?.(p.id)
                          }}
                        >
                          {p.icon && <span className="mr-0.5">{p.icon}</span>}
                          {p.title || '(제목 없음)'}
                        </button>
                        {/* 연결 해제 버튼 */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = linkedIds.filter(id => id !== p.id).join(',')
                            handleValueChange(prop, next)
                          }}
                          className="ml-0.5 text-purple-300 hover:text-purple-600 leading-none"
                          title="연결 해제"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {/* 페이지 연결 버튼 */}
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-purple-500 px-1"
                      onClick={() => setRelationDropdown(prev => prev === prop.id ? null : prop.id)}
                    >
                      + 페이지 연결
                    </button>
                  </div>

                  {/* 페이지 검색 드롭다운 */}
                  {relationDropdown === prop.id && (
                    <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-30 w-56">
                      <input
                        autoFocus
                        placeholder="페이지 검색..."
                        className="w-full px-3 py-1.5 text-xs border-b border-gray-100 outline-none"
                        value={relationSearch[prop.id] ?? ''}
                        onChange={e => setRelationSearch(prev => ({ ...prev, [prop.id]: e.target.value }))}
                      />
                      <div className="max-h-40 overflow-y-auto">
                        {candidates.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</p>
                        ) : candidates.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-purple-700 text-left transition-colors"
                            onMouseDown={e => {
                              e.preventDefault()
                              const next = [...linkedIds, p.id].join(',')
                              handleValueChange(prop, next)
                              setRelationSearch(prev => ({ ...prev, [prop.id]: '' }))
                              setRelationDropdown(null)
                            }}
                          >
                            <span>{p.icon || '📄'}</span>
                            <span className="truncate">{p.title || '(제목 없음)'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
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
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-30">
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
