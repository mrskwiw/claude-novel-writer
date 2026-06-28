/**
 * Coverage tests: src/cli/handlers/world-rule-handler.ts
 *
 * handleWorldRuleCommand accepts an injected extension, so most tests pass a
 * schema-backed TestNovelWriterExtension (real better-sqlite3 via the mock
 * client). World-rule YAML files are written under <projectPath>/world-rules/.
 *
 * The "no database" code paths (list/stats from files, search "not
 * initialized") are exercised with a fresh directory that has NO
 * .novel/data.db and NO injected extension, so the handler builds its own
 * NovelWriterExtension and falls into the file-based branches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import YAML from 'yaml';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleWorldRuleCommand } from '../../project/src/cli/handlers/world-rule-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import type { WorldRuleYAML } from '../../project/src/types/novel.js';

function makeOutput() {
  const log: string[] = [];
  const out: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: (items) => log.push(`LIST: ${items.join('|')}`),
    section: () => log.push('SECTION'),
    spinner: (m) => ({ stop: (msg?: string) => log.push(`SPINNER: ${msg ?? m}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: (d) => log.push(`KV: ${JSON.stringify(d)}`),
    code: (c) => log.push(`CODE: ${c}`),
  };
  return { log, out };
}

async function rmRetry(p: string) {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function args(subcommand: string, flags: Record<string, string | number | boolean> = {}): ParsedArgs {
  return { command: 'world-rule', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

/** Insert a world rule directly into the DB (bypasses file sync). */
async function seedRule(
  mcp: any,
  pid: number,
  r: { category: string; name: string; description: string; limitations?: string; hard?: boolean }
) {
  await mcp.writeQuery(
    'INSERT INTO world_rules (project_id, rule_category, rule_name, description, limitations, is_hard_rule) VALUES (?,?,?,?,?,?)',
    [pid, r.category, r.name, r.description, r.limitations ?? null, r.hard === false ? 0 : 1]
  );
}

/** Write a world-rule YAML file under <dir>/world-rules/. */
async function writeRuleFile(dir: string, rule: WorldRuleYAML) {
  const d = join(dir, 'world-rules');
  await mkdir(d, { recursive: true });
  const slug = rule.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await writeFile(join(d, `${slug}.yml`), YAML.stringify(rule), 'utf-8');
}

describe('world-rule-handler coverage (with database)', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let mcp: any;
  let pid: number;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wr-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    pid = ext.getProjectId()!;
    mcp = (ext as any).mcpClient;
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  // ── dispatcher ──────────────────────────────────────────────────────────────
  it('dispatcher: unknown subcommand', async () => {
    await handleWorldRuleCommand(args('frobnicate'), dir, out, ext);
    expect(log.some((l) => l.includes('Unknown world-rule subcommand'))).toBe(true);
    expect(log.some((l) => l.includes('Available commands'))).toBe(true);
  });

  it('dispatcher: undefined subcommand falls through to default', async () => {
    await handleWorldRuleCommand(
      { command: 'world-rule', subcommand: undefined, positional: [], arguments: {}, flags: {}, raw: '' },
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Unknown world-rule subcommand'))).toBe(true);
  });

  // ── create ──────────────────────────────────────────────────────────────────
  it('create: requires --name', async () => {
    await handleWorldRuleCommand(args('create', { category: 'magic', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule name required'))).toBe(true);
  });

  it('create: requires --category', async () => {
    await handleWorldRuleCommand(args('create', { name: 'X', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('Category required'))).toBe(true);
  });

  it('create: requires --description', async () => {
    await handleWorldRuleCommand(args('create', { name: 'X', category: 'magic' }), dir, out, ext);
    expect(log.some((l) => l.includes('Description required'))).toBe(true);
  });

  it('create: reports validation errors for invalid category', async () => {
    await handleWorldRuleCommand(
      args('create', { name: 'X', category: 'bogus', description: 'd' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Validation errors'))).toBe(true);
  });

  it('create: succeeds (hard rule) and syncs to database', async () => {
    await handleWorldRuleCommand(
      args('create', { name: 'Mana Law', category: 'magic', description: 'Magic costs energy', 'hard-rule': true }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('World rule created'))).toBe(true);
    expect(log.some((l) => l.includes('Hard Rule: true'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  it('create: succeeds with flexible (hard-rule false) rule', async () => {
    await handleWorldRuleCommand(
      args('create', { name: 'Etiquette', category: 'social', description: 'Bow to elders', 'hard-rule': false }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('World rule created'))).toBe(true);
    expect(log.some((l) => l.includes('Hard Rule: false'))).toBe(true);
  });

  it('create: reports failure when file already exists', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'Dup', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(
      args('create', { name: 'Dup', category: 'magic', description: 'd' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Failed to create world rule'))).toBe(true);
  });

  // ── list ────────────────────────────────────────────────────────────────────
  it('list: empty database reports none', async () => {
    await handleWorldRuleCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('No world rules found'))).toBe(true);
  });

  it('list: renders rules (long + short descriptions, limitations)', async () => {
    await seedRule(mcp, pid, {
      category: 'magic',
      name: 'Mana Law',
      description: 'M'.repeat(80),
      limitations: 'Only at night and only by trained casters',
      hard: true,
    });
    await seedRule(mcp, pid, { category: 'social', name: 'Greeting', description: 'short', hard: false });
    await handleWorldRuleCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('Found 2 world rules'))).toBe(true);
    expect(log.some((l) => l.includes('Mana Law'))).toBe(true);
    expect(log.some((l) => l.includes('Limitations:'))).toBe(true);
  });

  it('list: filters by category', async () => {
    await seedRule(mcp, pid, { category: 'magic', name: 'Mana Law', description: 'desc', hard: true });
    await seedRule(mcp, pid, { category: 'physics', name: 'Gravity', description: 'desc', hard: true });
    await handleWorldRuleCommand(args('list', { category: 'physics' }), dir, out, ext);
    expect(log.some((l) => l.includes('Found 1 world rules'))).toBe(true);
    expect(log.some((l) => l.includes('Gravity'))).toBe(true);
  });

  // ── show ────────────────────────────────────────────────────────────────────
  it('show: requires --name', async () => {
    await handleWorldRuleCommand(args('show'), dir, out, ext);
    expect(log.some((l) => l.includes('World rule name required'))).toBe(true);
  });

  it('show: reports not found', async () => {
    await handleWorldRuleCommand(args('show', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  it('show: renders all sections (flexible rule)', async () => {
    await ext.getWorldRulesBuilder().create({
      name: 'Full Rule',
      category: 'technology',
      description: 'Tech needs power',
      limitations: 'No power, no tech',
      examples: ['Lamps need oil', 'Engines need fuel'],
      exceptions: ['Solar artifacts'],
      established_in: { chapter: 3, scene: 'The Lab', quote: 'It runs on aether' },
      notes: 'Central to the plot',
      is_hard_rule: false,
    });
    await handleWorldRuleCommand(args('show', { name: 'Full Rule' }), dir, out, ext);
    expect(log.some((l) => l.includes('World Rule: Full Rule'))).toBe(true);
    expect(log.some((l) => l.includes('flexible') || l.includes('No (flexible)'))).toBe(true);
    expect(log.some((l) => l.includes('Limitations:'))).toBe(true);
    expect(log.some((l) => l.includes('Examples (2)'))).toBe(true);
    expect(log.some((l) => l.includes('Exceptions (1)'))).toBe(true);
    expect(log.some((l) => l.includes('Established:'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter: 3'))).toBe(true);
    expect(log.some((l) => l.includes('Notes:'))).toBe(true);
  });

  // ── add-example ─────────────────────────────────────────────────────────────
  it('add-example: requires name and example', async () => {
    await handleWorldRuleCommand(args('add-example', { name: 'X' }), dir, out, ext);
    expect(log.some((l) => l.includes('Rule name and example required'))).toBe(true);
  });

  it('add-example: reports not found', async () => {
    await handleWorldRuleCommand(args('add-example', { name: 'Ghost', example: 'e' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  it('add-example: succeeds and syncs', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'R1', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(args('add-example', { name: 'R1', example: 'A spark of light' }), dir, out, ext);
    expect(log.some((l) => l.includes('Example added to rule: R1'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── add-exception ───────────────────────────────────────────────────────────
  it('add-exception: requires name and exception', async () => {
    await handleWorldRuleCommand(args('add-exception', { name: 'X' }), dir, out, ext);
    expect(log.some((l) => l.includes('Rule name and exception required'))).toBe(true);
  });

  it('add-exception: reports not found', async () => {
    await handleWorldRuleCommand(args('add-exception', { name: 'Ghost', exception: 'e' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  it('add-exception: succeeds and syncs', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'R2', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(args('add-exception', { name: 'R2', exception: 'Royal decree' }), dir, out, ext);
    expect(log.some((l) => l.includes('Exception added to rule: R2'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── limitations ─────────────────────────────────────────────────────────────
  it('limitations: requires name and limitations', async () => {
    await handleWorldRuleCommand(args('limitations', { name: 'X' }), dir, out, ext);
    expect(log.some((l) => l.includes('Rule name and limitations required'))).toBe(true);
  });

  it('limitations: reports not found', async () => {
    await handleWorldRuleCommand(args('limitations', { name: 'Ghost', limitations: 'l' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  it('limitations: succeeds and syncs', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'R3', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(args('limitations', { name: 'R3', limitations: 'Daylight only' }), dir, out, ext);
    expect(log.some((l) => l.includes('Limitations updated for rule: R3'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── established ─────────────────────────────────────────────────────────────
  it('established: requires --name', async () => {
    await handleWorldRuleCommand(args('established'), dir, out, ext);
    expect(log.some((l) => l.includes('Rule name required'))).toBe(true);
  });

  it('established: reports not found', async () => {
    await handleWorldRuleCommand(args('established', { name: 'Ghost', chapter: 1 }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  it('established: succeeds with chapter/scene/quote and syncs', async () => {
    // established_chapter_id is set from the chapter number, and the FK
    // references chapters(id); seed a chapter row so the sync upsert succeeds.
    await mcp.writeQuery('INSERT INTO chapters (id, project_id, chapter_number, title) VALUES (?,?,?,?)', [2, pid, 2, 'Ch2']);
    await ext.getWorldRulesBuilder().create({ name: 'R4', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(
      args('established', { name: 'R4', chapter: 2, scene: 'Tower', quote: 'And so it was' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Marked establishment point for rule: R4'))).toBe(true);
    expect(log.some((l) => l.includes('Chapter: 2'))).toBe(true);
    expect(log.some((l) => l.includes('Scene: Tower'))).toBe(true);
    expect(log.some((l) => l.includes('Quote:'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── toggle-hard ─────────────────────────────────────────────────────────────
  it('toggle-hard: requires --name', async () => {
    await handleWorldRuleCommand(args('toggle-hard'), dir, out, ext);
    expect(log.some((l) => l.includes('Rule name required'))).toBe(true);
  });

  it('toggle-hard: reports not found', async () => {
    await handleWorldRuleCommand(args('toggle-hard', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  it('toggle-hard: flips a hard rule to flexible and syncs', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'R5', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(args('toggle-hard', { name: 'R5' }), dir, out, ext);
    expect(log.some((l) => l.includes('Toggled hard rule status for: R5'))).toBe(true);
    expect(log.some((l) => l.includes('Flexible rule'))).toBe(true);
    expect(log.some((l) => l.includes('Synced to database'))).toBe(true);
  });

  // ── sync ────────────────────────────────────────────────────────────────────
  it('sync: errors when neither --name nor --all given', async () => {
    await handleWorldRuleCommand(args('sync'), dir, out, ext);
    expect(log.some((l) => l.includes('Specify rule name (--name) or use --all'))).toBe(true);
  });

  it('sync: --all syncs every file in world-rules/', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'S1', category: 'magic', description: 'd', is_hard_rule: true });
    await ext.getWorldRulesBuilder().create({ name: 'S2', category: 'physics', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(args('sync', { all: true }), dir, out, ext);
    expect(log.some((l) => l.includes('Synced 2 world rules to database'))).toBe(true);
  });

  it('sync: --name syncs a single rule', async () => {
    await ext.getWorldRulesBuilder().create({ name: 'S3', category: 'magic', description: 'd', is_hard_rule: true });
    await handleWorldRuleCommand(args('sync', { name: 'S3' }), dir, out, ext);
    expect(log.some((l) => l.includes('Synced world rule: S3'))).toBe(true);
  });

  it('sync: --name not found', async () => {
    await handleWorldRuleCommand(args('sync', { name: 'Ghost' }), dir, out, ext);
    expect(log.some((l) => l.includes('World rule not found'))).toBe(true);
  });

  // ── stats ───────────────────────────────────────────────────────────────────
  it('stats: from database', async () => {
    await seedRule(mcp, pid, { category: 'magic', name: 'A', description: 'd', hard: true });
    await seedRule(mcp, pid, { category: 'social', name: 'B', description: 'd', hard: false });
    await handleWorldRuleCommand(args('stats'), dir, out, ext);
    expect(log.some((l) => l.includes('World Rules Statistics:'))).toBe(true);
    expect(log.some((l) => l.includes('Total Rules: 2'))).toBe(true);
    expect(log.some((l) => l.includes('By Category:'))).toBe(true);
  });

  // ── search ──────────────────────────────────────────────────────────────────
  it('search: requires --keyword', async () => {
    await handleWorldRuleCommand(args('search'), dir, out, ext);
    expect(log.some((l) => l.includes('Search keyword required'))).toBe(true);
  });

  it('search: finds matching rules', async () => {
    await seedRule(mcp, pid, { category: 'magic', name: 'Mana Law', description: 'all about mana flow', hard: true });
    await handleWorldRuleCommand(args('search', { keyword: 'mana' }), dir, out, ext);
    expect(log.some((l) => l.includes('Found 1 rules matching: mana'))).toBe(true);
    expect(log.some((l) => l.includes('Mana Law'))).toBe(true);
  });

  it('search: reports no matches', async () => {
    await seedRule(mcp, pid, { category: 'magic', name: 'Mana Law', description: 'desc', hard: true });
    await handleWorldRuleCommand(args('search', { keyword: 'zzz-no-match' }), dir, out, ext);
    expect(log.some((l) => l.includes('No rules found matching'))).toBe(true);
  });

  // ── loadProjectId path: db present but injected ext has no projectId ─────────
  it('loadProjectId: resolves project id when extension lacks one', async () => {
    await seedRule(mcp, pid, { category: 'magic', name: 'LP', description: 'desc', hard: true });
    // A second extension over the SAME db, never initialize()'d → no projectId.
    const ext2 = new TestNovelWriterExtension(dir);
    try {
      expect(ext2.hasProjectId()).toBe(false);
      const o = makeOutput();
      await handleWorldRuleCommand(args('list'), dir, o.out, ext2);
      expect(o.log.some((l) => l.includes('Found 1 world rules'))).toBe(true);
      expect(ext2.hasProjectId()).toBe(true);
    } finally {
      ext2.cleanup();
    }
  });
});

// ── file-based branches (no .novel/data.db, no injected extension) ────────────
describe('world-rule-handler coverage (no database)', () => {
  let dir: string;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wr-nodb-'));
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    await rmRetry(dir);
  });

  it('list: no files reports none', async () => {
    await handleWorldRuleCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('No world rules found'))).toBe(true);
  });

  it('list: counts world-rule files', async () => {
    await writeRuleFile(dir, { name: 'F1', category: 'magic', description: 'd', is_hard_rule: true });
    await writeRuleFile(dir, { name: 'F2', category: 'physics', description: 'd', is_hard_rule: false });
    await handleWorldRuleCommand(args('list'), dir, out);
    expect(log.some((l) => l.includes('Found 2 world rule files'))).toBe(true);
  });

  it('stats: from files', async () => {
    await writeRuleFile(dir, {
      name: 'F1',
      category: 'magic',
      description: 'd',
      limitations: 'lim',
      examples: ['ex'],
      exceptions: ['exc'],
      established_in: { chapter: 1 },
      is_hard_rule: true,
    });
    await writeRuleFile(dir, { name: 'F2', category: 'social', description: 'd', is_hard_rule: false });
    await handleWorldRuleCommand(args('stats'), dir, out);
    expect(log.some((l) => l.includes('World Rules Statistics (from files)'))).toBe(true);
    expect(log.some((l) => l.includes('Total Rules: 2'))).toBe(true);
    expect(log.some((l) => l.includes('With Limitations:'))).toBe(true);
  });

  it('search: reports database not initialized', async () => {
    await handleWorldRuleCommand(args('search', { keyword: 'x' }), dir, out);
    expect(log.some((l) => l.includes('Database not initialized'))).toBe(true);
  });
});
