/**
 * Unit tests for KnowledgeRepository (Ticket 004)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeRepository } from '../../../project/src/db/repositories/knowledge-repository.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { KnowledgeObject } from '../../../project/src/types/knowledge.js';

const SCOPE = { appliesTo: 'entire_project' as const };
const SOURCE = { sourceType: 'user_declared' as const };

function makeObj(overrides: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: 'ko-1',
    projectId: 'proj-1',
    type: 'character_profile',
    title: 'Mira',
    structuredData: { age: 30 },
    scope: SCOPE,
    source: SOURCE,
    confidence: 0.9,
    status: 'active',
    contextEligible: true,
    graphEligible: true,
    embeddingEligible: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ko-1',
    project_id: 'proj-1',
    type: 'character_profile',
    title: 'Mira',
    summary: null,
    body: null,
    structured_data: JSON.stringify({ age: 30 }),
    scope: JSON.stringify(SCOPE),
    source: JSON.stringify(SOURCE),
    confidence: 0.9,
    status: 'active',
    context_eligible: 1,
    graph_eligible: 1,
    embedding_eligible: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMock(readResult: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(readResult),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

describe('KnowledgeRepository', () => {
  let client: MCPClient;
  let repo: KnowledgeRepository;

  beforeEach(() => {
    client = makeMock();
    repo = new KnowledgeRepository(client);
  });

  describe('insert()', () => {
    it('calls writeQuery with correct param count', async () => {
      await repo.insert(makeObj());
      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('INSERT INTO knowledge_objects');
      expect(params).toHaveLength(16);
    });

    it('serializes structuredData, scope, and source as JSON strings', async () => {
      await repo.insert(makeObj());
      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params[6]).toBe(JSON.stringify({ age: 30 }));
      expect(params[7]).toBe(JSON.stringify(SCOPE));
      expect(params[8]).toBe(JSON.stringify(SOURCE));
    });

    it('stores contextEligible as 1/0 integers', async () => {
      await repo.insert(makeObj({ contextEligible: true, graphEligible: false }));
      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params[11]).toBe(1); // context_eligible
      expect(params[12]).toBe(0); // graph_eligible
    });

    it('stores null for undefined summary and body', async () => {
      await repo.insert(makeObj({ summary: undefined, body: undefined }));
      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params[4]).toBeNull(); // summary
      expect(params[5]).toBeNull(); // body
    });
  });

  describe('getById()', () => {
    it('returns null when no row found', async () => {
      const result = await repo.getById('missing');
      expect(result).toBeNull();
    });

    it('deserializes JSON fields on return', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow()]);
      const obj = await repo.getById('ko-1');
      expect(obj).not.toBeNull();
      expect(obj?.structuredData).toEqual({ age: 30 });
      expect(obj?.scope).toEqual(SCOPE);
      expect(obj?.source).toEqual(SOURCE);
    });

    it('maps context_eligible integer back to boolean true', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow({ context_eligible: 1 })]);
      const obj = await repo.getById('ko-1');
      expect(obj?.contextEligible).toBe(true);
    });

    it('maps context_eligible = 0 to boolean false', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow({ context_eligible: 0 })]);
      const obj = await repo.getById('ko-1');
      expect(obj?.contextEligible).toBe(false);
    });
  });

  describe('update()', () => {
    it('is a no-op when fields object is empty', async () => {
      await repo.update('ko-1', {});
      expect(client.writeQuery).not.toHaveBeenCalled();
    });

    it('builds correct SET clause for a single field', async () => {
      await repo.update('ko-1', { status: 'archived' });
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('status = ?');
      expect(params).toContain('archived');
      expect(params[params.length - 1]).toBe('ko-1');
    });

    it('serializes structuredData when updating it', async () => {
      await repo.update('ko-1', { structuredData: { foo: 'bar' } });
      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params).toContain(JSON.stringify({ foo: 'bar' }));
    });
  });

  describe('listByType()', () => {
    it('passes projectId and type to readQuery', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await repo.listByType('proj-1', 'canon_item');
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('type = ?'),
        ['proj-1', 'canon_item']
      );
    });

    it('returns deserialized objects', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow(), makeRow({ id: 'ko-2' })]);
      const results = await repo.listByType('proj-1', 'character_profile');
      expect(results).toHaveLength(2);
      expect(results[0].structuredData).toEqual({ age: 30 });
    });
  });

  describe('listByStatus()', () => {
    it('queries by status', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await repo.listByStatus('proj-1', 'draft');
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = ?'),
        ['proj-1', 'draft']
      );
    });
  });

  describe('filterContextEligible()', () => {
    it('queries context_eligible = 1', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await repo.filterContextEligible('proj-1');
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('context_eligible = 1'),
        ['proj-1']
      );
    });
  });

  describe('filterGraphEligible()', () => {
    it('queries graph_eligible = 1', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await repo.filterGraphEligible('proj-1');
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('graph_eligible = 1'),
        ['proj-1']
      );
    });
  });

  describe('search()', () => {
    it('uses LIKE on title, summary, and body', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await repo.search('proj-1', 'archive');
      const [sql, params] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('title LIKE ?');
      expect(sql).toContain('summary LIKE ?');
      expect(sql).toContain('body LIKE ?');
      expect(params).toContain('%archive%');
    });

    it('returns matching deserialized objects', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow({ title: 'Archive Room' })]);
      const results = await repo.search('proj-1', 'archive');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Archive Room');
    });
  });

  describe('upsert()', () => {
    it('calls writeQuery with ON CONFLICT clause', async () => {
      await repo.upsert(makeObj());
      const [sql] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE SET');
    });
  });
});
