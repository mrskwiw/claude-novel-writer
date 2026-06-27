/**
 * Integration Tests: check-handler
 * Tests the handleCheckCommand function for all subcommands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';

// We import the handler under test
import { handleCheckCommand } from '../../../project/src/cli/handlers/check-handler.js';

// ── mockOutput factory ──────────────────────────────────────────────────────

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
    command: 'check',
    subcommand: undefined,
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

// ── test suite ──────────────────────────────────────────────────────────────

describe('check-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-check-test-${id}`);
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  // ── unknown subcommand ─────────────────────────────────────────────────────

  describe('unknown subcommand', () => {
    it('shows error for unknown subcommand', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'nonexistent' }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('nonexistent'))).toBe(true);
    });

    it('lists available subcommands on unknown', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'bogus' }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('Available'))).toBe(true);
    });
  });

  // ── uninitialized project (no .novel/data.db) ──────────────────────────────

  describe('uninitialized project', () => {
    const uninitSubcommands = [
      'consistency',
      'characters',
      'timeline',
      'world-rules',
      'plot-threads',
      'list',
    ];

    for (const sub of uninitSubcommands) {
      it(`${sub}: errors when project not initialized`, async () => {
        const { log, output } = createMockOutput();
        await handleCheckCommand(
          makeArgs({ subcommand: sub }),
          projectPath,
          output,
        );
        expect(log.some((l) => l.includes('ERROR'))).toBe(true);
      });
    }

    it('resolve: errors when --id missing (before db check)', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'resolve', flags: {} }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--id'))).toBe(true);
    });

    it('acknowledge: errors when --id missing', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'acknowledge', flags: {} }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--id'))).toBe(true);
    });

    it('false-positive: errors when --id missing', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'false-positive', flags: {} }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--id'))).toBe(true);
    });
  });

  // ── resolve / acknowledge / false-positive with --id but no db ───────────

  describe('action subcommands with id but no project', () => {
    it('resolve: errors when project not initialized', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'resolve', flags: { id: 42 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('acknowledge: errors when project not initialized', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'acknowledge', flags: { id: 42 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('false-positive: errors when project not initialized', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: 'false-positive', flags: { id: 42 } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── default subcommand ─────────────────────────────────────────────────────

  describe('default subcommand', () => {
    it('defaults to consistency when no subcommand given', async () => {
      const { log, output } = createMockOutput();
      // No db means it will hit the "not initialized" path — confirms routing to consistency
      await handleCheckCommand(
        makeArgs({ subcommand: undefined, positional: [] }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('uses positional[0] as subcommand when subcommand is undefined', async () => {
      const { log, output } = createMockOutput();
      await handleCheckCommand(
        makeArgs({ subcommand: undefined, positional: ['list'] }),
        projectPath,
        output,
      );
      // hits list path which also requires db
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });
});
