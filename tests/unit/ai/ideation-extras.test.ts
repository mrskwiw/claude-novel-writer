/**
 * Unit tests for PROC-01 ideation extras:
 *  - generateName()
 *  - workshopPremise()
 *  - generateCharacterSketch()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── Mock ClaudeClient before importing GenerationManager ────────────────────

const mockGenerateStructured = vi.fn().mockResolvedValue({ content: 'mock response' });
const mockGenerateCreative = vi.fn().mockResolvedValue({ content: 'mock creative response' });

vi.mock('../../../project/src/ai/claude-client.js', () => {
  class MockClaudeClient {
    generateStructured = mockGenerateStructured;
    generateCreative = mockGenerateCreative;
    generate = mockGenerateStructured;
    static isConfigured = vi.fn().mockReturnValue(true);
    static getConfigMessage = vi.fn().mockReturnValue('');
  }
  return { ClaudeClient: MockClaudeClient };
});

// ─── Mock SceneContextAssembler (imported by GenerationManager constructor) ──

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

import { GenerationManager } from '../../../project/src/ai/generation-manager.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockMCPClient(): MCPClient {
  return {
    readQuery: vi.fn().mockResolvedValue([]),
    writeQuery: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── generateName() ──────────────────────────────────────────────────────────

describe('GenerationManager.generateName()', () => {
  const projectId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'mock name response' });
  });

  it('prompt contains "Generate 5 character name" for default count', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateName({});

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('Generate 5 character name');
  });

  it('prompt contains culture and gender when both are specified', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateName({ culture: 'Irish', gender: 'female' });

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('Irish');
    expect(promptArg).toContain('female');
  });

  it('prompt contains the specified count when count is 3', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateName({ count: 3 });

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('3');
  });

  it('returns a GenerationResult with content and empty alternatives', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    const result = await manager.generateName({ culture: 'Japanese', count: 2 });

    expect(result).toHaveProperty('content');
    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});

// ─── workshopPremise() ───────────────────────────────────────────────────────

describe('GenerationManager.workshopPremise()', () => {
  const projectId = '1';
  const premise = 'A detective who cannot remember faces';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'mock premise response' });
  });

  it('prompt contains the given premise text', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, Number(projectId));

    await manager.workshopPremise(projectId, premise);

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain(premise);
  });

  it('prompt mentions all five development questions', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, Number(projectId));

    await manager.workshopPremise(projectId, premise);

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('central conflict');
    expect(promptArg.toLowerCase()).toContain('protagonist');
    expect(promptArg.toLowerCase()).toContain('stakes');
    expect(promptArg.toLowerCase()).toContain('story question');
    expect(promptArg.toLowerCase()).toContain('unique');
  });

  it('returns a GenerationResult with content and empty alternatives', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, Number(projectId));

    const result = await manager.workshopPremise(projectId, premise);

    expect(result).toHaveProperty('content');
    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});

// ─── generateCharacterSketch() ───────────────────────────────────────────────

describe('GenerationManager.generateCharacterSketch()', () => {
  const projectId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateStructured.mockResolvedValue({ content: 'mock sketch response' });
  });

  it('prompt contains the specified role', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateCharacterSketch({ role: 'villain' });

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('villain');
  });

  it('prompt contains required sketch elements when called with no options', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateCharacterSketch();

    expect(mockGenerateStructured).toHaveBeenCalledOnce();
    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('Name');
    expect(promptArg).toContain('Core trait');
    expect(promptArg).toContain('Hidden depth');
  });

  it('prompt contains genre and notes when provided', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateCharacterSketch({ genre: 'thriller', notes: 'speaks in riddles' });

    const [promptArg] = mockGenerateStructured.mock.calls[0] as [string, unknown];
    expect(promptArg).toContain('thriller');
    expect(promptArg).toContain('speaks in riddles');
  });

  it('returns a GenerationResult with content and empty alternatives', async () => {
    const mcpClient = makeMockMCPClient();
    const manager = new GenerationManager(mcpClient, projectId);

    const result = await manager.generateCharacterSketch({ role: 'mentor' });

    expect(result).toHaveProperty('content');
    expect(typeof result.content).toBe('string');
    expect(result.alternatives).toEqual([]);
  });
});
