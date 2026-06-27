/**
 * Unit tests for SPEC-10 — Synopsis & Query Materials generation
 *
 * Covers:
 *  - assembleSynopsisContext() issues readQuery for projects, characters,
 *    chapters, world_rules, and narrative_promises
 *  - assembleSynopsisContext() falls back to first character when no
 *    protagonist role is found
 *  - generateSynopsis('proj', 'short') prompt contains "150" or "hook"
 *    and includes chapter summaries
 *  - generateSynopsis('proj', 'long') prompt contains "resolution"
 *  - generatePitch() prompt contains "25-word" or the template structure
 *  - generateQueryLetter() prompt contains "query letter" and "comp titles"
 *  - generateComps() prompt contains the genre
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── Mock ClaudeClient before importing GenerationManager ─────────────────────

const mockGenerateStructured = vi.fn().mockResolvedValue({ content: 'mock-output' });

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
    assembleContext = vi.fn().mockResolvedValue({
      scene: { id: 1 },
      chapter: { id: 1, chapterNumber: 1 },
      characters: [],
      location: undefined,
      worldRules: [],
      plotThreads: [],
      recentChapterSummaries: [],
      timelineEvents: [],
    });
  }
  return { SceneContextAssembler };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GenerationManager } from '../../../project/src/ai/generation-manager.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 7;

/**
 * Build a mock MCPClient whose readQuery returns different rows depending on
 * which table appears in the SQL string. This lets us exercise the full
 * assembleSynopsisContext() call path without hitting a real database.
 */
function makeMockClient(overrides: {
  project?: Record<string, unknown>;
  protagonist?: string | null;
  firstChar?: string | null;
  antagonist?: string | null;
  chapters?: Array<{ chapter_number: number; title: string; summary: string }>;
  worldRules?: Array<{ rule_text: string }>;
  promises?: Array<{ title: string }>;
} = {}): MCPClient {
  const {
    project = { title: 'The Lost Signal', genre: 'Thriller', target_word_count: 90000 },
    protagonist = 'Elena Voss',
    firstChar = 'Elena Voss',
    antagonist = 'Director Kane',
    chapters = [
      { chapter_number: 1, title: 'Arrival', summary: 'Elena arrives in the city.' },
      { chapter_number: 2, title: 'The Signal', summary: 'A coded transmission is intercepted.' },
    ],
    worldRules = [{ rule_text: 'No surveillance goes unnoticed' }],
    promises = [{ title: 'Who sent the signal?' }],
  } = overrides;

  const readQuery = vi.fn().mockImplementation(async (sql: string, _params: unknown[]) => {
    if (sql.includes('FROM projects')) return project ? [project] : [];

    if (sql.includes('FROM characters')) {
      if (sql.includes("role = 'protagonist'")) return protagonist ? [{ name: protagonist }] : [];
      if (sql.includes("role = 'antagonist'")) return antagonist ? [{ name: antagonist }] : [];
      // Fallback: first character
      return firstChar ? [{ name: firstChar }] : [];
    }

    if (sql.includes('FROM chapters')) return chapters;
    if (sql.includes('FROM world_rules')) return worldRules;
    if (sql.includes('FROM narrative_promises')) return promises;

    return [];
  });

  return {
    readQuery,
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

// ─── assembleSynopsisContext – query coverage ─────────────────────────────────

describe('assembleSynopsisContext() — query coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'mock-output' });
  });

  it('calls readQuery for projects table', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.assembleSynopsisContext(String(PROJECT_ID));

    const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const projectCall = calls.find(([sql]: [string]) => sql.includes('FROM projects'));
    expect(projectCall).toBeDefined();
  });

  it('calls readQuery for characters table (protagonist lookup)', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.assembleSynopsisContext(String(PROJECT_ID));

    const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const charCall = calls.find(([sql]: [string]) =>
      sql.includes('FROM characters') && sql.includes("role = 'protagonist'")
    );
    expect(charCall).toBeDefined();
  });

  it('calls readQuery for characters table (antagonist lookup)', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.assembleSynopsisContext(String(PROJECT_ID));

    const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const charCall = calls.find(([sql]: [string]) =>
      sql.includes('FROM characters') && sql.includes("role = 'antagonist'")
    );
    expect(charCall).toBeDefined();
  });

  it('calls readQuery for chapters table', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.assembleSynopsisContext(String(PROJECT_ID));

    const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const chapterCall = calls.find(([sql]: [string]) => sql.includes('FROM chapters'));
    expect(chapterCall).toBeDefined();
  });

  it('calls readQuery for world_rules table', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.assembleSynopsisContext(String(PROJECT_ID));

    const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const wrCall = calls.find(([sql]: [string]) => sql.includes('FROM world_rules'));
    expect(wrCall).toBeDefined();
  });

  it('calls readQuery for narrative_promises table', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.assembleSynopsisContext(String(PROJECT_ID));

    const calls = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const npCall = calls.find(([sql]: [string]) => sql.includes('FROM narrative_promises'));
    expect(npCall).toBeDefined();
  });

  it('returns a SynopsisContext with title, genre, and wordCount from project row', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.title).toBe('The Lost Signal');
    expect(ctx.genre).toBe('Thriller');
    expect(ctx.wordCount).toBe(90000);
  });

  it('returns chapter summaries mapped correctly', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.chapterSummaries).toHaveLength(2);
    expect(ctx.chapterSummaries[0]).toMatchObject({
      number: 1,
      title: 'Arrival',
      summary: 'Elena arrives in the city.',
    });
  });

  it('returns openPromises from narrative_promises rows', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.openPromises).toContain('Who sent the signal?');
  });

  it('sets mainConflict to the first open promise title', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.mainConflict).toBe('Who sent the signal?');
  });

  it('sets mainConflict to "Unknown" when there are no open promises', async () => {
    const client = makeMockClient({ promises: [] });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.mainConflict).toBe('Unknown');
  });
});

// ─── assembleSynopsisContext – protagonist fallback ───────────────────────────

describe('assembleSynopsisContext() — protagonist fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the protagonist-role character when one exists', async () => {
    const client = makeMockClient({ protagonist: 'Elena Voss', firstChar: 'Nobody' });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.protagonist).toBe('Elena Voss');
  });

  it('falls back to first character when no protagonist role is found', async () => {
    // protagonist query returns [] → triggers first-char fallback
    const client = makeMockClient({ protagonist: null, firstChar: 'Side Character' });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.protagonist).toBe('Side Character');
  });

  it('falls back to "Unknown" when no characters exist at all', async () => {
    const client = makeMockClient({ protagonist: null, firstChar: null });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.protagonist).toBe('Unknown');
  });

  it('sets antagonist from the antagonist-role character', async () => {
    const client = makeMockClient({ antagonist: 'Director Kane' });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.antagonist).toBe('Director Kane');
  });

  it('leaves antagonist undefined when none is found', async () => {
    const client = makeMockClient({ antagonist: null });
    const mgr = new GenerationManager(client, PROJECT_ID);

    const ctx = await mgr.assembleSynopsisContext(String(PROJECT_ID));

    expect(ctx.antagonist).toBeUndefined();
  });
});

// ─── generateSynopsis – short ────────────────────────────────────────────────

describe('generateSynopsis() — short', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'Short synopsis here.' });
  });

  it('calls generateStructured with a prompt containing "150"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'short');

    expect(mockGenerateStructured).toHaveBeenCalled();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('150');
  });

  it('prompt contains "hook" (case-insensitive)', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'short');

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('hook');
  });

  it('prompt includes at least one chapter summary', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'short');

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    // One of the chapter titles from our fixture should appear
    expect(promptArg).toContain('Arrival');
  });

  it('returns a GenerationResult with string content', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateSynopsis(String(PROJECT_ID), 'short');

    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});

// ─── generateSynopsis – long ──────────────────────────────────────────────────

describe('generateSynopsis() — long', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'Long synopsis with resolution.' });
  });

  it('prompt contains "resolution"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'long');

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('resolution');
  });

  it('prompt contains "800"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'long');

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('800');
  });
});

// ─── generateSynopsis – medium ────────────────────────────────────────────────

describe('generateSynopsis() — medium', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'Medium synopsis.' });
  });

  it('prompt contains "400"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'medium');

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('400');
  });

  it('prompt contains "cliffhanger"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateSynopsis(String(PROJECT_ID), 'medium');

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('cliffhanger');
  });
});

// ─── generatePitch ────────────────────────────────────────────────────────────

describe('generatePitch()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'When Elena intercepts the signal...' });
  });

  it('prompt contains "25-word"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generatePitch(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('25-word');
  });

  it('prompt contains the When/must/before template structure', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generatePitch(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('when');
    expect(promptArg.toLowerCase()).toContain('must');
    expect(promptArg.toLowerCase()).toContain('before');
  });

  it('returns a GenerationResult with string content', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generatePitch(String(PROJECT_ID));

    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});

// ─── generateQueryLetter ──────────────────────────────────────────────────────

describe('generateQueryLetter()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'Dear Agent, ...' });
  });

  it('prompt contains "query letter"', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateQueryLetter(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('query letter');
  });

  it('prompt contains "comp titles" language', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateQueryLetter(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('comp');
  });

  it('embeds provided comp titles in the prompt', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);
    const comps = ['The Cipher by Jane Doe', 'Dark Signal by John Smith'];

    await mgr.generateQueryLetter(String(PROJECT_ID), comps);

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('The Cipher by Jane Doe');
    expect(promptArg).toContain('Dark Signal by John Smith');
  });

  it('falls back to "suggest" language when no comp titles provided', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateQueryLetter(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('suggest');
  });

  it('returns a GenerationResult with string content', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateQueryLetter(String(PROJECT_ID));

    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});

// ─── generateComps ────────────────────────────────────────────────────────────

describe('generateComps()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: '1. Title by Author (2022)' });
  });

  it('prompt contains the project genre', async () => {
    const client = makeMockClient({ project: { title: 'My Novel', genre: 'Thriller', word_count_target: 80000 } });
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateComps(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('Thriller');
  });

  it('prompt asks for 2020–2025 publications', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateComps(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('2020');
    expect(promptArg).toContain('2025');
  });

  it('prompt asks for 5 comp titles', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    await mgr.generateComps(String(PROJECT_ID));

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('5');
  });

  it('returns a GenerationResult with string content and empty alternatives', async () => {
    const client = makeMockClient();
    const mgr = new GenerationManager(client, PROJECT_ID);

    const result = await mgr.generateComps(String(PROJECT_ID));

    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});
