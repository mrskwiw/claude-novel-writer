/**
 * Coverage tests: src/cli/handlers/context-handler.ts
 *
 * handleContextCommand(args, projectPath, output, extension?)
 *
 * Covers contracts/show-contract/build subcommands. `build` additionally uses
 * getProjectId() and getContextPolicyEngine(), so the stub exposes those.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleContextCommand } from '../../project/src/cli/handlers/context-handler.js';
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
    command: 'context',
    subcommand,
    positional: [subcommand, ...rest],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

interface ContractSvc {
  listAll: () => unknown[];
  getById: (id: string) => unknown;
}

/** Stub with the contract service plus optional policy engine / projectId. */
function makeExt(opts: {
  contractSvc?: Partial<ContractSvc>;
  policyEngine?: { buildContext: (req: unknown) => Promise<unknown> };
  projectId?: number;
  noContractMethod?: boolean;
}): NovelWriterExtension {
  const ext: Record<string, unknown> = {};
  if (!opts.noContractMethod) {
    ext.getContextContractService = () => opts.contractSvc ?? {};
  }
  if (opts.policyEngine) ext.getContextPolicyEngine = () => opts.policyEngine;
  ext.getProjectId = () => opts.projectId;
  return ext as unknown as NovelWriterExtension;
}

describe('context-handler coverage', () => {
  let log: string[];
  let out: OutputFormatter;

  beforeEach(() => {
    const o = makeOutput();
    log = o.log;
    out = o.out;
  });

  // ── dispatcher / service resolution ────────────────────────────────────────
  it('errors on unknown subcommand', async () => {
    await handleContextCommand(args('frob'), '/p', out, makeExt({}));
    expect(log.some((l) => l.includes('Unknown context subcommand'))).toBe(true);
  });

  it('contracts errors when no extension', async () => {
    await handleContextCommand(args('contracts'), '/p', out, undefined);
    expect(log.some((l) => l.includes('Failed to list contracts') || l.includes('No active project'))).toBe(true);
  });

  it('contracts errors when extension lacks getContextContractService', async () => {
    await handleContextCommand(args('contracts'), '/p', out, makeExt({ noContractMethod: true }));
    expect(log.some((l) => l.includes('ContextContractService not available'))).toBe(true);
  });

  // ── contracts ──────────────────────────────────────────────────────────────
  it('contracts reports empty', async () => {
    await handleContextCommand(args('contracts'), '/p', out, makeExt({ contractSvc: { listAll: () => [] } }));
    expect(log.some((l) => l.includes('No context contracts registered'))).toBe(true);
  });

  it('contracts renders a list', async () => {
    await handleContextCommand(
      args('contracts'),
      '/p',
      out,
      makeExt({
        contractSvc: {
          listAll: () => [
            { id: 'c1', name: 'Scene', description: 'd', operationType: 'gen', maxTokens: 1000, deterministic: true },
          ],
        },
      })
    );
    expect(log.some((l) => l.includes('Context Contracts (1)'))).toBe(true);
  });

  it('contracts catches service errors', async () => {
    await handleContextCommand(
      args('contracts'),
      '/p',
      out,
      makeExt({ contractSvc: { listAll: () => { throw new Error('lf'); } } })
    );
    expect(log.some((l) => l.includes('Failed to list contracts: lf'))).toBe(true);
  });

  // ── show-contract ──────────────────────────────────────────────────────────
  it('show-contract errors without an id', async () => {
    await handleContextCommand(args('show-contract'), '/p', out, makeExt({ contractSvc: {} }));
    expect(log.some((l) => l.includes('provide a contract ID'))).toBe(true);
  });

  it('show-contract reports not found', async () => {
    await handleContextCommand(
      args('show-contract', ['x']),
      '/p',
      out,
      makeExt({ contractSvc: { getById: () => null } })
    );
    expect(log.some((l) => l.includes('Context contract not found: x'))).toBe(true);
  });

  it('show-contract renders a contract (with required + optional contexts)', async () => {
    await handleContextCommand(
      args('show-contract', [], { contract: 'scene_continuation' }),
      '/p',
      out,
      makeExt({
        contractSvc: {
          getById: () => ({
            id: 'scene_continuation', name: 'Scene', operationType: 'gen', description: 'd',
            maxTokens: 2000, orderingPolicy: 'priority',
            truncationPolicy: { strategy: 'tail' }, deterministic: true,
            required: [{ type: 'scene' }, { type: 'character' }],
            optional: [{ type: 'lore' }],
          }),
        },
      })
    );
    expect(log.some((l) => l.includes('HEADING: Contract: Scene'))).toBe(true);
  });

  it('show-contract renders a contract with empty required/optional as (none)', async () => {
    await handleContextCommand(
      args('show-contract', ['c2']),
      '/p',
      out,
      makeExt({
        contractSvc: {
          getById: () => ({
            id: 'c2', name: 'Empty', operationType: 'gen', description: 'd',
            maxTokens: 100, orderingPolicy: 'fifo',
            truncationPolicy: { strategy: 'head' }, deterministic: false,
            required: [], optional: [],
          }),
        },
      })
    );
    expect(log.some((l) => l.includes('(none)'))).toBe(true);
  });

  it('show-contract catches service errors', async () => {
    await handleContextCommand(
      args('show-contract', ['c1']),
      '/p',
      out,
      makeExt({ contractSvc: { getById: () => { throw new Error('gf'); } } })
    );
    expect(log.some((l) => l.includes('Failed to show contract: gf'))).toBe(true);
  });

  // ── build ──────────────────────────────────────────────────────────────────
  it('build errors without --contract', async () => {
    await handleContextCommand(args('build'), '/p', out, makeExt({ contractSvc: {} }));
    expect(log.some((l) => l.includes('provide --contract'))).toBe(true);
  });

  it('build errors when no extension', async () => {
    await handleContextCommand(args('build', [], { contract: 'c1' }), '/p', out, undefined);
    expect(log.some((l) => l.includes('No active project'))).toBe(true);
  });

  it('build errors when project not loaded', async () => {
    await handleContextCommand(
      args('build', [], { contract: 'c1' }),
      '/p',
      out,
      makeExt({ projectId: undefined })
    );
    expect(log.some((l) => l.includes('No project loaded'))).toBe(true);
  });

  it('build renders assembled blocks (with omitted + warnings, long + short content)', async () => {
    await handleContextCommand(
      args('build', [], { contract: 'scene_continuation', scene: 5, chapter: 2, task: 'continue' }),
      '/p',
      out,
      makeExt({
        projectId: 1,
        policyEngine: {
          buildContext: async () => ({
            blocks: [
              { title: 'Long', type: 'scene', tokenCount: 10, content: 'y'.repeat(600) },
              { title: 'Short', type: 'lore', tokenCount: 5, content: 'brief' },
            ],
            totalTokens: 15,
            deterministicFingerprint: 'abcdef1234567890',
            omitted: [{ id: 'o1' }],
            warnings: [{ code: 'W1', message: 'a warning' }],
          }),
        },
      })
    );
    expect(log.some((l) => l.includes('HEADING: Context — scene_continuation'))).toBe(true);
    expect(log.some((l) => l.includes('Omitted 1 block'))).toBe(true);
    expect(log.some((l) => l.includes('W1: a warning'))).toBe(true);
  });

  it('build reports no blocks assembled', async () => {
    await handleContextCommand(
      args('build', [], { contract: 'c1' }),
      '/p',
      out,
      makeExt({
        projectId: 1,
        policyEngine: {
          buildContext: async () => ({
            blocks: [], totalTokens: 0, deterministicFingerprint: '0123456789ab',
            omitted: [], warnings: [],
          }),
        },
      })
    );
    expect(log.some((l) => l.includes('No context blocks assembled'))).toBe(true);
  });

  it('build catches engine errors', async () => {
    await handleContextCommand(
      args('build', [], { contract: 'c1' }),
      '/p',
      out,
      makeExt({
        projectId: 1,
        policyEngine: { buildContext: async () => { throw new Error('be'); } },
      })
    );
    expect(log.some((l) => l.includes('Failed to build context: be'))).toBe(true);
  });
});
