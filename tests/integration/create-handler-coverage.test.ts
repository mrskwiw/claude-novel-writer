/**
 * Coverage tests: src/cli/handlers/create-handler.ts
 *
 * The create-handler functions take (args, CommandContext) where the context
 * carries an injected `extension`. We pass a TestNovelWriterExtension (real
 * better-sqlite3 DB) so the create + sync happy paths work end to end.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import {
  handleCreateCharacter,
  handleCreateLocation,
  handleCreateChapter,
  handleCreatePlot,
} from '../../project/src/cli/handlers/create-handler.js';
import type { ParsedArgs, CommandContext, OutputFormatter } from '../../project/src/cli/types.js';

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

function makeArgs(flags: Record<string, string | number | boolean> = {}): ParsedArgs {
  return { command: 'create', positional: [], arguments: {}, flags, raw: '' };
}

describe('create-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;
  let ctx: CommandContext;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'create-h-'));
    for (const d of ['characters', 'world', 'plots', 'chapters']) {
      await mkdir(join(dir, d), { recursive: true });
    }
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Sci-Fi', targetWordCount: 1000 });
    const o = makeOutput();
    log = o.log;
    out = o.out;
    ctx = { cwd: dir, extension: ext, output: out, projectId: ext.getProjectId() };
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  // ── character ───────────────────────────────────────────────────────────
  describe('handleCreateCharacter', () => {
    it('errors when extension missing', async () => {
      await handleCreateCharacter(makeArgs({ name: 'X', role: 'major', summary: 's' }), {
        cwd: dir,
        output: out,
      });
      expect(log.some((l) => l.includes('Extension not initialized'))).toBe(true);
    });

    it('falls back to interactive guidance when no flags', async () => {
      await handleCreateCharacter(makeArgs({}), ctx);
      expect(log.some((l) => l.includes('Character creation failed'))).toBe(true);
      expect(log.some((l) => l.startsWith('CODE:'))).toBe(true);
    });

    it('errors on missing --name (non-interactive)', async () => {
      await handleCreateCharacter(makeArgs({ role: 'major' }), ctx);
      expect(log.some((l) => l.includes('Missing required flag: --name'))).toBe(true);
    });

    it('errors on missing --role', async () => {
      await handleCreateCharacter(makeArgs({ name: 'Bob' }), ctx);
      expect(log.some((l) => l.includes('Missing required flag: --role'))).toBe(true);
    });

    it('errors on missing --summary', async () => {
      await handleCreateCharacter(makeArgs({ name: 'Bob', role: 'major' }), ctx);
      expect(log.some((l) => l.includes('Missing required flag: --summary'))).toBe(true);
    });

    it('creates a character with physical attributes and syncs', async () => {
      await handleCreateCharacter(
        makeArgs({
          name: 'Sarah Chen',
          role: 'protagonist',
          summary: 'A scientist',
          'full-name': 'Sarah A. Chen',
          age: '34',
          eyes: 'brown',
          hair: 'black',
          height: '180cm',
          build: 'slim',
        }),
        ctx
      );
      expect(log.some((l) => l.includes('Character created: Sarah Chen'))).toBe(true);
      const chars = await ext.getCharacterBuilder().list();
      expect(chars.length).toBe(1);
      const rows = await (ext as any).mcpClient.readQuery(
        'SELECT * FROM characters WHERE name = ?',
        ['Sarah Chen']
      );
      expect(rows.length).toBe(1);
    });

    it('reports failure when character already exists', async () => {
      const flags = { name: 'Dup', role: 'minor', summary: 's' };
      await handleCreateCharacter(makeArgs({ ...flags }), ctx);
      log.length = 0;
      await handleCreateCharacter(makeArgs({ ...flags }), ctx);
      expect(log.some((l) => l.includes('Failed to create character'))).toBe(true);
    });
  });

  // ── location ────────────────────────────────────────────────────────────
  describe('handleCreateLocation', () => {
    it('errors when extension missing', async () => {
      await handleCreateLocation(makeArgs({ name: 'X', description: 'd' }), { cwd: dir, output: out });
      expect(log.some((l) => l.includes('Extension not initialized'))).toBe(true);
    });

    it('falls back to interactive guidance when no flags', async () => {
      await handleCreateLocation(makeArgs({}), ctx);
      expect(log.some((l) => l.includes('Location creation failed'))).toBe(true);
      expect(log.some((l) => l.startsWith('CODE:'))).toBe(true);
    });

    it('errors on missing --name', async () => {
      await handleCreateLocation(makeArgs({ description: 'a place' }), ctx);
      expect(log.some((l) => l.includes('Missing required flag: --name'))).toBe(true);
    });

    it('errors on missing --description', async () => {
      await handleCreateLocation(makeArgs({ name: 'Ironhold' }), ctx);
      expect(log.some((l) => l.includes('Missing required flag: --description'))).toBe(true);
    });

    it('creates a location and syncs', async () => {
      await handleCreateLocation(
        makeArgs({ name: 'Ironhold', description: 'A fortress', type: 'city', parent: 'North' }),
        ctx
      );
      expect(log.some((l) => l.includes('Location created: Ironhold'))).toBe(true);
      const rows = await (ext as any).mcpClient.readQuery(
        'SELECT * FROM locations WHERE name = ?',
        ['Ironhold']
      );
      expect(rows.length).toBe(1);
    });

    it('reports failure when location already exists', async () => {
      const flags = { name: 'DupLoc', description: 'd' };
      await handleCreateLocation(makeArgs({ ...flags }), ctx);
      log.length = 0;
      await handleCreateLocation(makeArgs({ ...flags }), ctx);
      expect(log.some((l) => l.includes('Failed to create location'))).toBe(true);
    });
  });

  // ── chapter ─────────────────────────────────────────────────────────────
  describe('handleCreateChapter', () => {
    it('errors when extension missing', async () => {
      await handleCreateChapter(makeArgs({ title: 'X' }), { cwd: dir, output: out });
      expect(log.some((l) => l.includes('Extension not initialized'))).toBe(true);
    });

    it('errors on missing --title', async () => {
      await handleCreateChapter(makeArgs({}), ctx);
      expect(log.some((l) => l.includes('Missing required flag: --title'))).toBe(true);
    });

    it('creates a chapter with explicit number, pov, location and scenes', async () => {
      await handleCreateChapter(
        makeArgs({ number: 1, title: 'The Signal', pov: 'Sarah', location: 'Lab', scenes: 3 }),
        ctx
      );
      expect(log.some((l) => l.includes('Chapter created: Chapter 1 - The Signal'))).toBe(true);
      expect(existsSync(join(dir, 'chapters', '01-the-signal.md'))).toBe(true);
      const content = await readFile(join(dir, 'chapters', '01-the-signal.md'), 'utf-8');
      expect(content).toContain('## Scene 3');
    });

    it('auto-numbers the next chapter', async () => {
      await handleCreateChapter(makeArgs({ number: 1, title: 'One' }), ctx);
      log.length = 0;
      await handleCreateChapter(makeArgs({ title: 'Two' }), ctx);
      expect(existsSync(join(dir, 'chapters', '02-two.md'))).toBe(true);
    });

    it('reports error when chapter file already exists', async () => {
      await handleCreateChapter(makeArgs({ number: 5, title: 'Dup' }), ctx);
      log.length = 0;
      await handleCreateChapter(makeArgs({ number: 5, title: 'Dup' }), ctx);
      expect(log.some((l) => l.includes('Chapter file already exists'))).toBe(true);
    });
  });

  // ── plot ────────────────────────────────────────────────────────────────
  describe('handleCreatePlot', () => {
    it('errors when extension missing', async () => {
      await handleCreatePlot(makeArgs({ name: 'X' }), { cwd: dir, output: out });
      expect(log.some((l) => l.includes('Extension not initialized'))).toBe(true);
    });

    it('falls back to interactive guidance when no name', async () => {
      await handleCreatePlot(makeArgs({}), ctx);
      expect(log.some((l) => l.includes('Plot creation failed'))).toBe(true);
      expect(log.some((l) => l.startsWith('CODE:'))).toBe(true);
    });

    it('creates a plot thread and syncs', async () => {
      await handleCreatePlot(
        makeArgs({
          name: 'The Mystery',
          type: 'main',
          status: 'active',
          priority: 5,
          description: 'A strange signal',
        }),
        ctx
      );
      expect(log.some((l) => l.includes('Plot thread created: The Mystery'))).toBe(true);
    });

    it('reports failure when plot already exists', async () => {
      await handleCreatePlot(makeArgs({ name: 'DupPlot', description: 'd' }), ctx);
      log.length = 0;
      await handleCreatePlot(makeArgs({ name: 'DupPlot', description: 'd' }), ctx);
      expect(log.some((l) => l.includes('Failed to create plot thread'))).toBe(true);
    });
  });
});
