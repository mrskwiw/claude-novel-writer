/**
 * Unit tests for GAP-08 (POV Anchoring) and GAP-09 (Alternatives on All Generation Types)
 *
 * Covers:
 *  - loadCharacterVoice: DB row present  → structured voice object returned
 *  - loadCharacterVoice: DB empty        → null returned
 *  - buildContinuationPrompt with pov    → POV block prepended
 *  - buildContinuationPrompt without pov → no POV block in prompt
 *  - generateCharacter with count=1      → alternatives is []
 *  - enhanceDialogue with count=2        → prompt requests 2 variations
 *  - GenerationOptions.count defaults to 1 (clamped behaviour)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { SceneContext, Scene, Chapter, Character, WorldRule, PlotThread, TimelineEvent } from '../../../project/src/types/novel.js';

// ─── Mock ClaudeClient before importing GenerationManager ────────────────────

vi.mock('../../../project/src/ai/claude-client.js', () => {
  const mockGenerate = vi.fn().mockResolvedValue({ content: 'mock-content' });
  class MockClaudeClient {
    generate = mockGenerate;
    generateStructured = mockGenerate;
    generateCreative = mockGenerate;
    static isConfigured = vi.fn().mockReturnValue(true);
    static getConfigMessage = vi.fn().mockReturnValue('');
  }
  return { ClaudeClient: MockClaudeClient };
});

// ─── Mock SceneContextAssembler ──────────────────────────────────────────────

// Declared before mock factory so the factory closure can reference it.
// The factory runs synchronously before modules are loaded, so we build the
// context object inline inside the factory instead of referencing a top-level const.

vi.mock('../../../project/src/context/scene-context.js', () => {
  const stubContext = {
    scene: {
      id: 1,
      chapterId: 1,
      sceneNumber: 1,
      wordCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    chapter: {
      id: 1,
      projectId: 1,
      chapterNumber: 1,
      title: 'Chapter One',
      wordCount: 0,
      status: 'drafted',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    characters: [],
    location: undefined,
    worldRules: [],
    plotThreads: [],
    recentChapterSummaries: [],
    timelineEvents: [],
  };
  class MockSceneContextAssembler {
    assembleContext = vi.fn().mockResolvedValue(stubContext);
  }
  return { SceneContextAssembler: MockSceneContextAssembler };
});

// Convenience context value used in tests — matches what the mock returns.
const mockSceneContext: SceneContext = {
  scene: {
    id: 1,
    chapterId: 1,
    sceneNumber: 1,
    wordCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Scene,
  chapter: {
    id: 1,
    projectId: 1,
    chapterNumber: 1,
    title: 'Chapter One',
    wordCount: 0,
    status: 'drafted',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Chapter,
  characters: [] as Character[],
  location: undefined,
  worldRules: [] as WorldRule[],
  plotThreads: [] as PlotThread[],
  recentChapterSummaries: [],
  timelineEvents: [] as TimelineEvent[],
};

// ─── Import after mocks are registered ───────────────────────────────────────

import { GenerationManager } from '../../../project/src/ai/generation-manager.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockClient(rows: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(rows),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

const PROJECT_ID = 42;

/** Cast manager to access private methods under test */
function asAny(manager: GenerationManager): any {
  return manager as any;
}

// ─── loadCharacterVoice ───────────────────────────────────────────────────────

describe('loadCharacterVoice', () => {
  it('returns voice object when DB returns a matching character row', async () => {
    const row = { voice: 'dry and sardonic', personality: 'introverted', traits: 'fidgets with cuffs' };
    const client = makeMockClient([row]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await asAny(manager).loadCharacterVoice(PROJECT_ID, 'Elara');

    expect(result).toEqual({
      voice: 'dry and sardonic',
      personality: 'introverted',
      mannerisms: 'fidgets with cuffs',
    });
  });

  it('returns null when DB returns an empty array (character not found)', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await asAny(manager).loadCharacterVoice(PROJECT_ID, 'NoOne');

    expect(result).toBeNull();
  });

  it('issues the correct SQL query with project_id and name parameters', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    await asAny(manager).loadCharacterVoice(PROJECT_ID, 'Elara');

    const [sql, params] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('SELECT voice, personality, traits FROM characters');
    expect(sql).toContain('project_id = ?');
    expect(sql).toContain('name = ?');
    expect(params).toEqual([PROJECT_ID, 'Elara']);
  });

  it('returns null when DB throws an error', async () => {
    const client = makeMockClient();
    (client.readQuery as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await asAny(manager).loadCharacterVoice(PROJECT_ID, 'Elara');

    expect(result).toBeNull();
  });

  it('uses empty string for null/undefined fields', async () => {
    const row = { voice: null, personality: undefined, traits: null };
    const client = makeMockClient([row]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await asAny(manager).loadCharacterVoice(PROJECT_ID, 'Elara');

    expect(result).toEqual({ voice: '', personality: '', mannerisms: '' });
  });
});

// ─── buildContinuationPrompt with POV ────────────────────────────────────────

describe('buildContinuationPrompt – with pov', () => {
  it('prepends "Write strictly from [Name]\'s POV" when options.pov is set and character exists', async () => {
    const voiceRow = { voice: 'clipped sentences', personality: 'stoic', traits: 'never smiles' };
    const client = makeMockClient([voiceRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildContinuationPrompt(
      'She ran down the alley.',
      mockSceneContext,
      { pov: 'Mira' }
    );

    expect(prompt).toContain("Write strictly from Mira's POV");
  });

  it('includes voice, personality, and mannerisms in the POV block', async () => {
    const voiceRow = { voice: 'clipped sentences', personality: 'stoic', traits: 'never smiles' };
    const client = makeMockClient([voiceRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildContinuationPrompt(
      'She ran down the alley.',
      mockSceneContext,
      { pov: 'Mira' }
    );

    expect(prompt).toContain('Their voice: clipped sentences');
    expect(prompt).toContain('Their personality: stoic');
    expect(prompt).toContain('Their mannerisms: never smiles');
  });

  it('includes "Do NOT break POV" instruction', async () => {
    const voiceRow = { voice: 'v', personality: 'p', traits: 'm' };
    const client = makeMockClient([voiceRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildContinuationPrompt(
      'text',
      mockSceneContext,
      { pov: 'Mira' }
    );

    expect(prompt).toContain('Do NOT break POV');
  });
});

// ─── buildContinuationPrompt without POV ─────────────────────────────────────

describe('buildContinuationPrompt – without pov', () => {
  it('does not contain POV block when options.pov is not set', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildContinuationPrompt(
      'She ran down the alley.',
      mockSceneContext,
      {}
    );

    expect(prompt).not.toContain("Write strictly from");
    expect(prompt).not.toContain("Do NOT break POV");
  });

  it('still contains the standard scene continuation instructions', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildContinuationPrompt(
      'She ran down the alley.',
      mockSceneContext,
      {}
    );

    expect(prompt).toContain('You are assisting a novelist with scene continuation');
  });

  it('does not prepend POV block when character is not found in DB', async () => {
    const client = makeMockClient([]); // empty → null voice
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildContinuationPrompt(
      'text',
      mockSceneContext,
      { pov: 'UnknownChar' }
    );

    // Character not in DB → no POV block injected
    expect(prompt).not.toContain("Write strictly from UnknownChar's POV");
  });
});

// ─── generateCharacter count=1 → alternatives is [] ─────────────────────────

describe('generateCharacter', () => {
  it('returns alternatives as an empty array when count is not specified', async () => {
    const client = makeMockClient([[]]); // project context query returns empty
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.generateCharacter('A world-weary detective');

    expect(Array.isArray(result.alternatives)).toBe(true);
    expect(result.alternatives).toEqual([]);
  });

  it('returns alternatives as an empty array when count=1 is explicit', async () => {
    const client = makeMockClient([[]]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.generateCharacter('A world-weary detective', { count: 1 });

    expect(result.alternatives).toEqual([]);
  });

  it('always returns a string in content', async () => {
    const client = makeMockClient([[]]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.generateCharacter('Brave hero');

    expect(typeof result.content).toBe('string');
  });
});

// ─── enhanceDialogue count=2 → prompt requests 2 variations ──────────────────

describe('enhanceDialogue – count=2', () => {
  it('prompt contains instruction to provide 2 variations when count=2', async () => {
    // First readQuery call = getCharacterProfile (returns character)
    // Second onwards = loadCharacterVoice (for POV block, no pov set so not called)
    const characterRow = { name: 'Kade', voice: { patterns: ['terse'] }, personality: { traits: ['bold'] } };
    const client = makeMockClient([characterRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    // Spy on buildDialoguePrompt to capture the prompt without calling Claude
    let capturedPrompt = '';
    const originalBuild = asAny(manager).buildDialoguePrompt.bind(manager);
    vi.spyOn(asAny(manager), 'buildDialoguePrompt').mockImplementation(
      async (dialogue: string, character: any, options: any) => {
        capturedPrompt = await originalBuild(dialogue, character, options);
        return capturedPrompt;
      }
    );

    await manager.enhanceDialogue('You think you can take me?', 'Kade', { count: 2 });

    expect(capturedPrompt).toContain('Provide 2 variations');
  });

  it('returns alternatives array with count-1 entries when count=2', async () => {
    const characterRow = { name: 'Kade' };
    const client = makeMockClient([characterRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.enhanceDialogue('Hello world', 'Kade', { count: 2 });

    // count=2 means 2 Claude calls: 1 content + 1 alternative
    expect(result.alternatives).toHaveLength(1);
  });
});

// ─── GenerationOptions.count defaults to 1 ───────────────────────────────────

describe('GenerationOptions.count default behaviour', () => {
  it('generateCharacter with no options produces no alternatives (defaults to count=1)', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.generateCharacter('A wizard');

    expect(result.alternatives).toEqual([]);
  });

  it('generateCharacter with count=0 is clamped to 1 and produces no alternatives', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.generateCharacter('A wizard', { count: 0 });

    expect(result.alternatives).toEqual([]);
  });

  it('generateCharacter with count=5 is clamped to 3 (max) — alternatives ≤ 2', async () => {
    const client = makeMockClient([]);
    // Inject a ClaudeClient-shaped fake directly onto the manager instance
    // so we can control what generateStructured returns.
    const manager = new GenerationManager(client, PROJECT_ID);
    (manager as any).claude = {
      generateStructured: vi.fn().mockResolvedValue({
        content: '1. Profile A\n2. Profile B\n3. Profile C',
      }),
      generateCreative: vi.fn().mockResolvedValue({ content: 'x' }),
    };

    const result = await manager.generateCharacter('A wizard', { count: 5 });

    // count clamped to 3 → alternatives parsed from numbered blocks ≤ 2
    expect(result.alternatives.length).toBeLessThanOrEqual(2);
  });

  it('expandDescription with count=1 returns empty alternatives', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const result = await manager.expandDescription('The door creaked open.', undefined, { count: 1 });

    expect(result.alternatives).toEqual([]);
  });
});

// ─── buildDialoguePrompt / buildDescriptionPrompt POV injection ───────────────

describe('buildDialoguePrompt – with pov', () => {
  it('prepends POV block when options.pov is set and character exists in DB', async () => {
    const voiceRow = { voice: 'verbose', personality: 'anxious', traits: 'wrings hands' };
    const client = makeMockClient([voiceRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildDialoguePrompt(
      '"I didn\'t mean to."',
      { name: 'Leo' },
      { pov: 'Leo' }
    );

    expect(prompt).toContain("Write strictly from Leo's POV");
  });
});

describe('buildDescriptionPrompt – with pov', () => {
  it('prepends POV block when options.pov is set and character exists in DB', async () => {
    const voiceRow = { voice: 'sparse', personality: 'curious', traits: 'tilts head' };
    const client = makeMockClient([voiceRow]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildDescriptionPrompt(
      'The forest stretched endlessly.',
      'Ryn',
      { pov: 'Ryn' }
    );

    expect(prompt).toContain("Write strictly from Ryn's POV");
  });

  it('requests distinct sensory approaches when count=3', async () => {
    const client = makeMockClient([]);
    const manager = new GenerationManager(client, PROJECT_ID);

    const prompt: string = await asAny(manager).buildDescriptionPrompt(
      'The market buzzed.',
      undefined,
      { count: 3 }
    );

    expect(prompt).toContain('3 distinct sensory approaches');
  });
});
