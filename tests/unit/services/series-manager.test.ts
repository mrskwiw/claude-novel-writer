/**
 * Unit tests for SeriesManager — PROC-11
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SeriesManager,
  type Series,
  type SeriesBook,
  type SeriesBibleEntry,
  type CrossBookThread,
} from '../../../project/src/services/series-manager.js';
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

function makeSeriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'series-1',
    title: 'The Chronicles',
    description: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBookRow(overrides: Record<string, unknown> = {}) {
  return {
    series_id: 'series-1',
    project_id: 'proj-1',
    book_number: 1,
    title: 'Book One',
    ...overrides,
  };
}

function makeBibleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bible-1',
    series_id: 'series-1',
    category: 'character',
    entry_key: 'Mira.age_in_book_1',
    value: '23',
    notes: null,
    applies_to_books: '[]',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePromiseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promise-1',
    project_id: 'proj-1',
    title: 'The sealed door mystery',
    status: 'open',
    ...overrides,
  };
}

function makeCanonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'canon-1',
    project_id: 'proj-1',
    subject: 'Mira.age_in_book_1',
    predicate: 'is',
    object: '25',
    description: 'Mira is 25 years old',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SeriesManager', () => {
  let client: MCPClient;
  let mgr: SeriesManager;

  beforeEach(() => {
    client = makeMock();
    mgr = new SeriesManager(client);
  });

  // ── createSeries() ────────────────────────────────────────────────────────

  describe('createSeries()', () => {
    it('stores a series via writeQuery with a generated id', async () => {
      const series = await mgr.createSeries('The Chronicles');

      expect(client.writeQuery).toHaveBeenCalledOnce();
      expect(series.id).toBeTruthy();
      expect(series.title).toBe('The Chronicles');
    });

    it('includes description when provided', async () => {
      const series = await mgr.createSeries('The Chronicles', 'A fantasy epic');

      expect(series.description).toBe('A fantasy epic');

      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO series');
      expect(params).toContain('A fantasy epic');
    });

    it('sets description to undefined when not provided', async () => {
      const series = await mgr.createSeries('The Chronicles');
      expect(series.description).toBeUndefined();
    });

    it('sets createdAt and updatedAt to the same ISO timestamp', async () => {
      const series = await mgr.createSeries('The Chronicles');
      expect(series.createdAt).toBe(series.updatedAt);
      expect(series.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('generates a unique id each time', async () => {
      const s1 = await mgr.createSeries('Series A');
      const s2 = await mgr.createSeries('Series B');
      expect(s1.id).not.toBe(s2.id);
    });
  });

  // ── addBook() ─────────────────────────────────────────────────────────────

  describe('addBook()', () => {
    it('calls writeQuery with correct params', async () => {
      await mgr.addBook('series-1', 'proj-1', 1, 'Book One');

      expect(client.writeQuery).toHaveBeenCalledOnce();
      const [sql, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];

      expect(sql).toContain('INSERT INTO series_books');
      expect(params).toContain('series-1');
      expect(params).toContain('proj-1');
      expect(params).toContain(1);
      expect(params).toContain('Book One');
    });

    it('trims whitespace from book title', async () => {
      await mgr.addBook('series-1', 'proj-1', 1, '  Book One  ');

      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];
      expect(params).toContain('Book One');
    });
  });

  // ── listSeries() ──────────────────────────────────────────────────────────

  describe('listSeries()', () => {
    it('returns all series from readQuery', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeSeriesRow({ id: 's-1', title: 'Alpha' }),
        makeSeriesRow({ id: 's-2', title: 'Beta' }),
      ]);

      const result = await mgr.listSeries();
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Alpha');
      expect(result[1].title).toBe('Beta');
    });

    it('returns empty array when no series exist', async () => {
      const result = await mgr.listSeries();
      expect(result).toEqual([]);
    });
  });

  // ── listBibleEntries() ────────────────────────────────────────────────────

  describe('listBibleEntries()', () => {
    it('returns all entries when no category filter is given', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeBibleRow({ id: 'b-1', category: 'character' }),
        makeBibleRow({ id: 'b-2', category: 'world' }),
      ]);

      const result = await mgr.listBibleEntries('series-1');
      expect(result).toHaveLength(2);
    });

    it('passes category filter to SQL when provided', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeBibleRow({ id: 'b-1', category: 'character' }),
      ]);

      const result = await mgr.listBibleEntries('series-1', 'character');

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('character');

      const [sql, params] = (client.readQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string[]];
      expect(sql).toContain('category = ?');
      expect(params).toContain('character');
    });

    it('returns empty array when no entries exist', async () => {
      const result = await mgr.listBibleEntries('series-1');
      expect(result).toEqual([]);
    });

    it('does NOT include category filter in SQL when not provided', async () => {
      await mgr.listBibleEntries('series-1');

      const [sql] = (client.readQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string[]];
      expect(sql).not.toContain('category = ?');
    });
  });

  // ── addBibleEntry() ───────────────────────────────────────────────────────

  describe('addBibleEntry()', () => {
    it('stores appliesToBooks as a JSON string in the SQL call', async () => {
      await mgr.addBibleEntry('series-1', 'character', 'Mira.age', '23', {
        appliesToBooks: [1, 2],
      });

      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];

      // The JSON-encoded applies_to_books value must be in the params
      expect(params).toContain(JSON.stringify([1, 2]));
    });

    it('stores empty JSON array when appliesToBooks is omitted', async () => {
      await mgr.addBibleEntry('series-1', 'world', 'magic.system', 'elemental');

      const [, params] = (client.writeQuery as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, unknown[]];
      expect(params).toContain('[]');
    });

    it('returns a SeriesBibleEntry with correct fields', async () => {
      const entry = await mgr.addBibleEntry(
        'series-1',
        'theme',
        'main.theme',
        'sacrifice',
        { notes: 'recurs in all books', appliesToBooks: [] }
      );

      expect(entry.seriesId).toBe('series-1');
      expect(entry.category).toBe('theme');
      expect(entry.entryKey).toBe('main.theme');
      expect(entry.value).toBe('sacrifice');
      expect(entry.notes).toBe('recurs in all books');
      expect(entry.appliesToBooks).toEqual([]);
    });

    it('generates a unique id', async () => {
      const e1 = await mgr.addBibleEntry('series-1', 'character', 'k1', 'v1');
      const e2 = await mgr.addBibleEntry('series-1', 'character', 'k2', 'v2');
      expect(e1.id).not.toBe(e2.id);
    });
  });

  // ── trackCrossBookThreads() ───────────────────────────────────────────────

  describe('trackCrossBookThreads()', () => {
    it('returns empty array when series has no books', async () => {
      // First call = getSeriesBooks → empty
      (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const result = await mgr.trackCrossBookThreads('series-1');
      expect(result).toEqual([]);
    });

    it('returns empty array when series has only one book', async () => {
      // getSeriesBooks
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeBookRow({ book_number: 1, project_id: 'proj-1' })])
        // narrative_promises for book 1
        .mockResolvedValueOnce([makePromiseRow()]);

      const result = await mgr.trackCrossBookThreads('series-1');
      expect(result).toEqual([]);
    });

    it('returns CrossBookThread[] from mocked promise data', async () => {
      const sharedTitle = 'The sealed door mystery';

      // getSeriesBooks → 2 books
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          makeBookRow({ book_number: 1, project_id: 'proj-1' }),
          makeBookRow({ book_number: 2, project_id: 'proj-2' }),
        ])
        // promises for book 1 (proj-1)
        .mockResolvedValueOnce([makePromiseRow({ title: sharedTitle, project_id: 'proj-1' })])
        // promises for book 2 (proj-2) — same title, still open
        .mockResolvedValueOnce([makePromiseRow({ title: sharedTitle, project_id: 'proj-2', status: 'developing' })]);

      const result = await mgr.trackCrossBookThreads('series-1');

      expect(result).toHaveLength(1);
      const thread = result[0] as CrossBookThread;
      expect(thread.threadTitle).toBe(sharedTitle);
      expect(thread.openedInBook).toBe(1);
      expect(thread.isOrphan).toBe(true);
    });

    it('does not flag a thread that only appears in one book', async () => {
      // getSeriesBooks → 2 books
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          makeBookRow({ book_number: 1, project_id: 'proj-1' }),
          makeBookRow({ book_number: 2, project_id: 'proj-2' }),
        ])
        // book 1 has an open promise
        .mockResolvedValueOnce([makePromiseRow({ title: 'Book-1-only thread', project_id: 'proj-1' })])
        // book 2 has a different promise
        .mockResolvedValueOnce([makePromiseRow({ title: 'A different promise', project_id: 'proj-2' })]);

      const result = await mgr.trackCrossBookThreads('series-1');
      expect(result).toHaveLength(0);
    });
  });

  // ── checkSeriesConsistency() ──────────────────────────────────────────────

  describe('checkSeriesConsistency()', () => {
    it('returns empty array when no conflicts exist', async () => {
      // getSeriesBooks
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeBookRow()])
        // listBibleEntries → bible says Mira.age_in_book_1 = "23"
        .mockResolvedValueOnce([makeBibleRow()])
        // canon_items for book 1 — description matches bible value
        .mockResolvedValueOnce([
          makeCanonRow({ subject: 'Mira.age_in_book_1', description: 'Mira is 23 years old' }),
        ]);

      const result = await mgr.checkSeriesConsistency('series-1');
      expect(result).toEqual([]);
    });

    it('flags a contradiction when canon description does not contain bible value', async () => {
      // getSeriesBooks
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeBookRow()])
        // listBibleEntries → bible says Mira.age_in_book_1 = "23"
        .mockResolvedValueOnce([makeBibleRow()])
        // canon_items — description says "25", contradicting bible "23"
        .mockResolvedValueOnce([
          makeCanonRow({ subject: 'Mira.age_in_book_1', description: 'Mira is 25 years old' }),
        ]);

      const result = await mgr.checkSeriesConsistency('series-1');
      expect(result).toHaveLength(1);
      expect(result[0].issue).toContain('contradicts');
    });

    it('returns empty array when series has no books', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // getSeriesBooks
        .mockResolvedValueOnce([]); // listBibleEntries

      const result = await mgr.checkSeriesConsistency('series-1');
      expect(result).toEqual([]);
    });

    it('returns empty array when series has no bible entries', async () => {
      (client.readQuery as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeBookRow()]) // getSeriesBooks
        .mockResolvedValueOnce([]); // listBibleEntries — empty

      const result = await mgr.checkSeriesConsistency('series-1');
      expect(result).toEqual([]);
    });
  });
});
