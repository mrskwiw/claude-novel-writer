/**
 * Integration Tests: query-handler
 * Tests handleQueryCommand for all subcommands:
 *   add, list, update, stats, export-package (+ unknown/default)
 *
 * QueryTrackerService is injected via the extension so we stub it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { NovelWriterExtension } from '../../../project/src/index.js';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';
import { handleQueryCommand } from '../../../project/src/cli/handlers/query-handler.js';
import type { QueryStatus } from '../../../project/src/services/query-tracker-service.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function createMockOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (msg) => log.push(`SUCCESS: ${msg}`),
    error: (msg) => log.push(`ERROR: ${msg}`),
    warning: (msg) => log.push(`WARNING: ${msg}`),
    info: (msg) => log.push(`INFO: ${msg}`),
    dim: (msg) => log.push(`DIM: ${msg}`),
    table: (data) => log.push(`TABLE:${JSON.stringify(data).slice(0, 80)}`),
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
    command: 'query',
    subcommand,
    positional,
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

function makeQuery(overrides: Record<string, unknown> = {}) {
  return {
    id: 'query-abc-123',
    projectId: '1',
    agentName: 'Jane Agent',
    agency: 'Big Agency',
    queryDate: '2026-01-15',
    status: 'sent' as QueryStatus,
    responseDate: undefined,
    notes: undefined,
    materialsSent: ['query_letter'],
    createdAt: '2026-01-15',
    updatedAt: '2026-01-15',
    ...overrides,
  };
}

function makeStats() {
  return {
    total: 5,
    byStatus: {
      sent: 2,
      pending: 1,
      rejected: 1,
      partial_request: 0,
      full_request: 1,
      offer: 0,
      closed: 0,
    } as Record<QueryStatus, number>,
    avgResponseDays: 30,
    successRate: 0.2,
  };
}

/** Build extension with a stubbed QueryTrackerService. */
function makeExtension(
  projectPath: string,
  serviceMethods: Record<string, (...args: any[]) => any> = {},
) {
  const ext = new NovelWriterExtension(projectPath);
  (ext as any).mcpClient = new MockMCPClient();
  (ext as any).projectId = 1;

  const defaultService = {
    addQuery: vi.fn().mockResolvedValue(makeQuery()),
    listQueries: vi.fn().mockResolvedValue([]),
    updateQuery: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue(makeStats()),
    exportQueryPackage: vi.fn().mockResolvedValue('/tmp/query-package.md'),
    ...serviceMethods,
  };

  (ext as any).getQueryTrackerService = () => defaultService;
  return { ext, service: defaultService };
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('query-handler', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-query-test-${id}`);
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
      await handleQueryCommand(makeArgs('bogus'), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('bogus'))).toBe(true);
    });

    it('lists available subcommands', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('bogus'), projectPath, output, ext);
      expect(log.some((l) => l.includes('Available'))).toBe(true);
    });

    it('handles undefined subcommand with error', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs(undefined), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── no extension ───────────────────────────────────────────────────────────

  describe('no extension', () => {
    it('add: errors when extension not provided', async () => {
      const { log, output } = createMockOutput();
      await handleQueryCommand(makeArgs('add', { agent: 'Jane' }), projectPath, output, undefined);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── add ───────────────────────────────────────────────────────────────────

  describe('add', () => {
    it('errors when agent name is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('add', {}), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('agent name'))).toBe(true);
    });

    it('adds a query with --agent flag', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('add', { agent: 'Jane Agent' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Query recorded'))).toBe(true);
    });

    it('adds a query using positional name', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('add', {}, ['add', 'Jane Agent']), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('passes optional agency, date, materials, and notes', async () => {
      const { log, output } = createMockOutput();
      const { ext, service } = makeExtension(projectPath);
      await handleQueryCommand(
        makeArgs('add', {
          agent: 'Jane',
          agency: 'Big Lit',
          date: '2026-02-01',
          materials: 'query_letter,synopsis',
          notes: 'Requested 50 pages',
        }),
        projectPath,
        output,
        ext,
      );
      expect(service.addQuery).toHaveBeenCalledWith(
        expect.anything(),
        'Jane',
        expect.objectContaining({
          agency: 'Big Lit',
          queryDate: '2026-02-01',
          materialsSent: ['query_letter', 'synopsis'],
          notes: 'Requested 50 pages',
        }),
      );
    });

    it('outputs keyValue block on success', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('add', { agent: 'Jane' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('KEYVALUE'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        addQuery: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      await handleQueryCommand(makeArgs('add', { agent: 'Jane' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('shows info when no queries found', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('No queries found'))).toBe(true);
    });

    it('shows table when queries exist', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listQueries: vi.fn().mockResolvedValue([makeQuery()]),
      });
      await handleQueryCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('HEADING'))).toBe(true);
      expect(log.some((l) => l.includes('TABLE'))).toBe(true);
    });

    it('errors on invalid --status value', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('list', { status: 'nonsense' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('Invalid status'))).toBe(true);
    });

    it('filters by valid --status', async () => {
      const { log, output } = createMockOutput();
      const { ext, service } = makeExtension(projectPath, {
        listQueries: vi.fn().mockResolvedValue([makeQuery({ status: 'pending' })]),
      });
      await handleQueryCommand(makeArgs('list', { status: 'pending' }), projectPath, output, ext);
      expect(service.listQueries).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('shows label when filtering by status', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listQueries: vi.fn().mockResolvedValue([makeQuery()]),
      });
      await handleQueryCommand(makeArgs('list', { status: 'sent' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('sent'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        listQueries: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      await handleQueryCommand(makeArgs('list'), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('errors when --id is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('update', { status: 'rejected' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('query id'))).toBe(true);
    });

    it('errors when invalid status provided', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('update', { id: 'abc', status: 'bad' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('Invalid status'))).toBe(true);
    });

    it('errors when no update fields provided', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('update', { id: 'abc' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('Provide at least one'))).toBe(true);
    });

    it('updates status successfully', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(
        makeArgs('update', { id: 'query-abc', status: 'rejected' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('updated'))).toBe(true);
    });

    it('updates response-date successfully', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(
        makeArgs('update', { id: 'query-abc', 'response-date': '2026-03-01' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('updates notes successfully', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(
        makeArgs('update', { id: 'query-abc', notes: 'Follow up' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        updateQuery: vi.fn().mockRejectedValue(new Error('Not found')),
      });
      await handleQueryCommand(
        makeArgs('update', { id: 'bad-id', status: 'closed' }),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── stats ─────────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('shows query submission dashboard', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('HEADING') && l.includes('Dashboard'))).toBe(true);
    });

    it('shows avg response days when available', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        getStats: vi.fn().mockResolvedValue({ ...makeStats(), avgResponseDays: 45 }),
      });
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('45 days'))).toBe(true);
    });

    it('shows dash when avgResponseDays is null', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        getStats: vi.fn().mockResolvedValue({ ...makeStats(), avgResponseDays: null }),
      });
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('KEYVALUE'))).toBe(true);
    });

    it('shows success rate percentage when available', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        getStats: vi.fn().mockResolvedValue({ ...makeStats(), successRate: 0.25 }),
      });
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('25.0%'))).toBe(true);
    });

    it('shows dash when successRate is null', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        getStats: vi.fn().mockResolvedValue({ ...makeStats(), successRate: null }),
      });
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('KEYVALUE'))).toBe(true);
    });

    it('shows status breakdown table', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('TABLE'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        getStats: vi.fn().mockRejectedValue(new Error('DB error')),
      });
      await handleQueryCommand(makeArgs('stats'), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });

  // ── export-package ────────────────────────────────────────────────────────

  describe('export-package', () => {
    it('errors when agent name is missing', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('export-package', {}), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR') && l.includes('agent name'))).toBe(true);
    });

    it('exports package using --agent flag', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('export-package', { agent: 'Jane Agent' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('SUCCESS') && l.includes('Query package created'))).toBe(true);
    });

    it('exports package using positional agent name', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(
        makeArgs('export-package', {}, ['export-package', 'Jane Agent']),
        projectPath,
        output,
        ext,
      );
      expect(log.some((l) => l.includes('SUCCESS'))).toBe(true);
    });

    it('shows fill-in hint after export', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath);
      await handleQueryCommand(makeArgs('export-package', { agent: 'Jane' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('Query Letter'))).toBe(true);
    });

    it('outputs error when service throws', async () => {
      const { log, output } = createMockOutput();
      const { ext } = makeExtension(projectPath, {
        exportQueryPackage: vi.fn().mockRejectedValue(new Error('Write failed')),
      });
      await handleQueryCommand(makeArgs('export-package', { agent: 'Jane' }), projectPath, output, ext);
      expect(log.some((l) => l.includes('ERROR'))).toBe(true);
    });
  });
});
