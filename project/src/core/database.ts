/**
 * Database initialization and management
 * Uses MCP SQLite server for all database operations
 */

import { readFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { runMigrations } from '../db/migrations.js';

const _require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DatabaseConfig {
  dbPath: string;
  projectPath: string;
}

export class DatabaseManager {
  private config: DatabaseConfig;
  private mcpClient: MCPClient;

  constructor(config: DatabaseConfig, mcpClient: MCPClient) {
    this.config = config;
    this.mcpClient = mcpClient;
  }

  /**
   * Initialize the database with schema if it doesn't exist
   */
  async initialize(): Promise<void> {
    const dbDir = dirname(this.config.dbPath);

    // Ensure .novel directory exists
    try {
      await access(dbDir);
    } catch {
      await mkdir(dbDir, { recursive: true });
      console.log(`Created novel directory: ${dbDir}`);
    }

    // Check if database needs initialization
    const needsInit = await this.needsInitialization();

    if (needsInit) {
      console.log('Initializing novel database...');
      await this.runSchema();
      console.log('Database initialized successfully');
    } else {
      console.log('Database already initialized');
    }

    await runMigrations(this.mcpClient);
  }

  /**
   * Check if database needs initialization by querying for projects table
   */
  private async needsInitialization(): Promise<boolean> {
    try {
      const tables = await this.mcpClient.listTables();
      return !tables.includes('projects');
    } catch (error) {
      // If we can't list tables, assume database needs init
      return true;
    }
  }

  /**
   * Run the schema.sql file to initialize all tables
   */
  private async runSchema(): Promise<void> {
    // Read schema from root directory
    const schemaPath = join(__dirname, '..', '..', 'schema.sql');
    const schema = await readFile(schemaPath, 'utf-8');

    // Split schema into individual statements (naive split on semicolon)
    // SQLite can handle complex statements, but we'll execute one at a time for clarity
    const statements = this.splitSQLStatements(schema);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await this.mcpClient.writeQuery(statement);
        } catch (error) {
          console.error('Error executing schema statement:', error);
          throw error;
        }
      }
    }
  }

  /**
   * Split SQL file into individual statements
   * Handles multi-line statements, comments, and BEGIN...END blocks
   */
  private splitSQLStatements(sql: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inMultiLineComment = false;
    let beginEndDepth = 0; // Track nesting of BEGIN...END blocks

    const lines = sql.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle multi-line comments
      if (trimmed.startsWith('/*')) {
        inMultiLineComment = true;
      }
      if (inMultiLineComment) {
        if (trimmed.includes('*/')) {
          inMultiLineComment = false;
        }
        continue;
      }

      // Skip single-line comments and empty lines
      if (trimmed.startsWith('--') || trimmed === '') {
        continue;
      }

      // Remove inline comments (-- comments at end of line)
      const lineWithoutComment = line.replace(/\s*--.*$/, '');
      if (lineWithoutComment.trim()) {
        const cleanLine = lineWithoutComment.trim().toUpperCase();

        // Track BEGIN...END blocks (for triggers, procedures, etc.)
        if (cleanLine === 'BEGIN') {
          beginEndDepth++;
        } else if (cleanLine === 'END;' || cleanLine === 'END') {
          if (beginEndDepth > 0) {
            beginEndDepth--;
          }
        }

        currentStatement += lineWithoutComment + '\n';
      }

      // Check if statement is complete (ends with semicolon, outside BEGIN...END)
      if (trimmed.endsWith(';') && beginEndDepth === 0) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements;
  }

  /**
   * Create a new project entry
   */
  async createProject(options: {
    title: string;
    author?: string;
    genre?: string;
    targetWordCount?: number;
    currentPhase?: string;
  }): Promise<number> {
    const query = `
      INSERT INTO projects (title, author, genre, target_word_count, current_phase)
      VALUES (?, ?, ?, ?, ?)
    `;

    const result = await this.mcpClient.writeQuery(query, [
      options.title,
      options.author || null,
      options.genre || null,
      options.targetWordCount || null,
      options.currentPhase || 'ideation',
    ]);

    // Get the last inserted ID
    const idQuery = 'SELECT last_insert_rowid() as id';
    const idResult = await this.mcpClient.readQuery<{ id: number }>(idQuery);
    return idResult[0].id;
  }

  /**
   * Get project configuration
   */
  async getProject(projectId: number): Promise<Record<string, unknown> | null> {
    const query = 'SELECT * FROM projects WHERE id = ?';
    const results = await this.mcpClient.readQuery(query, [projectId]);
    return results[0] || null;
  }

  /**
   * Get project health dashboard
   */
  async getProjectHealth(projectId: number): Promise<Record<string, unknown> | null> {
    const query = 'SELECT * FROM project_health WHERE project_id = ?';
    const results = await this.mcpClient.readQuery(query, [projectId]);
    return results[0] || null;
  }

  /**
   * Get all open consistency issues
   */
  async getConsistencyIssues(
    projectId: number,
    severity?: 'info' | 'warning' | 'error'
  ): Promise<Record<string, unknown>[]> {
    let query = `
      SELECT * FROM consistency_issues
      WHERE project_id = ? AND status = 'open'
    `;
    const params: unknown[] = [projectId];

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY severity DESC, detected_at DESC';

    return await this.mcpClient.readQuery(query, params);
  }

  /**
   * Get active plot threads
   */
  async getActivePlotThreads(projectId: number): Promise<Record<string, unknown>[]> {
    const query = `
      SELECT * FROM active_plot_threads
      WHERE project_id = ?
      ORDER BY priority DESC
    `;
    return await this.mcpClient.readQuery(query, [projectId]);
  }

  /**
   * Get writing streak information
   */
  async getWritingStreak(projectId: number): Promise<Record<string, unknown> | null> {
    const query = 'SELECT * FROM writing_streak WHERE project_id = ?';
    const results = await this.mcpClient.readQuery(query, [projectId]);
    return results[0] || null;
  }
}

/**
 * MCP Client interface for SQLite operations
 * This abstracts the MCP server communication
 */
export interface MCPClient {
  readQuery<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]>;
  writeQuery(sql: string, values?: unknown[]): Promise<{ affected_rows: number }>;
  listTables(): Promise<string[]>;
  describeTable(tableName: string): Promise<Record<string, unknown>[]>;
}

/**
 * MCP Client implementation for use inside Claude Code's extension runtime.
 * callMCPTool() is intentionally left as a stub — it must be overridden or
 * replaced at runtime by the Claude Code host (which injects MCP tool access).
 *
 * For standalone CLI use, prefer DirectSQLiteClient instead.
 */
export class MCPSQLiteClient implements MCPClient {
  private serverName: string;

  constructor(serverName: string = 'novel-db') {
    this.serverName = serverName;
  }

  async readQuery<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.callMCPTool('read_query', { query: sql, values });
    return result as T[];
  }

  async writeQuery(sql: string, values: unknown[] = []): Promise<{ affected_rows: number }> {
    const result = await this.callMCPTool('write_query', { query: sql, values });
    return result as { affected_rows: number };
  }

  async listTables(): Promise<string[]> {
    const result = await this.callMCPTool('list_tables', {});
    return result as string[];
  }

  async describeTable(tableName: string): Promise<Record<string, unknown>[]> {
    const result = await this.callMCPTool('describe_table', { table_name: tableName });
    return result as Record<string, unknown>[];
  }

  protected async callMCPTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    throw new Error(
      `MCP tool call not available outside Claude Code runtime: ${toolName}. ` +
      `Use DirectSQLiteClient for standalone CLI usage.`
    );
  }
}

/**
 * Standalone SQLite client using better-sqlite3.
 * Used by the novel-writer CLI when running outside Claude Code.
 */
export class DirectSQLiteClient implements MCPClient {
  private db: import('better-sqlite3').Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private getDb(): import('better-sqlite3').Database {
    if (!this.db) {
      const Database = _require('better-sqlite3') as typeof import('better-sqlite3');
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    }
    return this.db;
  }

  async readQuery<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
    const rows = this.getDb().prepare(sql).all(...values) as T[];
    return rows;
  }

  async writeQuery(sql: string, values: unknown[] = []): Promise<{ affected_rows: number }> {
    const result = this.getDb().prepare(sql).run(...values);
    return { affected_rows: result.changes };
  }

  async listTables(): Promise<string[]> {
    const rows = this.getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  async describeTable(tableName: string): Promise<Record<string, unknown>[]> {
    const rows = this.getDb()
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Record<string, unknown>[];
    return rows;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
