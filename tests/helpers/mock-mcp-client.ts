/**
 * Mock MCP Client for Testing
 * Uses better-sqlite3 instead of MCP protocol
 */

import Database from 'better-sqlite3';
import type { MCPSQLiteClient } from '../../project/src/core/database.js';

export class MockMCPClient implements Partial<MCPSQLiteClient> {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
  }

  async readQuery(sql: string, params?: any[]): Promise<any[]> {
    try {
      const stmt = this.db.prepare(sql);
      const results = stmt.all(...(params || []));
      return results as any[];
    } catch (error) {
      throw new Error(`Read query failed: ${(error as Error).message}`);
    }
  }

  async writeQuery(sql: string, params?: any[]): Promise<void> {
    try {
      if (params && params.length > 0) {
        // Use prepare for parameterized queries
        const stmt = this.db.prepare(sql);
        stmt.run(...params);
      } else {
        // Use exec for schema/non-parameterized queries
        // exec() handles multiple statements and comments better
        try {
          this.db.exec(sql);
        } catch (execError) {
          // If exec fails, try prepare as fallback (for single statements)
          const stmt = this.db.prepare(sql);
          stmt.run();
        }
      }
    } catch (error) {
      // Log the SQL for debugging
      console.error('SQL that failed:', sql);
      console.error('Parameters:', params);
      console.error('Error:', (error as Error).message);
      throw new Error(`Write query failed: ${(error as Error).message}`);
    }
  }

  async callMCPTool(toolName: string, params: Record<string, any>): Promise<any> {
    // For testing, we don't actually use MCP tools
    // This is here just to satisfy the interface
    throw new Error(`MCP tool call not supported in tests: ${toolName}`);
  }

  close(): void {
    this.db.close();
  }
}

export function createMockMCPClient(dbPath: string): MCPSQLiteClient {
  return new MockMCPClient(dbPath) as any as MCPSQLiteClient;
}
