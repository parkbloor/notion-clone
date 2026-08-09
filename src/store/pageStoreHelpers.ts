// =============================================
// src/store/pageStoreHelpers.ts
// 역할: pageStore의 저장 디바운서 + 히스토리 유틸
// pageStore.ts에서 분리 — 독립적으로 테스트 가능
// Python으로 치면: page_store_helpers.py
// =============================================

import { toast } from 'sonner'
import { Block } from '@/types/block'
import { api } from '@/lib/api'
import { runSerializedTask } from '@/lib/serializedTaskQueue'
import type { PageStore } from '@/types/pageStore'

// -----------------------------------------------
// 페이지 저장 디바운서 — 마지막 변경 후 500ms 뒤에 한 번만 저장
// Python으로 치면: save_timers: dict[str, threading.Timer] = {}
// -----------------------------------------------
export const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const conflictedPageIds = new Set<string>()
type StoreSetter = (fn: (state: PageStore) => void) => void

export function clearAllPageSaveConflicts(): void {
  conflictedPageIds.clear()
}

async function keepLocalConflictVersion(
  pageId: string,
  getState: () => PageStore,
  setState: StoreSetter,
): Promise<void> {
  const toastId = `save-conflict-${pageId}`
  try {
    const serverPage = await api.getPage(pageId)
    setState((state) => {
      const local = state.pages.find(page => page.id === pageId)
      if (local) local.revision = serverPage.revision
    })
    conflictedPageIds.delete(pageId)
    const saved = await saveNow(pageId, getState, setState)
    if (!saved) throw new Error('conflict save failed')
    toast.dismiss(toastId)
    toast.success('현재 편집 내용으로 저장했습니다.')
  } catch {
    conflictedPageIds.add(pageId)
    toast.error('충돌 복구에 실패했습니다. 다른 창을 닫고 다시 시도해 주세요.', { id: toastId, duration: Infinity })
  }
}

async function loadServerConflictVersion(pageId: string, setState: StoreSetter): Promise<void> {
  const toastId = `save-conflict-${pageId}`
  try {
    const serverPage = await api.getPage(pageId)
    setState((state) => {
      const index = state.pages.findIndex(page => page.id === pageId)
      if (index !== -1) state.pages[index] = serverPage
      state.saveStatus = 'saved'
    })
    conflictedPageIds.delete(pageId)
    toast.dismiss(toastId)
    toast.success('서버의 최신 내용을 불러왔습니다.')
  } catch {
    toast.error('최신 내용을 불러오지 못했습니다.', { id: toastId, duration: Infinity })
  }
}

function showSaveConflict(
  pageId: string,
  getState: () => PageStore,
  setState: StoreSetter,
): void {
  const toastId = `save-conflict-${pageId}`
  toast.error('다른 창의 저장과 충돌했습니다.', {
    id: toastId,
    duration: Infinity,
    description: '자동 저장을 멈췄습니다. 남길 내용을 선택해 주세요.',
    action: {
      label: '현재 내용 저장',
      onClick: () => {
        void keepLocalConflictVersion(pageId, getState, setState)
      },
    },
    cancel: {
      label: '최신본 불러오기',
      onClick: () => {
        void loadServerConflictVersion(pageId, setState)
      },
    },
  })
}

// Python으로 치면: def schedule_save(page_id, get_state, set_state): ...
export function scheduleSave(
  pageId: string,
  getState: () => PageStore,
  setState: (fn: (state: PageStore) => void) => void
) {
  // 기존 타이머 취소 (디바운스)
  const existing = saveTimers.get(pageId)
  if (existing) clearTimeout(existing)

  // 사용자가 어느 버전을 남길지 결정할 때까지 같은 stale revision의 반복 저장을 막는다.
  if (conflictedPageIds.has(pageId)) {
    saveTimers.delete(pageId)
    setState((state) => { state.saveStatus = 'unsaved' })
    return
  }

  // 변경 발생 → 미저장 상태로 전환
  // Python으로 치면: self.save_status = 'unsaved'
  setState((state) => { state.saveStatus = 'unsaved' })

  // 500ms 후 저장
  saveTimers.set(pageId, setTimeout(() => {
    void runSerializedTask(pageId, async () => {
    saveTimers.delete(pageId)
    if (conflictedPageIds.has(pageId)) return
    setState((state) => { state.saveStatus = 'saving' })
    const state0 = getState()
    const page = state0.pages.find(p => p.id === pageId)
    // 신규 페이지(로컬 폴백으로 생성된 경우) categoryId 전달 → 서버가 카테고리 폴더에 배치
    // Python으로 치면: cat_id = state.category_map.get(page_id)
    const categoryId = state0.categoryMap[pageId] ?? null
    if (page) {
      // 저장 요청에 포함한 content를 보관한다. 제목 변경 시 서버가 폴더명에
      // 맞춰 이미지 URL을 교정해 반환하므로, 요청 뒤 실제로 수정된 블록만
      // 로컬 content를 보존하고 나머지는 서버 교정본을 적용해야 한다.
      const sentBlockContents = new Map(page.blocks.map(block => [block.id, block.content]))
      try {
        const updatedPage = await api.savePage(pageId, page, categoryId)
        // 백엔드가 이미지 URL 등을 업데이트한 page를 반환 → store에 반영
        if (updatedPage) {
          setState((state) => {
            const idx = state.pages.findIndex(p => p.id === pageId)
            if (idx !== -1) {
              const local = state.pages[idx]
              // 서버 응답 기반, 로컬 전용 필드 보존 (properties, isLocked, canvasMode 등)
              // Python으로 치면: merged = {**server_page, **{k: local[k] for k in local_only}}
              const mergedBlocks = (updatedPage.blocks ?? []).map(serverBlock => {
                const localBlock = local.blocks.find(b => b.id === serverBlock.id)
                if (!localBlock) return serverBlock
                return {
                  ...serverBlock,
                  // 요청 뒤에 바뀐 블록만 로컬 content를 보존한다. 그대로라면
                  // 제목 변경에 따라 서버가 교정한 이미지 URL을 적용한다.
                  content: localBlock.content === sentBlockContents.get(serverBlock.id)
                    ? serverBlock.content
                    : localBlock.content,
                  backgroundColor: localBlock.backgroundColor,
                  canvasX: localBlock.canvasX,
                  canvasY: localBlock.canvasY,
                  canvasW: localBlock.canvasW,
                  canvasH: localBlock.canvasH,
                  children: localBlock.children,
                }
              })
              // local.blocks 순서 기준으로 인터리브 — merged 결과 있으면 merged, 없으면 local 원본(신규 블록)
              // [...mergedBlocks, ...newLocalBlocks] 패턴은 신규 블록을 맨 끝으로 밀어버리므로 위치 손실 발생
              // Python으로 치면: [merged_map.get(b.id, b) for b in local.blocks]
              const mergedById = new Map(mergedBlocks.map(b => [b.id, b]))
              state.pages[idx] = {
                ...updatedPage,
                properties: local.properties,
                isLocked: local.isLocked,
                lockPin: local.lockPin,
                canvasMode: local.canvasMode,
                canvasBoxes: local.canvasBoxes,
                blocks: local.blocks.map(b => mergedById.get(b.id) ?? b),
              }
            }
          })
        }
        setState((state) => { state.saveStatus = 'saved' })
      } catch (error) {
        // 자동 저장 실패 — unsaved 상태 유지. 409은 다른 창의 최신 저장을
        // 덮지 않았다는 뜻이므로 연결 오류와 구분해 사용자가 해결할 수 있게 한다.
        // Python으로 치면: toast_map['save-error'] = show_once(msg)
        setState((state) => { state.saveStatus = 'unsaved' })
        const isConflict = error instanceof Error && error.message.includes('(409)')
        if (isConflict) {
          conflictedPageIds.add(pageId)
          showSaveConflict(pageId, getState, setState)
        } else {
          toast.error('자동 저장 실패. 서버 연결을 확인해 주세요.', {
            id: 'save-error',
            duration: 3000,
          })
        }
      }
    }
    })
  }, 500))
}


// -----------------------------------------------
// 즉시 저장 — 디바운스 없이 바로 서버 저장 (이미지/비디오 업로드 완료 후 호출)
// Python으로 치면: def save_now(page_id): api.save(page_id); cancel_timer(page_id)
// -----------------------------------------------
export async function saveNow(
  pageId: string,
  getState: () => PageStore,
  setState: (fn: (state: PageStore) => void) => void
): Promise<boolean> {
  // 기존 디바운스 타이머 취소 (중복 저장 방지)
  const existing = saveTimers.get(pageId)
  if (existing) { clearTimeout(existing); saveTimers.delete(pageId) }
  if (conflictedPageIds.has(pageId)) return false
  return runSerializedTask(pageId, async () => {
  const state0 = getState()
  const page = state0.pages.find(p => p.id === pageId)
  if (!page) return false
  const categoryId = state0.categoryMap[pageId] ?? null
  // scheduleSave와 같은 규칙: 서버 응답 대기 중 새로 수정된 content만 보존한다.
  const sentBlockContents = new Map(page.blocks.map(block => [block.id, block.content]))
  setState((state) => { state.saveStatus = 'saving' })
  try {
    const updatedPage = await api.savePage(pageId, page, categoryId)
    if (updatedPage) {
      setState((state) => {
        const idx = state.pages.findIndex(p => p.id === pageId)
        if (idx !== -1) {
          const local = state.pages[idx]
          const mergedBlocks = (updatedPage.blocks ?? []).map(serverBlock => {
            const localBlock = local.blocks.find(b => b.id === serverBlock.id)
            if (!localBlock) return serverBlock
            return {
              ...serverBlock,
              // 요청 뒤에 바뀐 content만 보존하고, 제목 변경으로 서버가
              // 교정한 URL은 현재 상태에도 반영한다.
              content: localBlock.content === sentBlockContents.get(serverBlock.id)
                ? serverBlock.content
                : localBlock.content,
              backgroundColor: localBlock.backgroundColor,
              canvasX: localBlock.canvasX,
              canvasY: localBlock.canvasY,
              canvasW: localBlock.canvasW,
              canvasH: localBlock.canvasH,
              children: localBlock.children,
            }
          })
          // local.blocks 순서 기준으로 인터리브 — merged 결과 있으면 merged, 없으면 local 원본(신규 블록)
          // Python으로 치면: [merged_map.get(b.id, b) for b in local.blocks]
          const mergedById = new Map(mergedBlocks.map(b => [b.id, b]))
          state.pages[idx] = {
            ...updatedPage,
            properties: local.properties,
            isLocked: local.isLocked,
            lockPin: local.lockPin,
            canvasMode: local.canvasMode,
            canvasBoxes: local.canvasBoxes,
            blocks: local.blocks.map(b => mergedById.get(b.id) ?? b),
          }
        }
      })
    }
    setState((state) => { state.saveStatus = 'saved' })
    return true
  } catch (error) {
    setState((state) => { state.saveStatus = 'unsaved' })
    const isConflict = error instanceof Error && error.message.includes('(409)')
    if (isConflict) {
      conflictedPageIds.add(pageId)
      showSaveConflict(pageId, getState, setState)
    }
    return false
  }
  })
}


// -----------------------------------------------
// 블록 구조 히스토리 (undo/redo)
// 텍스트 수정(updateBlock)은 Tiptap 내장 History가 처리
// 블록 추가/삭제/이동/타입변경/복제만 이 히스토리가 담당
// Python으로 치면: page_history: dict[str, {"past": list[str], "future": list[str]}] = {}
// -----------------------------------------------
export const pageHistoryMap = new Map<string, { past: string[]; future: string[] }>()

// 히스토리 엔트리 가져오기 (없으면 새로 생성)
// Python으로 치면: def get_history(page_id): return page_history.setdefault(page_id, {...})
export function getHistory(pageId: string): { past: string[]; future: string[] } {
  if (!pageHistoryMap.has(pageId)) {
    pageHistoryMap.set(pageId, { past: [], future: [] })
  }
  return pageHistoryMap.get(pageId)!
}

// 현재 블록 배열 스냅샷을 past에 푸시 (새 액션 직전에 호출)
// Python으로 치면: def push_block_history(page_id, blocks): history["past"].append(json.dumps(blocks))
export function pushBlockHistory(pageId: string, blocks: readonly Block[]): void {
  const h = getHistory(pageId)
  h.past.push(JSON.stringify(blocks))
  h.future = []  // 새 액션 발생 시 redo 히스토리 초기화
  if (h.past.length > 50) h.past.shift()  // 최대 50개 유지
}

// JSON 문자열에서 블록 배열 복원
// Python으로 치면: def parse_blocks(json_str): return json.loads(json_str)
export function parseBlocksFromJson(json: string): Block[] {
  return JSON.parse(json) as Block[]
}
