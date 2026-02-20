// =============================================
// src/store/pageStore.ts
// 역할: 페이지·카테고리의 전역 상태를 관리 + FastAPI 백엔드 동기화
// Python으로 치면: 전역 변수를 안전하게 읽고 쓰는 모듈
// =============================================

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { Block, BlockType, Category, Page, createBlock, createPage } from '@/types/block'
import { api } from '@/lib/api'

// -----------------------------------------------
// 페이지 저장 디바운서
// 타이핑할 때마다 저장하면 요청이 너무 많으므로
// 마지막 변경 후 500ms 뒤에 한 번만 저장
// Python으로 치면: save_timers: dict[str, threading.Timer] = {}
// -----------------------------------------------
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Python으로 치면: def schedule_save(page_id, get_state, set_state): ...
function scheduleSave(
  pageId: string,
  getState: () => PageStore,
  setState: (fn: (state: PageStore) => void) => void
) {
  // 기존 타이머 취소 (디바운스)
  const existing = saveTimers.get(pageId)
  if (existing) clearTimeout(existing)

  // 500ms 후 저장
  saveTimers.set(pageId, setTimeout(async () => {
    saveTimers.delete(pageId)
    const page = getState().pages.find(p => p.id === pageId)
    if (page) {
      try {
        const updatedPage = await api.savePage(pageId, page)
        // 제목 변경으로 폴더 rename이 발생한 경우:
        // 백엔드가 이미지 URL을 업데이트한 page를 반환 → store에 반영
        if (updatedPage) {
          setState((state) => {
            const idx = state.pages.findIndex(p => p.id === pageId)
            if (idx !== -1) {
              state.pages[idx] = updatedPage
            }
          })
        }
      } catch { /* 서버 꺼져도 무시 */ }
    }
  }, 500))
}


// -----------------------------------------------
// 스토어 타입 정의
// -----------------------------------------------
interface PageStore {

  // ── 페이지 상태 ──────────────────────────────
  pages: Page[]
  currentPageId: string | null

  // ── 카테고리 상태 ─────────────────────────────
  categories: Category[]
  // pageId → categoryId 매핑 (없거나 null이면 미분류)
  // Python으로 치면: category_map: dict[str, str | None] = {}
  categoryMap: Record<string, string | null>
  // 카테고리 표시 순서 (ID 목록)
  categoryOrder: string[]
  // 현재 선택된 카테고리 ID (null = 전체보기)
  currentCategoryId: string | null

  // ── 서버 연동 ─────────────────────────────────
  loadFromServer: () => Promise<void>

  // ── 페이지 액션 ───────────────────────────────
  addPage: (title?: string, categoryId?: string | null) => Promise<void>
  setCurrentPage: (id: string) => void
  updatePageTitle: (pageId: string, title: string) => void
  deletePage: (pageId: string) => void
  updatePageIcon: (pageId: string, icon: string) => void
  updatePageCover: (pageId: string, cover: string | undefined) => void

  // ── 블록 액션 ─────────────────────────────────
  addBlock: (pageId: string, afterBlockId?: string) => void
  updateBlock: (pageId: string, blockId: string, content: string) => void
  updateBlockType: (pageId: string, blockId: string, type: BlockType) => void
  deleteBlock: (pageId: string, blockId: string) => void
  moveBlock: (pageId: string, fromIndex: number, toIndex: number) => void
  addBlockBefore: (pageId: string, beforeBlockId: string) => void
  duplicateBlock: (pageId: string, blockId: string) => void

  // ── 카테고리 액션 ─────────────────────────────
  setCurrentCategory: (categoryId: string | null) => void
  addCategory: (name: string) => Promise<void>
  renameCategory: (categoryId: string, name: string) => Promise<void>
  // 안에 메모가 있으면 hasPages: true 반환 (삭제 안 됨)
  // Python으로 치면: async def delete_category(self, cat_id) -> dict
  deleteCategory: (categoryId: string) => Promise<{ hasPages: boolean; count?: number }>
  // 페이지를 다른 카테고리로 이동 (null = 미분류)
  movePageToCategory: (pageId: string, categoryId: string | null) => Promise<void>
  reorderCategories: (newOrder: string[]) => void
  // 메모 목록 내 드래그로 순서 변경
  // Python으로 치면: def reorder_pages(self, from_id, to_id): ...
  reorderPages: (fromId: string, toId: string) => void
}


// -----------------------------------------------
// 스토어 생성
// immer((set, get) => ...) : get()으로 현재 상태 접근 가능
// Python으로 치면: self.pages = ...; get = lambda: self
// -----------------------------------------------
export const usePageStore = create<PageStore>()(
  immer((set, get) => ({

    // ── 초기 상태 ──────────────────────────────
    pages: [createPage('첫 번째 페이지')],
    currentPageId: null,
    categories: [],
    categoryMap: {},
    categoryOrder: [],
    currentCategoryId: null,  // null = 전체보기


    // -----------------------------------------------
    // 서버에서 페이지+카테고리 목록 불러오기
    // Python으로 치면:
    //   async def load_from_server(self):
    //       data = await api.get_pages()
    //       self.pages = data['pages']
    //       self.categories = data['categories']
    // -----------------------------------------------
    loadFromServer: async () => {
      try {
        const data = await api.getPages()

        // 서버에 페이지가 없으면 (첫 실행) 초기 페이지를 서버에 저장
        if (data.pages.length === 0) {
          const initialPage = get().pages[0]
          await api.savePage(initialPage.id, initialPage)
          await api.setCurrentPage(initialPage.id)
          set((state) => { state.currentPageId = initialPage.id })
          return
        }

        // 서버 데이터로 상태 교체
        set((state) => {
          state.pages = data.pages
          state.currentPageId = data.currentPageId ?? data.pages[0]?.id ?? null
          state.categories = data.categories ?? []
          state.categoryMap = data.categoryMap ?? {}
          state.categoryOrder = data.categoryOrder ?? []
        })
      } catch {
        // 서버가 꺼져있으면 로컬 초기 상태 유지
        console.warn('📡 서버 연결 실패 — 로컬 상태로 동작합니다')
      }
    },


    // ── 페이지 액션 ────────────────────────────

    // 새 페이지 추가 → 서버에 POST (카테고리 포함)
    // 서버 응답으로 받은 page를 store에 저장 (폴더 위치를 서버가 결정)
    // Python으로 치면: async def add_page(self, title, category_id): ...
    addPage: async (title, categoryId) => {
      try {
        // 서버에 먼저 생성 (카테고리 폴더 위치를 서버가 결정)
        const serverPage = await api.createPage(
          title ?? '새 페이지',
          '📝',
          categoryId ?? null
        )
        set((state) => {
          state.pages.push(serverPage)
          state.currentPageId = serverPage.id
          // categoryId가 있으면 categoryMap에 기록
          if (categoryId) {
            state.categoryMap[serverPage.id] = categoryId
          }
        })
        await api.setCurrentPage(serverPage.id).catch(() => {})
      } catch {
        // 서버가 꺼져있으면 로컬에만 생성 (카테고리 없이)
        // Python으로 치면: page = Page.create(title); self.pages.append(page)
        const newPage = createPage(title)
        set((state) => {
          state.pages.push(newPage)
          state.currentPageId = newPage.id
        })
      }
    },

    // 현재 페이지 전환 → 서버에 currentPageId 저장
    setCurrentPage: (id) => {
      set((state) => { state.currentPageId = id })
      api.setCurrentPage(id).catch(() => {})
    },

    // 페이지 제목 수정 → 디바운스 저장
    updatePageTitle: (pageId, title) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) { page.title = title; page.updatedAt = new Date() }
      })
      scheduleSave(pageId, get, set)
    },

    // 페이지 삭제 → 서버에서도 삭제
    deletePage: (pageId) => {
      set((state) => {
        state.pages = state.pages.filter(p => p.id !== pageId)
        if (state.currentPageId === pageId) {
          state.currentPageId = state.pages.length > 0 ? state.pages[0].id : null
        }
        if (state.pages.length === 0) {
          const newPage = createPage('첫 번째 페이지')
          state.pages.push(newPage)
          state.currentPageId = newPage.id
        }
        // categoryMap에서도 제거
        delete state.categoryMap[pageId]
      })
      api.deletePage(pageId).catch(() => {})
    },

    // 페이지 아이콘 변경
    updatePageIcon: (pageId, icon) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) { page.icon = icon; page.updatedAt = new Date() }
      })
      scheduleSave(pageId, get, set)
    },

    // 커버 이미지 변경/삭제
    updatePageCover: (pageId, cover) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) { page.cover = cover; page.updatedAt = new Date() }
      })
      scheduleSave(pageId, get, set)
    },


    // ── 블록 액션 ──────────────────────────────

    addBlock: (pageId, afterBlockId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const newBlock = createBlock('paragraph')
        if (afterBlockId) {
          const index = page.blocks.findIndex(b => b.id === afterBlockId)
          if (index !== -1) { page.blocks.splice(index + 1, 0, newBlock); return }
        }
        page.blocks.push(newBlock)
      })
      scheduleSave(pageId, get, set)
    },

    // 타이핑마다 호출 → 반드시 디바운스
    updateBlock: (pageId, blockId, content) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const block = page.blocks.find(b => b.id === blockId)
        if (block) { block.content = content; block.updatedAt = new Date() }
      })
      scheduleSave(pageId, get, set)
    },

    updateBlockType: (pageId, blockId, type) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const block = page.blocks.find(b => b.id === blockId)
        if (block) { block.type = type; block.updatedAt = new Date() }
      })
      scheduleSave(pageId, get, set)
    },

    deleteBlock: (pageId, blockId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.blocks = page.blocks.filter(b => b.id !== blockId)
        if (page.blocks.length === 0) page.blocks.push(createBlock('paragraph'))
      })
      scheduleSave(pageId, get, set)
    },

    moveBlock: (pageId, fromIndex, toIndex) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const [removed] = page.blocks.splice(fromIndex, 1)
        page.blocks.splice(toIndex, 0, removed)
      })
      scheduleSave(pageId, get, set)
    },

    addBlockBefore: (pageId, beforeBlockId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const index = page.blocks.findIndex(b => b.id === beforeBlockId)
        if (index === -1) return
        page.blocks.splice(index, 0, createBlock('paragraph'))
      })
      scheduleSave(pageId, get, set)
    },

    duplicateBlock: (pageId, blockId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const index = page.blocks.findIndex(b => b.id === blockId)
        if (index === -1) return
        const original = page.blocks[index]
        const duplicate: Block = {
          ...original,
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        page.blocks.splice(index + 1, 0, duplicate)
      })
      scheduleSave(pageId, get, set)
    },


    // ── 카테고리 액션 ──────────────────────────

    // 현재 보고 있는 카테고리 변경 (null = 전체보기)
    setCurrentCategory: (categoryId) => {
      set((state) => { state.currentCategoryId = categoryId })
    },

    // 새 카테고리 생성 → 서버에 POST → vault에 폴더 생성
    // Python으로 치면: async def add_category(self, name): ...
    addCategory: async (name) => {
      try {
        const cat = await api.createCategory(name)
        set((state) => {
          state.categories.push(cat)
          state.categoryOrder.push(cat.id)
        })
      } catch {
        console.error('카테고리 생성 실패')
      }
    },

    // 카테고리 이름 변경 → 서버에서 폴더 rename + URL 업데이트
    // Python으로 치면: async def rename_category(self, cat_id, name): ...
    renameCategory: async (categoryId, name) => {
      try {
        const result = await api.renameCategory(categoryId, name)
        set((state) => {
          const cat = state.categories.find(c => c.id === categoryId)
          if (cat) {
            cat.name = result.category.name
            cat.folderName = result.category.folderName
          }
        })
      } catch {
        console.error('카테고리 이름 변경 실패')
      }
    },

    // 카테고리 삭제 → 안에 메모 있으면 hasPages: true 반환
    // Python으로 치면: async def delete_category(self, cat_id) -> dict
    deleteCategory: async (categoryId) => {
      try {
        const result = await api.deleteCategory(categoryId)
        if (!result.hasPages) {
          set((state) => {
            state.categories = state.categories.filter(c => c.id !== categoryId)
            state.categoryOrder = state.categoryOrder.filter(id => id !== categoryId)
            // 삭제된 카테고리를 보고 있었으면 전체보기로 전환
            if (state.currentCategoryId === categoryId) {
              state.currentCategoryId = null
            }
          })
        }
        return { hasPages: result.hasPages, count: result.count }
      } catch {
        return { hasPages: false }
      }
    },

    // 페이지를 다른 카테고리로 이동
    // Python으로 치면: async def move_page(self, page_id, category_id): ...
    movePageToCategory: async (pageId, categoryId) => {
      try {
        const result = await api.movePageToCategory(pageId, categoryId)
        set((state) => {
          if (categoryId) {
            state.categoryMap[pageId] = categoryId
          } else {
            delete state.categoryMap[pageId]
          }
          // 이미지 URL이 바뀐 경우 pages 업데이트
          if (result.page) {
            const idx = state.pages.findIndex(p => p.id === pageId)
            if (idx !== -1) state.pages[idx] = result.page!
          }
        })
      } catch {
        // 서버 실패해도 로컬 categoryMap은 업데이트
        set((state) => {
          if (categoryId) {
            state.categoryMap[pageId] = categoryId
          } else {
            delete state.categoryMap[pageId]
          }
        })
      }
    },

    // 카테고리 표시 순서 변경 → 서버에도 저장
    // Python으로 치면: def reorder_categories(self, new_order): ...
    reorderCategories: (newOrder) => {
      set((state) => { state.categoryOrder = newOrder })
      api.reorderCategories(newOrder).catch(() => {})
    },

    // 메모 목록 내 드래그로 순서 변경 → 서버에도 저장
    // fromId 위치의 페이지를 toId 위치로 이동
    // Python으로 치면: def reorder_pages(self, from_id, to_id): ...
    reorderPages: (fromId, toId) => {
      set((state) => {
        const fromIndex = state.pages.findIndex(p => p.id === fromId)
        const toIndex = state.pages.findIndex(p => p.id === toId)
        if (fromIndex === -1 || toIndex === -1) return
        // splice로 배열 내 이동 (immer가 불변성 처리)
        const [removed] = state.pages.splice(fromIndex, 1)
        state.pages.splice(toIndex, 0, removed)
      })
      // set 완료 후 get()으로 새 순서 읽어서 서버에 저장
      const newOrder = get().pages.map(p => p.id)
      api.reorderPages(newOrder).catch(() => {})
    },

  }))
)


// -----------------------------------------------
// 편의 셀렉터 함수
// -----------------------------------------------
export const currentPage = (state: PageStore) =>
  state.pages.find(p => p.id === state.currentPageId) ?? null
