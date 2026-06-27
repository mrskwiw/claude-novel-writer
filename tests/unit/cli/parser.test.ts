/**
 * Unit Tests for CommandParser
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandParser } from '../../../project/src/cli/parser.js';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('parse()', () => {
    it('should parse simple command', () => {
      // Act
      const result = parser.parse('/novel init');

      // Assert
      expect(result.command).toBe('init');
      expect(result.subcommand).toBeUndefined();
      expect(result.flags).toEqual({});
    });

    it('should parse command with subcommand', () => {
      // Act
      const result = parser.parse('/novel create character');

      // Assert
      expect(result.command).toBe('create');
      expect(result.subcommand).toBe('character');
    });

    it('should parse command with flags', () => {
      // Act
      const result = parser.parse('/novel create character --name Sarah --role protagonist');

      // Assert
      expect(result.command).toBe('create');
      expect(result.subcommand).toBe('character');
      expect(result.flags.name).toBe('Sarah');
      expect(result.flags.role).toBe('protagonist');
    });

    it('should parse quoted values', () => {
      // Act
      const result = parser.parse('/novel create character --name "Sarah Chen" --summary "A brilliant scientist"');

      // Assert
      expect(result.flags.name).toBe('Sarah Chen');
      expect(result.flags.summary).toBe('A brilliant scientist');
    });

    it('should parse boolean flags', () => {
      // Act
      const result = parser.parse('/novel list characters --detailed');

      // Assert
      expect(result.flags.detailed).toBe(true);
    });

    it('should parse number flags', () => {
      // Act
      const result = parser.parse('/novel create chapter --number 5 --priority 3');

      // Assert
      expect(result.flags.number).toBe('5');
      expect(result.flags.priority).toBe('3');
    });

    it('should parse flag aliases', () => {
      // Act
      const result = parser.parse('/novel create character -n Sarah');

      // Assert
      expect(result.flags.n).toBe('Sarah');
    });

    it('should handle empty flags', () => {
      // Act
      const result = parser.parse('/novel list characters');

      // Assert
      expect(result.flags).toEqual({});
    });

    it('should strip /novel prefix', () => {
      // Act
      const result = parser.parse('/novel init');

      // Assert
      expect(result.command).toBe('init');
      expect(result.raw).toBe('/novel init');
    });

    it('should handle command without /novel prefix', () => {
      // Act
      const result = parser.parse('init');

      // Assert
      expect(result.command).toBe('init');
    });
  });

  describe('tokenize()', () => {
    it('should tokenize simple string', () => {
      // Act
      const tokens = parser.tokenize('create character --name Sarah');

      // Assert
      expect(tokens).toEqual(['create', 'character', '--name', 'Sarah']);
    });

    it('should handle quoted strings with spaces', () => {
      // Act
      const tokens = parser.tokenize('create character --name "Sarah Chen"');

      // Assert
      expect(tokens).toContain('Sarah Chen');
    });

    it('should handle single quotes', () => {
      // Act
      const tokens = parser.tokenize("create character --name 'Sarah Chen'");

      // Assert
      expect(tokens).toContain('Sarah Chen');
    });

    it('should handle escaped quotes', () => {
      // Act
      const tokens = parser.tokenize('create --summary "She said \\"Hello\\""');

      // Assert
      expect(tokens.some((t) => t.includes('Hello'))).toBe(true);
    });

    it('should handle multiple spaces', () => {
      // Act
      const tokens = parser.tokenize('create    character    --name     Sarah');

      // Assert
      expect(tokens).toEqual(['create', 'character', '--name', 'Sarah']);
    });

    it('should handle empty string', () => {
      // Act
      const tokens = parser.tokenize('');

      // Assert
      expect(tokens).toEqual([]);
    });
  });

  describe('parseFlags()', () => {
    it('should parse string flags', () => {
      // Arrange
      const tokens = ['--name', 'Sarah', '--role', 'protagonist'];

      // Act
      const flags = parser.parseFlags(tokens);

      // Assert
      expect(flags.name).toBe('Sarah');
      expect(flags.role).toBe('protagonist');
    });

    it('should parse boolean flags', () => {
      // Arrange
      const tokens = ['--interactive', '--verbose'];

      // Act
      const flags = parser.parseFlags(tokens);

      // Assert
      expect(flags.interactive).toBe(true);
      expect(flags.verbose).toBe(true);
    });

    it('should handle flags without values', () => {
      // Arrange
      const tokens = ['--name', 'Sarah', '--detailed'];

      // Act
      const flags = parser.parseFlags(tokens);

      // Assert
      expect(flags.name).toBe('Sarah');
      expect(flags.detailed).toBe(true);
    });

    it('should handle short flag syntax', () => {
      // Arrange
      const tokens = ['-n', 'Sarah', '-i'];

      // Act
      const flags = parser.parseFlags(tokens);

      // Assert
      expect(flags.n).toBe('Sarah');
      expect(flags.i).toBe(true);
    });

    it('should parse --key=value inline flag', () => {
      const flags = parser.parseFlags(['--name=Sarah']);
      expect(flags.name).toBe('Sarah');
    });

    it('should skip non-flag tokens in parseFlags', () => {
      const flags = parser.parseFlags(['positional', '--name', 'Alice']);
      expect(flags.name).toBe('Alice');
      expect('positional' in flags).toBe(false);
    });
  });

  describe('parse() edge cases', () => {
    it('should throw for bare /novel with no args', () => {
      expect(() => parser.parse('/novel')).toThrow();
    });

    it('should parse --key=value syntax in full parse', () => {
      const result = parser.parse('create character --name=Alice');
      expect(result.flags.name).toBe('Alice');
    });

    it('should collect positional arguments after flags', () => {
      const result = parser.parse('create chapter positionalArg');
      expect(result.positional).toContain('positionalArg');
    });

    it('should handle boolean short flag followed by long flag', () => {
      const result = parser.parse('list characters -i --sort name');
      expect(result.flags.i).toBe(true);
      expect(result.flags.sort).toBe('name');
    });
  });

  describe('validate()', () => {
    it('should return null for valid args with all required flags present', () => {
      const command = {
        name: 'create',
        description: 'Create something',
        flags: [
          { name: 'name', description: 'name', type: 'string' as const, required: true },
        ],
      };
      const args = { command: 'create', flags: { name: 'Alice' }, positional: [], arguments: {}, raw: '' };
      expect(parser.validate(args, command)).toBeNull();
    });

    it('should return missing-flag error when required flag absent', () => {
      const command = {
        name: 'create',
        description: 'Create something',
        flags: [
          { name: 'name', description: 'name', type: 'string' as const, required: true },
        ],
      };
      const args = { command: 'create', flags: {}, positional: [], arguments: {}, raw: '' };
      const error = parser.validate(args, command);
      expect(error?.type).toBe('missing-flag');
      expect(error?.message).toContain('--name');
    });

    it('should return invalid-value error for bad enum choice', () => {
      const command = {
        name: 'status',
        description: 'Set status',
        flags: [
          { name: 'state', description: 'state', type: 'string' as const, choices: ['active', 'done'] },
        ],
      };
      const args = { command: 'status', flags: { state: 'invalid' }, positional: [], arguments: {}, raw: '' };
      const error = parser.validate(args, command);
      expect(error?.type).toBe('invalid-value');
    });

    it('should return invalid-value error for non-numeric number flag', () => {
      const command = {
        name: 'create',
        description: 'Create',
        flags: [
          { name: 'count', description: 'count', type: 'number' as const },
        ],
      };
      const args = { command: 'create', flags: { count: 'notanumber' }, positional: [], arguments: {}, raw: '' };
      const error = parser.validate(args, command);
      expect(error?.type).toBe('invalid-value');
    });

    it('should return null for valid number flag', () => {
      const command = {
        name: 'create',
        description: 'Create',
        flags: [
          { name: 'count', description: 'count', type: 'number' as const },
        ],
      };
      const args = { command: 'create', flags: { count: '5' }, positional: [], arguments: {}, raw: '' };
      expect(parser.validate(args, command)).toBeNull();
    });

    it('should return missing-argument error when required positional arg missing', () => {
      const command = {
        name: 'create',
        description: 'Create',
        arguments: [
          { name: 'file', description: 'file path', type: 'string' as const, required: true },
        ],
      };
      const args = { command: 'create', flags: {}, positional: [], arguments: {}, raw: '' };
      const error = parser.validate(args, command);
      expect(error?.type).toBe('missing-argument');
    });

    it('should return null when no flags and no arguments defined', () => {
      const command = { name: 'help', description: 'Help' };
      const args = { command: 'help', flags: {}, positional: [], arguments: {}, raw: '' };
      expect(parser.validate(args, command)).toBeNull();
    });
  });

  describe('convertFlagTypes()', () => {
    it('should convert string to number for number-type flags', () => {
      const command = {
        name: 'create',
        description: 'Create',
        flags: [
          { name: 'count', description: 'count', type: 'number' as const },
        ],
      };
      const args = { command: 'create', flags: { count: '5' }, positional: [], arguments: {}, raw: '' };
      const result = parser.convertFlagTypes(args, command);
      expect(result.flags.count).toBe(5);
    });

    it('should convert "true" string to boolean true', () => {
      const command = {
        name: 'cmd',
        description: 'cmd',
        flags: [
          { name: 'verbose', description: 'verbose', type: 'boolean' as const },
        ],
      };
      const args = { command: 'cmd', flags: { verbose: 'true' }, positional: [], arguments: {}, raw: '' };
      const result = parser.convertFlagTypes(args, command);
      expect(result.flags.verbose).toBe(true);
    });

    it('should convert "1" string to boolean true', () => {
      const command = {
        name: 'cmd',
        description: 'cmd',
        flags: [{ name: 'v', description: 'v', type: 'boolean' as const }],
      };
      const args = { command: 'cmd', flags: { v: '1' }, positional: [], arguments: {}, raw: '' };
      const result = parser.convertFlagTypes(args, command);
      expect(result.flags.v).toBe(true);
    });

    it('should convert "false" string to boolean false', () => {
      const command = {
        name: 'cmd',
        description: 'cmd',
        flags: [{ name: 'debug', description: 'debug', type: 'boolean' as const }],
      };
      const args = { command: 'cmd', flags: { debug: 'false' }, positional: [], arguments: {}, raw: '' };
      const result = parser.convertFlagTypes(args, command);
      expect(result.flags.debug).toBe(false);
    });

    it('should apply default value when flag is absent', () => {
      const command = {
        name: 'cmd',
        description: 'cmd',
        flags: [{ name: 'format', description: 'format', type: 'string' as const, default: 'json' }],
      };
      const args = { command: 'cmd', flags: {}, positional: [], arguments: {}, raw: '' };
      const result = parser.convertFlagTypes(args, command);
      expect(result.flags.format).toBe('json');
    });

    it('should return args unchanged when command has no flags', () => {
      const command = { name: 'help', description: 'Help' };
      const args = { command: 'help', flags: { x: 'y' }, positional: [], arguments: {}, raw: '' };
      const result = parser.convertFlagTypes(args, command);
      expect(result.flags.x).toBe('y');
    });
  });

  describe('generateHelp()', () => {
    it('should include command description', () => {
      const command = {
        name: 'init',
        description: 'Initialize the project',
      };
      const help = parser.generateHelp(command);
      expect(help).toContain('Initialize the project');
    });

    it('should include usage line', () => {
      const command = { name: 'init', description: 'Init' };
      const help = parser.generateHelp(command);
      expect(help).toContain('/novel init');
    });

    it('should list subcommands when present', () => {
      const command = {
        name: 'create',
        description: 'Create things',
        subcommands: [
          { name: 'character', description: 'Create a character' },
        ],
      };
      const help = parser.generateHelp(command);
      expect(help).toContain('character');
      expect(help).toContain('Create a character');
    });

    it('should list required and optional arguments', () => {
      const command = {
        name: 'export',
        description: 'Export',
        arguments: [
          { name: 'format', description: 'output format', type: 'string' as const, required: true },
          { name: 'path', description: 'output path', type: 'string' as const },
        ],
      };
      const help = parser.generateHelp(command);
      expect(help).toContain('<format>');
      expect(help).toContain('[path]');
    });

    it('should list flags with alias, required, and default', () => {
      const command = {
        name: 'create',
        description: 'Create',
        flags: [
          {
            name: 'name',
            alias: 'n',
            description: 'the name',
            type: 'string' as const,
            required: true,
          },
          {
            name: 'format',
            description: 'output format',
            type: 'string' as const,
            default: 'json',
          },
        ],
      };
      const help = parser.generateHelp(command);
      expect(help).toContain('-n, --name');
      expect(help).toContain('(required)');
      expect(help).toContain('[default: json]');
    });

    it('should list examples when present', () => {
      const command = {
        name: 'init',
        description: 'Init',
        examples: ['/novel init --title "My Book"'],
      };
      const help = parser.generateHelp(command);
      expect(help).toContain('/novel init --title "My Book"');
    });
  });
});
