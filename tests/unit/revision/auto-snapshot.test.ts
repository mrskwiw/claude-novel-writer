/**
 * Auto-snapshot tests — PROC-12
 *
 * Verifies:
 *  - `handleSyncFromDb` creates an auto-snapshot before any export runs
 *  - Auto-snapshot label follows the `auto-before-from-db-` prefix pattern
 *  - When SnapshotManager.create() throws, the sync still proceeds
 *  - `revision auto-snapshot` command displays the expected info text
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleSyncFromDb } from '../../../project/src/cli/handlers/sync-handler.js';
import { handleRevisionCommand } from '../../../project/src/cli/handlers/revision-handler.js';
import type { ParsedArgs, CommandContext, OutputFormatter } from '../../../project/src/cli/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ParsedArgs. */
function makeArgs(positional: string[] = [], flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'novel',
    subcommand: positional[0],
    arguments: {},
    flags,
    positional,
    raw: `/novel ${positional.join(' ')}`,
  };
}

/** Build a mock OutputFormatter with all methods as no-ops. */
function makeOutput(): OutputFormatter {
  return {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dim: vi.fn(),
    table: vi.fn(),
    list: vi.fn(),
    section: vi.fn(),
    spinner: vi.fn().mockReturnValue({ stop: vi.fn() }),
    newline: vi.fn(),
    heading: vi.fn(),
    keyValue: vi.fn(),
    code: vi.fn(),
  };
}

/**
 * Build a minimal extension stub that captures calls to getSnapshotManager()
 * and supports the from-db export methods used by handleSyncFromDb.
 */
function makeExtensionStub(snapshotCreateImpl: () => Promise<any> = async () => ({})) {
  const snapshotManagerMock = {
    create: vi.fn().mockImplementation(snapshotCreateImpl),
  };

  const characterSyncMock = {
    exportToYAML: vi.fn().mockResolvedValue('/fake/characters/char-1.yml'),
  };
  const locationSyncMock = {
    exportToYAML: vi.fn().mockResolvedValue('/fake/locations/loc-1.yml'),
  };
  const worldRulesSyncMock = {
    exportToYAML: vi.fn().mockResolvedValue('/fake/world-rules/rule-1.yml'),
  };
  const plotThreadSyncMock = {
    exportToYAML: vi.fn().mockResolvedValue('/fake/plots/thread-1.yml'),
  };
  const chapterSyncMock = {
    exportToFile: vi.fn().mockResolvedValue('/fake/chapters/chapter-01.md'),
  };

  const mcpClientMock = {
    readQuery: vi.fn().mockResolvedValue([{ id: 1 }]),
  };

  const extension: any = {
    getSnapshotManager: vi.fn().mockReturnValue(snapshotManagerMock),
    getCharacterSync: vi.fn().mockReturnValue(characterSyncMock),
    getLocationSync: vi.fn().mockReturnValue(locationSyncMock),
    getWorldRulesSync: vi.fn().mockReturnValue(worldRulesSyncMock),
    getPlotThreadSync: vi.fn().mockReturnValue(plotThreadSyncMock),
    getChapterSync: vi.fn().mockReturnValue(chapterSyncMock),
    // Expose private members as bracket-accessed properties (sync-handler uses extension['mcpClient'])
    mcpClient: mcpClientMock,
    projectId: 42,
  };

  return { extension, snapshotManagerMock, mcpClientMock };
}

// ── handleSyncFromDb — auto-snapshot behaviour ────────────────────────────────

describe('handleSyncFromDb — auto-snapshot', () => {
  let output: OutputFormatter;

  beforeEach(() => {
    output = makeOutput();
  });

  it('calls getSnapshotManager() before any export', async () => {
    const { extension } = makeExtensionStub();
    const context: CommandContext = { cwd: '/fake/project', output, extension };

    await handleSyncFromDb(makeArgs(['characters']), context);

    expect(extension.getSnapshotManager).toHaveBeenCalledTimes(1);
    // getSnapshotManager call order must precede any sync call
    const snapshotOrder = extension.getSnapshotManager.mock.invocationCallOrder[0];
    const syncOrder = extension.getCharacterSync.mock.invocationCallOrder[0];
    expect(snapshotOrder).toBeLessThan(syncOrder);
  });

  it('auto-snapshot label starts with "auto-before-from-db-"', async () => {
    const { extension, snapshotManagerMock } = makeExtensionStub();
    const context: CommandContext = { cwd: '/fake/project', output, extension };

    await handleSyncFromDb(makeArgs(['characters']), context);

    expect(snapshotManagerMock.create).toHaveBeenCalledOnce();
    const [label] = snapshotManagerMock.create.mock.calls[0] as [string];
    expect(label).toMatch(/^auto-before-from-db-\d+$/);
  });

  it('proceeds with sync when SnapshotManager.create() succeeds', async () => {
    const { extension, snapshotManagerMock, mcpClientMock } = makeExtensionStub();
    const context: CommandContext = { cwd: '/fake/project', output, extension };

    await handleSyncFromDb(makeArgs(['characters']), context);

    // Snapshot was created
    expect(snapshotManagerMock.create).toHaveBeenCalledOnce();
    // Export also ran (readQuery is called for characters)
    expect(mcpClientMock.readQuery).toHaveBeenCalledWith(
      expect.stringContaining('characters'),
      expect.any(Array)
    );
  });

  it('proceeds with sync when SnapshotManager.create() throws', async () => {
    const { extension, snapshotManagerMock, mcpClientMock } = makeExtensionStub(async () => {
      throw new Error('chapters directory not found');
    });
    const context: CommandContext = { cwd: '/fake/project', output, extension };

    // Should not throw
    await expect(handleSyncFromDb(makeArgs(['characters']), context)).resolves.toBeUndefined();

    // Snapshot was attempted
    expect(snapshotManagerMock.create).toHaveBeenCalledOnce();
    // Export also ran despite snapshot failure
    expect(mcpClientMock.readQuery).toHaveBeenCalledWith(
      expect.stringContaining('characters'),
      expect.any(Array)
    );
  });

  it('does not emit an error when snapshot creation fails silently', async () => {
    const { extension } = makeExtensionStub(async () => {
      throw new Error('no chapters dir');
    });
    const context: CommandContext = { cwd: '/fake/project', output, extension };

    await handleSyncFromDb(makeArgs(['chapters']), context);

    // output.error should not have been called for the snapshot failure
    const errorCalls = (output.error as ReturnType<typeof vi.fn>).mock.calls as string[][];
    const snapshotErrors = errorCalls.filter(([msg]) =>
      typeof msg === 'string' && msg.toLowerCase().includes('snapshot')
    );
    expect(snapshotErrors).toHaveLength(0);
  });

  it('creates snapshot even for entityType "all"', async () => {
    const { extension, snapshotManagerMock } = makeExtensionStub();
    const context: CommandContext = { cwd: '/fake/project', output, extension };

    await handleSyncFromDb(makeArgs(['all']), context);

    expect(snapshotManagerMock.create).toHaveBeenCalledOnce();
    const [label] = snapshotManagerMock.create.mock.calls[0] as [string];
    expect(label).toMatch(/^auto-before-from-db-\d+$/);
  });
});

// ── revision auto-snapshot info command ───────────────────────────────────────

describe('handleRevisionCommand — auto-snapshot subcommand', () => {
  it('displays info text containing sync from-db reference', async () => {
    const output = makeOutput();
    const args = makeArgs(['auto-snapshot']);

    await handleRevisionCommand(args, '/fake/project', output);

    const allInfoCalls = (output.info as ReturnType<typeof vi.fn>).mock.calls
      .map(([msg]: [string]) => msg)
      .join(' ');

    expect(allInfoCalls).toContain('sync from-db');
  });

  it('displays info text referencing revisions/ storage path', async () => {
    const output = makeOutput();
    const args = makeArgs(['auto-snapshot']);

    await handleRevisionCommand(args, '/fake/project', output);

    const allInfoCalls = (output.info as ReturnType<typeof vi.fn>).mock.calls
      .map(([msg]: [string]) => msg)
      .join(' ');

    expect(allInfoCalls).toContain('revisions/auto-before-from-db-');
  });

  it('displays info text with restore instruction', async () => {
    const output = makeOutput();
    const args = makeArgs(['auto-snapshot']);

    await handleRevisionCommand(args, '/fake/project', output);

    const allInfoCalls = (output.info as ReturnType<typeof vi.fn>).mock.calls
      .map(([msg]: [string]) => msg)
      .join(' ');

    expect(allInfoCalls).toContain('revision restore');
  });

  it('calls output.heading() with a non-empty title', async () => {
    const output = makeOutput();
    const args = makeArgs(['auto-snapshot']);

    await handleRevisionCommand(args, '/fake/project', output);

    expect(output.heading).toHaveBeenCalledOnce();
    const [title] = (output.heading as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });
});
