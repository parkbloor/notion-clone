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
// Python으로 치면: def origin_label(item, cats): ...
// -----------------------------------------------
function OriginLabel({ item, categories }: {
  item: TrashItem
  categories: { id: string; name: string }[]
}) {
  if (item.itemType === 'page') {
    const cat = categories.find(c => c.id === item.originalCategoryId)
    return (
      <span className="text-gray-400">
        {cat ? `📁 ${cat.name}` : '📋 미분류'}
      </span>
    )
  }
  const parent = categories.find(c => c.id === item.originalParentId)
  return (
    <span className="text-gray-400">
      {parent ? `📁 ${parent.name} 하위` : '최상위 폴더'}
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
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
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
      const label = item.itemType === 'page' ? item.title || '페이지' : item.name || '폴더'
      toast.success(`"${label}" 복원됐습니다.`)
    } catch {
      toast.error('복원에 실패했습니다.')
    }
  }

  async function handlePermanentDelete(item: TrashItem) {
    try {
      await permanentDelete(item.id)
      const label = item.itemType === 'page' ? item.title || '페이지' : item.name || '폴더'
      toast.success(`"${label}" 영구 삭제됐습니다.`)
    } catch {
      toast.error('삭제에 실패했습니다.')
    }
  }

  async function handleEmptyTrash() {
    try {
      await emptyTrash()
      setConfirmEmpty(false)
      toast.success('휴지통을 비웠습니다.')
    } catch {
      toast.error('전체 비우기에 실패했습니다.')
    }
  }

  // 그룹 ID 기준으로 묶어서 표시 — 폴더째 삭제된 항목들을 시각적으로 묶음
  // Python으로 치면: group_by(items, key=lambda x: x.trashGroupId or x.id)
  const groupedItems = (() => {
    const seen = new Set<string>()
    const result: { representative: TrashItem; members: TrashItem[] }[] = []
    for (const item of trashedItems) {
      const gid = item.trashGroupId ?? item.id
      if (seen.has(gid)) continue
      seen.add(gid)
      const members = item.trashGroupId
        ? trashedItems.filter(i => i.trashGroupId === item.trashGroupId)
        : [item]
      // 폴더를 대표로 올림
      const rep = members.find(i => i.itemType === 'category') ?? members[0]
      result.push({ representative: rep, members })
    }
    return result
  })()

  return (
    // 배경 오버레이
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        ref={panelRef}
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[480px] max-h-[70vh] flex flex-col"
      >
        {/* ── 헤더 ──────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗑️</span>
            <h2 className="text-sm font-semibold text-gray-800">휴지통</h2>
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
                  <span className="text-xs text-gray-500">정말 삭제할까요?</span>
                  <button
                    onClick={handleEmptyTrash}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >확인</button>
                  <button
                    onClick={() => setConfirmEmpty(false)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                  >취소</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmEmpty(true)}
                  className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                >
                  전체 비우기
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
              불러오는 중...
            </div>
          ) : groupedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-4xl mb-3">🗑️</span>
              <p className="text-sm font-medium">휴지통이 비어있습니다</p>
              <p className="text-xs mt-1">삭제한 메모와 폴더가 여기 표시됩니다</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 py-1">
              {groupedItems.map(({ representative: item, members }) => {
                const isGroup = members.length > 1
                const label = item.itemType === 'category'
                  ? (item.name ?? '폴더')
                  : (item.title || '제목 없음')
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
                          <OriginLabel item={item} categories={categories} />
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{formatDate(item.trashedAt)}</span>
                          {/* 그룹 배지 — 폴더째 삭제된 경우 */}
                          {isGroup && (
                            <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full text-[10px]">
                              +{members.length - 1}개 포함
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 액션 버튼 — hover 시 표시 */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleRestore(item)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="원래 위치로 복원"
                        >복원</button>
                        <button
                          onClick={() => handlePermanentDelete(item)}
                          className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="영구 삭제"
                        >삭제</button>
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
            항목에 마우스를 올리면 복원/삭제 버튼이 나타납니다
          </div>
        )}
      </div>
    </div>
  )
}
