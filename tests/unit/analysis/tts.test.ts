/**
 * Unit tests for the TTS module (CRAFT-05).
 *
 * `child_process` is fully mocked — NO real speech engine is ever invoked.
 * We assert the correct binary + argv are chosen per platform and that a
 * missing engine degrades gracefully to `{ spoken: false }`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock child_process ───────────────────────────────────────────────────────
// A shared, hoisted harness records every execFile call and lets each test
// decide whether the spawned binary "succeeds", is missing (ENOENT), or fails.

const h = vi.hoisted(() => {
  const calls: Array<{ file: string; args: string[] }> = [];
  // Default behaviour: every binary succeeds.
  let behavior: (file: string) => NodeJS.ErrnoException | null = () => null;

  const execFile = vi.fn(
    (
      file: string,
      args: string[],
      cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void
    ) => {
      calls.push({ file, args });
      cb(behavior(file), '', '');
    }
  );

  return {
    calls,
    execFile,
    setBehavior(b: (file: string) => NodeJS.ErrnoException | null) {
      behavior = b;
    },
  };
});

vi.mock('child_process', () => ({ execFile: h.execFile }));

// Import AFTER the mock is registered.
import { speak } from '../../../project/src/analysis/tts.js';

// ─── Platform override helpers ────────────────────────────────────────────────

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
}

beforeEach(() => {
  h.calls.length = 0;
  h.setBehavior(() => null); // all engines succeed by default
});

afterEach(() => {
  setPlatform(originalPlatform);
});

// ─── Windows ──────────────────────────────────────────────────────────────────

describe('speak() on Windows', () => {
  beforeEach(() => setPlatform('win32'));

  it('invokes PowerShell with the System.Speech script file', async () => {
    const result = await speak('Hello there.');

    expect(result).toMatchObject({ engine: 'powershell', spoken: true });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].file).toBe('powershell');
    expect(h.calls[0].args).toContain('-File');
    // The script path is the argument after -File.
    const fileIdx = h.calls[0].args.indexOf('-File');
    expect(h.calls[0].args[fileIdx + 1]).toMatch(/\.ps1$/);
  });

  it('reports the output file when --out is set', async () => {
    const result = await speak('Hello.', { outFile: 'C:\\tmp\\out.wav' });
    expect(result.spoken).toBe(true);
    expect(result.note).toContain('out.wav');
  });

  it('degrades to spoken:false when PowerShell is missing (does not throw)', async () => {
    h.setBehavior(() => enoent());
    const result = await speak('Hello.');
    expect(result.spoken).toBe(false);
    expect(result.engine).toBe('none');
    expect(result.note).toMatch(/not found/i);
  });
});

// ─── macOS ────────────────────────────────────────────────────────────────────

describe('speak() on macOS', () => {
  beforeEach(() => setPlatform('darwin'));

  it('invokes `say` reading text from a file', async () => {
    const result = await speak('Hello there.');

    expect(result).toMatchObject({ engine: 'say', spoken: true });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].file).toBe('say');
    expect(h.calls[0].args).toContain('-f'); // read text from file, not argv
    const fileIdx = h.calls[0].args.indexOf('-f');
    expect(h.calls[0].args[fileIdx + 1]).toMatch(/\.txt$/);
  });

  it('passes rate, voice, and output file through to `say`', async () => {
    await speak('Hello.', { rate: 180, voice: 'Daniel', outFile: '/tmp/out.aiff' });
    const { args } = h.calls[0];
    expect(args).toEqual(expect.arrayContaining(['-r', '180', '-v', 'Daniel', '-o', '/tmp/out.aiff']));
  });

  it('degrades gracefully when `say` is missing', async () => {
    h.setBehavior(() => enoent());
    const result = await speak('Hello.');
    expect(result.spoken).toBe(false);
    expect(result.engine).toBe('none');
  });

  it('does not throw when the engine exists but fails', async () => {
    h.setBehavior(() => Object.assign(new Error('boom'), { code: 1 }));
    const result = await speak('Hello.');
    expect(result.spoken).toBe(false);
    expect(result.engine).toBe('say');
    expect(result.note).toContain('boom');
  });
});

// ─── Linux ────────────────────────────────────────────────────────────────────

describe('speak() on Linux', () => {
  beforeEach(() => setPlatform('linux'));

  it('prefers spd-say for live speech', async () => {
    const result = await speak('Hello there.');
    expect(result).toMatchObject({ engine: 'spd-say', spoken: true });
    expect(h.calls[0].file).toBe('spd-say');
    // Text is passed as a discrete argv entry (execFile spawns no shell).
    expect(h.calls[0].args).toContain('Hello there.');
  });

  it('falls back to espeak when spd-say is missing', async () => {
    h.setBehavior((file) => (file === 'spd-say' ? enoent() : null));
    const result = await speak('Hello.');
    expect(result).toMatchObject({ engine: 'espeak', spoken: true });
    // spd-say tried first, espeak second.
    expect(h.calls.map((c) => c.file)).toEqual(['spd-say', 'espeak']);
    const espeakCall = h.calls[1];
    expect(espeakCall.args).toContain('-f'); // espeak reads text from file
  });

  it('falls back to espeak-ng when spd-say and espeak are both missing', async () => {
    h.setBehavior((file) => (file === 'espeak-ng' ? null : enoent()));
    const result = await speak('Hello.');
    expect(result).toMatchObject({ engine: 'espeak-ng', spoken: true });
    expect(h.calls.map((c) => c.file)).toEqual(['spd-say', 'espeak', 'espeak-ng']);
  });

  it('prefers espeak (with -w) when --out is requested', async () => {
    const result = await speak('Hello.', { outFile: '/tmp/out.wav' });
    expect(result).toMatchObject({ engine: 'espeak', spoken: true });
    // spd-say cannot render files, so it is skipped entirely.
    expect(h.calls[0].file).toBe('espeak');
    expect(h.calls[0].args).toEqual(expect.arrayContaining(['-w', '/tmp/out.wav']));
  });

  it('returns engine:none when no Linux engine is installed', async () => {
    h.setBehavior(() => enoent());
    const result = await speak('Hello.');
    expect(result.spoken).toBe(false);
    expect(result.engine).toBe('none');
    expect(result.note).toBe('No TTS engine found (install espeak or spd-say)');
    // All three candidates attempted.
    expect(h.calls.map((c) => c.file)).toEqual(['spd-say', 'espeak', 'espeak-ng']);
  });

  it('does not throw when a found engine fails for another reason', async () => {
    h.setBehavior((file) => (file === 'spd-say' ? Object.assign(new Error('dead'), { code: 2 }) : null));
    const result = await speak('Hello.');
    expect(result.spoken).toBe(false);
    expect(result.engine).toBe('spd-say');
    expect(result.note).toContain('dead');
  });
});
