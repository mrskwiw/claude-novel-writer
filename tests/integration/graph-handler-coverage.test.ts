/**
 * Coverage tests: src/cli/handlers/graph-handler.ts
 *
 * handleGraphCommand(args, projectPath, output, extension?)
 *
 * The handler resolves a NarrativeGraphService from the extension via
 * getNarrativeGraphService(). We pass lightweight extension stubs whose service
 * methods are controllable so we can hit every render / empty / error branch.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleGraphCommand } from '../../project/src/cli/handlers/graph-handler.js';
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
    command: 'graph',
    subcommand,
    positional: [subcommand, ...rest],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

interface GraphSvc {
  rebuild: (id: string) => Promise<{ nodeCount: number; edgeCount: number }>;
  getNode: (id: string) => Promise<unknown>;
  getNeighbors: (id: string) => Promise<unknown[]>;
  findPath: (a: string, b: string) => Promise<string[] | null>;
}

/** Build an extension stub exposing getNarrativeGraphService. */
function makeExt(svc: Partial<GraphSvc>, projectId: number | undefined = 7): NovelWriterExtension {
  const ext: Record<string, unknown> = {
    getNarrativeGraphService: () => svc,
  };
  if (projectId !== undefined) ext.projectId = projectId;
  return ext as unknown as NovelWriterExtension;
}

describe('graph-handler coverage', () => {
  let log: string[];
  let out: OutputFormatter;

  beforeEach(() => {
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  // ── dispatcher ─────────────────────────────────────────────────────────────
  it('errors on unknown subcommand', async () => {
    await handleGraphCommand(args('frob'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('Unknown graph subcommand'))).toBe(true);
  });

  // ── getGraphService failure modes ──────────────────────────────────────────
  it('errors when no extension is provided', async () => {
    await handleGraphCommand(args('rebuild'), '/p', out, undefined);
    expect(log.some((l) => l.includes('No active project'))).toBe(true);
  });

  it('errors when extension lacks getNarrativeGraphService', async () => {
    await handleGraphCommand(args('rebuild'), '/p', out, {} as unknown as NovelWriterExtension);
    expect(log.some((l) => l.includes('NarrativeGraphService not available'))).toBe(true);
  });

  // ── rebuild ────────────────────────────────────────────────────────────────
  it('rebuild reports node/edge counts', async () => {
    await handleGraphCommand(
      args('rebuild'),
      '/p',
      out,
      makeExt({ rebuild: async () => ({ nodeCount: 3, edgeCount: 5 }) })
    );
    expect(log.some((l) => l.includes('Graph rebuilt: 3 nodes, 5 edges'))).toBe(true);
  });

  it('rebuild uses fallback projectId "1" when extension has no projectId', async () => {
    let received = '';
    const ext = {
      getNarrativeGraphService: () => ({
        rebuild: async (id: string) => { received = id; return { nodeCount: 0, edgeCount: 0 }; },
      }),
    } as unknown as NovelWriterExtension;
    await handleGraphCommand(args('rebuild'), '/p', out, ext);
    expect(received).toBe('1');
  });

  it('rebuild catches service errors', async () => {
    await handleGraphCommand(
      args('rebuild'),
      '/p',
      out,
      makeExt({ rebuild: async () => { throw new Error('boom'); } })
    );
    expect(log.some((l) => l.includes('Failed to rebuild graph: boom'))).toBe(true);
  });

  // ── show ───────────────────────────────────────────────────────────────────
  it('show errors without a node id', async () => {
    await handleGraphCommand(args('show'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('provide a node ID'))).toBe(true);
  });

  it('show reports node not found', async () => {
    await handleGraphCommand(args('show', ['n1']), '/p', out, makeExt({ getNode: async () => null }));
    expect(log.some((l) => l.includes('Node not found: n1'))).toBe(true);
  });

  it('show renders a node (with summary and sourceId)', async () => {
    await handleGraphCommand(
      args('show', ['n1']),
      '/p',
      out,
      makeExt({
        getNode: async () => ({
          id: 'n1', label: 'Mira', type: 'character', summary: 's', sourceId: 'src',
          createdAt: 't0', updatedAt: 't1',
        }),
      })
    );
    expect(log.some((l) => l.includes('HEADING: Node: Mira'))).toBe(true);
  });

  it('show renders a node with missing summary/sourceId as (none)', async () => {
    await handleGraphCommand(
      args('show', ['n2']),
      '/p',
      out,
      makeExt({
        getNode: async () => ({ id: 'n2', label: 'X', type: 'scene', createdAt: 't', updatedAt: 't' }),
      })
    );
    expect(log.some((l) => l.includes('(none)'))).toBe(true);
  });

  it('show catches service errors', async () => {
    await handleGraphCommand(
      args('show', ['n1']),
      '/p',
      out,
      makeExt({ getNode: async () => { throw new Error('db fail'); } })
    );
    expect(log.some((l) => l.includes('Failed to show node: db fail'))).toBe(true);
  });

  // ── neighbors ──────────────────────────────────────────────────────────────
  it('neighbors errors without a node id', async () => {
    await handleGraphCommand(args('neighbors'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('provide a node ID'))).toBe(true);
  });

  it('neighbors reports empty result', async () => {
    await handleGraphCommand(args('neighbors', ['n1']), '/p', out, makeExt({ getNeighbors: async () => [] }));
    expect(log.some((l) => l.includes('No neighbors found'))).toBe(true);
  });

  it('neighbors renders neighbor list', async () => {
    await handleGraphCommand(
      args('neighbors', ['n1']),
      '/p',
      out,
      makeExt({
        getNeighbors: async () => [
          { node: { id: 'n2', label: 'Bob', type: 'character' }, edge: { type: 'knows', weight: 2 } },
        ],
      })
    );
    expect(log.some((l) => l.includes('Neighbors of n1 (1)'))).toBe(true);
    expect(log.some((l) => l.includes('Bob'))).toBe(true);
  });

  it('neighbors catches service errors', async () => {
    await handleGraphCommand(
      args('neighbors', ['n1']),
      '/p',
      out,
      makeExt({ getNeighbors: async () => { throw new Error('x'); } })
    );
    expect(log.some((l) => l.includes('Failed to get neighbors: x'))).toBe(true);
  });

  // ── path ───────────────────────────────────────────────────────────────────
  it('path errors without --from', async () => {
    await handleGraphCommand(args('path', [], { to: 'b' }), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('provide --from'))).toBe(true);
  });

  it('path errors without --to', async () => {
    await handleGraphCommand(args('path', [], { from: 'a' }), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('provide --to'))).toBe(true);
  });

  it('path reports no path found', async () => {
    await handleGraphCommand(
      args('path', [], { from: 'a', to: 'b' }),
      '/p',
      out,
      makeExt({ findPath: async () => null })
    );
    expect(log.some((l) => l.includes('No path found between a and b'))).toBe(true);
  });

  it('path renders a found path', async () => {
    await handleGraphCommand(
      args('path', [], { from: 'a', to: 'c' }),
      '/p',
      out,
      makeExt({ findPath: async () => ['a', 'b', 'c'] })
    );
    expect(log.some((l) => l.includes('Path: a → c'))).toBe(true);
    expect(log.some((l) => l.includes('Total hops: 2'))).toBe(true);
  });

  it('path catches service errors', async () => {
    await handleGraphCommand(
      args('path', [], { from: 'a', to: 'b' }),
      '/p',
      out,
      makeExt({ findPath: async () => { throw new Error('pf'); } })
    );
    expect(log.some((l) => l.includes('Failed to find path: pf'))).toBe(true);
  });
});
