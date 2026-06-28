/**
 * Unit tests for generateNextSentence() (Hemingway block-breaker feature)
 *
 * Covers:
 *  - calls readQuery to load scene content
 *  - prompt contains "one true sentence"
 *  - returns GenerationResult with non-empty content string
 *  - when scene has no content, still calls Claude (with empty/fallback context)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPClient } from '../../../project/src/core/database.js';

// ─── Mock ClaudeClient before importing GenerationManager ───────────────────

const mockGenerateCreative = vi.fn().mockResolvedValue({ content: 'She reached for the letter.' });

vi.mock('../../../project/src/ai/claude-client.js', () => {
  class MockClaudeClient {
    generateCreative = mockGenerateCreative;
    generateStructured = mockGenerateCreative;
    generate = mockGenerateCreative;
    static isConfigured = vi.fn().mockReturnValue(true);
    static getConfigMessage = vi.fn().mockReturnValue('');
  }
  return { ClaudeClient: MockClaudeClient };
});

// ─── Mock SceneContextAssembler (not used by generateNextSentence, but the
//     module is imported by GenerationManager) ─────────────────────────────

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

function makeMockMCPClient(sceneContent: string | null): MCPClient {
  return {
    // generateNextSentence reads the scene's chapter summary via a scenes⋈chapters
    // JOIN (scene prose lives in the .md files, not the DB).
    readQuery: vi.fn().mockImplementation(async (query: string, _params: unknown[]) => {
      if (query.includes('FROM scenes') && query.includes('JOIN')) {
        return sceneContent !== null ? [{ summary: sceneContent }] : [];
      }
      return [];
    }),
    writeQuery: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GenerationManager.generateNextSentence()', () => {
  const projectId = 1;
  const sceneId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateCreative.mockResolvedValue({ content: 'She reached for the letter.' });
  });

  it('calls readQuery to load scene content', async () => {
    const mcpClient = makeMockMCPClient('It was a dark and stormy night.');
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateNextSentence(String(projectId), sceneId);

    const readCalls = (mcpClient.readQuery as ReturnType<typeof vi.fn>).mock.calls;
    const sceneQueryCall = readCalls.find(([query]: [string]) =>
      query.includes('FROM scenes')
    );
    expect(sceneQueryCall).toBeDefined();
    // Params should include sceneId and projectId
    expect(sceneQueryCall[1]).toContain(sceneId);
    expect(sceneQueryCall[1]).toContain(projectId);
  });

  it('builds a prompt containing "one true sentence"', async () => {
    const mcpClient = makeMockMCPClient('The rain hammered the windows.');
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateNextSentence(String(projectId), sceneId);

    expect(mockGenerateCreative).toHaveBeenCalled();
    const [promptArg] = mockGenerateCreative.mock.calls[0] as [string, unknown];
    expect(promptArg.toLowerCase()).toContain('one true sentence');
  });

  it('returns GenerationResult with non-empty content string', async () => {
    const mcpClient = makeMockMCPClient('The protagonist hesitated at the threshold.');
    const manager = new GenerationManager(mcpClient, projectId);

    const result = await manager.generateNextSentence(String(projectId), sceneId);

    expect(result).toHaveProperty('content');
    expect(typeof result.content).toBe('string');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.alternatives).toEqual([]);
  });

  it('still calls Claude when scene has no content (empty string)', async () => {
    const mcpClient = makeMockMCPClient('');
    const manager = new GenerationManager(mcpClient, projectId);

    const result = await manager.generateNextSentence(String(projectId), sceneId);

    expect(mockGenerateCreative).toHaveBeenCalled();
    expect(typeof result.content).toBe('string');
  });

  it('still calls Claude when scene row is missing entirely', async () => {
    // readQuery returns [] for the scene query
    const mcpClient = makeMockMCPClient(null);
    const manager = new GenerationManager(mcpClient, projectId);

    const result = await manager.generateNextSentence(String(projectId), sceneId);

    expect(mockGenerateCreative).toHaveBeenCalled();
    expect(typeof result.content).toBe('string');
  });

  it('uses last 500 words of scene content in the prompt', async () => {
    // Build content with more than 500 words
    const longContent = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
    const mcpClient = makeMockMCPClient(longContent);
    const manager = new GenerationManager(mcpClient, projectId);

    await manager.generateNextSentence(String(projectId), sceneId);

    const [promptArg] = mockGenerateCreative.mock.calls[0] as [string, unknown];
    // The prompt should contain "word599" (last word) but not "word0" (first word)
    expect(promptArg).toContain('word599');
    expect(promptArg).not.toContain('word0 ');
  });
});
