// =============================================
// src/store/pageStore.ts
// 역할: 페이지·카테고리의 전역 상태를 관리 + FastAPI 백엔드 동기화
// Python으로 치면: 전역 변수를 안전하게 읽고 쓰는 모듈
// =============================================

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import { Block, BlockType, Category, Page, PageProperty, createBlock, createPage } from '@/types/block'
import { api } from '@/lib/api'
import { parseTemplateContent } from '@/lib/templateParser'
import { useSettingsStore } from '@/store/settingsStore'
import type { PageStore } from '@/types/pageStore'
import { scheduleSave, saveNow, pageHistoryMap, getHistory, pushBlockHistory, parseBlocksFromJson } from '@/store/pageStoreHelpers'


// -----------------------------------------------
// 스토어 생성
// immer((set, get) => ...) : get()으로 현재 상태 접근 가능
// Python으로 치면: self.pages = ...; get = lambda: self
// -----------------------------------------------
export const usePageStore = create<PageStore>()(
  immer((set, get) => ({

    // ── 초기 상태 ──────────────────────────────
    // 빈 배열로 시작 — loadFromServer() 완료 전 에디터가 플레이스홀더 페이지를
    // 렌더링하지 않도록 함. 렌더 시 Tiptap onUpdate → scheduleSave → api.savePage()
    // 가 발동해 서버에 "첫 번째 페이지"가 영구 저장되는 버그 방지.
    // Python으로 치면: self.pages = []  (서버 로드 후 채워짐)
    pages: [],
    currentPageId: null,
    // 탭 시스템 — 열린 탭 ID 목록 (순서 유지, 중복 없음)
    // Python으로 치면: self.open_tabs: list[str] = []
    openTabs: [],
    categories: [],
    categoryMap: {},
    categoryOrder: [],
    categoryChildOrder: {},
    currentCategoryId: null,  // null = 전체보기
    trashedItems: [],
    activeTagFilter: null,
    currentVaultName: '',

    // Magazine Layout 초기 상태
    // Python으로 치면: self.layout_descriptors = {}
    layoutDescriptors: {},
    // Python으로 치면: self.magazine_mode_pages = set()
    magazineModePages: {},

    // 일괄 선택된 블록 ID 목록
    // Python으로 치면: self.selected_block_ids = []
    selectedBlockIds: [],

    // 구조 변경/undo/redo 발생 시 증가 → 버튼 활성화 상태 리렌더링용
    // Python으로 치면: self.history_version = 0
    historyVersion: 0,

    // 엔터로 새 블록 생성 시 포커스를 받아야 할 블록 ID
    // Editor 마운트 후 해당 블록만 자동 포커스 → 소비 즉시 null로 클리어
    // Python으로 치면: self.pending_focus_block_id = None
    pendingFocusBlockId: null as string | null,

    // 저장 상태 — 저장 버튼 UI 표시용
    // 'saved': 서버와 동기화됨 | 'saving': 저장 중 | 'unsaved': 미저장 변경사항 있음
    // Python으로 치면: self.save_status = 'saved'
    saveStatus: 'saved' as 'saved' | 'saving' | 'unsaved',

    // 최근 파일 목록 — localStorage에서 복원 (서버 사이드에선 빈 배열)
    // Python으로 치면: self.recent_page_ids = json.load(local_storage) or []
    recentPageIds: (() => {
      if (typeof window === 'undefined') return []
      try {
        return JSON.parse(localStorage.getItem('notion-clone-recent') ?? '[]') as string[]
      } catch { return [] }
    })(),


    // -----------------------------------------------
    // 볼트 전환 시 전체 상태 초기화
    // Python으로 치면: def reset_store(self): self.pages = []; self.categories = []; ...
    // -----------------------------------------------
    resetStore: () => {
      set((state) => {
        state.pages = []
        state.currentPageId = null
        state.openTabs = []
        state.categories = []
        state.categoryMap = {}
        state.categoryOrder = []
        state.categoryChildOrder = {}
        state.currentCategoryId = null
        state.trashedItems = []
        state.activeTagFilter = null
        state.currentVaultName = ''
        state.selectedBlockIds = []
        state.layoutDescriptors = {}
        state.magazineModePages = {}
      })
    },

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

        // 서버에 페이지가 없으면 (첫 실행 또는 빈 볼트) 새 페이지를 생성해 저장
        // pages[] 초기값이 []이므로 항상 createPage('새 페이지') 사용
        // Python으로 치면: if not pages: page = Page.create('새 페이지'); api.save(page)
        if (data.pages.length === 0) {
          const initialPage = createPage('새 페이지')
          await api.savePage(initialPage.id, initialPage)
          await api.setCurrentPage(initialPage.id)
          set((state) => {
            if (!state.pages.find(p => p.id === initialPage.id)) {
              state.pages = [initialPage]
            }
            state.currentPageId = initialPage.id
          })
          return
        }

        // 서버 데이터로 상태 교체
        set((state) => {
          state.pages = data.pages
          state.currentPageId = data.currentPageId ?? data.pages[0]?.id ?? null
          // 열린 탭 초기화: 서버 로드 시 현재 페이지만 포함
          // Python으로 치면: self.open_tabs = [current_page_id] if current_page_id else []
          if (state.currentPageId) {
            state.openTabs = [state.currentPageId]
          }
          state.categories = data.categories ?? []
          state.categoryMap = data.categoryMap ?? {}
          state.categoryOrder = data.categoryOrder ?? []
          state.categoryChildOrder = data.categoryChildOrder ?? {}
          // 현재 볼트 이름 저장 (사이드바 표시용)
          if (data.vault_name) state.currentVaultName = data.vault_name
        })

        // ── 주기적 노트 전용 카테고리 자동 생성 ──────────────────
        // periodicNotes 플러그인이 활성화된 경우에만 생성
        // 비활성 시 또는 사용자가 삭제한 경우 재생성하지 않음
        // Python으로 치면: if settings.plugins.periodic_notes: create_if_not_exists(...)
        const isPeriodicEnabled = useSettingsStore.getState().plugins.periodicNotes
        if (isPeriodicEnabled) {
          const periodicCatNames = ['📅 일간 노트', '📆 주간 노트', '🗓️ 월간 노트']
          for (const catName of periodicCatNames) {
            if (!get().categories.find(c => c.name === catName)) {
              try {
                const newCat = await api.createCategory(catName)
                set((state) => {
                  state.categories.push(newCat)
                  state.categoryOrder.push(newCat.id)
                })
              } catch {
                // 카테고리 생성 실패는 조용히 무시 (서버 오프라인 등)
              }
            }
          }
        }
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
        // 서버가 꺼져있으면 로컬에만 생성 — categoryId는 categoryMap에 보존
        // 이후 scheduleSave 호출 시 categoryId를 쿼리파라미터로 전달 → 서버 복구 시 올바른 폴더에 저장
        // Python으로 치면: page = Page.create(title); self.category_map[page.id] = category_id
        const newPage = createPage(title)
        set((state) => {
          state.pages.push(newPage)
          state.currentPageId = newPage.id
          if (categoryId) {
            state.categoryMap[newPage.id] = categoryId
          }
        })
        toast.warning('서버 연결 실패로 로컬에만 메모가 생성됐습니다.', { duration: 3000 })
      }
    },

    // 현재 페이지 전환 → 탭 목록에 추가 → 서버에 currentPageId 저장
    // Python으로 치면: def set_current_page(self, id): self.current_page_id = id; self.open_tabs.add(id)
    setCurrentPage: (id) => {
      set((state) => {
        state.currentPageId = id
        // 탭 목록에 없으면 끝에 추가 (중복 방지)
        if (!state.openTabs.includes(id)) {
          state.openTabs.push(id)
        }
      })
      api.setCurrentPage(id).catch(() => {})
    },

    // 탭 닫기 — 닫은 탭이 현재 활성 탭이면 이전 탭으로 전환
    // Python으로 치면: def close_tab(self, id): open_tabs.remove(id); switch_to_prev()
    closeTab: (id) => {
      set((state) => {
        const idx = state.openTabs.indexOf(id)
        state.openTabs = state.openTabs.filter(t => t !== id)
        // 닫은 탭이 현재 활성 탭이면 이전/다음 탭으로 전환
        if (state.currentPageId === id) {
          if (state.openTabs.length > 0) {
            // 이전 탭 (없으면 현재 위치의 탭)
            const nextIdx = Math.max(0, idx - 1)
            state.currentPageId = state.openTabs[nextIdx] ?? state.openTabs[0]
          } else {
            // 모든 탭이 닫히면 첫 번째 페이지를 새 탭으로 열기
            const fallbackId = state.pages[0]?.id ?? null
            state.currentPageId = fallbackId
            if (fallbackId) state.openTabs = [fallbackId]
          }
        }
      })
    },

    // 세션 복원용 탭 목록 일괄 설정
    // Python으로 치면: def set_open_tabs(self, ids): self.open_tabs = ids
    setOpenTabs: (ids) => {
      set((state) => { state.openTabs = ids })
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
        if (page) { page.title = title; page.updatedAt = new Date().toISOString() }
      })
      scheduleSave(pageId, get, set)
    },

    // 페이지 삭제 → 서버에서도 삭제
    deletePage: (pageId) => {
      set((state) => {
        state.pages = state.pages.filter(p => p.id !== pageId)
        // 탭 목록에서도 제거
        // Python으로 치면: open_tabs = [t for t in open_tabs if t != page_id]
        state.openTabs = state.openTabs.filter(id => id !== pageId)
        if (state.currentPageId === pageId) {
          // 이전 탭으로 전환하거나 남은 첫 페이지로 전환
          state.currentPageId = state.openTabs.length > 0
            ? state.openTabs[state.openTabs.length - 1]
            : state.pages.length > 0 ? state.pages[0].id : null
        }
        if (state.pages.length === 0) {
          const newPage = createPage('첫 번째 페이지')
          state.pages.push(newPage)
          state.currentPageId = newPage.id
          state.openTabs = [newPage.id]
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
        if (page) { page.icon = icon; page.updatedAt = new Date().toISOString() }
      })
      scheduleSave(pageId, get, set)
    },

    // 커버 이미지 변경/삭제
    updatePageCover: (pageId, cover) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) { page.cover = cover; page.updatedAt = new Date().toISOString() }
      })
      scheduleSave(pageId, get, set)
    },

    // 커버 이미지 Y 위치 변경 (0~100, 드래그 조정 완료 시 호출)
    // Python으로 치면: def update_cover_position(self, page_id, position): ...
    updatePageCoverPosition: (pageId, position) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) { page.coverPosition = position; page.updatedAt = new Date().toISOString() }
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
          page.updatedAt = new Date().toISOString()
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
          page.updatedAt = new Date().toISOString()
        }
      })
      scheduleSave(pageId, get, set)
    },

    // 태그 필터 설정 — 같은 태그를 다시 누르면 해제 (null)
    // Python으로 치면: def set_tag_filter(self, tag): self.active_tag_filter = None if tag == self.active_tag_filter else tag
    setTagFilter: (tag) => {
      set((state) => {
        state.activeTagFilter = state.activeTagFilter === tag ? null : tag
      })
    },


    // ── 페이지 속성 액션 ──────────────────────

    // 속성 추가 또는 수정 (id가 같으면 업데이트, 없으면 추가)
    // Python으로 치면: def set_property(self, page_id, property): ...
    setPageProperty: (pageId, property) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        if (!page.properties) page.properties = []
        const idx = page.properties.findIndex(p => p.id === property.id)
        if (idx !== -1) page.properties[idx] = property
        else page.properties.push(property)
        page.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },

    // 속성 삭제
    // Python으로 치면: def remove_property(self, page_id, property_id): ...
    removePageProperty: (pageId, propertyId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page && page.properties) {
          page.properties = page.properties.filter(p => p.id !== propertyId)
          page.updatedAt = new Date().toISOString()
        }
      })
      scheduleSave(pageId, get, set)
    },


    // ── 페이지 잠금 액션 ──────────────────────

    // 페이지 잠금 — isLocked=true + lockPin(SHA-256 해시) 저장
    // Python으로 치면: def lock_page(self, page_id, pin_hash): page.is_locked = True
    lockPage: (pageId, pinHash) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) {
          page.isLocked = true
          page.lockPin = pinHash
          page.updatedAt = new Date().toISOString()
        }
      })
      scheduleSave(pageId, get, set)
    },

    // 페이지 잠금 해제 — isLocked=false (lockPin은 유지, 재잠금 시 재사용)
    // Python으로 치면: def unlock_page(self, page_id): page.is_locked = False
    unlockPage: (pageId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (page) {
          page.isLocked = false
          page.updatedAt = new Date().toISOString()
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
          page.updatedAt = new Date().toISOString()
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })),
          starred: false, // 복사본은 즐겨찾기 해제
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        const index = state.pages.findIndex(p => p.id === pageId)
        state.pages.splice(index + 1, 0, duplicate)
        state.currentPageId = newId
        // 원본과 동일한 카테고리에 배치
        const catId = state.categoryMap[pageId]
        if (catId !== undefined) state.categoryMap[newId] = catId
      })
      scheduleSave(newId, get, set)
      // 카테고리가 있으면 서버의 folderMap에도 등록 (재시작 후 올바른 폴더에 위치)
      // Python으로 치면: if cat_id: await api.move_page_to_category(new_id, cat_id)
      const catId = get().categoryMap[pageId]
      if (catId) {
        api.movePageToCategory(newId, catId).catch(() => {})
      }
    },


    // 페이지 잠금 토글 → 저장
    // Python으로 치면: def toggle_page_lock(self, page_id): page.is_locked = not page.is_locked
    togglePageLock: (pageId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.isLocked = !page.isLocked
        page.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },

    // ── 캔버스 모드 액션 ──────────────────────────

    // 페이지의 캔버스 모드를 토글 → 디바운스 저장
    // Python으로 치면: def toggle_canvas_mode(self, page_id): page.canvas_mode = not page.canvas_mode
    toggleCanvasMode: (pageId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.canvasMode = !page.canvasMode
        page.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },

    // 캔버스 Y/X 좌표 기준으로 page.blocks 순서 재정렬
    // 캔버스 모드 → 일반 모드 전환 시 호출 → 캔버스 배치 순서가 문서 순서에 반영됨
    // 위→아래(canvasY), 같은 행은 좌→우(canvasX) 순
    // canvasY 없는 블록은 뒤로 (배치 안 된 블록은 문서 끝에 유지)
    // Python으로 치면: page.blocks.sort(key=lambda b: (b.canvas_y ?? inf, b.canvas_x ?? inf))
    sortBlocksByCanvas: (pageId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        page.blocks.sort((a, b) => {
          const ay = a.canvasY ?? Infinity
          const by = b.canvasY ?? Infinity
          if (ay !== by) return ay - by
          return (a.canvasX ?? Infinity) - (b.canvasX ?? Infinity)
        })
        page.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },

    // 특정 블록의 캔버스 위치/크기 업데이트 (드래그/리사이즈 완료 시 호출)
    // Python으로 치면: def update_block_canvas(self, page_id, block_id, canvas): ...
    updateBlockCanvas: (pageId, blockId, canvas) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const block = page.blocks.find(b => b.id === blockId)
        if (!block) return
        // 전달된 필드만 업데이트 (undefined인 필드는 건드리지 않음)
        // Python으로 치면: block.__dict__.update({k: v for k, v in canvas.items() if v is not None})
        if (canvas.x !== undefined) block.canvasX = canvas.x
        if (canvas.y !== undefined) block.canvasY = canvas.y
        if (canvas.w !== undefined) block.canvasW = canvas.w
        if (canvas.h !== undefined) block.canvasH = canvas.h
        block.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },


    // 가상 박스 추가
    // Python으로 치면: def add_canvas_box(self, page_id, box): page.canvas_boxes.append(box)
    addCanvasBox: (pageId, box) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        if (!page.canvasBoxes) page.canvasBoxes = []
        page.canvasBoxes.push(box)
      })
      scheduleSave(pageId, get, set)
    },

    // 가상 박스 위치/크기 업데이트
    // Python으로 치면: def update_canvas_box(self, page_id, box_id, **kwargs): box.update(kwargs)
    updateCanvasBox: (pageId, boxId, update) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page?.canvasBoxes) return
        const box = page.canvasBoxes.find(b => b.id === boxId)
        if (!box) return
        Object.assign(box, update)
      })
      scheduleSave(pageId, get, set)
    },

    // 가상 박스 삭제
    // Python으로 치면: def delete_canvas_box(self, page_id, box_id): page.canvas_boxes.remove(id)
    deleteCanvasBox: (pageId, boxId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page?.canvasBoxes) return
        page.canvasBoxes = page.canvasBoxes.filter(b => b.id !== boxId)
      })
      scheduleSave(pageId, get, set)
    },

    // 블록 배경색 변경 → 디바운스 저장
    // Python으로 치면: def update_block_background(self, page_id, block_id, color): ...
    updateBlockBackground: (pageId, blockId, color) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const block = page.blocks.find(b => b.id === blockId)
        if (!block) return
        // 빈 문자열이면 undefined로 저장 (투명)
        // Python으로 치면: block.background_color = color or None
        block.backgroundColor = color || undefined
        block.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },

    // ── 블록 액션 ──────────────────────────────

    addBlock: (pageId, afterBlockId) => {
      // 변경 전 스냅샷 저장 (undo용)
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      // 새 블록 ID를 미리 생성해서 pendingFocusBlockId에 저장
      // Python으로 치면: new_id = uuid4(); state.pending_focus_block_id = new_id
      const newBlock = createBlock('paragraph')
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        if (afterBlockId) {
          const index = page.blocks.findIndex(b => b.id === afterBlockId)
          if (index !== -1) { page.blocks.splice(index + 1, 0, newBlock); }
          else { page.blocks.push(newBlock) }
        } else {
          page.blocks.push(newBlock)
        }
        state.pendingFocusBlockId = newBlock.id  // Editor 마운트 시 자동 포커스 대상
        state.historyVersion++  // undo 버튼 활성화 트리거
      })
      scheduleSave(pageId, get, set)
    },

    // Editor 마운트 시 pendingFocusBlockId 소비 후 클리어
    // Python으로 치면: def clear_pending_focus(self): self.pending_focus_block_id = None
    clearPendingFocus: () => {
      set((state) => { state.pendingFocusBlockId = null })
    },

    // 타이핑마다 호출 → 반드시 디바운스
    // 최상위 blocks에서 먼저 탐색, 없으면 토글 children도 탐색 (토글 자식 블록 저장 지원)
    // Python으로 치면: def update_block(page_id, block_id, content): find_and_update(block_id)
    updateBlock: (pageId, blockId, content) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        // 최상위 블록에서 탐색
        const block = page.blocks.find(b => b.id === blockId)
        if (block) { block.content = content; block.updatedAt = new Date().toISOString(); return }
        // 토글 children에서 탐색 (토글 자식 블록인 경우)
        // Python으로 치면: for toggle in toggles: if block_id in toggle.children: update
        const now = new Date().toISOString()
        for (const toggle of page.blocks) {
          if (!toggle.children) continue
          const child = toggle.children.find(c => c.id === blockId)
          if (child) { child.content = content; child.updatedAt = now; return }
        }
      })
      scheduleSave(pageId, get, set)
    },

    // 이미지/비디오 업로드 완료 후 디바운스 없이 즉시 서버 저장
    // Python으로 치면: async def save_page_now(page_id): await api.save(page_id)
    savePageNow: (pageId) => saveNow(pageId, get, set),

    updateBlockType: (pageId, blockId, type) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const block = page.blocks.find(b => b.id === blockId)
        if (block) { block.type = type; block.updatedAt = new Date().toISOString() }
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

    // ── 블록 일괄 선택 액션 ──────────────────────────
    // 단일 블록 선택/해제 토글
    // Python으로 치면: def toggle_block_selection(self, block_id): ...
    toggleBlockSelection: (blockId) => {
      set((state) => {
        const idx = state.selectedBlockIds.indexOf(blockId)
        if (idx === -1) state.selectedBlockIds.push(blockId)
        else state.selectedBlockIds.splice(idx, 1)
      })
    },

    // Shift+클릭 — 페이지 블록 순서 기준 anchorId~targetId 범위 선택
    // Python으로 치면: def select_block_range(self, page_id, anchor_id, target_id): ...
    selectBlockRange: (pageId, anchorId, targetId) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const ids = page.blocks.map(b => b.id)
        const a = ids.indexOf(anchorId)
        const b = ids.indexOf(targetId)
        if (a === -1 || b === -1) return
        const [from, to] = a <= b ? [a, b] : [b, a]
        state.selectedBlockIds = ids.slice(from, to + 1)
      })
    },

    // 선택 전체 해제
    // Python으로 치면: def clear_block_selection(self): self.selected_block_ids = []
    clearBlockSelection: () => {
      set((state) => { state.selectedBlockIds = [] })
    },

    // 선택된 블록 일괄 삭제 — undo/redo 히스토리에 포함
    // Python으로 치면: def delete_selected_blocks(self, page_id): ...
    deleteSelectedBlocks: (pageId) => {
      const { selectedBlockIds } = get()
      if (selectedBlockIds.length === 0) return
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const toDelete = new Set(state.selectedBlockIds)
        page.blocks = page.blocks.filter(b => !toDelete.has(b.id))
        if (page.blocks.length === 0) page.blocks.push(createBlock('paragraph'))
        state.selectedBlockIds = []
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    // 선택된 블록 일괄 복제 — 각 블록 바로 뒤에 복사본 삽입 (undo 가능)
    // Python으로 치면: def duplicate_selected_blocks(self, page_id): ...
    duplicateSelectedBlocks: (pageId) => {
      const { selectedBlockIds } = get()
      if (selectedBlockIds.length === 0) return
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const toClone = new Set(state.selectedBlockIds)
        const newBlocks: string[] = []
        const now = new Date().toISOString()
        // 블록 순서를 유지하며 각 선택 블록 바로 뒤에 복제본 삽입
        page.blocks = page.blocks.flatMap(b => {
          if (!toClone.has(b.id)) return [b]
          const clone: Block = { ...b, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
          newBlocks.push(clone.id)
          return [b, clone]
        })
        state.selectedBlockIds = newBlocks
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    // ── 선택 블록들을 토글 자식으로 묶기 ──────────────────────────────────
    // 선택된 블록들을 페이지 순서대로 정렬 후 새 토글 블록의 children으로 이동
    // 원래 블록들은 페이지 상위 레벨에서 제거되고, 토글이 첫 번째 블록 위치에 삽입
    // Python으로 치면: def group_into_toggle(self, page_id): ...
    groupIntoToggle: (pageId) => {
      const { selectedBlockIds } = get()
      if (selectedBlockIds.length < 1) return
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const selectedSet = new Set(selectedBlockIds)
        // 페이지 순서를 유지하며 선택 블록 추출
        // Python으로 치면: children = [b for b in page.blocks if b.id in selected_set]
        const children = page.blocks.filter(b => selectedSet.has(b.id))
        if (children.length === 0) return
        // 첫 번째 선택 블록의 위치에 토글 삽입
        const firstIdx = page.blocks.findIndex(b => selectedSet.has(b.id))
        const now = new Date().toISOString()
        const toggleBlock: Block = {
          id: crypto.randomUUID(),
          type: 'toggle',
          // 헤더 빈 상태로 생성 — 사용자가 제목 입력
          content: JSON.stringify({ header: '', body: '' }),
          children,
          createdAt: now,
          updatedAt: now,
        }
        // 선택 블록 제거 후 토글 삽입
        // Python으로 치면: blocks = [toggle if b is first else b for b in blocks if b not in selected]
        const remaining = page.blocks.filter(b => !selectedSet.has(b.id))
        remaining.splice(firstIdx, 0, toggleBlock)
        page.blocks = remaining
        state.selectedBlockIds = []
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    // ── 토글 블록 해제 — 자식들을 상위 레벨로 꺼내기 ──────────────────────
    // 토글의 children을 토글 위치에 순서대로 펼쳐 넣고 토글 블록 삭제
    // Python으로 치면: def ungroup_toggle(self, page_id, toggle_id): ...
    ungroupToggle: (pageId, toggleId) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const idx = page.blocks.findIndex(b => b.id === toggleId)
        if (idx === -1) return
        const toggle = page.blocks[idx]
        const children = toggle.children ?? []
        // 토글 자리에 children을 펼쳐 넣기
        // Python으로 치면: blocks[idx:idx+1] = children
        page.blocks.splice(idx, 1, ...children)
        if (page.blocks.length === 0) page.blocks.push(createBlock('paragraph'))
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },

    // ── 토글 자식 블록 content 업데이트 ─────────────────────────────────────
    // Python으로 치면: def update_toggle_child(self, page_id, toggle_id, child_id, content): ...
    updateToggleChild: (pageId, toggleId, childId, content) => {
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const toggle = page.blocks.find(b => b.id === toggleId)
        if (!toggle?.children) return
        const child = toggle.children.find(c => c.id === childId)
        if (!child) return
        child.content = content
        child.updatedAt = new Date().toISOString()
      })
      scheduleSave(pageId, get, set)
    },

    // ── 토글 자식 블록 삭제 ───────────────────────────────────────────────
    // Python으로 치면: def delete_toggle_child(self, page_id, toggle_id, child_id): ...
    deleteToggleChild: (pageId, toggleId, childId) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        const toggle = page.blocks.find(b => b.id === toggleId)
        if (!toggle?.children) return
        toggle.children = toggle.children.filter(c => c.id !== childId)
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        page.blocks.splice(index + 1, 0, duplicate)
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },


    // -----------------------------------------------
    // 블록을 다른 페이지로 이동
    // 원본 페이지에서 제거 + 대상 페이지 마지막에 추가
    // Python으로 치면: def move_block_to_page(self, from_id, to_id, block_id): ...
    // -----------------------------------------------
    moveBlockToPage: (fromPageId, toPageId, blockId) => {
      // 두 페이지 모두 undo 스냅샷 저장
      const snapFrom = get().pages.find(p => p.id === fromPageId)?.blocks
      const snapTo = get().pages.find(p => p.id === toPageId)?.blocks
      if (snapFrom) pushBlockHistory(fromPageId, snapFrom)
      if (snapTo) pushBlockHistory(toPageId, snapTo)
      set((state) => {
        const fromPage = state.pages.find(p => p.id === fromPageId)
        const toPage = state.pages.find(p => p.id === toPageId)
        if (!fromPage || !toPage) return
        const idx = fromPage.blocks.findIndex(b => b.id === blockId)
        if (idx === -1) return
        // 원본 페이지에서 블록 제거
        const [block] = fromPage.blocks.splice(idx, 1)
        // 빈 페이지 보호: 블록이 0개가 되면 빈 단락 삽입
        if (fromPage.blocks.length === 0) fromPage.blocks.push(createBlock('paragraph'))
        // 대상 페이지 마지막에 추가 (updatedAt 갱신)
        block.updatedAt = new Date().toISOString()
        toPage.blocks.push(block)
        state.historyVersion++
      })
      scheduleSave(fromPageId, get, set)
      scheduleSave(toPageId, get, set)
    },

    // -----------------------------------------------
    // 블록을 다른 페이지로 복사
    // 원본 유지 + 대상 페이지 마지막에 복사본 추가
    // Python으로 치면: def copy_block_to_page(self, from_id, to_id, block_id): ...
    // -----------------------------------------------
    copyBlockToPage: (fromPageId, toPageId, blockId) => {
      // 대상 페이지만 undo 스냅샷 저장 (원본 변경 없음)
      const snapTo = get().pages.find(p => p.id === toPageId)?.blocks
      if (snapTo) pushBlockHistory(toPageId, snapTo)
      set((state) => {
        const fromPage = state.pages.find(p => p.id === fromPageId)
        const toPage = state.pages.find(p => p.id === toPageId)
        if (!fromPage || !toPage) return
        const block = fromPage.blocks.find(b => b.id === blockId)
        if (!block) return
        // 새 ID + 새 날짜로 복사본 생성
        const copy: Block = {
          ...block,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        toPage.blocks.push(copy)
        state.historyVersion++
      })
      scheduleSave(toPageId, get, set)
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
        page.updatedAt = new Date().toISOString()
        state.historyVersion++
      })
      scheduleSave(pageId, get, set)
    },


    // -----------------------------------------------
    // Block 배열을 직접 받아서 페이지 블록 전체를 교체
    // 그리드 템플릿 적용 시 사용
    // Python으로 치면: def set_page_blocks(self, page_id, blocks): page.blocks = blocks
    // -----------------------------------------------
    setPageBlocks: (pageId, blocks) => {
      const snapBlocks = get().pages.find(p => p.id === pageId)?.blocks
      if (snapBlocks) pushBlockHistory(pageId, snapBlocks)
      set((state) => {
        const page = state.pages.find(p => p.id === pageId)
        if (!page) return
        // immer draft: splice로 교체 (직접 대입 시 변경 추적 안 됨)
        // Python으로 치면: page.blocks[:] = blocks
        page.blocks.splice(0, page.blocks.length, ...blocks)
        page.updatedAt = new Date().toISOString()
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
    // parentId가 있으면 하위 폴더로 생성
    // Python으로 치면: async def add_category(self, name, parent_id=None): ...
    addCategory: async (name, parentId) => {
      try {
        const cat = await api.createCategory(name, parentId)
        set((state) => {
          state.categories.push(cat)
          if (!parentId) {
            // 최상위 카테고리 → categoryOrder에 추가
            state.categoryOrder.push(cat.id)
          } else {
            // 하위 카테고리 → 부모의 categoryChildOrder에 추가
            // Python으로 치면: child_order[parent_id].append(cat.id)
            if (!state.categoryChildOrder[parentId]) {
              state.categoryChildOrder[parentId] = []
            }
            state.categoryChildOrder[parentId].push(cat.id)
          }
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
    //                    하위 폴더 있으면 hasChildren: true 반환
    // Python으로 치면: async def delete_category(self, cat_id) -> dict
    deleteCategory: async (categoryId) => {
      try {
        const result = await api.deleteCategory(categoryId)
        // 삭제 성공 (페이지도 없고 하위 폴더도 없음)
        if (result.ok) {
          set((state) => {
            // 삭제할 카테고리의 parentId 파악 (childOrder 정리용)
            const cat = state.categories.find(c => c.id === categoryId)
            const parentId = cat?.parentId

            // categories 배열에서 제거
            state.categories = state.categories.filter(c => c.id !== categoryId)
            // 최상위 순서에서 제거
            state.categoryOrder = state.categoryOrder.filter(id => id !== categoryId)
            // 부모의 childOrder에서 제거
            if (parentId && state.categoryChildOrder[parentId]) {
              state.categoryChildOrder[parentId] = state.categoryChildOrder[parentId].filter(
                id => id !== categoryId
              )
              if (state.categoryChildOrder[parentId].length === 0) {
                delete state.categoryChildOrder[parentId]
              }
            }
            // 이 카테고리의 childOrder 키 제거
            delete state.categoryChildOrder[categoryId]
            // 삭제된 카테고리를 보고 있었으면 전체보기로 전환
            if (state.currentCategoryId === categoryId) {
              state.currentCategoryId = null
            }
          })
        }
        return {
          hasPages: result.hasPages ?? false,
          hasChildren: result.hasChildren,
          count: result.count,
        }
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

    // 최상위 카테고리 표시 순서 변경 → 서버에도 저장
    // Python으로 치면: def reorder_categories(self, new_order): ...
    reorderCategories: (newOrder) => {
      set((state) => { state.categoryOrder = newOrder })
      api.reorderCategories(newOrder).catch(() => {})
    },

    // 하위 카테고리 순서 변경 → 서버에도 저장
    // Python으로 치면: def reorder_child_categories(self, parent_id, new_order): ...
    reorderChildCategories: (parentId, newOrder) => {
      set((state) => { state.categoryChildOrder[parentId] = newOrder })
      api.reorderChildCategories(parentId, newOrder).catch(() => {})
    },

    // 폴더를 다른 부모 폴더로 이동 (newParentId=null이면 최상위로)
    // Python으로 치면: async def move_category_to_parent(self, cat_id, new_parent_id): ...
    moveCategoryToParent: async (categoryId, newParentId) => {
      // 낙관적 업데이트: 로컬 상태 먼저 변경
      set((state) => {
        const cat = state.categories.find(c => c.id === categoryId)
        if (!cat) return
        const oldParentId = cat.parentId ?? null

        // 기존 부모에서 제거
        if (oldParentId === null) {
          state.categoryOrder = state.categoryOrder.filter(id => id !== categoryId)
        } else {
          const siblings = state.categoryChildOrder[oldParentId] ?? []
          state.categoryChildOrder[oldParentId] = siblings.filter(id => id !== categoryId)
          if (state.categoryChildOrder[oldParentId].length === 0) {
            delete state.categoryChildOrder[oldParentId]
          }
        }

        // 새 부모에 추가 (맨 앞)
        if (newParentId === null) {
          state.categoryOrder.unshift(categoryId)
        } else {
          if (!state.categoryChildOrder[newParentId]) {
            state.categoryChildOrder[newParentId] = []
          }
          state.categoryChildOrder[newParentId].unshift(categoryId)
        }

        // 카테고리 parentId 업데이트
        cat.parentId = newParentId ?? undefined
      })

      try {
        await api.moveCategoryToParent(categoryId, newParentId)
      } catch {
        toast.warning('폴더 이동에 실패했습니다. 새로고침 시 되돌아갈 수 있습니다.')
      }
    },

    // 폴더 색상 변경 → 낙관적 업데이트 후 서버 저장
    // Python으로 치면: async def update_category_color(self, cat_id, color): ...
    updateCategoryColor: async (categoryId, color) => {
      // 낙관적 업데이트: 로컬 상태 먼저 변경
      set((state) => {
        const cat = state.categories.find(c => c.id === categoryId)
        if (cat) cat.color = color
      })
      try {
        await api.updateCategoryColor(categoryId, color)
      } catch {
        toast.warning('색상 변경에 실패했습니다.')
      }
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

    // ── 휴지통 액션 ──────────────────────────────

    // 휴지통 목록 로드
    loadTrash: async () => {
      try {
        const data = await api.getTrash()
        set({ trashedItems: data.items })
      } catch {
        toast.error('휴지통 로드에 실패했습니다.')
      }
    },

    // 항목 복원 → 서버에서 복원 후 로컬 상태 갱신
    restoreFromTrash: async (itemId) => {
      try {
        await api.restoreTrashItem(itemId)
        // 복원 후 전체 데이터 새로고침 (페이지/카테고리 목록 변경됨)
        await get().loadFromServer()
        await get().loadTrash()
      } catch {
        toast.error('복원에 실패했습니다.')
      }
    },

    // 영구 삭제
    permanentDelete: async (itemId) => {
      try {
        await api.permanentDeleteTrashItem(itemId)
        await get().loadTrash()
      } catch {
        toast.error('영구 삭제에 실패했습니다.')
      }
    },

    // 전체 비우기
    emptyTrash: async () => {
      try {
        await api.emptyTrash()
        set({ trashedItems: [] })
      } catch {
        toast.error('휴지통 비우기에 실패했습니다.')
      }
    },

    // ── Magazine Layout 액션 ──────────────────────

    // 매거진 모드 토글 — 원고 모드 ↔ 레이아웃 모드 전환
    // Python으로 치면: def toggle_magazine_mode(self, page_id): self.magazine_mode_pages ^= {page_id}
    toggleMagazineMode: (pageId) => {
      set((state) => {
        if (state.magazineModePages[pageId]) {
          delete state.magazineModePages[pageId]
        } else {
          state.magazineModePages[pageId] = true
        }
      })
    },

    // 레이아웃 디스크립터 저장 (AI 생성 결과 or 사용자 편집 완료 시)
    // Python으로 치면: def set_layout_descriptor(self, page_id, descriptor): ...
    setLayoutDescriptor: (pageId, descriptor) => {
      set((state) => {
        state.layoutDescriptors[pageId] = {
          ...descriptor,
          updatedAt: new Date().toISOString(),
        }
      })
    },

    // 특정 셀만 업데이트 (드래그로 이동 or 리사이즈 후)
    // Python으로 치면: def update_layout_cell(self, page_id, cell_id, update): ...
    updateLayoutCell: (pageId, cellId, update) => {
      set((state) => {
        const descriptor = state.layoutDescriptors[pageId]
        if (!descriptor) return
        const cellIdx = descriptor.cells.findIndex(c => c.id === cellId)
        if (cellIdx === -1) return
        descriptor.cells[cellIdx] = { ...descriptor.cells[cellIdx], ...update }
        descriptor.updatedAt = new Date().toISOString()
      })
    },

    // 레이아웃 테마 부분 업데이트
    // Python으로 치면: def update_layout_theme(self, page_id, theme_patch): ...
    updateLayoutTheme: (pageId, theme) => {
      set((state) => {
        const descriptor = state.layoutDescriptors[pageId]
        if (!descriptor) return
        descriptor.theme = { ...descriptor.theme, ...theme }
        descriptor.updatedAt = new Date().toISOString()
      })
    },

    // 레이아웃 초기화 — locked 셀은 유지, 나머지 제거
    // AI 재생성 요청 전에 호출
    // Python으로 치면: def clear_layout(self, page_id, keep_locked=True): ...
    clearLayout: (pageId, keepLocked = true) => {
      set((state) => {
        const descriptor = state.layoutDescriptors[pageId]
        if (!descriptor) return
        descriptor.cells = keepLocked
          ? descriptor.cells.filter(c => c.locked)
          : []
        descriptor.updatedAt = new Date().toISOString()
      })
    },

  }))
)


// -----------------------------------------------
// 편의 셀렉터 함수
// -----------------------------------------------
export const currentPage = (state: PageStore) =>
  state.pages.find(p => p.id === state.currentPageId) ?? null
