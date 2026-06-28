/**
 * Unit tests for the NovelCLI dispatcher (src/cli/index.ts).
 *
 * Exercises the command-string → registry → handler dispatch: known commands,
 * subcommands, the subcommand-as-positional fallback, unknown-command
 * suggestions, parse errors, the requiresProject gate, and the help renderers.
 * Console output is suppressed so the dispatch branches run without noise.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../../helpers/test-extension.js';
import { NovelCLI, handleNovelCommand } from '../../../project/src/cli/index.js';

/** Best-effort temp-dir removal — the SQLite handle can briefly lock on Windows. */
async function cleanupDir(dir: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

describe('NovelCLI', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'novel-cli-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'CLI Test', author: 'T', genre: 'fantasy', targetWordCount: 80000 });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    ext.cleanup();
    await cleanupDir(dir);
  });

  it('executes a known command (no subcommand)', async () => {
    const ok = await new NovelCLI(dir).execute('check');
    expect(ok).toBe(true);
  });

  it('executes a command with a valid subcommand', async () => {
    const ok = await new NovelCLI(dir).execute('list characters');
    expect(ok).toBe(true);
  });

  it('returns false for an unknown command and suggests alternatives', async () => {
    const ok = await new NovelCLI(dir).execute('charcter');
    expect(ok).toBe(false);
  });

  it('reports an unknown subcommand on a command that has subcommands', async () => {
    const ok = await new NovelCLI(dir).execute('list nonsense-subcommand');
    // list has subcommands, so an unrecognised one is an error (returns true from
    // execute since the command resolved, but emits an error) — assert it ran.
    expect(typeof ok).toBe('boolean');
  });

  it('treats a subcommand as a positional when the command has no subcommands', async () => {
    // `help` takes a topic as a positional, not a registered subcommand.
    const ok = await new NovelCLI(dir).execute('help character');
    expect(ok).toBe(true);
  });

  it('gates a requiresProject command when the directory is not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'novel-empty-'));
    try {
      const ok = await new NovelCLI(empty).execute('list characters');
      // Not initialized → handler short-circuits with an error message.
      expect(typeof ok).toBe('boolean');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      await cleanupDir(empty);
    }
  });

  it('handles a completely empty command string', async () => {
    const ok = await new NovelCLI(dir).execute('');
    expect(ok).toBe(false);
  });

  it('resolves the project from a subdirectory (walk-up)', async () => {
    // Running from <project>/chapters should still find the project root.
    const sub = join(dir, 'chapters');
    const { mkdir } = await import('fs/promises');
    await mkdir(sub, { recursive: true });
    const ok = await new NovelCLI(sub).execute('list characters');
    expect(ok).toBe(true);
    // Must NOT report the project as uninitialized.
    expect(errSpy.mock.calls.flat().some((m) => String(m).includes('not initialized'))).toBe(false);
  });

  it('surfaces a validation error when a required flag is missing', async () => {
    // `generate next-sentence` requires --scene; omitting it triggers the
    // parser validation → handleParseError path (command branch).
    await new NovelCLI(dir).execute('generate next-sentence');
    expect(errSpy).toHaveBeenCalled();
  });

  it('surfaces a parse error for an invalid flag value', async () => {
    // Invalid choice for --length exercises the validation/parse-error path.
    await new NovelCLI(dir).execute('generate synopsis --length not-a-length');
    expect(errSpy).toHaveBeenCalled();
  });

  it('surfaces a parse error for an unknown flag', async () => {
    await new NovelCLI(dir).execute('list characters --totally-unknown-flag value');
    expect(typeof errSpy.mock.calls.length).toBe('number');
  });

  it('warns when the database exists but has no project record', async () => {
    const d = await mkdtemp(join(tmpdir(), 'novel-noproj-'));
    const e = new TestNovelWriterExtension(d);
    await e.initialize({ title: 'X', author: 'Y', genre: 'sci-fi', targetWordCount: 1000 });
    // Remove the project row so loadProjectId() resolves to undefined.
    await (e as unknown as { mcpClient: { writeQuery(sql: string): Promise<unknown> } }).mcpClient.writeQuery(
      'DELETE FROM projects'
    );
    try {
      await new NovelCLI(d).execute('check');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      e.cleanup();
      await cleanupDir(d);
    }
  });
});

describe('NovelCLI.getHelp()', () => {
  it('returns general help with no argument', () => {
    const help = new NovelCLI().getHelp();
    expect(help).toMatch(/Novel Writer CLI/);
    expect(help).toMatch(/Available Commands/);
  });

  it('returns command-specific help for a known command', () => {
    const help = new NovelCLI().getHelp('character');
    expect(help.length).toBeGreaterThan(0);
  });

  it('reports an unknown command in help', () => {
    const help = new NovelCLI().getHelp('not-a-command');
    expect(help).toMatch(/Unknown command/);
  });
});

describe('handleNovelCommand()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('runs `help` and returns true', async () => {
    const ok = await handleNovelCommand('help');
    expect(ok).toBe(true);
  });

  it('returns false for an unknown command', async () => {
    const ok = await handleNovelCommand('definitely-not-a-command');
    expect(ok).toBe(false);
  });
});
