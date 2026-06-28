/**
 * Coverage tests: revise-handler
 *
 * Exercises chapter resolution, category validation, dry-run vs apply,
 * --all, the "nothing to change" path, and every error/catch branch.
 * No database is required — ProseFixer reads chapter Markdown files from disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleReviseCommand } from '../../project/src/cli/handlers/revise-handler.js';
import { reviseCommand } from '../../project/src/cli/commands/revise.js';
import type {
  ParsedArgs,
  OutputFormatter,
  CommandContext,
} from '../../project/src/cli/types.js';

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

/**
 * Build ParsedArgs the way the real parser would: the chapter identifier lands
 * in `subcommand` (first non-dash token), flags carry --apply / --all.
 */
function makeArgs(
  chapter: string | undefined,
  flags: Record<string, unknown> = {}
): ParsedArgs {
  return {
    command: 'revise',
    subcommand: chapter,
    positional: [],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
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

const allText = (entries: Entry[]): string => entries.map((e) => e.message).join('\n');
const hasError = (entries: Entry[], re: RegExp): boolean =>
  entries.some((e) => e.type === 'error' && re.test(e.message));

describe('revise-handler coverage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-revise-'));
  });

  afterEach(async () => {
    await rmWithRetry(dir);
  });

  async function writeChapter(filename: string, content: string): Promise<void> {
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, filename), content, 'utf-8');
  }

  // ── argument validation ──────────────────────────────────────────────────────

  it('errors when no chapter is supplied', async () => {
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs(undefined), dir, output);
    expect(hasError(entries, /provide a chapter/i)).toBe(true);
  });

  it('errors when the chapter argument is blank', async () => {
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('   '), dir, output);
    expect(hasError(entries, /provide a chapter/i)).toBe(true);
  });

  it('errors on an unknown category in --apply', async () => {
    await writeChapter('01-intro.md', 'the the cat');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1', { apply: 'doubled-words,bogus' }), dir, output);
    expect(hasError(entries, /Unknown categor/i)).toBe(true);
    expect(allText(entries)).toContain('Valid categories');
  });

  it('errors when --apply lists no usable category', async () => {
    await writeChapter('01-intro.md', 'the the cat');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1', { apply: ' , , ' }), dir, output);
    expect(hasError(entries, /No categories supplied/i)).toBe(true);
  });

  // ── chapter resolution ───────────────────────────────────────────────────────

  it('errors when the chapters directory is missing', async () => {
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1'), dir, output);
    expect(hasError(entries, /Failed to read chapters directory/i)).toBe(true);
  });

  it('errors when no chapter file matches the number', async () => {
    await writeChapter('02-two.md', 'clean prose');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('9'), dir, output);
    expect(hasError(entries, /No chapter file found/i)).toBe(true);
  });

  it('resolves a chapter by .md filename', async () => {
    await writeChapter('03-named.md', 'the the cat');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('03-named.md'), dir, output);
    expect(allText(entries)).toContain('03-named.md');
  });

  it('errors when a .md filename does not exist', async () => {
    await writeChapter('03-named.md', 'the the cat');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('99-missing.md'), dir, output);
    expect(hasError(entries, /No chapter file found/i)).toBe(true);
  });

  it('reads the chapter from the --chapter flag', async () => {
    await writeChapter('04-flag.md', 'the the cat');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs(undefined, { chapter: '4' }), dir, output);
    expect(allText(entries)).toContain('04-flag.md');
  });

  // ── dry run ──────────────────────────────────────────────────────────────────

  it('dry run previews fixes, prints a summary, and does not write', async () => {
    await writeChapter('01-intro.md', 'the the cat said angrily.');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1'), dir, output);

    const text = allText(entries);
    expect(entries.some((e) => e.type === 'heading' && /dry run/i.test(e.message))).toBe(true);
    expect(text).toContain('- the the cat said angrily.');
    expect(text).toContain('+ the cat said.');
    expect(text).toContain('Summary');
    expect(text).toContain('Dry run');
    expect(entries.some((e) => e.type === 'warning' && /snapshot first/i.test(e.message))).toBe(true);

    // File untouched.
    expect(await readFile(join(dir, 'chapters', '01-intro.md'), 'utf-8')).toBe(
      'the the cat said angrily.'
    );
  });

  it('reports a clean chapter with nothing to change', async () => {
    await writeChapter('01-clean.md', 'The cat sat on the mat.');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1'), dir, output);
    expect(entries.some((e) => e.type === 'success' && /nothing to change/i.test(e.message))).toBe(
      true
    );
  });

  // ── apply ────────────────────────────────────────────────────────────────────

  it('applies a single category and writes the file', async () => {
    await writeChapter('01-intro.md', 'the the cat said angrily.');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1', { apply: 'doubled-words' }), dir, output);

    expect(entries.some((e) => e.type === 'success' && /File written/i.test(e.message))).toBe(true);
    // Only doubled-words applied; the adverb tag is left intact.
    expect(await readFile(join(dir, 'chapters', '01-intro.md'), 'utf-8')).toBe(
      'the cat said angrily.'
    );
  });

  it('--all applies every safe category and writes the file', async () => {
    await writeChapter('01-intro.md', 'the the cat said angrily.');
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('1', { all: true }), dir, output);

    expect(entries.some((e) => e.type === 'heading' && /apply/i.test(e.message))).toBe(true);
    expect(await readFile(join(dir, 'chapters', '01-intro.md'), 'utf-8')).toBe('the cat said.');
  });

  // ── catch branch ─────────────────────────────────────────────────────────────

  it('hits the catch branch when the chapter entry is unreadable', async () => {
    // A directory named like a chapter file makes readFile throw EISDIR.
    await mkdir(join(dir, 'chapters', '05-broken.md'), { recursive: true });
    const { entries, output } = createMockOutput();
    await handleReviseCommand(makeArgs('5'), dir, output);
    expect(hasError(entries, /Failed to revise chapter/i)).toBe(true);
  });

  // ── command definition ───────────────────────────────────────────────────────

  it('reviseCommand is well-formed and its handler dispatches', async () => {
    expect(reviseCommand.name).toBe('revise');
    expect(reviseCommand.arguments?.[0]?.name).toBe('chapter');
    expect(reviseCommand.flags?.some((f) => f.name === 'apply')).toBe(true);
    expect(reviseCommand.flags?.some((f) => f.name === 'all')).toBe(true);
    expect(reviseCommand.examples?.length).toBeGreaterThan(0);

    await writeChapter('01-intro.md', 'the the cat');
    const { entries, output } = createMockOutput();
    const context = { cwd: dir, output } as CommandContext;
    await reviseCommand.handler?.(makeArgs('1'), context);
    expect(entries.some((e) => e.type === 'heading' && /dry run/i.test(e.message))).toBe(true);
  });
});
