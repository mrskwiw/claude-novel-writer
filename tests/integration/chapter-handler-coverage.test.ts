/**
 * Coverage tests: src/cli/handlers/chapter-handler.ts
 *
 * handleChapterCommand(args, projectPath, output) uses a ChapterBuilder bound
 * to projectPath (no DB needed for create/list/sync/stats) and a
 * DirectSQLiteClient for `check`. We seed the shared .novel/data.db via the
 * TestNovelWriterExtension's mock client.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleChapterCommand } from '../../project/src/cli/handlers/chapter-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

function makeOutput() {
  const log: string[] = [];
  const out: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: (items) => log.push(`LIST: ${items.join('|')}`),
    section: () => log.push('SECTION'),
    spinner: (m) => ({ stop: (msg?: string) => log.push(`SPINNER: ${msg ?? m}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: (d) => log.push(`KV: ${JSON.stringify(d)}`),
    code: (c) => log.push(`CODE: ${c}`),
  };
  return { log, out };
}

async function rmRetry(p: string) {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function args(subcommand: string | undefined, flags: Record<string, string | number | boolean> = {}): ParsedArgs {
  return { command: 'chapter', subcommand, positional: [], arguments: {}, flags, raw: '' };
}

describe('chapter-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chapter-h-'));
    await mkdir(join(dir, 'chapters'), { recursive: true });
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Sci-Fi', targetWordCount: 1000 });
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  async function writeChapter(name: string, body: string) {
    await writeFile(join(dir, 'chapters', name), body, 'utf-8');
  }

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('errors when no subcommand provided', async () => {
    await handleChapterCommand(args(undefined), dir, out);
    expect(log.some((l) => l.includes('No subcommand provided'))).toBe(true);
  });

  it('errors on unknown subcommand', async () => {
    await handleChapterCommand(args('frobnicate'), dir, out);
    expect(log.some((l) => l.includes('Unknown subcommand: frobnicate'))).toBe(true);
  });

  // ── create ────────────────────────────────────────────────────────────────
  it('create errors without title', async () => {
    await handleChapterCommand(args('create', {}), dir, out);
    expect(log.some((l) => l.includes('Chapter title is required'))).toBe(true);
  });

  it('create makes a chapter with metadata and auto-number message', async () => {
    await handleChapterCommand(args('create', { title: 'The Signal', status: 'drafted', pov: 'Sarah' }), dir, out);
    expect(log.some((l) => l.includes('Using chapter number: 1'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter created'))).toBe(true);
  });

  it('create with explicit number', async () => {
    await handleChapterCommand(args('create', { title: 'Second', number: 4 }), dir, out);
    expect(log.some((l) => l.includes('Chapter created'))).toBe(true);
  });

  it('create from template', async () => {
    await handleChapterCommand(args('create', { title: 'Chase', number: 2, template: 'action' }), dir, out);
    expect(log.some((l) => l.includes('Chapter created from template'))).toBe(true);
  });

  it('create from unknown template reports error', async () => {
    await handleChapterCommand(args('create', { title: 'Nope', number: 3, template: 'nonexistent' }), dir, out);
    expect(log.some((l) => l.includes('Failed to create chapter'))).toBe(true);
  });

  it('create interactive rejects (prompt integration unavailable)', async () => {
    await expect(
      handleChapterCommand(args('create', { interactive: true }), dir, out)
    ).rejects.toThrow();
    expect(log.some((l) => l.includes('Starting interactive chapter creation'))).toBe(true);
  });

  // ── list ──────────────────────────────────────────────────────────────────
  it('list warns when no chapters', async () => {
    await handleChapterCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('No chapters found'))).toBe(true);
  });

  it('list shows chapter metadata', async () => {
    await writeChapter(
      '01-the-signal.md',
      `---\ntitle: The Signal\nstatus: drafted\npovCharacter: Sarah\nsummary: A discovery\n---\n\n# The Signal\n\nSome prose here with several words.`
    );
    await writeChapter('02-untitled.md', `# No frontmatter\n\nWords words words.`);
    await handleChapterCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('Found 2 chapter(s)'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter 01: The Signal'))).toBe(true);
    expect(log.some((l) => l.includes('POV: Sarah'))).toBe(true);
    expect(log.some((l) => l.includes('Summary: A discovery'))).toBe(true);
  });

  // ── sync ──────────────────────────────────────────────────────────────────
  it('sync warns when no chapters', async () => {
    await handleChapterCommand(args('sync'), dir, out);
    expect(log.some((l) => l.includes('No chapters to sync'))).toBe(true);
  });

  it('sync lists what would be synced', async () => {
    await writeChapter('01-one.md', `---\ntitle: One\n---\n# One\n`);
    await handleChapterCommand(args('sync'), dir, out);
    expect(log.some((l) => l.includes('Syncing 1 chapter'))).toBe(true);
    expect(log.some((l) => l.includes('Would sync: 01-one.md'))).toBe(true);
  });

  // ── stats ─────────────────────────────────────────────────────────────────
  it('stats warns when no chapters', async () => {
    await handleChapterCommand(args('stats'), dir, out);
    expect(log.some((l) => l.includes('No chapters found'))).toBe(true);
  });

  it('stats summarizes chapters by status', async () => {
    await writeChapter('01-a.md', `---\ntitle: A\nstatus: drafted\n---\n# A\n\none two three`);
    await writeChapter('02-b.md', `---\ntitle: B\nstatus: final\n---\n# B\n\nfour five`);
    await handleChapterCommand(args('stats'), dir, out);
    expect(log.some((l) => l.includes('Chapter Statistics'))).toBe(true);
    expect(log.some((l) => l.includes('Total chapters: 2'))).toBe(true);
    expect(log.some((l) => l.includes('drafted: 1'))).toBe(true);
    expect(log.some((l) => l.includes('final: 1'))).toBe(true);
  });

  // ── check ─────────────────────────────────────────────────────────────────
  it('check errors without --chapter', async () => {
    await handleChapterCommand(args('check'), dir, out);
    expect(log.some((l) => l.includes('provide a chapter number'))).toBe(true);
  });

  it('check errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'chapter-empty-'));
    try {
      await handleChapterCommand(args('check', { chapter: 1 }), empty, out);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('check reports no project when projects table empty', async () => {
    await (ext as any).mcpClient.writeQuery('DELETE FROM projects', []);
    await handleChapterCommand(args('check', { chapter: 1 }), dir, out);
    expect(log.some((l) => l.includes('No project found in database'))).toBe(true);
  });

  it('check reports chapter not found in DB', async () => {
    await handleChapterCommand(args('check', { chapter: 99 }), dir, out);
    expect(log.some((l) => l.includes('Chapter 99 not found in database'))).toBe(true);
  });

  it('check prints a full checklist for an existing chapter', async () => {
    const mcp = (ext as any).mcpClient;
    const projectId = ext.getProjectId();
    await mcp.writeQuery(
      `INSERT INTO chapters (project_id, chapter_number, title, summary, notes) VALUES (?, ?, ?, ?, ?)`,
      [projectId, 3, 'Crisis', 'Sarah finally realized the truth', 'Purpose: raise the stakes']
    );
    const chapterRows = await mcp.readQuery('SELECT id FROM chapters WHERE chapter_number = 3', []);
    const chapterId = chapterRows[0].id;
    await mcp.writeQuery(
      `INSERT INTO scenes (chapter_id, scene_number, title, word_count, tension_level) VALUES (?, ?, ?, ?, ?)`,
      [chapterId, 1, 'Opening', 500, 7]
    );
    await mcp.writeQuery(
      `INSERT INTO scenes (chapter_id, scene_number, title, word_count, tension_level) VALUES (?, ?, ?, ?, ?)`,
      [chapterId, 2, 'Climax', 800, 9]
    );

    await handleChapterCommand(args('check', { chapter: 3 }), dir, out);
    expect(log.some((l) => l.includes('Chapter 3: "Crisis" — Checklist'))).toBe(true);
    expect(log.some((l) => l.includes('Purpose declared'))).toBe(true);
    expect(log.some((l) => l.includes('Has conflict'))).toBe(true);
    expect(log.some((l) => l.includes('Character change'))).toBe(true);
    expect(log.some((l) => l.includes('Scene count: 2 scenes'))).toBe(true);
    expect(log.some((l) => l.includes('Word count'))).toBe(true);
  });
});
