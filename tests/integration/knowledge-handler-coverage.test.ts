/**
 * Coverage tests: src/cli/handlers/knowledge-handler.ts
 *
 * handleKnowledgeCommand(args, projectPath, output, extension?)
 *
 * Drives the KnowledgeService through controllable extension stubs to hit every
 * list/show/search render, empty, and error branch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleKnowledgeCommand } from '../../project/src/cli/handlers/knowledge-handler.js';
import type { ParsedArgs, OutputFormatter } from '../../project/src/cli/types.js';
import type { NovelWriterExtension } from '../../project/src/index.js';

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
    command: 'knowledge',
    subcommand,
    positional: [subcommand, ...rest],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

interface KSvc {
  listByType: (p: string, t: string) => Promise<unknown[]>;
  listByStatus: (p: string, s: string) => Promise<unknown[]>;
  getById: (id: string) => Promise<unknown>;
  search: (p: string, q: string) => Promise<unknown[]>;
}

function makeExt(svc: Partial<KSvc>, projectId: number | undefined = 4): NovelWriterExtension {
  const ext: Record<string, unknown> = { getKnowledgeService: () => svc };
  if (projectId !== undefined) ext.projectId = projectId;
  return ext as unknown as NovelWriterExtension;
}

const longSummary = 'x'.repeat(120);

describe('knowledge-handler coverage', () => {
  let log: string[];
  let out: OutputFormatter;

  beforeEach(() => {
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  // ── dispatcher / service resolution ────────────────────────────────────────
  it('errors on unknown subcommand', async () => {
    await handleKnowledgeCommand(args('frob'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('Unknown knowledge subcommand'))).toBe(true);
  });

  it('errors when no extension provided', async () => {
    await handleKnowledgeCommand(args('list'), '/p', out, undefined);
    expect(log.some((l) => l.includes('No active project'))).toBe(true);
  });

  it('errors when extension lacks getKnowledgeService', async () => {
    await handleKnowledgeCommand(args('list'), '/p', out, {} as unknown as NovelWriterExtension);
    expect(log.some((l) => l.includes('KnowledgeService not available'))).toBe(true);
  });

  // ── list ───────────────────────────────────────────────────────────────────
  it('list with no filter uses active status and reports empty', async () => {
    let calledWith: unknown[] = [];
    await handleKnowledgeCommand(
      args('list'),
      '/p',
      out,
      makeExt({ listByStatus: async (p, s) => { calledWith = [p, s]; return []; } })
    );
    expect(calledWith).toEqual(['4', 'active']);
    expect(log.some((l) => l.includes('No knowledge objects found'))).toBe(true);
  });

  it('list with --type uses listByType and renders objects', async () => {
    await handleKnowledgeCommand(
      args('list', [], { type: 'character_profile' }),
      '/p',
      out,
      makeExt({
        listByType: async () => [
          { type: 'character_profile', title: 'Mira', id: 'k1', summary: longSummary },
          { type: 'lore', title: 'World', id: 'k2', summary: 'short' },
          { type: 'lore', title: 'NoSum', id: 'k3' },
        ],
      })
    );
    expect(log.some((l) => l.includes('Knowledge Objects (3)'))).toBe(true);
    expect(log.some((l) => l.includes('(no summary)'))).toBe(true);
  });

  it('list with --status uses listByStatus', async () => {
    let calledWith: unknown[] = [];
    await handleKnowledgeCommand(
      args('list', [], { status: 'draft' }),
      '/p',
      out,
      makeExt({ listByStatus: async (p, s) => { calledWith = [p, s]; return []; } })
    );
    expect(calledWith).toEqual(['4', 'draft']);
  });

  it('list uses fallback projectId "1" when extension has no projectId', async () => {
    let calledWith: unknown[] = [];
    const ext = {
      getKnowledgeService: () => ({
        listByStatus: async (p: string, s: string) => { calledWith = [p, s]; return []; },
      }),
    } as unknown as NovelWriterExtension;
    await handleKnowledgeCommand(args('list'), '/p', out, ext);
    expect(calledWith).toEqual(['1', 'active']);
  });

  it('list catches service errors', async () => {
    await handleKnowledgeCommand(
      args('list'),
      '/p',
      out,
      makeExt({ listByStatus: async () => { throw new Error('listfail'); } })
    );
    expect(log.some((l) => l.includes('Failed to list knowledge objects: listfail'))).toBe(true);
  });

  // ── show ───────────────────────────────────────────────────────────────────
  it('show errors without an id', async () => {
    await handleKnowledgeCommand(args('show'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('provide a knowledge object ID'))).toBe(true);
  });

  it('show reports not found', async () => {
    await handleKnowledgeCommand(args('show', ['k9']), '/p', out, makeExt({ getById: async () => null }));
    expect(log.some((l) => l.includes('Knowledge object not found: k9'))).toBe(true);
  });

  it('show renders an object (context/graph eligible true, with summary)', async () => {
    await handleKnowledgeCommand(
      args('show', ['k1']),
      '/p',
      out,
      makeExt({
        getById: async () => ({
          id: 'k1', title: 'Mira', type: 'character_profile', status: 'active',
          confidence: 0.9, contextEligible: true, graphEligible: true,
          summary: 'A profile', createdAt: 't0', updatedAt: 't1',
        }),
      })
    );
    expect(log.some((l) => l.includes('HEADING: Knowledge Object: Mira'))).toBe(true);
  });

  it('show renders an object (not eligible, no summary)', async () => {
    await handleKnowledgeCommand(
      args('show', ['k2']),
      '/p',
      out,
      makeExt({
        getById: async () => ({
          id: 'k2', title: 'Y', type: 'lore', status: 'draft',
          confidence: 0.1, contextEligible: false, graphEligible: false,
          createdAt: 't', updatedAt: 't',
        }),
      })
    );
    expect(log.some((l) => l.includes('(none)'))).toBe(true);
  });

  it('show catches service errors', async () => {
    await handleKnowledgeCommand(
      args('show', ['k1']),
      '/p',
      out,
      makeExt({ getById: async () => { throw new Error('sf'); } })
    );
    expect(log.some((l) => l.includes('Failed to show knowledge object: sf'))).toBe(true);
  });

  // ── search ─────────────────────────────────────────────────────────────────
  it('search errors without a query', async () => {
    await handleKnowledgeCommand(args('search'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('provide a search query'))).toBe(true);
  });

  it('search via positional reports empty', async () => {
    await handleKnowledgeCommand(args('search', ['dragon']), '/p', out, makeExt({ search: async () => [] }));
    expect(log.some((l) => l.includes('No knowledge objects matched: "dragon"'))).toBe(true);
  });

  it('search via --query flag renders results (long + short + no summary)', async () => {
    await handleKnowledgeCommand(
      args('search', [], { query: 'lore' }),
      '/p',
      out,
      makeExt({
        search: async () => [
          { type: 'lore', title: 'A', id: 's1', summary: longSummary },
          { type: 'lore', title: 'B', id: 's2', summary: 'short' },
          { type: 'lore', title: 'C', id: 's3' },
        ],
      })
    );
    expect(log.some((l) => l.includes('Search Results for "lore" (3)'))).toBe(true);
  });

  it('search catches service errors', async () => {
    await handleKnowledgeCommand(
      args('search', ['q']),
      '/p',
      out,
      makeExt({ search: async () => { throw new Error('searchfail'); } })
    );
    expect(log.some((l) => l.includes('Failed to search knowledge objects: searchfail'))).toBe(true);
  });
});
