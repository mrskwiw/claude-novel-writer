#!/usr/bin/env node

/**
 * MCP SQLite Server Launcher
 *
 * This script launches the mcp-sqlite server with the correct database path.
 * It's used by the Claude Code extension to start the MCP server automatically.
 *
 * Usage:
 *   node launch.js <path-to-database.db>
 *   node launch.js /path/to/project/.novel/data.db
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database path from command line arguments
const dbPath = process.argv[2];

if (!dbPath) {
  console.error('Error: Database path is required');
  console.error('Usage: node launch.js <path-to-database.db>');
  process.exit(1);
}

// Resolve to absolute path
const absoluteDbPath = resolve(dbPath);

console.log(`Starting MCP SQLite server...`);
console.log(`Database: ${absoluteDbPath}`);

// Find mcp-sqlite in node_modules
const mcpSqlitePath = join(__dirname, '..', 'node_modules', '.bin', 'mcp-sqlite');

// Launch mcp-sqlite server
const server = spawn('npx', ['-y', 'mcp-sqlite', absoluteDbPath], {
  stdio: 'inherit',
  shell: true,
});

server.on('error', (error) => {
  console.error(`Failed to start MCP server: ${error.message}`);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`MCP server exited with code ${code}`);
    process.exit(code);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down MCP server...');
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down MCP server...');
  server.kill('SIGTERM');
  process.exit(0);
});
