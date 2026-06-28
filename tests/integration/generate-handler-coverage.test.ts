/**
 * Coverage tests for generate-handler.ts (AI generation CLI dispatch).
 *
 * ClaudeClient and SceneContextAssembler are mocked at the module boundary so
 * NO real Anthropic API call is ever made — every GenerationManager method
 * resolves against the mocked client returning `{ content: 'mock-output' }`.
 * A real better-sqlite3-backed TestNovelWriterExtension supplies the mcpClient
 * and projectId, and is passed as the injected (4th) argument so DB reads hit a
 * real schema.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

// ─── Mock ClaudeClient (configured) ───────────────────────────────────────────

const mockGenerate = vi.fn().mockResolvedValue({ content: 'mock-output' });

vi.mock('../../project/src/ai/claude-client.js', () => {
  class MockClaudeClient {
    generate = mockGenerate;
    generateStructured = mockGenerate;
    generateCreative = mockGenerate;
    static isConfigured = vi.fn().mockReturnValue(true);
    static getConfigMessage = vi.fn().mockReturnValue('');
  }
  return { ClaudeClient: MockClaudeClient, PassthroughClaudeClient: MockClaudeClient };
});

// ─── Mock SceneContextAssembler (used by `continue`) ──────────────────────────

vi.mock('../../project/src/context/scene-context.js', () => {
  class SceneContextAssembler {
    assembleContext = vi.fn().mockResolvedValue({
      scene: { id: 1 },
      chapter: { id: 1, chapterNumber: 1 },
      characters: [],
      location: undefined,
      worldRules: [],
      plotThreads: [],
      recentChapterSummaries: [],
      timelineEvents: [],
    });
  }
  return { SceneContextAssembler };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { ClaudeClient } from '../../project/src/ai/claude-client.js';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleGenerateCommand } from '../../project/src/cli/handlers/generate-handler.js';

const isConfigured = (ClaudeClient as unknown as { isConfigured: ReturnType<typeof vi.fn> })
  .isConfigured;

// ─── Output capture ───────────────────────────────────────────────────────────

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
  code: (msg: string) => outputLog.push(`CODE: ${msg}`),
} as unknown as OutputFormatter;

const found = (needle: string) => outputLog.find((m) => m.includes(needle));

function makeArgs(subcommand: string, flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'generate',
    subcommand,
    positional: [subcommand],
    arguments: {},
    flags,
    raw: '',
  } as unknown as ParsedArgs;
}

const testProjectPath = join(process.cwd(), 'test-generate-project');
let extension: TestNovelWriterExtension;

async function run(subcommand: string, flags: Record<string, unknown> = {}): Promise<void> {
  await handleGenerateCommand(makeArgs(subcommand, flags), testProjectPath, mockOutput, extension);
}

beforeEach(async () => {
  outputLog = [];
  mockGenerate.mockClear();
  mockGenerate.mockResolvedValue({ content: 'mock-output' });
  isConfigured.mockReturnValue(true);

  await mkdir(testProjectPath, { recursive: true });
  // The handlers write into these subdirs on --save; create them up front.
  for (const sub of ['characters', 'locations', 'chapters', 'export']) {
    await mkdir(join(testProjectPath, sub), { recursive: true });
  }

  extension = new TestNovelWriterExtension(testProjectPath);
  await extension.initialize({
    title: 'The Lost Signal',
    author: 'Test Author',
    genre: 'Thriller',
    targetWordCount: 90000,
  });
});

afterEach(async () => {
  extension.cleanup();
  for (let i = 0; i < 5; i++) {
    try {
      await rm(testProjectPath, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

// ─── Dispatch / top-level ─────────────────────────────────────────────────────

describe('handleGenerateCommand — dispatch', () => {
  it('prints context-prompt notice when no API key is configured', async () => {
    isConfigured.mockReturnValue(false);
    await run('name');
    expect(found('context-prompt mode')).toBeDefined();
  });

  it('errors on an unknown generation type', async () => {
    await run('nonsense');
    expect(found('Unknown generation type')).toBeDefined();
  });
});

// ─── character ────────────────────────────────────────────────────────────────

describe('generate character', () => {
  it('errors without --description', async () => {
    await run('character', {});
    expect(found('provide a character description')).toBeDefined();
  });

  it('generates a profile and tips to add --save', async () => {
    await run('character', { description: 'a jaded detective' });
    expect(found('SUCCESS: Generated Character Profile:')).toBeDefined();
    expect(found('Add --save')).toBeDefined();
  });

  it('saves the profile to a file with --save', async () => {
    await run('character', { description: 'a jaded detective', save: true });
    expect(found('SUCCESS: Saved to:')).toBeDefined();
    expect(existsSync(join(testProjectPath, 'characters', 'a-jaded.yml'))).toBe(true);
  });

  it('honours an explicit --output path', async () => {
    const out = join(testProjectPath, 'custom-char.yml');
    await run('character', { description: 'a hero', save: true, output: out });
    const content = await readFile(out, 'utf-8');
    expect(content).toBe('mock-output');
  });

  it('reports the reasoning hint', async () => {
    await run('character', { description: 'a hero' });
    // GenerationManager always attaches a reasoning string, rendered with 💡.
    expect(found('💡')).toBeDefined();
  });
});

// ─── location ─────────────────────────────────────────────────────────────────

describe('generate location', () => {
  it('errors without --description', async () => {
    await run('location', {});
    expect(found('provide a location description')).toBeDefined();
  });

  it('generates a location', async () => {
    await run('location', { description: 'a misty harbor' });
    expect(found('SUCCESS: Generated Location:')).toBeDefined();
  });

  it('saves to a file with --save', async () => {
    await run('location', { description: 'a misty harbor', save: true });
    expect(found('SUCCESS: Saved to:')).toBeDefined();
    expect(existsSync(join(testProjectPath, 'locations', 'a-misty.yml'))).toBe(true);
  });
});

// ─── continue ─────────────────────────────────────────────────────────────────

describe('generate continue', () => {
  it('errors without --scene', async () => {
    await run('continue', {});
    expect(found('provide a scene ID')).toBeDefined();
  });

  it('produces continuation suggestions with alternatives', async () => {
    await run('continue', { scene: 1 });
    expect(found('SUCCESS: Continuation Suggestions:')).toBeDefined();
    expect(found('Option 1')).toBeDefined();
  });
});

// ─── dialogue ─────────────────────────────────────────────────────────────────

describe('generate dialogue', () => {
  it('errors without --character and --description', async () => {
    await run('dialogue', { character: 'Elena' });
    expect(found('provide --character and --description')).toBeDefined();
  });

  it('enhances dialogue', async () => {
    await run('dialogue', { character: 'Elena', description: 'I am leaving.' });
    expect(found('SUCCESS: Enhanced Dialogue:')).toBeDefined();
  });
});

// ─── describe ─────────────────────────────────────────────────────────────────

describe('generate describe', () => {
  it('errors without --description', async () => {
    await run('describe', {});
    expect(found('provide text to expand')).toBeDefined();
  });

  it('expands a description (with POV)', async () => {
    await run('describe', { description: 'the old house', pov: 'Elena' });
    expect(found('SUCCESS: Expanded Description:')).toBeDefined();
  });
});

// ─── plot ─────────────────────────────────────────────────────────────────────

describe('generate plot', () => {
  it('errors without --description', async () => {
    await run('plot', {});
    expect(found('provide plot thread name')).toBeDefined();
  });

  it('suggests plot developments', async () => {
    await run('plot', { description: 'The missing heir' });
    expect(found('SUCCESS: Plot Development Suggestions:')).toBeDefined();
  });
});

// ─── next-sentence ────────────────────────────────────────────────────────────

describe('generate next-sentence', () => {
  it('errors without --scene', async () => {
    await run('next-sentence', {});
    expect(found('provide a scene ID')).toBeDefined();
  });

  it('generates a next sentence (SQL-04 fixed — reads chapter summary via JOIN)', async () => {
    // generateNextSentence now reads the scene's chapter summary via a valid
    // scenes⋈chapters JOIN (scene prose lives in the .md files), so the command
    // reaches its success path instead of throwing on a non-existent column.
    await run('next-sentence', { scene: 1 });
    expect(found('One true sentence')).toBeDefined();
  });
});

// ─── synopsis ─────────────────────────────────────────────────────────────────

describe('generate synopsis', () => {
  it('rejects an invalid --length', async () => {
    await run('synopsis', { length: 'epic' });
    expect(found('Invalid --length')).toBeDefined();
  });

  it('generates a short synopsis by default', async () => {
    await run('synopsis', {});
    expect(found('SUCCESS: Short Synopsis:')).toBeDefined();
    expect(found('Add --save')).toBeDefined();
  });

  it('saves the synopsis with --save', async () => {
    await run('synopsis', { length: 'medium', save: true });
    expect(found('SUCCESS: Saved to:')).toBeDefined();
    expect(existsSync(join(testProjectPath, 'export', 'synopsis-medium.md'))).toBe(true);
  });
});

// ─── summary ──────────────────────────────────────────────────────────────────

describe('generate summary', () => {
  it('errors without --chapter', async () => {
    await run('summary', {});
    expect(found('Specify the chapter to summarize')).toBeDefined();
  });

  it('errors when chapters/ directory is missing', async () => {
    await rm(join(testProjectPath, 'chapters'), { recursive: true, force: true });
    await run('summary', { chapter: 1 });
    expect(found('chapters/ directory not found')).toBeDefined();
  });

  it('errors when no chapter file matches', async () => {
    await run('summary', { chapter: 5 });
    expect(found('No chapter file found for chapter 5')).toBeDefined();
  });

  it('errors when the chapter has no prose', async () => {
    await writeFile(join(testProjectPath, 'chapters', '03-empty.md'), '---\ntitle: Empty\n---\n', 'utf-8');
    await run('summary', { chapter: 3 });
    expect(found('has no prose to summarize')).toBeDefined();
  });

  it('summarizes a chapter with prose', async () => {
    await writeFile(
      join(testProjectPath, 'chapters', '01-opening.md'),
      '---\ntitle: Opening\n---\n\n# Chapter One\n\nElena arrived in the rain-soaked city at dusk.\n',
      'utf-8'
    );
    await run('summary', { chapter: 1 });
    expect(found('SUCCESS: Chapter 1 summary:')).toBeDefined();
  });
});

// ─── overview ─────────────────────────────────────────────────────────────────

describe('generate overview', () => {
  it('rejects an invalid --length', async () => {
    await run('overview', { length: 'huge' });
    expect(found('Invalid --length')).toBeDefined();
  });

  it('warns when there is no outline or cast yet', async () => {
    await run('overview', {});
    // GenerationManager returns a warning that the handler prints via output.error
    expect(found('No characters or plot threads found')).toBeDefined();
  });

  it('generates and saves an overview once a character exists', async () => {
    const mcp = (extension as unknown as { mcpClient: { writeQuery: (s: string, p: unknown[]) => Promise<void> } }).mcpClient;
    const pid = extension.getProjectId();
    await mcp.writeQuery(
      'INSERT INTO characters (project_id, name, role, summary) VALUES (?, ?, ?, ?)',
      [pid, 'Elena Voss', 'protagonist', 'A weary codebreaker']
    );
    await run('overview', { length: 'brief', save: true });
    expect(found('SUCCESS: Intended-Book Overview:')).toBeDefined();
    expect(found('SUCCESS: Saved to:')).toBeDefined();
    expect(existsSync(join(testProjectPath, 'export', 'overview.md'))).toBe(true);
  });

  it('tips to add --save when not saving', async () => {
    const mcp = (extension as unknown as { mcpClient: { writeQuery: (s: string, p: unknown[]) => Promise<void> } }).mcpClient;
    const pid = extension.getProjectId();
    await mcp.writeQuery(
      'INSERT INTO characters (project_id, name, role, summary) VALUES (?, ?, ?, ?)',
      [pid, 'Elena Voss', 'protagonist', 'A weary codebreaker']
    );
    await run('overview', {});
    expect(found('Add --save to write export/overview.md')).toBeDefined();
  });
});

// ─── pitch / query-letter / comps ─────────────────────────────────────────────

describe('generate pitch', () => {
  it('generates an elevator pitch', async () => {
    await run('pitch', {});
    expect(found('SUCCESS: Elevator Pitch:')).toBeDefined();
  });
});

describe('generate query-letter', () => {
  it('generates a query letter', async () => {
    await run('query-letter', {});
    expect(found('SUCCESS: Query Letter:')).toBeDefined();
  });

  it('parses provided --comps', async () => {
    await run('query-letter', { comps: 'A by X, B by Y' });
    expect(found('SUCCESS: Query Letter:')).toBeDefined();
  });
});

describe('generate comps', () => {
  it('suggests comparative titles', async () => {
    await run('comps', {});
    expect(found('SUCCESS: Comparative Titles:')).toBeDefined();
  });
});

// ─── opening-lines (delegated to craft-handler) ───────────────────────────────

describe('generate opening-lines', () => {
  it('workshops opening lines', async () => {
    await run('opening-lines', { count: 3 });
    expect(found('SUCCESS: Opening Line Options:')).toBeDefined();
  });
});

// ─── name / premise / sketch ──────────────────────────────────────────────────

describe('generate name', () => {
  it('generates name options with flags', async () => {
    await run('name', { culture: 'Norse', gender: 'female', count: 4, type: 'first' });
    expect(found('SUCCESS: Name Options:')).toBeDefined();
  });

  it('generates name options with defaults', async () => {
    await run('name', {});
    expect(found('SUCCESS: Name Options:')).toBeDefined();
  });
});

describe('generate premise', () => {
  it('errors without --idea', async () => {
    await run('premise', {});
    expect(found('provide your premise idea')).toBeDefined();
  });

  it('workshops a premise', async () => {
    await run('premise', { idea: 'A spy who forgets their mission' });
    expect(found('SUCCESS: Premise Development Worksheet:')).toBeDefined();
  });
});

describe('generate sketch', () => {
  it('generates a character sketch', async () => {
    await run('sketch', { role: 'mentor', genre: 'fantasy', notes: 'gruff' });
    expect(found('SUCCESS: Character Sketch:')).toBeDefined();
  });
});

// ─── error propagation ────────────────────────────────────────────────────────

describe('generate — error handling', () => {
  it('reports a failure when the generator throws', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('boom'));
    await run('character', { description: 'a hero' });
    expect(found('Failed to generate character: boom')).toBeDefined();
  });
});
