// =============================================
// src/app/page.tsx
// 역할: 앱의 진입점 — 3패널 레이아웃 (카테고리 | 페이지 목록 | 에디터)
// Python으로 치면: if __name__ == "__main__": main()
// =============================================

'use client'

import { useEffect } from 'react'
import { usePageStore } from '@/store/pageStore'
import CategorySidebar from '@/components/editor/CategorySidebar'
import PageList from '@/components/editor/PageList'
import PageEditor from '@/components/editor/PageEditor'

// dnd-kit: 카테고리 정렬 + 페이지→카테고리 드래그를 하나의 DndContext로 관리
// Python으로 치면: from dnd import DndContext, arrayMove
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

export default function Home() {

  // -----------------------------------------------
  // 스토어에서 필요한 상태와 액션 가져오기
  // -----------------------------------------------
  const {
    currentPageId,
    pages,
    categoryOrder,
    setCurrentPage,
    loadFromServer,
    movePageToCategory,
    reorderCategories,
    reorderPages,
  } = usePageStore()

  // -----------------------------------------------
  // 앱 첫 진입 시 FastAPI 서버에서 페이지+카테고리 목록 불러오기
  // Python으로 치면: asyncio.run(load_from_server())
  // -----------------------------------------------
  useEffect(() => {
    loadFromServer()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------
  // 서버 로드 후 currentPageId가 없으면 첫 번째 페이지 선택
  // Python으로 치면: if current_page is None: current_page = pages[0]
  // -----------------------------------------------
  if (!currentPageId && pages.length > 0) {
    setCurrentPage(pages[0].id)
  }

  // ── dnd-kit 드래그 센서 (8px 이상 움직여야 드래그 시작) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // -----------------------------------------------
  // 드래그 완료 이벤트 처리
  //
  // 세 가지 경우를 처리:
  // 1. 페이지 → 카테고리: 페이지를 카테고리로 이동
  // 2. 카테고리 → 카테고리: 카테고리 순서 변경
  // 3. 페이지 → 페이지: 메모 목록 내 순서 변경
  //
  // Python으로 치면:
  //   def on_drag_end(active, over):
  //       if active.type == 'page' and over.type == 'category':
  //           move_page(active.id, over.category_id)
  //       elif active.type == 'category' and over.type == 'category':
  //           reorder_categories(active.id, over.id)
  //       elif active.type == 'page' and over.type == 'page':
  //           reorder_pages(active.id, over.id)
  // -----------------------------------------------
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeType = active.data.current?.type as string | undefined
    const overType = over.data.current?.type as string | undefined

    if (activeType === 'page' && overType === 'category') {
      // 페이지를 카테고리(또는 전체보기=null)로 이동
      const targetCategoryId = over.data.current?.categoryId as string | null
      const pageId = active.data.current?.pageId as string
      if (pageId !== undefined) {
        movePageToCategory(pageId, targetCategoryId)
      }
    } else if (activeType === 'category' && overType === 'category' && active.id !== over.id) {
      // 카테고리 순서 변경
      const oldIndex = categoryOrder.indexOf(active.id as string)
      const newIndex = categoryOrder.indexOf(over.id as string)
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderCategories(arrayMove(categoryOrder, oldIndex, newIndex))
      }
    } else if (activeType === 'page' && overType === 'page' && active.id !== over.id) {
      // 메모 목록 내 순서 변경
      reorderPages(active.id as string, over.id as string)
    }
  }

  return (
    // -----------------------------------------------
    // 최외곽 DndContext: CategorySidebar와 PageList를 모두 감싸서
    // 페이지→카테고리 드래그와 카테고리 순서 변경을 하나의 컨텍스트로 관리
    // Python으로 치면: with DndContext(on_drag_end=handle_drag_end): render(...)
    // -----------------------------------------------
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {/* 전체 레이아웃: 3패널 가로 배치 */}
      <div className="flex h-screen bg-white overflow-hidden">

        {/* ── 1패널: 카테고리(폴더) 사이드바 ─────── */}
        <CategorySidebar />

        {/* ── 2패널: 페이지(메모) 목록 ────────────── */}
        <PageList />

        {/* ── 3패널: 에디터 ────────────────────────
            flex-1: 남은 공간 전부 차지
            overflow-y-auto: 내용이 길어지면 스크롤 */}
        <main className="flex-1 overflow-y-auto">
          {currentPageId ? (
            // 페이지가 선택되어 있으면 에디터 렌더링
            <PageEditor pageId={currentPageId} />
          ) : (
            // 선택된 페이지가 없으면 안내 문구
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>왼쪽에서 메모를 선택하세요</p>
            </div>
          )}
        </main>

      </div>
    </DndContext>
  )
}
