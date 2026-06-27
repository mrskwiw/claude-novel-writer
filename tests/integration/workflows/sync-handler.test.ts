/**
 * Integration Tests: sync-handler
 *
 * Tests all exported functions: handleSyncAll, handleSyncCharacters,
 * handleSyncLocations, handleSyncPlots, handleSyncChapters,
 * handleSyncTimeline, handleSyncWorldRules, handleSyncFromDb.
 *
 * Each function takes (args, CommandContext) where context = { cwd, extension, output }.
 * We mock the extension and filesystem as needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { NovelWriterExtension } from '../../../project/src/index.js';
import type { ParsedArgs, CommandContext, OutputFormatter } from '../../../project/src/cli/types.js';
import {
  handleSyncAll,
  handleSyncCharacters,
  handleSyncLocations,
  handleSyncPlots,
  handleSyncChapters,
  handleSyncTimeline,
  handleSyncWorldRules,
  handleSyncFromDb,
} from '../../../project/src/cli/handlers/sync-handler.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function createMockOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (msg) => log.push(`SUCCESS: ${msg}`),
    error: (msg) => log.push(`ERROR: ${msg}`),
    warning: (msg) => log.push(`WARNING: ${msg}`),
    info: (msg) => log.push(`INFO: ${msg}`),
    dim: (msg) => log.push(`DIM: ${msg}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: (msg) => ({ stop: (m?: string) => log.push(`SPINNER_STOP: ${m ?? msg}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'sync',
    subcommand: undefined,
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

function makeMockExtension(cwd: string) {
  const ext = new NovelWriterExtension(cwd);
  const mock = new MockMCPClient();
  (ext as any).mcpClient = mock;
  (ext as any).projectId = 1;

  // Stub getCharacterSync, getLocationSync, etc. to return objects with working stubs
  (ext as any).getCharacterSync = () => ({
    syncCharacterFile: async () => {},
    syncRelationshipsFromFile: async () => {},
    exportToYAML: async (id: string) => join(cwd, `characters/${id}.yml`),
  });
  (ext as any).getLocationSync = () => ({
    syncLocationFile: async () => {},
    exportToYAML: async (id: string) => join(cwd, `locations/${id}.yml`),
  });
  (ext as any).getPlotSync = () => ({
    syncPlotFile: async () => {},
  });
  (ext as any).getPlotThreadSync = () => ({
    exportToYAML: async (id: string) => join(cwd, `plots/${id}.yml`),
  });
  (ext as any).getChapterSync = () => ({
    syncChapterFile: async () => {},
    exportToFile: async (id: number) => join(cwd, `chapters/chapter-${id}.md`),
  });
  (ext as any).getTimelineSync = () => ({
    syncAllTimelines: async () => ({ synced: 0, errors: [] }),
  });
  (ext as any).getWorldRulesSync = () => ({
    syncAllFromDirectory: async () => 0,
    exportToYAML: async (id: string) => join(cwd, `world-rules/${id}.yml`),
  });
  (ext as any).getSnapshotManager = () => ({
    create: async () => {},
  });

  return ext;
}

function makeContext(cwd: string, output: OutputFormatter, extension?: NovelWriterExtension): CommandContext {
  return { cwd, output, extension };
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('sync-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-sync-test-${id}`);
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  // ── handleSyncAll ──────────────────────────────────────────────────────────

  describe('handleSyncAll', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('runs sync when extension is provided and no dirs exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Sync Complete'))).toBe(true);
    });

    it('syncs character files when characters/ dir exists', async () => {
      await mkdir(join(projectPath, 'characters'), { recursive: true });
      await writeFile(join(projectPath, 'characters', 'hero.yml'), 'name: Hero\nrole: protagonist\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('syncs locations when locations/ dir exists', async () => {
      await mkdir(join(projectPath, 'locations'), { recursive: true });
      await writeFile(join(projectPath, 'locations', 'castle.yml'), 'name: Castle\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('syncs chapters when chapters/ dir exists', async () => {
      await mkdir(join(projectPath, 'chapters'), { recursive: true });
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('syncs timeline when timeline/ dir exists', async () => {
      await mkdir(join(projectPath, 'timeline'), { recursive: true });

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('syncs world-rules when world-rules/ dir exists', async () => {
      await mkdir(join(projectPath, 'world-rules'), { recursive: true });
      await writeFile(join(projectPath, 'world-rules', 'magic.yml'), 'name: Magic\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('handles character sync failure gracefully', async () => {
      await mkdir(join(projectPath, 'characters'), { recursive: true });
      await writeFile(join(projectPath, 'characters', 'bad.yml'), 'INVALID YAML: {{{');

      const ext = makeMockExtension(projectPath);
      // Make syncCharacterFile throw
      (ext as any).getCharacterSync = () => ({
        syncCharacterFile: async () => { throw new Error('parse error'); },
        syncRelationshipsFromFile: async () => {},
      });
      const { log, output } = createMockOutput();
      await handleSyncAll(makeArgs(), makeContext(projectPath, output, ext));
      // Should still reach SUCCESS / complete
      expect(log.some((l) => l.includes('SUCCESS') || l.includes('SPINNER_STOP'))).toBe(true);
    });
  });

  // ── handleSyncCharacters ──────────────────────────────────────────────────

  describe('handleSyncCharacters', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncCharacters(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when characters/ dir does not exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncCharacters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('shows info when no yaml files found', async () => {
      await mkdir(join(projectPath, 'characters'), { recursive: true });
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncCharacters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('No character files'))).toBe(true);
    });

    it('syncs characters when yaml files exist', async () => {
      await mkdir(join(projectPath, 'characters'), { recursive: true });
      await writeFile(join(projectPath, 'characters', 'hero.yml'), 'name: Hero\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncCharacters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('1 character'))).toBe(true);
    });

    it('reports failed files when syncCharacterFile throws', async () => {
      await mkdir(join(projectPath, 'characters'), { recursive: true });
      await writeFile(join(projectPath, 'characters', 'bad.yml'), 'invalid: {');

      const ext = makeMockExtension(projectPath);
      (ext as any).getCharacterSync = () => ({
        syncCharacterFile: async () => { throw new Error('parse error'); },
        syncRelationshipsFromFile: async () => {},
      });
      const { log, output } = createMockOutput();
      await handleSyncCharacters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('WARNING') || l.includes('failed'))).toBe(true);
    });
  });

  // ── handleSyncLocations ───────────────────────────────────────────────────

  describe('handleSyncLocations', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncLocations(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when locations/ dir does not exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncLocations(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('shows info when no yaml files found', async () => {
      await mkdir(join(projectPath, 'locations'), { recursive: true });
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncLocations(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('No location files'))).toBe(true);
    });

    it('syncs locations when yaml files exist', async () => {
      await mkdir(join(projectPath, 'locations'), { recursive: true });
      await writeFile(join(projectPath, 'locations', 'forest.yml'), 'name: Forest\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncLocations(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('1 location'))).toBe(true);
    });
  });

  // ── handleSyncPlots ───────────────────────────────────────────────────────

  describe('handleSyncPlots', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncPlots(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when plots/ dir does not exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncPlots(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('shows info when no yaml files found', async () => {
      await mkdir(join(projectPath, 'plots'), { recursive: true });
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncPlots(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('No plot thread files'))).toBe(true);
    });

    it('syncs plots when yaml files exist', async () => {
      await mkdir(join(projectPath, 'plots'), { recursive: true });
      await writeFile(join(projectPath, 'plots', 'main.yml'), 'name: Main Plot\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncPlots(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('plot thread'))).toBe(true);
    });
  });

  // ── handleSyncChapters ────────────────────────────────────────────────────

  describe('handleSyncChapters', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncChapters(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when chapters/ dir does not exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncChapters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('shows info when no md files found', async () => {
      await mkdir(join(projectPath, 'chapters'), { recursive: true });
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncChapters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('No chapter files'))).toBe(true);
    });

    it('syncs chapters when md files exist', async () => {
      await mkdir(join(projectPath, 'chapters'), { recursive: true });
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncChapters(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('chapter'))).toBe(true);
    });
  });

  // ── handleSyncTimeline ────────────────────────────────────────────────────

  describe('handleSyncTimeline', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncTimeline(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('syncs timeline events', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncTimeline(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('timeline event'))).toBe(true);
    });

    it('reports errors when sync returns failures', async () => {
      const ext = makeMockExtension(projectPath);
      (ext as any).getTimelineSync = () => ({
        syncAllTimelines: async () => ({ synced: 2, errors: ['file1.yml: bad format'] }),
      });
      const { log, output } = createMockOutput();
      await handleSyncTimeline(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('WARNING'))).toBe(true);
    });
  });

  // ── handleSyncWorldRules ──────────────────────────────────────────────────

  describe('handleSyncWorldRules', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncWorldRules(makeArgs(), makeContext(projectPath, output, undefined));
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when world-rules/ dir does not exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncWorldRules(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('syncs world rules when dir exists', async () => {
      await mkdir(join(projectPath, 'world-rules'), { recursive: true });
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncWorldRules(makeArgs(), makeContext(projectPath, output, ext));
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('world rule'))).toBe(true);
    });
  });

  // ── handleSyncFromDb ──────────────────────────────────────────────────────

  describe('handleSyncFromDb', () => {
    it('errors when extension is not provided', async () => {
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['characters'] }),
        makeContext(projectPath, output, undefined),
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when entity type is unsupported', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['invalid-type'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('Unknown entity type'))).toBe(true);
    });

    it('runs characters export with no DB records', async () => {
      const ext = makeMockExtension(projectPath);
      const mock = (ext as any).mcpClient as MockMCPClient;
      mock.seed('characters', []);

      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['characters'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Reverse sync complete'))).toBe(true);
    });

    it('runs all exports when type is "all"', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['all'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Reverse sync complete'))).toBe(true);
    });

    it('defaults to "all" when positional is empty', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: [] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Reverse sync complete'))).toBe(true);
    });

    it('runs locations export', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['locations'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('runs world-rules export', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['world-rules'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('runs plot-threads export', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['plot-threads'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('runs chapters export', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleSyncFromDb(
        makeArgs({ positional: ['chapters'] }),
        makeContext(projectPath, output, ext),
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });
  });
});
