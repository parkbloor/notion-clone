// =============================================
// src/components/editor/TrashPanel.tsx
// 역할: 휴지통 오버레이 패널
//   - 삭제된 페이지/폴더 목록 표시
//   - 개별 복원 / 영구 삭제 / 전체 비우기
// Python으로 치면: class TrashPanel(OverlayWidget): ...
// =============================================

'use client'

import { useEffect, useRef, useState } from 'react'
import { usePageStore } from '@/store/pageStore'
import { TrashItem } from '@/types/block'
import { toast } from 'sonner'
import { useLocale } from '@/locales'

// -----------------------------------------------
// 삭제 날짜 포맷 헬퍼
// Python으로 치면: def fmt_date(iso): return datetime.fromisoformat(iso).strftime(...)
// -----------------------------------------------
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diff < 60)  return '방금 전'
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  } catch { return iso }
}

// -----------------------------------------------
// 원래 위치 텍스트 헬퍼
// Python으로 치면: def origin_label(item, cats, labels): ...
// -----------------------------------------------
function OriginLabel({ item, categories, labels }: {
  item: TrashItem
  categories: { id: string; name: string }[]
  labels: { uncategorized: string; topLevel: string; subfolder: string }
}) {
  if (item.itemType === 'page') {
    const cat = categories.find(c => c.id === item.originalCategoryId)
    return (
      <span className="text-gray-400">
        {cat ? `📁 ${cat.name}` : `📋 ${labels.uncategorized}`}
      </span>
    )
  }
  const parent = categories.find(c => c.id === item.originalParentId)
  return (
    <span className="text-gray-400">
      {parent
        ? `📁 ${labels.subfolder.replace('{name}', parent.name)}`
        : labels.topLevel}
    </span>
  )
}

// -----------------------------------------------
// TrashPanel 컴포넌트
// -----------------------------------------------
interface TrashPanelProps {
  onClose: () => void
}

export default function TrashPanel({ onClose }: TrashPanelProps) {
  // 로케일 훅
  const t = useLocale()

  const {
    trashedItems, loadTrash, restoreFromTrash, permanentDelete, emptyTrash,
    categories,
  } = usePageStore()

  const panelRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  // 마운트 시 휴지통 목록 로드
  useEffect(() => {
    loadTrash().finally(() => setLoading(false))
  }, [loadTrash])

  // 패널 외부 클릭 → 닫기
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 약간 딜레이 후 등록 (오픈 클릭 이벤트와 겹침 방지)
    const timerId = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => { clearTimeout(timerId); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  // Escape 키 → 닫기
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleRestore(item: TrashItem) {
    try {
      await restoreFromTrash(item.id)
      const label = item.itemType === 'page' ? item.title || t.overlay.trash.page : item.name || t.overlay.trash.folder
      toast.success(t.overlay.trash.restoreSuccess.replace('{label}', label))
    } catch {
      toast.error(t.overlay.trash.restoreError)
    }
  }

  async function handlePermanentDelete(item: TrashItem) {
    try {
      await permanentDelete(item.id)
      const label = item.itemType === 'page' ? item.title || t.overlay.trash.page : item.name || t.overlay.trash.folder
      toast.success(t.overlay.trash.deleteSuccess.replace('{label}', label))
    } catch {
      toast.error(t.overlay.trash.deleteError)
    }
  }

  async function handleEmptyTrash() {
    try {
      await emptyTrash()
      setConfirmEmpty(false)
      toast.success(t.overlay.trash.emptySuccess)
    } catch {
      toast.error(t.overlay.trash.emptyError)
    }
  }

  // 새 방식: 각 항목이 이미 독립 엔트리 (_vault_trash/index.json 1항목 = 1표시줄)
  // 카테고리 삭제 시 하위 항목은 childCount로 배지 표시 (별도 엔트리 없음)
  // Python으로 치면: items = trash_entries (no grouping needed)
  const groupedItems = trashedItems.map(item => ({ representative: item, childCount: item.childCount ?? 0 }))

  return (
    // 배경 오버레이
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        ref={panelRef}
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-120 max-h-[70vh] flex flex-col"
      >
        {/* ── 헤더 ──────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗑️</span>
            <h2 className="text-sm font-semibold text-gray-800">{t.overlay.trash.title}</h2>
            {trashedItems.length > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {trashedItems.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 전체 비우기 버튼 */}
            {trashedItems.length > 0 && (
              confirmEmpty ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">{t.overlay.trash.confirmEmpty}</span>
                  <button
                    onClick={handleEmptyTrash}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >{t.common.confirm}</button>
                  <button
                    onClick={() => setConfirmEmpty(false)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                  >{t.common.cancel}</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmEmpty(true)}
                  className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                >
                  {t.overlay.trash.emptyAll}
                </button>
              )
            )}
            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm"
            >✕</button>
          </div>
        </div>

        {/* ── 본문 ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              {t.overlay.trash.loading}
            </div>
          ) : groupedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-4xl mb-3">🗑️</span>
              <p className="text-sm font-medium">{t.overlay.trash.empty}</p>
              <p className="text-xs mt-1">{t.overlay.trash.emptyHint}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 py-1">
              {groupedItems.map(({ representative: item, childCount }) => {
                const isGroup = childCount > 0
                const label = item.itemType === 'category'
                  ? (item.name ?? t.overlay.trash.folder)
                  : (item.title || t.common.untitled)
                const icon = item.itemType === 'category'
                  ? '📁'
                  : (item.icon || '📄')

                return (
                  <li key={item.id} className="px-5 py-3 hover:bg-gray-50 transition-colors group">
                    <div className="flex items-start gap-3">
                      {/* 아이콘 */}
                      <span className="text-base shrink-0 mt-0.5">{icon}</span>

                      {/* 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs">
                          <OriginLabel item={item} categories={categories} labels={t.overlay.trash} />
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{formatDate(item.trashedAt)}</span>
                          {/* 하위 항목 수 배지 — 폴더째 삭제된 경우 */}
                          {isGroup && (
                            <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full text-[10px]">
                              {t.overlay.trash.groupBadge.replace('{count}', String(childCount))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 액션 버튼 — hover 시 표시 */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleRestore(item)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title={t.overlay.trash.restoreTooltip}
                        >{t.overlay.trash.restore}</button>
                        <button
                          onClick={() => handlePermanentDelete(item)}
                          className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors"
                          title={t.overlay.trash.permanentDelete}
                        >{t.common.delete}</button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── 푸터 안내 ─────────────────────────── */}
        {trashedItems.length > 0 && (
          <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 text-center">
            {t.overlay.trash.footerHint}
          </div>
        )}
      </div>
    </div>
  )
}
