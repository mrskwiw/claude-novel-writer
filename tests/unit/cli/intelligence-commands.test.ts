/**
 * Unit tests for Ticket 012 — CLI Commands for the intelligence layer
 *
 * Verifies:
 *  - All 5 commands are registered in the CommandRegistry
 *  - Each command definition carries the correct name
 *  - Handler functions exist and are callable (services mocked with vi.fn())
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Command definitions ──────────────────────────────────────────────────────
import { knowledgeCommand } from '../../../project/src/cli/commands/knowledge.js';
import { canonCommand } from '../../../project/src/cli/commands/canon.js';
import { promiseCommand } from '../../../project/src/cli/commands/promise.js';
import { contextCommand } from '../../../project/src/cli/commands/context.js';
import { graphCommand } from '../../../project/src/cli/commands/graph.js';

// ── Registry ─────────────────────────────────────────────────────────────────
import { CommandRegistry } from '../../../project/src/cli/registry.js';

// ── Handlers ─────────────────────────────────────────────────────────────────
import { handleKnowledgeCommand } from '../../../project/src/cli/handlers/knowledge-handler.js';
import { handleCanonCommand } from '../../../project/src/cli/handlers/canon-handler.js';
import { handlePromiseCommand } from '../../../project/src/cli/handlers/promise-handler.js';
import { handleContextCommand } from '../../../project/src/cli/handlers/context-handler.js';
import { handleGraphCommand } from '../../../project/src/cli/handlers/graph-handler.js';

import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ParsedArgs with a given subcommand and optional positional args. */
function makeArgs(subcommand: string, extra: string[] = [], flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'novel',
    subcommand,
    arguments: {},
    flags,
    positional: [subcommand, ...extra],
    raw: `/novel ${subcommand}`,
  };
}

/** Build a mock OutputFormatter. */
function makeOutput(): OutputFormatter {
  return {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    dim: vi.fn(),
    table: vi.fn(),
    list: vi.fn(),
    section: vi.fn(),
    spinner: vi.fn().mockReturnValue({ stop: vi.fn() }),
    newline: vi.fn(),
    heading: vi.fn(),
    keyValue: vi.fn(),
    code: vi.fn(),
  };
}

/** Build a minimal extension stub with mocked intelligence services. */
function makeExtensionStub() {
  const knowledgeSvc = {
    listByType: vi.fn().mockResolvedValue([]),
    listByStatus: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
  };

  const canonSvc = {
    createFact: vi.fn().mockResolvedValue({ item: { id: 'c1', type: 'fact', strength: 'hard', status: 'active', subject: 'x', predicate: 'y', object: 'z', description: '', createdAt: '', updatedAt: '' }, conflict: null }),
    createRule: vi.fn().mockResolvedValue({ item: { id: 'c2', type: 'rule', strength: 'hard', status: 'active', subject: 'x', predicate: 'y', description: '', createdAt: '', updatedAt: '' }, conflict: null }),
    createSituation: vi.fn().mockResolvedValue({ item: { id: 'c3', type: 'situation', strength: 'soft', status: 'active', subject: 'x', predicate: 'y', description: '', createdAt: '', updatedAt: '' }, conflict: null }),
    createAssertion: vi.fn().mockResolvedValue({ item: { id: 'c4', type: 'assertion', strength: 'inferred', status: 'active', subject: 'x', predicate: 'y', description: '', createdAt: '', updatedAt: '' }, conflict: null }),
    listActiveCanon: vi.fn().mockResolvedValue([]),
    listConflicts: vi.fn().mockResolvedValue([]),
    promoteAssertion: vi.fn().mockResolvedValue(undefined),
  };

  const promiseSvc = {
    createPromise: vi.fn().mockResolvedValue({ id: 'p1', title: 'Test', type: 'mystery', status: 'open', importance: 5, readerVisibility: 5, relatedCharacters: [], relatedPlotThreads: [], relatedThemes: [], description: '', introducedAt: {}, source: {}, createdAt: '', updatedAt: '' }),
    listOpen: vi.fn().mockResolvedValue([]),
    listByProject: vi.fn().mockResolvedValue([]),
    addPayoff: vi.fn().mockResolvedValue({ id: 'po1', promiseId: 'p1', payoffAt: {}, description: 'paid', payoffStrength: 5, resolvesPromise: false }),
    reportHealth: vi.fn().mockResolvedValue([]),
  };

  const contractSvc = {
    listAll: vi.fn().mockReturnValue([]),
    getById: vi.fn().mockReturnValue(null),
  };

  const graphSvc = {
    rebuild: vi.fn().mockResolvedValue({ nodeCount: 0, edgeCount: 0 }),
    getNode: vi.fn().mockResolvedValue(null),
    getNeighbors: vi.fn().mockResolvedValue([]),
    findPath: vi.fn().mockResolvedValue(null),
  };

  return {
    projectId: 1,
    getKnowledgeService: vi.fn().mockReturnValue(knowledgeSvc),
    getCanonService: vi.fn().mockReturnValue(canonSvc),
    getPromiseService: vi.fn().mockReturnValue(promiseSvc),
    getContextContractService: vi.fn().mockReturnValue(contractSvc),
    getNarrativeGraphService: vi.fn().mockReturnValue(graphSvc),
    _knowledgeSvc: knowledgeSvc,
    _canonSvc: canonSvc,
    _promiseSvc: promiseSvc,
    _contractSvc: contractSvc,
    _graphSvc: graphSvc,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Intelligence layer — command definitions', () => {
  it('knowledgeCommand.name is "knowledge"', () => {
    expect(knowledgeCommand.name).toBe('knowledge');
  });

  it('canonCommand.name is "canon"', () => {
    expect(canonCommand.name).toBe('canon');
  });

  it('promiseCommand.name is "promise"', () => {
    expect(promiseCommand.name).toBe('promise');
  });

  it('contextCommand.name is "context"', () => {
    expect(contextCommand.name).toBe('context');
  });

  it('graphCommand.name is "graph"', () => {
    expect(graphCommand.name).toBe('graph');
  });

  describe('knowledgeCommand subcommands', () => {
    it('has list, show, search subcommands', () => {
      const names = (knowledgeCommand.subcommands ?? []).map(s => s.name);
      expect(names).toContain('list');
      expect(names).toContain('show');
      expect(names).toContain('search');
    });
  });

  describe('canonCommand subcommands', () => {
    it('has create, list, show, conflicts, promote subcommands', () => {
      const names = (canonCommand.subcommands ?? []).map(s => s.name);
      expect(names).toContain('create');
      expect(names).toContain('list');
      expect(names).toContain('show');
      expect(names).toContain('conflicts');
      expect(names).toContain('promote');
    });
  });

  describe('promiseCommand subcommands', () => {
    it('has create, list, show, payoff, health subcommands', () => {
      const names = (promiseCommand.subcommands ?? []).map(s => s.name);
      expect(names).toContain('create');
      expect(names).toContain('list');
      expect(names).toContain('show');
      expect(names).toContain('payoff');
      expect(names).toContain('health');
    });
  });

  describe('contextCommand subcommands', () => {
    it('has contracts, show-contract, build subcommands', () => {
      const names = (contextCommand.subcommands ?? []).map(s => s.name);
      expect(names).toContain('contracts');
      expect(names).toContain('show-contract');
      expect(names).toContain('build');
    });
  });

  describe('graphCommand subcommands', () => {
    it('has rebuild, show, neighbors, path subcommands', () => {
      const names = (graphCommand.subcommands ?? []).map(s => s.name);
      expect(names).toContain('rebuild');
      expect(names).toContain('show');
      expect(names).toContain('neighbors');
      expect(names).toContain('path');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Intelligence layer — registry registration', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('registers "knowledge" command', () => {
    expect(registry.has('knowledge')).toBe(true);
  });

  it('registers "canon" command', () => {
    expect(registry.has('canon')).toBe(true);
  });

  it('registers "promise" command', () => {
    expect(registry.has('promise')).toBe(true);
  });

  it('registers "context" command', () => {
    expect(registry.has('context')).toBe(true);
  });

  it('registers "graph" command', () => {
    expect(registry.has('graph')).toBe(true);
  });

  it('all 5 intelligence commands appear in getAll()', () => {
    const allNames = registry.getAll().map(c => c.name);
    expect(allNames).toContain('knowledge');
    expect(allNames).toContain('canon');
    expect(allNames).toContain('promise');
    expect(allNames).toContain('context');
    expect(allNames).toContain('graph');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('handleKnowledgeCommand', () => {
  it('is callable', () => {
    expect(typeof handleKnowledgeCommand).toBe('function');
  });

  it('calls listByStatus for "list" without type flag', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleKnowledgeCommand(makeArgs('list'), '/tmp', output, ext as never);
    expect(ext.getKnowledgeService).toHaveBeenCalled();
    expect(ext._knowledgeSvc.listByStatus).toHaveBeenCalledWith('1', 'active');
  });

  it('calls listByType for "list" with --type flag', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleKnowledgeCommand(makeArgs('list', [], { type: 'character_profile' }), '/tmp', output, ext as never);
    expect(ext._knowledgeSvc.listByType).toHaveBeenCalledWith('1', 'character_profile');
  });

  it('outputs error for "show" without id', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleKnowledgeCommand(makeArgs('show'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Please provide'));
  });

  it('calls search for "search" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleKnowledgeCommand(makeArgs('search', ['dragon']), '/tmp', output, ext as never);
    expect(ext._knowledgeSvc.search).toHaveBeenCalledWith('1', 'dragon');
  });

  it('outputs error for unknown subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleKnowledgeCommand(makeArgs('unknown'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Unknown knowledge subcommand'));
  });

  it('outputs error when no extension provided', async () => {
    const output = makeOutput();
    await handleKnowledgeCommand(makeArgs('list'), '/tmp', output, undefined);
    expect(output.error).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('handleCanonCommand', () => {
  it('is callable', () => {
    expect(typeof handleCanonCommand).toBe('function');
  });

  it('calls listActiveCanon for "list" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleCanonCommand(makeArgs('list'), '/tmp', output, ext as never);
    expect(ext._canonSvc.listActiveCanon).toHaveBeenCalledWith('1');
  });

  it('outputs error for "create" without --type', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleCanonCommand(makeArgs('create'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--type'));
  });

  it('calls createFact for "create" with --type fact', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleCanonCommand(makeArgs('create', [], {
      type: 'fact',
      subject: 'Mira',
      predicate: 'has',
      object: 'green eyes',
      description: 'established ch1',
    }), '/tmp', output, ext as never);
    expect(ext._canonSvc.createFact).toHaveBeenCalled();
    expect(output.success).toHaveBeenCalled();
  });

  it('calls listConflicts for "conflicts" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleCanonCommand(makeArgs('conflicts'), '/tmp', output, ext as never);
    expect(ext._canonSvc.listConflicts).toHaveBeenCalledWith('1');
  });

  it('calls promoteAssertion for "promote" subcommand with id', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleCanonCommand(makeArgs('promote', ['abc-123']), '/tmp', output, ext as never);
    expect(ext._canonSvc.promoteAssertion).toHaveBeenCalledWith('abc-123');
  });

  it('outputs error for "promote" without id', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleCanonCommand(makeArgs('promote'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Please provide'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('handlePromiseCommand', () => {
  it('is callable', () => {
    expect(typeof handlePromiseCommand).toBe('function');
  });

  it('calls listOpen for "list" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handlePromiseCommand(makeArgs('list'), '/tmp', output, ext as never);
    expect(ext._promiseSvc.listOpen).toHaveBeenCalledWith('1');
  });

  it('outputs error for "create" without --type', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handlePromiseCommand(makeArgs('create'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--type'));
  });

  it('calls createPromise for "create" with required flags', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handlePromiseCommand(makeArgs('create', [], {
      type: 'mystery',
      title: 'Who killed the king?',
      description: 'Introduced in ch 1',
      importance: 9,
    }), '/tmp', output, ext as never);
    expect(ext._promiseSvc.createPromise).toHaveBeenCalled();
    expect(output.success).toHaveBeenCalled();
  });

  it('calls reportHealth for "health" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handlePromiseCommand(makeArgs('health'), '/tmp', output, ext as never);
    expect(ext._promiseSvc.reportHealth).toHaveBeenCalledWith('1');
  });

  it('outputs error for "payoff" without id', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handlePromiseCommand(makeArgs('payoff'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('promise ID'));
  });

  it('calls addPayoff for "payoff" with id and description', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handlePromiseCommand(makeArgs('payoff', ['p1'], { description: 'The reveal', strength: 8, resolves: true }), '/tmp', output, ext as never);
    expect(ext._promiseSvc.addPayoff).toHaveBeenCalledWith('p1', expect.objectContaining({
      description: 'The reveal',
      payoffStrength: 8,
      resolvesPromise: true,
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('handleContextCommand', () => {
  it('is callable', () => {
    expect(typeof handleContextCommand).toBe('function');
  });

  it('calls listAll for "contracts" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleContextCommand(makeArgs('contracts'), '/tmp', output, ext as never);
    expect(ext._contractSvc.listAll).toHaveBeenCalled();
  });

  it('outputs error for "show-contract" without id', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleContextCommand(makeArgs('show-contract'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('contract ID'));
  });

  it('calls getById for "show-contract" with id', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleContextCommand(makeArgs('show-contract', ['scene_continuation']), '/tmp', output, ext as never);
    expect(ext._contractSvc.getById).toHaveBeenCalledWith('scene_continuation');
  });

  it('returns stub message for "build" when not wired', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleContextCommand(makeArgs('build', [], { contract: 'scene_continuation' }), '/tmp', output, ext as never);
    expect(output.info).toHaveBeenCalledWith(expect.stringContaining('Context build not yet wired'));
  });

  it('outputs error for "build" without --contract', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleContextCommand(makeArgs('build'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--contract'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('handleGraphCommand', () => {
  it('is callable', () => {
    expect(typeof handleGraphCommand).toBe('function');
  });

  it('calls rebuild for "rebuild" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('rebuild'), '/tmp', output, ext as never);
    expect(ext._graphSvc.rebuild).toHaveBeenCalledWith('1');
    expect(output.success).toHaveBeenCalled();
  });

  it('outputs error for "show" without nodeId', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('show'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('node ID'));
  });

  it('calls getNode for "show" with nodeId', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('show', ['node-123']), '/tmp', output, ext as never);
    expect(ext._graphSvc.getNode).toHaveBeenCalledWith('node-123');
  });

  it('calls getNeighbors for "neighbors" subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('neighbors', ['node-123']), '/tmp', output, ext as never);
    expect(ext._graphSvc.getNeighbors).toHaveBeenCalledWith('node-123');
  });

  it('outputs error for "path" without --from', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('path', [], { to: 'node-b' }), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--from'));
  });

  it('calls findPath for "path" with --from and --to', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('path', [], { from: 'node-a', to: 'node-b' }), '/tmp', output, ext as never);
    expect(ext._graphSvc.findPath).toHaveBeenCalledWith('node-a', 'node-b');
  });

  it('outputs error for unknown subcommand', async () => {
    const ext = makeExtensionStub();
    const output = makeOutput();
    await handleGraphCommand(makeArgs('whoops'), '/tmp', output, ext as never);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Unknown graph subcommand'));
  });
});
