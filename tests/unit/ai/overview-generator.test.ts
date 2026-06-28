/**
 * Unit tests for `generate overview` — GenerationManager.generateOverview()
 *
 * Covers:
 *  - assembles context via readQuery for projects, characters, plot_threads,
 *    plot_beats, and world_rules
 *  - the prompt embeds cast names, plot-thread names, beat descriptions, and
 *    hard world rules
 *  - length presets ('brief' | 'standard' | 'full') drive the word-count guide
 *  - empty project (no cast, no threads) returns a warning that points at
 *    `extract --file` rather than calling the model
 *  - passthrough (no API key) is reflected in the result reasoning
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── Mock ClaudeClient before importing GenerationManager ─────────────────────

const mockGenerateStructured = vi.fn().mockResolvedValue({ content: 'mock-overview' });

vi.mock('../../../project/src/ai/claude-client.js', () => {
  class MockClaudeClient {
    generate = mockGenerateStructured;
    generateStructured = mockGenerateStructured;
    generateCreative = mockGenerateStructured;
    static isConfigured = vi.fn().mockReturnValue(true);
    static getConfigMessage = vi.fn().mockReturnValue('');
  }
  return { ClaudeClient: MockClaudeClient };
});

// ─── Mock SceneContextAssembler (imported by GenerationManager) ───────────────

vi.mock('../../../project/src/context/scene-context.js', () => {
  class SceneContextAssembler {
    assembleContext = vi.fn().mockResolvedValue({});
  }
  return { SceneContextAssembler };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GenerationManager } from '../../../project/src/ai/generation-manager.js';

const PROJECT_ID = 7;

/**
 * Mock MCPClient whose readQuery returns rows by table name, exercising the
 * full generateOverview() assembly path without a real database.
 */
function makeMockClient(overrides: {
  project?: Record<string, unknown> | null;
  characters?: Array<Record<string, unknown>>;
  threads?: Array<Record<string, unknown>>;
  beats?: Array<Record<string, unknown>>;
  worldRules?: Array<Record<string, unknown>>;
} = {}): MCPClient {
  const {
    project = {
      title: 'The Lost Signal',
      genre: 'Thriller',
      target_word_count: 90000,
      current_phase: 'planning',
    },
    characters = [
      { name: 'Elena Voss', role: 'protagonist', summary: 'A burned-out cryptographer', voice_notes: 'clipped, wry' },
      { name: 'Director Kane', role: 'antagonist', summary: 'Runs the listening station', voice_notes: 'silky threats' },
    ],
    threads = [
      { id: 11, thread_name: 'The Intercept', thread_type: 'main', description: 'Elena decodes a signal she was not meant to hear.', status: 'active', priority: 9 },
      { id: 12, thread_name: 'Kane\'s Cover-up', thread_type: 'subplot', description: 'The station erases its own logs.', status: 'planned', priority: 5 },
    ],
    beats = [
      { beat_type: 'setup', description: 'Elena finds the anomaly in the night feed.' },
      { beat_type: 'complication', description: 'Her access is quietly revoked.' },
    ],
    worldRules = [
      { rule_name: 'Total surveillance', description: 'Every transmission is logged and attributed.' },
    ],
  } = overrides;

  const readQuery = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('FROM projects')) return project ? [project] : [];
    if (sql.includes('FROM characters')) return characters;
    if (sql.includes('FROM plot_beats')) return beats;
    if (sql.includes('FROM plot_threads')) return threads;
    if (sql.includes('FROM world_rules')) return worldRules;
    return [];
  });

  return {
    readQuery,
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

function lastPrompt(): string {
  const calls = mockGenerateStructured.mock.calls;
  return calls[calls.length - 1][0] as string;
}

// ─── Query coverage ───────────────────────────────────────────────────────────

describe('generateOverview() — query coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'mock-overview' });
  });

  it.each(['projects', 'characters', 'plot_threads', 'plot_beats', 'world_rules'])(
    'reads the %s table',
    async (table) => {
      const client = makeMockClient();
      const mgr = new GenerationManager(client, PROJECT_ID);

      await mgr.generateOverview(String(PROJECT_ID), 'standard');

      const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([sql]: [string]) => sql.includes(`FROM ${table}`))).toBe(true);
    }
  );
});

// ─── Prompt content ───────────────────────────────────────────────────────────

describe('generateOverview() — prompt content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'mock-overview' });
  });

  it('embeds cast names and roles', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateOverview(String(PROJECT_ID), 'standard');

    const prompt = lastPrompt();
    expect(prompt).toContain('Elena Voss');
    expect(prompt).toContain('Director Kane');
    expect(prompt).toContain('protagonist');
  });

  it('embeds plot-thread names and beat descriptions (the outline)', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateOverview(String(PROJECT_ID), 'standard');

    const prompt = lastPrompt();
    expect(prompt).toContain('The Intercept');
    expect(prompt).toContain('Elena finds the anomaly in the night feed.');
  });

  it('embeds hard world rules when present', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateOverview(String(PROJECT_ID), 'standard');

    expect(lastPrompt()).toContain('Total surveillance');
  });

  it('frames the task as the INTENDED book, not a marketing blurb', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateOverview(String(PROJECT_ID), 'standard');

    const prompt = lastPrompt().toLowerCase();
    expect(prompt).toContain('intend');
    expect(prompt).toContain('not a marketing blurb');
  });

  it.each([
    ['brief', '150'],
    ['standard', '350'],
    ['full', '700'],
  ] as const)('length %s drives the ~%s word guide', async (length, words) => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateOverview(String(PROJECT_ID), length);

    expect(lastPrompt()).toContain(words);
  });

  it('defaults to the standard length', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateOverview(String(PROJECT_ID));

    expect(lastPrompt()).toContain('350');
  });
});

// ─── Result shape ─────────────────────────────────────────────────────────────

describe('generateOverview() — result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a GenerationResult with string content and empty alternatives', async () => {
    mockGenerateStructured.mockResolvedValue({ content: 'A planning summary.' });
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateOverview(String(PROJECT_ID), 'standard');

    expect(result.content).toBe('A planning summary.');
    expect(result.alternatives).toEqual([]);
    expect(result.reasoning).toContain('2 character');
    expect(result.reasoning).toContain('2 plot thread');
  });

  it('notes passthrough in the reasoning when no API key is set', async () => {
    mockGenerateStructured.mockResolvedValue({ content: 'the-prompt', passthrough: true });
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateOverview(String(PROJECT_ID), 'standard');

    expect(result.reasoning?.toLowerCase()).toContain('no api key');
  });
});

// ─── Empty-project guard ──────────────────────────────────────────────────────

describe('generateOverview() — empty project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'should-not-be-called' });
  });

  it('returns a warning (and no model call) when there is no cast or outline', async () => {
    const client = makeMockClient({ characters: [], threads: [] });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateOverview(String(PROJECT_ID), 'standard');

    expect(result.content).toBe('');
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings?.[0]).toContain('extract --file');
    expect(mockGenerateStructured).not.toHaveBeenCalled();
  });

  it('still generates when only plot threads exist (no characters yet)', async () => {
    const client = makeMockClient({ characters: [] });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateOverview(String(PROJECT_ID), 'standard');

    expect(result.warnings).toBeUndefined();
    expect(mockGenerateStructured).toHaveBeenCalled();
  });
});
