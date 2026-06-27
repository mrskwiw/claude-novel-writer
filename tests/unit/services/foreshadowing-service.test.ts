/**
 * Unit tests for ForeshadowingService — PROC-03
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForeshadowingService } from '../../../project/src/services/foreshadowing-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMock(readResult: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(readResult),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

function makeForeshadowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fs-1',
    project_id: 'proj-1',
    chapter_id: 2,
    scene_id: null,
    content: 'The red scarf will mean something later',
    payoff_chapter_id: null,
    status: 'planted',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ForeshadowingService', () => {
  let client: MCPClient;
  let svc: ForeshadowingService;

  beforeEach(() => {
    client = makeMock();
    svc = new ForeshadowingService(client);
  });

  // ── add() ─────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('stores note with a generated id and returns the ForeshadowingNote', async () => {
      const note = await svc.add('proj-1', 'The red scarf will mean something later', {
        chapterId: 2,
      });

      expect(client.writeQuery).toHaveBeenCalledOnce();
      expect(note.id).toBeTruthy();
      expect(typeof note.id).toBe('string');
      expect(note.projectId).toBe('proj-1');
      expect(note.content).toBe('The red scarf will mean something later');
      expect(note.chapterId).toBe(2);
      expect(note.status).toBe('planted');
      expect(note.createdAt).toBeTruthy();
      expect(note.updatedAt).toBeTruthy();
    });

    it('generates a unique id each call', async () => {
      const n1 = await svc.add('proj-1', 'Note A');
      const n2 = await svc.add('proj-1', 'Note B');
      expect(n1.id).not.toBe(n2.id);
    });

    it('trims content whitespace', async () => {
      const note = await svc.add('proj-1', '  spaced content  ');
      expect(note.content).toBe('spaced content');
    });

    it('uses INSERT query containing the correct table name', async () => {
      await svc.add('proj-1', 'A planted seed');
      const callArg = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callArg).toMatch(/INSERT INTO foreshadowing_notes/i);
    });

    it('sets payoffChapterId to undefined when not supplied', async () => {
      const note = await svc.add('proj-1', 'A clue');
      expect(note.payoffChapterId).toBeUndefined();
    });
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns all notes when no status filter is provided', async () => {
      const rows = [
        makeForeshadowRow({ status: 'planted' }),
        makeForeshadowRow({ id: 'fs-2', status: 'paid_off', payoff_chapter_id: 10 }),
      ];
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rows);

      const notes = await svc.list('proj-1');

      expect(notes).toHaveLength(2);
      expect(notes[0].status).toBe('planted');
      expect(notes[1].status).toBe('paid_off');
      expect(notes[1].payoffChapterId).toBe(10);
    });

    it('passes status filter to readQuery when provided', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeForeshadowRow({ status: 'planted' }),
      ]);

      const notes = await svc.list('proj-1', 'planted');

      expect(notes).toHaveLength(1);
      expect(notes[0].status).toBe('planted');

      // Verify that the SQL query included the status filter parameter
      const callArgs = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1]).toContain('planted');
    });

    it('returns empty array when no notes exist', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const notes = await svc.list('proj-1');
      expect(notes).toEqual([]);
    });

    it('maps null chapter_id to undefined', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeForeshadowRow({ chapter_id: null }),
      ]);

      const notes = await svc.list('proj-1');
      expect(notes[0].chapterId).toBeUndefined();
    });
  });

  // ── markPaidOff() ─────────────────────────────────────────────────────────

  describe('markPaidOff()', () => {
    it('updates status to paid_off and sets payoffChapterId', async () => {
      await svc.markPaidOff('fs-1', 15);

      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toMatch(/UPDATE foreshadowing_notes/i);
      expect(sql).toMatch(/paid_off/i);
      expect(params).toContain(15);
      expect(params).toContain('fs-1');
    });

    it('sets payoff_chapter_id to null when not supplied', async () => {
      await svc.markPaidOff('fs-1');

      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      // payoffChapterId param should be null
      expect(params[0]).toBeNull();
    });
  });

  // ── listForgotten() ───────────────────────────────────────────────────────

  describe('listForgotten()', () => {
    it('calls readQuery with planted status filter', async () => {
      // First call: planted notes; second call: max chapter query
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeForeshadowRow({ chapter_id: 1 })])
        .mockResolvedValueOnce([{ max_chapter: 10 }]);

      await svc.listForgotten('proj-1');

      const firstCall = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(firstCall[0]).toMatch(/status = 'planted'/i);
    });

    it('returns notes planted more than 5 chapters before the current chapter', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          makeForeshadowRow({ id: 'old', chapter_id: 1 }),  // planted 9 chapters ago → forgotten
          makeForeshadowRow({ id: 'new', chapter_id: 7 }),  // planted 3 chapters ago → not forgotten
        ])
        .mockResolvedValueOnce([{ max_chapter: 10 }]);

      const forgotten = await svc.listForgotten('proj-1');

      expect(forgotten).toHaveLength(1);
      expect(forgotten[0].id).toBe('old');
    });

    it('returns empty array when no notes are planted far enough back', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeForeshadowRow({ chapter_id: 8 })])
        .mockResolvedValueOnce([{ max_chapter: 10 }]);

      const forgotten = await svc.listForgotten('proj-1');
      expect(forgotten).toHaveLength(0);
    });

    it('excludes notes with no chapter_id from forgotten list', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeForeshadowRow({ chapter_id: null })])
        .mockResolvedValueOnce([{ max_chapter: 10 }]);

      const forgotten = await svc.listForgotten('proj-1');
      expect(forgotten).toHaveLength(0);
    });
  });
});
