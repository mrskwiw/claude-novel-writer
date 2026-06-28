/**
 * Coverage tests: src/cli/handlers/promise-handler.ts
 *
 * Exercises every promise command branch: create (success with default and
 * explicit importance + each missing-field validation), list (empty +
 * populated with long/short descriptions), show (missing-id + not-found +
 * found), payoff (missing-id + missing-description + resolving + non-resolving),
 * health (empty + a report containing healthy/aging/weak_payoff so all three
 * status icons and the recommendation-present/absent branches render), the
 * unknown-subcommand path, and the service-resolution error paths.
 *
 * Promises are seeded through the handler so the resolved projectId matches on
 * read-back. The weak_payoff health row is produced by recording a low-strength
 * resolving payoff via the payoff handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handlePromiseCommand } from '../../project/src/cli/handlers/promise-handler.js';
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
  rest: string[] = []
): ParsedArgs {
  return {
    command: 'promise',
    subcommand,
    positional: [subcommand, ...rest],
    arguments: {},
    flags,
    raw: '',
  };
}

describe('promise-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'prom-h-'));
    ext = new TestNovelWriterExtension(dir);
    await ext.initialize({ title: 'T', author: 'A', genre: 'Fantasy', targetWordCount: 1000 });
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  afterEach(async () => {
    ext?.cleanup();
    await rmRetry(dir);
  });

  /** Create a promise via the handler and return its generated id. */
  async function createPromise(flags: Record<string, string | number | boolean>): Promise<string> {
    const o = makeOutput();
    await handlePromiseCommand(args('create', flags), dir, o.out, ext);
    const line = o.log.find((l) => l.includes('Narrative promise created'));
    expect(line, `create failed: ${o.log.join(' | ')}`).toBeDefined();
    return line!.split('Narrative promise created: ')[1];
  }

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handlePromiseCommand(args('frobnicate'), dir, out, ext);
    expect(log.some((l) => l.includes('Unknown promise subcommand'))).toBe(true);
  });

  // ── create: validation ──────────────────────────────────────────────────────
  it('create requires --type', async () => {
    await handlePromiseCommand(args('create', { title: 't', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --type'))).toBe(true);
  });

  it('create requires --title', async () => {
    await handlePromiseCommand(args('create', { type: 'mystery', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --title'))).toBe(true);
  });

  it('create requires --description', async () => {
    await handlePromiseCommand(args('create', { type: 'mystery', title: 't' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --description'))).toBe(true);
  });

  // ── create: success ──────────────────────────────────────────────────────────
  it('create with default importance', async () => {
    await handlePromiseCommand(
      args('create', { type: 'mystery', title: 'Who killed X?', description: 'a whodunit' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Narrative promise created'))).toBe(true);
    expect(log.some((l) => l.includes('Importance: 5'))).toBe(true);
  });

  it('create with explicit importance', async () => {
    await handlePromiseCommand(
      args('create', { type: 'foreshadowing', title: 'A dark omen', description: 'd', importance: 9 }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Importance: 9'))).toBe(true);
  });

  // ── list ────────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    await handlePromiseCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('No open narrative promises'))).toBe(true);
  });

  it('list renders open promises (long + short descriptions)', async () => {
    await createPromise({ type: 'mystery', title: 'Long One', description: 'x'.repeat(90) });
    await createPromise({ type: 'plot_question', title: 'Short One', description: 'brief' });
    await handlePromiseCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('Open Promises'))).toBe(true);
    expect(log.some((l) => l.includes('Long One'))).toBe(true);
    expect(log.some((l) => l.includes('Short One'))).toBe(true);
  });

  // ── show ─────────────────────────────────────────────────────────────────────
  it('show requires an id', async () => {
    await handlePromiseCommand(args('show'), dir, out, ext);
    expect(log.some((l) => l.includes('provide a promise ID'))).toBe(true);
  });

  it('show reports not found', async () => {
    await handlePromiseCommand(args('show', {}, ['missing']), dir, out, ext);
    expect(log.some((l) => l.includes('Promise not found'))).toBe(true);
  });

  it('show renders a promise', async () => {
    const id = await createPromise({ type: 'mystery', title: 'The Locked Room', description: 'how?' });
    await handlePromiseCommand(args('show', {}, [id]), dir, out, ext);
    expect(log.some((l) => l.includes('Promise: The Locked Room'))).toBe(true);
    expect(log.some((l) => l.includes('KV:'))).toBe(true);
  });

  // ── payoff ────────────────────────────────────────────────────────────────────
  it('payoff requires an id', async () => {
    await handlePromiseCommand(args('payoff'), dir, out, ext);
    expect(log.some((l) => l.includes('provide a promise ID'))).toBe(true);
  });

  it('payoff requires --description', async () => {
    const id = await createPromise({ type: 'mystery', title: 'P', description: 'd' });
    await handlePromiseCommand(args('payoff', {}, [id]), dir, out, ext);
    expect(log.some((l) => l.includes('provide --description for the payoff'))).toBe(true);
  });

  it('payoff records a resolving payoff with explicit strength', async () => {
    const id = await createPromise({ type: 'mystery', title: 'P', description: 'd' });
    await handlePromiseCommand(
      args('payoff', { description: 'the reveal', strength: 8, resolves: true }, [id]),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Payoff recorded'))).toBe(true);
    expect(log.some((l) => l.includes('Resolves: yes'))).toBe(true);
  });

  it('payoff records a non-resolving payoff with default strength', async () => {
    const id = await createPromise({ type: 'mystery', title: 'P2', description: 'd' });
    await handlePromiseCommand(args('payoff', { description: 'a hint' }, [id]), dir, out, ext);
    expect(log.some((l) => l.includes('Payoff recorded'))).toBe(true);
    expect(log.some((l) => l.includes('Resolves: no'))).toBe(true);
  });

  // ── health ────────────────────────────────────────────────────────────────────
  it('health shows empty message', async () => {
    await handlePromiseCommand(args('health'), dir, out, ext);
    expect(log.some((l) => l.includes('No promise health data'))).toBe(true);
  });

  it('health renders healthy, aging and weak_payoff rows', async () => {
    // healthy: open, low importance, no recommendation text
    await createPromise({ type: 'plot_question', title: 'Healthy One', description: 'd', importance: 3 });
    // aging: open, high importance → recommendation present
    await createPromise({ type: 'mystery', title: 'Aging One', description: 'd', importance: 8 });
    // weak_payoff: resolved with low strength → '✗' icon + recommendation
    const weakId = await createPromise({ type: 'foreshadowing', title: 'Weak One', description: 'd', importance: 4 });
    await handlePromiseCommand(
      args('payoff', { description: 'fizzle', strength: 1, resolves: true }, [weakId]),
      dir,
      out,
      ext
    );

    await handlePromiseCommand(args('health'), dir, out, ext);
    expect(log.some((l) => l.includes('Promise Health Report'))).toBe(true);
    expect(log.some((l) => l.includes('[healthy]'))).toBe(true);
    expect(log.some((l) => l.includes('[aging]'))).toBe(true);
    expect(log.some((l) => l.includes('[weak_payoff]'))).toBe(true);
  });

  // ── service-resolution error paths ──────────────────────────────────────────────
  it('list errors when no extension is provided', async () => {
    await handlePromiseCommand(args('list'), dir, out, undefined);
    expect(log.some((l) => l.includes('Failed to list promises'))).toBe(true);
  });

  it('create errors when extension lacks getPromiseService', async () => {
    const fake = { projectId: 1 } as unknown as Parameters<typeof handlePromiseCommand>[3];
    await handlePromiseCommand(
      args('create', { type: 'mystery', title: 't', description: 'd' }),
      dir,
      out,
      fake
    );
    expect(log.some((l) => l.includes('Failed to create promise'))).toBe(true);
  });
});
