/**
 * Coverage tests: revision-handler
 *
 * Exercises every subcommand (snapshot / list / show / diff / restore /
 * auto-snapshot), the default branch, and the error/catch paths. Snapshots are
 * plain files on disk — no database is required.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleRevisionCommand } from '../../project/src/cli/handlers/revision-handler.js';
import { SnapshotManager } from '../../project/src/revision/snapshot-manager.js';
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

function makeArgs(
  subcommand: string | undefined,
  rest: unknown[] = [],
  flags: Record<string, unknown> = {}
): ParsedArgs {
  return {
    command: 'revision',
    subcommand,
    positional: subcommand ? [subcommand, ...rest] : [...rest],
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

describe('revision-handler coverage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-revision-'));
  });

  afterEach(async () => {
    await rmWithRetry(dir);
  });

  async function writeChapter(filename: string, content: string): Promise<void> {
    const chaptersDir = join(dir, 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, filename), content, 'utf-8');
  }

  // ── default ──────────────────────────────────────────────────────────────────

  it('default: reports an unknown subcommand', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('bogus'), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Unknown revision subcommand/i.test(e.message))).toBe(true);
    expect(entries.some((e) => e.type === 'info' && /snapshot, list, show, diff/.test(e.message))).toBe(true);
  });

  // ── snapshot ─────────────────────────────────────────────────────────────────

  it('snapshot: creates a labelled snapshot of the chapters directory', async () => {
    await writeChapter('chapter-01.md', '# One\n\nThe quiet morning broke.\n');
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('snapshot', ['before-edit']), dir, output);
    expect(entries.some((e) => e.type === 'success' && /Snapshot created: before-edit/.test(e.message))).toBe(true);
  });

  it('snapshot: defaults the label to "auto" when none is given', async () => {
    await writeChapter('chapter-01.md', '# One\n\nProse.\n');
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('snapshot', []), dir, output);
    expect(entries.some((e) => e.type === 'success' && /Snapshot created: auto/.test(e.message))).toBe(true);
  });

  it('snapshot: hits the catch branch when a chapter entry is unreadable', async () => {
    // A directory named like a .md file makes copyFile throw, which the
    // handler reports as a failed snapshot.
    await mkdir(join(dir, 'chapters', 'bad.md'), { recursive: true });
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('snapshot', ['x']), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Failed to create snapshot/i.test(e.message))).toBe(true);
  });

  // ── list ─────────────────────────────────────────────────────────────────────

  it('list: reports when there are no snapshots', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('list'), dir, output);
    expect(entries.some((e) => e.type === 'info' && /No snapshots found/.test(e.message))).toBe(true);
  });

  it('list: prints a table of existing snapshots', async () => {
    await writeChapter('chapter-01.md', '# One\n\nProse goes here.\n');
    await new SnapshotManager(dir).create('snap-a');
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('list'), dir, output);
    expect(entries.some((e) => e.type === 'heading' && /Snapshots \(1\)/.test(e.message))).toBe(true);
    expect(allText(entries)).toContain('snap-a');
  });

  // ── show ─────────────────────────────────────────────────────────────────────

  it('show: errors when no label is provided', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('show', []), dir, output);
    expect(entries.some((e) => e.type === 'error' && /provide a snapshot label/i.test(e.message))).toBe(true);
  });

  it('show: prints metadata and per-chapter word counts', async () => {
    await writeChapter('chapter-01.md', '# One\n\nThe quiet morning broke softly.\n');
    await new SnapshotManager(dir).create('detail');
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('show', ['detail']), dir, output);
    expect(entries.some((e) => e.type === 'heading' && /Snapshot: detail/.test(e.message))).toBe(true);
    expect(entries.some((e) => e.type === 'keyValue')).toBe(true);
    expect(allText(entries)).toContain('chapter-01.md');
  });

  it('show: reports a missing snapshot', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('show', ['nope']), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Snapshot not found: "nope"/.test(e.message))).toBe(true);
  });

  // ── diff ─────────────────────────────────────────────────────────────────────

  it('diff: errors when from/to labels are missing', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('diff', ['onlyfrom']), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Usage:/.test(e.message))).toBe(true);
  });

  it('diff: errors when the --chapter flag is missing', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('diff', ['v1', 'v2']), dir, output);
    expect(entries.some((e) => e.type === 'error' && /specify a chapter file/i.test(e.message))).toBe(true);
  });

  it('diff: renders a diff between two snapshots', async () => {
    await writeChapter('chapter-01.md', '# One\n\nThe original line.\n');
    await new SnapshotManager(dir).create('v1');
    await writeChapter('chapter-01.md', '# One\n\nThe revised line.\n');
    await new SnapshotManager(dir).create('v2');

    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('diff', ['v1', 'v2'], { chapter: 'chapter-01.md' }), dir, output);
    expect(entries.some((e) => e.type === 'heading' && /Diff: v1 → v2/.test(e.message))).toBe(true);
    expect(entries.some((e) => e.type === 'code')).toBe(true);
  });

  it('diff: hits the catch branch when a snapshot label is unknown', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('diff', ['ghost', 'phantom'], { chapter: 'chapter-01.md' }), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Diff failed/i.test(e.message))).toBe(true);
  });

  // ── restore ──────────────────────────────────────────────────────────────────

  it('restore: errors when no label is provided', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('restore', []), dir, output);
    expect(entries.some((e) => e.type === 'error' && /provide a snapshot label/i.test(e.message))).toBe(true);
  });

  it('restore: restores chapters from a named snapshot', async () => {
    await writeChapter('chapter-01.md', '# One\n\nThe original line.\n');
    await new SnapshotManager(dir).create('safe');
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('restore', ['safe']), dir, output);
    expect(entries.some((e) => e.type === 'success' && /Restored safe/.test(e.message))).toBe(true);
  });

  it('restore: hits the catch branch when the snapshot is unknown', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('restore', ['ghost']), dir, output);
    expect(entries.some((e) => e.type === 'error' && /Restore failed/i.test(e.message))).toBe(true);
  });

  // ── auto-snapshot ──────────────────────────────────────────────────────────────

  it('auto-snapshot: prints informational guidance', async () => {
    const { entries, output } = createMockOutput();
    await handleRevisionCommand(makeArgs('auto-snapshot'), dir, output);
    expect(entries.some((e) => e.type === 'heading' && /Auto-Snapshot/.test(e.message))).toBe(true);
    expect(entries.some((e) => e.type === 'info' && /Auto-snapshots are created automatically/.test(e.message))).toBe(true);
  });
});
