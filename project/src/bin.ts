#!/usr/bin/env node
/**
 * Claude Novel Writer — standalone CLI entry point.
 * Invoked by the Claude Code plugin command via Bash.
 *
 * Usage:
 *   novel-writer init
 *   novel-writer create character --name "Ada"
 *   novel-writer list chapters
 */

import { handleNovelCommand } from './cli/index.js';

const args = process.argv.slice(2);
// Re-quote any arguments that contain spaces so the CLI parser tokenises them correctly
const commandString = args
  .map((a) => (a.includes(' ') ? `"${a.replace(/"/g, '\\"')}"` : a))
  .join(' ');

if (!commandString.trim()) {
  console.log('Usage: novel-writer <command> [options]');
  console.log('Run "novel-writer help" for available commands.');
  process.exit(0);
}

handleNovelCommand(commandString).then((ok) => {
  if (!ok) process.exit(1);
}).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
