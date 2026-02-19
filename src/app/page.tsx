// =============================================
// src/app/page.tsx
// 역할: 앱의 진입점 — 사이드바와 에디터를 화면에 배치
// Python으로 치면: if __name__ == "__main__": main()
// =============================================

'use client'

import { usePageStore } from '@/store/pageStore'
import Sidebar from '@/components/editor/Sidebar'
import PageEditor from '@/components/editor/PageEditor'

export default function Home() {

  // -----------------------------------------------
  // 현재 선택된 페이지 ID를 스토어에서 가져옴
  // -----------------------------------------------
  const { currentPageId, pages, setCurrentPage } = usePageStore()

  // -----------------------------------------------
  // 앱 첫 진입 시 자동으로 첫 번째 페이지 선택
  // Python으로 치면:
  //   if current_page is None:
  //       current_page = pages[0]
  // -----------------------------------------------
  if (!currentPageId && pages.length > 0) {
    setCurrentPage(pages[0].id)
  }

  return (
    // -----------------------------------------------
    // 전체 레이아웃 컨테이너
    // flex: 사이드바와 에디터를 가로로 나란히 배치
    // h-screen: 화면 전체 높이
    // -----------------------------------------------
    <div className="flex h-screen bg-white">

      {/* 왼쪽 사이드바 */}
      <Sidebar />

      {/* 오른쪽 에디터 영역 */}
      {/* flex-1: 사이드바 빼고 남은 공간 전부 차지 */}
      {/* overflow-y-auto: 내용이 길어지면 스크롤 */}
      <main className="flex-1 overflow-y-auto">
        {currentPageId ? (
          // 페이지가 선택되어 있으면 에디터 렌더링
          <PageEditor pageId={currentPageId} />
        ) : (
          // 선택된 페이지가 없으면 안내 문구 표시
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>왼쪽에서 페이지를 선택하세요</p>
          </div>
        )}
      </main>

    </div>
  )
}