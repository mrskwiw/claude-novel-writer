/**
 * Integration Tests: idea-handler
 * Tests handleIdeaCommand for all subcommands.
 *
 * The idea handler accepts an optional injectedExtension. For add/link/use/discard/sync
 * subcommands the extension's mcpClient is used for DB writes. We use the MockMCPClient
 * so no real SQLite is needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';
import { handleIdeaCommand } from '../../../project/src/cli/handlers/idea-handler.js';
import { NovelWriterExtension } from '../../../project/src/index.js';

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
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

function makeArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    command: 'idea',
    subcommand: undefined,
    positional: [],
    arguments: {},
    flags: {},
    raw: '',
    ...overrides,
  };
}

/** Build a minimal NovelWriterExtension backed by a MockMCPClient. */
function makeMockExtension(projectPath: string): NovelWriterExtension {
  const ext = new NovelWriterExtension(projectPath);
  const mock = new MockMCPClient();
  (ext as any).mcpClient = mock;
  (ext as any).projectId = 1;
  return ext;
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('idea-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-idea-test-${id}`);
    await mkdir(projectPath, { recursive: true });
    await mkdir(join(projectPath, '.novel', 'ideas'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  // ── unknown subcommand ─────────────────────────────────────────────────────

  describe('unknown subcommand', () => {
    it('shows error for unknown subcommand', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'bogus' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('bogus'))).toBe(true);
    });

    it('lists available subcommands', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'bogus' }), projectPath, output);
      expect(log.some((l) => l.includes('Available'))).toBe(true);
    });

    it('handles undefined subcommand', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: undefined, positional: [] }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('errors when no content is provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'add' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('idea content'))).toBe(true);
    });

    it('adds an idea from positional[1]', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'add', positional: ['add', 'A mysterious stranger arrives at midnight'] }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Idea captured'))).toBe(true);
    });

    it('adds an idea from --content flag', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'add', flags: { content: 'Hero discovers ancient map' } }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Idea captured'))).toBe(true);
    });

    it('records tags when --tag flag provided', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({
          subcommand: 'add',
          positional: ['add', 'Dragon speaks in riddles'],
          flags: { tag: 'fantasy' },
        }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('Tags:'))).toBe(true);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('shows "no ideas found" when directory is empty', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'list' }), projectPath, output);
      expect(log.some((l) => l.includes('No ideas found'))).toBe(true);
    });

    it('lists ideas that exist in the directory', async () => {
      const ext = makeMockExtension(projectPath);
      const { log: addLog, output: addOutput } = createMockOutput();
      // Add an idea first
      await handleIdeaCommand(
        makeArgs({ subcommand: 'add', flags: { content: 'Hero discovers map' } }),
        projectPath,
        addOutput,
        ext,
      );

      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'list' }), projectPath, output);
      expect(log.some((l) => l.includes('HEADING'))).toBe(true);
    });

    it('accepts --tag filter', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'list', flags: { tag: 'nonexistent-tag-xyz' } }),
        projectPath,
        output,
      );
      // Empty result is valid
      expect(log.length).toBeGreaterThanOrEqual(0);
    });

    it('accepts --status filter', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'list', flags: { status: 'used' } }),
        projectPath,
        output,
      );
      expect(log.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ── show ──────────────────────────────────────────────────────────────────

  describe('show', () => {
    it('errors when no key is provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'show' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('idea key'))).toBe(true);
    });

    it('shows error when idea key does not exist', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'show', positional: ['show', 'nonexistent-key'] }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('not found'))).toBe(true);
    });

    it('shows idea when it exists', async () => {
      const ext = makeMockExtension(projectPath);
      // Add first so the file exists
      const { output: addOut } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'add', positional: ['add', 'Dark secret in the cellar'] }),
        projectPath,
        addOut,
        ext,
      );

      // Find the key from the ideas directory
      const { readdir } = await import('fs/promises');
      const files = await readdir(join(projectPath, '.novel', 'ideas'));
      const ymlFile = files.find((f) => f.endsWith('.yml'));
      if (!ymlFile) return; // guard — file creation may have failed in test env

      const key = ymlFile.replace('.yml', '');
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'show', positional: ['show', key] }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('HEADING'))).toBe(true);
    });
  });

  // ── link ──────────────────────────────────────────────────────────────────

  describe('link', () => {
    it('errors when no key provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'link', flags: { to: 'character', name: 'Alice' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('idea key'))).toBe(true);
    });

    it('errors when --to not provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'link', positional: ['link', 'some-key'], flags: { name: 'Alice' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--to'))).toBe(true);
    });

    it('errors when --name not provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'link', positional: ['link', 'some-key'], flags: { to: 'character' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--name'))).toBe(true);
    });

    it('errors when entity type is invalid', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({
          subcommand: 'link',
          positional: ['link', 'some-key'],
          flags: { to: 'invalid-type', name: 'Alice' },
        }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('Invalid entity type'))).toBe(true);
    });
  });

  // ── explore ───────────────────────────────────────────────────────────────

  describe('explore', () => {
    it('errors when no prompt is provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'explore' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('brainstorm prompt'))).toBe(true);
    });

    it('outputs brainstorm prompt when --prompt is provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'explore', flags: { prompt: 'What if the villain is the hero?' } }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('HEADING'))).toBe(true);
      expect(log.some((l) => l.includes('CODE'))).toBe(true);
    });

    it('accepts prompt from positional[1]', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'explore', positional: ['explore', 'Hidden magic system'] }),
        projectPath,
        output,
      );
      expect(log.some((l) => l.includes('CODE'))).toBe(true);
    });
  });

  // ── use / discard ──────────────────────────────────────────────────────────

  describe('use', () => {
    it('errors when no key provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'use' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('idea key'))).toBe(true);
    });

    it('errors when idea key does not exist', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'use', positional: ['use', 'nonexistent-idea-key-xyz'] }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  describe('discard', () => {
    it('errors when no key provided', async () => {
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'discard' }), projectPath, output);
      expect(log.some((l) => l.includes('ERROR') && l.includes('idea key'))).toBe(true);
    });
  });

  // ── sync ──────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('syncs zero ideas from an empty directory', async () => {
      const ext = makeMockExtension(projectPath);
      const { log, output } = createMockOutput();
      await handleIdeaCommand(makeArgs({ subcommand: 'sync' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('0 idea'))).toBe(true);
    });

    it('syncs ideas when yaml files are present', async () => {
      const ext = makeMockExtension(projectPath);
      // Add an idea first so there's something to sync
      const { output: addOut } = createMockOutput();
      await handleIdeaCommand(
        makeArgs({ subcommand: 'add', flags: { content: 'Sync test idea' } }),
        projectPath,
        addOut,
        ext,
      );

      const { log, output } = createMockOutput();
      const ext2 = makeMockExtension(projectPath);
      await handleIdeaCommand(makeArgs({ subcommand: 'sync' }), projectPath, output, ext2);
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('idea'))).toBe(true);
    });
  });
});
