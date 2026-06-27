/**
 * CLI Command Types
 */

export type FlagType = 'string' | 'number' | 'boolean';
export type ArgumentType = 'string' | 'number';

export interface Flag {
  name: string;
  alias?: string;
  description: string;
  type: FlagType;
  required?: boolean;
  default?: string | number | boolean;
  choices?: string[];
}

export interface Argument {
  name: string;
  description: string;
  type: ArgumentType;
  required?: boolean;
  variadic?: boolean; // Takes multiple values
}

export interface ParsedArgs {
  command: string;
  subcommand?: string;
  arguments: Record<string, string | number | boolean>;
  flags: Record<string, string | number | boolean>;
  positional: string[];
  raw: string;
}

export type CommandHandler = (args: ParsedArgs, context: CommandContext) => Promise<void>;

export interface CommandContext {
  cwd: string;
  projectId?: number;
  extension?: import('../index.js').NovelWriterExtension;
  output: OutputFormatter;
}

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  subcommands?: Command[];
  flags?: Flag[];
  arguments?: Argument[];
  handler?: CommandHandler; // Optional for commands with subcommands
  examples?: string[];
  requiresProject?: boolean; // Requires initialized project
}

export interface OutputFormatter {
  success(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  info(message: string): void;
  dim(message: string): void;
  table(data: Record<string, unknown>[], columns?: string[]): void;
  list(items: string[], icon?: string): void;
  section(title: string, content: string): void;
  spinner(message: string): { stop: (message?: string) => void };
  newline(): void;
  heading(title: string): void;
  keyValue(data: Record<string, unknown>): void;
  code(content: string, language?: string): void;
}

export interface ParseError {
  type: 'unknown-command' | 'missing-argument' | 'invalid-flag' | 'missing-flag' | 'invalid-value';
  message: string;
  command?: string;
  suggestion?: string;
}
