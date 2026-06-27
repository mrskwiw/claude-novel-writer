/**
 * CLI Output Formatting
 * Provides formatted output for CLI commands
 */

import type { OutputFormatter } from './types.js';

// Re-export OutputFormatter for convenience
export type { OutputFormatter } from './types.js';

export class CLIOutput implements OutputFormatter {
  private readonly isTTY = Boolean(process.stdout.isTTY);

  /** Wrap text in an ANSI escape only when writing to an interactive terminal. */
  private ansi(code: string, text: string, reset = '0'): string {
    if (!this.isTTY) return text;
    return `\x1b[${code}m${text}\x1b[${reset}m`;
  }

  bold(text: string): string { return this.ansi('1', text); }

  /**
   * Display success message
   */
  success(message: string): void {
    console.log(`✅ ${message}`);
  }

  /**
   * Display error message
   */
  error(message: string): void {
    console.error(`❌ ${message}`);
  }

  /**
   * Display warning message
   */
  warning(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  /**
   * Display info message
   */
  info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  /**
   * Display dimmed/subdued message
   */
  dim(message: string): void {
    console.log(`   ${message}`);
  }

  /**
   * Display data as table
   */
  table(data: Record<string, unknown>[], columns?: string[]): void {
    if (data.length === 0) {
      console.log('  (no data)');
      return;
    }

    // Simple table implementation
    // In production, could use a library like 'cli-table3'
    const cols = columns || Object.keys(data[0]);

    // Header
    console.log('  ' + cols.join('  |  '));
    console.log('  ' + cols.map((c) => '-'.repeat(c.length)).join('--+--'));

    // Rows
    for (const row of data) {
      const values = cols.map((col) => String(row[col] || ''));
      console.log('  ' + values.join('  |  '));
    }
  }

  /**
   * Display list of items
   */
  list(items: string[], icon: string = '•'): void {
    for (const item of items) {
      console.log(`  ${icon} ${item}`);
    }
  }

  /**
   * Display section with title and content
   */
  section(title: string, content: string): void {
    console.log(`\n${title}`);
    console.log('='.repeat(title.length));
    console.log(content);
  }

  /**
   * Display spinner for async operations
   */
  spinner(message: string): { stop: (message?: string) => void } {
    // Simple spinner implementation
    // In production, could use 'ora' or similar
    console.log(`⏳ ${message}...`);

    return {
      stop: (finalMessage?: string) => {
        if (finalMessage) {
          console.log(`✓ ${finalMessage}`);
        }
      },
    };
  }

  /**
   * Display heading
   */
  heading(text: string): void {
    console.log(`\n📖 ${text}\n`);
  }

  /**
   * Display code block
   */
  code(text: string): void {
    console.log('```');
    console.log(text);
    console.log('```');
  }

  /**
   * Display key-value pairs
   */
  keyValue(data: Record<string, unknown>): void {
    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));

    for (const [key, value] of Object.entries(data)) {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(`  ${paddedKey}: ${value}`);
    }
  }

  /**
   * Display empty line
   */
  newline(): void {
    console.log();
  }

  /**
   * Display divider
   */
  divider(): void {
    console.log('─'.repeat(50));
  }
}

// Export singleton instance
export const output = new CLIOutput();
