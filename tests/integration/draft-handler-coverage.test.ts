/**
 * Coverage tests: draft-handler
 *
 * Exercises both subcommands (tk-list / chapter-check), the default branch,
 * and the error/catch paths. No database is required — the DraftScanner reads
 * chapter Markdown files from disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleDraftCommand } from '../../project/src/cli/handlers/draft-handler.js';
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

function makeArgs(subcommand: string | undefined, flags: Record<string, unknown> = {}, positional: unknown[] = []): ParsedArgs {
  return {
    command: 'draft',
    subcommand,
    positional: subcommand ? [subcommand, ...positional] : positional,
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

const allText = (entries: Entry[]): string => entries.map((e) => e.message).join('\n');

describe('draft-handler coverage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-draft-'));
  });

  afterEach(async () => {
    await rmWithRetry(dir);
  });

  async function writeChapter(filename: string, content: string): Promise<void> {
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, filename), content, 'utf-8');
  }

  // ── tk-list ────────────────────────────────────────────────────────────────

  it('tk-list: reports no markers when chapters directory is absent', async () => {
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('tk-list'), dir, output);
    expect(entries.some((e) => e.type === 'info' && /No placeholder markers found\./.test(e.message))).toBe(true);
  });

  it('tk-list: lists markers across files, with and without notes', async () => {
    await writeChapter(
      '01-opening.md',
      '# Opening\n\nShe walked in. [TK: describe the room]\nHe nodded. [TODO]\n'
    );
    await writeChapter('02-middle.md', '# Middle\n\nLater. [FIXME: continuity]\n');

    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('tk-list'), dir, output);

    expect(entries.some((e) => e.type === 'heading' && /Placeholder markers \(3\)/.test(e.message))).toBe(true);
    const text = allText(entries);
    expect(text).toContain('01-opening.md');
    expect(text).toContain('02-middle.md');
    expect(text).toContain('describe the room');
    expect(text).toContain('[TODO]');
  });

  it('tk-list: filters by chapter and reports none when that chapter is clean', async () => {
    await writeChapter('01-opening.md', '# Opening\n\nClean prose here.\n');
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('tk-list', { chapter: 1 }), dir, output);
    expect(entries.some((e) => e.type === 'info' && /No placeholder markers found in chapter 1\./.test(e.message))).toBe(true);
  });

  it('tk-list: filters by chapter and lists that chapter\'s markers', async () => {
    await writeChapter('03-action.md', '# Action\n\nFight scene. [TK]\n');
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('tk-list', { chapter: 3 }), dir, output);
    expect(entries.some((e) => e.type === 'heading' && /chapter 3 \(1\)/.test(e.message))).toBe(true);
  });

  it('tk-list: hits the catch branch when a chapter entry is unreadable', async () => {
    // A directory named like a chapter file makes readFile throw EISDIR,
    // which propagates out of findPlaceholders into the handler's catch.
    await mkdir(join(dir, 'chapters', 'bad.md'), { recursive: true });
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('tk-list'), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Failed to scan for placeholders/i.test(e.message))).toBe(true);
  });

  // ── chapter-check ────────────────────────────────────────────────────────────

  it('chapter-check: errors when no chapter number is supplied', async () => {
    const { entries, output } = createMockOutput();
    // subcommand set explicitly with an empty positional list so positional[0]
    // is undefined, reaching the "no chapter number" guard.
    const args: ParsedArgs = {
      command: 'draft',
      subcommand: 'chapter-check',
      positional: [],
      arguments: {},
      flags: {},
      raw: '',
    };
    await handleDraftCommand(args, dir, output);
    expect(entries.some((e) => e.type === 'error' && /provide a chapter number/i.test(e.message))).toBe(true);
  });

  it('chapter-check: errors on an invalid chapter number', async () => {
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('chapter-check', { chapter: 'abc' }), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Invalid chapter number/i.test(e.message))).toBe(true);
  });

  it('chapter-check: renders a checklist for a real chapter', async () => {
    await writeChapter(
      '01-intro.md',
      [
        '---',
        'pov: Alice',
        'tension_level: 6',
        '---',
        '',
        '<!-- purpose: establish the mystery -->',
        '',
        'A body in the library. [TK: forensic detail]',
        '',
      ].join('\n')
    );
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('chapter-check', { chapter: 1 }), dir, output);
    const text = allText(entries);
    expect(text).toContain('Chapter 1 checklist:');
    expect(text).toContain('Purpose declared');
    expect(text).toContain('Open TK markers: 1 found');
  });

  it('chapter-check: accepts the chapter number from a positional argument', async () => {
    await writeChapter('02-quiet.md', '# Quiet\n\nNothing much happens.\n');
    const { entries, output } = createMockOutput();
    // subcommand provided explicitly so positional[0] can carry the number,
    // exercising the `?? args.positional[0]` fallback in the handler.
    const args: ParsedArgs = {
      command: 'draft',
      subcommand: 'chapter-check',
      positional: [2],
      arguments: {},
      flags: {},
      raw: '',
    };
    await handleDraftCommand(args, dir, output);
    expect(entries.some((e) => e.type === 'info' && /Chapter 2 checklist:/.test(e.message))).toBe(true);
  });

  it('chapter-check: hits the catch branch when the chapter entry is unreadable', async () => {
    await mkdir(join(dir, 'chapters', '05-broken.md'), { recursive: true });
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('chapter-check', { chapter: 5 }), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Failed to check chapter/i.test(e.message))).toBe(true);
  });

  // ── default ──────────────────────────────────────────────────────────────────

  it('default: reports an unknown subcommand', async () => {
    const { entries, output } = createMockOutput();
    await handleDraftCommand(makeArgs('bogus'), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Unknown draft subcommand/i.test(e.message))).toBe(true);
    expect(entries.some((e) => e.type === 'info' && /tk-list, chapter-check/.test(e.message))).toBe(true);
  });
});
