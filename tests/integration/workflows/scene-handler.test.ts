/**
 * Integration Tests: scene-handler
 * Tests handleSceneCommand for all subcommands.
 *
 * Most subcommands depend on NovelWriterExtension + real filesystem chapter
 * files, so tests that exercise the "happy path" require actual files. Tests
 * that exercise early-return / validation paths stay purely in-memory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';
import { handleSceneCommand } from '../../../project/src/cli/handlers/scene-handler.js';

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
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: () => log.push('HEADING'),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'scene',
    subcommand: undefined,
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('scene-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-scene-test-${id}`);
    await mkdir(projectPath, { recursive: true });
    await mkdir(join(projectPath, 'chapters'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  // ── unknown subcommand ─────────────────────────────────────────────────────

  it('shows error for unknown subcommand', async () => {
    const { log, output } = createMockOutput();
    await handleSceneCommand(makeArgs({ subcommand: 'bogus' }), projectPath, output);
    expect(log.some((l) => l.includes('ERROR') || l.includes('Unknown'))).toBe(true);
  });

  it('shows error when subcommand is undefined', async () => {
    const { log, output } = createMockOutput();
    await handleSceneCommand(makeArgs({ subcommand: undefined, positional: [] }), projectPath, output);
    expect(log.some((l) => l.includes('ERROR') || l.includes('Unknown'))).toBe(true);
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('errors when --chapter is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'add', flags: {} }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });

    it('errors when chapter is not found', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'add', flags: { chapter: 99 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('errors when tension level is out of range', async () => {
      // Create a valid chapter file so the chapter-lookup succeeds
      const { writeFile } = await import('fs/promises');
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'add', flags: { chapter: 1, tension: 15 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('Tension'))).toBe(true);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('errors when --chapter is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'list', flags: {} }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });

    it('errors when chapter is not found', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'list', flags: { chapter: 99 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('lists scenes when chapter exists', async () => {
      const { writeFile } = await import('fs/promises');
      // Minimal chapter file with no scene markers — exercises the "no scenes" branch
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'list', flags: { chapter: 1 } }),
        projectPath,
        output,
      );
      // Either "no scenes" info message or a SUCCESS for scenes found
      expect(log.length).toBeGreaterThan(0);
    });
  });

  // ── edit ──────────────────────────────────────────────────────────────────

  describe('edit', () => {
    it('errors when --chapter is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'edit', flags: { scene: 1 } }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });

    it('errors when --scene is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'edit', flags: { chapter: 1 } }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--scene'))).toBe(true);
    });

    it('errors when chapter not found', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'edit', flags: { chapter: 99, scene: 1 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('errors when no updates specified', async () => {
      const { writeFile } = await import('fs/promises');
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'edit', flags: { chapter: 1, scene: 1 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('No updates'))).toBe(true);
    });

    it('errors when tension level out of range', async () => {
      const { writeFile } = await import('fs/promises');
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const { log, output } = createMockOutput();
      // Tension 11 is truthy AND out of range, so the validation branch fires
      await handleSceneCommand(
        makeArgs({ subcommand: 'edit', flags: { chapter: 1, scene: 1, tension: 11 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('Tension'))).toBe(true);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('errors when --chapter is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'delete', flags: { scene: 1 } }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });

    it('errors when --scene is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'delete', flags: { chapter: 1 } }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--scene'))).toBe(true);
    });

    it('errors when chapter not found', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'delete', flags: { chapter: 99, scene: 1 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });
  });

  // ── reorder ───────────────────────────────────────────────────────────────

  describe('reorder', () => {
    it('errors when --chapter is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'reorder', flags: { order: '2,1' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });

    it('errors when --order is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'reorder', flags: { chapter: 1 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--order'))).toBe(true);
    });

    it('errors when chapter not found', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'reorder', flags: { chapter: 99, order: '2,1' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('errors when order format is invalid', async () => {
      const { writeFile } = await import('fs/promises');
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'reorder', flags: { chapter: 1, order: 'a,b,c' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('Invalid'))).toBe(true);
    });
  });

  // ── stats ─────────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('errors when --chapter is missing', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'stats', flags: {} }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });

    it('errors when chapter not found', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'stats', flags: { chapter: 99 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('returns stats for an existing chapter', async () => {
      const { writeFile } = await import('fs/promises');
      await writeFile(join(projectPath, 'chapters', '01-intro.md'), '---\ntitle: Intro\n---\nContent\n');

      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'stats', flags: { chapter: 1 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('Scene Statistics') || l.includes('Total scenes'))).toBe(true);
    });
  });

  // ── sync ──────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('errors when project not initialized', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'sync', flags: { chapter: 1 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('errors when --chapter is missing', async () => {
      // Create .novel/data.db placeholder so the existence check passes
      const { writeFile } = await import('fs/promises');
      await mkdir(join(projectPath, '.novel'), { recursive: true });
      await writeFile(join(projectPath, '.novel', 'data.db'), '');

      const { log, output } = createMockOutput();
      await handleSceneCommand(
        makeArgs({ subcommand: 'sync', flags: {} }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--chapter'))).toBe(true);
    });
  });

  // ── tension-arc ───────────────────────────────────────────────────────────

  describe('tension-arc', () => {
    it('errors when project not initialized', async () => {
      const { log, output } = createMockOutput();
      await handleSceneCommand(makeArgs({ subcommand: 'tension-arc' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });
});
