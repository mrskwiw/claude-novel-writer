import type { ContextBlock, ContextType, ContextTruncationPolicy } from '../types/context.js'
import type { ID } from '../types/common.js'
import { NovelError, NovelErrorCode } from '../types/errors.js'
import { relevanceScore } from './scoring.js'

/** Shape of an omitted-block record in ContextResult. */
export interface OmittedBlock {
  id: ID
  type: ContextType
  reason: string
}

/** Result of budget enforcement. */
export interface BudgetResult {
  included: ContextBlock[]
  omitted: OmittedBlock[]
}

/**
 * Enforce a token budget across a list of ContextBlocks.
 *
 * Required blocks (ids in `required`) are always kept unless the `hard_fail`
 * strategy is in effect and they alone exceed the budget.
 *
 * @param blocks   - Ordered list of blocks to evaluate.
 * @param required - Set of block IDs that must be included.
 * @param budget   - Maximum total tokens allowed.
 * @param policy   - Truncation strategy to apply.
 * @returns `{ included, omitted }` where `omitted` lists dropped blocks with reasons.
 */
export function enforceBudget(
  blocks: ContextBlock[],
  required: Set<string>,
  budget: number,
  policy: ContextTruncationPolicy
): BudgetResult {
  const totalRequired = blocks
    .filter(b => required.has(b.id))
    .reduce((sum, b) => sum + b.tokenCount, 0)

  // --- allow_overflow: include everything ---
  if (policy.strategy === 'allow_overflow') {
    return { included: [...blocks], omitted: [] }
  }

  // --- hard_fail: throw if required blocks alone exceed budget ---
  if (policy.strategy === 'hard_fail') {
    if (totalRequired > budget) {
      throw new NovelError(
        NovelErrorCode.CONTEXT_REQUIRED_BUDGET_EXCEEDED,
        `Required blocks consume ${totalRequired} tokens which exceeds the budget of ${budget}.`,
        { totalRequired, budget }
      )
    }
    // Still drop optionals that push over budget
    return dropUntilFit(blocks, required, budget, 'priority')
  }

  // --- drop_optional_lowest_priority ---
  if (policy.strategy === 'drop_optional_lowest_priority') {
    return dropUntilFit(blocks, required, budget, 'priority')
  }

  // --- drop_lowest_relevance ---
  if (policy.strategy === 'drop_lowest_relevance') {
    return dropUntilFit(blocks, required, budget, 'relevance')
  }

  // Unreachable — TypeScript exhaustiveness guard
  const _exhaustive: never = policy.strategy
  return _exhaustive
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Drop optional blocks (lowest score first) until total fits within budget.
 * Required blocks are never dropped.
 */
function dropUntilFit(
  blocks: ContextBlock[],
  required: Set<string>,
  budget: number,
  sortBy: 'priority' | 'relevance'
): BudgetResult {
  // Separate required vs optional
  const requiredBlocks = blocks.filter(b => required.has(b.id))
  const optionalBlocks = blocks.filter(b => !required.has(b.id))

  // Sort optional blocks so we drop lowest-score first
  const sortedOptional = [...optionalBlocks].sort((a, b) => {
    if (sortBy === 'priority') {
      return a.priority - b.priority // ascending → lowest first → drop first
    }
    const scoreA = a.relevanceScore ?? relevanceScore(a)
    const scoreB = b.relevanceScore ?? relevanceScore(b)
    return scoreA - scoreB // ascending → lowest first → drop first
  })

  let totalTokens = requiredBlocks.reduce((sum, b) => sum + b.tokenCount, 0)
  const included: ContextBlock[] = [...requiredBlocks]
  const omitted: OmittedBlock[] = []

  // Greedily add optional blocks (in reverse = highest score first)
  const toConsider = [...sortedOptional].reverse()
  for (const block of toConsider) {
    if (totalTokens + block.tokenCount <= budget) {
      included.push(block)
      totalTokens += block.tokenCount
    } else {
      omitted.push({
        id: block.id,
        type: block.type,
        reason: `Dropped by ${sortBy === 'priority' ? 'drop_optional_lowest_priority' : 'drop_lowest_relevance'}: over token budget`,
      })
    }
  }

  return { included, omitted }
}
