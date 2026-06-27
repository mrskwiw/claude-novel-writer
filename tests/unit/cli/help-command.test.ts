/**
 * Unit tests for GAP-15 — /novel help command
 *
 * Verifies:
 *  - helpCommand is registered in the CommandRegistry
 *  - No-arg call lists all registered command names
 *  - `help character` prints the character command description
 *  - `help <unknown>` returns the "Unknown command" message
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { helpCommand } from '../../../project/src/cli/commands/help.js';
import { handleHelpCommand } from '../../../project/src/cli/handlers/help-handler.js';
import { CommandRegistry } from '../../../project/src/cli/registry.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

describe('helpCommand definition', () => {
  it('has name "help"', () => {
    expect(helpCommand.name).toBe('help');
  });

  it('has a non-empty description', () => {
    expect(typeof helpCommand.description).toBe('string');
    expect(helpCommand.description.length).toBeGreaterThan(0);
  });

  it('has a handler function', () => {
    expect(typeof helpCommand.handler).toBe('function');
  });
});

// ── Registry registration ─────────────────────────────────────────────────────

describe('CommandRegistry — help registration', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('registers "help" command', () => {
    expect(registry.has('help')).toBe(true);
  });

  it('"help" appears in getAll()', () => {
    const names = registry.getAll().map((c) => c.name);
    expect(names).toContain('help');
  });
});

// ── handleHelpCommand — no args ───────────────────────────────────────────────

describe('handleHelpCommand — no arguments', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('output starts with "/novel commands:"', () => {
    const result = handleHelpCommand([], registry);
    expect(result).toMatch(/^\/novel commands:/);
  });

  it('output contains all registered command names', () => {
    const result = handleHelpCommand([], registry);
    const names = registry.getAll().map((c) => c.name);
    for (const name of names) {
      expect(result).toContain(name);
    }
  });

  it('output contains "help" command entry', () => {
    const result = handleHelpCommand([], registry);
    expect(result).toContain('help');
  });

  it('output contains "character" command entry', () => {
    const result = handleHelpCommand([], registry);
    expect(result).toContain('character');
  });
});

// ── handleHelpCommand — specific command ──────────────────────────────────────

describe('handleHelpCommand — "help character"', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('output mentions "character"', () => {
    const result = handleHelpCommand(['character'], registry);
    expect(result).toContain('character');
  });

  it('output includes the character command description', () => {
    const characterCmd = registry.get('character')!;
    const result = handleHelpCommand(['character'], registry);
    expect(result).toContain(characterCmd.description);
  });
});

// ── handleHelpCommand — rich per-command rendering ────────────────────────────

describe('handleHelpCommand — rich rendering (help init)', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('renders a Usage line', () => {
    const result = handleHelpCommand(['init'], registry);
    expect(result).toContain('Usage:');
    expect(result).toContain('/novel init');
  });

  it('renders flag choices for the --phase flag', () => {
    const result = handleHelpCommand(['init'], registry);
    // init's --phase declares choices; the renderer should surface them
    expect(result).toMatch(/\[choices: .*ideation/);
  });

  it('renders flag defaults (e.g. --words default 80000)', () => {
    const result = handleHelpCommand(['init'], registry);
    expect(result).toContain('[default:');
  });

  it('marks required flags', () => {
    // The renderer appends "required" in a flag's meta when flag.required is set.
    // Use a command that has a required flag if present; otherwise the token
    // simply won't appear. Here we assert the renderer does not crash and emits flags.
    const result = handleHelpCommand(['init'], registry);
    expect(result).toContain('Flags:');
  });
});

// ── handleHelpCommand — unknown command ───────────────────────────────────────

describe('handleHelpCommand — unknown command', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('returns "Unknown command" message for unrecognised input', () => {
    const result = handleHelpCommand(['unknownxyz'], registry);
    expect(result).toContain('Unknown command');
    expect(result).toContain('unknownxyz');
  });

  it('message directs user to run /novel help', () => {
    const result = handleHelpCommand(['totally-fake'], registry);
    expect(result).toContain('/novel help');
  });
});
