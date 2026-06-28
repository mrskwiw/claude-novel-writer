/**
 * Coverage tests: src/cli/handlers/sync-handler.ts
 *
 * Standalone coverage for every exported sync function, targeting the branches
 * the workflow test leaves out: per-file failure reporting, handleSyncAll outer
 * catch branches, the reverse-sync (from-db) export loops with real rows, the
 * runExport catch path, and the snapshot-create failure path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../mocks/mcp-client.mock.js';
import { NovelWriterExtension } from '../../project/src/index.js';
import type { ParsedArgs, CommandContext, OutputFormatter } from '../../project/src/cli/types.js';
import {
  handleSyncAll,
  handleSyncCharacters,
  handleSyncLocations,
  handleSyncPlots,
  handleSyncChapters,
  handleSyncTimeline,
  handleSyncWorldRules,
  handleSyncFromDb,
} from '../../project/src/cli/handlers/sync-handler.js';

function makeOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: (m) => ({ stop: (msg?: string) => log.push(`SPINNER: ${msg ?? m}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return { command: 'sync', subcommand: undefined, positional: [], arguments: {}, flags: {}, raw: '', ...overrides };
}

function ctx(cwd: string, output: OutputFormatter, extension?: NovelWriterExtension): CommandContext {
  return { cwd, output, extension };
}

/** Extension whose sync sub-objects are simple working stubs. */
function makeExt(cwd: string): NovelWriterExtension {
  const ext = new NovelWriterExtension(cwd);
  const mock = new MockMCPClient();
  (ext as any).mcpClient = mock;
  (ext as any).projectId = 1;
  (ext as any).getCharacterSync = () => ({
    syncCharacterFile: async () => {},
    syncRelationshipsFromFile: async () => {},
    exportToYAML: async (id: string) => join(cwd, `characters/${id}.yml`),
  });
  (ext as any).getLocationSync = () => ({
    syncLocationFile: async () => {},
    exportToYAML: async (id: string) => join(cwd, `locations/${id}.yml`),
  });
  (ext as any).getPlotSync = () => ({ syncPlotFile: async () => {} });
  (ext as any).getPlotThreadSync = () => ({ exportToYAML: async (id: string) => join(cwd, `plots/${id}.yml`) });
  (ext as any).getChapterSync = () => ({
    syncChapterFile: async () => {},
    exportToFile: async (id: number) => join(cwd, `chapters/chapter-${id}.md`),
  });
  (ext as any).getTimelineSync = () => ({ syncAllTimelines: async () => ({ synced: 0, errors: [] }) });
  (ext as any).getWorldRulesSync = () => ({
    syncAllFromDirectory: async () => 0,
    exportToYAML: async (id: string) => join(cwd, `world-rules/${id}.yml`),
  });
  (ext as any).getSnapshotManager = () => ({ create: async () => {} });
  return ext;
}

describe('sync-handler coverage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `sync-h-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // ── handleSyncAll ──────────────────────────────────────────────────────────
  it('handleSyncAll errors with no extension', async () => {
    const { log, output } = makeOutput();
    await handleSyncAll(makeArgs(), ctx(dir, output));
    expect(log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  it('handleSyncAll completes across all populated dirs (with per-file failures)', async () => {
    for (const d of ['characters', 'locations', 'plots', 'chapters', 'timeline', 'world-rules']) {
      await mkdir(join(dir, d), { recursive: true });
    }
    await writeFile(join(dir, 'characters', 'a.yml'), 'name: A\n');
    await writeFile(join(dir, 'locations', 'l.yml'), 'name: L\n');
    await writeFile(join(dir, 'plots', 'p.yml'), 'name: P\n');
    await writeFile(join(dir, 'chapters', 'c.md'), '---\ntitle: C\n---\n');

    const ext = makeExt(dir);
    // Make each per-file sync throw so the `failed++` branches run.
    (ext as any).getCharacterSync = () => ({
      syncCharacterFile: async () => { throw new Error('x'); },
      syncRelationshipsFromFile: async () => { throw new Error('rel'); },
    });
    (ext as any).getLocationSync = () => ({ syncLocationFile: async () => { throw new Error('x'); } });
    (ext as any).getPlotSync = () => ({ syncPlotFile: async () => { throw new Error('x'); } });
    (ext as any).getChapterSync = () => ({ syncChapterFile: async () => { throw new Error('x'); } });
    (ext as any).getTimelineSync = () => ({ syncAllTimelines: async () => ({ synced: 1, errors: ['boom'] }) });
    (ext as any).getWorldRulesSync = () => ({ syncAllFromDirectory: async () => 2 });

    const { log, output } = makeOutput();
    await handleSyncAll(makeArgs(), ctx(dir, output, ext));
    expect(log.some((l) => l.includes('SUCCESS: Sync Complete'))).toBe(true);
  });

  it('handleSyncAll hits outer catch branches when get*Sync throws', async () => {
    for (const d of ['characters', 'locations', 'plots', 'chapters', 'timeline', 'world-rules']) {
      await mkdir(join(dir, d), { recursive: true });
    }
    const ext = makeExt(dir);
    const boom = () => { throw new Error('svc gone'); };
    (ext as any).getCharacterSync = boom;
    (ext as any).getLocationSync = boom;
    (ext as any).getPlotSync = boom;
    (ext as any).getChapterSync = boom;
    (ext as any).getTimelineSync = boom;
    (ext as any).getWorldRulesSync = boom;

    const { log, output } = makeOutput();
    await handleSyncAll(makeArgs(), ctx(dir, output, ext));
    expect(log.some((l) => l.includes('Character sync error'))).toBe(true);
    expect(log.some((l) => l.includes('World rules sync error'))).toBe(true);
  });

  // ── handleSyncCharacters ───────────────────────────────────────────────────
  it('handleSyncCharacters errors without extension', async () => {
    const { log, output } = makeOutput();
    await handleSyncCharacters(makeArgs(), ctx(dir, output));
    expect(log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  it('handleSyncCharacters errors when dir missing', async () => {
    const { log, output } = makeOutput();
    await handleSyncCharacters(makeArgs(), ctx(dir, output, makeExt(dir)));
    expect(log.some((l) => l.includes('not found'))).toBe(true);
  });

  it('handleSyncCharacters reports no files', async () => {
    await mkdir(join(dir, 'characters'), { recursive: true });
    const { log, output } = makeOutput();
    await handleSyncCharacters(makeArgs(), ctx(dir, output, makeExt(dir)));
    expect(log.some((l) => l.includes('No character files'))).toBe(true);
  });

  it('handleSyncCharacters syncs and resolves relationships', async () => {
    await mkdir(join(dir, 'characters'), { recursive: true });
    await writeFile(join(dir, 'characters', 'h.yml'), 'name: H\n');
    const { log, output } = makeOutput();
    await handleSyncCharacters(makeArgs(), ctx(dir, output, makeExt(dir)));
    expect(log.some((l) => l.includes('SUCCESS') && l.includes('1 character'))).toBe(true);
  });

  it('handleSyncCharacters reports per-file failures and a relationship failure', async () => {
    await mkdir(join(dir, 'characters'), { recursive: true });
    await writeFile(join(dir, 'characters', 'bad.yml'), 'name: bad\n');
    const ext = makeExt(dir);
    (ext as any).getCharacterSync = () => ({
      syncCharacterFile: async () => { throw new Error('parse'); },
      syncRelationshipsFromFile: async () => { throw new Error('rel'); },
    });
    const { log, output } = makeOutput();
    await handleSyncCharacters(makeArgs(), ctx(dir, output, ext));
    expect(log.some((l) => l.includes('WARNING') && l.includes('failed'))).toBe(true);
  });

  it('handleSyncCharacters outer catch when getCharacterSync throws', async () => {
    await mkdir(join(dir, 'characters'), { recursive: true });
    await writeFile(join(dir, 'characters', 'h.yml'), 'name: H\n');
    const ext = makeExt(dir);
    (ext as any).getCharacterSync = () => { throw new Error('gone'); };
    const { log, output } = makeOutput();
    await handleSyncCharacters(makeArgs(), ctx(dir, output, ext));
    expect(log.some((l) => l.includes('Character sync failed'))).toBe(true);
  });

  // ── handleSyncLocations ────────────────────────────────────────────────────
  it('handleSyncLocations covers missing/empty/sync/failure/catch', async () => {
    // missing dir
    let o = makeOutput();
    await handleSyncLocations(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('not found'))).toBe(true);

    await mkdir(join(dir, 'locations'), { recursive: true });
    // empty
    o = makeOutput();
    await handleSyncLocations(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('No location files'))).toBe(true);

    await writeFile(join(dir, 'locations', 'l.yml'), 'name: L\n');
    // success
    o = makeOutput();
    await handleSyncLocations(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('1 location'))).toBe(true);

    // per-file failure
    let ext = makeExt(dir);
    (ext as any).getLocationSync = () => ({ syncLocationFile: async () => { throw new Error('x'); } });
    o = makeOutput();
    await handleSyncLocations(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('WARNING') && l.includes('failed'))).toBe(true);

    // outer catch
    ext = makeExt(dir);
    (ext as any).getLocationSync = () => { throw new Error('gone'); };
    o = makeOutput();
    await handleSyncLocations(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('Location sync failed'))).toBe(true);

    // no extension
    o = makeOutput();
    await handleSyncLocations(makeArgs(), ctx(dir, o.output));
    expect(o.log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  // ── handleSyncPlots ────────────────────────────────────────────────────────
  it('handleSyncPlots covers missing/empty/sync/failure/catch', async () => {
    let o = makeOutput();
    await handleSyncPlots(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('not found'))).toBe(true);

    await mkdir(join(dir, 'plots'), { recursive: true });
    o = makeOutput();
    await handleSyncPlots(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('No plot thread files'))).toBe(true);

    await writeFile(join(dir, 'plots', 'p.yml'), 'name: P\n');
    o = makeOutput();
    await handleSyncPlots(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('plot thread'))).toBe(true);

    let ext = makeExt(dir);
    (ext as any).getPlotSync = () => ({ syncPlotFile: async () => { throw new Error('x'); } });
    o = makeOutput();
    await handleSyncPlots(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('WARNING') && l.includes('failed'))).toBe(true);

    ext = makeExt(dir);
    (ext as any).getPlotSync = () => { throw new Error('gone'); };
    o = makeOutput();
    await handleSyncPlots(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('Plot sync failed'))).toBe(true);

    o = makeOutput();
    await handleSyncPlots(makeArgs(), ctx(dir, o.output));
    expect(o.log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  // ── handleSyncChapters ─────────────────────────────────────────────────────
  it('handleSyncChapters covers missing/empty/sync/failure/catch', async () => {
    let o = makeOutput();
    await handleSyncChapters(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('not found'))).toBe(true);

    await mkdir(join(dir, 'chapters'), { recursive: true });
    o = makeOutput();
    await handleSyncChapters(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('No chapter files'))).toBe(true);

    await writeFile(join(dir, 'chapters', 'c.md'), '---\ntitle: C\n---\n');
    o = makeOutput();
    await handleSyncChapters(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('chapter'))).toBe(true);

    let ext = makeExt(dir);
    (ext as any).getChapterSync = () => ({ syncChapterFile: async () => { throw new Error('x'); } });
    o = makeOutput();
    await handleSyncChapters(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('WARNING') && l.includes('failed'))).toBe(true);

    ext = makeExt(dir);
    (ext as any).getChapterSync = () => { throw new Error('gone'); };
    o = makeOutput();
    await handleSyncChapters(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('Chapter sync failed'))).toBe(true);

    o = makeOutput();
    await handleSyncChapters(makeArgs(), ctx(dir, o.output));
    expect(o.log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  // ── handleSyncTimeline ─────────────────────────────────────────────────────
  it('handleSyncTimeline covers success/errors/catch/no-ext', async () => {
    let o = makeOutput();
    await handleSyncTimeline(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('timeline event'))).toBe(true);

    let ext = makeExt(dir);
    (ext as any).getTimelineSync = () => ({ syncAllTimelines: async () => ({ synced: 2, errors: ['e1'] }) });
    o = makeOutput();
    await handleSyncTimeline(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('WARNING'))).toBe(true);

    ext = makeExt(dir);
    (ext as any).getTimelineSync = () => ({ syncAllTimelines: async () => { throw new Error('gone'); } });
    o = makeOutput();
    await handleSyncTimeline(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('Timeline sync failed'))).toBe(true);

    o = makeOutput();
    await handleSyncTimeline(makeArgs(), ctx(dir, o.output));
    expect(o.log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  // ── handleSyncWorldRules ───────────────────────────────────────────────────
  it('handleSyncWorldRules covers missing/success/catch/no-ext', async () => {
    let o = makeOutput();
    await handleSyncWorldRules(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('not found'))).toBe(true);

    await mkdir(join(dir, 'world-rules'), { recursive: true });
    o = makeOutput();
    await handleSyncWorldRules(makeArgs(), ctx(dir, o.output, makeExt(dir)));
    expect(o.log.some((l) => l.includes('world rule'))).toBe(true);

    const ext = makeExt(dir);
    (ext as any).getWorldRulesSync = () => ({ syncAllFromDirectory: async () => { throw new Error('gone'); } });
    o = makeOutput();
    await handleSyncWorldRules(makeArgs(), ctx(dir, o.output, ext));
    expect(o.log.some((l) => l.includes('World rules sync failed'))).toBe(true);

    o = makeOutput();
    await handleSyncWorldRules(makeArgs(), ctx(dir, o.output));
    expect(o.log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  // ── handleSyncFromDb ───────────────────────────────────────────────────────
  it('handleSyncFromDb errors without extension', async () => {
    const { log, output } = makeOutput();
    await handleSyncFromDb(makeArgs({ positional: ['characters'] }), ctx(dir, output));
    expect(log.some((l) => l.includes('ERROR'))).toBe(true);
  });

  it('handleSyncFromDb errors on unsupported type', async () => {
    const { log, output } = makeOutput();
    await handleSyncFromDb(makeArgs({ positional: ['nope'] }), ctx(dir, output, makeExt(dir)));
    expect(log.some((l) => l.includes('Unknown entity type'))).toBe(true);
  });

  it('handleSyncFromDb exports all types with real rows', async () => {
    const ext = makeExt(dir);
    const mock = (ext as any).mcpClient as MockMCPClient;
    mock.seed('characters', [{ id: 1, project_id: 1 }, { id: 2, project_id: 1 }]);
    mock.seed('locations', [{ id: 1, project_id: 1 }]);
    mock.seed('world_rules', [{ id: 1, project_id: 1 }]);
    mock.seed('plot_threads', [{ id: 1, project_id: 1 }]);
    mock.seed('chapters', [{ id: 1, project_id: 1 }]);

    const { log, output } = makeOutput();
    await handleSyncFromDb(makeArgs({ positional: ['all'] }), ctx(dir, output, ext));
    expect(log.some((l) => l.includes('Reverse sync complete'))).toBe(true);
    // each export emitted a path line (path separators are OS-specific)
    expect(log.some((l) => l.includes('1.yml'))).toBe(true);
    expect(log.some((l) => l.includes('chapter-1.md'))).toBe(true);
  });

  it('handleSyncFromDb defaults to "all" when positional empty', async () => {
    const { log, output } = makeOutput();
    await handleSyncFromDb(makeArgs({ positional: [] }), ctx(dir, output, makeExt(dir)));
    expect(log.some((l) => l.includes('Reverse sync complete'))).toBe(true);
  });

  it('handleSyncFromDb hits runExport catch when export throws', async () => {
    const ext = makeExt(dir);
    const mock = (ext as any).mcpClient as MockMCPClient;
    mock.seed('characters', [{ id: 1, project_id: 1 }]);
    (ext as any).getCharacterSync = () => ({ exportToYAML: async () => { throw new Error('export boom'); } });
    const { log, output } = makeOutput();
    await handleSyncFromDb(makeArgs({ positional: ['characters'] }), ctx(dir, output, ext));
    expect(log.some((l) => l.includes('Characters export error'))).toBe(true);
  });

  it('handleSyncFromDb tolerates a snapshot-create failure', async () => {
    const ext = makeExt(dir);
    (ext as any).getSnapshotManager = () => ({ create: async () => { throw new Error('no chapters dir'); } });
    const { log, output } = makeOutput();
    await handleSyncFromDb(makeArgs({ positional: ['characters'] }), ctx(dir, output, ext));
    // No auto-snapshot info line, but the reverse sync still completes.
    expect(log.some((l) => l.includes('Reverse sync complete'))).toBe(true);
    expect(log.some((l) => l.includes('Auto-snapshot'))).toBe(false);
  });
});
