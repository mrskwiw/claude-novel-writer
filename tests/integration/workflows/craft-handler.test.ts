/**
 * Integration Tests: craft-handler
 * Tests handleGenerateOpeningLines.
 *
 * The function calls GenerationManager.workshopOpeningLines which requires
 * the Anthropic API. We stub GenerationManager on the extension so no
 * network calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MockMCPClient } from '../../mocks/mcp-client.mock.js';
import { NovelWriterExtension } from '../../../project/src/index.js';
import type { ParsedArgs, OutputFormatter } from '../../../project/src/cli/types.js';
import { handleGenerateOpeningLines } from '../../../project/src/cli/handlers/craft-handler.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function createMockOutput() {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (msg) => log.push(`SUCCESS: ${msg}`),
    error: (msg) => log.push(`ERROR: ${msg}`),
    warning: (msg) => log.push(`WARNING: ${msg}`),
    info: (msg) => log.push(`INFO: ${msg}`),
    dim: (msg) => log.push(`DIM: ${msg}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: () => ({ stop: () => {} }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KEYVALUE'),
    code: () => log.push('CODE'),
  };
  return { log, output };
}

function makeArgs(flags: Record<string, unknown> = {}): ParsedArgs {
  return {
    command: 'generate',
    subcommand: 'opening-lines',
    positional: [],
    arguments: {},
    flags: flags as Record<string, string | number | boolean>,
    raw: '',
  };
}

/** Builds a minimal extension with a stubbed GenerationManager. */
function makeMockExtension(projectPath: string, result = { content: 'Line 1\nLine 2', reasoning: 'Use vivid imagery.' }) {
  const ext = new NovelWriterExtension(projectPath);
  const mock = new MockMCPClient();
  (ext as any).mcpClient = mock;
  (ext as any).projectId = 1;

  // Stub GenerationManager by patching the module via the extension
  // We intercept at the constructor level using a closure mock
  const mockGenerator = {
    workshopOpeningLines: vi.fn().mockResolvedValue(result),
  };

  // Patch the GenerationManager constructor in the handler context by
  // storing the stub on the extension so the handler picks it up
  // (handler does: new GenerationManager(mcpClient, projectId))
  // We need to mock the module-level class instead.
  return { ext, mockGenerator };
}

// ── suite ────────────────────────────────────────────────────────────────────

describe('craft-handler — handleGenerateOpeningLines', () => {
  let projectPath: string;

  beforeEach(async () => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectPath = join(tmpdir(), `novel-craft-test-${id}`);
    await mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectPath, { recursive: true, force: true });
  });

  it('calls the generator and outputs success', async () => {
    // We need to mock GenerationManager at the module level
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    const workshopMock = vi.fn().mockResolvedValue({
      content: '1. It was a dark and stormy night.\n2. She never expected to find the map.',
      reasoning: 'Begin with action or mystery.',
    });
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockImplementation(workshopMock);

    const ext = new NovelWriterExtension(projectPath);
    const mock = new MockMCPClient();
    (ext as any).mcpClient = mock;
    (ext as any).projectId = 1;

    const { log, output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs(), projectPath, output, ext);

    expect(log.some((l) => l.includes('SUCCESS') && l.includes('Opening Line'))).toBe(true);
    expect(workshopMock).toHaveBeenCalledOnce();
  });

  it('includes reasoning tip when reasoning is present', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockResolvedValue({
      content: 'In the beginning...',
      reasoning: 'Start mid-action.',
    });

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { log, output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs(), projectPath, output, ext);

    expect(log.some((l) => l.includes('Tip:'))).toBe(true);
  });

  it('does not print reasoning tip when reasoning is absent', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockResolvedValue({
      content: 'Opening...',
      reasoning: undefined,
    });

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { log, output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs(), projectPath, output, ext);

    expect(log.some((l) => l.includes('Tip:'))).toBe(false);
  });

  it('defaults count to 5 when --count not provided', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    const workshopMock = vi.fn().mockResolvedValue({ content: '5 options', reasoning: undefined });
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockImplementation(workshopMock);

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs(), projectPath, output, ext);

    expect(workshopMock).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it('respects --count flag', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    const workshopMock = vi.fn().mockResolvedValue({ content: '3 options', reasoning: undefined });
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockImplementation(workshopMock);

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs({ count: 3 }), projectPath, output, ext);

    expect(workshopMock).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('clamps count to maximum of 10', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    const workshopMock = vi.fn().mockResolvedValue({ content: '10 options', reasoning: undefined });
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockImplementation(workshopMock);

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs({ count: 50 }), projectPath, output, ext);

    expect(workshopMock).toHaveBeenCalledWith(expect.anything(), 10);
  });

  it('clamps count to minimum of 1', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    const workshopMock = vi.fn().mockResolvedValue({ content: '1 option', reasoning: undefined });
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockImplementation(workshopMock);

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs({ count: -5 }), projectPath, output, ext);

    expect(workshopMock).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('outputs error when generator throws', async () => {
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockRejectedValue(
      new Error('API key missing'),
    );

    const ext = new NovelWriterExtension(projectPath);
    (ext as any).mcpClient = new MockMCPClient();
    (ext as any).projectId = 1;

    const { log, output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs(), projectPath, output, ext);

    expect(log.some((l) => l.includes('ERROR') && l.includes('opening lines'))).toBe(true);
  });

  it('creates a new extension when none injected', async () => {
    // When no extension is injected, handler creates one itself.
    // This will fail on workshopOpeningLines (no API key) — we catch the error.
    const { GenerationManager } = await import('../../../project/src/ai/generation-manager.js');
    vi.spyOn(GenerationManager.prototype, 'workshopOpeningLines').mockResolvedValue({
      content: 'No-extension path',
      reasoning: undefined,
    });

    const { log, output } = createMockOutput();
    await handleGenerateOpeningLines(makeArgs(), projectPath, output);

    // Either success or error — handler must not throw unhandled
    expect(log.length).toBeGreaterThan(0);
  });
});
