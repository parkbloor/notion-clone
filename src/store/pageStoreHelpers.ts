// =============================================
// src/store/pageStoreHelpers.ts
// 역할: pageStore의 저장 디바운서 + 히스토리 유틸
// pageStore.ts에서 분리 — 독립적으로 테스트 가능
// Python으로 치면: page_store_helpers.py
// =============================================

import { toast } from 'sonner'
import { Block } from '@/types/block'
import { api } from '@/lib/api'
import type { PageStore } from '@/types/pageStore'

// -----------------------------------------------
// 페이지 저장 디바운서 — 마지막 변경 후 500ms 뒤에 한 번만 저장
// Python으로 치면: save_timers: dict[str, threading.Timer] = {}
// -----------------------------------------------
export const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Python으로 치면: def schedule_save(page_id, get_state, set_state): ...
export function scheduleSave(
  pageId: string,
  getState: () => PageStore,
  setState: (fn: (state: PageStore) => void) => void
) {
  // 기존 타이머 취소 (디바운스)
  const existing = saveTimers.get(pageId)
  if (existing) clearTimeout(existing)

  // 변경 발생 → 미저장 상태로 전환
  // Python으로 치면: self.save_status = 'unsaved'
  setState((state) => { state.saveStatus = 'unsaved' })

  // 500ms 후 저장
  saveTimers.set(pageId, setTimeout(async () => {
    saveTimers.delete(pageId)
    setState((state) => { state.saveStatus = 'saving' })
    const page = getState().pages.find(p => p.id === pageId)
    if (page) {
      try {
        const updatedPage = await api.savePage(pageId, page)
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
                  backgroundColor: localBlock.backgroundColor,
                  canvasX: localBlock.canvasX,
                  canvasY: localBlock.canvasY,
                  canvasW: localBlock.canvasW,
                  canvasH: localBlock.canvasH,
                  children: localBlock.children,
                }
              })
              state.pages[idx] = {
                ...updatedPage,
                properties: local.properties,
                isLocked: local.isLocked,
                canvasMode: local.canvasMode,
                canvasBoxes: local.canvasBoxes,
                blocks: mergedBlocks,
              }
            }
          })
        }
        setState((state) => { state.saveStatus = 'saved' })
      } catch {
        // 자동 저장 실패 — unsaved 상태 유지 + 토스트
        // Python으로 치면: toast_map['save-error'] = show_once(msg)
        setState((state) => { state.saveStatus = 'unsaved' })
        toast.error('자동 저장 실패. 서버 연결을 확인해 주세요.', {
          id: 'save-error',
          duration: 3000,
        })
      }
    }
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
) {
  // 기존 디바운스 타이머 취소 (중복 저장 방지)
  const existing = saveTimers.get(pageId)
  if (existing) { clearTimeout(existing); saveTimers.delete(pageId) }
  const page = getState().pages.find(p => p.id === pageId)
  if (!page) return
  setState((state) => { state.saveStatus = 'saving' })
  try {
    const updatedPage = await api.savePage(pageId, page)
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
              backgroundColor: localBlock.backgroundColor,
              canvasX: localBlock.canvasX,
              canvasY: localBlock.canvasY,
              canvasW: localBlock.canvasW,
              canvasH: localBlock.canvasH,
              children: localBlock.children,
            }
          })
          state.pages[idx] = {
            ...updatedPage,
            properties: local.properties,
            isLocked: local.isLocked,
            canvasMode: local.canvasMode,
            canvasBoxes: local.canvasBoxes,
            blocks: mergedBlocks,
          }
        }
      })
    }
    setState((state) => { state.saveStatus = 'saved' })
  } catch {
    setState((state) => { state.saveStatus = 'unsaved' })
  }
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
