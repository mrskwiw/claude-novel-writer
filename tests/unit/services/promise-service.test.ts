/**
 * Unit tests for PromiseRepository + PromiseService (Ticket 007)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromiseRepository } from '../../../project/src/db/repositories/promise-repository.js';
import { PromiseService } from '../../../project/src/services/promise-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { NarrativePromise } from '../../../project/src/types/promise.js';

const SOURCE = { sourceType: 'user_declared' as const };
const LOCATION = { chapterId: '2' };

function makePromiseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prom-1',
    project_id: 'proj-1',
    type: 'mystery',
    status: 'open',
    title: 'Archive Door Mystery',
    description: 'Who locked the archive door?',
    introduced_at: JSON.stringify(LOCATION),
    expected_payoff_window: JSON.stringify({ latestChapter: 5 }),
    importance: 8,
    reader_visibility: 9,
    related_characters: '[]',
    related_plot_threads: '[]',
    related_themes: '[]',
    source: JSON.stringify(SOURCE),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePayoffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    promise_id: 'prom-1',
    payoff_at: JSON.stringify(LOCATION),
    description: 'Mira reveals the key',
    payoff_strength: 7,
    resolves_promise: 0,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMock(readResults: unknown[][] = []): MCPClient {
  let callIndex = 0;
  return {
    readQuery: vi.fn().mockImplementation(async () => {
      const result = readResults[callIndex] ?? [];
      callIndex++;
      return result;
    }),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── PromiseRepository ────────────────────────────────────────────────────

describe('PromiseRepository', () => {
  let client: MCPClient;
  let repo: PromiseRepository;

  beforeEach(() => {
    client = makeMock();
    repo = new PromiseRepository(client);
  });

  it('insert() calls writeQuery with 16 params', async () => {
    const now = new Date().toISOString();
    await repo.insert({
      id: 'prom-1', projectId: 'proj-1', type: 'mystery', status: 'open',
      title: 'Mystery', description: 'desc', introducedAt: LOCATION,
      importance: 5, readerVisibility: 5,
      relatedCharacters: [], relatedPlotThreads: [], relatedThemes: [],
      source: SOURCE, createdAt: now, updatedAt: now,
    });
    const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params).toHaveLength(16);
  });

  it('getById() deserializes JSON fields', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makePromiseRow()]);
    const p = await repo.getById('prom-1');
    expect(p?.introducedAt).toEqual(LOCATION);
    expect(p?.expectedPayoffWindow).toEqual({ latestChapter: 5 });
    expect(p?.relatedCharacters).toEqual([]);
  });

  it('listOpen() queries for open and developing status', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await repo.listOpen('proj-1');
    const [sql] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("status IN");
    expect(sql).toContain('open');
    expect(sql).toContain('developing');
  });

  it('insertPayoff() stores resolves_promise as 1/0', async () => {
    await repo.insertPayoff({
      id: 'pay-1', promiseId: 'prom-1', payoffAt: LOCATION,
      description: 'Mira reveals the key', payoffStrength: 7, resolvesPromise: true,
    });
    const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params[5]).toBe(1);
  });

  it('listPayoffs() deserializes payoffAt and resolvesPromise', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makePayoffRow({ resolves_promise: 1 }),
    ]);
    const payoffs = await repo.listPayoffs('prom-1');
    expect(payoffs[0].payoffAt).toEqual(LOCATION);
    expect(payoffs[0].resolvesPromise).toBe(true);
  });
});

// ─── PromiseService ───────────────────────────────────────────────────────

describe('PromiseService', () => {
  let client: MCPClient;
  let svc: PromiseService;

  beforeEach(() => {
    client = makeMock([]);
    svc = new PromiseService(client);
  });

  describe('createPromise()', () => {
    it('creates a promise with status open and returns it', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const p = await svc.createPromise('proj-1', {
        type: 'mystery', title: 'Archive Door Mystery', description: 'Who locked the door?',
        introducedAt: LOCATION, importance: 8, readerVisibility: 9,
        relatedCharacters: [], relatedPlotThreads: [], relatedThemes: [], source: SOURCE,
      });
      expect(p.status).toBe('open');
      expect(p.id).toBeTruthy();
      expect(client.writeQuery).toHaveBeenCalled();
    });
  });

  describe('listOpen()', () => {
    it('returns open and developing promises', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makePromiseRow()]);
      const results = await svc.listOpen('proj-1');
      expect(results).toHaveLength(1);
    });
  });

  describe('addPayoff()', () => {
    it('adds a partial payoff without changing promise status', async () => {
      // readQuery calls: (1) getById after update, (2) knowledge upsert readQuery (none)
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makePromiseRow()]);
      const payoff = await svc.addPayoff('prom-1', {
        payoffAt: LOCATION, description: 'Partial revelation', payoffStrength: 5, resolvesPromise: false,
      });
      expect(payoff.resolvesPromise).toBe(false);
      // writeQuery calls: insertPayoff, then knowledge upsert
      const updateCalls = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls;
      // Should NOT have an UPDATE narrative_promises for status
      const statusUpdate = updateCalls.find(([sql]: [string]) =>
        sql.includes('UPDATE narrative_promises') && sql.includes('status')
      );
      expect(statusUpdate).toBeUndefined();
    });

    it('sets promise status to paid_off when resolvesPromise is true', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makePromiseRow({ status: 'paid_off' })]);

      await svc.addPayoff('prom-1', {
        payoffAt: LOCATION, description: 'Full resolution', payoffStrength: 9, resolvesPromise: true,
      });

      const writeCalls = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = writeCalls.find(([sql]: [string]) =>
        sql.includes('UPDATE narrative_promises')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toContain('paid_off');
    });
  });

  describe('reportHealth()', () => {
    it('marks dropped promises as dropped', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makePromiseRow({ status: 'dropped' })]);

      const health = await svc.reportHealth('proj-1');
      expect(health[0].status).toBe('dropped');
    });

    it('marks paid_off with low strength as weak_payoff', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makePromiseRow({ status: 'paid_off' })])
        .mockResolvedValueOnce([makePayoffRow({ payoff_strength: 2 })]);

      const health = await svc.reportHealth('proj-1');
      expect(health[0].status).toBe('weak_payoff');
    });

    it('marks high-importance open promise as aging', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makePromiseRow({ importance: 9, expected_payoff_window: null })]);

      const health = await svc.reportHealth('proj-1');
      expect(health[0].status).toBe('aging');
    });

    it('marks healthy promise as healthy', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makePromiseRow({ importance: 4, expected_payoff_window: null })]);

      const health = await svc.reportHealth('proj-1');
      expect(health[0].status).toBe('healthy');
    });

    it('mirrors promise to knowledge_objects on create', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await svc.createPromise('proj-1', {
        type: 'mystery', title: 'Test', description: 'desc', introducedAt: LOCATION,
        importance: 5, readerVisibility: 5,
        relatedCharacters: [], relatedPlotThreads: [], relatedThemes: [], source: SOURCE,
      });
      const writeCalls = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls;
      const knowledgeCall = writeCalls.find(([sql]: [string]) => sql.includes('knowledge_objects'));
      expect(knowledgeCall).toBeDefined();
    });
  });
});
