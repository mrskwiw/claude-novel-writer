/**
 * Integration Tests: beta-handler
 * Tests handleBetaCommand for all subcommands:
 *   add, list, feedback, report, resolve (+ unknown/default)
 *
 * BetaReaderService is injected via the extension so we stub it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { NovelWriterExtension } from '../../../project/src/index.js';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';
import { handleBetaCommand } from '../../../project/src/cli/handlers/beta-handler.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function createMockOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (msg) => log.push(`SUCCESS: ${msg}`),
    error: (msg) => log.push(`ERROR: ${msg}`),
    warning: (msg) => log.push(`WARNING: ${msg}`),
    info: (msg) => log.push(`INFO: ${msg}`),
    dim: (msg) => log.push(`DIM: ${msg}`),
    table: (data, cols) => log.push(`TABLE:${JSON.stringify(data).slice(0, 80)}`),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: (data) => log.push(`KEYVALUE: ${JSON.stringify(data).slice(0, 120)}`),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

function makeArgs(subcommand: string | undefined, flags: Record<string, unknown> = {}, positional: string[] = []): ParsedArgs {
  return {
    command: 'beta',
    subcommand,
    positional,
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

/** Minimal reader object returned by the service. */
function makeReader(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reader-123',
    name: 'Alex Tester',
    email: 'alex@test.com',
    chapters: ['1', '2'],
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

/** Minimal feedback object. */
function makeFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fb-456',
    readerId: 'reader-123',
    chapterId: 1,
    feedbackType: 'pacing',
    note: 'Too slow in chapter 2',
    resolved: false,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

/** Build extension with a stubbed BetaReaderService. */
function makeExtension(
  projectPath: string,
  serviceMethods: Record<string, (...args: any[]) => any> = {},
) {
  const ext = new NovelWriterExtension(projectPath);
  (ext as any).mcpClient = new MockMCPClient();
  (ext as any).projectId = 1;

  const defaultService = {
    addReader: vi.fn().mockResolvedValue(makeReader()),
    listReaders: vi.fn().mockResolvedValue([]),
    listFeedback: vi.fn().mockResolvedValue([]),
    addFeedback: vi.fn().mockResolvedValue(makeFeedback()),
    generateReport: vi.fn().mockResolvedValue({
      totalReaders: 0,
      totalFeedback: 0,
      unresolved: 0,
      byType: {},
      byChapter: {},
    }),
    resolveFeedback: vi.fn().mockResolvedValue(undefined),
    ...serviceMethods,
  };

  (ext as any).getBetaReaderService = () => defaultService;
  return { ext, service: defaultService };
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('beta-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-beta-test-${id}`);
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectPath, { recursive: true, force: true });
  });

  // ── unknown subcommand ─────────────────────────────────────────────────────

  describe('unknown subcommand', () => {
    it('shows error for unknown subcommand', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('bogus'), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('bogus'))).toBe(true);
    });

    it('lists available subcommands', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('bogus'), projectPath, output, ext);
      expect(log.some((l) => l.includes('Available'))).toBe(true);
    });

    it('handles undefined subcommand', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs(undefined, {}, []), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── no extension ───────────────────────────────────────────────────────────

  describe('no extension', () => {
    it('add: errors when extension not provided', async () => {
      const { log, output } = createMockOutput();
      await handleBetaCommand(makeArgs('add', { name: 'Alex' }), projectPath, output, undefined);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });

    it('list: errors when extension not provided', async () => {
      const { log, output } = createMockOutput();
      await handleBetaCommand(makeArgs('list'), projectPath, output, undefined);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('errors when name is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('add', {}), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('reader name'))).toBe(true);
    });

    it('adds a reader using --name flag', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('add', { name: 'Alex' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Beta reader added'))).toBe(true);
    });

    it('adds a reader using positional name', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('add', {}, ['beta', 'Alex']), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('passes email and chapters when provided', async () => {
      const { log, output } = createMockOutput();
      const { ext, service } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('add', { name: 'Alex', email: 'a@b.com', chapters: '1, 2, 3' }),
        projectPath,
        output,
        ext,
      );
      expect(service.addReader).toHaveBeenCalledWith(
        expect.anything(),
        'Alex',
        expect.objectContaining({ email: 'a@b.com', chapters: ['1', '2', '3'] }),
      );
    });

    it('outputs keyValue block on success', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('add', { name: 'Alex' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('KEYVALUE'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        addReader: vi.fn().mockRejectedValue(new Error('DB failure')),
      });
      await handleBetaCommand(makeArgs('add', { name: 'Alex' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('shows info when no readers exist', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('No beta readers found'))).toBe(true);
    });

    it('shows heading and table when readers exist', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listReaders: vi.fn().mockResolvedValue([makeReader()]),
        listFeedback: vi.fn().mockResolvedValue([makeFeedback()]),
      });
      await handleBetaCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('HEADING'))).toBe(true);
      expect(log.some((l) => l.includes('TABLE'))).toBe(true);
    });

    it('shows reader with email as dash when email is undefined', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listReaders: vi.fn().mockResolvedValue([makeReader({ email: undefined })]),
        listFeedback: vi.fn().mockResolvedValue([]),
      });
      await handleBetaCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('TABLE'))).toBe(true);
    });

    it('shows reader with no chapters as "(all)"', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listReaders: vi.fn().mockResolvedValue([makeReader({ chapters: [] })]),
        listFeedback: vi.fn().mockResolvedValue([]),
      });
      await handleBetaCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('TABLE'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listReaders: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      await handleBetaCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── feedback ──────────────────────────────────────────────────────────────

  describe('feedback', () => {
    it('errors when --reader is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { type: 'pacing', note: 'Slow start' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--reader'))).toBe(true);
    });

    it('errors when --type is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { reader: 'Alex', note: 'Slow start' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--type'))).toBe(true);
    });

    it('errors when feedback type is invalid', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { reader: 'Alex', type: 'badtype', note: 'X' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('Invalid feedback type'))).toBe(true);
    });

    it('errors when --note is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { reader: 'Alex', type: 'pacing' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR') && l.includes('--note'))).toBe(true);
    });

    it('records feedback successfully', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { reader: 'Alex', type: 'pacing', note: 'Slow start', chapter: 1 }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Feedback recorded'))).toBe(true);
    });

    it('outputs keyValue on success', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { reader: 'Alex', type: 'character', note: 'Flat arc' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('KEYVALUE'))).toBe(true);
    });

    it('accepts all valid feedback types', async () => {
      const validTypes = ['pacing', 'character', 'plot', 'clarity', 'emotion', 'other'];
      for (const type of validTypes) {
        const { log, output } = createMockOutput();
        const { ext } = makeExtension(projectPath);
        await handleBetaCommand(
          makeArgs('feedback', { reader: 'Alex', type, note: 'Test note' }),
          projectPath,
          output,
          ext,
        );
        expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
      }
    });

    it('uses --name as alias for --reader', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(
        makeArgs('feedback', { name: 'Alex', type: 'plot', note: 'Nice twist' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        addFeedback: vi.fn().mockRejectedValue(new Error('Not found')),
      });
      await handleBetaCommand(
        makeArgs('feedback', { reader: 'Nobody', type: 'other', note: 'X' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── report ────────────────────────────────────────────────────────────────

  describe('report', () => {
    it('shows report summary', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        generateReport: vi.fn().mockResolvedValue({
          totalReaders: 3,
          totalFeedback: 15,
          unresolved: 5,
          byType: { pacing: 8, character: 7 },
          byChapter: {
            1: { count: 10, types: { pacing: 5, character: 5 } },
          },
        }),
      });
      await handleBetaCommand(makeArgs('report'), projectPath, output, ext);
      expect(log.some((l) => l.includes('HEADING') && l.includes('Beta Reader Report'))).toBe(true);
    });

    it('shows feedback by chapter section when chapters exist', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        generateReport: vi.fn().mockResolvedValue({
          totalReaders: 1,
          totalFeedback: 2,
          unresolved: 0,
          byType: { pacing: 2 },
          byChapter: {
            1: { count: 1, types: { pacing: 1 } },
            2: { count: 1, types: { pacing: 1 } },
          },
        }),
      });
      await handleBetaCommand(makeArgs('report'), projectPath, output, ext);
      expect(log.some((l) => l.includes('Feedback by Chapter'))).toBe(true);
    });

    it('skips by-chapter section when byChapter is empty', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        generateReport: vi.fn().mockResolvedValue({
          totalReaders: 0,
          totalFeedback: 0,
          unresolved: 0,
          byType: {},
          byChapter: {},
        }),
      });
      await handleBetaCommand(makeArgs('report'), projectPath, output, ext);
      expect(log.some((l) => l.includes('Beta Reader Report'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        generateReport: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      await handleBetaCommand(makeArgs('report'), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── resolve ───────────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('errors when --id is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('resolve', {}), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('feedback id'))).toBe(true);
    });

    it('resolves feedback by id from --id flag', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('resolve', { id: 'fb-123' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('marked as resolved'))).toBe(true);
    });

    it('resolves feedback by id from positional', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleBetaCommand(makeArgs('resolve', {}, ['resolve', 'fb-456']), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        resolveFeedback: vi.fn().mockRejectedValue(new Error('Not found')),
      });
      await handleBetaCommand(makeArgs('resolve', { id: 'fb-999' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });
});
