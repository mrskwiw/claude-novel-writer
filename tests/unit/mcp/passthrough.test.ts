/**
 * Unit tests for the novel-tools MCP server — single passthrough tool.
 *
 * The server exposes ONE tool, `novel`, that runs a novel-writer CLI command in
 * a project directory and returns the captured output. These tests exercise the
 * tool definition, the tools/list + tools/call dispatch, error paths, and a full
 * init → create → sync → list lifecycle routed entirely through the passthrough.
 *
 * Note: runNovelCommand dynamically imports the BUILT CLI (../../../dist/cli),
 * so the project must be built (`npm run build`) before running this file.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  NOVEL_TOOL,
  listTools,
  createServer,
  handleCallTool,
  runNovelCommand,
  main,
} from '../../../project/mcp-server/novel-tools/src/index.js';

// ─── Tool definition ──────────────────────────────────────────────────────────

describe('NOVEL_TOOL definition', () => {
  it('exposes a single tool named "novel" with a required command', () => {
    expect(NOVEL_TOOL.name).toBe('novel');
    expect(NOVEL_TOOL.inputSchema.required).toContain('command');
    expect(NOVEL_TOOL.inputSchema.properties.command.type).toBe('string');
    expect(NOVEL_TOOL.inputSchema.properties.project_path.type).toBe('string');
  });

  it('points callers at `help` in its description (self-documenting)', () => {
    expect(NOVEL_TOOL.description).toMatch(/help/);
    expect(NOVEL_TOOL.description).toMatch(/help <command>/);
  });
});

describe('listTools()', () => {
  it('returns exactly the one passthrough tool', () => {
    const { tools } = listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('novel');
  });
});

describe('createServer()', () => {
  it('builds an MCP server instance without connecting a transport', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(typeof server.setRequestHandler).toBe('function');
  });
});

describe('main()', () => {
  it('connects the server using an injected transport', async () => {
    const transport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(main(transport)).resolves.toBeUndefined();
      expect(transport.start).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('running on stdio'));
    } finally {
      errSpy.mockRestore();
    }
  });
});

// ─── Dispatch error paths ─────────────────────────────────────────────────────

describe('handleCallTool() — error paths', () => {
  it('rejects an unknown tool name', async () => {
    const res = await handleCallTool({ params: { name: 'not-novel', arguments: { command: 'help' } } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Unknown tool/);
  });

  it('requires a non-empty command', async () => {
    const res = await handleCallTool({ params: { name: 'novel', arguments: {} } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/"command" is required/);
  });

  it('treats a whitespace-only command as missing', async () => {
    const res = await handleCallTool({ params: { name: 'novel', arguments: { command: '   ' } } });
    expect(res.isError).toBe(true);
  });

  it('rejects a project_path that does not exist', async () => {
    const res = await handleCallTool({
      params: { name: 'novel', arguments: { command: 'help', project_path: join(tmpdir(), 'definitely-missing-xyz-123') } },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/does not exist/);
  });

  it('reports a friendly error when the runner throws', async () => {
    const res = await handleCallTool(
      { params: { name: 'novel', arguments: { command: 'help' } } },
      async () => {
        throw new Error('boom');
      }
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Error running command: boom/);
  });
});

// ─── help (no project required) ───────────────────────────────────────────────

describe('handleCallTool() — help', () => {
  it('runs `help` and returns the registry-driven command list', async () => {
    const res = await handleCallTool({ params: { name: 'novel', arguments: { command: 'help' } } });
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toMatch(/init/);
    expect(res.content[0].text).toMatch(/generate/);
  });

  it('runs `help <command>` for one command\'s arguments', async () => {
    const res = await handleCallTool({ params: { name: 'novel', arguments: { command: 'help generate' } } });
    expect(res.isError).toBe(false);
    expect(res.content[0].text.toLowerCase()).toMatch(/overview|synopsis|generate/);
  });
});

describe('runNovelCommand()', () => {
  it('returns ok=true and captured output for a valid command', async () => {
    const { ok, output } = await runNovelCommand('help');
    expect(ok).toBe(true);
    expect(output.length).toBeGreaterThan(0);
  });

  it('returns ok=false for an unknown command', async () => {
    const { ok, output } = await runNovelCommand('this-command-does-not-exist');
    expect(ok).toBe(false);
    expect(output.toLowerCase()).toMatch(/unknown command/);
  });
});

// ─── Full lifecycle through the passthrough ───────────────────────────────────

describe('passthrough lifecycle (init → create → sync → list)', () => {
  let projectDir: string;

  beforeAll(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'mcp-passthrough-'));
    await handleCallTool({
      params: { name: 'novel', arguments: { command: 'init --title "Passthrough Test" --author "Tester" --genre "thriller" --skip-prompts', project_path: projectDir } },
    });
  });

  afterAll(async () => {
    // On Windows the better-sqlite3 handle opened by the passthrough is released
    // on GC, which can briefly race the unlink (EBUSY). Best-effort cleanup with
    // a few retries; the OS reclaims the temp dir regardless.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rm(projectDir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  it('initializes a project that subsequent commands can use', async () => {
    const res = await handleCallTool({ params: { name: 'novel', arguments: { command: 'list characters', project_path: projectDir } } });
    expect(res.isError).toBe(false);
    // Fresh project: no characters yet.
    expect(res.content[0].text.toLowerCase()).toMatch(/no characters/);
  });

  it('creates and lists a character through the tool', async () => {
    await handleCallTool({
      params: { name: 'novel', arguments: { command: 'create character --name "Mara Quill" --role protagonist --summary "A smuggler with a debt"', project_path: projectDir } },
    });
    await handleCallTool({ params: { name: 'novel', arguments: { command: 'sync characters', project_path: projectDir } } });

    const res = await handleCallTool({ params: { name: 'novel', arguments: { command: 'list characters', project_path: projectDir } } });
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toMatch(/Mara Quill/);
  });
});
