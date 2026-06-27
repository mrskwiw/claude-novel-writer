/**
 * Unit tests for Context Fetchers (Ticket 009)
 *
 * Covers:
 *  - Empty DB → fetch returns []
 *  - One row → fetch returns one ContextBlock with correct type
 *  - tokenCount > 0 for non-empty content
 *  - No exceptions thrown when DB returns empty data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneFetcher } from '../../../project/src/context/fetchers/scene-fetcher.js';
import { CharacterFetcher } from '../../../project/src/context/fetchers/character-fetcher.js';
import { CanonFetcher } from '../../../project/src/context/fetchers/canon-fetcher.js';
import { PromiseFetcher } from '../../../project/src/context/fetchers/promise-fetcher.js';
import type { MCPClient } from '../../../project/src/core/database.js';
import type { ContextScope } from '../../../project/src/types/context.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeMockClient(rows: unknown[] = []): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue(rows),
    writeQuery: vi.fn().mockResolvedValue({ affected_rows: 0 }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient;
}

const ENTIRE_PROJECT_SCOPE: ContextScope = { range: 'entire_project' };
const CURRENT_SCENE_SCOPE: ContextScope = { range: 'current_scene' };

// ─── SceneFetcher ─────────────────────────────────────────────────────────────

describe('SceneFetcher', () => {
  let client: MCPClient;
  let fetcher: SceneFetcher;

  const sceneRow = {
    id: 1,
    scene_number: 2,
    title: 'The Arrival',
    purpose: 'Establish setting',
    emotional_tone: 'tense',
    summary: 'Hero arrives at the castle',
    chapter_id: 1,
    chapter_number: 1,
    chapter_title: 'Chapter One',
    project_id: 'proj-1',
  };

  beforeEach(() => {
    client = makeMockClient();
    fetcher = new SceneFetcher(client);
  });

  it('returns [] when DB returns empty array', async () => {
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toEqual([]);
  });

  it('does not throw when DB returns empty array', async () => {
    await expect(fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE)).resolves.not.toThrow();
  });

  it('returns one block with type recent_scenes for entire_project scope', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sceneRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('recent_scenes');
  });

  it('returns one block with type current_scene for current_scene scope', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sceneRow]);
    const result = await fetcher.fetch('proj-1', CURRENT_SCENE_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('current_scene');
  });

  it('tokenCount is > 0 for non-empty content', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sceneRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result[0].tokenCount).toBeGreaterThan(0);
  });

  it('block has id, title, content, sourceId, sourceType', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sceneRow]);
    const [block] = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(block.id).toBeDefined();
    expect(block.title).toContain('Scene 2');
    expect(block.content).toContain('The Arrival');
    expect(block.sourceId).toBe('1');
    expect(block.sourceType).toBe('scene');
  });

  it('uses scope.n to set LIMIT for previous_n_scenes scope', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const scope: ContextScope = { range: 'previous_n_scenes', n: 3 };
    await fetcher.fetch('proj-1', scope);
    const [sql, params] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('LIMIT');
    expect(params).toContain(3);
  });
});

// ─── CharacterFetcher ─────────────────────────────────────────────────────────

describe('CharacterFetcher', () => {
  let client: MCPClient;
  let fetcher: CharacterFetcher;

  const characterRow = {
    id: 10,
    project_id: 'proj-1',
    name: 'Mira',
    full_name: 'Mira Solace',
    role: 'protagonist',
    summary: 'A young mage seeking answers',
    voice_notes: 'Speaks in measured, precise sentences',
  };

  beforeEach(() => {
    client = makeMockClient();
    fetcher = new CharacterFetcher(client);
  });

  it('returns [] when DB returns empty array', async () => {
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toEqual([]);
  });

  it('does not throw when DB returns empty array', async () => {
    await expect(fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE)).resolves.not.toThrow();
  });

  it('returns one block with type character_profiles', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([characterRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('character_profiles');
  });

  it('tokenCount is > 0 for non-empty content', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([characterRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result[0].tokenCount).toBeGreaterThan(0);
  });

  it('block title includes full_name when present', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([characterRow]);
    const [block] = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(block.title).toContain('Mira Solace');
    expect(block.sourceId).toBe('10');
    expect(block.sourceType).toBe('character');
  });

  it('block title is just name when full_name is null', async () => {
    const row = { ...characterRow, full_name: null };
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([row]);
    const [block] = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(block.title).toBe('Mira');
  });
});

// ─── CanonFetcher ─────────────────────────────────────────────────────────────

describe('CanonFetcher', () => {
  let client: MCPClient;
  let fetcher: CanonFetcher;

  const factRow = {
    id: 'can-1',
    project_id: 'proj-1',
    type: 'fact',
    status: 'active',
    strength: 'hard',
    subject: 'Mira',
    predicate: 'has',
    object: 'silver eyes',
    description: 'Mira has silver eyes',
    confidence: 1,
  };

  const situationRow = {
    id: 'can-2',
    project_id: 'proj-1',
    type: 'situation',
    status: 'active',
    strength: 'soft',
    subject: 'Mira',
    predicate: 'is',
    object: 'at the castle',
    description: 'Mira is currently located at the castle',
    confidence: 0.9,
  };

  beforeEach(() => {
    client = makeMockClient();
    fetcher = new CanonFetcher(client);
  });

  it('returns [] when DB returns empty array', async () => {
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toEqual([]);
  });

  it('does not throw when DB returns empty array', async () => {
    await expect(fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE)).resolves.not.toThrow();
  });

  it('maps fact-type rows to ContextType canon_facts', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([factRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('canon_facts');
  });

  it('maps situation-type rows to ContextType canon_situations', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([situationRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('canon_situations');
  });

  it('tokenCount is > 0 for non-empty content', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([factRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result[0].tokenCount).toBeGreaterThan(0);
  });

  it('block sourceType is canon_item', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([factRow]);
    const [block] = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(block.sourceId).toBe('can-1');
    expect(block.sourceType).toBe('canon_item');
  });

  it('query filters by status = active', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    const [sql] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("status = 'active'");
  });
});

// ─── PromiseFetcher ───────────────────────────────────────────────────────────

describe('PromiseFetcher', () => {
  let client: MCPClient;
  let fetcher: PromiseFetcher;

  const promiseRow = {
    id: 'prm-1',
    project_id: 'proj-1',
    type: 'mystery',
    status: 'open',
    title: 'Who killed the king?',
    description: 'The murder is unsolved and drives the plot.',
    importance: 9,
    reader_visibility: 8,
  };

  beforeEach(() => {
    client = makeMockClient();
    fetcher = new PromiseFetcher(client);
  });

  it('returns [] when DB returns empty array', async () => {
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toEqual([]);
  });

  it('does not throw when DB returns empty array', async () => {
    await expect(fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE)).resolves.not.toThrow();
  });

  it('returns one block with type promises', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([promiseRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('promises');
  });

  it('tokenCount is > 0 for non-empty content', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([promiseRow]);
    const result = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(result[0].tokenCount).toBeGreaterThan(0);
  });

  it('block title includes type tag', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([promiseRow]);
    const [block] = await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    expect(block.title).toContain('[mystery]');
    expect(block.sourceId).toBe('prm-1');
    expect(block.sourceType).toBe('narrative_promise');
  });

  it('query filters by status IN (open, developing)', async () => {
    (client.readQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await fetcher.fetch('proj-1', ENTIRE_PROJECT_SCOPE);
    const [sql] = (client.readQuery as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("status IN ('open', 'developing')");
  });
});
