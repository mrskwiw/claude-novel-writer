/**
 * Help Command Handler
 * Lists all registered commands or shows help for a specific command.
 */

import type { CommandRegistry } from '../registry.js';
import type { Command } from '../types.js';

/**
 * Handle the /novel help command.
 *
 * @param args - Positional arguments; args[0] is an optional command name.
 * @param registry - The CommandRegistry instance to query.
 * @param json - When true, return a machine-readable JSON schema instead of prose.
 * @returns Formatted help string (or JSON when `json` is set).
 */
export function handleHelpCommand(args: string[], registry: CommandRegistry, json = false): string {
  const commandName = args[0]?.trim();

  if (json) {
    return buildHelpJson(registry, commandName);
  }

  if (!commandName) {
    return formatGeneralHelp(registry);
  }

  const command = registry.get(commandName);

  if (!command) {
    return `Unknown command: ${commandName}. Run /novel help for a list.`;
  }

  const lines: string[] = [
    `${command.name} — ${command.description}`,
  ];

  if (command.aliases && command.aliases.length > 0) {
    lines.push(`  Aliases: ${command.aliases.join(', ')}`);
  }

  // Usage line — mirrors the way arguments/subcommands/flags are accepted.
  lines.push(`  Usage: ${formatUsage(command)}`);

  if (command.subcommands && command.subcommands.length > 0) {
    lines.push('  Subcommands:');
    for (const sub of command.subcommands) {
      lines.push(`    ${sub.name.padEnd(20)} ${sub.description}`);
    }
  }

  if (command.arguments && command.arguments.length > 0) {
    lines.push('  Arguments:');
    for (const arg of command.arguments) {
      const name = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
      lines.push(`    ${name.padEnd(20)} ${arg.description}`);
    }
  }

  if (command.flags && command.flags.length > 0) {
    lines.push('  Flags:');
    for (const flag of command.flags) {
      const alias = flag.alias ? `, -${flag.alias}` : '';
      const meta: string[] = [flag.type];
      if (flag.required) meta.push('required');
      let line = `    --${flag.name}${alias}  (${meta.join(', ')})  ${flag.description}`;
      if (flag.choices && flag.choices.length > 0) {
        line += `  [choices: ${flag.choices.join(', ')}]`;
      }
      if (flag.default !== undefined) {
        line += `  [default: ${flag.default}]`;
      }
      lines.push(line);
    }
  }

  if (command.examples && command.examples.length > 0) {
    lines.push('  Examples:');
    for (const example of command.examples) {
      lines.push(`    ${example}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build a one-line usage string showing subcommand, positional arguments, and
 * a [flags] placeholder, e.g. `/novel character <subcommand> <name> [flags]`.
 */
function formatUsage(command: import('../types.js').Command): string {
  let usage = `/novel ${command.name}`;
  if (command.subcommands && command.subcommands.length > 0) {
    usage += ' <subcommand>';
  }
  if (command.arguments && command.arguments.length > 0) {
    for (const arg of command.arguments) {
      usage += arg.required ? ` <${arg.name}>` : ` [${arg.name}]`;
    }
  }
  if (command.flags && command.flags.length > 0) {
    usage += ' [flags]';
  }
  return usage;
}

/**
 * Format the general help listing all top-level commands.
 */
function formatGeneralHelp(registry: CommandRegistry): string {
  const commands = registry.getAll();
  const lines: string[] = ['/novel commands:'];

  for (const command of commands) {
    lines.push(`  ${command.name.padEnd(20)} — ${command.description}`);
  }

  return lines.join('\n');
}

/**
 * Serialize a command (or subcommand) to a plain, machine-readable schema
 * object — name, description, aliases, usage, arguments, flags, examples, and
 * nested subcommands.
 */
function commandToSchema(command: Command): Record<string, unknown> {
  return {
    name: command.name,
    description: command.description,
    aliases: command.aliases ?? [],
    usage: formatUsage(command),
    arguments: (command.arguments ?? []).map((a) => ({
      name: a.name,
      description: a.description,
      required: Boolean(a.required),
    })),
    flags: (command.flags ?? []).map((f) => ({
      name: f.name,
      alias: f.alias ?? null,
      type: f.type,
      required: Boolean(f.required),
      choices: f.choices ?? null,
      default: f.default ?? null,
      description: f.description,
    })),
    subcommands: (command.subcommands ?? []).map((s) => commandToSchema(s)),
    examples: command.examples ?? [],
  };
}

/**
 * Build the machine-readable JSON help. With a command name, emits that single
 * command's schema; otherwise emits the full CLI schema (every top-level
 * command). Consumers (tooling, the MCP passthrough) can introspect the CLI
 * without parsing prose.
 */
function buildHelpJson(registry: CommandRegistry, commandName?: string): string {
  if (commandName) {
    const command = registry.get(commandName);
    if (!command) {
      return JSON.stringify({ error: `Unknown command: ${commandName}` }, null, 2);
    }
    return JSON.stringify(commandToSchema(command), null, 2);
  }

  const commands = registry.getAll().map((c) => commandToSchema(c));
  return JSON.stringify({ commands }, null, 2);
}
