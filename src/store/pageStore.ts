// =============================================
// src/store/pageStore.ts
// 역할: 페이지와 블록의 전역 상태를 관리
// Python으로 치면: 전역 변수를 안전하게 읽고 쓰는 모듈
// 어디서든 import해서 현재 상태를 읽거나 수정 가능
// =============================================

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { Block, BlockType, Page, createBlock, createPage } from '@/types/block'

// -----------------------------------------------
// 스토어의 구조 타입 정의
// 상태(state)와 그 상태를 바꾸는 함수(action)를 함께 정의
// Python으로 치면:
//   class PageStore:
//       pages: list[Page]
//       currentPageId: str
//       def add_page(): ...
//       def update_block(): ...
// -----------------------------------------------
interface PageStore {

  // ── 상태 (State) ──────────────────────────────
  pages: Page[]                // 모든 페이지 목록
  currentPageId: string | null // 현재 보고 있는 페이지 ID

  // ── 페이지 관련 액션 ───────────────────────────

  // 새 페이지 추가
  addPage: (title?: string) => void

  // 페이지 전환 (사이드바에서 클릭할 때)
  setCurrentPage: (id: string) => void

  // 페이지 제목 수정
  updatePageTitle: (pageId: string, title: string) => void

  // ── 블록 관련 액션 ───────────────────────────

  // 특정 위치에 새 블록 추가
  addBlock: (pageId: string, afterBlockId?: string) => void

  // 블록 내용 수정 (타이핑할 때마다 호출)
  updateBlock: (pageId: string, blockId: string, content: string) => void

  // 블록 타입 변경 (paragraph → heading1 등)
  updateBlockType: (pageId: string, blockId: string, type: BlockType) => void

  // 블록 삭제
  deleteBlock: (pageId: string, blockId: string) => void

  // 블록 순서 변경 (드래그 앤 드롭할 때)
  moveBlock: (pageId: string, fromIndex: number, toIndex: number) => void

  // 특정 블록 앞에 새 블록 추가 (블록 메뉴 "위에 추가")
  addBlockBefore: (pageId: string, beforeBlockId: string) => void

  // 블록 복제 — 같은 내용/타입의 블록을 바로 아래에 삽입
  duplicateBlock: (pageId: string, blockId: string) => void

  // 페이지 삭제
  deletePage: (pageId: string) => void

  // 페이지 아이콘 변경
  updatePageIcon: (pageId: string, icon: string) => void

  // 커버 이미지 변경 (undefined 전달 시 삭제)
  updatePageCover: (pageId: string, cover: string | undefined) => void
}


// -----------------------------------------------
// 스토어 생성
// create()      : Zustand 스토어 생성 함수
// immer()       : 불변 상태를 편하게 수정할 수 있게 해주는 미들웨어
//                 Python으로 치면 deepcopy() 없이 객체를 직접 수정해도
//                 내부적으로 새 객체를 만들어주는 마법
// -----------------------------------------------
export const usePageStore = create<PageStore>()(
  immer((set) => ({

    // ── 초기 상태 ─────────────────────────────────
    pages: [createPage('첫 번째 페이지')],  // 앱 시작 시 기본 페이지 1개
    currentPageId: null,                    // 처음엔 선택된 페이지 없음


    // ── 페이지 액션 구현 ──────────────────────────

    // 새 페이지 추가
    // Python으로 치면: def add_page(title='제목 없음'): pages.append(Page(title))
    addPage: (title) => set((state) => {
      const newPage = createPage(title)
      state.pages.push(newPage)
      state.currentPageId = newPage.id   // 새 페이지로 자동 전환
    }),

    // 현재 페이지 전환
    setCurrentPage: (id) => set((state) => {
      state.currentPageId = id
    }),

    // 페이지 제목 수정
    updatePageTitle: (pageId, title) => set((state) => {
      // pages 배열에서 id가 일치하는 페이지를 찾아 제목 변경
      // Python으로 치면: next(p for p in pages if p.id == pageId).title = title
      const page = state.pages.find(p => p.id === pageId)
      if (page) {
        page.title = title
        page.updatedAt = new Date()
      }
    }),


    // ── 블록 액션 구현 ────────────────────────────

    // 특정 블록 다음에 새 블록 추가
    // afterBlockId가 없으면 맨 끝에 추가
    addBlock: (pageId, afterBlockId) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return

      const newBlock = createBlock('paragraph')

      if (afterBlockId) {
        // afterBlockId 블록의 위치를 찾아 그 다음에 삽입
        // Python으로 치면: index = blocks.index(after_block); blocks.insert(index+1, new_block)
        const index = page.blocks.findIndex(b => b.id === afterBlockId)
        if (index !== -1) {
          page.blocks.splice(index + 1, 0, newBlock)  // splice = 특정 위치에 삽입
        }
      } else {
        page.blocks.push(newBlock)  // 맨 끝에 추가
      }
    }),

    // 블록 내용 업데이트
    updateBlock: (pageId, blockId, content) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return

      const block = page.blocks.find(b => b.id === blockId)
      if (block) {
        block.content = content
        block.updatedAt = new Date()
      }
    }),

    // 블록 타입 변경
    updateBlockType: (pageId, blockId, type) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return

      const block = page.blocks.find(b => b.id === blockId)
      if (block) {
        block.type = type
        block.updatedAt = new Date()
      }
    }),

    // 블록 삭제
    deleteBlock: (pageId, blockId) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return

      // filter로 해당 블록만 제외한 새 배열 생성
      // Python으로 치면: blocks = [b for b in blocks if b.id != blockId]
      page.blocks = page.blocks.filter(b => b.id !== blockId)

      // 블록이 하나도 없으면 빈 블록 하나 자동 추가 (빈 페이지 방지)
      if (page.blocks.length === 0) {
        page.blocks.push(createBlock('paragraph'))
      }
    }),

    // 블록 순서 변경 (드래그 앤 드롭용)
    moveBlock: (pageId, fromIndex, toIndex) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return

      // fromIndex 위치의 블록을 꺼내서 toIndex 위치에 삽입
      const [removed] = page.blocks.splice(fromIndex, 1)  // 꺼내기
      page.blocks.splice(toIndex, 0, removed)              // 끼워넣기
    }),

    // 특정 블록 앞에 새 paragraph 블록 삽입
    // Python으로 치면: blocks.insert(blocks.index(before_block), new_block)
    addBlockBefore: (pageId, beforeBlockId) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return
      const index = page.blocks.findIndex(b => b.id === beforeBlockId)
      if (index === -1) return
      const newBlock = createBlock('paragraph')
      page.blocks.splice(index, 0, newBlock)  // index 앞에 삽입
    }),

    // 블록 복제 — 내용과 타입을 그대로 복사해 바로 아래에 삽입
    // Python으로 치면: blocks.insert(i+1, dataclasses.replace(block, id=uuid4()))
    duplicateBlock: (pageId, blockId) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (!page) return
      const index = page.blocks.findIndex(b => b.id === blockId)
      if (index === -1) return
      const original = page.blocks[index]
      // 스프레드로 복사 후 id·시각만 새것으로 교체
      const duplicate: Block = {
        ...original,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      page.blocks.splice(index + 1, 0, duplicate)
    }),

    // 페이지 삭제 — 삭제 후 첫 번째 페이지로 전환, 없으면 새 빈 페이지 생성
    // Python으로 치면: pages.remove(page); current = pages[0] or Page()
    deletePage: (pageId) => set((state) => {
      state.pages = state.pages.filter(p => p.id !== pageId)
      // 삭제된 페이지가 현재 페이지면 다른 페이지로 이동
      if (state.currentPageId === pageId) {
        state.currentPageId = state.pages.length > 0 ? state.pages[0].id : null
      }
      // 페이지가 하나도 없으면 빈 페이지 자동 생성
      if (state.pages.length === 0) {
        const newPage = createPage('첫 번째 페이지')
        state.pages.push(newPage)
        state.currentPageId = newPage.id
      }
    }),

    // 페이지 아이콘 변경
    // Python으로 치면: page.icon = icon
    updatePageIcon: (pageId, icon) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (page) {
        page.icon = icon
        page.updatedAt = new Date()
      }
    }),

    // 커버 이미지 변경 (undefined 전달 시 삭제)
    // Python으로 치면: page.cover = cover or None
    updatePageCover: (pageId, cover) => set((state) => {
      const page = state.pages.find(p => p.id === pageId)
      if (page) {
        page.cover = cover
        page.updatedAt = new Date()
      }
    }),

  }))
)


// -----------------------------------------------
// 편의 셀렉터 함수들
// 역할: 스토어에서 자주 쓰는 값을 꺼내는 함수
// Python으로 치면: @property 데코레이터
// 컴포넌트에서 usePageStore(currentPage) 형태로 사용
// -----------------------------------------------

// 현재 보고 있는 페이지 객체를 반환
export const currentPage = (state: PageStore) =>
  state.pages.find(p => p.id === state.currentPageId) ?? null