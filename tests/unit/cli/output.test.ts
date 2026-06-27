/**
 * Unit Tests for CLIOutput
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CLIOutput } from '../../../project/src/cli/output.js';

describe('CLIOutput', () => {
  let output: CLIOutput;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    output = new CLIOutput();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('success()', () => {
    it('should print a success message with checkmark', () => {
      output.success('Operation completed');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Operation completed');
    });
  });

  describe('error()', () => {
    it('should print an error message with X', () => {
      output.error('Something went wrong');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Something went wrong');
    });
  });

  describe('warning()', () => {
    it('should print a warning message with warning sign', () => {
      output.warning('Proceed with caution');
      expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️  Proceed with caution');
    });
  });

  describe('info()', () => {
    it('should print an info message', () => {
      output.info('Here is some info');
      expect(consoleSpy).toHaveBeenCalledWith('ℹ️  Here is some info');
    });
  });

  describe('dim()', () => {
    it('should print a dim/subdued message with indentation', () => {
      output.dim('subdued content');
      expect(consoleSpy).toHaveBeenCalledWith('   subdued content');
    });
  });

  describe('table()', () => {
    it('should print (no data) for empty array', () => {
      output.table([]);
      expect(consoleSpy).toHaveBeenCalledWith('  (no data)');
    });

    it('should print table with auto-detected columns', () => {
      output.table([
        { name: 'Alice', role: 'protagonist' },
        { name: 'Bob', role: 'antagonist' },
      ]);
      // Header, divider, and two data rows
      expect(consoleSpy).toHaveBeenCalledTimes(4);
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      expect(calls[0]).toContain('name');
      expect(calls[0]).toContain('role');
      expect(calls[2]).toContain('Alice');
      expect(calls[3]).toContain('Bob');
    });

    it('should print table with explicit columns', () => {
      output.table(
        [{ name: 'Alice', role: 'protagonist', age: 30 }],
        ['name', 'role']
      );
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      expect(calls[0]).toContain('name');
      expect(calls[0]).toContain('role');
      expect(calls[0]).not.toContain('age');
    });

    it('should handle null/undefined values in rows', () => {
      output.table([{ name: 'Alice', role: undefined }]);
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      expect(calls[2]).toContain('Alice');
    });
  });

  describe('list()', () => {
    it('should print each item with default bullet', () => {
      output.list(['item one', 'item two']);
      expect(consoleSpy).toHaveBeenCalledWith('  • item one');
      expect(consoleSpy).toHaveBeenCalledWith('  • item two');
    });

    it('should print each item with custom icon', () => {
      output.list(['a', 'b'], '→');
      expect(consoleSpy).toHaveBeenCalledWith('  → a');
      expect(consoleSpy).toHaveBeenCalledWith('  → b');
    });

    it('should handle empty list without output', () => {
      output.list([]);
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('section()', () => {
    it('should print title, separator, and content', () => {
      output.section('My Section', 'Section content here');
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      expect(calls[0]).toBe('\nMy Section');
      expect(calls[1]).toBe('='.repeat('My Section'.length));
      expect(calls[2]).toBe('Section content here');
    });
  });

  describe('spinner()', () => {
    it('should print spinner message and return stop function', () => {
      const spinner = output.spinner('Loading...');
      expect(consoleSpy).toHaveBeenCalledWith('⏳ Loading......');
      expect(typeof spinner.stop).toBe('function');
    });

    it('stop() with message should print final message', () => {
      const spinner = output.spinner('Processing');
      consoleSpy.mockClear();
      spinner.stop('Done!');
      expect(consoleSpy).toHaveBeenCalledWith('✓ Done!');
    });

    it('stop() without message should not print', () => {
      const spinner = output.spinner('Processing');
      consoleSpy.mockClear();
      spinner.stop();
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('heading()', () => {
    it('should print heading with book emoji', () => {
      output.heading('Chapter One');
      expect(consoleSpy).toHaveBeenCalledWith('\n📖 Chapter One\n');
    });
  });

  describe('code()', () => {
    it('should wrap text in code fences', () => {
      output.code('const x = 1;');
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      expect(calls[0]).toBe('```');
      expect(calls[1]).toBe('const x = 1;');
      expect(calls[2]).toBe('```');
    });
  });

  describe('keyValue()', () => {
    it('should print key-value pairs with alignment', () => {
      output.keyValue({ name: 'Alice', role: 'protagonist' });
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      // Keys are padded to longest key length
      expect(calls.some((c) => c.includes('name') && c.includes('Alice'))).toBe(true);
      expect(calls.some((c) => c.includes('role') && c.includes('protagonist'))).toBe(true);
    });

    it('should align values when key lengths differ', () => {
      output.keyValue({ a: 1, longKeyName: 2 });
      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      // First key 'a' should be padded to length of 'longKeyName'
      const shortKeyLine = calls.find((c) => c.includes(': 1'));
      expect(shortKeyLine).toBeDefined();
      expect(shortKeyLine!.indexOf(':')).toBeGreaterThanOrEqual('longKeyName'.length + 2);
    });
  });

  describe('newline()', () => {
    it('should print an empty line', () => {
      output.newline();
      expect(consoleSpy).toHaveBeenCalledWith();
    });
  });

  describe('divider()', () => {
    it('should print a 50-char divider', () => {
      output.divider();
      expect(consoleSpy).toHaveBeenCalledWith('─'.repeat(50));
    });
  });

  describe('bold()', () => {
    it('should return plain text when not in a TTY', () => {
      // In test environment, process.stdout.isTTY is falsy
      const result = output.bold('hello');
      // Non-TTY: no ANSI codes
      expect(result).toBe('hello');
    });
  });
});
