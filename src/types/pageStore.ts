// =============================================
// src/types/pageStore.ts
// 역할: PageStore 인터페이스 정의 (pageStore.ts에서 분리)
// Python으로 치면: @dataclass class PageStore: ...
// =============================================

import { Block, BlockType, Category, Page, PageProperty, TrashItem, CanvasBox } from '@/types/block'

// -----------------------------------------------
// PageStore: Zustand 스토어 전체 타입
// 상태(state)와 액션(action)을 한 인터페이스로 정의
// Python으로 치면: class PageStore(TypedDict): ...
// -----------------------------------------------
export interface PageStore {

  // ── 페이지 상태 ──────────────────────────────
  pages: Page[]
  currentPageId: string | null
  // 탭 시스템 — 열린 탭 ID 목록 (순서 유지)
  // Python으로 치면: self.open_tabs: list[str] = []
  openTabs: string[]
  closeTab: (id: string) => void
  // 세션 복원용 — 저장된 탭 목록을 한 번에 덮어쓰기
  // Python으로 치면: def restore_open_tabs(self, ids): self.open_tabs = ids
  setOpenTabs: (ids: string[]) => void

  // ── 카테고리 상태 ─────────────────────────────
  categories: Category[]
  // pageId → categoryId 매핑 (없거나 null이면 미분류)
  // Python으로 치면: category_map: dict[str, str | None] = {}
  categoryMap: Record<string, string | null>
  // 최상위 카테고리 표시 순서 (ID 목록)
  categoryOrder: string[]
  // 하위 폴더 순서: { parentCatId: [childCatId, ...] }
  // Python으로 치면: category_child_order: dict[str, list[str]] = {}
  categoryChildOrder: Record<string, string[]>
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
  // 볼트 전환 시 전체 상태 초기화 — Python으로 치면: def reset_store(self): self.__init__()
  resetStore: () => void

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

  // ── 페이지 속성 액션 ──────────────────────────
  // Python으로 치면: def set_property(self, page_id, property): page.properties[id] = property
  setPageProperty: (pageId: string, property: PageProperty) => void
  // Python으로 치면: def remove_property(self, page_id, property_id): page.properties.remove(id)
  removePageProperty: (pageId: string, propertyId: string) => void

  // ── 페이지 잠금 액션 ──────────────────────────
  // Python으로 치면: def lock_page(self, page_id, pin_hash): page.is_locked = True
  lockPage: (pageId: string, pinHash: string) => void
  // Python으로 치면: def unlock_page(self, page_id): page.is_locked = False
  unlockPage: (pageId: string) => void

  // ── 즐겨찾기 / 복제 액션 ─────────────────────
  // Python으로 치면: def toggle_star(self, page_id): page.starred = not page.starred
  togglePageStar: (pageId: string) => void
  // 페이지와 모든 블록을 복제, 원본 바로 아래에 삽입
  // Python으로 치면: def duplicate_page(self, page_id): pages.insert(idx+1, copy(page))
  duplicatePage: (pageId: string) => void

  // 페이지 잠금 토글 (잠금 ↔ 해제) — 잠긴 페이지는 편집 불가
  // Python으로 치면: def toggle_page_lock(self, page_id): page.is_locked = not page.is_locked
  togglePageLock: (pageId: string) => void

  // ── 캔버스 모드 액션 ──────────────────────────
  // Python으로 치면: def toggle_canvas_mode(self, page_id): page.canvas_mode = not page.canvas_mode
  toggleCanvasMode: (pageId: string) => void
  // 캔버스 Y/X 좌표 기준으로 page.blocks 순서 재정렬
  // Python으로 치면: def sort_blocks_by_canvas(self, page_id): page.blocks.sort(key=lambda b: (b.canvas_y, b.canvas_x))
  sortBlocksByCanvas: (pageId: string) => void
  // 특정 블록의 캔버스 위치/크기 업데이트
  // Python으로 치면: def update_block_canvas(self, page_id, block_id, x, y, w, h): ...
  updateBlockCanvas: (pageId: string, blockId: string, canvas: { x?: number; y?: number; w?: number; h?: number }) => void
  // 가상 박스 추가/업데이트/삭제
  addCanvasBox: (pageId: string, box: CanvasBox) => void
  updateCanvasBox: (pageId: string, boxId: string, update: Partial<CanvasBox>) => void
  deleteCanvasBox: (pageId: string, boxId: string) => void
  // 블록 배경색 변경 (hex 문자열 또는 '' = 투명)
  // Python으로 치면: def update_block_background(self, page_id, block_id, color): ...
  updateBlockBackground: (pageId: string, blockId: string, color: string) => void

  // ── 블록 액션 ─────────────────────────────────
  // 마크다운 텍스트를 파싱해서 빈 페이지에 블록으로 삽입 (템플릿 적용)
  // Python으로 치면: def apply_template(self, page_id, markdown_content): ...
  applyTemplate: (pageId: string, markdownContent: string) => void
  // Block 배열을 직접 받아서 페이지 블록을 교체 (그리드 템플릿 적용용)
  // Python으로 치면: def set_page_blocks(self, page_id, blocks): page.blocks = blocks
  setPageBlocks: (pageId: string, blocks: Block[]) => void
  addBlock: (pageId: string, afterBlockId?: string) => void
  updateBlock: (pageId: string, blockId: string, content: string) => void
  // 이미지/비디오 업로드 직후 디바운스 없이 즉시 저장
  // Python으로 치면: def save_page_now(page_id): api.save(page_id)
  savePageNow: (pageId: string) => Promise<void>
  updateBlockType: (pageId: string, blockId: string, type: BlockType) => void
  deleteBlock: (pageId: string, blockId: string) => void
  moveBlock: (pageId: string, fromIndex: number, toIndex: number) => void
  addBlockBefore: (pageId: string, beforeBlockId: string) => void
  duplicateBlock: (pageId: string, blockId: string) => void
  // 블록을 다른 페이지로 이동 (원본 삭제 + 대상 마지막에 추가)
  // Python으로 치면: def move_block_to_page(self, from_id, to_id, block_id): ...
  moveBlockToPage: (fromPageId: string, toPageId: string, blockId: string) => void
  // 블록을 다른 페이지로 복사 (원본 유지 + 대상 마지막에 복사본 추가)
  // Python으로 치면: def copy_block_to_page(self, from_id, to_id, block_id): ...
  copyBlockToPage: (fromPageId: string, toPageId: string, blockId: string) => void

  // ── 블록 일괄 선택 ────────────────────────────
  // 선택된 블록 ID 목록 (순서 무관, 일괄 삭제/복제에 사용)
  // Python으로 치면: selected_block_ids: list[str] = []
  selectedBlockIds: string[]
  // 블록 하나 선택/해제 토글
  toggleBlockSelection: (blockId: string) => void
  // Shift+클릭 — anchorId~targetId 사이 블록 전체 선택
  selectBlockRange: (pageId: string, anchorId: string, targetId: string) => void
  // 전체 선택 해제
  clearBlockSelection: () => void
  // 선택된 블록 일괄 삭제 (undo 가능)
  deleteSelectedBlocks: (pageId: string) => void
  // 선택된 블록 일괄 복제 (undo 가능)
  duplicateSelectedBlocks: (pageId: string) => void

  // ── 블록 히스토리 ──────────────────────────────
  // 구조 변경(추가/삭제/이동/타입/복제) 또는 undo/redo 실행 시 증가 → UI 리렌더링 트리거
  // Python으로 치면: history_version: int = 0
  historyVersion: number

  // 저장 상태 — 저장 버튼 UI 표시용
  // Python으로 치면: save_status: Literal['saved', 'saving', 'unsaved'] = 'saved'
  saveStatus: 'saved' | 'saving' | 'unsaved'

  undoPage: (pageId: string) => void
  redoPage: (pageId: string) => void
  // 순수 계산 (외부 Map 조회) → 컴포넌트는 historyVersion을 구독해서 리렌더링
  // Python으로 치면: def can_undo(self, page_id): return bool(history[page_id]["past"])
  canUndo: (pageId: string) => boolean
  canRedo: (pageId: string) => boolean

  // ── 카테고리 액션 ─────────────────────────────
  setCurrentCategory: (categoryId: string | null) => void
  // parentId가 있으면 해당 카테고리의 하위 폴더로 생성
  // Python으로 치면: async def add_category(self, name, parent_id=None): ...
  addCategory: (name: string, parentId?: string | null) => Promise<void>
  renameCategory: (categoryId: string, name: string) => Promise<void>
  // 안에 메모가 있으면 hasPages: true 반환 (삭제 안 됨)
  // 하위 폴더가 있으면 hasChildren: true 반환 (삭제 안 됨)
  // Python으로 치면: async def delete_category(self, cat_id) -> dict
  deleteCategory: (categoryId: string) => Promise<{ hasPages: boolean; hasChildren?: boolean; count?: number }>
  // 페이지를 다른 카테고리로 이동 (null = 미분류)
  movePageToCategory: (pageId: string, categoryId: string | null) => Promise<void>
  reorderCategories: (newOrder: string[]) => void
  // 하위 카테고리 순서 변경 → 서버에도 저장
  // Python으로 치면: def reorder_child_categories(self, parent_id, new_order): ...
  reorderChildCategories: (parentId: string, newOrder: string[]) => void
  // 폴더를 다른 부모 폴더로 이동 (newParentId=null이면 최상위로)
  // Python으로 치면: async def move_category_to_parent(self, cat_id, new_parent_id): ...
  moveCategoryToParent: (categoryId: string, newParentId: string | null) => Promise<void>
  // 폴더 색상 변경 (null이면 기본 색상 초기화)
  // Python으로 치면: async def update_category_color(self, cat_id, color): ...
  updateCategoryColor: (categoryId: string, color: string | null) => Promise<void>
  // 메모 목록 내 드래그로 순서 변경
  // Python으로 치면: def reorder_pages(self, from_id, to_id): ...
  reorderPages: (fromId: string, toId: string) => void

  // ── 휴지통 상태/액션 ──────────────────────────
  // Python으로 치면: self.trash_items: list[TrashItem] = []
  trashedItems: TrashItem[]
  loadTrash: () => Promise<void>
  restoreFromTrash: (itemId: string) => Promise<void>
  permanentDelete: (itemId: string) => Promise<void>
  emptyTrash: () => Promise<void>

  // ── 태그 필터 ─────────────────────────────────
  // 사이드바 태그 브라우저에서 선택된 태그 (null = 필터 없음)
  // Python으로 치면: self.active_tag_filter: str | None = None
  activeTagFilter: string | null
  // Python으로 치면: def set_tag_filter(self, tag): self.active_tag_filter = tag
  setTagFilter: (tag: string | null) => void

  // ── 현재 볼트 이름 (폴더명) — 사이드바 표시용 ──
  // Python으로 치면: self.current_vault_name: str = ''
  currentVaultName: string
}
