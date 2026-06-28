/**
 * Coverage tests for extract-handler.ts ("discovery writer" entity extraction).
 *
 * The handler is read-only and deterministic (no LLM, no DB) — it scans real
 * chapter / outline files on disk and prints proposed characters & locations.
 * We write prose containing attributed dialogue + place names so the extractor
 * proposes entities, then assert on the rendered output and every error branch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import { handleExtractCommand } from '../../project/src/cli/handlers/extract-handler.js';

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
    command: 'extract',
    positional: [],
    arguments: {},
    flags,
    raw: '',
  } as unknown as ParsedArgs;
}

const found = (needle: string) => outputLog.find((m) => m.includes(needle));

// Prose engineered to trigger BOTH a character (attributed dialogue speaker,
// recurring proper noun) and a location (place-suffix after a preposition).
const PROSE_WITH_ENTITIES = `# Chapter One

The wind howled as Marcus crossed the empty courtyard at Ironhold Keep.

"We have to move," Marcus said, scanning the shadows.

Marcus pressed on toward Ironhold Keep, certain that danger waited inside Ironhold Keep.
`;

const PROSE_NO_ENTITIES = `# Chapter One

The day was grey and the air was cold.
Nothing of note happened here at all.
`;

let projectPath: string;

beforeEach(async () => {
  outputLog = [];
  projectPath = await mkdtemp(join(tmpdir(), 'novel-extract-'));
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

// ─── --chapter N ──────────────────────────────────────────────────────────────

describe('handleExtractCommand — --chapter N', () => {
  beforeEach(async () => {
    await mkdir(join(projectPath, 'chapters'), { recursive: true });
    await writeFile(join(projectPath, 'chapters', '01-opening.md'), PROSE_WITH_ENTITIES, 'utf-8');
  });

  it('proposes new characters and locations from chapter prose', async () => {
    await handleExtractCommand(makeArgs({ chapter: 1 }), projectPath, mockOutput);
    expect(found('HEADING: Extract — 01-opening.md')).toBeDefined();
    expect(found('Marcus')).toBeDefined();
    expect(found('Ironhold Keep')).toBeDefined();
    expect(found('novel create character')).toBeDefined();
    expect(found('novel create location')).toBeDefined();
    expect(found('These are suggestions from the prose')).toBeDefined();
  });

  it('reports when nothing new is detected', async () => {
    await writeFile(join(projectPath, 'chapters', '02-quiet.md'), PROSE_NO_ENTITIES, 'utf-8');
    await handleExtractCommand(makeArgs({ chapter: 2 }), projectPath, mockOutput);
    expect(found('No new characters or locations detected')).toBeDefined();
  });

  it('errors when --chapter is omitted (and no --all/--file)', async () => {
    await handleExtractCommand(makeArgs({}), projectPath, mockOutput);
    expect(found('Specify --chapter N')).toBeDefined();
  });

  it('errors when no chapter file matches the number', async () => {
    await handleExtractCommand(makeArgs({ chapter: 9 }), projectPath, mockOutput);
    expect(found('No chapter file found for chapter 9')).toBeDefined();
  });
});

// ─── --all ────────────────────────────────────────────────────────────────────

describe('handleExtractCommand — --all', () => {
  it('scans every chapter when --all is set', async () => {
    await mkdir(join(projectPath, 'chapters'), { recursive: true });
    await writeFile(join(projectPath, 'chapters', '01-a.md'), PROSE_WITH_ENTITIES, 'utf-8');
    await writeFile(join(projectPath, 'chapters', '02-b.md'), PROSE_NO_ENTITIES, 'utf-8');

    await handleExtractCommand(makeArgs({ all: true }), projectPath, mockOutput);
    expect(found('HEADING: Extract — 01-a.md')).toBeDefined();
    expect(found('HEADING: Extract — 02-b.md')).toBeDefined();
    expect(found('Marcus')).toBeDefined();
  });

  it('reports when chapters/ is empty', async () => {
    await mkdir(join(projectPath, 'chapters'), { recursive: true });
    await handleExtractCommand(makeArgs({ all: true }), projectPath, mockOutput);
    expect(found('No chapter files found')).toBeDefined();
  });

  it('errors when chapters/ directory is missing', async () => {
    await handleExtractCommand(makeArgs({ all: true }), projectPath, mockOutput);
    expect(found('chapters/ directory not found')).toBeDefined();
  });
});

// ─── --file <path> ────────────────────────────────────────────────────────────

describe('handleExtractCommand — --file', () => {
  it('scans an arbitrary outline file', async () => {
    const outline = join(projectPath, 'outline.md');
    await writeFile(outline, PROSE_WITH_ENTITIES, 'utf-8');

    await handleExtractCommand(makeArgs({ file: outline }), projectPath, mockOutput);
    expect(found('HEADING: Extract — outline.md')).toBeDefined();
    expect(found('Marcus')).toBeDefined();
  });

  it('errors when the file cannot be read', async () => {
    await handleExtractCommand(
      makeArgs({ file: join(projectPath, 'does-not-exist.md') }),
      projectPath,
      mockOutput
    );
    expect(found('Could not read file')).toBeDefined();
  });
});
