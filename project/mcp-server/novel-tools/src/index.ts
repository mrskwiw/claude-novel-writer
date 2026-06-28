#!/usr/bin/env node

/**
 * Novel Tools MCP Server — single passthrough tool.
 *
 * Exposes ONE tool, `novel`, that runs a novel-writer CLI command in a project
 * directory and returns whatever the CLI prints. The CLI's CommandRegistry is
 * the single source of truth, so this server never drifts behind new commands
 * or flags — anything the CLI can do, the tool can do, including `help`.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * The one and only tool. Its description deliberately points the caller at the
 * CLI's own `help` so an agent can pull the full, current command + argument
 * list at call time instead of relying on a hand-maintained schema.
 */
export const NOVEL_TOOL = {
  name: 'novel',
  description:
    'Run a novel-writer CLI command in a novel project and return its text output. ' +
    'Pass `command` exactly as you would after `/novel` (e.g. "list characters", ' +
    '"create character --name Ada --summary \\"...\\"", "generate overview --length brief", "check"). ' +
    'The CLI is the source of truth for every command and flag — to discover the ' +
    'full, current list, call this tool with command "help" for an overview, or ' +
    '"help <command>" for one command\'s arguments, choices, and examples ' +
    '(e.g. "help generate", "help analyze"). Set `project_path` to the project ' +
    'directory (the folder containing `.novel/`); it defaults to the server\'s ' +
    'working directory.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description:
          'The CLI command and its arguments, exactly as typed after `/novel` ' +
          '(without the leading "/novel"). Use "help" or "help <command>" to discover options.',
      },
      project_path: {
        type: 'string',
        description:
          'Absolute path to the novel project directory (the folder containing `.novel/`). ' +
          'Defaults to the server process working directory.',
      },
    },
    required: ['command'],
  },
};

/**
 * Execute a novel-writer command in `projectPath`, capturing everything the CLI
 * prints (it writes via `console.*` and, for `--json`, `process.stdout.write`).
 * Pure passthrough: the CLI registry decides what is valid, so this stays in
 * sync by construction.
 */
export async function runNovelCommand(
  command: string,
  projectPath?: string
): Promise<{ ok: boolean; output: string }> {
  // Dynamic import resolves to the built CLI at <project>/dist/cli/index.js
  // from both this source file and the compiled dist/index.js.
  const { NovelCLI } = await import('../../../dist/cli/index.js');
  const cwd = projectPath || process.cwd();

  const chunks: string[] = [];
  const push = (...parts: unknown[]) => {
    chunks.push(parts.map((p) => String(p)).join(' '));
  };

  const orig = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    stdout: process.stdout.write.bind(process.stdout),
    stderr: process.stderr.write.bind(process.stderr),
  };

  console.log = push;
  console.error = push;
  console.warn = push;
  console.info = push;
  process.stdout.write = ((s: string | Uint8Array) => {
    chunks.push(typeof s === 'string' ? s : s.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array) => {
    chunks.push(typeof s === 'string' ? s : s.toString());
    return true;
  }) as typeof process.stderr.write;

  let ok = false;
  try {
    const cli = new NovelCLI(cwd);
    ok = await cli.execute(command);
  } finally {
    console.log = orig.log;
    console.error = orig.error;
    console.warn = orig.warn;
    console.info = orig.info;
    process.stdout.write = orig.stdout;
    process.stderr.write = orig.stderr;
  }

  return { ok, output: chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

/** MCP `tools/list` response — always the single passthrough tool. */
export function listTools(): { tools: typeof NOVEL_TOOL[] } {
  return { tools: [NOVEL_TOOL] };
}

/**
 * MCP `tools/call` dispatch for the `novel` tool. Exported for testing.
 * `runner` is injectable so tests can exercise the error path.
 */
export async function handleCallTool(
  request: { params: { name: string; arguments?: Record<string, unknown> } },
  runner: typeof runNovelCommand = runNovelCommand
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const { name, arguments: args = {} } = request.params;

  if (name !== NOVEL_TOOL.name) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const command = typeof args.command === 'string' ? args.command.trim() : '';
  const projectPath =
    typeof args.project_path === 'string' && args.project_path.length > 0
      ? args.project_path
      : undefined;

  if (!command) {
    return {
      content: [{ type: 'text', text: 'Error: "command" is required (e.g. "help").' }],
      isError: true,
    };
  }

  if (projectPath && !existsSync(projectPath)) {
    return {
      content: [{ type: 'text', text: `Error: project_path does not exist: ${projectPath}` }],
      isError: true,
    };
  }

  try {
    const { ok, output } = await runner(command, projectPath);
    return {
      content: [{ type: 'text', text: output || (ok ? '(command produced no output)' : 'Command failed.') }],
      isError: !ok,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error running command: ${message}` }],
      isError: true,
    };
  }
}

/** Build and wire the MCP server. Exported so tests can construct it without main(). */
export function createServer(): Server {
  const server = new Server(
    { name: 'novel-tools', version: '2.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => listTools());
  server.setRequestHandler(CallToolRequestSchema, async (request) => handleCallTool(request));
  return server;
}

/**
 * Start the server. The transport is injectable so tests can drive `main()`
 * with a fake transport instead of connecting real stdio.
 */
export async function main(
  transport: { start(): Promise<void>; close(): Promise<void>; send(message: unknown): Promise<void> } = new StdioServerTransport()
): Promise<void> {
  const server = createServer();
  await server.connect(transport as unknown as Parameters<Server['connect']>[0]);
  // Log to stderr so it doesn't interfere with the MCP protocol on stdout.
  console.error('Novel Tools MCP Server (passthrough) running on stdio');
}

// Only start the server when run directly — importing this module (e.g. in
// tests) must NOT connect a transport.
const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}
