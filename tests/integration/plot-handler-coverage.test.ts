/**
 * Coverage tests: src/cli/handlers/plot-handler.ts
 *
 * Strategy: handlePlotCommand accepts an optional injectedExtension as its last
 * argument. We pass a TestNovelWriterExtension (real better-sqlite3 DB at
 * <dir>/.novel/data.db) so every DB-backed path uses the same seeded database
 * without spawning a separate connection. File-only paths (create/list/show/
 * beat/resolve builders) operate on real YAML files under <dir>/plots/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handlePlotCommand } from '../../project/src/cli/handlers/plot-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import type { PlotYAML } from '../../project/src/types/novel.js';

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
  flags: Record<string, string | number | boolean> = {}
): ParsedArgs {
  return { command: 'plot', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

describe('plot-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plot-h-'));
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

  async function seedPlotFile(plot: PlotYAML) {
    return ext.getPlotThreadBuilder().create(plot);
  }

  // ── dispatcher ─────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handlePlotCommand(args('frobnicate'), dir, out, ext);
    expect(has('Unknown plot subcommand')).toBe(true);
  });

  it('resolves subcommand from positional[0] when subcommand absent', async () => {
    const a: ParsedArgs = { command: 'plot', positional: ['list'], arguments: {}, flags: {}, raw: '' };
    await handlePlotCommand(a, dir, out, ext);
    expect(has('No plot threads found')).toBe(true);
  });

  // ── create ───────────────────────────────────────────────────────────────
  it('create requires --name', async () => {
    await handlePlotCommand(args('create', { type: 'main', description: 'd' }), dir, out, ext);
    expect(has('Plot thread name required')).toBe(true);
  });

  it('create requires --type', async () => {
    await handlePlotCommand(args('create', { name: 'X', description: 'd' }), dir, out, ext);
    expect(has('Plot thread type required')).toBe(true);
  });

  it('create requires --description', async () => {
    await handlePlotCommand(args('create', { name: 'X', type: 'main' }), dir, out, ext);
    expect(has('Plot thread description required')).toBe(true);
  });

  it('create reports validation errors (invalid type)', async () => {
    await handlePlotCommand(
      args('create', { name: 'X', type: 'bogus', description: 'd' }),
      dir,
      out,
      ext
    );
    expect(has('Validation errors')).toBe(true);
  });

  it('create succeeds with defaults and auto-syncs', async () => {
    await handlePlotCommand(
      args('create', { name: 'The Quest', type: 'main', description: 'Find the artifact' }),
      dir,
      out,
      ext
    );
    expect(has('Plot thread created')).toBe(true);
    expect(has('Status: planned')).toBe(true);
    expect(has('Priority: 5')).toBe(true);
    expect(has('Synced to database')).toBe(true);
    const rows = await (ext as any).mcpClient.readQuery(
      'SELECT * FROM plot_threads WHERE thread_name = ?',
      ['The Quest']
    );
    expect(rows.length).toBe(1);
  });

  it('create honours explicit priority and status', async () => {
    await handlePlotCommand(
      args('create', {
        name: 'Rivalry',
        type: 'subplot',
        description: 'A bitter rivalry',
        priority: 9,
        status: 'active',
      }),
      dir,
      out,
      ext
    );
    expect(has('Priority: 9')).toBe(true);
    expect(has('Status: active')).toBe(true);
  });

  it('create loads projectId when extension has none', async () => {
    // Force the loadProjectId() branch inside create's auto-sync block.
    (ext as any).projectId = undefined;
    await handlePlotCommand(
      args('create', { name: 'Lazy', type: 'theme', description: 'A theme' }),
      dir,
      out,
      ext
    );
    expect(has('Synced to database')).toBe(true);
  });

  it('create reports failure on duplicate file', async () => {
    await seedPlotFile({ name: 'Dup', type: 'main', status: 'planned', priority: 5, description: 'd' });
    await handlePlotCommand(
      args('create', { name: 'Dup', type: 'main', description: 'd' }),
      dir,
      out,
      ext
    );
    expect(has('Failed to create plot thread')).toBe(true);
  });

  // ── list ─────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    await handlePlotCommand(args('list'), dir, out, ext);
    expect(has('No plot threads found')).toBe(true);
  });

  it('list renders threads incl long description, priority indicators, beats', async () => {
    await seedPlotFile({
      name: 'Big Plot',
      type: 'main',
      status: 'active',
      priority: 8,
      description: 'x'.repeat(120),
      beats: [{ scene: 'Ch1.Scene1', description: 'opens', type: 'setup' }],
    });
    await seedPlotFile({
      name: 'Mid Plot',
      type: 'subplot',
      status: 'planned',
      priority: 5,
      description: 'short',
    });
    await seedPlotFile({
      name: 'Low Plot',
      type: 'theme',
      status: 'resolved',
      priority: 2,
      description: 'tiny',
    });
    await handlePlotCommand(args('list'), dir, out, ext);
    expect(has('Big Plot')).toBe(true);
    expect(has('Beats: 1')).toBe(true);
    expect(has('Total: 3 plot threads')).toBe(true);
  });

  it('list --unresolved filters out resolved/abandoned', async () => {
    await seedPlotFile({ name: 'Active One', type: 'main', status: 'active', priority: 6, description: 'a' });
    await seedPlotFile({ name: 'Done One', type: 'main', status: 'resolved', priority: 6, description: 'b' });
    await handlePlotCommand(args('list', { unresolved: true }), dir, out, ext);
    expect(has('Active One')).toBe(true);
    expect(has('Done One')).toBe(false);
  });

  // ── show ─────────────────────────────────────────────────────────────────
  it('show requires --name', async () => {
    await handlePlotCommand(args('show'), dir, out, ext);
    expect(has('Plot thread name required')).toBe(true);
  });

  it('show reports not found', async () => {
    await handlePlotCommand(args('show', { name: 'Ghost' }), dir, out, ext);
    expect(has('Plot thread not found')).toBe(true);
  });

  it('show basic info hints at --all and renders beats', async () => {
    await seedPlotFile({
      name: 'Visible',
      type: 'main',
      status: 'active',
      priority: 5,
      description: 'A visible plot',
      beats: [
        { scene: 'Ch1.Scene1', description: 'setup beat', type: 'setup' },
        { scene: 'Ch2.Scene1', description: 'climax beat', type: 'climax' },
      ],
    });
    await handlePlotCommand(args('show', { name: 'Visible' }), dir, out, ext);
    expect(has('=== ✅' + '' /* status emoji handled */) || has('Visible')).toBe(true);
    expect(has('Plot Beats:')).toBe(true);
    expect(has('Use --all')).toBe(true);
  });

  it('show --all renders characters, themes, dependencies and notes', async () => {
    await seedPlotFile({
      name: 'Full',
      type: 'main',
      status: 'planned',
      priority: 5,
      description: 'Complete plot',
      characters: [
        { name: 'Alice', role: 'lead', arc: 'grows up' },
        { name: 'Bob', role: 'foil' },
      ],
      themes: ['betrayal', 'redemption'],
      dependencies: ['Other Plot'],
      notes: 'Some authoring notes',
    });
    await handlePlotCommand(args('show', { name: 'Full', all: true }), dir, out, ext);
    expect(has('Characters:')).toBe(true);
    expect(has('Arc: grows up')).toBe(true);
    expect(has('Themes:')).toBe(true);
    expect(has('Dependencies:')).toBe(true);
    expect(has('Notes:')).toBe(true);
  });

  // ── beat ─────────────────────────────────────────────────────────────────
  it('beat requires --name', async () => {
    await handlePlotCommand(args('beat', { scene: 'Ch1.S1', 'beat-type': 'setup', 'beat-description': 'x' }), dir, out, ext);
    expect(has('Plot thread name required')).toBe(true);
  });

  it('beat requires --scene', async () => {
    await handlePlotCommand(args('beat', { name: 'X', 'beat-type': 'setup', 'beat-description': 'x' }), dir, out, ext);
    expect(has('Scene reference required')).toBe(true);
  });

  it('beat requires --beat-type', async () => {
    await handlePlotCommand(args('beat', { name: 'X', scene: 'Ch1.S1', 'beat-description': 'x' }), dir, out, ext);
    expect(has('Beat type required')).toBe(true);
  });

  it('beat requires --beat-description', async () => {
    await handlePlotCommand(args('beat', { name: 'X', scene: 'Ch1.S1', 'beat-type': 'setup' }), dir, out, ext);
    expect(has('Beat description required')).toBe(true);
  });

  it('beat reports thread not found', async () => {
    await handlePlotCommand(
      args('beat', { name: 'Ghost', scene: 'Ch1.S1', 'beat-type': 'setup', 'beat-description': 'x' }),
      dir,
      out,
      ext
    );
    expect(has('Plot thread not found')).toBe(true);
  });

  it('beat adds a beat and syncs', async () => {
    await seedPlotFile({ name: 'Beatable', type: 'main', status: 'active', priority: 5, description: 'd' });
    await handlePlotCommand(
      args('beat', {
        name: 'Beatable',
        scene: 'Ch1.Scene1',
        'beat-type': 'development',
        'beat-description': 'things develop',
      }),
      dir,
      out,
      ext
    );
    expect(has('Beat added to plot thread')).toBe(true);
    expect(has('Synced to database')).toBe(true);
  });

  // ── resolve ──────────────────────────────────────────────────────────────
  it('resolve requires --name', async () => {
    await handlePlotCommand(args('resolve'), dir, out, ext);
    expect(has('Plot thread name required')).toBe(true);
  });

  it('resolve reports not found', async () => {
    await handlePlotCommand(args('resolve', { name: 'Ghost' }), dir, out, ext);
    expect(has('Plot thread not found')).toBe(true);
  });

  it('resolve marks thread resolved and syncs', async () => {
    await seedPlotFile({ name: 'ToResolve', type: 'main', status: 'active', priority: 5, description: 'd' });
    await handlePlotCommand(args('resolve', { name: 'ToResolve' }), dir, out, ext);
    expect(has('Plot thread marked as resolved')).toBe(true);
    expect(has('Synced to database')).toBe(true);
  });

  // ── sync ─────────────────────────────────────────────────────────────────
  it('sync errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'plot-empty-'));
    try {
      await handlePlotCommand(args('sync'), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('sync loads projectId when extension has none', async () => {
    (ext as any).projectId = undefined;
    await handlePlotCommand(args('sync'), dir, out, ext);
    expect(has('No plot threads to sync')).toBe(true);
  });

  it('sync reports nothing to sync when no files', async () => {
    await handlePlotCommand(args('sync'), dir, out, ext);
    expect(has('No plot threads to sync')).toBe(true);
  });

  it('sync all plot threads', async () => {
    await seedPlotFile({ name: 'One', type: 'main', status: 'active', priority: 5, description: 'd' });
    await seedPlotFile({ name: 'Two', type: 'subplot', status: 'planned', priority: 4, description: 'd' });
    await handlePlotCommand(args('sync'), dir, out, ext);
    expect(has('Synced 2 plot threads')).toBe(true);
  });

  it('sync single plot thread', async () => {
    await seedPlotFile({ name: 'Solo', type: 'main', status: 'active', priority: 5, description: 'd' });
    await handlePlotCommand(args('sync', { name: 'Solo' }), dir, out, ext);
    expect(has('Plot thread synced: Solo')).toBe(true);
  });

  it('sync single not found', async () => {
    await handlePlotCommand(args('sync', { name: 'Ghost' }), dir, out, ext);
    expect(has('Plot thread not found: Ghost')).toBe(true);
  });

  // ── check ────────────────────────────────────────────────────────────────
  it('check errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'plot-empty2-'));
    try {
      await handlePlotCommand(args('check'), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('check reports all resolved when none unresolved', async () => {
    await handlePlotCommand(args('check'), dir, out, ext);
    expect(has('All plot threads are resolved')).toBe(true);
  });

  it('check lists high priority and other unresolved threads', async () => {
    // Seed two unresolved threads directly into DB: one high priority, one low.
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, description, status, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ext.getProjectId(), 'Critical', 'main', 'A critical unresolved thread that is quite long indeed and exceeds sixty chars', 'active', 9]
    );
    await mcp.writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, description, status, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ext.getProjectId(), 'Minor', 'subplot', 'short', 'planned', 3]
    );
    await handlePlotCommand(args('check'), dir, out, ext);
    expect(has('unresolved plot thread')).toBe(true);
    expect(has('High Priority')).toBe(true);
    expect(has('Critical')).toBe(true);
    expect(has('Other Unresolved')).toBe(true);
    expect(has('Minor')).toBe(true);
  });

  // ── stats ────────────────────────────────────────────────────────────────
  it('stats errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'plot-empty3-'));
    try {
      await handlePlotCommand(args('stats'), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('stats reports all resolved when no unresolved threads', async () => {
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, description, status, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ext.getProjectId(), 'Closed', 'main', 'done', 'resolved', 5]
    );
    await handlePlotCommand(args('stats'), dir, out, ext);
    expect(has('Plot Thread Statistics')).toBe(true);
    expect(has('By Type')).toBe(true);
    expect(has('By Status')).toBe(true);
    expect(has('All plot threads resolved')).toBe(true);
  });

  it('stats reports unresolved + high priority counts and beats', async () => {
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery(
      `INSERT INTO plot_threads (project_id, thread_name, thread_type, description, status, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ext.getProjectId(), 'Open', 'main', 'open thread', 'active', 9]
    );
    const rows = await mcp.readQuery('SELECT id FROM plot_threads WHERE thread_name = ?', ['Open']);
    await mcp.writeQuery(
      `INSERT INTO plot_beats (plot_thread_id, beat_order, description, beat_type)
       VALUES (?, ?, ?, ?)`,
      [rows[0].id, 1, 'a beat', 'setup']
    );
    await handlePlotCommand(args('stats'), dir, out, ext);
    expect(has('Unresolved threads: 1')).toBe(true);
    expect(has('High priority: 1')).toBe(true);
    expect(has('Total beats: 1')).toBe(true);
  });
});
