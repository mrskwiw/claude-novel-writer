import type { ContextResult, ContextType } from '../types/context.js'
import type { ID } from '../types/common.js'
import { sha256Hex } from '../utils/hash.js'
import { stableStringify } from '../utils/stable-json.js'

/** Minimal block descriptor used when computing the fingerprint. */
interface BlockDescriptor {
  id: ID
  type: ContextType
  tokenCount: number
}

/**
 * Produce a deterministic SHA-256 fingerprint for a ContextResult.
 *
 * The fingerprint is derived from the ordered list of block IDs, types, and
 * token counts. Any two results that contain identical blocks in the same
 * order will produce the same fingerprint.
 *
 * @param result - ContextResult without the `deterministicFingerprint` field.
 * @returns A lowercase hex SHA-256 string.
 */
export function deterministicFingerprint(
  result: Omit<ContextResult, 'deterministicFingerprint'>
): string {
  const descriptors: BlockDescriptor[] = result.blocks.map(b => ({
    id: b.id,
    type: b.type,
    tokenCount: b.tokenCount,
  }))

  return sha256Hex(stableStringify(descriptors))
}
