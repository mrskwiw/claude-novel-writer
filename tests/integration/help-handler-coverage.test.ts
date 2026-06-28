/**
 * Coverage tests: src/cli/handlers/help-handler.ts
 *
 * handleHelpCommand(args: string[], registry: CommandRegistry): string
 *
 * Strategy: drive every rendering branch with a hand-crafted fake registry that
 * returns a fully-populated Command (aliases, subcommands, arguments, flags with
 * alias/required/choices/default, examples) and a minimal Command with none of
 * those optional fields, plus the real CommandRegistry for the general listing.
 */

import { describe, it, expect } from 'vitest';
import { handleHelpCommand } from '../../project/src/cli/handlers/help-handler.js';
import { CommandRegistry } from '../../project/src/cli/registry.js';
import type { Command } from '../../project/src/cli/types.js';

// A command exercising every optional rendering branch.
const richCommand: Command = {
  name: 'rich',
  description: 'A fully featured command',
  aliases: ['r', 'rch'],
  subcommands: [
    { name: 'alpha', description: 'the alpha subcommand' },
    { name: 'beta', description: 'the beta subcommand' },
  ],
  arguments: [
    { name: 'reqArg', description: 'a required argument', type: 'string', required: true },
    { name: 'optArg', description: 'an optional argument', type: 'string', required: false },
  ],
  flags: [
    {
      name: 'mode',
      alias: 'm',
      description: 'operating mode',
      type: 'string',
      required: true,
      choices: ['fast', 'slow'],
      default: 'fast',
    },
    {
      name: 'verbose',
      description: 'plain boolean flag, no alias/choices/default',
      type: 'boolean',
    },
  ],
  examples: ['/novel rich alpha foo --mode fast', '/novel rich beta bar'],
};

// A command with none of the optional fields — exercises the false branches.
const minimalCommand: Command = {
  name: 'min',
  description: 'A minimal command',
};

function makeFakeRegistry(): CommandRegistry {
  const fake = {
    get(name: string): Command | undefined {
      if (name === 'rich') return richCommand;
      if (name === 'min') return minimalCommand;
      return undefined;
    },
    getAll(): Command[] {
      return [richCommand, minimalCommand];
    },
  };
  return fake as unknown as CommandRegistry;
}

describe('help-handler coverage', () => {
  // ── general help (no args) ─────────────────────────────────────────────────
  it('returns general help when args are empty', () => {
    const out = handleHelpCommand([], makeFakeRegistry());
    expect(out).toContain('/novel commands:');
    expect(out).toContain('rich');
    expect(out).toContain('min');
  });

  it('returns general help when args[0] is undefined', () => {
    const out = handleHelpCommand([undefined as unknown as string], makeFakeRegistry());
    expect(out).toContain('/novel commands:');
  });

  it('returns general help when args[0] is blank/whitespace', () => {
    const out = handleHelpCommand(['   '], makeFakeRegistry());
    expect(out).toContain('/novel commands:');
  });

  // ── unknown command ────────────────────────────────────────────────────────
  it('reports an unknown command', () => {
    const out = handleHelpCommand(['nope'], makeFakeRegistry());
    expect(out).toContain('Unknown command: nope');
    expect(out).toContain('/novel help');
  });

  // ── rich command rendering ─────────────────────────────────────────────────
  it('renders aliases, subcommands, arguments, flags, and examples', () => {
    const out = handleHelpCommand(['rich'], makeFakeRegistry());
    // header + description
    expect(out).toContain('rich — A fully featured command');
    // aliases
    expect(out).toContain('Aliases: r, rch');
    // usage line with subcommand + required/optional args + flags
    expect(out).toContain('Usage: /novel rich <subcommand> <reqArg> [optArg] [flags]');
    // subcommands
    expect(out).toContain('Subcommands:');
    expect(out).toContain('alpha');
    expect(out).toContain('the beta subcommand');
    // arguments (required <> and optional [])
    expect(out).toContain('Arguments:');
    expect(out).toContain('<reqArg>');
    expect(out).toContain('[optArg]');
    // flags with alias, required, choices, default
    expect(out).toContain('Flags:');
    expect(out).toContain('--mode, -m');
    expect(out).toContain('required');
    expect(out).toContain('[choices: fast, slow]');
    expect(out).toContain('[default: fast]');
    // plain flag (no alias/choices/default)
    expect(out).toContain('--verbose');
    // examples
    expect(out).toContain('Examples:');
    expect(out).toContain('/novel rich alpha foo --mode fast');
  });

  // ── minimal command rendering (false branches) ─────────────────────────────
  it('renders a minimal command without optional sections', () => {
    const out = handleHelpCommand(['min'], makeFakeRegistry());
    expect(out).toContain('min — A minimal command');
    // usage has no subcommand/args/flags placeholders
    expect(out).toContain('Usage: /novel min');
    expect(out).not.toContain('Aliases:');
    expect(out).not.toContain('Subcommands:');
    expect(out).not.toContain('Arguments:');
    expect(out).not.toContain('Flags:');
    expect(out).not.toContain('Examples:');
  });

  // ── smoke test against the real registry ───────────────────────────────────
  it('works against the real CommandRegistry (general + specific)', () => {
    const registry = new CommandRegistry();
    expect(handleHelpCommand([], registry)).toContain('/novel commands:');
    expect(handleHelpCommand(['character'], registry)).toContain('character');
  });

  // ── JSON schema (machine-readable) ──────────────────────────────────────────
  it('emits the full CLI schema as JSON when json=true and no command given', () => {
    const out = handleHelpCommand([], makeFakeRegistry(), true);
    const parsed = JSON.parse(out) as { commands: Array<{ name: string; subcommands: unknown[]; flags: unknown[] }> };
    expect(Array.isArray(parsed.commands)).toBe(true);
    const rich = parsed.commands.find((c) => c.name === 'rich')!;
    expect(rich.subcommands.length).toBe(2);
    expect(rich.flags.length).toBe(2);
  });

  it('emits a single command schema as JSON when json=true with a command name', () => {
    const out = handleHelpCommand(['rich'], makeFakeRegistry(), true);
    const parsed = JSON.parse(out) as {
      name: string;
      usage: string;
      flags: Array<{ name: string; choices: string[] | null; default: unknown }>;
      arguments: Array<{ name: string; required: boolean }>;
    };
    expect(parsed.name).toBe('rich');
    expect(parsed.usage).toContain('/novel rich');
    expect(parsed.flags.find((f) => f.name === 'mode')?.choices).toEqual(['fast', 'slow']);
    expect(parsed.arguments.find((a) => a.name === 'reqArg')?.required).toBe(true);
  });

  it('emits a JSON error for an unknown command in json mode', () => {
    const out = handleHelpCommand(['nope'], makeFakeRegistry(), true);
    const parsed = JSON.parse(out) as { error: string };
    expect(parsed.error).toContain('Unknown command: nope');
  });
});
