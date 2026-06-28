/**
 * Coverage tests: src/cli/handlers/theme-handler.ts
 *
 * The theme handler is read/write-on-disk and deterministic (no LLM, no DB):
 * `add` writes themes/<slug>.yml, `list` reads them back, `trace` runs the
 * motif-density scan over chapters/*.md. We operate on real temp files and
 * assert on the rendered output and every branch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import YAML from 'yaml';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import { handleThemeCommand } from '../../project/src/cli/handlers/theme-handler.js';
import { readFile } from 'fs/promises';

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
  flags: Record<string, string | number | boolean> = {}
): ParsedArgs {
  return { command: 'theme', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

describe('theme-handler coverage', () => {
  let dir: string;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'theme-h-'));
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    await rmRetry(dir);
  });

  const has = (needle: string) => log.some((l) => l.includes(needle));

  async function writeChapter(file: string, body: string) {
    await mkdir(join(dir, 'chapters'), { recursive: true });
    await writeFile(join(dir, 'chapters', file), body, 'utf-8');
  }

  // ── dispatcher ─────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleThemeCommand(args('frobnicate'), dir, out);
    expect(has('Unknown theme subcommand')).toBe(true);
  });

  it('resolves subcommand from positional[0] when subcommand absent', async () => {
    const a: ParsedArgs = { command: 'theme', positional: ['list'], arguments: {}, flags: {}, raw: '' };
    await handleThemeCommand(a, dir, out);
    expect(has('No themes registered')).toBe(true);
  });

  // ── add ────────────────────────────────────────────────────────────────────
  it('add requires --name', async () => {
    await handleThemeCommand(args('add', { motifs: 'cold' }), dir, out);
    expect(has('Theme name required')).toBe(true);
  });

  it('add requires --motifs', async () => {
    await handleThemeCommand(args('add', { name: 'isolation' }), dir, out);
    expect(has('Motifs required')).toBe(true);
  });

  it('add rejects motifs that parse to nothing', async () => {
    await handleThemeCommand(args('add', { name: 'isolation', motifs: ' , , ' }), dir, out);
    expect(has('No valid motifs found')).toBe(true);
  });

  it('add rejects a name with no alphanumerics', async () => {
    await handleThemeCommand(args('add', { name: '!!!', motifs: 'cold' }), dir, out);
    expect(has('at least one alphanumeric')).toBe(true);
  });

  it('add writes a YAML file and reports details', async () => {
    await handleThemeCommand(
      args('add', { name: 'Isolation', motifs: 'cold,mirror,silence,locked', description: 'apartness' }),
      dir,
      out
    );
    expect(has('Theme registered')).toBe(true);
    expect(has('Motifs (4)')).toBe(true);

    const raw = await readFile(join(dir, 'themes', 'isolation.yml'), 'utf-8');
    const data = YAML.parse(raw) as { name: string; motifs: string[]; description?: string };
    expect(data.name).toBe('Isolation');
    expect(data.motifs).toEqual(['cold', 'mirror', 'silence', 'locked']);
    expect(data.description).toBe('apartness');
  });

  it('add omits description when not provided', async () => {
    await handleThemeCommand(args('add', { name: 'Hope', motifs: 'light,dawn' }), dir, out);
    const data = YAML.parse(await readFile(join(dir, 'themes', 'hope.yml'), 'utf-8')) as {
      description?: string;
    };
    expect(data.description).toBeUndefined();
  });

  it('add refuses to overwrite an existing theme', async () => {
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold' }), dir, out);
    log.length = 0;
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold' }), dir, out);
    expect(has('Theme already exists')).toBe(true);
  });

  // ── list ───────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    await handleThemeCommand(args('list'), dir, out);
    expect(has('No themes registered')).toBe(true);
  });

  it('list renders themes with motifs and description', async () => {
    await handleThemeCommand(
      args('add', { name: 'Isolation', motifs: 'cold,mirror', description: 'apartness' }),
      dir,
      out
    );
    await handleThemeCommand(args('add', { name: 'Hope', motifs: 'light' }), dir, out);
    log.length = 0;

    await handleThemeCommand(args('list'), dir, out);
    expect(has('Isolation')).toBe(true);
    expect(has('Hope')).toBe(true);
    expect(has('Motifs (2): cold, mirror')).toBe(true);
    expect(has('apartness')).toBe(true);
    expect(has('Total: 2 themes')).toBe(true);
  });

  // ── trace ──────────────────────────────────────────────────────────────────
  it('trace reports when no themes registered', async () => {
    await handleThemeCommand(args('trace'), dir, out);
    expect(has('No themes registered')).toBe(true);
  });

  it('trace reports a not-found named theme', async () => {
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold' }), dir, out);
    log.length = 0;
    await handleThemeCommand(args('trace', { theme: 'ghost' }), dir, out);
    expect(has('Theme not found: ghost')).toBe(true);
    expect(has('Known themes: Isolation')).toBe(true);
  });

  it('trace warns when there are no chapters', async () => {
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold' }), dir, out);
    log.length = 0;
    await handleThemeCommand(args('trace'), dir, out);
    expect(has('No chapter files found')).toBe(true);
  });

  it('trace renders density, gaps, spikes and totals', async () => {
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold,mirror' }), dir, out);
    await writeChapter('01.md', 'cold cold cold cold mirror word word word word word');
    await writeChapter('02.md', 'nothing thematic happens here in this warm chapter at all');
    await writeChapter('03.md', 'cold word word word word word word word word word');
    log.length = 0;

    await handleThemeCommand(args('trace'), dir, out);
    expect(has('=== 🎭 Isolation ===')).toBe(true);
    expect(has('Density:')).toBe(true);
    expect(has('Per-chapter motif density')).toBe(true);
    expect(has('ABSENT in 1 chapter')).toBe(true); // chapter 02 is a gap
    expect(has('Spikes')).toBe(true);              // chapter 01 spikes
    expect(has('Total occurrences:')).toBe(true);
  });

  it('trace reports full presence when every chapter has the theme', async () => {
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold' }), dir, out);
    await writeChapter('01.md', 'cold word word word word');
    await writeChapter('02.md', 'cold word word word word');
    log.length = 0;

    await handleThemeCommand(args('trace', { theme: 'isolation' }), dir, out);
    expect(has('present in every chapter')).toBe(true);
  });

  it('trace with no filter renders multiple themes separated', async () => {
    await handleThemeCommand(args('add', { name: 'Isolation', motifs: 'cold' }), dir, out);
    await handleThemeCommand(args('add', { name: 'Hope', motifs: 'light' }), dir, out);
    await writeChapter('01.md', 'cold light word word word');
    log.length = 0;

    await handleThemeCommand(args('trace'), dir, out);
    expect(has('=== 🎭 Isolation ===')).toBe(true);
    expect(has('=== 🎭 Hope ===')).toBe(true);
  });
});
