/**
 * Coverage tests: src/cli/handlers/canon-handler.ts
 *
 * Exercises the full canon command surface: create (every type + every
 * validation branch + conflict detection), list (empty + populated), show
 * (missing-id + not-found + found, via BOTH dispatch layouts), conflicts
 * (empty + populated), promote, the unknown-subcommand path, and the
 * service-resolution error paths (no extension / extension without
 * getCanonService).
 *
 * Items are seeded through the handler itself so the resolved projectId
 * (resolveProjectId → extension.projectId) is identical on read-back.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestNovelWriterExtension } from '../helpers/test-extension.js';
import { handleCanonCommand } from '../../project/src/cli/handlers/canon-handler.js';
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

/** subcommand-set layout: positional = [subcommand, ...rest]. */
function args(
  subcommand: string,
  flags: Record<string, string | number | boolean> = {},
  rest: string[] = []
): ParsedArgs {
  return {
    command: 'canon',
    subcommand,
    positional: [subcommand, ...rest],
    arguments: {},
    flags,
    raw: '',
  };
}

/** dispatch-via-positional layout: subcommand unset, positional carries it. */
function positionalArgs(tokens: string[]): ParsedArgs {
  return {
    command: 'canon',
    positional: tokens,
    arguments: {},
    flags: {},
    raw: '',
  };
}

describe('canon-handler coverage', () => {
  let dir: string;
  let ext: TestNovelWriterExtension;
  let log: string[];
  let out: OutputFormatter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'canon-h-'));
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

  /** Create a canon item via the handler and return its generated id. */
  async function createItem(flags: Record<string, string | number | boolean>): Promise<string> {
    const o = makeOutput();
    await handleCanonCommand(args('create', flags), dir, o.out, ext);
    const line = o.log.find((l) => l.includes('Canon item created'));
    expect(line, `create failed: ${o.log.join(' | ')}`).toBeDefined();
    return line!.split('Canon item created: ')[1];
  }

  // ── dispatcher ────────────────────────────────────────────────────────────
  it('unknown subcommand', async () => {
    await handleCanonCommand(args('frobnicate'), dir, out, ext);
    expect(log.some((l) => l.includes('Unknown canon subcommand'))).toBe(true);
  });

  // ── create: validation ──────────────────────────────────────────────────────
  it('create requires --type', async () => {
    await handleCanonCommand(args('create', { subject: 's', predicate: 'p', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --type'))).toBe(true);
  });

  it('create requires --subject', async () => {
    await handleCanonCommand(args('create', { type: 'fact', predicate: 'p', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --subject'))).toBe(true);
  });

  it('create requires --predicate', async () => {
    await handleCanonCommand(args('create', { type: 'fact', subject: 's', description: 'd' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --predicate'))).toBe(true);
  });

  it('create requires --description', async () => {
    await handleCanonCommand(args('create', { type: 'fact', subject: 's', predicate: 'p' }), dir, out, ext);
    expect(log.some((l) => l.includes('provide --description'))).toBe(true);
  });

  it('create rejects an invalid type', async () => {
    await handleCanonCommand(
      args('create', { type: 'nonsense', subject: 's', predicate: 'p', description: 'd' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Invalid type'))).toBe(true);
  });

  it('create fact requires --object', async () => {
    await handleCanonCommand(
      args('create', { type: 'fact', subject: 's', predicate: 'p', description: 'd' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Facts require --object'))).toBe(true);
  });

  // ── create: each type ────────────────────────────────────────────────────────
  it('create a fact', async () => {
    await handleCanonCommand(
      args('create', { type: 'fact', subject: 'sky', predicate: 'is', object: 'blue', description: 'the sky is blue' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Canon item created'))).toBe(true);
    expect(log.some((l) => l.includes('Type: fact'))).toBe(true);
  });

  it('create a rule', async () => {
    await handleCanonCommand(
      args('create', { type: 'rule', subject: 'magic', predicate: 'costs', description: 'magic costs life' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Type: rule'))).toBe(true);
  });

  it('create a situation', async () => {
    await handleCanonCommand(
      args('create', { type: 'situation', subject: 'war', predicate: 'rages', description: 'war rages on' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Type: situation'))).toBe(true);
  });

  it('create an assertion', async () => {
    await handleCanonCommand(
      args('create', { type: 'assertion', subject: 'hero', predicate: 'might', description: 'hero might win' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Type: assertion'))).toBe(true);
  });

  it('create surfaces a detected conflict', async () => {
    await createItem({ type: 'fact', subject: 'door', predicate: 'color', object: 'red', description: 'd1' });
    await handleCanonCommand(
      args('create', { type: 'fact', subject: 'door', predicate: 'color', object: 'blue', description: 'd2' }),
      dir,
      out,
      ext
    );
    expect(log.some((l) => l.includes('Conflict detected'))).toBe(true);
  });

  // ── list ────────────────────────────────────────────────────────────────────
  it('list shows empty message', async () => {
    await handleCanonCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('No active canon items'))).toBe(true);
  });

  it('list renders items (with and without object)', async () => {
    await createItem({ type: 'fact', subject: 'sky', predicate: 'is', object: 'blue', description: 'with object' });
    await createItem({ type: 'rule', subject: 'magic', predicate: 'exists', description: 'without object' });
    await handleCanonCommand(args('list'), dir, out, ext);
    expect(log.some((l) => l.includes('Active Canon'))).toBe(true);
    expect(log.some((l) => l.includes('sky is blue'))).toBe(true);
    expect(log.some((l) => l.includes('magic exists'))).toBe(true);
  });

  // ── show ─────────────────────────────────────────────────────────────────────
  it('show requires an id', async () => {
    await handleCanonCommand(args('show'), dir, out, ext);
    expect(log.some((l) => l.includes('provide a canon item ID'))).toBe(true);
  });

  it('show reports not found', async () => {
    await handleCanonCommand(args('show', {}, ['does-not-exist']), dir, out, ext);
    expect(log.some((l) => l.includes('Canon item not found'))).toBe(true);
  });

  it('show renders an item (subcommand-set dispatch)', async () => {
    const id = await createItem({ type: 'fact', subject: 'sky', predicate: 'is', object: 'blue', description: 'desc' });
    await handleCanonCommand(args('show', {}, [id]), dir, out, ext);
    expect(log.some((l) => l.includes('Canon Item: sky is'))).toBe(true);
    expect(log.some((l) => l.includes('KV:'))).toBe(true);
  });

  it('show renders an item (positional dispatch, subcommand unset)', async () => {
    const id = await createItem({ type: 'fact', subject: 'sea', predicate: 'is', object: 'deep', description: 'desc' });
    await handleCanonCommand(positionalArgs(['show', id]), dir, out, ext);
    expect(log.some((l) => l.includes('Canon Item: sea is'))).toBe(true);
  });

  // ── conflicts ─────────────────────────────────────────────────────────────────
  it('conflicts shows none when clean', async () => {
    await handleCanonCommand(args('conflicts'), dir, out, ext);
    expect(log.some((l) => l.includes('No open canon conflicts'))).toBe(true);
  });

  it('conflicts lists open conflicts', async () => {
    await createItem({ type: 'fact', subject: 'door', predicate: 'color', object: 'red', description: 'd1' });
    await createItem({ type: 'fact', subject: 'door', predicate: 'color', object: 'green', description: 'd2' });
    await handleCanonCommand(args('conflicts'), dir, out, ext);
    expect(log.some((l) => l.includes('Open Conflicts'))).toBe(true);
    expect(log.some((l) => l.includes('direct_contradiction'))).toBe(true);
  });

  // ── promote ───────────────────────────────────────────────────────────────────
  it('promote requires an id', async () => {
    await handleCanonCommand(args('promote'), dir, out, ext);
    expect(log.some((l) => l.includes('provide a canon item ID'))).toBe(true);
  });

  it('promote an assertion to a hard fact (subcommand-set dispatch)', async () => {
    const id = await createItem({ type: 'assertion', subject: 'hero', predicate: 'wins', description: 'maybe' });
    await handleCanonCommand(args('promote', {}, [id]), dir, out, ext);
    expect(log.some((l) => l.includes(`Canon item ${id} promoted`))).toBe(true);
  });

  it('promote via positional dispatch (subcommand unset)', async () => {
    const id = await createItem({ type: 'assertion', subject: 'villain', predicate: 'falls', description: 'maybe' });
    await handleCanonCommand(positionalArgs(['promote', id]), dir, out, ext);
    expect(log.some((l) => l.includes(`Canon item ${id} promoted`))).toBe(true);
  });

  // ── service-resolution error paths ──────────────────────────────────────────────
  it('list errors when no extension is provided', async () => {
    await handleCanonCommand(args('list'), dir, out, undefined);
    expect(log.some((l) => l.includes('Failed to list canon'))).toBe(true);
  });

  it('create errors when extension lacks getCanonService', async () => {
    const fake = { projectId: 1 } as unknown as Parameters<typeof handleCanonCommand>[3];
    await handleCanonCommand(
      args('create', { type: 'fact', subject: 's', predicate: 'p', object: 'o', description: 'd' }),
      dir,
      out,
      fake
    );
    expect(log.some((l) => l.includes('Failed to create canon item'))).toBe(true);
  });
});
