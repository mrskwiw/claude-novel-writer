/**
 * SeriesManager — PROC-11
 *
 * Groups multiple novel projects into a series, with a shared bible and
 * cross-book thread tracking.  All persistence is via MCPClient SQL queries
 * against the `series`, `series_books`, and `series_bible` tables created by
 * migration 014_series.
 */

import type { MCPClient } from '../core/database.js';
import { generateId } from '../utils/ids.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Series {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesBook {
  seriesId: string;
  projectId: string;
  bookNumber: number;
  title: string;
}

export interface SeriesBibleEntry {
  id: string;
  seriesId: string;
  /** e.g. 'character' | 'world' | 'timeline' | 'theme' | 'other' */
  category: string;
  entryKey: string;
  value: string;
  notes?: string;
  /** book numbers the entry applies to; empty array = all books */
  appliesToBooks: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CrossBookThread {
  threadTitle: string;
  openedInBook: number;
  openedInProject: string;
  resolvedInBook?: number;
  /** true when the promise is open across > 1 book with no resolution */
  isOrphan: boolean;
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface SeriesRow {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface SeriesBookRow {
  series_id: string;
  project_id: string;
  book_number: number;
  title: string;
}

interface SeriesBibleRow {
  id: string;
  series_id: string;
  category: string;
  entry_key: string;
  value: string;
  notes: string | null;
  applies_to_books: string;
  created_at: string;
  updated_at: string;
}

interface NarrativePromiseRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
}

interface CanonItemRow {
  id: string;
  project_id: string;
  subject: string;
  predicate: string;
  object: string | null;
  description: string;
}

// ── row → domain mappers ──────────────────────────────────────────────────────

function rowToSeries(row: SeriesRow): Series {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToBook(row: SeriesBookRow): SeriesBook {
  return {
    seriesId: row.series_id,
    projectId: row.project_id,
    bookNumber: row.book_number,
    title: row.title,
  };
}

function rowToBibleEntry(row: SeriesBibleRow): SeriesBibleEntry {
  let appliesToBooks: number[] = [];
  try {
    appliesToBooks = JSON.parse(row.applies_to_books) as number[];
  } catch {
    appliesToBooks = [];
  }
  return {
    id: row.id,
    seriesId: row.series_id,
    category: row.category,
    entryKey: row.entry_key,
    value: row.value,
    notes: row.notes ?? undefined,
    appliesToBooks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SeriesManager {
  constructor(private readonly client: MCPClient) {}

  /**
   * Create a new series record.
   *
   * @param title       - Series title (required)
   * @param description - Optional description / elevator pitch
   * @returns           The persisted Series record
   */
  async createSeries(title: string, description?: string): Promise<Series> {
    const now = new Date().toISOString();
    const series: Series = {
      id: generateId(),
      title: title.trim(),
      description: description?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    await this.client.writeQuery(
      `INSERT INTO series (id, title, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [series.id, series.title, series.description ?? null, series.createdAt, series.updatedAt]
    );

    return series;
  }

  /**
   * Associate a novel project with a series at a specific book number.
   *
   * @param seriesId   - The owning series id
   * @param projectId  - The novel project id to attach
   * @param bookNumber - Ordinal position within the series (1-based)
   * @param title      - Display title for this book entry
   */
  async addBook(
    seriesId: string,
    projectId: string,
    bookNumber: number,
    title: string
  ): Promise<void> {
    await this.client.writeQuery(
      `INSERT INTO series_books (series_id, project_id, book_number, title)
       VALUES (?, ?, ?, ?)`,
      [seriesId, projectId, bookNumber, title.trim()]
    );
  }

  /**
   * Return all series records, ordered by title.
   */
  async listSeries(): Promise<Series[]> {
    const rows = (await this.client.readQuery(
      'SELECT * FROM series ORDER BY title ASC'
    )) as SeriesRow[];
    return rows.map(rowToSeries);
  }

  /**
   * Return all books belonging to a series, ordered by book number.
   *
   * @param seriesId - The target series id
   */
  async getSeriesBooks(seriesId: string): Promise<SeriesBook[]> {
    const rows = (await this.client.readQuery(
      'SELECT * FROM series_books WHERE series_id = ? ORDER BY book_number ASC',
      [seriesId]
    )) as SeriesBookRow[];
    return rows.map(rowToBook);
  }

  /**
   * Add a series-bible entry.  If an entry with the same (series_id, category,
   * entry_key) already exists it is replaced via INSERT OR REPLACE.
   *
   * @param seriesId   - Owning series id
   * @param category   - Logical grouping: 'character' | 'world' | 'timeline' | 'theme' | 'other'
   * @param entryKey   - Dotted key, e.g. "Mira.age_in_book_1"
   * @param value      - The canonical value string
   * @param opts       - Optional notes and book-number applicability list
   * @returns          The persisted SeriesBibleEntry
   */
  async addBibleEntry(
    seriesId: string,
    category: string,
    entryKey: string,
    value: string,
    opts: { notes?: string; appliesToBooks?: number[] } = {}
  ): Promise<SeriesBibleEntry> {
    const now = new Date().toISOString();
    const entry: SeriesBibleEntry = {
      id: generateId(),
      seriesId,
      category: category.trim(),
      entryKey: entryKey.trim(),
      value: value.trim(),
      notes: opts.notes?.trim(),
      appliesToBooks: opts.appliesToBooks ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await this.client.writeQuery(
      `INSERT OR REPLACE INTO series_bible
         (id, series_id, category, entry_key, value, notes, applies_to_books, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.seriesId,
        entry.category,
        entry.entryKey,
        entry.value,
        entry.notes ?? null,
        JSON.stringify(entry.appliesToBooks),
        entry.createdAt,
        entry.updatedAt,
      ]
    );

    return entry;
  }

  /**
   * List series-bible entries, optionally filtered by category.
   *
   * @param seriesId  - Owning series id
   * @param category  - Optional category filter
   * @returns         Matching entries ordered by category, entry_key
   */
  async listBibleEntries(
    seriesId: string,
    category?: string
  ): Promise<SeriesBibleEntry[]> {
    let sql = 'SELECT * FROM series_bible WHERE series_id = ?';
    const params: string[] = [seriesId];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category ASC, entry_key ASC';

    const rows = (await this.client.readQuery(sql, params)) as SeriesBibleRow[];
    return rows.map(rowToBibleEntry);
  }

  /**
   * Return cross-book threads: narrative promises that remain open across books.
   *
   * Algorithm:
   * 1. Load all books for the series ordered by book_number.
   * 2. For each book, query `narrative_promises` for open/developing promises.
   * 3. A promise is a cross-book thread if its title also appeared as open/developing
   *    in the previous book (title-based heuristic).
   * 4. Promises that appear open in book N but were also open in book N-1 are flagged
   *    as "orphan" threads.
   *
   * @param seriesId - The target series id
   * @returns        Array of cross-book threads (may be empty)
   */
  async trackCrossBookThreads(seriesId: string): Promise<CrossBookThread[]> {
    const books = await this.getSeriesBooks(seriesId);
    if (books.length === 0) return [];

    // Collect open promise titles per book (book_number → Set<title>)
    const openByBook = new Map<number, { title: string; projectId: string }[]>();

    for (const book of books) {
      const rows = (await this.client.readQuery(
        `SELECT id, project_id, title, status
         FROM narrative_promises
         WHERE project_id = ?
           AND (status = 'open' OR status = 'developing')`,
        [book.projectId]
      )) as NarrativePromiseRow[];

      openByBook.set(
        book.bookNumber,
        rows.map((r) => ({ title: r.title, projectId: r.project_id }))
      );
    }

    // Find threads that span multiple books
    const threads: CrossBookThread[] = [];

    for (let i = 1; i < books.length; i++) {
      const prevBook = books[i - 1];
      const currBook = books[i];

      const prevTitles = new Set(
        (openByBook.get(prevBook.bookNumber) ?? []).map((p) => p.title)
      );
      const currOpen = openByBook.get(currBook.bookNumber) ?? [];

      for (const promise of currOpen) {
        if (prevTitles.has(promise.title)) {
          // This promise was open in the previous book AND still open now → orphan
          threads.push({
            threadTitle: promise.title,
            openedInBook: prevBook.bookNumber,
            openedInProject: prevBook.projectId,
            resolvedInBook: undefined,
            isOrphan: true,
          });
        }
      }
    }

    return threads;
  }

  /**
   * Compare series-bible entries against each book's `canon_items` to flag
   * contradictions: same key, different value.
   *
   * The comparison key is derived from the `subject` field of each canon item.
   * A contradiction is raised when `canon_items.subject` === `series_bible.entry_key`
   * and the canon item's description does not include the bible value.
   *
   * @param seriesId - The target series id
   * @returns        Array of consistency issues (may be empty)
   */
  async checkSeriesConsistency(
    seriesId: string
  ): Promise<Array<{ issue: string; book1: string; book2: string }>> {
    const [books, bibleEntries] = await Promise.all([
      this.getSeriesBooks(seriesId),
      this.listBibleEntries(seriesId),
    ]);

    if (books.length === 0 || bibleEntries.length === 0) return [];

    // Build a lookup: entryKey → value (from the series bible)
    const bibleMap = new Map<string, string>(
      bibleEntries.map((e) => [e.entryKey, e.value])
    );

    const issues: Array<{ issue: string; book1: string; book2: string }> = [];

    for (const book of books) {
      const rows = (await this.client.readQuery(
        `SELECT id, project_id, subject, predicate, object, description
         FROM canon_items
         WHERE project_id = ?`,
        [book.projectId]
      )) as CanonItemRow[];

      for (const row of rows) {
        const bibleValue = bibleMap.get(row.subject);
        if (bibleValue === undefined) continue; // No bible entry for this subject

        // Flag if the canon description does not contain the bible value (case-insensitive)
        if (!row.description.toLowerCase().includes(bibleValue.toLowerCase())) {
          issues.push({
            issue: `Canon item "${row.subject}" in book ${book.bookNumber} contradicts series bible value "${bibleValue}" (found: "${row.description}")`,
            book1: `series-bible`,
            book2: `book-${book.bookNumber} (project ${book.projectId})`,
          });
        }
      }
    }

    return issues;
  }
}
