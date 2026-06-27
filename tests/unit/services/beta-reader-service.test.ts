/**
 * Unit tests for BetaReaderService — SPEC-11
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BetaReaderService } from '../../../project/src/services/beta-reader-service.js';
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

function makeReaderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reader-1',
    project_id: 'proj-1',
    name: 'Alex',
    email: 'alex@example.com',
    chapters: JSON.stringify(['1-10']),
    status: 'active',
    invited_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeFeedbackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fb-1',
    project_id: 'proj-1',
    reader_id: 'reader-1',
    chapter_id: 3,
    feedback_type: 'pacing',
    note: 'Chapter drags',
    resolved: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('BetaReaderService', () => {
  let client: MCPClient;
  let svc: BetaReaderService;

  beforeEach(() => {
    client = makeMock();
    svc = new BetaReaderService(client);
  });

  // ── addReader() ────────────────────────────────────────────────────────────

  describe('addReader()', () => {
    it('stores reader with generated id via writeQuery', async () => {
      const reader = await svc.addReader('proj-1', 'Alex', {
        email: 'alex@example.com',
        chapters: ['1-10'],
      });

      expect(client.writeQuery).toHaveBeenCalledOnce();
      expect(reader.id).toBeTruthy();
      expect(reader.projectId).toBe('proj-1');
      expect(reader.name).toBe('Alex');
      expect(reader.email).toBe('alex@example.com');
      expect(reader.chapters).toEqual(['1-10']);
      expect(reader.status).toBe('active');
      expect(reader.createdAt).toBeTruthy();
      expect(reader.updatedAt).toBeTruthy();
    });

    it('generates unique ids for different readers', async () => {
      const r1 = await svc.addReader('proj-1', 'Alex');
      const r2 = await svc.addReader('proj-1', 'Jordan');
      expect(r1.id).not.toBe(r2.id);
    });

    it('defaults chapters to empty array when not provided', async () => {
      const reader = await svc.addReader('proj-1', 'Sam');
      expect(reader.chapters).toEqual([]);
    });

    it('trims name whitespace', async () => {
      const reader = await svc.addReader('proj-1', '  Trimmed  ');
      expect(reader.name).toBe('Trimmed');
    });

    it('passes null email to writeQuery when email not provided', async () => {
      await svc.addReader('proj-1', 'NoEmail');
      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[],
      ];
      // email is the 4th param (index 3)
      expect(params[3]).toBeNull();
    });
  });

  // ── listReaders() ──────────────────────────────────────────────────────────

  describe('listReaders()', () => {
    it('returns empty array when no readers exist', async () => {
      const readers = await svc.listReaders('proj-1');
      expect(readers).toEqual([]);
    });

    it('returns deserialized readers from the database', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeReaderRow(),
      ]);
      const readers = await svc.listReaders('proj-1');
      expect(readers).toHaveLength(1);
      expect(readers[0].name).toBe('Alex');
      expect(readers[0].chapters).toEqual(['1-10']);
      expect(readers[0].status).toBe('active');
    });

    it('parses chapters from JSON string stored in DB', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeReaderRow({ chapters: JSON.stringify(['1', '2', '3']) }),
      ]);
      const readers = await svc.listReaders('proj-1');
      expect(readers[0].chapters).toEqual(['1', '2', '3']);
    });
  });

  // ── addFeedback() ──────────────────────────────────────────────────────────

  describe('addFeedback()', () => {
    it('resolves reader by name before inserting', async () => {
      // First readQuery call returns the reader lookup, second (if any) is for insert
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 'reader-1' },
      ]);

      const feedback = await svc.addFeedback('proj-1', 'Alex', 3, 'pacing', 'Drags in the middle');

      // readQuery was called to look up the reader by name
      expect(client.readQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('beta_readers');
      expect(params).toContain('proj-1');
      expect(params).toContain('Alex');

      // writeQuery was called to insert the feedback
      expect(client.writeQuery).toHaveBeenCalledOnce();
      expect(feedback.readerId).toBe('reader-1');
      expect(feedback.feedbackType).toBe('pacing');
      expect(feedback.note).toBe('Drags in the middle');
      expect(feedback.resolved).toBe(false);
      expect(feedback.chapterId).toBe(3);
    });

    it('throws if reader not found (unknown name)', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await expect(
        svc.addFeedback('proj-1', 'Unknown Reader', undefined, 'clarity', 'Good')
      ).rejects.toThrow('Beta reader not found: "Unknown Reader"');

      // writeQuery should NOT have been called
      expect(client.writeQuery).not.toHaveBeenCalled();
    });

    it('sets chapterId to undefined when not provided', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 'reader-1' },
      ]);

      const feedback = await svc.addFeedback('proj-1', 'Alex', undefined, 'other', 'General note');
      expect(feedback.chapterId).toBeUndefined();
    });

    it('generates a unique id for each feedback', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ id: 'reader-1' }])
        .mockResolvedValueOnce([{ id: 'reader-1' }]);

      const fb1 = await svc.addFeedback('proj-1', 'Alex', 1, 'pacing', 'Note 1');
      const fb2 = await svc.addFeedback('proj-1', 'Alex', 2, 'character', 'Note 2');
      expect(fb1.id).not.toBe(fb2.id);
    });
  });

  // ── generateReport() ───────────────────────────────────────────────────────

  describe('generateReport()', () => {
    it('returns correct byType counts from mock data', async () => {
      // listReaders returns 2 readers
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeReaderRow(), makeReaderRow({ id: 'reader-2', name: 'Jordan' })])
        // listFeedback returns 3 feedback items
        .mockResolvedValueOnce([
          makeFeedbackRow({ feedback_type: 'pacing' }),
          makeFeedbackRow({ id: 'fb-2', feedback_type: 'character' }),
          makeFeedbackRow({ id: 'fb-3', feedback_type: 'pacing' }),
        ]);

      const report = await svc.generateReport('proj-1');

      expect(report.totalReaders).toBe(2);
      expect(report.totalFeedback).toBe(3);
      expect(report.byType['pacing']).toBe(2);
      expect(report.byType['character']).toBe(1);
      // Types with no feedback should have count 0
      expect(report.byType['plot']).toBe(0);
      expect(report.byType['clarity']).toBe(0);
      expect(report.byType['emotion']).toBe(0);
      expect(report.byType['other']).toBe(0);
    });

    it('returns correct unresolved count', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeReaderRow()])
        .mockResolvedValueOnce([
          makeFeedbackRow({ resolved: 0 }),
          makeFeedbackRow({ id: 'fb-2', resolved: 1 }),
          makeFeedbackRow({ id: 'fb-3', resolved: 0 }),
        ]);

      const report = await svc.generateReport('proj-1');
      expect(report.unresolved).toBe(2);
    });

    it('aggregates byChapter correctly', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeReaderRow()])
        .mockResolvedValueOnce([
          makeFeedbackRow({ chapter_id: 1, feedback_type: 'pacing' }),
          makeFeedbackRow({ id: 'fb-2', chapter_id: 1, feedback_type: 'character' }),
          makeFeedbackRow({ id: 'fb-3', chapter_id: 2, feedback_type: 'plot' }),
        ]);

      const report = await svc.generateReport('proj-1');
      expect(report.byChapter[1].count).toBe(2);
      expect(report.byChapter[1].types['pacing']).toBe(1);
      expect(report.byChapter[1].types['character']).toBe(1);
      expect(report.byChapter[2].count).toBe(1);
      expect(report.byChapter[2].types['plot']).toBe(1);
    });

    it('returns zero counts when there is no feedback', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const report = await svc.generateReport('proj-1');
      expect(report.totalReaders).toBe(0);
      expect(report.totalFeedback).toBe(0);
      expect(report.unresolved).toBe(0);
      expect(Object.keys(report.byChapter)).toHaveLength(0);
    });
  });

  // ── resolveFeedback() ──────────────────────────────────────────────────────

  describe('resolveFeedback()', () => {
    it('calls writeQuery with resolved=1 and the correct id', async () => {
      await svc.resolveFeedback('fb-abc');

      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('beta_feedback');
      expect(sql).toContain('resolved = 1');
      expect(params).toContain('fb-abc');
    });
  });
});
