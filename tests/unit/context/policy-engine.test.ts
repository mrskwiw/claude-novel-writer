/**
 * Unit tests for Context Policy Engine (Ticket 010)
 * Tests: scoring, ordering, budget enforcement, fingerprinting, policy engine
 */

import { describe, it, expect, vi } from 'vitest'
import { relevanceScore } from '../../../project/src/context/scoring.js'
import { applyOrderingPolicy } from '../../../project/src/context/ordering.js'
import { enforceBudget } from '../../../project/src/context/token-budget.js'
import { deterministicFingerprint } from '../../../project/src/context/fingerprint.js'
import { ContextPolicyEngine } from '../../../project/src/services/context-policy-engine.js'
import { ContextContractService } from '../../../project/src/services/context-contract-service.js'
import { NovelError, NovelErrorCode } from '../../../project/src/types/errors.js'
import type { ContextBlock, ContextResult } from '../../../project/src/types/context.js'
import type { MCPClient } from '../../../project/src/core/database.js'
import type { ContextFetcher } from '../../../project/src/context/fetchers/fetcher.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(
  overrides: Partial<ContextBlock> & { id: string }
): ContextBlock {
  return {
    id: overrides.id,
    type: overrides.type ?? 'current_scene',
    title: overrides.title ?? 'Test Block',
    content: overrides.content ?? 'Some content text',
    priority: overrides.priority ?? 50,
    relevanceScore: overrides.relevanceScore,
    tokenCount: overrides.tokenCount ?? 100,
    required: overrides.required ?? false,
    orderIndex: overrides.orderIndex ?? 0,
    sourceId: overrides.sourceId,
    sourceType: overrides.sourceType,
  }
}

function makeMCPClient(): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue([]),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient
}

// ---------------------------------------------------------------------------
// 1. Scoring
// ---------------------------------------------------------------------------

describe('relevanceScore()', () => {
  it('returns priority/100 when no queryText is provided', () => {
    const block = makeBlock({ id: 'b1', priority: 80 })
    expect(relevanceScore(block)).toBeCloseTo(0.8)
  })

  it('returns priority/100 when queryText is empty string', () => {
    const block = makeBlock({ id: 'b1', priority: 60 })
    expect(relevanceScore(block, '')).toBeCloseTo(0.6)
  })

  it('clamps priority above 100 to 1', () => {
    const block = makeBlock({ id: 'b1', priority: 150 })
    expect(relevanceScore(block)).toBe(1)
  })

  it('increases score when queryText words appear in content', () => {
    const block = makeBlock({
      id: 'b1',
      priority: 50,
      content: 'The dragon flew over the mountain',
    })
    const withQuery = relevanceScore(block, 'dragon mountain')
    const withoutQuery = relevanceScore(block)
    expect(withQuery).toBeGreaterThan(withoutQuery)
  })

  it('full match gives score boosted toward 1', () => {
    const block = makeBlock({
      id: 'b1',
      priority: 100,
      content: 'hello world',
      title: '',
    })
    const score = relevanceScore(block, 'hello world')
    expect(score).toBeCloseTo(1.0)
  })

  it('no match gives score equal to priority component alone', () => {
    const block = makeBlock({
      id: 'b1',
      priority: 40,
      content: 'unrelated text',
      title: 'unrelated',
    })
    // matchCount=0 → termScore=0 → score = 0 * 0.5 + 0.4 * 0.5 = 0.2
    const score = relevanceScore(block, 'dragon magic spell')
    expect(score).toBeCloseTo(0.2)
  })

  it('result is always in [0, 1]', () => {
    for (const priority of [0, 50, 100, 200]) {
      const block = makeBlock({ id: 'b', priority })
      const s = relevanceScore(block, 'test')
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Ordering
// ---------------------------------------------------------------------------

describe('applyOrderingPolicy()', () => {
  const blocks: ContextBlock[] = [
    makeBlock({ id: 'low',  priority: 10, orderIndex: 3, sourceType: 'scene' }),
    makeBlock({ id: 'high', priority: 90, orderIndex: 1, sourceType: 'character' }),
    makeBlock({ id: 'mid',  priority: 50, orderIndex: 2, sourceType: 'character' }),
  ]

  it('priority_then_relevance: sorts descending by weighted score', () => {
    const sorted = applyOrderingPolicy(blocks, 'priority_then_relevance')
    const ids = sorted.map(b => b.id)
    // high(90) > mid(50) > low(10)
    expect(ids[0]).toBe('high')
    expect(ids[ids.length - 1]).toBe('low')
  })

  it('story_order: sorts by orderIndex ascending', () => {
    const sorted = applyOrderingPolicy(blocks, 'story_order')
    const indexes = sorted.map(b => b.orderIndex)
    expect(indexes).toEqual([1, 2, 3])
  })

  it('entity_grouped: sorts by sourceType ASC then priority DESC', () => {
    const sorted = applyOrderingPolicy(blocks, 'entity_grouped')
    // sourceType: 'character' < 'scene' alphabetically
    // Within 'character': high(90) before mid(50)
    expect(sorted[0].sourceType).toBe('character')
    expect(sorted[1].sourceType).toBe('character')
    expect(sorted[0].priority).toBeGreaterThan(sorted[1].priority)
    expect(sorted[2].sourceType).toBe('scene')
  })

  it('contract_defined: returns blocks in original order', () => {
    const sorted = applyOrderingPolicy(blocks, 'contract_defined')
    expect(sorted.map(b => b.id)).toEqual(blocks.map(b => b.id))
  })

  it('does not mutate the input array', () => {
    const input = [makeBlock({ id: 'a', priority: 30 }), makeBlock({ id: 'b', priority: 80 })]
    const copy = [...input]
    applyOrderingPolicy(input, 'priority_then_relevance')
    expect(input.map(b => b.id)).toEqual(copy.map(b => b.id))
  })
})

// ---------------------------------------------------------------------------
// 3. Token budget enforcement
// ---------------------------------------------------------------------------

describe('enforceBudget()', () => {
  it('required blocks are never dropped (drop_optional_lowest_priority)', () => {
    const req = makeBlock({ id: 'req', priority: 90, tokenCount: 400, required: true })
    const opt = makeBlock({ id: 'opt', priority: 10, tokenCount: 300, required: false })
    const { included, omitted } = enforceBudget(
      [req, opt],
      new Set(['req']),
      500,
      { strategy: 'drop_optional_lowest_priority', preserveRequired: true }
    )
    expect(included.map(b => b.id)).toContain('req')
    expect(omitted.map(b => b.id)).toContain('opt')
  })

  it('optional blocks are dropped when over budget (drop_optional_lowest_priority)', () => {
    const req  = makeBlock({ id: 'req',  priority: 90, tokenCount: 200, required: true })
    const opt1 = makeBlock({ id: 'opt1', priority: 50, tokenCount: 200, required: false })
    const opt2 = makeBlock({ id: 'opt2', priority: 10, tokenCount: 200, required: false })

    const { included, omitted } = enforceBudget(
      [req, opt1, opt2],
      new Set(['req']),
      350,  // req(200) + opt1(200) = 400 > 350; req(200) + opt2(200) = 400 > 350
      { strategy: 'drop_optional_lowest_priority', preserveRequired: true }
    )
    // Only req(200) fits; both optionals omitted, or highest-priority optional fits
    // req=200, highest optional is opt1(50). 200+200=400>350 so opt1 also omitted
    expect(included.some(b => b.id === 'req')).toBe(true)
    expect(omitted.length).toBeGreaterThan(0)
    expect(omitted.every(b => b.id !== 'req')).toBe(true)
  })

  it('optional blocks dropped lowest-relevance first (drop_lowest_relevance)', () => {
    const req     = makeBlock({ id: 'req',     priority: 100, tokenCount: 100, required: true,  relevanceScore: 1.0 })
    const optHigh = makeBlock({ id: 'optHigh', priority: 70,  tokenCount: 100, required: false, relevanceScore: 0.8 })
    const optLow  = makeBlock({ id: 'optLow',  priority: 30,  tokenCount: 100, required: false, relevanceScore: 0.1 })

    const { included, omitted } = enforceBudget(
      [req, optHigh, optLow],
      new Set(['req']),
      220,   // fits req + one optional
      { strategy: 'drop_lowest_relevance', preserveRequired: true }
    )
    expect(included.some(b => b.id === 'req')).toBe(true)
    expect(included.some(b => b.id === 'optHigh')).toBe(true)
    expect(omitted.some(b => b.id === 'optLow')).toBe(true)
  })

  it('hard_fail: throws CONTEXT_REQUIRED_BUDGET_EXCEEDED when required blocks exceed budget', () => {
    const req = makeBlock({ id: 'req', priority: 100, tokenCount: 500, required: true })
    expect(() =>
      enforceBudget(
        [req],
        new Set(['req']),
        100,
        { strategy: 'hard_fail', preserveRequired: true }
      )
    ).toThrow(NovelError)

    try {
      enforceBudget(
        [req],
        new Set(['req']),
        100,
        { strategy: 'hard_fail', preserveRequired: true }
      )
    } catch (err) {
      expect(err).toBeInstanceOf(NovelError)
      expect((err as NovelError).code).toBe(NovelErrorCode.CONTEXT_REQUIRED_BUDGET_EXCEEDED)
    }
  })

  it('allow_overflow: includes all blocks regardless of budget', () => {
    const blocks = [
      makeBlock({ id: 'a', tokenCount: 500, required: true }),
      makeBlock({ id: 'b', tokenCount: 500, required: false }),
    ]
    const { included, omitted } = enforceBudget(
      blocks,
      new Set(['a']),
      100,
      { strategy: 'allow_overflow', preserveRequired: true }
    )
    expect(included).toHaveLength(2)
    expect(omitted).toHaveLength(0)
  })

  it('hard_fail: does NOT throw when required blocks fit', () => {
    const req = makeBlock({ id: 'req', priority: 100, tokenCount: 50, required: true })
    const opt = makeBlock({ id: 'opt', priority: 10, tokenCount: 200, required: false })
    expect(() =>
      enforceBudget(
        [req, opt],
        new Set(['req']),
        100,
        { strategy: 'hard_fail', preserveRequired: true }
      )
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 4. Fingerprint
// ---------------------------------------------------------------------------

describe('deterministicFingerprint()', () => {
  function makeResult(blocks: ContextBlock[]): Omit<ContextResult, 'deterministicFingerprint'> {
    return {
      projectId: 'proj-1',
      contractId: 'scene.continuation.v1',
      blocks,
      totalTokens: blocks.reduce((s, b) => s + b.tokenCount, 0),
      omitted: [],
      warnings: [],
    }
  }

  it('same result produces the same fingerprint', () => {
    const blocks = [makeBlock({ id: 'b1', tokenCount: 100 })]
    const r1 = makeResult(blocks)
    const r2 = makeResult([...blocks])
    expect(deterministicFingerprint(r1)).toBe(deterministicFingerprint(r2))
  })

  it('different block IDs produce different fingerprints', () => {
    const r1 = makeResult([makeBlock({ id: 'block-A', tokenCount: 100 })])
    const r2 = makeResult([makeBlock({ id: 'block-B', tokenCount: 100 })])
    expect(deterministicFingerprint(r1)).not.toBe(deterministicFingerprint(r2))
  })

  it('different block order produces different fingerprints', () => {
    const b1 = makeBlock({ id: 'x', type: 'current_scene', tokenCount: 50 })
    const b2 = makeBlock({ id: 'y', type: 'character_profiles', tokenCount: 80 })
    const r1 = makeResult([b1, b2])
    const r2 = makeResult([b2, b1])
    expect(deterministicFingerprint(r1)).not.toBe(deterministicFingerprint(r2))
  })

  it('different tokenCounts produce different fingerprints', () => {
    const r1 = makeResult([makeBlock({ id: 'b', tokenCount: 100 })])
    const r2 = makeResult([makeBlock({ id: 'b', tokenCount: 200 })])
    expect(deterministicFingerprint(r1)).not.toBe(deterministicFingerprint(r2))
  })

  it('returns a 64-character hex string (SHA-256)', () => {
    const fp = deterministicFingerprint(makeResult([makeBlock({ id: 'b1' })]))
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ---------------------------------------------------------------------------
// 5. ContextPolicyEngine
// ---------------------------------------------------------------------------

describe('ContextPolicyEngine', () => {
  function makeEngine(
    fetchers: Map<string, ContextFetcher> = new Map()
  ): ContextPolicyEngine {
    const contractService = new ContextContractService(makeMCPClient())
    return new ContextPolicyEngine(contractService, fetchers as Map<import('../../../project/src/types/context.js').ContextType, ContextFetcher>)
  }

  it('throws CONTEXT_CONTRACT_NOT_FOUND for unknown contractId', async () => {
    const engine = makeEngine()
    await expect(
      engine.buildContext({
        projectId: 'proj-1',
        contractId: 'no.such.contract.v99',
      })
    ).rejects.toMatchObject({
      code: NovelErrorCode.CONTEXT_CONTRACT_NOT_FOUND,
    })
  })

  it('adds a warning when no fetcher is registered for a required type', async () => {
    const engine = makeEngine() // no fetchers registered
    const result = await engine.buildContext({
      projectId: 'proj-1',
      contractId: 'scene.continuation.v1', // has required: current_scene, character_profiles, world_rules
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.code === 'MISSING_FETCHER')).toBe(true)
  })

  it('builds result with correct block count when fetchers return blocks', async () => {
    const sceneBlock  = makeBlock({ id: 'sc-1', type: 'current_scene',     priority: 100, tokenCount: 50,  required: true })
    const charBlock   = makeBlock({ id: 'ch-1', type: 'character_profiles', priority: 90,  tokenCount: 50,  required: true })
    const worldBlock  = makeBlock({ id: 'wr-1', type: 'world_rules',        priority: 80,  tokenCount: 50,  required: true })

    const fetcherScene:  ContextFetcher = { fetch: vi.fn().mockResolvedValue([sceneBlock])  }
    const fetcherChar:   ContextFetcher = { fetch: vi.fn().mockResolvedValue([charBlock])   }
    const fetcherWorld:  ContextFetcher = { fetch: vi.fn().mockResolvedValue([worldBlock])  }

    const fetchers = new Map<import('../../../project/src/types/context.js').ContextType, ContextFetcher>([
      ['current_scene',     fetcherScene],
      ['character_profiles', fetcherChar],
      ['world_rules',        fetcherWorld],
    ])

    const engine = new ContextPolicyEngine(new ContextContractService(makeMCPClient()), fetchers)
    const result = await engine.buildContext({
      projectId: 'proj-1',
      contractId: 'scene.continuation.v1',
    })

    // 3 required blocks returned, optionals have no fetchers (will warn)
    expect(result.blocks.length).toBe(3)
    expect(result.blocks.map(b => b.id)).toEqual(expect.arrayContaining(['sc-1', 'ch-1', 'wr-1']))
    expect(result.totalTokens).toBe(150)
    expect(typeof result.deterministicFingerprint).toBe('string')
    expect(result.deterministicFingerprint).toHaveLength(64)
  })

  it('omits optional blocks that exceed budget', async () => {
    // Use scene.continuation.v1 which has 6000 token budget
    // Return a required block consuming almost all the budget
    const bigRequired = makeBlock({ id: 'big-req', type: 'current_scene', priority: 100, tokenCount: 5900, required: true })
    const largeOptional = makeBlock({ id: 'large-opt', type: 'canon_facts', priority: 70, tokenCount: 500, required: false })

    const fetchers = new Map<import('../../../project/src/types/context.js').ContextType, ContextFetcher>([
      ['current_scene', { fetch: vi.fn().mockResolvedValue([bigRequired]) }],
      ['canon_facts',   { fetch: vi.fn().mockResolvedValue([largeOptional]) }],
    ])

    const engine = new ContextPolicyEngine(new ContextContractService(makeMCPClient()), fetchers)
    const result = await engine.buildContext({ projectId: 'proj-1', contractId: 'scene.continuation.v1' })

    expect(result.blocks.some(b => b.id === 'big-req')).toBe(true)
    // large-opt(500) would push total to 6400 > 6000 so should be omitted
    expect(result.omitted.some(b => b.id === 'large-opt')).toBe(true)
  })

  it('returns a valid deterministicFingerprint in the result', async () => {
    const engine = makeEngine()
    const result = await engine.buildContext({
      projectId: 'proj-1',
      contractId: 'scene.continuation.v1',
    })
    expect(result.deterministicFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same request with same blocks yields same fingerprint', async () => {
    const block = makeBlock({ id: 'b-stable', type: 'current_scene', priority: 100, tokenCount: 10, required: true })
    const fetcher: ContextFetcher = { fetch: vi.fn().mockResolvedValue([block]) }
    const fetchers = new Map<import('../../../project/src/types/context.js').ContextType, ContextFetcher>([
      ['current_scene', fetcher],
    ])
    const engine = new ContextPolicyEngine(new ContextContractService(makeMCPClient()), fetchers)

    const r1 = await engine.buildContext({ projectId: 'proj-1', contractId: 'scene.continuation.v1' })
    const r2 = await engine.buildContext({ projectId: 'proj-1', contractId: 'scene.continuation.v1' })
    expect(r1.deterministicFingerprint).toBe(r2.deterministicFingerprint)
  })
})
