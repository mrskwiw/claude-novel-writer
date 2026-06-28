/**
 * Coverage tests: report-handler
 *
 * Complements tests/unit/cli/report-handler.test.ts by exercising the
 * database-backed sections with real data (tension arc, plot threads,
 * narrative promises, scene purpose) as well as the initialised-but-empty
 * project path. The handler builds its own NovelWriterExtension, so data is
 * seeded onto the on-disk `.novel/data.db` and the seeding connection is closed
 * before the handler runs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleReportCommand } from '../../project/src/cli/handlers/report-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

interface Entry {
  type: string;
  message: string;
}

function createMockOutput(): { entries: Entry[]; output: OutputFormatter } {
  const entries: Entry[] = [];
  const push = (type: string) => (message: string) => entries.push({ type, message });
  const output: OutputFormatter = {
    success: push('success'),
    error: push('error'),
    warning: push('warning'),
    info: push('info'),
    dim: push('dim'),
    table: () => entries.push({ type: 'table', message: '' }),
    list: () => entries.push({ type: 'list', message: '' }),
    section: () => entries.push({ type: 'section', message: '' }),
    spinner: () => ({ stop: () => {} }),
    newline: () => entries.push({ type: 'newline', message: '' }),
    heading: push('heading'),
    keyValue: () => entries.push({ type: 'keyValue', message: '' }),
    code: () => entries.push({ type: 'code', message: '' }),
  };
  return { entries, output };
}

function makeArgs(): ParsedArgs {
  return {
    command: 'report',
    subcommand: undefined,
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
  };
}

async function rmWithRetry(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function safeCleanup(ext: TestNovelWriterExtension | undefined): void {
  if (!ext) return;
  try {
    ext.cleanup();
  } catch {
    /* already closed */
  }
}

const allText = (entries: Entry[]): string => entries.map((e) => e.message).join('\n');
const typeText = (entries: Entry[], type: string): string =>
  entries.filter((e) => e.type === type).map((e) => e.message).join('\n');

describe('report-handler coverage', () => {
  let dir: string;
  let extension: TestNovelWriterExtension | undefined;
  const now = new Date().toISOString();

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-report-cov-'));
  });

  afterEach(async () => {
    safeCleanup(extension);
    extension = undefined;
    await rmWithRetry(dir);
  });

  async function init(): Promise<void> {
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Report Novel',
      author: 'Tester',
      genre: 'Thriller',
      targetWordCount: 90000,
    });
  }

  async function write(sql: string, params: unknown[] = []): Promise<void> {
    await (extension as any).mcpClient.writeQuery(sql, params);
  }

  async function read(sql: string, params: unknown[] = []): Promise<any[]> {
    return (extension as any).mcpClient.readQuery(sql, params);
  }

  async function writeChapterFile(filename: string, content: string): Promise<void> {
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, filename), content, 'utf-8');
  }

  it('renders populated DB-backed sections with real data', async () => {
    await init();

    // Two chapters with scenes carrying tension levels; one scene lacks a purpose.
    await write('INSERT INTO chapters (project_id, chapter_number, title, word_count) VALUES (?,?,?,?)', [
      1, 1, 'Opening', 600,
    ]);
    await write('INSERT INTO chapters (project_id, chapter_number, title, word_count) VALUES (?,?,?,?)', [
      1, 2, 'Rising', 700,
    ]);
    const ch1 = Number((await read('SELECT id FROM chapters WHERE chapter_number = 1'))[0].id);
    const ch2 = Number((await read('SELECT id FROM chapters WHERE chapter_number = 2'))[0].id);

    await write('INSERT INTO scenes (chapter_id, scene_number, tension_level, purpose) VALUES (?,?,?,?)', [
      ch1, 1, 8, 'Establish the stakes',
    ]);
    await write('INSERT INTO scenes (chapter_id, scene_number, tension_level, purpose) VALUES (?,?,?,?)', [
      ch2, 1, 3, null,
    ]);

    // An active plot thread.
    await write(
      'INSERT INTO plot_threads (project_id, thread_name, thread_type, status, priority) VALUES (?,?,?,?,?)',
      [1, 'The missing heir', 'main', 'active', 8]
    );

    // An open promise that is overdue (introduced in ch5, expected payoff by ch2).
    await write(
      `INSERT INTO narrative_promises
         (id, project_id, type, status, title, description, introduced_at,
          expected_payoff_window, importance, reader_visibility,
          related_characters, related_plot_threads, related_themes, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        'p1', '1', 'mystery', 'open', 'Who killed the duke?', 'Central mystery',
        JSON.stringify({ chapterId: '5' }),
        JSON.stringify({ latestChapter: 2 }),
        9, 8, '[]', '[]', '[]', JSON.stringify({ kind: 'manual' }), now, now,
      ]
    );

    // Chapter file on disk for the style-target and draft-marker sections.
    const body = Array.from({ length: 30 })
      .map(() => 'The quiet house stood silently on the lonely hill, waiting patiently.')
      .join(' ');
    await writeChapterFile('01-opening.md', `# Opening\n\n${body}\n\nUnfinished thought. [TK: add detail]\n`);

    safeCleanup(extension);

    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), dir, output);

    const text = allText(entries);
    // All sections present.
    for (const section of [
      'Tension Arc',
      'Plot Threads',
      'Narrative Promises',
      'Scene Purpose',
      'Style Targets',
      'Draft Markers',
    ]) {
      expect(text).toContain(section);
    }

    // Tension sparkline summary line mentions chapter count.
    expect(typeText(entries, 'dim')).toMatch(/2 chapters/);
    // Active plot thread counted.
    expect(typeText(entries, 'info')).toMatch(/open plot thread/);
    // Open + overdue promise produced a warning.
    expect(typeText(entries, 'warning')).toMatch(/payoff window/i);
    // One scene missing a purpose.
    expect(typeText(entries, 'warning')).toMatch(/missing a purpose/i);
    // [TK] marker counted.
    expect(typeText(entries, 'warning')).toMatch(/\[TK\]/);
    // No section threw.
    expect(entries.some((e) => e.type === 'error')).toBe(false);
  });

  it('renders graceful empty-state lines for an initialised project with no content', async () => {
    await init();
    safeCleanup(extension);

    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), dir, output);

    const dimText = typeText(entries, 'dim');
    const successText = typeText(entries, 'success');
    // Tension: chapters empty.
    expect(dimText).toMatch(/No chapters yet/);
    // Plot threads: none open.
    expect(successText).toMatch(/No open plot threads/);
    // Promises: none unresolved.
    expect(successText).toMatch(/No unresolved promises/);
    // Scene purpose: no scenes.
    expect(dimText).toMatch(/No scenes yet/);
  });

  it('reports all scenes declaring a purpose as a success line', async () => {
    await init();
    await write('INSERT INTO chapters (project_id, chapter_number, title, word_count) VALUES (?,?,?,?)', [
      1, 1, 'Solo', 400,
    ]);
    const ch1 = Number((await read('SELECT id FROM chapters WHERE chapter_number = 1'))[0].id);
    await write('INSERT INTO scenes (chapter_id, scene_number, tension_level, purpose) VALUES (?,?,?,?)', [
      ch1, 1, 5, 'Drive the plot forward',
    ]);
    safeCleanup(extension);

    const { entries, output } = createMockOutput();
    await handleReportCommand(makeArgs(), dir, output);

    expect(typeText(entries, 'success')).toMatch(/declare a purpose/i);
  });
});
