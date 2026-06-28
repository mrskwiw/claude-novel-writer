/**
 * Coverage tests: src/cli/handlers/structure-handler.ts + src/cli/commands/structure.ts
 *
 * Mirrors plot-handler-coverage.test.ts: a TestNovelWriterExtension (real
 * better-sqlite3 DB at <dir>/.novel/data.db) is injected so DB-backed paths use
 * the same seeded database. File paths use real YAML under <dir>/structure/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import YAML from 'yaml';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleStructureCommand } from '../../project/src/cli/handlers/structure-handler.js';
import { structureCommand } from '../../project/src/cli/commands/structure.js';
import type { ParsedArgs, OutputFormatter, CommandContext } from '../../project/src/cli/types.js';
import type { AppliedStructurePlan } from '../../project/src/data/structure-templates.js';

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

function args(
  subcommand: string,
  flags: Record<string, string | number | boolean> = {},
  positional: string[] = [subcommand]
): ParsedArgs {
  return { command: 'structure', subcommand, positional, arguments: {}, flags, raw: '' };
}

/** Seed chapters with given word counts straight into the DB. */
async function seedChapters(ext: TestNovelWriterExtension, counts: number[]) {
  const mcp = (ext as unknown as { mcpClient: { writeQuery: (s: string, p: unknown[]) => Promise<unknown> } }).mcpClient;
  let n = 1;
  for (const wc of counts) {
    await mcp.writeQuery(
      `INSERT INTO chapters (project_id, chapter_number, word_count, status)
       VALUES (?, ?, ?, ?)`,
      [ext.getProjectId(), n++, wc, 'drafted']
    );
  }
}

describe('structure-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'struct-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 90000 });
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  const has = (needle: string) => log.some((l) => l.includes(needle));

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleStructureCommand(args('frobnicate'), dir, out, ext);
    expect(has('Unknown structure subcommand')).toBe(true);
  });

  it('resolves subcommand from positional[0] when subcommand absent', async () => {
    const a: ParsedArgs = { command: 'structure', positional: ['list'], arguments: {}, flags: {}, raw: '' };
    await handleStructureCommand(a, dir, out, ext);
    expect(has('Story Structure Templates')).toBe(true);
  });

  // ── list ──────────────────────────────────────────────────────────────────
  it('list shows all three templates', async () => {
    await handleStructureCommand(args('list'), dir, out, ext);
    expect(has('Three-Act Structure')).toBe(true);
    expect(has('Save the Cat')).toBe(true);
    expect(has("Hero's Journey")).toBe(true);
    expect(has('Total: 3 templates')).toBe(true);
  });

  // ── apply ─────────────────────────────────────────────────────────────────
  it('apply requires a template', async () => {
    await handleStructureCommand(args('apply'), dir, out, ext);
    expect(has('Template required')).toBe(true);
  });

  it('apply rejects unknown template', async () => {
    await handleStructureCommand(args('apply', { template: 'bogus' }), dir, out, ext);
    expect(has('Unknown template: bogus')).toBe(true);
  });

  it('apply errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'struct-empty-'));
    try {
      await handleStructureCommand(args('apply', { template: 'three-act' }), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('apply writes a plan and computes target words', async () => {
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    expect(has('Structure plan applied')).toBe(true);
    expect(has('Target word count: 90000')).toBe(true);

    const planPath = join(dir, 'structure', 'three-act.yml');
    expect(existsSync(planPath)).toBe(true);
    const plan = YAML.parse(await readFile(planPath, 'utf-8')) as AppliedStructurePlan;
    expect(plan.template).toBe('three-act');
    // final beat (position 1.0) lands at the full target
    const last = plan.beats[plan.beats.length - 1];
    expect(last.targetWord).toBe(90000);
    // midpoint (0.5) lands at half
    const mid = plan.beats.find((b) => b.id === 'midpoint');
    expect(mid?.targetWord).toBe(45000);
  });

  it('apply resolves template from positional[1]', async () => {
    await handleStructureCommand(
      args('apply', {}, ['apply', 'save-the-cat']),
      dir,
      out,
      ext
    );
    expect(has('Structure plan applied')).toBe(true);
    expect(existsSync(join(dir, 'structure', 'save-the-cat.yml'))).toBe(true);
  });

  it('apply honours --words override', async () => {
    await handleStructureCommand(
      args('apply', { template: 'heros-journey', words: 50000 }),
      dir,
      out,
      ext
    );
    expect(has('Target word count: 50000')).toBe(true);
    const plan = YAML.parse(
      await readFile(join(dir, 'structure', 'heros-journey.yml'), 'utf-8')
    ) as AppliedStructurePlan;
    expect(plan.beats[plan.beats.length - 1].targetWord).toBe(50000);
  });

  it('apply loads projectId when extension has none', async () => {
    (ext as unknown as { projectId?: number }).projectId = undefined;
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    expect(has('Structure plan applied')).toBe(true);
  });

  it('apply errors when project has no target word count', async () => {
    const noTarget = await mkdtemp(join(tmpdir(), 'struct-nt-'));
    const ext2 = new TestNovelWriterExtension(noTarget);
    try {
      await ext2.initialize({ title: 'N', author: 'A', genre: 'X', targetWordCount: 0 });
      const o = makeOutput();
      await handleStructureCommand(args('apply', { template: 'three-act' }), noTarget, o.out, ext2);
      expect(o.log.some((l) => l.includes('no target word count'))).toBe(true);
    } finally {
      ext2.cleanup();
      await rmRetry(noTarget);
    }
  });

  // ── status ────────────────────────────────────────────────────────────────
  it('status errors when project not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'struct-empty2-'));
    try {
      await handleStructureCommand(args('status'), empty, out);
      expect(has('Project not initialized')).toBe(true);
    } finally {
      await rmRetry(empty);
    }
  });

  it('status errors when no plan applied', async () => {
    await handleStructureCommand(args('status'), dir, out, ext);
    expect(has('No structure plan applied')).toBe(true);
  });

  it('status errors when --template plan not found', async () => {
    await handleStructureCommand(args('status', { template: 'three-act' }), dir, out, ext);
    expect(has('No applied plan for "three-act"')).toBe(true);
  });

  it('status errors when multiple plans found and none specified', async () => {
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    await handleStructureCommand(args('apply', { template: 'save-the-cat' }), dir, out, ext);
    const o = makeOutput();
    await handleStructureCommand(args('status'), dir, o.out, ext);
    expect(o.log.some((l) => l.includes('Multiple structure plans found'))).toBe(true);
  });

  it('status reports beats against drafted words (single plan auto-detected)', async () => {
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    // Draft ~30000 words → past the first plot point (22500), before midpoint (45000)
    await seedChapters(ext, [15000, 15000]);

    const o = makeOutput();
    await handleStructureCommand(args('status'), dir, o.out, ext);
    expect(o.log.some((l) => l.includes('Structure Status'))).toBe(true);
    expect(o.log.some((l) => l.includes('Drafted: 30000 words'))).toBe(true);
    expect(o.log.some((l) => l.includes('Beats that should have landed by now'))).toBe(true);
    expect(o.log.some((l) => l.includes('Next beat: Midpoint'))).toBe(true);
  });

  it('status with --template selects a specific plan and flags due beats', async () => {
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    await handleStructureCommand(args('apply', { template: 'save-the-cat' }), dir, out, ext);
    // Draft exactly to the midpoint (45000) → "due now" within tolerance
    await seedChapters(ext, [45000]);

    const o = makeOutput();
    await handleStructureCommand(args('status', { template: 'three-act' }), dir, o.out, ext);
    expect(o.log.some((l) => l.includes('Structure Status — Three-Act'))).toBe(true);
    expect(o.log.some((l) => l.includes('On the mark now'))).toBe(true);
  });

  it('status reports all beats reached when fully drafted', async () => {
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    await seedChapters(ext, [100000]);
    const o = makeOutput();
    await handleStructureCommand(args('status'), dir, o.out, ext);
    expect(o.log.some((l) => l.includes('All beats reached'))).toBe(true);
  });

  it('status loads projectId when extension has none', async () => {
    await handleStructureCommand(args('apply', { template: 'three-act' }), dir, out, ext);
    (ext as unknown as { projectId?: number }).projectId = undefined;
    const o = makeOutput();
    await handleStructureCommand(args('status'), dir, o.out, ext);
    expect(o.log.some((l) => l.includes('Structure Status'))).toBe(true);
  });

  // ── command wiring ──────────────────────────────────────────────────────────
  it('structureCommand handler + subcommand handlers dispatch', async () => {
    const ctx: CommandContext = { cwd: dir, output: out };

    await structureCommand.handler!(args('list'), ctx);
    expect(has('Story Structure Templates')).toBe(true);

    expect(structureCommand.subcommands?.map((s) => s.name)).toEqual(['list', 'apply', 'status']);
    for (const sub of structureCommand.subcommands ?? []) {
      const o = makeOutput();
      const subCtx: CommandContext = { cwd: dir, output: o.out };
      await sub.handler!(args(sub.name), subCtx);
      // each subcommand produces some output without throwing
      expect(o.log.length).toBeGreaterThan(0);
    }
  });
});
