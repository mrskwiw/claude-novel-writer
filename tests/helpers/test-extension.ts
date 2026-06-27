/**
 * Test Extension Helper
 * Extends NovelWriterExtension to use mock MCP client for testing
 */

import { join } from 'path';
import { mkdirSync } from 'fs';
import { NovelWriterExtension } from '../../project/src/index.js';
import { DatabaseManager } from '../../project/src/core/database.js';
import { createMockMCPClient } from './mock-mcp-client.js';
import type { InitOptions } from '../../project/src/types/novel.js';

export class TestNovelWriterExtension extends NovelWriterExtension {
  constructor(projectPath: string) {
    super(projectPath);

    // Ensure .novel directory exists
    const novelDir = join(projectPath, '.novel');
    mkdirSync(novelDir, { recursive: true });

    // Replace the MCP client with our mock
    // Use data.db to match the production code path (handlers check for .novel/data.db)
    const dbPath = join(projectPath, '.novel', 'data.db');
    const mockClient = createMockMCPClient(dbPath);

    // Replace the mcpClient
    (this as any).mcpClient = mockClient;

    // Replace the db manager with one that uses the mock client
    (this as any).db = new DatabaseManager(
      { dbPath, projectPath },
      mockClient as any
    );
  }

  /**
   * Override initialize to use mock client
   */
  async initialize(options: InitOptions): Promise<void> {
    console.log('Initializing novel project...');

    // Initialize database with mock client
    await (this as any).db.initialize();

    // Create project entry
    (this as any).projectId = await (this as any).db.createProject({
      title: options.title,
      author: options.author,
      genre: options.genre,
      targetWordCount: options.targetWordCount,
      currentPhase: 'ideation',
    });

    console.log(`Project initialized with ID: ${(this as any).projectId}`);
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    const client = (this as any).mcpClient;
    if (client && typeof client.close === 'function') {
      client.close();
    }
  }
}

/**
 * Create a test extension instance
 */
export function createTestExtension(projectPath: string): TestNovelWriterExtension {
  return new TestNovelWriterExtension(projectPath);
}
