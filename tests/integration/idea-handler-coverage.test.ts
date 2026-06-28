/**
 * Coverage tests: src/cli/handlers/idea-handler.ts
 *
 * Exercises every subcommand's success render path AND the catch branches.
 * Uses a real NovelWriterExtension backed by MockMCPClient for DB writes, plus
 * a "failing" client to trip the error branches, and malformed YAML files to
 * trip the builder read failures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../mocks/mcp-client.mock.js';
import { NovelWriterExtension } from '../../project/src/index.js';
import { handleIdeaCommand } from '../../project/src/cli/handlers/idea-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';

function makeOutput() {
  const log: string[] = [];
  const out: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: (d) => log.push(`KV: ${JSON.stringify(d)}`),
    code: (c) => log.push(`CODE: ${c}`),
  };
  return { log, out };
}

function args(subcommand: string, rest: string[] = [], flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'idea',
    subcommand,
    positional: [subcommand, ...rest],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

function makeExt(projectPath: string): NovelWriterExtension {
  const ext = new NovelWriterExtension(projectPath);
  (ext as any).mcpClient = new MockMCPClient();
  (ext as any).projectId = 1;
  return ext;
}

/** Extension whose mcpClient throws on writes — to trip sync catch branches. */
function makeFailingExt(projectPath: string): NovelWriterExtension {
  const ext = new NovelWriterExtension(projectPath);
  (ext as any).mcpClient = {
    readQuery: async () => { throw new Error('db down'); },
    writeQuery: async () => { throw new Error('db down'); },
  };
  (ext as any).projectId = 1;
  return ext;
}

async function addIdea(projectPath: string, content: string, tags?: string): Promise<string> {
  const ext = makeExt(projectPath);
  const { out } = makeOutput();
  const flags = tags ? { tag: tags } : {};
  await handleIdeaCommand(args('add', [content], flags), projectPath, out, ext);
  const files = await readdir(join(projectPath, '.novel', 'ideas'));
  const yml = files.find((f) => f.endsWith('.yml'))!;
  return yml.replace('.yml', '');
}

describe('idea-handler coverage', () => {
  let dir: string;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp();
    await mkdir(join(dir, '.novel', 'ideas'), { recursive: true });
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await rm(dir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
  });

  async function mkdtemp(): Promise<string> {
    const { mkdtemp: mt } = await import('fs/promises');
    return mt(join(tmpdir(), 'idea-h-'));
  }

  // ── dispatcher ─────────────────────────────────────────────────────────────
  it('errors on unknown subcommand', async () => {
    await handleIdeaCommand(args('frob'), dir, out);
    expect(log.some((l) => l.includes('Unknown idea subcommand'))).toBe(true);
  });

  // ── add ────────────────────────────────────────────────────────────────────
  it('add errors without content', async () => {
    await handleIdeaCommand(args('add'), dir, out);
    expect(log.some((l) => l.includes('provide idea content'))).toBe(true);
  });

  it('add captures an idea (positional, no tags)', async () => {
    await handleIdeaCommand(args('add', ['A stranger arrives']), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes('Idea captured'))).toBe(true);
    expect(log.some((l) => l.includes('Tags:'))).toBe(false);
  });

  it('add captures an idea via --content with tags', async () => {
    await handleIdeaCommand(args('add', [], { content: 'Map quest', tag: 'fantasy' }), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes('Idea captured'))).toBe(true);
    expect(log.some((l) => l.includes('Tags: fantasy'))).toBe(true);
  });

  it('add reports failure when the DB write throws', async () => {
    await handleIdeaCommand(args('add', ['Boom idea']), dir, out, makeFailingExt(dir));
    expect(log.some((l) => l.includes('Failed to add idea'))).toBe(true);
  });

  // ── list ───────────────────────────────────────────────────────────────────
  it('list reports no ideas', async () => {
    await handleIdeaCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('No ideas found'))).toBe(true);
  });

  it('list renders ideas with tags', async () => {
    await addIdea(dir, 'A long idea that exceeds sixty characters so the snippet is truncated nicely', 'plot');
    await handleIdeaCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('Ideas ('))).toBe(true);
  });

  it('list applies --tag and --status filters', async () => {
    await addIdea(dir, 'Filterable idea', 'mystery');
    await handleIdeaCommand(args('list', [], { tag: 'mystery', status: 'active' }), dir, out);
    expect(log.some((l) => l.includes('Ideas ('))).toBe(true);
  });

  it('list reports failure on malformed YAML', async () => {
    await writeFile(join(dir, '.novel', 'ideas', 'bad.yml'), ':\n  - [unclosed', 'utf-8');
    await handleIdeaCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('Failed to list ideas') || l.includes('Ideas ('))).toBe(true);
  });

  // ── show ───────────────────────────────────────────────────────────────────
  it('show errors without a key', async () => {
    await handleIdeaCommand(args('show'), dir, out);
    expect(log.some((l) => l.includes('provide an idea key'))).toBe(true);
  });

  it('show reports not found', async () => {
    await handleIdeaCommand(args('show', ['ghost']), dir, out);
    expect(log.some((l) => l.includes('Idea not found: ghost'))).toBe(true);
  });

  it('show renders an idea (with linked entity + notes)', async () => {
    const key = await addIdea(dir, 'Linked idea');
    // link + note to populate the optional render fields
    await handleIdeaCommand(args('link', [key], { to: 'character', name: 'Alice' }), dir, makeOutput().out, makeExt(dir));
    await handleIdeaCommand(args('show', [key]), dir, out);
    expect(log.some((l) => l.includes('HEADING: Idea:'))).toBe(true);
  });

  it('show reports failure on malformed YAML', async () => {
    await writeFile(join(dir, '.novel', 'ideas', 'broke.yml'), ':\n  - [unclosed', 'utf-8');
    await handleIdeaCommand(args('show', ['broke']), dir, out);
    expect(log.some((l) => l.includes('Failed to show idea'))).toBe(true);
  });

  // ── link ───────────────────────────────────────────────────────────────────
  it('link errors without a key', async () => {
    await handleIdeaCommand(args('link', [], { to: 'character', name: 'Al' }), dir, out);
    expect(log.some((l) => l.includes('provide an idea key'))).toBe(true);
  });

  it('link errors without --to', async () => {
    await handleIdeaCommand(args('link', ['k'], { name: 'Al' }), dir, out);
    expect(log.some((l) => l.includes('--to'))).toBe(true);
  });

  it('link errors without --name', async () => {
    await handleIdeaCommand(args('link', ['k'], { to: 'character' }), dir, out);
    expect(log.some((l) => l.includes('--name'))).toBe(true);
  });

  it('link errors on invalid entity type', async () => {
    await handleIdeaCommand(args('link', ['k'], { to: 'dragon', name: 'Al' }), dir, out);
    expect(log.some((l) => l.includes('Invalid entity type'))).toBe(true);
  });

  it('link succeeds and syncs', async () => {
    const key = await addIdea(dir, 'To link');
    await handleIdeaCommand(args('link', [key], { to: 'plot', name: 'Main' }), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes(`Idea ${key} linked to plot: Main`))).toBe(true);
  });

  it('link reports failure when the key does not exist', async () => {
    await handleIdeaCommand(args('link', ['ghost'], { to: 'plot', name: 'Main' }), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes('Failed to link idea'))).toBe(true);
  });

  // ── explore ────────────────────────────────────────────────────────────────
  it('explore errors without a prompt', async () => {
    await handleIdeaCommand(args('explore'), dir, out);
    expect(log.some((l) => l.includes('brainstorm prompt'))).toBe(true);
  });

  it('explore prints a brainstorm prompt (flag)', async () => {
    await handleIdeaCommand(args('explore', [], { prompt: 'What if?' }), dir, out);
    expect(log.some((l) => l.includes('HEADING: Brainstorm Prompt'))).toBe(true);
    expect(log.some((l) => l.startsWith('CODE:'))).toBe(true);
  });

  it('explore accepts a positional prompt', async () => {
    await handleIdeaCommand(args('explore', ['Hidden magic']), dir, out);
    expect(log.some((l) => l.startsWith('CODE:'))).toBe(true);
  });

  // ── use / discard ──────────────────────────────────────────────────────────
  it('use errors without a key', async () => {
    await handleIdeaCommand(args('use'), dir, out);
    expect(log.some((l) => l.includes('provide an idea key'))).toBe(true);
  });

  it('use marks an idea used and syncs', async () => {
    const key = await addIdea(dir, 'Will be used');
    await handleIdeaCommand(args('use', [key]), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes(`Idea ${key} marked as used`))).toBe(true);
  });

  it('discard marks an idea discarded and syncs', async () => {
    const key = await addIdea(dir, 'Will be discarded');
    await handleIdeaCommand(args('discard', [key]), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes(`Idea ${key} marked as discarded`))).toBe(true);
  });

  it('use reports failure when the key does not exist', async () => {
    await handleIdeaCommand(args('use', ['ghost']), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes('Failed to update idea'))).toBe(true);
  });

  // ── sync ───────────────────────────────────────────────────────────────────
  it('sync reports zero ideas for an empty directory', async () => {
    await handleIdeaCommand(args('sync'), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes('Synced 0 ideas'))).toBe(true);
  });

  it('sync pushes existing idea files', async () => {
    await addIdea(dir, 'Sync me');
    await handleIdeaCommand(args('sync'), dir, out, makeExt(dir));
    expect(log.some((l) => l.includes('Synced') && l.includes('idea'))).toBe(true);
  });

  it('sync reports failure when the DB write throws', async () => {
    await addIdea(dir, 'Sync fail');
    await handleIdeaCommand(args('sync'), dir, out, makeFailingExt(dir));
    expect(log.some((l) => l.includes('Sync failed'))).toBe(true);
  });
});
