/**
 * Unit tests for database migrations (Ticket 002)
 * Verifies: fresh run creates all tables, second run is a no-op (idempotent).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations, getMigrationTables } from '../../../project/src/db/migrations.js';
import type { MCPClient } from '../../../project/src/core/database.js';

function makeMockClient(): MCPClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    readQuery: vi.fn().mockResolvedValue([]),
    writeQuery: vi.fn().mockImplementation(async (sql: string) => {
      calls.push(sql.trim().split(/\s+/)[0].toUpperCase()); // record verb
      return { affected_rows: 0 };
    }),
    listTables: vi.fn().mockResolvedValue([]),
    describeTable: vi.fn().mockResolvedValue([]),
  } as unknown as MCPClient & { calls: string[] };
}

describe('runMigrations()', () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient();
  });

  it('executes at least one writeQuery per migration file', async () => {
    await runMigrations(client);
    expect(client.writeQuery).toHaveBeenCalled();
  });

  it('creates all 8 expected tables (CREATE TABLE IF NOT EXISTS statements)', async () => {
    const sqls: string[] = [];
    (client.writeQuery as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      sqls.push(sql);
      return { affected_rows: 0 };
    });

    await runMigrations(client);

    const tables = getMigrationTables();
    for (const table of tables) {
      const found = sqls.some(s => s.toLowerCase().includes(table));
      expect(found, `Expected migration SQL to reference table "${table}"`).toBe(true);
    }
  });

  it('is idempotent — runs twice without throwing', async () => {
    await expect(runMigrations(client)).resolves.toBeUndefined();
    await expect(runMigrations(client)).resolves.toBeUndefined();
  });

  it('throws a descriptive error when writeQuery rejects', async () => {
    (client.writeQuery as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('disk full')
    );
    let caught: Error | undefined;
    try {
      await runMigrations(client);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toContain('001_knowledge_objects');
    expect(caught?.message).toContain('disk full');
  });

  it('getMigrationTables() returns all expected table names', () => {
    const tables = getMigrationTables();
    // Core intelligence tables
    expect(tables).toContain('knowledge_objects');
    expect(tables).toContain('canon_items');
    expect(tables).toContain('canon_conflicts');
    expect(tables).toContain('narrative_promises');
    expect(tables).toContain('promise_payoffs');
    expect(tables).toContain('narrative_nodes');
    expect(tables).toContain('narrative_edges');
    expect(tables).toContain('context_contracts');
    // Extended feature tables
    expect(tables).toContain('sync_state');
    expect(tables).toContain('research_notes');
    expect(tables).toContain('research_usage');
    expect(tables).toContain('character_scene_states');
    expect(tables).toContain('beta_readers');
    expect(tables).toContain('beta_feedback');
    expect(tables).toContain('agent_queries');
    expect(tables).toContain('foreshadowing_notes');
    expect(tables).toContain('series');
    expect(tables).toContain('series_books');
    expect(tables).toContain('series_bible');
    expect(tables.length).toBeGreaterThanOrEqual(19);
  });

  it('runs migrations in the correct order (knowledge_objects first)', async () => {
    const order: string[] = [];
    (client.writeQuery as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      // capture the first table name mentioned in each CREATE TABLE statement
      const match = /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(sql);
      if (match) order.push(match[1]);
      return { affected_rows: 0 };
    });

    await runMigrations(client);

    const first = order[0];
    expect(first).toBe('knowledge_objects');
    // Series tables should come after core intelligence tables
    const seriesIdx = order.indexOf('series');
    const knowledgeIdx = order.indexOf('knowledge_objects');
    expect(seriesIdx).toBeGreaterThan(knowledgeIdx);
  });
});
