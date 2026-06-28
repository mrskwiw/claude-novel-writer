/**
 * Coverage tests: src/cli/handlers/location-handler.ts
 *
 * NOTE ON A REAL BUG (documented, not fixed):
 *   handleLocationCommand builds its own `new NovelWriterExtension(projectPath)`
 *   internally and never loads/sets the projectId. Consequently every DB-backed
 *   path (create→sync, edit→sync, sync, scenes) throws "Project ID not set".
 *   See the dedicated "documents real projectId bug" test below for the raw
 *   broken behavior. To exercise the otherwise-correct logic for coverage we
 *   spy on the private `ensureProjectId` so the internally-constructed
 *   extension resolves to the seeded project id — i.e. we simulate the fix.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { NovelWriterExtension } from '../../project/src/index.js';
import { handleLocationCommand } from '../../project/src/cli/handlers/location-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import type { LocationYAML } from '../../project/src/types/novel.js';

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

function args(subcommand: string, flags: Record<string, string | number | boolean> = {}): ParsedArgs {
  return { command: 'location', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

describe('location-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;
  let projectId: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'loc-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    projectId = ext.getProjectId()!;
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    ext?.cleanup();
    await rmRetry(dir);
  });

  /** Make internally-constructed extensions resolve the seeded project id. */
  function patchProjectId() {
    vi.spyOn(NovelWriterExtension.prototype as any, 'ensureProjectId').mockImplementation(
      function (this: any) {
        if (this.projectId == null) this.projectId = projectId;
      }
    );
  }

  async function seedLocationFile(loc: LocationYAML) {
    return ext.getLocationBuilder().createFromObject(loc);
  }

  // ── regression: handler now resolves the projectId (no spy needed) ─────────
  it('create + sync resolve the projectId (regression: was "Project ID not set")', async () => {
    await handleLocationCommand(args('create', { name: 'BugTown', description: 'A place' }), dir, out);
    expect(log.some((l) => l.includes('Location created: '))).toBe(true);
    // The handler now calls loadProjectId(), so the DB sync no longer throws.
    expect(log.some((l) => l.includes('Project ID not set'))).toBe(false);
  });

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleLocationCommand(args('frobnicate'), dir, out);
    expect(log.some((l) => l.includes('Unknown location subcommand'))).toBe(true);
  });

  // ── create ────────────────────────────────────────────────────────────────
  it('create requires --name', async () => {
    await handleLocationCommand(args('create', { description: 'd' }), dir, out);
    expect(log.some((l) => l.includes('Location name required'))).toBe(true);
  });

  it('create requires --description', async () => {
    await handleLocationCommand(args('create', { name: 'X' }), dir, out);
    expect(log.some((l) => l.includes('Location description required'))).toBe(true);
  });

  it('create reports validation errors', async () => {
    // name present but description is whitespace → passes truthy guard, fails validate()
    await handleLocationCommand(args('create', { name: 'X', description: '   ' }), dir, out);
    expect(log.some((l) => l.includes('Validation errors'))).toBe(true);
  });

  it('create succeeds and syncs (spy)', async () => {
    patchProjectId();
    await handleLocationCommand(
      args('create', { name: 'Ironhold', description: 'A fortress', type: 'city', parent: 'North' }),
      dir,
      out
    );
    expect(log.some((l) => l.includes('Location created: '))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
    const rows = await (ext as any).mcpClient.readQuery('SELECT * FROM locations WHERE name = ?', ['Ironhold']);
    expect(rows.length).toBe(1);
  });

  it('create reports failure on duplicate file', async () => {
    patchProjectId();
    await seedLocationFile({ name: 'Dup', description: 'A place' });
    await handleLocationCommand(args('create', { name: 'Dup', description: 'A place' }), dir, out);
    expect(log.some((l) => l.includes('Failed to create location'))).toBe(true);
  });

  // ── list ──────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    await handleLocationCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('No locations found'))).toBe(true);
  });

  it('list renders locations with long and short descriptions', async () => {
    await seedLocationFile({
      name: 'Ironhold',
      type: 'city',
      parentLocation: 'North',
      description: 'x'.repeat(80),
    });
    await seedLocationFile({ name: 'Hut', description: 'tiny' });
    await handleLocationCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('Ironhold'))).toBe(true);
    expect(log.some((l) => l.includes('Total: 2 locations'))).toBe(true);
  });

  // ── show ──────────────────────────────────────────────────────────────────
  it('show requires --name', async () => {
    await handleLocationCommand(args('show'), dir, out);
    expect(log.some((l) => l.includes('Location name required'))).toBe(true);
  });

  it('show reports not found', async () => {
    await handleLocationCommand(args('show', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('Location not found'))).toBe(true);
  });

  it('show basic info hints at --all', async () => {
    await seedLocationFile({ name: 'Ironhold', type: 'city', description: 'A fortress' });
    await handleLocationCommand(args('show', { name: 'Ironhold' }), dir, out);
    expect(log.some((l) => l.includes('=== Ironhold ==='))).toBe(true);
    expect(log.some((l) => l.includes('Use --all'))).toBe(true);
  });

  it('show --all renders details, rules, first appearance and notes', async () => {
    await seedLocationFile({
      name: 'Ironhold',
      type: 'city',
      parentLocation: 'North',
      description: 'A fortress',
      details: { size: 'large', population: '10000' },
      rules: ['No magic', 'Quiet at night'],
      firstAppearance: 'Chapter 1',
      notes: 'Built by dwarves',
    });
    await handleLocationCommand(args('show', { name: 'Ironhold', all: true }), dir, out);
    expect(log.some((l) => l.includes('Details:'))).toBe(true);
    expect(log.some((l) => l.includes('Location Rules:'))).toBe(true);
    expect(log.some((l) => l.includes('First Appearance:'))).toBe(true);
    expect(log.some((l) => l.includes('Notes:'))).toBe(true);
  });

  // ── edit ──────────────────────────────────────────────────────────────────
  it('edit requires --name', async () => {
    await handleLocationCommand(args('edit'), dir, out);
    expect(log.some((l) => l.includes('Location name required'))).toBe(true);
  });

  it('edit reports not found', async () => {
    await handleLocationCommand(args('edit', { name: 'Ghost', type: 'city' }), dir, out);
    expect(log.some((l) => l.includes('Location not found'))).toBe(true);
  });

  it('edit errors when no updates specified', async () => {
    await seedLocationFile({ name: 'Ironhold', description: 'A fortress' });
    await handleLocationCommand(args('edit', { name: 'Ironhold' }), dir, out);
    expect(log.some((l) => l.includes('No updates specified'))).toBe(true);
  });

  it('edit applies updates and syncs (spy)', async () => {
    patchProjectId();
    await seedLocationFile({ name: 'Ironhold', description: 'A fortress' });
    await handleLocationCommand(
      args('edit', { name: 'Ironhold', description: 'A bigger fortress', type: 'city', parent: '' }),
      dir,
      out
    );
    expect(log.some((l) => l.includes('Location updated: Ironhold'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── delete ────────────────────────────────────────────────────────────────
  it('delete requires --name', async () => {
    await handleLocationCommand(args('delete'), dir, out);
    expect(log.some((l) => l.includes('Location name required'))).toBe(true);
  });

  it('delete reports not found', async () => {
    await handleLocationCommand(args('delete', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('Location not found'))).toBe(true);
  });

  it('delete removes the file', async () => {
    await seedLocationFile({ name: 'Ironhold', description: 'A fortress' });
    await handleLocationCommand(args('delete', { name: 'Ironhold' }), dir, out);
    expect(log.some((l) => l.includes('Location deleted: Ironhold'))).toBe(true);
    const files = await ext.getLocationBuilder().list();
    expect(files.length).toBe(0);
  });

  // ── sync ──────────────────────────────────────────────────────────────────
  it('sync errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'loc-empty-'));
    try {
      await handleLocationCommand(args('sync'), empty, out);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('sync reports nothing to sync when no files', async () => {
    patchProjectId();
    await handleLocationCommand(args('sync'), dir, out);
    expect(log.some((l) => l.includes('No locations to sync'))).toBe(true);
  });

  it('sync all locations (spy)', async () => {
    patchProjectId();
    await seedLocationFile({ name: 'Ironhold', description: 'A fortress' });
    await seedLocationFile({ name: 'Hut', description: 'tiny' });
    await handleLocationCommand(args('sync'), dir, out);
    expect(log.some((l) => l.includes('Synced 2 locations'))).toBe(true);
  });

  it('sync single location (spy)', async () => {
    patchProjectId();
    await seedLocationFile({ name: 'Ironhold', description: 'A fortress' });
    await handleLocationCommand(args('sync', { name: 'Ironhold' }), dir, out);
    expect(log.some((l) => l.includes('Location synced: Ironhold'))).toBe(true);
  });

  it('sync single not found', async () => {
    patchProjectId();
    await handleLocationCommand(args('sync', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('Location not found: Ghost'))).toBe(true);
  });

  // ── scenes ────────────────────────────────────────────────────────────────
  it('scenes errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'loc-empty2-'));
    try {
      await handleLocationCommand(args('scenes', { name: 'X' }), empty, out);
      expect(log.some((l) => l.includes('Project not initialized'))).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('scenes requires --name', async () => {
    await handleLocationCommand(args('scenes'), dir, out);
    expect(log.some((l) => l.includes('Location name required'))).toBe(true);
  });

  it('scenes reports location not in database', async () => {
    await handleLocationCommand(args('scenes', { name: 'Ghost' }), dir, out);
    expect(log.some((l) => l.includes('Location not found in database'))).toBe(true);
  });

  it('scenes reports no scenes for a location', async () => {
    patchProjectId();
    await (ext as any).mcpClient.writeQuery(
      'INSERT INTO locations (project_id, name, description) VALUES (?, ?, ?)',
      [projectId, 'Ironhold', 'A fortress']
    );
    await handleLocationCommand(args('scenes', { name: 'Ironhold' }), dir, out);
    expect(log.some((l) => l.includes('No scenes found set in Ironhold'))).toBe(true);
  });

  it('scenes lists scenes grouped by chapter (spy)', async () => {
    patchProjectId();
    const mcp = (ext as any).mcpClient;
    await mcp.writeQuery('INSERT INTO locations (project_id, name, description) VALUES (?, ?, ?)', [
      projectId,
      'Ironhold',
      'A fortress',
    ]);
    const locRows = await mcp.readQuery('SELECT id FROM locations WHERE name = ?', ['Ironhold']);
    const locationId = locRows[0].id;
    await mcp.writeQuery(
      'INSERT INTO chapters (project_id, chapter_number, title) VALUES (?, ?, ?)',
      [projectId, 1, 'The Gates']
    );
    const chRows = await mcp.readQuery('SELECT id FROM chapters WHERE chapter_number = 1', []);
    const chapterId = chRows[0].id;
    await mcp.writeQuery(
      'INSERT INTO scenes (chapter_id, scene_number, title, location_id, word_count) VALUES (?, ?, ?, ?, ?)',
      [chapterId, 1, 'Arrival', locationId, 500]
    );
    await mcp.writeQuery(
      'INSERT INTO scenes (chapter_id, scene_number, title, location_id, word_count) VALUES (?, ?, ?, ?, ?)',
      [chapterId, 2, 'Departure', locationId, 300]
    );

    await handleLocationCommand(args('scenes', { name: 'Ironhold' }), dir, out);
    expect(log.some((l) => l.includes('Scenes set in Ironhold'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter 1: The Gates'))).toBe(true);
    expect(log.some((l) => l.includes('Total: 2 scenes'))).toBe(true);
  });
});
