/**
 * Unit tests for QueryTrackerService — PROC-10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QueryTrackerService,
  type QueryStatus,
  type AgentQuery,
} from '../../../project/src/services/query-tracker-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMock(readResult: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(readResult),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

function makeQueryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'query-1',
    project_id: 'proj-1',
    agent_name: 'Jane Smith',
    agency: 'Big Five Agency',
    query_date: '2026-01-01',
    status: 'sent',
    response_date: null,
    notes: null,
    materials_sent: JSON.stringify(['query_letter', 'synopsis']),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('QueryTrackerService', () => {
  let client: MCPClient;
  let svc: QueryTrackerService;

  beforeEach(() => {
    client = makeMock();
    svc = new QueryTrackerService(client);
  });

  // ── addQuery() ────────────────────────────────────────────────────────────

  describe('addQuery()', () => {
    it('stores query with a generated id and default status "sent"', async () => {
      const query = await svc.addQuery('proj-1', 'Jane Smith');

      expect(client.writeQuery).toHaveBeenCalledOnce();
      expect(query.id).toBeTruthy();
      expect(query.projectId).toBe('proj-1');
      expect(query.agentName).toBe('Jane Smith');
      expect(query.status).toBe('sent');
    });

    it('defaults queryDate to today\'s ISO date string (YYYY-MM-DD)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const query = await svc.addQuery('proj-1', 'Jane Smith');

      expect(query.queryDate).toBe(today);
    });

    it('uses provided queryDate when supplied', async () => {
      const query = await svc.addQuery('proj-1', 'Jane Smith', {
        queryDate: '2025-03-15',
      });
      expect(query.queryDate).toBe('2025-03-15');
    });

    it('persists agency, materials, and notes when provided', async () => {
      const query = await svc.addQuery('proj-1', 'Jane Smith', {
        agency: 'Big Five Agency',
        materialsSent: ['query_letter', 'synopsis'],
        notes: 'Met at conference',
      });

      expect(query.agency).toBe('Big Five Agency');
      expect(query.materialsSent).toEqual(['query_letter', 'synopsis']);
      expect(query.notes).toBe('Met at conference');
    });

    it('defaults materialsSent to empty array when not provided', async () => {
      const query = await svc.addQuery('proj-1', 'Jane Smith');
      expect(query.materialsSent).toEqual([]);
    });

    it('generates a unique id each time', async () => {
      const q1 = await svc.addQuery('proj-1', 'Agent A');
      const q2 = await svc.addQuery('proj-1', 'Agent B');
      expect(q1.id).not.toBe(q2.id);
    });

    it('trims whitespace from agentName', async () => {
      const query = await svc.addQuery('proj-1', '  Jane Smith  ');
      expect(query.agentName).toBe('Jane Smith');
    });
  });

  // ── listQueries() ─────────────────────────────────────────────────────────

  describe('listQueries()', () => {
    it('returns all queries when no filter is given', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ id: 'q-1' }),
        makeQueryRow({ id: 'q-2', status: 'rejected' }),
      ]);

      const queries = await svc.listQueries('proj-1');
      expect(queries).toHaveLength(2);
    });

    it('returns empty array when no queries exist', async () => {
      const queries = await svc.listQueries('proj-1');
      expect(queries).toEqual([]);
    });

    it('deserialises materials_sent from JSON', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ materials_sent: JSON.stringify(['query_letter', 'synopsis']) }),
      ]);
      const queries = await svc.listQueries('proj-1');
      expect(queries[0].materialsSent).toEqual(['query_letter', 'synopsis']);
    });

    it('passes status filter to the SQL query', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ status: 'rejected' }),
      ]);

      const queries = await svc.listQueries('proj-1', { status: 'rejected' });

      expect(queries).toHaveLength(1);
      expect(queries[0].status).toBe('rejected');

      const [sql, params] = (client.readQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string[]];
      expect(sql).toContain('status = ?');
      expect(params).toContain('rejected');
    });

    it('returns only rejected queries when filtered', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ id: 'q-1', status: 'rejected' }),
      ]);

      const queries = await svc.listQueries('proj-1', { status: 'rejected' });
      expect(queries).toHaveLength(1);
      expect(queries[0].status).toBe('rejected');
    });
  });

  // ── updateQuery() ─────────────────────────────────────────────────────────

  describe('updateQuery()', () => {
    it('calls writeQuery with correct status param', async () => {
      await svc.updateQuery('query-1', { status: 'rejected' });

      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE agent_queries SET');
      expect(sql).toContain('status = ?');
      expect(params).toContain('rejected');
      expect(params).toContain('query-1');
    });

    it('includes response_date when provided', async () => {
      await svc.updateQuery('query-1', {
        status: 'rejected',
        responseDate: '2026-06-01',
      });

      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];
      expect(sql).toContain('response_date = ?');
      expect(params).toContain('2026-06-01');
    });

    it('includes notes when provided', async () => {
      await svc.updateQuery('query-1', { notes: 'Form rejection' });

      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];
      expect(sql).toContain('notes = ?');
      expect(params).toContain('Form rejection');
    });

    it('does not call writeQuery when no fields are provided', async () => {
      await svc.updateQuery('query-1', {});
      expect(client.writeQuery).not.toHaveBeenCalled();
    });
  });

  // ── getStats() ────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns total = 0 and all statuses at 0 when no queries', async () => {
      const stats = await svc.getStats('proj-1');

      expect(stats.total).toBe(0);
      expect(stats.avgResponseDays).toBeNull();
      expect(stats.successRate).toBeNull();

      // Every status should be represented (even at 0)
      const statuses: QueryStatus[] = [
        'sent', 'pending', 'rejected', 'partial_request',
        'full_request', 'offer', 'closed',
      ];
      for (const s of statuses) {
        expect(stats.byStatus[s]).toBe(0);
      }
    });

    it('returns correct byStatus breakdown from mock data', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ id: 'q-1', status: 'sent' }),
        makeQueryRow({ id: 'q-2', status: 'rejected' }),
        makeQueryRow({ id: 'q-3', status: 'rejected' }),
        makeQueryRow({ id: 'q-4', status: 'partial_request' }),
      ]);

      const stats = await svc.getStats('proj-1');

      expect(stats.total).toBe(4);
      expect(stats.byStatus.sent).toBe(1);
      expect(stats.byStatus.rejected).toBe(2);
      expect(stats.byStatus.partial_request).toBe(1);
      expect(stats.byStatus.full_request).toBe(0);
    });

    it('computes successRate = 1/3 when 1 partial_request out of 3 total', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ id: 'q-1', status: 'sent' }),
        makeQueryRow({ id: 'q-2', status: 'rejected' }),
        makeQueryRow({ id: 'q-3', status: 'partial_request' }),
      ]);

      const stats = await svc.getStats('proj-1');

      expect(stats.total).toBe(3);
      expect(stats.successRate).toBeCloseTo(1 / 3, 5);
    });

    it('counts offer and full_request as successes', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ id: 'q-1', status: 'offer' }),
        makeQueryRow({ id: 'q-2', status: 'full_request' }),
        makeQueryRow({ id: 'q-3', status: 'rejected' }),
        makeQueryRow({ id: 'q-4', status: 'rejected' }),
      ]);

      const stats = await svc.getStats('proj-1');
      expect(stats.successRate).toBeCloseTo(2 / 4, 5);
    });

    it('returns avgResponseDays = null when no responses yet', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({ id: 'q-1', status: 'sent', response_date: null }),
        makeQueryRow({ id: 'q-2', status: 'pending', response_date: null }),
      ]);

      const stats = await svc.getStats('proj-1');
      expect(stats.avgResponseDays).toBeNull();
    });

    it('computes avgResponseDays correctly when responses are present', async () => {
      // query_date 2026-01-01, response_date 2026-01-11 → 10 days
      // query_date 2026-01-01, response_date 2026-01-31 → 30 days
      // average: 20 days
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeQueryRow({
          id: 'q-1',
          query_date: '2026-01-01',
          response_date: '2026-01-11',
          status: 'rejected',
        }),
        makeQueryRow({
          id: 'q-2',
          query_date: '2026-01-01',
          response_date: '2026-01-31',
          status: 'rejected',
        }),
      ]);

      const stats = await svc.getStats('proj-1');
      expect(stats.avgResponseDays).toBe(20);
    });
  });
});
