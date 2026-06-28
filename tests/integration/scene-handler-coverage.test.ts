/**
 * Coverage tests: src/cli/handlers/scene-handler.ts
 *
 * handleSceneCommand(args, projectPath, output) does NOT accept an injected
 * extension — it always constructs its own `new NovelWriterExtension(projectPath)`
 * (a DirectSQLiteClient over <dir>/.novel/data.db) and uses setProjectId(1) for
 * DB-backed paths. We therefore:
 *   - seed chapter Markdown files + DB rows through a TestNovelWriterExtension
 *     pointed at the same directory/database, then
 *   - invoke the handler, which opens its own connection to the same file.
 * Both better-sqlite3 connections coexist over the one data.db (the seeded
 * project is always id 1, matching the handler's hardcoded setProjectId(1)).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleSceneCommand } from '../../project/src/cli/handlers/scene-handler.js';
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

function args(
  subcommand: string,
  flags: Record<string, string | number | boolean> = {},
  positional: string[] = [subcommand]
): ParsedArgs {
  return { command: 'scene', subcommand, positional, arguments: {}, flags, raw: '' };
}

describe('scene-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scene-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  const has = (needle: string) => log.some((l) => l.includes(needle));

  /** Create a chapter Markdown file (number padded). Returns its absolute path. */
  async function makeChapter(num: number, title = 'A Chapter'): Promise<string> {
    return ext.getChapterBuilder().create(num, { title });
  }

  /** Add a scene to a chapter file via the real builder. */
  async function addSceneToFile(
    chapterPath: string,
    data: Record<string, unknown>,
    content?: string
  ) {
    return ext.getSceneBuilder(chapterPath).addScene(data as any, content);
  }

  /** Insert a chapters DB row whose file_path matches the handler's resolved path. */
  async function seedChapterRow(chapterPath: string, chapterNumber: number, title = 'A Chapter') {
    await (ext as any).mcpClient.writeQuery(
      'INSERT INTO chapters (project_id, chapter_number, title, file_path) VALUES (?, ?, ?, ?)',
      [ext.getProjectId(), chapterNumber, title, chapterPath]
    );
    const rows = await (ext as any).mcpClient.readQuery(
      'SELECT id FROM chapters WHERE chapter_number = ?',
      [chapterNumber]
    );
    return rows[0].id as number;
  }

  // ── dispatcher ─────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleSceneCommand(args('whoops'), dir, out);
    expect(has('Unknown scene subcommand')).toBe(true);
  });

  // ── add ────────────────────────────────────────────────────────────────────
  it('add requires --chapter', async () => {
    await handleSceneCommand(args('add'), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('add reports chapter not found', async () => {
    await handleSceneCommand(args('add', { chapter: 99 }), dir, out);
    expect(has('Chapter 99 not found')).toBe(true);
  });

  it('resolves a chapter-NN-title.md filename (SCENE-01 regression)', async () => {
    // The documented `chapter-NN-title.md` form must resolve — previously the
    // handler anchored the number at the start and silently failed on it.
    const { writeFile, mkdir } = await import('fs/promises');
    await mkdir(join(dir, 'chapters'), { recursive: true });
    await writeFile(
      join(dir, 'chapters', 'chapter-01-foo.md'),
      '---\ntitle: Foo\nchapter: 1\n---\n\nProse.',
      'utf-8'
    );
    await handleSceneCommand(args('list', { chapter: 1 }), dir, out);
    expect(has('not found')).toBe(false);
    expect(has('Chapter 1')).toBe(true);
  });

  it('add validates tension range', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('add', { chapter: 1, tension: 15 }), dir, out);
    expect(has('Tension level must be between 1 and 10')).toBe(true);
  });

  it('add creates a scene with all metadata flags', async () => {
    await makeChapter(1);
    await handleSceneCommand(
      args('add', {
        chapter: 1,
        title: 'Opening',
        pov: 'Alice',
        location: 'Tower',
        time: 'Dawn',
        purpose: 'introduce',
        tone: 'tense',
        tension: 7,
        content: 'Some prose here.',
      }),
      dir,
      out
    );
    expect(has('Scene 1 added to chapter 1')).toBe(true);
    expect(has('Title: Opening')).toBe(true);
    expect(has('POV: Alice')).toBe(true);
    expect(has('Location: Tower')).toBe(true);
    expect(has('Tension: 7/10')).toBe(true);
  });

  it('add supports --after insertion', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'First' });
    await handleSceneCommand(args('add', { chapter: 1, title: 'Inserted', after: 1 }), dir, out);
    expect(has('added to chapter 1')).toBe(true);
  });

  it('add reports failure when insertAfterScene is invalid', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('add', { chapter: 1, after: 99 }), dir, out);
    expect(has('Failed to add scene')).toBe(true);
  });

  // ── list ───────────────────────────────────────────────────────────────────
  it('list requires --chapter', async () => {
    await handleSceneCommand(args('list'), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('list reports chapter not found', async () => {
    await handleSceneCommand(args('list', { chapter: 42 }), dir, out);
    expect(has('Chapter 42 not found')).toBe(true);
  });

  it('list reports empty chapter', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('list', { chapter: 1 }), dir, out);
    expect(has('has no scenes yet')).toBe(true);
  });

  it('list renders scenes with full metadata', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(
      ch,
      { title: 'One', pov: 'Alice', location: 'Tower', timeOfDay: 'Dawn', purpose: 'setup', tensionLevel: 5 },
      'Words words words.'
    );
    await addSceneToFile(ch, { title: 'Two' }, 'More words.');
    await handleSceneCommand(args('list', { chapter: 1 }), dir, out);
    expect(has('Scene 1: One')).toBe(true);
    expect(has('Purpose: setup')).toBe(true);
    expect(has('Total: 2 scenes')).toBe(true);
  });

  // ── edit ───────────────────────────────────────────────────────────────────
  it('edit requires --chapter', async () => {
    await handleSceneCommand(args('edit', { scene: 1 }), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('edit requires --scene', async () => {
    await handleSceneCommand(args('edit', { chapter: 1 }), dir, out);
    expect(has('Scene number required')).toBe(true);
  });

  it('edit reports chapter not found', async () => {
    await handleSceneCommand(args('edit', { chapter: 7, scene: 1 }), dir, out);
    expect(has('Chapter 7 not found')).toBe(true);
  });

  it('edit validates tension range', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('edit', { chapter: 1, scene: 1, tension: 15 }), dir, out);
    expect(has('Tension level must be between 1 and 10')).toBe(true);
  });

  it('edit errors when no updates specified', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await handleSceneCommand(args('edit', { chapter: 1, scene: 1 }), dir, out);
    expect(has('No updates specified')).toBe(true);
  });

  it('edit applies updates', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await handleSceneCommand(
      args('edit', { chapter: 1, scene: 1, title: 'Renamed', pov: 'Bob', location: 'Cave', time: 'Night', purpose: 'p', tone: 'calm', tension: 4 }),
      dir,
      out
    );
    expect(has('Scene 1 in chapter 1 updated')).toBe(true);
  });

  it('edit reports failure for nonexistent scene', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('edit', { chapter: 1, scene: 99, title: 'X' }), dir, out);
    expect(has('Failed to edit scene')).toBe(true);
  });

  // ── delete ─────────────────────────────────────────────────────────────────
  it('delete requires --chapter', async () => {
    await handleSceneCommand(args('delete', { scene: 1 }), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('delete requires --scene', async () => {
    await handleSceneCommand(args('delete', { chapter: 1 }), dir, out);
    expect(has('Scene number required')).toBe(true);
  });

  it('delete reports chapter not found', async () => {
    await handleSceneCommand(args('delete', { chapter: 8, scene: 1 }), dir, out);
    expect(has('Chapter 8 not found')).toBe(true);
  });

  it('delete removes a scene', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await addSceneToFile(ch, { title: 'Two' });
    await handleSceneCommand(args('delete', { chapter: 1, scene: 1 }), dir, out);
    expect(has('Scene 1 deleted from chapter 1')).toBe(true);
  });

  it('delete reports failure for nonexistent scene', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('delete', { chapter: 1, scene: 99 }), dir, out);
    expect(has('Failed to delete scene')).toBe(true);
  });

  // ── reorder ────────────────────────────────────────────────────────────────
  it('reorder requires --chapter', async () => {
    await handleSceneCommand(args('reorder', { order: '2,1' }), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('reorder requires --order', async () => {
    await handleSceneCommand(args('reorder', { chapter: 1 }), dir, out);
    expect(has('Scene order required')).toBe(true);
  });

  it('reorder reports chapter not found', async () => {
    await handleSceneCommand(args('reorder', { chapter: 5, order: '2,1' }), dir, out);
    expect(has('Chapter 5 not found')).toBe(true);
  });

  it('reorder rejects invalid order format', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('reorder', { chapter: 1, order: 'a,b' }), dir, out);
    expect(has('Invalid order format')).toBe(true);
  });

  it('reorder reorders scenes', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await addSceneToFile(ch, { title: 'Two' });
    await handleSceneCommand(args('reorder', { chapter: 1, order: '2,1' }), dir, out);
    expect(has('Scenes reordered in chapter 1')).toBe(true);
  });

  it('reorder reports failure when count mismatches', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await addSceneToFile(ch, { title: 'Two' });
    await handleSceneCommand(args('reorder', { chapter: 1, order: '1' }), dir, out);
    expect(has('Failed to reorder scenes')).toBe(true);
  });

  // ── stats ──────────────────────────────────────────────────────────────────
  it('stats requires --chapter', async () => {
    await handleSceneCommand(args('stats'), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('stats reports chapter not found', async () => {
    await handleSceneCommand(args('stats', { chapter: 3 }), dir, out);
    expect(has('Chapter 3 not found')).toBe(true);
  });

  it('stats renders per-scene breakdown', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' }, 'word word word');
    await handleSceneCommand(args('stats', { chapter: 1 }), dir, out);
    expect(has('Scene Statistics for Chapter 1')).toBe(true);
    expect(has('Per-scene breakdown')).toBe(true);
  });

  it('stats handles a chapter with no scenes', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('stats', { chapter: 1 }), dir, out);
    expect(has('Total scenes: 0')).toBe(true);
  });

  // ── sync ───────────────────────────────────────────────────────────────────
  it('sync errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'scene-empty-'));
    try {
      await handleSceneCommand(args('sync', { chapter: 1 }), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('sync requires --chapter', async () => {
    await handleSceneCommand(args('sync'), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('sync reports chapter not found', async () => {
    await handleSceneCommand(args('sync', { chapter: 6 }), dir, out);
    expect(has('Chapter 6 not found')).toBe(true);
  });

  it('sync reports failure when chapter not in database', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    // No chapters DB row seeded → syncChapterScenes throws → caught.
    await handleSceneCommand(args('sync', { chapter: 1 }), dir, out);
    expect(has('Failed to sync scenes')).toBe(true);
  });

  it('sync succeeds when chapter exists in database', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' }, 'some words');
    await seedChapterRow(ch, 1);
    await handleSceneCommand(args('sync', { chapter: 1 }), dir, out);
    expect(has('Scenes from chapter 1 synced to database')).toBe(true);
  });

  // ── tension-arc ──────────────────────────────────────────────────────────
  it('tension-arc errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'scene-empty2-'));
    try {
      await handleSceneCommand(args('tension-arc'), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('tension-arc reports no tension scenes', async () => {
    await handleSceneCommand(args('tension-arc'), dir, out);
    expect(has('No scenes with tension levels found')).toBe(true);
  });

  it('tension-arc renders the arc across chapters', async () => {
    const mcp = (ext as any).mcpClient;
    const pid = ext.getProjectId();
    await mcp.writeQuery(
      'INSERT INTO chapters (project_id, chapter_number, title) VALUES (?, ?, ?)',
      [pid, 1, 'Ch1']
    );
    await mcp.writeQuery(
      'INSERT INTO chapters (project_id, chapter_number, title) VALUES (?, ?, ?)',
      [pid, 2, 'Ch2']
    );
    const ch1 = (await mcp.readQuery('SELECT id FROM chapters WHERE chapter_number = 1', []))[0].id;
    const ch2 = (await mcp.readQuery('SELECT id FROM chapters WHERE chapter_number = 2', []))[0].id;
    await mcp.writeQuery(
      'INSERT INTO scenes (chapter_id, scene_number, title, tension_level) VALUES (?, ?, ?, ?)',
      [ch1, 1, 'A', 3]
    );
    await mcp.writeQuery(
      'INSERT INTO scenes (chapter_id, scene_number, title, tension_level) VALUES (?, ?, ?, ?)',
      [ch1, 2, 'B', 7]
    );
    await mcp.writeQuery(
      'INSERT INTO scenes (chapter_id, scene_number, title, tension_level) VALUES (?, ?, ?, ?)',
      [ch2, 1, 'C', 9]
    );
    await handleSceneCommand(args('tension-arc'), dir, out);
    expect(has('Tension Arc')).toBe(true);
    expect(has('Chapter 1:')).toBe(true);
    expect(has('Chapter 2:')).toBe(true);
  });

  // ── beats ──────────────────────────────────────────────────────────────────
  it('beats errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'scene-empty3-'));
    try {
      await handleSceneCommand(args('beats', { chapter: 1, scene: 1 }), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('beats requires a valid chapter number', async () => {
    await handleSceneCommand(args('beats', { scene: 1 }), dir, out);
    expect(has('Chapter number required')).toBe(true);
  });

  it('beats requires a valid scene number', async () => {
    await handleSceneCommand(args('beats', { chapter: 1 }), dir, out);
    expect(has('Scene number required')).toBe(true);
  });

  it('beats reports chapter not found', async () => {
    await handleSceneCommand(args('beats', { chapter: 9, scene: 1 }), dir, out);
    expect(has('Chapter 9 not found')).toBe(true);
  });

  it('beats reports scene not found in chapter', async () => {
    await makeChapter(1);
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1 }), dir, out);
    expect(has('Scene 1 not found in chapter 1')).toBe(true);
  });

  it('beats list reports no beats', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'list' }), dir, out);
    expect(has('No beats found for scene 1')).toBe(true);
  });

  it('beats list renders stored beats', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await ext.getSceneBuilder(ch).writeBeats(1, [
      { beatNumber: 1, description: 'first beat' },
      { beatNumber: 2, description: 'second beat' },
    ]);
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'list' }), dir, out);
    expect(has('first beat')).toBe(true);
    expect(has('2 beat(s)')).toBe(true);
  });

  it('beats clear removes beats', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await ext.getSceneBuilder(ch).writeBeats(1, [{ beatNumber: 1, description: 'x' }]);
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'clear' }), dir, out);
    expect(has('Beats cleared from chapter 1, scene 1')).toBe(true);
  });

  it('beats sync reports nothing to sync when file has no beats', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'sync' }), dir, out);
    expect(has('No beats in file to sync')).toBe(true);
  });

  it('beats sync reports scene missing from database', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await ext.getSceneBuilder(ch).writeBeats(1, [{ beatNumber: 1, description: 'a beat' }]);
    // No scenes DB row → resolveSceneId returns null.
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'sync' }), dir, out);
    expect(has('Scene not found in database')).toBe(true);
  });

  it('beats sync writes beats to the database', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await ext.getSceneBuilder(ch).writeBeats(1, [
      { beatNumber: 1, description: 'a beat' },
      { beatNumber: 2, description: 'another beat' },
    ]);
    const chapterId = await seedChapterRow(ch, 1);
    await (ext as any).mcpClient.writeQuery(
      'INSERT INTO scenes (chapter_id, scene_number, title) VALUES (?, ?, ?)',
      [chapterId, 1, 'One']
    );
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'sync' }), dir, out);
    expect(has('Synced 2 beat(s) to database')).toBe(true);
  });

  it('beats generate validates beat count', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One' });
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'generate', beats: 0 }), dir, out);
    expect(has('Beat count must be between 1 and 20')).toBe(true);
  });

  it('beats generate falls back to passthrough context when no API key', async () => {
    const ch = await makeChapter(1);
    await addSceneToFile(ch, { title: 'One', purpose: 'reveal' }, 'prose');
    await handleSceneCommand(args('beats', { chapter: 1, scene: 1, action: 'generate', beats: 3 }), dir, out);
    expect(has('SCENE BEAT CONTEXT')).toBe(true);
    expect(has('END CONTEXT')).toBe(true);
  });
});
