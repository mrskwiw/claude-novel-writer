/**
 * Unit tests for CanonRepository + CanonService (Ticket 006)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanonRepository } from '../../../project/src/db/repositories/canon-repository.js';
import { CanonService } from '../../../project/src/services/canon-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { CanonItem } from '../../../project/src/types/canon.js';

const SCOPE = { appliesTo: 'entire_project' as const };
const SOURCE = { sourceType: 'user_declared' as const };

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'can-1',
    project_id: 'proj-1',
    type: 'fact',
    status: 'active',
    strength: 'hard',
    subject: 'Mira',
    predicate: 'has',
    object: 'silver eyes',
    description: 'Mira has silver eyes',
    scope: JSON.stringify(SCOPE),
    source: JSON.stringify(SOURCE),
    confidence: 1,
    valid_from: null,
    valid_until: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConflictRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conf-1',
    project_id: 'proj-1',
    item_a: 'can-1',
    item_b: 'can-2',
    conflict_type: 'direct_contradiction',
    severity: 'critical',
    explanation: 'Conflicting values',
    recommended_resolution: null,
    status: 'open',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMock(readResult: unknown[][] = []): MCPClient {
  let callIndex = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readResult[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── CanonRepository ───────────────────────────────────────────────────────

describe('CanonRepository', () => {
  let client: MCPClient;
  let repo: CanonRepository;

  beforeEach(() => {
    client = makeMock();
    repo = new CanonRepository(client);
  });

  it('insert() calls writeQuery with 16 params', async () => {
    const now = new Date().toISOString();
    const item: CanonItem = {
      id: 'can-1', projectId: 'proj-1', type: 'fact', status: 'active', strength: 'hard',
      subject: 'Mira', predicate: 'has', object: 'silver eyes',
      description: 'Mira has silver eyes', scope: SCOPE, source: SOURCE,
      confidence: 1, createdAt: now, updatedAt: now,
    };
    await repo.insert(item);
    const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params).toHaveLength(16);
  });

  it('getById() returns null when not found', async () => {
    expect(await repo.getById('x')).toBeNull();
  });

  it('getById() deserializes JSON fields', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeItemRow()]);
    const item = await repo.getById('can-1');
    expect(item?.scope).toEqual(SCOPE);
    expect(item?.source).toEqual(SOURCE);
  });

  it('listBySubject() passes subject to query', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await repo.listBySubject('proj-1', 'Mira');
    expect(client.readQuery).toHaveBeenCalledWith(
      expect.stringContaining('subject = ?'),
      ['proj-1', 'Mira']
    );
  });

  it('listActive() filters by status = active', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await repo.listActive('proj-1');
    const [sql] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("status = 'active'");
  });

  it('insertConflict() calls writeQuery with 10 params', async () => {
    await repo.insertConflict({
      id: 'conf-1', projectId: 'proj-1', itemA: 'can-1', itemB: 'can-2',
      conflictType: 'direct_contradiction', severity: 'critical',
      explanation: 'test', status: 'open',
    });
    const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params).toHaveLength(10);
  });

  it('listConflicts() defaults to open status', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeConflictRow()]);
    const results = await repo.listConflicts('proj-1');
    expect(results[0].conflictType).toBe('direct_contradiction');
  });
});

// ─── CanonService ──────────────────────────────────────────────────────────

describe('CanonService', () => {
  let client: MCPClient;
  let svc: CanonService;

  beforeEach(() => {
    // readQuery calls: (1) findBySubjectPredicate for conflict detection, (2) readQuery for mirror upsert (knowledge getById via ON CONFLICT)
    client = makeMock([[]]); // no existing items → no conflict
    svc = new CanonService(client);
  });

  describe('createFact()', () => {
    it('inserts item and returns it with no conflict when subject+predicate is unique', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { item, conflict } = await svc.createFact('proj-1', {
        subject: 'Mira', predicate: 'has', object: 'silver eyes',
        description: 'Mira has silver eyes', scope: SCOPE, source: SOURCE, confidence: 1,
      });
      expect(item.type).toBe('fact');
      expect(item.strength).toBe('hard');
      expect(item.status).toBe('active');
      expect(conflict).toBeNull();
      expect(client.writeQuery).toHaveBeenCalled();
    });

    it('returns critical conflict when same subject+predicate has different object', async () => {
      // First readQuery (findBySubjectPredicate) returns existing item with different object
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeItemRow({ object: 'blue eyes', id: 'can-existing' })])
        .mockResolvedValue([]);

      const { conflict } = await svc.createFact('proj-1', {
        subject: 'Mira', predicate: 'has', object: 'silver eyes',
        description: 'Mira has silver eyes', scope: SCOPE, source: SOURCE, confidence: 1,
      });

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictType).toBe('direct_contradiction');
      expect(conflict?.severity).toBe('critical');
      expect(conflict?.status).toBe('open');
    });

    it('does NOT conflict when objects are identical', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeItemRow({ object: 'silver eyes', id: 'can-existing' })])
        .mockResolvedValue([]);

      const { conflict } = await svc.createFact('proj-1', {
        subject: 'Mira', predicate: 'has', object: 'silver eyes',
        description: 'desc', scope: SCOPE, source: SOURCE, confidence: 1,
      });
      expect(conflict).toBeNull();
    });
  });

  describe('createRule()', () => {
    it('creates rule with hard strength', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { item } = await svc.createRule('proj-1', {
        subject: 'magic', predicate: 'costs', description: 'Magic costs energy',
        scope: SCOPE, source: SOURCE, confidence: 1,
      });
      expect(item.type).toBe('rule');
      expect(item.strength).toBe('hard');
    });
  });

  describe('createSituation()', () => {
    it('creates situation with soft strength', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { item } = await svc.createSituation('proj-1', {
        subject: 'Mira', predicate: 'is', object: 'running',
        description: 'Mira is running', scope: SCOPE, source: SOURCE, confidence: 0.8,
      });
      expect(item.type).toBe('situation');
      expect(item.strength).toBe('soft');
    });
  });

  describe('createAssertion()', () => {
    it('creates assertion with inferred strength', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { item } = await svc.createAssertion('proj-1', {
        subject: 'Mira', predicate: 'knows', object: 'Kai',
        description: 'Mira knows Kai', scope: SCOPE, source: SOURCE, confidence: 0.7,
      });
      expect(item.type).toBe('assertion');
      expect(item.strength).toBe('inferred');
    });
  });

  describe('promoteAssertion()', () => {
    it('updates type to fact and strength to hard', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeItemRow({ type: 'assertion', strength: 'inferred' })]);
      await svc.promoteAssertion('can-1');
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('UPDATE canon_items');
      expect(params).toContain('fact');
      expect(params).toContain('hard');
    });
  });

  describe('deprecate()', () => {
    it('sets status to deprecated', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeItemRow({ status: 'deprecated' })]);
      await svc.deprecate('can-1');
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('UPDATE canon_items');
      expect(params).toContain('deprecated');
    });
  });

  describe('mirrorToKnowledge()', () => {
    it('upserts into knowledge_objects on createFact', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await svc.createFact('proj-1', {
        subject: 'Mira', predicate: 'has', object: 'silver eyes',
        description: 'desc', scope: SCOPE, source: SOURCE, confidence: 1,
      });
      const calls = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls;
      const upsertCall = calls.find(([sql]: [string]) => sql.includes('knowledge_objects'));
      expect(upsertCall).toBeDefined();
      expect(upsertCall![1]).toContain('canon_item');
    });
  });
});
