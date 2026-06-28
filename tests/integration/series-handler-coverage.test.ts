/**
 * Coverage tests for series-handler.ts
 *
 * Exercises handleSeriesCommand routing and every subcommand handler:
 * create, add-book, list, bible add/list, threads, check, plus validation and
 * error/catch paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import { handleSeriesCommand } from '../../project/src/cli/handlers/series-handler.js';
import type { SeriesManager } from '../../project/src/services/series-manager.js';

function createMockOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: (data) => log.push(`TABLE: ${data.length}`),
    list: () => log.push('LIST'),
    section: (t) => log.push(`SECTION: ${t}`),
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

async function retryRm(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'series',
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

const found = (log: string[], needle: string) => log.find((l) => l.includes(needle));

describe('series-handler coverage', () => {
  let dir: string;
  let extension: TestNovelWriterExtension;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'series-cov-'));
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Series Novel',
      author: 'Author',
      genre: 'Epic',
      targetWordCount: 100000,
    });
  });

  afterEach(async () => {
    extension.cleanup();
    await retryRm(dir);
  });

  const ext = () => extension as any;
  const mgr = (): SeriesManager => (extension as any).getSeriesManager();
  const client = () => (extension as any).mcpClient;

  /** Create a series via the handler and return its id. */
  async function createSeries(title = 'The Mira Chronicles'): Promise<string> {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['create'], flags: { title } }),
      dir,
      output,
      ext()
    );
    const line = found(log, 'Series created:');
    return line!.replace('SUCCESS: Series created: ', '').trim();
  }

  // ── routing / unknown ───────────────────────────────────────────────────

  it('unknown subcommand prints help', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['bogus'] }), dir, output, ext());
    expect(found(log, 'Unknown series subcommand')).toBeDefined();
    expect(found(log, 'Available subcommands')).toBeDefined();
  });

  // ── create ──────────────────────────────────────────────────────────────

  it('create: requires a title', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['create'] }), dir, output, ext());
    expect(found(log, 'Please provide a series title')).toBeDefined();
  });

  it('create: success with description', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['create'], flags: { title: 'Saga', description: 'An epic' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Series created:')).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('create: catch path when no extension', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['create'], flags: { title: 'Saga' } }),
      dir,
      output,
      undefined
    );
    expect(found(log, 'Failed to create series')).toBeDefined();
  });

  // ── add-book ──────────────────────────────────────────────────────────────

  it('add-book: requires series id', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['add-book'], flags: { book: 1, title: 'B1' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Please provide a series id')).toBeDefined();
  });

  it('add-book: requires valid book number', async () => {
    const sid = await createSeries();
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['add-book'], flags: { series: sid, book: 'abc', title: 'B1' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Please provide a valid book number')).toBeDefined();
  });

  it('add-book: requires title', async () => {
    const sid = await createSeries();
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['add-book'], flags: { series: sid, book: 2 } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Please provide a book title')).toBeDefined();
  });

  it('add-book: success (with explicit project)', async () => {
    const sid = await createSeries();
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({
        positional: ['add-book'],
        flags: { series: sid, book: 2, title: 'The Second Door', project: '7' },
      }),
      dir,
      output,
      ext()
    );
    expect(found(log, `Book 2 added to series ${sid}`)).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('add-book: failure surfaces error (bad series fk / duplicate)', async () => {
    const sid = await createSeries();
    // First add succeeds for project 9
    const a = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['add-book'], flags: { series: sid, book: 1, title: 'B1', project: '9' } }),
      dir,
      a.output,
      ext()
    );
    // Duplicate (series_id, project_id) PK violation → catch path
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['add-book'], flags: { series: sid, book: 1, title: 'B1 dup', project: '9' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Failed to add book')).toBeDefined();
  });

  // ── list ────────────────────────────────────────────────────────────────

  it('list: empty', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['list'] }), dir, output, ext());
    expect(found(log, 'No series found')).toBeDefined();
  });

  it('list: with series + book counts', async () => {
    const sid = await createSeries('Listed Saga');
    await mgr().addBook(sid, '1', 1, 'Book One');
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['list'] }), dir, output, ext());
    expect(found(log, 'All Series')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  it('list: catch path when no extension', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['list'] }), dir, output, undefined);
    expect(found(log, 'Failed to list series')).toBeDefined();
  });

  // ── bible ─────────────────────────────────────────────────────────────────

  it('bible: unknown action', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['bible', 'frobnicate'] }), dir, output, ext());
    expect(found(log, 'Unknown bible action')).toBeDefined();
  });

  it('bible add: validation errors (series/category/key/value)', async () => {
    const base = ['bible', 'add'];
    const cases: Array<[Record<string, unknown>, string]> = [
      [{}, 'Please provide a series id'],
      [{ series: 's' }, 'Please provide a category'],
      [{ series: 's', category: 'character' }, 'Please provide an entry key'],
      [{ series: 's', category: 'character', key: 'k' }, 'Please provide a value'],
    ];
    for (const [flags, expected] of cases) {
      const { log, output } = createMockOutput();
      await handleSeriesCommand(makeArgs({ positional: base, flags: flags as any }), dir, output, ext());
      expect(found(log, expected), JSON.stringify(flags)).toBeDefined();
    }
  });

  it('bible add: success with notes and applies-to', async () => {
    const sid = await createSeries();
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({
        positional: ['bible', 'add'],
        flags: {
          series: sid,
          category: 'character',
          key: 'Mira.age_in_book_1',
          value: '23',
          notes: 'canon',
          'applies-to': '1,2',
        },
      }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Bible entry added:')).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('bible list: requires series id', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['bible', 'list'] }), dir, output, ext());
    expect(found(log, 'Please provide a series id')).toBeDefined();
  });

  it('bible list: empty (with category label)', async () => {
    const sid = await createSeries();
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['bible', 'list'], flags: { series: sid, category: 'world' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'No bible entries found for category "world"')).toBeDefined();
  });

  it('bible list: grouped output', async () => {
    const sid = await createSeries();
    await mgr().addBibleEntry(sid, 'character', 'Mira.age', '23', { appliesToBooks: [1] });
    await mgr().addBibleEntry(sid, 'world', 'Capital', 'Vael', {});
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['bible', 'list'], flags: { series: sid } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Series Bible')).toBeDefined();
    expect(found(log, 'SECTION: CHARACTER')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  // ── threads ───────────────────────────────────────────────────────────────

  it('threads: requires series id', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['threads'] }), dir, output, ext());
    expect(found(log, 'Please provide a series id')).toBeDefined();
  });

  it('threads: none found', async () => {
    const sid = await createSeries();
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['threads'], flags: { series: sid } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'No cross-book unresolved threads')).toBeDefined();
  });

  it('threads: detects cross-book orphan', async () => {
    const sid = await createSeries();
    await mgr().addBook(sid, 'p1', 1, 'Book One');
    await mgr().addBook(sid, 'p2', 2, 'Book Two');
    // Same open promise title in both books → orphan thread
    for (const pid of ['p1', 'p2']) {
      await client().writeQuery(
        `INSERT INTO narrative_promises
          (id, project_id, type, status, title, description, introduced_at, importance,
           reader_visibility, related_characters, related_plot_threads, related_themes,
           source, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          `prom-${pid}`, pid, 'mystery', 'open', 'The Lost Heir', 'Who is the heir?',
          'ch1', 8, 5, '[]', '[]', '[]', 'manual',
          new Date().toISOString(), new Date().toISOString(),
        ]
      );
    }
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['threads'], flags: { series: sid } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Cross-Book Threads')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  // ── check ─────────────────────────────────────────────────────────────────

  it('check: requires series id', async () => {
    const { log, output } = createMockOutput();
    await handleSeriesCommand(makeArgs({ positional: ['check'] }), dir, output, ext());
    expect(found(log, 'Please provide a series id')).toBeDefined();
  });

  it('check: no issues found', async () => {
    const sid = await createSeries();
    await mgr().addBook(sid, 'pcheck', 1, 'Book One');
    await mgr().addBibleEntry(sid, 'character', 'Mira.age', '23', {});
    // No canon items → no contradictions
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['check'], flags: { series: sid } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'No consistency issues found')).toBeDefined();
  });

  it('check: reports contradictions', async () => {
    const sid = await createSeries();
    await mgr().addBook(sid, 'pcon', 1, 'Book One');
    await mgr().addBibleEntry(sid, 'character', 'Mira.age', '23', {});
    // canon item whose subject matches the bible key but description omits '23'
    await client().writeQuery(
      `INSERT INTO canon_items
        (id, project_id, type, status, strength, subject, predicate, object, description,
         scope, source, confidence, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        'canon1', 'pcon', 'fact', 'active', 'hard', 'Mira.age', 'is', null, 'Mira is thirty',
        'series', 'manual', 1.0, new Date().toISOString(), new Date().toISOString(),
      ]
    );
    const { log, output } = createMockOutput();
    await handleSeriesCommand(
      makeArgs({ positional: ['check'], flags: { series: sid } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Series Consistency Issues')).toBeDefined();
    expect(found(log, 'WARNING:')).toBeDefined();
  });
});
