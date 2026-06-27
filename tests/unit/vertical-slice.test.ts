/**
 * Ticket 013 — Vertical Slice Test
 *
 * Simulates the full Phase 1 flow for the mini-novel "The Sealed Archive"
 * using vi.fn() mocks for MCPClient. No real database is touched.
 */

import { describe, it, expect, vi } from 'vitest';
import { KnowledgeService } from '../../project/src/services/knowledge-service.js';
import { CanonService } from '../../project/src/services/canon-service.js';
import { PromiseService } from '../../project/src/services/promise-service.js';
import { ContextContractService } from '../../project/src/services/context-contract-service.js';
import { NarrativeGraphService } from '../../project/src/services/narrative-graph-service.js';
import type { MCPClient } from '../../project/src/core/database.js';
import type { NarrativeNode } from '../../project/src/types/graph.js';

// ─── Shared test constants ──────────────────────────────────────────────────

const PROJECT_ID = 'sealed-archive-proj';
const NOW = '2026-05-29T00:00:00Z';

const SCOPE = { appliesTo: 'entire_project' as const };
const SOURCE = { sourceType: 'user_declared' as const };

// ─── Helper: build a fresh MCPClient mock ───────────────────────────────────

/**
 * Create a minimal MCPClient mock.
 * `readSequence` is a list of arrays returned in order on successive readQuery calls.
 * Any call beyond the sequence returns [].
 */
function makeMock(readSequence: unknown[][] = []): MCPClient {
  let callIndex = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readSequence[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── Row factory helpers ────────────────────────────────────────────────────

function makeKnowledgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ko-mira-1',
    project_id: PROJECT_ID,
    type: 'character_profile',
    title: 'Mira',
    summary: null,
    body: null,
    structured_data: '{}',
    scope: JSON.stringify(SCOPE),
    source: JSON.stringify(SOURCE),
    confidence: 1,
    status: 'active',
    context_eligible: 1,
    graph_eligible: 1,
    embedding_eligible: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeCanonItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'canon-silver',
    project_id: PROJECT_ID,
    type: 'fact',
    status: 'active',
    strength: 'hard',
    subject: 'Mira',
    predicate: 'has',
    object: 'silver eyes',
    description: 'Mira has silver eyes.',
    scope: JSON.stringify(SCOPE),
    source: JSON.stringify(SOURCE),
    confidence: 1,
    valid_from: null,
    valid_until: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makePromiseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prom-archive-1',
    project_id: PROJECT_ID,
    type: 'mystery',
    status: 'open',
    title: 'Archive Door Mystery',
    description: 'Who sealed the archive door?',
    introduced_at: JSON.stringify({ chapterId: '1' }),
    expected_payoff_window: null,
    importance: 3,
    reader_visibility: 7,
    related_characters: '[]',
    related_plot_threads: '[]',
    related_themes: '[]',
    source: JSON.stringify(SOURCE),
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeNodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-char-mira',
    project_id: PROJECT_ID,
    type: 'character',
    label: 'Mira',
    summary: null,
    source_id: null,
    metadata: '{}',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeEdgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edge-1',
    project_id: PROJECT_ID,
    from_node_id: 'node-char-mira',
    to_node_id: 'node-scene-1',
    type: 'appears_in',
    label: null,
    weight: 1,
    source: null,
    metadata: '{}',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─── Scenario 1: Create character knowledge object ──────────────────────────

describe('Scenario 1: Create character knowledge object', () => {
  it('creates a character_profile knowledge object for Mira', async () => {
    const client = makeMock();
    const svc = new KnowledgeService(client);

    const { object, validation } = await svc.create({
      projectId: PROJECT_ID,
      type: 'character_profile',
      title: 'Mira',
      structuredData: { role: 'protagonist' },
      scope: SCOPE,
      source: SOURCE,
      confidence: 1,
      status: 'active',
      contextEligible: true,
      graphEligible: true,
      embeddingEligible: false,
    });

    expect(object).not.toBeNull();
    expect(object!.id).toBeTruthy();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(object!.title).toBe('Mira');
    expect(object!.type).toBe('character_profile');
  });
});

// ─── Scenario 2: Create a canon fact ────────────────────────────────────────

describe('Scenario 2: Create a canon fact', () => {
  it('creates a fact with no conflict when no prior data exists', async () => {
    // findBySubjectPredicate returns [] → no conflict
    const client = makeMock([[]]);
    const svc = new CanonService(client);

    const { item, conflict } = await svc.createFact(PROJECT_ID, {
      subject: 'Mira',
      predicate: 'has',
      object: 'silver eyes',
      description: 'Mira has silver eyes.',
      scope: SCOPE,
      source: SOURCE,
      confidence: 1,
    });

    expect(item.type).toBe('fact');
    expect(conflict).toBeNull();
    expect(item.subject).toBe('Mira');
    expect(item.object).toBe('silver eyes');
  });
});

// ─── Scenario 3: Detect a canon conflict ────────────────────────────────────

describe('Scenario 3: Detect a canon conflict', () => {
  it('detects a direct_contradiction when the same subject+predicate has a different object', async () => {
    // findBySubjectPredicate returns the previously stored silver-eyes row
    const existingRow = makeCanonItemRow();
    const client = makeMock([[existingRow]]);
    const svc = new CanonService(client);

    // Same subject+predicate, different object → should detect conflict
    const { item, conflict } = await svc.createFact(PROJECT_ID, {
      subject: 'Mira',
      predicate: 'has',
      object: 'blue eyes',
      description: 'Mira has blue eyes.',
      scope: SCOPE,
      source: SOURCE,
      confidence: 1,
    });

    expect(item.object).toBe('blue eyes');
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictType).toBe('direct_contradiction');
    expect(conflict!.severity).toBe('critical'); // both items are 'hard' strength
    expect(conflict!.status).toBe('open');
  });
});

// ─── Scenario 4: Create a narrative promise ──────────────────────────────────

describe('Scenario 4: Create a narrative promise', () => {
  it('creates an open mystery promise for the archive door', async () => {
    const client = makeMock();
    const svc = new PromiseService(client);

    const promise = await svc.createPromise(PROJECT_ID, {
      type: 'mystery',
      title: 'Archive Door Mystery',
      description: 'Who sealed the archive door and why?',
      introducedAt: { chapterId: '1' },
      importance: 6,
      readerVisibility: 8,
      relatedCharacters: [],
      relatedPlotThreads: [],
      relatedThemes: [],
      source: SOURCE,
    });

    expect(promise.status).toBe('open');
    expect(promise.type).toBe('mystery');
    expect(promise.title).toBe('Archive Door Mystery');
    expect(promise.id).toBeTruthy();
  });
});

// ─── Scenario 5: Add a resolving payoff ──────────────────────────────────────

describe('Scenario 5: Add a resolving payoff', () => {
  it('marks the promise as paid_off when resolvesPromise is true', async () => {
    // After insertPayoff + update, getById (readQuery) returns paid_off row
    const paidOffRow = makePromiseRow({ status: 'paid_off' });
    // PromiseService.addPayoff flow:
    //   1. repo.insertPayoff  → writeQuery
    //   2. repo.update        → writeQuery (because resolvesPromise=true)
    //   3. repo.getById       → readQuery  → [paidOffRow]
    //   4. mirrorToKnowledge  → knowledge.upsert → writeQuery
    const client = makeMock([[paidOffRow]]);
    const svc = new PromiseService(client);

    const payoff = await svc.addPayoff('prom-archive-1', {
      payoffAt: { chapterId: '5' },
      description: 'Mira finds the key hidden in the archive shelf.',
      payoffStrength: 8,
      resolvesPromise: true,
    });

    expect(payoff.resolvesPromise).toBe(true);
    expect(payoff.payoffStrength).toBe(8);
    expect(payoff.promiseId).toBe('prom-archive-1');
  });
});

// ─── Scenario 6: Context contracts available ─────────────────────────────────

describe('Scenario 6: Context contracts available', () => {
  it('listAll() returns exactly 3 default contracts', () => {
    // ContextContractService loads 3 contracts from in-memory registry (no DB needed)
    const client = makeMock();
    const svc = new ContextContractService(client);

    const contracts = svc.listAll();

    expect(contracts).toHaveLength(3);
    // Verify they have the expected contract IDs
    const ids = contracts.map(c => c.id).sort();
    expect(ids).toContain('scene.continuation.v1');
    expect(ids).toContain('continuity.check.v1');
    expect(ids).toContain('developmental.edit.v1');
  });
});

// ─── Scenario 7: Graph nodes — upsert and retrieve ───────────────────────────

describe('Scenario 7: Graph nodes — upsert and retrieve', () => {
  it('upserts a character node then retrieves it by id', async () => {
    const characterNode: NarrativeNode = {
      id: 'node-char-mira',
      projectId: PROJECT_ID,
      type: 'character',
      label: 'Mira',
      metadata: { role: 'protagonist' },
      createdAt: NOW,
      updatedAt: NOW,
    };

    // getNode readQuery returns the node row
    const client = makeMock([[makeNodeRow()]]);
    const svc = new NarrativeGraphService(client);

    await svc.upsertNode(characterNode);
    const node = await svc.getNode(characterNode.id);

    expect(node).not.toBeNull();
    expect(node!.label).toBe('Mira');
    expect(node!.type).toBe('character');
    expect(node!.id).toBe('node-char-mira');
  });
});

// ─── Scenario 8: Find path between connected nodes ───────────────────────────

describe('Scenario 8: Find path between connected nodes', () => {
  it('returns [fromId, toId] when a direct edge connects the two nodes', async () => {
    const fromId = 'node-char-mira';
    const toId = 'node-scene-1';

    // findPath BFS calls readQuery for edges from fromId; edge row links fromId→toId
    const edgeRow = makeEdgeRow({ from_node_id: fromId, to_node_id: toId });
    const client = makeMock([[edgeRow]]);
    const svc = new NarrativeGraphService(client);

    const path = await svc.findPath(fromId, toId);

    expect(path).not.toBeNull();
    expect(path).toEqual([fromId, toId]);
  });
});

// ─── Scenario 9: Promise health report — healthy ─────────────────────────────

describe('Scenario 9: Promise health report — healthy', () => {
  it('reports a promise with importance < 7 and status open as healthy', async () => {
    // listByProject readQuery returns a low-importance open promise
    const promiseRow = makePromiseRow({ importance: 3, status: 'open' });
    const client = makeMock([[promiseRow]]);
    const svc = new PromiseService(client);

    const health = await svc.reportHealth(PROJECT_ID);

    expect(health).toHaveLength(1);
    expect(health[0].status).toBe('healthy');
    expect(health[0].promiseId).toBe('prom-archive-1');
  });
});

// ─── Scenario 10: Knowledge service validation — rejects invalid input ────────

describe('Scenario 10: Knowledge service validation — rejects invalid input', () => {
  it('returns validation.valid = false when title is empty', async () => {
    const client = makeMock();
    const svc = new KnowledgeService(client);

    const { object, validation } = await svc.create({
      projectId: PROJECT_ID,
      type: 'character_profile',
      title: '',            // invalid: empty title
      structuredData: {},
      scope: SCOPE,
      source: SOURCE,
      confidence: 1,
      status: 'active',
      contextEligible: true,
      graphEligible: true,
      embeddingEligible: false,
    });

    expect(validation.valid).toBe(false);
    expect(object).toBeNull();
    expect(validation.errors).toContain('title is required');
  });
});
