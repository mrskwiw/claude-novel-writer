/**
 * CLI Entry Point
 * Main interface for /novel CLI commands
 */

// Load environment variables from .env file.
// `quiet` suppresses dotenv's startup banner, which would otherwise pollute
// stdout and corrupt machine-readable output (e.g. `novel-writer init --json`).
import { config } from 'dotenv';
config({ quiet: true });

import { parser } from './parser.js';
import { registry } from './registry.js';
import { output } from './output.js';
import type { Command, CommandContext, ParsedArgs, ParseError } from './types.js';
import { NovelWriterExtension } from '../index.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

export class NovelCLI {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
  }

  /**
   * Execute a command from a command string.
   * Returns true on success, false when the command was unknown or invalid.
   */
  async execute(commandString: string): Promise<boolean> {
    try {
      // Parse command
      const args = parser.parse(commandString);

      // Get command from registry
      const command = registry.get(args.command);

      if (!command) {
        this.handleUnknownCommand(args.command);
        return false;
      }

      // Handle subcommands
      if (args.subcommand) {
        const subcommand = command.subcommands?.find(
          (sub) => sub.name === args.subcommand || sub.aliases?.includes(args.subcommand!)
        );

        if (!subcommand) {
          // If the command has no subcommands at all, treat args.subcommand as a
          // positional argument and fall through to the main handler.
          if (!command.subcommands || command.subcommands.length === 0) {
            args.positional.unshift(args.subcommand);
            args.subcommand = undefined;
            await this.executeCommand(command, args);
          } else {
            output.error(`Unknown subcommand: ${args.subcommand}`);
            output.info(`Run '/novel help ${args.command}' for available subcommands`);
            return false;
          }
        } else {
          // Validate and execute subcommand
          await this.executeCommand(subcommand, args);
        }
      } else {
        // Execute main command
        await this.executeCommand(command, args);
      }
      return true;
    } catch (error) {
      if (this.isParseError(error)) {
        this.handleParseError(error);
      } else {
        output.error(`Command execution failed: ${(error as Error).message}`);
        console.error(error);
      }
      return false;
    }
  }

  /**
   * Execute a command with parsed arguments
   */
  private async executeCommand(
    command: Command,
    args: ParsedArgs
  ): Promise<void> {
    // Validate arguments
    const validationError = parser.validate(args, command);
    if (validationError) {
      this.handleParseError(validationError);
      return;
    }

    // Convert flag types
    const convertedArgs = parser.convertFlagTypes(args, command);

    // Resolve the project directory. For every command except `init`, walk up
    // from the cwd to the nearest ancestor that holds `.novel/data.db`, so
    // commands run correctly from a project subdirectory (e.g. chapters/).
    // `init` always targets the literal cwd (where the new project is created).
    const projectDir =
      command.name === 'init' ? this.cwd : this.resolveProjectDir(this.cwd);

    // Check if command requires initialized project
    if (command.requiresProject && !this.isProjectInitialized(projectDir)) {
      output.error('This command requires an initialized novel project.');
      output.info('Run \'/novel init\' first to initialize a project in this directory.');
      return;
    }

    // Create command context
    const context = await this.createContext(projectDir);

    // Execute command handler
    try {
      await command.handler?.(convertedArgs, context);
    } catch (error) {
      output.error(`Command failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Walk up from `startDir` to the nearest ancestor that contains
   * `.novel/data.db` (the project root). Returns `startDir` unchanged when no
   * project is found, so callers still report "not initialized".
   */
  private resolveProjectDir(startDir: string): string {
    let dir = startDir;
    for (let i = 0; i < 64; i++) {
      if (existsSync(join(dir, '.novel', 'data.db'))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break; // reached the filesystem root
      dir = parent;
    }
    return startDir;
  }

  /**
   * Check if the given directory (default cwd) has an initialized project
   */
  private isProjectInitialized(dir: string = this.cwd): boolean {
    const novelDir = join(dir, '.novel');
    const dbPath = join(novelDir, 'data.db');
    return existsSync(novelDir) && existsSync(dbPath);
  }

  /**
   * Create command execution context for the given project directory
   */
  private async createContext(dir: string = this.cwd): Promise<CommandContext> {
    const context: CommandContext = {
      cwd: dir,
      output,
    };

    // Initialize extension if project exists
    if (this.isProjectInitialized(dir)) {
      const extension = new NovelWriterExtension(dir);

      // Load the actual project ID from the database (each .novel/data.db holds
      // one project). Fall back to 1 only if the lookup fails entirely.
      try {
        const projectId = await extension.loadProjectId();
        if (projectId !== undefined) {
          context.extension = extension;
          context.projectId = projectId;
        } else {
          // DB exists but has no project row — treat as uninitialized.
          console.warn('Warning: project database has no project record');
        }
      } catch (error) {
        // Project exists but can't load - non-fatal; assume the single project.
        extension.setProjectId(1);
        context.extension = extension;
        context.projectId = 1;
      }
    }

    return context;
  }

  /**
   * Handle unknown command
   */
  private handleUnknownCommand(commandName: string): void {
    output.error(`Unknown command: ${commandName}`);

    // Find similar commands
    const similar = registry.findSimilar(commandName);
    if (similar.length > 0) {
      output.newline();
      output.info('Did you mean one of these?');
      for (const cmd of similar.slice(0, 3)) {
        output.list([`/novel ${cmd.name}`], '→');
      }
    }

    output.newline();
    output.info('Run \'/novel help\' to see all available commands');
  }

  /**
   * Handle parse errors
   */
  private handleParseError(error: ParseError): void {
    output.error(error.message);

    if (error.suggestion) {
      output.newline();
      output.info(`Suggestion: ${error.suggestion}`);
    }

    if (error.command) {
      output.newline();
      output.info(`Run '/novel help ${error.command}' for usage information`);
    }
  }

  /**
   * Type guard for ParseError
   */
  private isParseError(error: unknown): error is ParseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      typeof (error as Record<string, unknown>).type === 'string' &&
      typeof (error as Record<string, unknown>).message === 'string'
    );
  }

  /**
   * Get help text for a command
   */
  getHelp(commandName?: string): string {
    if (!commandName) {
      return this.getGeneralHelp();
    }

    const command = registry.get(commandName);
    if (!command) {
      return `Unknown command: ${commandName}\n\nRun '/novel help' to see all available commands.`;
    }

    return parser.generateHelp(command);
  }

  /**
   * Get general help text
   */
  private getGeneralHelp(): string {
    const commands = registry.getAll();

    let help = '📖 Novel Writer CLI - Help\n\n';
    help += 'Usage: /novel <command> [subcommand] [arguments] [--flags]\n\n';
    help += 'Available Commands:\n\n';

    // Group commands by category
    const categories = new Map<string, Command[]>();
    categories.set('Project Management', []);
    categories.set('Content Creation', []);
    categories.set('Analysis & Checking', []);
    categories.set('Export', []);
    categories.set('Help', []);

    for (const command of commands) {
      // Categorize commands
      if (command.name === 'init') {
        categories.get('Project Management')!.push(command);
      } else if (command.name.startsWith('create')) {
        categories.get('Content Creation')!.push(command);
      } else if (['check', 'list', 'show', 'analyze'].includes(command.name)) {
        categories.get('Analysis & Checking')!.push(command);
      } else if (command.name === 'export') {
        categories.get('Export')!.push(command);
      } else if (command.name === 'help') {
        categories.get('Help')!.push(command);
      }
    }

    for (const [category, cmds] of categories.entries()) {
      if (cmds.length === 0) continue;

      help += `${category}:\n`;
      for (const cmd of cmds) {
        help += `  ${cmd.name.padEnd(20)} ${cmd.description}\n`;
      }
      help += '\n';
    }

    help += 'Examples:\n';
    help += '  /novel init\n';
    help += '  /novel create character\n';
    help += '  /novel check consistency\n';
    help += '  /novel export manuscript --format pdf\n\n';

    help += 'For detailed help on a command:\n';
    help += '  /novel help <command>\n';

    return help;
  }
}

/**
 * Main entry point for slash command.
 * Returns false when the command was unknown or invalid so callers can set exit codes.
 */
export async function handleNovelCommand(commandString: string): Promise<boolean> {
  const cli = new NovelCLI();
  return cli.execute(commandString);
}

// Export utilities for use in extension
export { parser } from './parser.js';
export { registry } from './registry.js';
export { output } from './output.js';
export * from './types.js';
