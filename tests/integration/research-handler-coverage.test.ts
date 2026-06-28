/**
 * Coverage tests for research-handler.ts
 *
 * Exercises handleResearchCommand routing and every subcommand handler:
 * add, list, show, link, verify-list, sync, plus the unknown-subcommand and
 * error/catch paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import { handleResearchCommand } from '../../project/src/cli/handlers/research-handler.js';

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
    section: () => log.push('SECTION'),
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
    command: 'research',
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

const found = (log: string[], needle: string) => log.find((l) => l.includes(needle));

describe('research-handler coverage', () => {
  let dir: string;
  let extension: TestNovelWriterExtension;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'research-cov-'));
    extension = new TestNovelWriterExtension(dir);
    await extension.initialize({
      title: 'Research Novel',
      author: 'Author',
      genre: 'Sci-Fi',
      targetWordCount: 90000,
    });
  });

  afterEach(async () => {
    extension.cleanup();
    await retryRm(dir);
  });

  const ext = () => extension as any;

  /** Add a note and return its id. */
  async function addNote(title: string, opts: Record<string, string> = {}): Promise<string> {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['add'], flags: { title, ...opts } }),
      dir,
      output,
      ext()
    );
    const line = found(log, 'Research note created:');
    return line!.replace('SUCCESS: Research note created: ', '').trim();
  }

  // ── routing / unknown ───────────────────────────────────────────────────

  it('unknown subcommand prints help', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['bogus'] }), dir, output, ext());
    expect(found(log, 'Unknown research subcommand')).toBeDefined();
    expect(found(log, 'Available subcommands')).toBeDefined();
  });

  it('undefined subcommand prints help', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs(), dir, output, ext());
    expect(found(log, 'Unknown research subcommand')).toBeDefined();
  });

  // ── add ─────────────────────────────────────────────────────────────────

  it('add: requires a title', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['add'] }), dir, output, ext());
    expect(found(log, 'Please provide a title')).toBeDefined();
  });

  it('add: success with url, notes, and tags', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({
        positional: ['add'],
        flags: { title: 'Quantum tunneling', url: 'http://x', notes: 'n', tag: 'physics,science' },
      }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Research note created:')).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('add: title via positional, no tags', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['add', 'Positional Title'] }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Research note created:')).toBeDefined();
  });

  it('add: catch path when no extension (getService throws)', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['add'], flags: { title: 'X' } }),
      dir,
      output,
      undefined
    );
    expect(found(log, 'Failed to add research note')).toBeDefined();
  });

  // ── list ────────────────────────────────────────────────────────────────

  it('list: empty', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['list'] }), dir, output, ext());
    expect(found(log, 'No research notes found.')).toBeDefined();
  });

  it('list: with notes and tag filter', async () => {
    await addNote('Tagged note', { url: 'http://u', tag: 'alpha' });
    await addNote('Untagged note');
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['list'], flags: { tag: 'alpha' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Research Notes')).toBeDefined();
    expect(found(log, 'TABLE:')).toBeDefined();
  });

  it('list: catch path when no extension', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['list'] }), dir, output, undefined);
    expect(found(log, 'Failed to list research notes')).toBeDefined();
  });

  // ── show ────────────────────────────────────────────────────────────────

  it('show: requires id', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['show'] }), dir, output, ext());
    expect(found(log, 'Please provide a note id')).toBeDefined();
  });

  it('show: not found', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['show', 'missing-id'] }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'Research note not found')).toBeDefined();
  });

  it('show: found displays details', async () => {
    const id = await addNote('Detailed note', { notes: 'body text' });
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['show', id] }), dir, output, ext());
    expect(found(log, 'HEADING: Research: Detailed note')).toBeDefined();
    expect(found(log, 'KEYVALUE')).toBeDefined();
  });

  it('show: catch path when no extension', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['show', 'anything'] }),
      dir,
      output,
      undefined
    );
    expect(found(log, 'Failed to show research note')).toBeDefined();
  });

  // ── link ────────────────────────────────────────────────────────────────

  it('link: requires id', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['link'] }), dir, output, ext());
    expect(found(log, 'Please provide a note id')).toBeDefined();
  });

  it('link: requires --chapter', async () => {
    const id = await addNote('Linkable');
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['link', id] }), dir, output, ext());
    expect(found(log, 'Please provide --chapter N')).toBeDefined();
  });

  it('link: success', async () => {
    const id = await addNote('Linkable2');
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['link', id], flags: { chapter: 3, note: 'used here' } }),
      dir,
      output,
      ext()
    );
    expect(found(log, `linked to chapter 3`)).toBeDefined();
  });

  it('link: catch path when no extension', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['link', 'someid'], flags: { chapter: 1 } }),
      dir,
      output,
      undefined
    );
    expect(found(log, 'Failed to link research note')).toBeDefined();
  });

  // ── verify-list ─────────────────────────────────────────────────────────

  it('verify-list: no markers', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['verify-list'] }), dir, output, ext());
    expect(found(log, 'No [VERIFY:] markers found')).toBeDefined();
  });

  it('verify-list: finds markers in chapter files', async () => {
    const chapters = join(dir, 'chapters');
    await mkdir(chapters, { recursive: true });
    await writeFile(
      join(chapters, '01-intro.md'),
      '# Chapter 1\n\nThe sky was [VERIFY: are skies blue on Mars?] blue.\n',
      'utf-8'
    );
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['verify-list'] }), dir, output, ext());
    expect(found(log, '[VERIFY:] Markers')).toBeDefined();
    expect(found(log, 'are skies blue on Mars?')).toBeDefined();
  });

  it('verify-list: with chapter filter', async () => {
    const chapters = join(dir, 'chapters');
    await mkdir(chapters, { recursive: true });
    await writeFile(join(chapters, '02-two.md'), 'Text [VERIFY: claim two] here.\n', 'utf-8');
    const { log, output } = createMockOutput();
    await handleResearchCommand(
      makeArgs({ positional: ['verify-list'], flags: { chapter: 2 } }),
      dir,
      output,
      ext()
    );
    expect(found(log, 'claim two')).toBeDefined();
  });

  // ── sync ────────────────────────────────────────────────────────────────

  it('sync: prints informational message', async () => {
    const { log, output } = createMockOutput();
    await handleResearchCommand(makeArgs({ positional: ['sync'] }), dir, output, ext());
    expect(found(log, 'Research sync')).toBeDefined();
  });
});
