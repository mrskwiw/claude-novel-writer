/**
 * CLI Command Parser
 * Parses command strings from /novel slash command
 */

import type { ParsedArgs, Command, Flag, ParseError } from './types.js';

export class CommandParser {
  /**
   * Parse a command string into structured arguments
   *
   * @example
   * parse('create character --name "Sarah" --role protagonist')
   * // Returns:
   * {
   *   command: 'create',
   *   subcommand: 'character',
   *   arguments: {},
   *   flags: { name: 'Sarah', role: 'protagonist' },
   *   positional: [],
   *   raw: '...'
   * }
   */
  parse(commandString: string): ParsedArgs {
    let raw = commandString.trim();

    // Strip /novel prefix if present
    if (raw.startsWith('/novel ')) {
      raw = raw.slice(7); // Remove '/novel '
    } else if (raw === '/novel') {
      raw = '';
    }

    const tokens = this.tokenize(raw);

    const args: ParsedArgs = {
      command: '',
      subcommand: undefined,
      arguments: {},
      flags: {},
      positional: [],
      raw: commandString.trim(), // Store original command
    };

    let i = 0;

    // Parse command
    if (tokens.length === 0) {
      throw this.createError('unknown-command', 'No command provided');
    }

    args.command = tokens[i++];

    // Parse subcommand (if next token doesn't start with --)
    if (i < tokens.length && !tokens[i].startsWith('-')) {
      args.subcommand = tokens[i++];
    }

    // Parse flags and positional arguments
    while (i < tokens.length) {
      const token = tokens[i];

      if (token.startsWith('--')) {
        // Long flag: --name or --name=value
        const [flagName, flagValue] = this.parseLongFlag(token);

        if (flagValue !== undefined) {
          // --name=value
          args.flags[flagName] = flagValue;
          i++;
        } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          // --name value
          args.flags[flagName] = tokens[i + 1];
          i += 2;
        } else {
          // Boolean flag: --interactive
          args.flags[flagName] = true;
          i++;
        }
      } else if (token.startsWith('-') && token.length === 2) {
        // Short flag: -i
        const flagName = token.slice(1);

        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          args.flags[flagName] = tokens[i + 1];
          i += 2;
        } else {
          args.flags[flagName] = true;
          i++;
        }
      } else {
        // Positional argument
        args.positional.push(token);
        i++;
      }
    }

    return args;
  }

  /**
   * Tokenize command string, respecting quotes
   */
  tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Parse flags from token array (public for testing)
   */
  parseFlags(tokens: string[]): Record<string, string | boolean> {
    const flags: Record<string, string | boolean> = {};
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.startsWith('--')) {
        // Long flag: --name or --name=value
        const [flagName, flagValue] = this.parseLongFlag(token);

        if (flagValue !== undefined) {
          // --name=value
          flags[flagName] = flagValue;
          i++;
        } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          // --name value
          flags[flagName] = tokens[i + 1];
          i += 2;
        } else {
          // Boolean flag: --interactive
          flags[flagName] = true;
          i++;
        }
      } else if (token.startsWith('-') && token.length === 2) {
        // Short flag: -i
        const flagName = token.slice(1);

        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          flags[flagName] = tokens[i + 1];
          i += 2;
        } else {
          flags[flagName] = true;
          i++;
        }
      } else {
        // Skip non-flag tokens
        i++;
      }
    }

    return flags;
  }

  /**
   * Parse long flag: --name or --name=value
   */
  private parseLongFlag(token: string): [string, string | undefined] {
    const withoutDashes = token.slice(2);
    const equalIndex = withoutDashes.indexOf('=');

    if (equalIndex === -1) {
      return [withoutDashes, undefined];
    }

    const name = withoutDashes.slice(0, equalIndex);
    const value = withoutDashes.slice(equalIndex + 1);
    return [name, value];
  }

  /**
   * Validate parsed args against command definition
   */
  validate(args: ParsedArgs, command: Command): ParseError | null {
    // Check required flags
    if (command.flags) {
      for (const flag of command.flags) {
        if (flag.required && !(flag.name in args.flags)) {
          return this.createError(
            'missing-flag',
            `Required flag --${flag.name} is missing`,
            command.name
          );
        }

        // Check flag value type
        if (flag.name in args.flags) {
          const value = args.flags[flag.name];
          const error = this.validateFlagValue(flag, value);
          if (error) return error;
        }
      }
    }

    // Check required arguments
    if (command.arguments) {
      const requiredArgs = command.arguments.filter((arg) => arg.required);
      if (args.positional.length < requiredArgs.length) {
        const missingArg = requiredArgs[args.positional.length];
        return this.createError(
          'missing-argument',
          `Required argument <${missingArg.name}> is missing`,
          command.name
        );
      }
    }

    return null;
  }

  /**
   * Validate flag value against flag definition
   */
  private validateFlagValue(flag: Flag, value: string | number | boolean): ParseError | null {
    // Check choices
    if (flag.choices && !flag.choices.includes(String(value))) {
      return this.createError(
        'invalid-value',
        `Invalid value for --${flag.name}: "${value}". Must be one of: ${flag.choices.join(', ')}`,
        flag.name
      );
    }

    // Check type
    if (flag.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        return this.createError(
          'invalid-value',
          `Invalid value for --${flag.name}: "${value}". Must be a number.`,
          flag.name
        );
      }
    }

    return null;
  }

  /**
   * Convert flag values to correct types
   */
  convertFlagTypes(args: ParsedArgs, command: Command): ParsedArgs {
    if (!command.flags) return args;

    const converted = { ...args, flags: { ...args.flags } };

    for (const flag of command.flags) {
      if (flag.name in converted.flags) {
        const value = converted.flags[flag.name];

        switch (flag.type) {
          case 'number':
            converted.flags[flag.name] = Number(value);
            break;
          case 'boolean':
            if (typeof value === 'string') {
              converted.flags[flag.name] =
                value.toLowerCase() === 'true' || value === '1';
            }
            break;
          // 'string' is default, no conversion needed
        }
      } else if (flag.default !== undefined) {
        // Apply default value
        converted.flags[flag.name] = flag.default;
      }
    }

    return converted;
  }

  /**
   * Create a parse error
   */
  private createError(
    type: ParseError['type'],
    message: string,
    command?: string
  ): ParseError {
    return { type, message, command };
  }

  /**
   * Generate help text for command
   */
  generateHelp(command: Command): string {
    let help = `${command.description}\n\n`;

    // Usage
    help += `Usage:\n`;
    let usage = `  /novel ${command.name}`;

    if (command.subcommands && command.subcommands.length > 0) {
      usage += ' <subcommand>';
    }

    if (command.arguments && command.arguments.length > 0) {
      for (const arg of command.arguments) {
        if (arg.required) {
          usage += ` <${arg.name}>`;
        } else {
          usage += ` [${arg.name}]`;
        }
      }
    }

    if (command.flags && command.flags.length > 0) {
      usage += ' [flags]';
    }

    help += usage + '\n\n';

    // Subcommands
    if (command.subcommands && command.subcommands.length > 0) {
      help += `Subcommands:\n`;
      for (const sub of command.subcommands) {
        help += `  ${sub.name.padEnd(20)} ${sub.description}\n`;
      }
      help += '\n';
    }

    // Arguments
    if (command.arguments && command.arguments.length > 0) {
      help += `Arguments:\n`;
      for (const arg of command.arguments) {
        const name = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
        help += `  ${name.padEnd(20)} ${arg.description}\n`;
      }
      help += '\n';
    }

    // Flags
    if (command.flags && command.flags.length > 0) {
      help += `Flags:\n`;
      for (const flag of command.flags) {
        const name = flag.alias
          ? `-${flag.alias}, --${flag.name}`
          : `    --${flag.name}`;
        const required = flag.required ? ' (required)' : '';
        const def = flag.default !== undefined ? ` [default: ${flag.default}]` : '';
        help += `  ${name.padEnd(20)} ${flag.description}${required}${def}\n`;
      }
      help += '\n';
    }

    // Examples
    if (command.examples && command.examples.length > 0) {
      help += `Examples:\n`;
      for (const example of command.examples) {
        help += `  ${example}\n`;
      }
      help += '\n';
    }

    return help;
  }
}

// Export singleton instance
export const parser = new CommandParser();
