import type {
  ContextBuildRequest,
  ContextBlock,
  ContextResult,
  ContextType,
} from '../types/context.js'
import type { ID } from '../types/common.js'
import { NovelError, NovelErrorCode } from '../types/errors.js'
import { ContextContractService } from './context-contract-service.js'
import type { ContextFetcher } from '../context/fetchers/fetcher.js'
import { relevanceScore } from '../context/scoring.js'
import { applyOrderingPolicy } from '../context/ordering.js'
import { enforceBudget } from '../context/token-budget.js'
import { deterministicFingerprint } from '../context/fingerprint.js'

/**
 * ContextPolicyEngine — Ticket 010
 *
 * Assembles a ContextResult for a build request by:
 *  1. Loading the ContextContract from the contract service.
 *  2. Calling registered fetchers for each required + optional requirement.
 *  3. Scoring each block.
 *  4. Applying the contract's ordering policy.
 *  5. Enforcing the token budget via the truncation policy.
 *  6. Computing a deterministic fingerprint.
 */
export class ContextPolicyEngine {
  constructor(
    private readonly contractService: ContextContractService,
    private readonly fetchers: Map<ContextType, ContextFetcher>
  ) {}

  /**
   * Build a context result for the given request.
   *
   * @throws {NovelError} with code CONTEXT_CONTRACT_NOT_FOUND when the
   *   contractId does not resolve to a known contract.
   */
  async buildContext(request: ContextBuildRequest): Promise<ContextResult> {
    // 1. Resolve contract (apply any caller overrides)
    const baseContract = this.contractService.getById(request.contractId)
    if (baseContract === null) {
      throw new NovelError(
        NovelErrorCode.CONTEXT_CONTRACT_NOT_FOUND,
        `Context contract "${request.contractId}" not found.`,
        { contractId: request.contractId }
      )
    }
    const contract = request.overrides ? { ...baseContract, ...request.overrides } : baseContract

    const warnings: { code: string; message: string }[] = []
    const allBlocks: ContextBlock[] = []

    // 2. Collect blocks from fetchers for all requirements
    const requirementSets = [
      { items: contract.required, isRequired: true },
      { items: contract.optional, isRequired: false },
    ]

    for (const { items, isRequired } of requirementSets) {
      for (const req of items) {
        const fetcher = this.fetchers.get(req.type)
        if (fetcher === undefined) {
          warnings.push({
            code: 'MISSING_FETCHER',
            message: `No fetcher registered for context type "${req.type}". Requirement skipped.`,
          })
          continue
        }

        let blocks: ContextBlock[]
        try {
          blocks = await fetcher.fetch(request.projectId, req.scope, request.queryText)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          warnings.push({
            code: 'FETCH_ERROR',
            message: `Fetcher for "${req.type}" failed: ${message}`,
          })
          continue
        }

        // Mark blocks with required flag and cap per-requirement token limit
        let remaining = req.maxTokens
        for (const block of blocks) {
          if (remaining !== undefined) {
            if (block.tokenCount > remaining) continue
            remaining -= block.tokenCount
          }
          allBlocks.push({ ...block, required: isRequired })
        }
      }
    }

    // 3. Score each block
    const scoredBlocks: ContextBlock[] = allBlocks.map(b => ({
      ...b,
      relevanceScore: relevanceScore(b, request.queryText),
    }))

    // 4. Apply ordering policy
    const orderedBlocks = applyOrderingPolicy(scoredBlocks, contract.orderingPolicy)

    // 5. Enforce token budget
    const requiredIds = new Set<ID>(
      orderedBlocks.filter(b => b.required).map(b => b.id)
    )
    const { included, omitted } = enforceBudget(
      orderedBlocks,
      requiredIds,
      contract.maxTokens,
      contract.truncationPolicy
    )

    // 6. Compute total tokens
    const totalTokens = included.reduce((sum, b) => sum + b.tokenCount, 0)

    // 7. Build result (without fingerprint) and compute fingerprint
    const partial: Omit<ContextResult, 'deterministicFingerprint'> = {
      projectId: request.projectId,
      contractId: request.contractId,
      blocks: included,
      totalTokens,
      omitted,
      warnings,
    }

    return {
      ...partial,
      deterministicFingerprint: deterministicFingerprint(partial),
    }
  }
}
