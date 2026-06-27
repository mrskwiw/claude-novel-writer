/**
 * Unit tests for KnowledgeService (Ticket 005)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeService } from '../../../project/src/services/knowledge-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';

const SCOPE = { appliesTo: 'entire_project' as const };
const SOURCE = { sourceType: 'user_declared' as const };

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ko-1',
    project_id: 'proj-1',
    type: 'character_profile',
    title: 'Mira',
    summary: null,
    body: null,
    structured_data: JSON.stringify({}),
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

describe('KnowledgeService', () => {
  let client: MCPClient;
  let svc: KnowledgeService;

  beforeEach(() => {
    client = makeMock();
    svc = new KnowledgeService(client);
  });

  describe('create()', () => {
    it('returns null and validation errors when projectId is missing', async () => {
      const { object, validation } = await svc.create({
        projectId: '',
        type: 'character_profile',
        title: 'Mira',
        structuredData: {},
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.9,
        status: 'active',
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(object).toBeNull();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('projectId is required');
    });

    it('returns null when type is missing', async () => {
      const { object, validation } = await svc.create({
        projectId: 'proj-1',
        type: '' as never,
        title: 'Mira',
        structuredData: {},
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.9,
        status: 'active',
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(object).toBeNull();
      expect(validation.errors).toContain('type is required');
    });

    it('returns null when title is empty', async () => {
      const { object, validation } = await svc.create({
        projectId: 'proj-1',
        type: 'character_profile',
        title: '   ',
        structuredData: {},
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.9,
        status: 'active',
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(object).toBeNull();
      expect(validation.errors).toContain('title is required');
    });

    it('rejects confidence outside 0–1', async () => {
      const { validation } = await svc.create({
        projectId: 'proj-1',
        type: 'character_profile',
        title: 'Mira',
        structuredData: {},
        scope: SCOPE,
        source: SOURCE,
        confidence: 1.5,
        status: 'active',
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('confidence'))).toBe(true);
    });

    it('rejects invalid status', async () => {
      const { validation } = await svc.create({
        projectId: 'proj-1',
        type: 'character_profile',
        title: 'Mira',
        structuredData: {},
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.9,
        status: 'unknown' as never,
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('status'))).toBe(true);
    });

    it('creates object with generated id and returns it', async () => {
      const { object, validation } = await svc.create({
        projectId: 'proj-1',
        type: 'character_profile',
        title: '  Mira  ',
        structuredData: { age: 30 },
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.9,
        status: 'active',
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(validation.valid).toBe(true);
      expect(object).not.toBeNull();
      expect(object?.id).toBeTruthy();
      expect(object?.title).toBe('Mira'); // trimmed
      expect(client.writeQuery).toHaveBeenCalledOnce();
    });

    it('uses provided id when given', async () => {
      const { object } = await svc.create({
        id: 'custom-id',
        projectId: 'proj-1',
        type: 'character_profile',
        title: 'Mira',
        structuredData: {},
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.9,
        status: 'active',
        contextEligible: true,
        graphEligible: true,
        embeddingEligible: false,
      });
      expect(object?.id).toBe('custom-id');
    });

    it('defaults structuredData to {} when not provided', async () => {
      const { object } = await svc.create({
        projectId: 'proj-1',
        type: 'research_note',
        title: 'Note',
        structuredData: undefined as never,
        scope: SCOPE,
        source: SOURCE,
        confidence: 0.8,
        status: 'draft',
        contextEligible: false,
        graphEligible: false,
        embeddingEligible: false,
      });
      expect(object?.structuredData).toEqual({});
    });
  });

  describe('getById()', () => {
    it('returns null for missing id', async () => {
      const result = await svc.getById('missing');
      expect(result).toBeNull();
    });

    it('returns deserialized object when found', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow()]);
      const obj = await svc.getById('ko-1');
      expect(obj?.id).toBe('ko-1');
      expect(obj?.scope).toEqual(SCOPE);
    });
  });

  describe('update()', () => {
    it('rejects empty title', async () => {
      const result = await svc.update('ko-1', { title: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('title'))).toBe(true);
    });

    it('rejects out-of-range confidence', async () => {
      const result = await svc.update('ko-1', { confidence: -0.1 });
      expect(result.valid).toBe(false);
    });

    it('returns valid and calls writeQuery for valid fields', async () => {
      const result = await svc.update('ko-1', { status: 'archived' });
      expect(result.valid).toBe(true);
      expect(client.writeQuery).toHaveBeenCalledOnce();
    });
  });

  describe('listByType()', () => {
    it('delegates to repository', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow()]);
      const results = await svc.listByType('proj-1', 'character_profile');
      expect(results).toHaveLength(1);
    });
  });

  describe('listByStatus()', () => {
    it('returns objects with matching status', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow({ status: 'draft' })]);
      const results = await svc.listByStatus('proj-1', 'draft');
      expect(results[0].status).toBe('draft');
    });
  });

  describe('filterContextEligible()', () => {
    it('returns only context-eligible objects', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow()]);
      const results = await svc.filterContextEligible('proj-1');
      expect(results.every(o => o.contextEligible)).toBe(true);
    });
  });

  describe('filterGraphEligible()', () => {
    it('delegates to repository graph-eligible query', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await svc.filterGraphEligible('proj-1');
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('graph_eligible = 1'),
        ['proj-1']
      );
    });
  });

  describe('filterEmbeddingEligible()', () => {
    it('delegates to repository embedding-eligible query', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      await svc.filterEmbeddingEligible('proj-1');
      expect(client.readQuery).toHaveBeenCalledWith(
        expect.stringContaining('embedding_eligible = 1'),
        ['proj-1']
      );
    });
  });

  describe('search()', () => {
    it('returns matching objects', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([makeRow({ title: 'Archive Door' })]);
      const results = await svc.search('proj-1', 'archive');
      expect(results[0].title).toBe('Archive Door');
    });
  });
});
