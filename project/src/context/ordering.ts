import type { ContextBlock, ContextOrderingPolicy } from '../types/context.js'
import { relevanceScore } from './scoring.js'

/**
 * Apply an ordering policy to a list of ContextBlocks.
 *
 * @param blocks - Blocks to sort (not mutated; a new array is returned).
 * @param policy - The ordering strategy to apply.
 * @returns A new, sorted array of blocks.
 */
export function applyOrderingPolicy(
  blocks: ContextBlock[],
  policy: ContextOrderingPolicy
): ContextBlock[] {
  const copy = [...blocks]

  switch (policy) {
    case 'priority_then_relevance': {
      return copy.sort((a, b) => {
        const scoreA = a.priority * 0.7 + (a.relevanceScore ?? relevanceScore(a)) * 0.3
        const scoreB = b.priority * 0.7 + (b.relevanceScore ?? relevanceScore(b)) * 0.3
        return scoreB - scoreA // descending
      })
    }

    case 'story_order': {
      return copy.sort((a, b) => a.orderIndex - b.orderIndex) // ascending
    }

    case 'entity_grouped': {
      return copy.sort((a, b) => {
        const srcA = a.sourceType ?? ''
        const srcB = b.sourceType ?? ''
        if (srcA !== srcB) {
          return srcA < srcB ? -1 : 1 // sourceType ASC
        }
        return b.priority - a.priority // priority DESC within group
      })
    }

    case 'contract_defined': {
      return copy // as-is
    }

    default: {
      // TypeScript exhaustiveness guard — should never happen at runtime.
      const _exhaustive: never = policy
      return _exhaustive
    }
  }
}
