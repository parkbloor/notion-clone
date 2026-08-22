import type { Block, BlockType } from '@/types/block'

/** Find a block regardless of whether it is at the page root or inside a toggle. */
export function findBlockById(blocks: readonly Block[] | undefined, blockId: string): Block | undefined {
  for (const block of blocks ?? []) {
    if (block.id === blockId) return block
    const child = findBlockById(block.children, blockId)
    if (child) return child
  }
  return undefined
}

/** Return every matching block, including blocks grouped inside toggles. */
export function findBlocksByType(blocks: readonly Block[] | undefined, type: BlockType): Block[] {
  const matches: Block[] = []
  for (const block of blocks ?? []) {
    if (block.type === type) matches.push(block)
    matches.push(...findBlocksByType(block.children, type))
  }
  return matches
}

/** Return the parent chain for a block, from the root toward its direct parent. */
export function findAncestorBlocks(blocks: readonly Block[] | undefined, blockId: string): Block[] {
  function visit(nodes: readonly Block[] | undefined, ancestors: Block[]): Block[] | undefined {
    for (const block of nodes ?? []) {
      if (block.id === blockId) return ancestors
      const result = visit(block.children, [...ancestors, block])
      if (result) return result
    }
    return undefined
  }

  return visit(blocks, []) ?? []
}
