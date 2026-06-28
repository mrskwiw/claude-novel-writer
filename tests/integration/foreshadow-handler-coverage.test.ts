/**
 * Coverage tests: foreshadow-handler
 *
 * Exercises every subcommand (add / list / payoff / default) plus the
 * uninitialised-project guard and the catch/error branches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleForeshadowCommand } from '../../project/src/cli/handlers/foreshadow-handler.js';
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

function makeArgs(subcommand: string | undefined, flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'foreshadow',
    subcommand,
    positional: subcommand ? [subcommand] : [],
    arguments: {},
    flags,
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

describe('foreshadow-handler coverage', () => {
  let dir: string;
  let extension: TestNovelWriterExtension | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-foreshadow-'));
  });

  afterEach(async () => {
    safeCleanup(extension);
    extension = undefined;
    await rmWithRetry(dir);
  });

  /** Initialise a project and seed rows, then close the seeding connection. */
  async function init(): Promise<void> {
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Foreshadow Novel',
      author: 'Tester',
      genre: 'Mystery',
      targetWordCount: 80000,
    });
  }

  async function seed(sql: string, params: unknown[]): Promise<void> {
    await (extension as any).mcpClient.writeQuery(sql, params);
  }

  const now = new Date().toISOString();

  it('errors when the project is not initialised', async () => {
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list'), dir, output);
    expect(entries.some((e) => e.type === 'error' && /not initialized/i.test(e.message))).toBe(true);
  });

  it('add: plants a note with chapter and scene references', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(
      makeArgs('add', { content: 'A gun on the mantel', chapter: 2, scene: 3 }),
      dir,
      output
    );
    expect(entries.some((e) => e.type === 'success' && /planted/i.test(e.message))).toBe(true);
    const text = allText(entries);
    expect(text).toContain('Chapter: 2');
    expect(text).toContain('Scene:   3');
    expect(text).toContain('Status:  planted');
  });

  it('add: plants a note without chapter/scene references', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('add', { content: 'A locked door' }), dir, output);
    expect(entries.some((e) => e.type === 'success' && /planted/i.test(e.message))).toBe(true);
    const text = allText(entries);
    expect(text).not.toContain('Chapter:');
    expect(text).not.toContain('Scene:');
  });

  it('add: errors when content is missing', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('add', {}), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Content is required/i.test(e.message))).toBe(true);
  });

  it('add: hits the catch branch when no project row exists', async () => {
    await init();
    await seed('DELETE FROM projects', []);
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('add', { content: 'orphan note' }), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Failed to add/i.test(e.message))).toBe(true);
  });

  it('list: shows seeded notes with chapter and payoff annotations', async () => {
    await init();
    await seed(
      `INSERT INTO foreshadowing_notes (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['n1', '1', 2, null, 'A gun on the mantel', null, 'planted', now, now]
    );
    await seed(
      `INSERT INTO foreshadowing_notes (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['n2', '1', 1, null, 'A whispered secret', 7, 'paid_off', now, now]
    );
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list'), dir, output);
    const text = allText(entries);
    expect(text).toContain('All Foreshadowing Notes');
    expect(text).toContain('A gun on the mantel');
    expect(text).toContain('Ch. 2');
    expect(text).toContain('payoff Ch. 7');
  });

  it('list: filters by status and shows the labelled header', async () => {
    await init();
    await seed(
      `INSERT INTO foreshadowing_notes (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['n1', '1', null, null, 'planted thing', null, 'planted', now, now]
    );
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list', { status: 'planted' }), dir, output);
    const text = allText(entries);
    expect(text).toContain('Foreshadowing Notes (planted)');
    expect(text).toContain('planted thing');
  });

  it('list: empty result without filter', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list'), dir, output);
    expect(entries.some((e) => e.type === 'info' && /No foreshadowing notes found\./.test(e.message))).toBe(true);
  });

  it('list: empty result with a status filter mentions the qualifier', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list', { status: 'paid_off' }), dir, output);
    expect(entries.some((e) => e.type === 'info' && /status "paid_off"/.test(e.message))).toBe(true);
  });

  it('list: status=forgotten uses the forgotten lookup', async () => {
    await init();
    // Note planted in chapter 1, current max chapter 10 => forgotten (10 - 1 > 5)
    await seed(
      `INSERT INTO foreshadowing_notes (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['n1', '1', 1, null, 'forgotten seed', null, 'planted', now, now]
    );
    await seed(
      `INSERT INTO chapters (project_id, chapter_number, title) VALUES (?,?,?)`,
      [1, 10, 'Late Chapter']
    );
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list', { status: 'forgotten' }), dir, output);
    const text = allText(entries);
    expect(text).toContain('forgotten seed');
  });

  it('list: hits the catch branch when no project row exists', async () => {
    await init();
    await seed('DELETE FROM projects', []);
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('list'), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Failed to list/i.test(e.message))).toBe(true);
  });

  it('payoff: marks a note paid off and records the chapter', async () => {
    await init();
    await seed(
      `INSERT INTO foreshadowing_notes (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['n1', '1', 2, null, 'A gun on the mantel', null, 'planted', now, now]
    );
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('payoff', { id: 'n1', chapter: 9 }), dir, output);
    const text = allText(entries);
    expect(entries.some((e) => e.type === 'success' && /paid off/i.test(e.message))).toBe(true);
    expect(text).toContain('Payoff chapter: 9');
  });

  it('payoff: succeeds without a chapter flag', async () => {
    await init();
    await seed(
      `INSERT INTO foreshadowing_notes (id, project_id, chapter_id, scene_id, content, payoff_chapter_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['n1', '1', null, null, 'A gun on the mantel', null, 'planted', now, now]
    );
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('payoff', { id: 'n1' }), dir, output);
    expect(entries.some((e) => e.type === 'success' && /paid off/i.test(e.message))).toBe(true);
    expect(allText(entries)).not.toContain('Payoff chapter');
  });

  it('payoff: errors when id is missing', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('payoff', {}), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Note ID is required/i.test(e.message))).toBe(true);
  });

  it('payoff: hits the catch branch when no project row exists', async () => {
    await init();
    await seed('DELETE FROM projects', []);
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('payoff', { id: 'n1' }), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Failed to mark payoff/i.test(e.message))).toBe(true);
  });

  it('default: unknown subcommand falls back to list', async () => {
    await init();
    safeCleanup(extension);
    const { entries, output } = createMockOutput();
    await handleForeshadowCommand(makeArgs('bogus'), dir, output);
    expect(entries.some((e) => e.type === 'info' && /No foreshadowing notes found/.test(e.message))).toBe(true);
  });
});
