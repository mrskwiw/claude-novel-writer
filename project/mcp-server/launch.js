#!/usr/bin/env node

/**
 * MCP SQLite Server Launcher
 *
 * Launches the generic `mcp-sqlite` server against a project's database. Used by
 * the Claude Code extension to start the optional "novel-db" power-user server.
 *
 * Usage:
 *   node launch.js <path-to-database.db>
 *   node launch.js /path/to/project/.novel/data.db
 *
 * The launch logic is factored into pure, dependency-injected functions so it
 * can be unit-tested without actually spawning a child process.
 */

import { spawn as nodeSpawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolve the database-path argument (argv[2]) to an absolute path.
 * Returns null when no path was supplied.
 */
export function resolveDbPath(argv) {
  const dbPath = argv[2];
  if (!dbPath) return null;
  return resolve(dbPath);
}

/**
 * Launch the mcp-sqlite server for the database in `argv`. All side-effecting
 * dependencies (spawn, console, process.exit, signal registration) are
 * injectable so the function can be tested in-process.
 *
 * @returns the spawned child process, or undefined when the args are invalid.
 */
export function runLauncher(argv, deps = {}) {
  const {
    spawn = nodeSpawn,
    log = console.log,
    error = console.error,
    exit = process.exit,
    onSignal = (sig, handler) => process.on(sig, handler),
  } = deps;

  const absoluteDbPath = resolveDbPath(argv);
  if (!absoluteDbPath) {
    error('Error: Database path is required');
    error('Usage: node launch.js <path-to-database.db>');
    exit(1);
    return undefined;
  }

  log('Starting MCP SQLite server...');
  log(`Database: ${absoluteDbPath}`);

  const server = spawn('npx', ['-y', 'mcp-sqlite', absoluteDbPath], {
    stdio: 'inherit',
    shell: true,
  });

  server.on('error', (err) => {
    error(`Failed to start MCP server: ${err.message}`);
    exit(1);
  });

  server.on('exit', (code) => {
    if (code !== 0) {
      error(`MCP server exited with code ${code}`);
      exit(code);
    }
  });

  // Graceful shutdown: forward termination signals to the child.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    onSignal(sig, () => {
      log('\nShutting down MCP server...');
      server.kill(sig);
      exit(0);
    });
  }

  return server;
}

// Run only when invoked directly (not when imported by a test).
const isEntrypoint =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  runLauncher(process.argv);
}
