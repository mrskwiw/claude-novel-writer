/**
 * Unit tests: src/cli/commands/theme.ts
 *
 * Exercises the command definition's top-level and subcommand handler wrappers
 * (each delegates to handleThemeCommand with the CommandContext) so the wiring
 * is covered. Uses a real temp dir; no DB, no LLM.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { themeCommand } from '../../../project/src/cli/commands/theme.js';
import type { CommandContext, OutputFormatter, ParsedArgs } from '../../../project/src/cli/types.js';

async function rmRetry(p: string) {
  for (let i = 0; i < 5; i++) {
    try {
      await rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function makeContext(cwd: string) {
  const log: string[] = [];
  const output: OutputFormatter = {
    success: (m) => log.push(`SUCCESS: ${m}`),
    error: (m) => log.push(`ERROR: ${m}`),
    warning: (m) => log.push(`WARNING: ${m}`),
    info: (m) => log.push(`INFO: ${m}`),
    dim: (m) => log.push(`DIM: ${m}`),
    table: () => log.push('TABLE'),
    list: () => log.push('LIST'),
    section: () => log.push('SECTION'),
    spinner: (m) => ({ stop: () => log.push(`SPINNER: ${m}`) }),
    newline: () => log.push(''),
    heading: (t) => log.push(`HEADING: ${t}`),
    keyValue: () => log.push('KV'),
    code: () => log.push('CODE'),
  };
  const context: CommandContext = { cwd, output };
  return { log, context };
}

function args(subcommand: string, flags: Record<string, string> = {}): ParsedArgs {
  return { command: 'theme', subcommand, positional: [subcommand], arguments: {}, flags, raw: '' };
}

describe('themeCommand definition', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'theme-cmd-'));
  });

  afterEach(async () => {
    await rmRetry(dir);
  });

  it('has the expected name, subcommands and flags', () => {
    expect(themeCommand.name).toBe('theme');
    expect(themeCommand.subcommands?.map((s) => s.name)).toEqual(['add', 'list', 'trace']);
    expect(themeCommand.flags?.map((f) => f.name)).toEqual(['name', 'motifs', 'description', 'theme']);
  });

  it('top-level handler delegates to the dispatcher', async () => {
    const { log, context } = makeContext(dir);
    await themeCommand.handler?.(args('list'), context);
    expect(log.some((l) => l.includes('No themes registered'))).toBe(true);
  });

  it('each subcommand handler delegates to the dispatcher', async () => {
    const sub = (name: string) => themeCommand.subcommands?.find((s) => s.name === name);

    const add = makeContext(dir);
    await sub('add')?.handler?.(args('add', { name: 'Isolation', motifs: 'cold,mirror' }), add.context);
    expect(add.log.some((l) => l.includes('Theme registered'))).toBe(true);

    const list = makeContext(dir);
    await sub('list')?.handler?.(args('list'), list.context);
    expect(list.log.some((l) => l.includes('Isolation'))).toBe(true);

    const trace = makeContext(dir);
    await sub('trace')?.handler?.(args('trace'), trace.context);
    expect(trace.log.some((l) => l.includes('No chapter files found'))).toBe(true);
  });
});
