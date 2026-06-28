/**
 * Coverage tests for readaloud-handler.ts (CRAFT-05)
 *
 * The OS TTS engine is mocked at the `tts.js` module boundary so no audio is
 * ever produced; tests focus on text-resolution, scene extraction, and the
 * success / warning / error branches of the handler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

// ─── Mock the TTS engine so nothing is actually spoken ────────────────────────

vi.mock('../../project/src/analysis/tts.js', () => ({
  speak: vi.fn(),
}));

import { speak } from '../../project/src/analysis/tts.js';
import { handleReadAloudCommand } from '../../project/src/cli/handlers/readaloud-handler.js';

const mockSpeak = speak as unknown as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let outputLog: string[];

const mockOutput: OutputFormatter = {
  success: (msg: string) => outputLog.push(`SUCCESS: ${msg}`),
  error: (msg: string) => outputLog.push(`ERROR: ${msg}`),
  warning: (msg: string) => outputLog.push(`WARNING: ${msg}`),
  info: (msg: string) => outputLog.push(`INFO: ${msg}`),
  dim: (msg: string) => outputLog.push(`DIM: ${msg}`),
  table: () => outputLog.push('TABLE'),
  list: () => outputLog.push('LIST'),
  section: () => outputLog.push('SECTION'),
  spinner: () => ({ stop: () => {} }),
  newline: () => outputLog.push(''),
  heading: (msg: string) => outputLog.push(`HEADING: ${msg}`),
  keyValue: () => outputLog.push('KEYVALUE'),
  code: () => outputLog.push('CODE'),
} as unknown as OutputFormatter;

function makeArgs(flags: Record<string, unknown>): ParsedArgs {
  return {
    command: 'readaloud',
    positional: [],
    arguments: {},
    flags,
    raw: '',
  } as unknown as ParsedArgs;
}

const found = (needle: string) => outputLog.find((m) => m.includes(needle));

let projectPath: string;

beforeEach(async () => {
  outputLog = [];
  mockSpeak.mockReset();
  mockSpeak.mockResolvedValue({ engine: 'mock', spoken: true });
  projectPath = await mkdtemp(join(tmpdir(), 'novel-readaloud-'));
});

afterEach(async () => {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(projectPath, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

// ─── ad-hoc --text ────────────────────────────────────────────────────────────

describe('handleReadAloudCommand — ad-hoc text', () => {
  it('speaks ad-hoc --text and reports the engine', async () => {
    await handleReadAloudCommand(makeArgs({ text: 'Hello there friend.' }), projectPath, mockOutput);
    expect(found('HEADING: Read Aloud')).toBeDefined();
    expect(found('ad-hoc text')).toBeDefined();
    expect(found('SUCCESS: Spoken with mock.')).toBeDefined();
    expect(mockSpeak).toHaveBeenCalledOnce();
  });

  it('warns when the resolved text is empty after stripping', async () => {
    await handleReadAloudCommand(makeArgs({ text: '   ' }), projectPath, mockOutput);
    expect(found('Nothing to read')).toBeDefined();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('passes rate and voice options through to speak()', async () => {
    await handleReadAloudCommand(
      makeArgs({ text: 'Read this aloud now.', rate: 3, voice: 'Zira' }),
      projectPath,
      mockOutput
    );
    expect(mockSpeak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rate: 3, voice: 'Zira' })
    );
  });

  it('reports the rendered file when --out is given and speak returns a note', async () => {
    mockSpeak.mockResolvedValue({ engine: 'mock', spoken: true, note: 'Wrote audio to out.wav' });
    await handleReadAloudCommand(
      makeArgs({ text: 'Render me.', out: join(projectPath, 'out.wav') }),
      projectPath,
      mockOutput
    );
    expect(found('Rendering to file')).toBeDefined();
    expect(found('SUCCESS: Wrote audio to out.wav')).toBeDefined();
  });

  it('warns and prints engine hints when no speech is produced', async () => {
    mockSpeak.mockResolvedValue({ engine: 'none', spoken: false, note: 'No engine found' });
    await handleReadAloudCommand(makeArgs({ text: 'Anything.' }), projectPath, mockOutput);
    expect(found('WARNING: No engine found')).toBeDefined();
    expect(found('TTS engines')).toBeDefined();
  });

  it('falls back to a generic warning when spoken is false with no note', async () => {
    mockSpeak.mockResolvedValue({ engine: 'none', spoken: false });
    await handleReadAloudCommand(makeArgs({ text: 'Anything.' }), projectPath, mockOutput);
    expect(found('no engine reported a reason')).toBeDefined();
  });

  it('reports an error when speak() throws', async () => {
    mockSpeak.mockRejectedValue(new Error('engine exploded'));
    await handleReadAloudCommand(makeArgs({ text: 'Boom.' }), projectPath, mockOutput);
    expect(found('Read-aloud failed: engine exploded')).toBeDefined();
  });
});

// ─── chapter resolution ───────────────────────────────────────────────────────

describe('handleReadAloudCommand — chapter resolution', () => {
  beforeEach(async () => {
    await mkdir(join(projectPath, 'chapters'), { recursive: true });
    await writeFile(
      join(projectPath, 'chapters', '01-opening.md'),
      `---\ntitle: Opening\n---\n\n# Chapter One\n\nThe rain fell softly on the quiet town.\n\n--- Scene 1 ---\n\nElena walked alone.\n\n--- Scene 2 ---\n\nThe storm finally broke over the hills.\n`,
      'utf-8'
    );
  });

  it('reads a whole chapter when only --chapter is given', async () => {
    await handleReadAloudCommand(makeArgs({ chapter: 1 }), projectPath, mockOutput);
    expect(found('Source: chapter 1')).toBeDefined();
    expect(found('SUCCESS: Spoken with mock.')).toBeDefined();
  });

  it('reads a single scene when --scene is in range', async () => {
    await handleReadAloudCommand(makeArgs({ chapter: 1, scene: 2 }), projectPath, mockOutput);
    expect(found('chapter 1, scene 2')).toBeDefined();
    expect(found('SUCCESS: Spoken with mock.')).toBeDefined();
  });

  it('errors when the requested scene is out of range', async () => {
    await handleReadAloudCommand(makeArgs({ chapter: 1, scene: 9 }), projectPath, mockOutput);
    expect(found('Scene 9 not found')).toBeDefined();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('warns and reads the whole chapter when no scene delimiters exist', async () => {
    await writeFile(
      join(projectPath, 'chapters', '02-flat.md'),
      `# Chapter Two\n\nA single unbroken passage of prose with no scene markers at all.\n`,
      'utf-8'
    );
    await handleReadAloudCommand(makeArgs({ chapter: 2, scene: 1 }), projectPath, mockOutput);
    expect(found('No "--- Scene N ---" delimiters found')).toBeDefined();
    expect(found('SUCCESS: Spoken with mock.')).toBeDefined();
  });

  it('errors when neither --chapter nor --text is provided', async () => {
    await handleReadAloudCommand(makeArgs({}), projectPath, mockOutput);
    expect(found('Specify --chapter N')).toBeDefined();
  });

  it('errors when no chapter file matches the number', async () => {
    await handleReadAloudCommand(makeArgs({ chapter: 7 }), projectPath, mockOutput);
    expect(found('No chapter file found for chapter 7')).toBeDefined();
  });

  it('errors when the chapters/ directory is missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'novel-readaloud-empty-'));
    try {
      await handleReadAloudCommand(makeArgs({ chapter: 1 }), empty, mockOutput);
      expect(found('chapters/ directory not found')).toBeDefined();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
