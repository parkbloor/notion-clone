import type { Page } from '@/types/block'
import { findAncestorBlocks } from '@/lib/blockTree'

export const OPEN_TOGGLE_BLOCKS_EVENT = 'open-toggle-blocks'

/** Ensure every toggle containing the target block is open before focusing it. */
export function revealBlockAncestors(page: Page | undefined, blockId: string): void {
  if (typeof window === 'undefined') return
  const toggleIds = findAncestorBlocks(page?.blocks, blockId)
    .filter(block => block.type === 'toggle')
    .map(block => block.id)

  for (const toggleId of toggleIds) {
    try { localStorage.setItem(`toggle-open-${toggleId}`, 'true') } catch {}
  }
  window.dispatchEvent(new CustomEvent<string[]>(OPEN_TOGGLE_BLOCKS_EVENT, { detail: toggleIds }))
}
