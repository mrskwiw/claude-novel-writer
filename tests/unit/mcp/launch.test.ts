/**
 * Unit tests for the mcp-sqlite launcher (mcp-server/launch.js).
 *
 * The launcher's side effects (spawn, console, process.exit, signal handlers)
 * are dependency-injected, so these tests drive the full flow without spawning
 * a real child process.
 */

import { describe, it, expect, vi } from 'vitest';
import { isAbsolute } from 'path';
import { resolveDbPath, runLauncher } from '../../../project/mcp-server/launch.js';

/** Minimal fake child process: records `.on` handlers and lets tests fire them. */
function fakeChild() {
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  return {
    on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      (handlers[event] ||= []).push(cb);
    }),
    kill: vi.fn(),
    emit: (event: string, ...args: unknown[]) =>
      (handlers[event] || []).forEach((cb) => cb(...args)),
  };
}

describe('resolveDbPath()', () => {
  it('returns null when no path is given', () => {
    expect(resolveDbPath(['node', 'launch.js'])).toBeNull();
  });

  it('resolves a relative path to an absolute one', () => {
    const p = resolveDbPath(['node', 'launch.js', 'foo/bar.db']);
    expect(p).toMatch(/bar\.db$/);
    expect(isAbsolute(p as string)).toBe(true);
  });
});

describe('runLauncher()', () => {
  it('errors and exits(1) when no database path is supplied', () => {
    const error = vi.fn();
    const exit = vi.fn();
    const result = runLauncher(['node', 'launch.js'], {
      error,
      exit,
      log: vi.fn(),
      spawn: vi.fn(),
    });
    expect(result).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Database path is required'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('spawns mcp-sqlite with the resolved path and wires events + signals', () => {
    const child = fakeChild();
    const spawn = vi.fn().mockReturnValue(child);
    const log = vi.fn();
    const error = vi.fn();
    const exit = vi.fn();
    const signals: Record<string, () => void> = {};
    const onSignal = vi.fn((sig: string, h: () => void) => {
      signals[sig] = h;
    });

    const server = runLauncher(['node', 'launch.js', 'data.db'], {
      spawn,
      log,
      error,
      exit,
      onSignal,
    });

    expect(server).toBe(child);
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['-y', 'mcp-sqlite']),
      expect.objectContaining({ shell: true })
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Starting MCP SQLite server'));
    expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(child.on).toHaveBeenCalledWith('exit', expect.any(Function));

    // child 'error' → error log + exit(1)
    child.emit('error', new Error('boom'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(exit).toHaveBeenCalledWith(1);

    // child 'exit' nonzero → exit(code); zero → no exit
    child.emit('exit', 2);
    expect(exit).toHaveBeenCalledWith(2);
    exit.mockClear();
    child.emit('exit', 0);
    expect(exit).not.toHaveBeenCalled();

    // SIGINT / SIGTERM → kill child + exit(0)
    signals['SIGINT']();
    expect(child.kill).toHaveBeenCalledWith('SIGINT');
    expect(exit).toHaveBeenCalledWith(0);
    signals['SIGTERM']();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
