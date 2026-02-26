// =============================================
// src/store/pageStore.ts
// 역할: 페이지·카테고리의 전역 상태를 관리 + FastAPI 백엔드 동기화
// Python으로 치면: 전역 변수를 안전하게 읽고 쓰는 모듈
// =============================================

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import { Block, BlockType, Category, Page, createBlock, createPage } from '@/types/block'
import { api } from '@/lib/api'
import { parseTemplateContent } from '@/lib/templateParser'

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
      } catch {
        // 자동 저장 실패 — id 고정으로 중복 토스트 방지 (타이핑마다 실패해도 1개만 표시)
        // Python으로 치면: toast_map['save-error'] = show_once(msg)
        toast.error('자동 저장 실패. 서버 연결을 확인해 주세요.', {
          id: 'save-error',
          duration: 3000,
        })
      }
    }
  }, 500))
}


// -----------------------------------------------
// 블록 구조 히스토리 (undo/redo)
// 텍스트 수정(updateBlock)은 Tiptap 내장 History가 처리
// 블록 추가/삭제/이동/타입변경/복제만 이 히스토리가 담당
// Python으로 치면: page_history: dict[str, {"past": list[str], "future": list[str]}] = {}
// -----------------------------------------------
const pageHistoryMap = new Map<string, { past: string[]; future: string[] }>()

// 히스토리 엔트리 가져오기 (없으면 새로 생성)
// Python으로 치면: def get_history(page_id): return page_history.setdefault(page_id, {...})
function getHistory(pageId: string): { past: string[]; future: string[] } {
  if (!pageHistoryMap.has(pageId)) {
    pageHistoryMap.set(pageId, { past: [], future: [] })
  }
  return pageHistoryMap.get(pageId)!
}

// 현재 블록 배열 스냅샷을 past에 푸시 (새 액션 직전에 호출)
// Python으로 치면: def push_block_history(page_id, blocks): history["past"].append(json.dumps(blocks))
function pushBlockHistory(pageId: string, blocks: readonly Block[]): void {
  const h = getHistory(pageId)
  h.past.push(JSON.stringify(blocks))
  h.future = []  // 새 액션 발생 시 redo 히스토리 초기화
  if (h.past.length > 50) h.past.shift()  // 최대 50개 유지
}

// JSON 문자열에서 블록 배열 복원 (ISO 문자열 → Date 객체)
// Python으로 치면: def parse_blocks(json_str): return [restore_dates(b) for b in json.loads(json_str)]
function parseBlocksFromJson(json: string): Block[] {
  return (JSON.parse(json) as Block[]).map(b => ({
    ...b,
    createdAt: new Date(b.createdAt as unknown as string),
    updatedAt: new Date(b.updatedAt as unknown as string),
  }))
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

  // ── 최근 파일 ─────────────────────────────────
  // 최근 열어본 페이지 ID 목록 (최대 10개, localStorage 동기화)
  // Python으로 치면: recent_page_ids: list[str] = []
  recentPageIds: string[]
  // 페이지 열 때 최근 목록 맨 앞에 추가 (중복 제거, 최대 10개 유지)
  // Python으로 치면: def push_recent_page(self, page_id): ...
  pushRecentPage: (pageId: string) => void

  // ── 서버 연동 ─────────────────────────────────
  loadFromServer: () => Promise<void>

  // ── 페이지 액션 ───────────────────────────────
  addPage: (title?: string, categoryId?: string | null) => Promise<void>
  setCurrentPage: (id: string) => void
  updatePageTitle: (pageId: string, title: string) => void
  deletePage: (pageId: string) => void
  updatePageIcon: (pageId: string, icon: string) => void
  updatePageCover: (pageId: string, cover: string | undefined) => void
  // 커버 이미지 Y 위치 변경 (0~100, 드래그로 조정)
  // Python으로 치면: def update_cover_position(self, page_id, position): ...
  updatePageCoverPosition: (pageId: string, position: number) => void

  // ── 태그 액션 ─────────────────────────────────
  // Python으로 치면: def add_tag(self, page_id, tag): page.tags.append(tag)
  addTagToPage: (pageId: string, tag: string) => void
  // Python으로 치면: def remove_tag(self, page_id, tag): page.tags.remove(tag)
  removeTagFromPage: (pageId: string, tag: string) => void

  // ── 즐겨찾기 / 복제 액션 ─────────────────────
  // Python으로 치면: def toggle_star(self, page_id): page.starred = not page.starred
  togglePageStar: (pageId: string) => void
  // 페이지와 모든 블록을 복제, 원본 바로 아래에 삽입
  // Python으로 치면: def duplicate_page(self, page_id): pages.insert(idx+1, copy(page))
  duplicatePage: (pageId: string) => void

  // ── 블록 액션 ─────────────────────────────────
  // 마크다운 텍스트를 파싱해서 빈 페이지에 블록으로 삽입 (템플릿 적용)
  // Python으로 치면: def apply_template(self, page_id, markdown_content): ...
  applyTemplate: (pageId: string, markdownContent: string) => void
  addBlock: (pageId: string, afterBlockId?: string) => void
  updateBlock: (pageId: string, blockId: string, content: string) => void
  updateBlockType: (pageId: string, blockId: string, type: BlockType) => void
  deleteBlock: (pageId: string, blockId: string) => void
  moveBlock: (pageId: string, fromIndex: number, toIndex: number) => void
  addBlockBefore: (pageId: string, beforeBlockId: string) => void
  duplicateBlock: (pageId: string, blockId: string) => void

  // ── 블록 히스토리 ──────────────────────────────
  // 구조 변경(추가/삭제/이동/타입/복제) 또는 undo/redo 실행 시 증가 → UI 리렌더링 트리거
  // Python으로 치면: history_version: int = 0
  historyVersion: number
  undoPage: (pageId: string) => void
  redoPage: (pageId: string) => void
  // 순수 계산 (외부 Map 조회) → 컴포넌트는 historyVersion을 구독해서 리렌더링
  // Python으로 치면: def can_undo(self, page_id): return bool(history[page_id]["past"])
  canUndo: (pageId: string) => boolean
  canRedo: (pageId: string) => boolean

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

    // 구조 변경/undo/redo 발생 시 증가 → 버튼 활성화 상태 리렌더링용
    // Python으로 치면: self.history_version = 0
    historyVersion: 0,

    // 최근 파일 목록 — localStorage에서 복원 (서버 사이드에선 빈 배열)
    // Python으로 치면: self.recent_page_ids = json.load(local_storage) or []
    recentPageIds: (() => {
      if (typeof window === 'undefined') return []
      try {
        return JSON.parse(localStorage.getItem('notion-clone-recent') ?? '[]') as string[]
      } catch { return [] }
    })(),


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
        // 서버가 꺼져있으면 로컬 초기 상태 유지 + 사용자에게 알림
        toast.warning('서버에 연결할 수 없습니다. 로컬 상태로 동작합니다.', {
          id: 'server-offline',
          duration: 4000,
        })
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
        toast.warning('서버 연결 실패로 로컬에만 메모가 생성됐습니다.', { duration: 3000 })
      }
    },

    // 현재 페이지 전환 → 서버에 currentPageId 저장
    setCurrentPage: (id) => {
      set((state) => { state.currentPageId = id })
      api.setCurrentPage(id).catch(() => {})
    },

    // 최근 파일 목록 업데이트
    // 맨 앞에 추가, 중복 제거, 최대 10개 유지, localStorage 동기화
    // Python으로 치면:
    //   def push_recent_page(self, page_id):
    //       ids = [page_id] + [i for i in self.recent if i != page_id]
    //       self.recent = ids[:10]; local_storage.save(ids)
    pushRecentPage: (pageId) => {
      set((state) => {
        const filtered = state.recentPageIds.filter(id => id !== pageId)
        state.recentPageIds = [pageId, ...filtered].slice(0, 10)
        if (typeof window !== 'undefined') {
          localStorage.setItem('notion-clone-recent', JSON.stringify(state.recentPageIds))
        }
      })
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

    // 커버 이미지 Y 위치 변경 (0~100, 드래그 조정 완료 시 호출)
    // Python으로 치면: def update_cover_position(self, page_id, position): ...
    updatePageCoverPosition: (pageId, position) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) { page.coverPosition = position; page.updatedAt = new Date() }
      })
      scheduleSave(pageId, get, set)
    },


    // ── 태그 액션 ──────────────────────────────

    // 태그 추가 — 중복 태그는 무시, 빈 문자열 무시
    // Python으로 치면: def add_tag(self, page_id, tag): if tag and tag not in page.tags: page.tags.append(tag)
    addTagToPage: (pageId, tag) => {
      const trimmed = tag.trim()
      if (!trimmed) return
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        if (!page.tags) page.tags = []
        // 중복 방지
        if (!page.tags.includes(trimmed)) {
          page.tags.push(trimmed)
          page.updatedAt = new Date()
        }
      })
      scheduleSave(pageId, get, set)
    },

    // 태그 삭제
    // Python으로 치면: def remove_tag(self, page_id, tag): page.tags.remove(tag)
    removeTagFromPage: (pageId, tag) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page && page.tags) {
          page.tags = page.tags.filter(t => t !== tag)
          page.updatedAt = new Date()
        }
      })
      scheduleSave(pageId, get, set)
    },


    // ── 즐겨찾기 / 복제 액션 ──────────────────

    // 즐겨찾기 토글 — starred: true/false 반전
    // Python으로 치면: def toggle_star(self, page_id): page.starred = not page.starred
    togglePageStar: (pageId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) {
          page.starred = !page.starred
          page.updatedAt = new Date()
        }
      })
      scheduleSave(pageId, get, set)
    },

    // 페이지 복제 — 원본 바로 다음에 삽입, 현재 페이지로 전환
    // Python으로 치면: def duplicate_page(self, page_id): pages.insert(idx+1, copy(page))
    duplicatePage: (pageId) => {
      // 새 페이지 ID를 먼저 생성 (set 밖에서 scheduleSave에 전달하기 위해)
      const newId = crypto.randomUUID()
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const duplicate: Page = {
          ...page,
          id: newId,
          title: page.title + ' (복사본)',
          // 블록도 새 ID로 복사
          blocks: page.blocks.map(b => ({
            ...b,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
          starred: false, // 복사본은 즐겨찾기 해제
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const index = state.pages.findIndex(p => p.id === pageId)
        state.pages.splice(index + 1, 0, duplicate)
        state.currentPageId = newId
        // 원본과 동일한 카테고리에 배치
        const catId = state.categoryMap[pageId]
        if (catId !== undefined) state.categoryMap[newId] = catId
      })
      scheduleSave(newId, get, set)
    },


    // ── 블록 액션 ──────────────────────────────

    addBlock: (pageId, afterBlockId) => {
      // 변경 전 스냅샷 저장 (undo용)
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const newBlock = createBlock('paragraph')
        if (afterBlockId) {
          const index = page.blocks.findIndex(b => b.id === afterBlockId)
          if (index !== -1) { page.blocks.splice(index + 1, 0, newBlock); return }
        }
        page.blocks.push(newBlock)
        state.historyVersion++  // undo 버튼 활성화 트리거
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
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const block = page.blocks.find(b => b.id === blockId)
        if (block) { block.type = type; block.updatedAt = new Date() }
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    deleteBlock: (pageId, blockId) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.blocks = page.blocks.filter(b => b.id !== blockId)
        if (page.blocks.length === 0) page.blocks.push(createBlock('paragraph'))
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    moveBlock: (pageId, fromIndex, toIndex) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const [removed] = page.blocks.splice(fromIndex, 1)
        page.blocks.splice(toIndex, 0, removed)
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    addBlockBefore: (pageId, beforeBlockId) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const index = page.blocks.findIndex(b => b.id === beforeBlockId)
        if (index === -1) return
        page.blocks.splice(index, 0, createBlock('paragraph'))
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    duplicateBlock: (pageId, blockId) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
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
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },


    // -----------------------------------------------
    // 마크다운 텍스트를 파싱해서 빈 페이지에 블록으로 삽입
    // 빈 페이지(paragraph 1개 + 내용 없음) 조건에서만 교체
    // Python으로 치면: def apply_template(self, page_id, content): page.blocks = parse(content)
    // -----------------------------------------------
    applyTemplate: (pageId, markdownContent) => {
      const parsedBlocks = parseTemplateContent(markdownContent)
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        // immer draft 내에서 배열 직접 교체 시 splice 사용 (직접 대입 시 변경 추적 안 됨)
        // Python으로 치면: page.blocks[:] = parsed_blocks
        page.blocks.splice(0, page.blocks.length, ...parsedBlocks)
        page.updatedAt = new Date()
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },


    // ── 블록 히스토리 액션 ─────────────────────

    // 블록 구조 되돌리기 (undo)
    // past 스택에서 꺼내 복원, 현재 상태는 future에 저장
    // Python으로 치면: def undo_page(self, page_id): blocks = history["past"].pop(); restore(blocks)
    undoPage: (pageId) => {
      const h = getHistory(pageId)
      if (h.past.length === 0) return
      const currentBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (!currentBlocks) return
      // 현재 상태를 future에 보관 (redo용)
      h.future.push(JSON.stringify(currentBlocks))
      const prev = h.past.pop()!
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.blocks.splice(0, page.blocks.length, ...parseBlocksFromJson(prev))
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    // 블록 구조 다시 실행 (redo)
    // future 스택에서 꺼내 복원, 현재 상태는 past에 저장
    // Python으로 치면: def redo_page(self, page_id): blocks = history["future"].pop(); restore(blocks)
    redoPage: (pageId) => {
      const h = getHistory(pageId)
      if (h.future.length === 0) return
      const currentBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (!currentBlocks) return
      // 현재 상태를 past에 보관 (undo용)
      h.past.push(JSON.stringify(currentBlocks))
      const next = h.future.pop()!
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.blocks.splice(0, page.blocks.length, ...parseBlocksFromJson(next))
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    // undo 가능 여부 (외부 Map 조회 — historyVersion 구독으로 리렌더링 보장)
    // Python으로 치면: def can_undo(self, page_id): return bool(history[page_id]["past"])
    canUndo: (pageId) => getHistory(pageId).past.length > 0,

    // redo 가능 여부
    // Python으로 치면: def can_redo(self, page_id): return bool(history[page_id]["future"])
    canRedo: (pageId) => getHistory(pageId).future.length > 0,


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
        toast.error('카테고리 생성에 실패했습니다.')
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
        toast.error('카테고리 이름 변경에 실패했습니다.')
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
        toast.error('카테고리 삭제 중 오류가 발생했습니다.')
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
        // 서버 실패해도 로컬 categoryMap은 업데이트 + 사용자 알림
        set((state) => {
          if (categoryId) {
            state.categoryMap[pageId] = categoryId
          } else {
            delete state.categoryMap[pageId]
          }
        })
        toast.warning('서버 이동에 실패했습니다. 새로고침 시 되돌아갈 수 있습니다.')
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
