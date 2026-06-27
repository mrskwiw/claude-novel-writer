import type { ContextBlock } from '../types/context.js'

/**
 * Compute a relevance score for a ContextBlock.
 *
 * - Without queryText: score = block.priority / 100 (clamped to [0,1]).
 * - With queryText: score combines a term-match ratio (weight 0.5) and the
 *   normalised priority (weight 0.5).
 *
 * @param block     - The block to score.
 * @param queryText - Optional query text used to boost term-matched blocks.
 * @returns A value in [0, 1].
 */
export function relevanceScore(block: ContextBlock, queryText?: string): number {
  const normalizedPriority = Math.min(Math.max(block.priority / 100, 0), 1)

  if (queryText === undefined || queryText.trim() === '') {
    return normalizedPriority
  }

  const words = queryText
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 0)

  if (words.length === 0) {
    return normalizedPriority
  }

  const haystack = `${block.title} ${block.content}`.toLowerCase()
  const matchCount = words.filter(word => haystack.includes(word)).length
  const termScore = matchCount / words.length

  const score = termScore * 0.5 + normalizedPriority * 0.5
  return Math.min(Math.max(score, 0), 1)
}
