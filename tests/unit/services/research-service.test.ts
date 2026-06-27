/**
 * Unit tests for ResearchService — SPEC-04
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResearchService } from '../../../project/src/services/research-service.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMock(readResult: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(readResult),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 1 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

function makeNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    project_id: 'proj-1',
    title: 'Victorian London',
    url: 'https://example.com',
    notes: 'General reference',
    tags: JSON.stringify(['history', 'setting']),
    verified: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ResearchService', () => {
  let client: MCPClient;
  let svc: ResearchService;

  beforeEach(() => {
    client = makeMock();
    svc = new ResearchService(client);
  });

  // ── add() ──────────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('calls writeQuery and returns a ResearchNote with a generated id', async () => {
      const note = await svc.add('proj-1', 'Victorian London', {
        url: 'https://example.com',
        tags: ['history'],
      });

      expect(client.writeQuery).toHaveBeenCalledOnce();
      expect(note.id).toBeTruthy();
      expect(note.projectId).toBe('proj-1');
      expect(note.title).toBe('Victorian London');
      expect(note.url).toBe('https://example.com');
      expect(note.tags).toEqual(['history']);
      expect(note.verified).toBe(false);
      expect(note.createdAt).toBeTruthy();
      expect(note.updatedAt).toBeTruthy();
    });

    it('generates a unique id each time', async () => {
      const n1 = await svc.add('proj-1', 'Note A');
      const n2 = await svc.add('proj-1', 'Note B');
      expect(n1.id).not.toBe(n2.id);
    });

    it('defaults tags to empty array when not provided', async () => {
      const note = await svc.add('proj-1', 'Minimal Note');
      expect(note.tags).toEqual([]);
    });

    it('trims title whitespace', async () => {
      const note = await svc.add('proj-1', '  Trimmed  ');
      expect(note.title).toBe('Trimmed');
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns empty array when no notes exist', async () => {
      const notes = await svc.list('proj-1');
      expect(notes).toEqual([]);
    });

    it('returns deserialized notes from the database', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeNoteRow(),
      ]);
      const notes = await svc.list('proj-1');
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Victorian London');
      expect(notes[0].tags).toEqual(['history', 'setting']);
    });

    it('filters by tag when provided', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeNoteRow({ tags: JSON.stringify(['history']) }),
        makeNoteRow({ id: 'note-2', tags: JSON.stringify(['magic']) }),
      ]);
      const notes = await svc.list('proj-1', 'history');
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('note-1');
    });
  });

  // ── markVerified() ─────────────────────────────────────────────────────────

  describe('markVerified()', () => {
    it('calls writeQuery with verified=1 for the given id', async () => {
      await svc.markVerified('note-1');

      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE research_notes SET');
      expect(params).toContain(1);   // verified = 1
      expect(params).toContain('note-1');
    });
  });

  // ── findVerifyMarkers() ───────────────────────────────────────────────────

  describe('findVerifyMarkers()', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'novel-test-'));
      await mkdir(join(tmpDir, 'chapters'));
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it('finds all [VERIFY:] patterns with correct line numbers', async () => {
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-01.md'),
        [
          '# Chapter One',
          '',
          'She wore a dress common in [VERIFY: 1880s London fashion].',
          'The carriage cost [VERIFY: typical fare for a hansom cab].',
          '',
          'End of chapter.',
        ].join('\n'),
        'utf-8'
      );

      const marks = await svc.findVerifyMarkers(tmpDir);

      expect(marks).toHaveLength(2);
      expect(marks[0].claim).toBe('1880s London fashion');
      expect(marks[0].lineNumber).toBe(3);
      expect(marks[0].chapterFilename).toBe('chapter-01.md');

      expect(marks[1].claim).toBe('typical fare for a hansom cab');
      expect(marks[1].lineNumber).toBe(4);
    });

    it('does not match markers inside code fences', async () => {
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-02.md'),
        [
          '# Chapter Two',
          '',
          'Normal text [VERIFY: outside fence] here.',
          '```',
          'This [VERIFY: inside fence] should be skipped.',
          '```',
          'Back to normal [VERIFY: after fence].',
        ].join('\n'),
        'utf-8'
      );

      const marks = await svc.findVerifyMarkers(tmpDir);

      expect(marks).toHaveLength(2);
      expect(marks.map((m) => m.claim)).toContain('outside fence');
      expect(marks.map((m) => m.claim)).toContain('after fence');
      expect(marks.map((m) => m.claim)).not.toContain('inside fence');
    });

    it('returns empty array when chapters directory does not exist', async () => {
      const noChaptersDir = join(tmpDir, 'no-chapters-here');
      const marks = await svc.findVerifyMarkers(noChaptersDir);
      expect(marks).toEqual([]);
    });

    it('returns empty array when no markers exist in any chapter', async () => {
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-01.md'),
        '# Chapter One\n\nNo markers here.\n',
        'utf-8'
      );
      const marks = await svc.findVerifyMarkers(tmpDir);
      expect(marks).toEqual([]);
    });

    it('with chapterFilter only scans that chapter file', async () => {
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-01.md'),
        '# Chapter One\n\n[VERIFY: claim in chapter one]\n',
        'utf-8'
      );
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-02.md'),
        '# Chapter Two\n\n[VERIFY: claim in chapter two]\n',
        'utf-8'
      );

      // Only scan chapter 2
      const marks = await svc.findVerifyMarkers(tmpDir, 2);

      expect(marks).toHaveLength(1);
      expect(marks[0].claim).toBe('claim in chapter two');
      expect(marks[0].chapterFilename).toBe('chapter-02.md');
    });

    it('includes the full line as context', async () => {
      const line = 'She wore a dress. [VERIFY: 1880s fashion]';
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-01.md'),
        `# Chapter One\n\n${line}\n`,
        'utf-8'
      );

      const marks = await svc.findVerifyMarkers(tmpDir);
      expect(marks[0].context).toBe(line);
    });

    it('handles tilde code fences as well as backtick fences', async () => {
      await writeFile(
        join(tmpDir, 'chapters', 'chapter-01.md'),
        [
          '# Chapter',
          '~~~',
          '[VERIFY: inside tilde fence]',
          '~~~',
          '[VERIFY: outside tilde fence]',
        ].join('\n'),
        'utf-8'
      );

      const marks = await svc.findVerifyMarkers(tmpDir);
      expect(marks).toHaveLength(1);
      expect(marks[0].claim).toBe('outside tilde fence');
    });
  });
});
