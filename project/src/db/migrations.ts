/**
 * Database migrations for Phase 1 intelligence features.
 * SQL is embedded here so the module resolves identically in vitest (ESM source mode)
 * and in the compiled dist/ output — no __dirname / import.meta.url path gymnastics needed.
 */

import type { MCPClient } from '../core/database.js';

interface Migration {
  id: string;
  sql: string[];
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_knowledge_objects',
    sql: [
      `CREATE TABLE IF NOT EXISTS knowledge_objects (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        body TEXT,
        structured_data TEXT NOT NULL,
        scope TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        context_eligible INTEGER NOT NULL,
        graph_eligible INTEGER NOT NULL,
        embedding_eligible INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_objects(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_project_type ON knowledge_objects(project_id, type)`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_context ON knowledge_objects(project_id, context_eligible)`,
    ],
  },
  {
    id: '002_canon',
    sql: [
      `CREATE TABLE IF NOT EXISTS canon_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        strength TEXT NOT NULL,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT,
        description TEXT NOT NULL,
        scope TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        valid_from TEXT,
        valid_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS canon_conflicts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        item_a TEXT NOT NULL,
        item_b TEXT NOT NULL,
        conflict_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        explanation TEXT NOT NULL,
        recommended_resolution TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_canon_project_subject ON canon_items(project_id, subject)`,
      `CREATE INDEX IF NOT EXISTS idx_canon_project_type ON canon_items(project_id, type)`,
      `CREATE INDEX IF NOT EXISTS idx_canon_conflicts_project ON canon_conflicts(project_id, status)`,
    ],
  },
  {
    id: '003_promises',
    sql: [
      `CREATE TABLE IF NOT EXISTS narrative_promises (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        introduced_at TEXT NOT NULL,
        expected_payoff_window TEXT,
        importance INTEGER NOT NULL,
        reader_visibility INTEGER NOT NULL,
        related_characters TEXT NOT NULL,
        related_plot_threads TEXT NOT NULL,
        related_themes TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS promise_payoffs (
        id TEXT PRIMARY KEY,
        promise_id TEXT NOT NULL,
        payoff_at TEXT NOT NULL,
        description TEXT NOT NULL,
        payoff_strength INTEGER NOT NULL,
        resolves_promise INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_promises_project_status ON narrative_promises(project_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_payoffs_promise ON promise_payoffs(promise_id)`,
    ],
  },
  {
    id: '004_narrative_graph',
    sql: [
      `CREATE TABLE IF NOT EXISTS narrative_nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        summary TEXT,
        source_id TEXT,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS narrative_edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT,
        weight REAL NOT NULL,
        source TEXT,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_graph_nodes_project_type ON narrative_nodes(project_id, type)`,
      `CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON narrative_edges(project_id, from_node_id)`,
      `CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON narrative_edges(project_id, to_node_id)`,
      `CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON narrative_edges(project_id, type)`,
    ],
  },
  {
    id: '005_context_contracts',
    sql: [
      `CREATE TABLE IF NOT EXISTS context_contracts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        required TEXT NOT NULL,
        optional TEXT NOT NULL,
        max_tokens INTEGER NOT NULL,
        ordering_policy TEXT NOT NULL,
        truncation_policy TEXT NOT NULL,
        deterministic INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    id: '006_sync_state',
    sql: [
      `CREATE TABLE IF NOT EXISTS sync_state (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        file_path TEXT,
        PRIMARY KEY (entity_type, entity_id)
      )`,
    ],
  },
  {
    id: '008_emotional_beat',
    sql: [
      `ALTER TABLE scenes ADD COLUMN emotional_beat TEXT`,
    ],
  },
  {
    id: '009_character_scene_states',
    sql: [
      `CREATE TABLE IF NOT EXISTS character_scene_states (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        character_id INTEGER NOT NULL,
        scene_id INTEGER NOT NULL,
        state TEXT NOT NULL,
        notes TEXT,
        recorded_at TEXT NOT NULL,
        UNIQUE(character_id, scene_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_css_project ON character_scene_states(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_css_character ON character_scene_states(character_id)`,
    ],
  },
  {
    id: '007_research',
    sql: [
      `CREATE TABLE IF NOT EXISTS research_notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        notes TEXT,
        tags TEXT DEFAULT '[]',
        verified INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS research_usage (
        id TEXT PRIMARY KEY,
        research_id TEXT NOT NULL REFERENCES research_notes(id),
        chapter_id INTEGER,
        scene_id INTEGER,
        note TEXT,
        linked_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_research_project ON research_notes(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_research_usage_research ON research_usage(research_id)`,
    ],
  },
  {
    id: '010_beta_readers',
    sql: [
      `CREATE TABLE IF NOT EXISTS beta_readers (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        chapters TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        invited_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS beta_feedback (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        reader_id TEXT NOT NULL REFERENCES beta_readers(id),
        chapter_id INTEGER,
        feedback_type TEXT NOT NULL,
        note TEXT NOT NULL,
        resolved INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_beta_readers_project ON beta_readers(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_beta_feedback_project ON beta_feedback(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_beta_feedback_reader ON beta_feedback(reader_id)`,
    ],
  },
  {
    id: '011_agent_queries',
    sql: [
      `CREATE TABLE IF NOT EXISTS agent_queries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        agency TEXT,
        query_date TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        response_date TEXT,
        notes TEXT,
        materials_sent TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_agent_queries_project ON agent_queries(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_queries_status ON agent_queries(project_id, status)`,
    ],
  },
  {
    id: '012_session_timer',
    sql: [
      `ALTER TABLE writing_sessions ADD COLUMN timer_minutes INTEGER`,
    ],
  },
  {
    id: '013_foreshadowing',
    sql: [
      `CREATE TABLE IF NOT EXISTS foreshadowing_notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        chapter_id INTEGER,
        scene_id INTEGER,
        content TEXT NOT NULL,
        payoff_chapter_id INTEGER,
        status TEXT DEFAULT 'planted',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_foreshadow_project ON foreshadowing_notes(project_id)`,
    ],
  },
  {
    id: '015_plot_file_path',
    sql: [
      `ALTER TABLE plot_threads ADD COLUMN file_path TEXT`,
    ],
  },
  {
    id: '016_scene_beats',
    sql: [
      `CREATE TABLE IF NOT EXISTS scene_beats (
        id INTEGER PRIMARY KEY,
        scene_id INTEGER NOT NULL,
        beat_number INTEGER NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
        UNIQUE(scene_id, beat_number)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scene_beats_scene ON scene_beats(scene_id)`,
    ],
  },
  {
    id: '014_series',
    sql: [
      `CREATE TABLE IF NOT EXISTS series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS series_books (
        series_id TEXT NOT NULL REFERENCES series(id),
        project_id TEXT NOT NULL,
        book_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        PRIMARY KEY (series_id, project_id)
      )`,
      `CREATE TABLE IF NOT EXISTS series_bible (
        id TEXT PRIMARY KEY,
        series_id TEXT NOT NULL REFERENCES series(id),
        category TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        value TEXT NOT NULL,
        notes TEXT,
        applies_to_books TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(series_id, category, entry_key)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_series_bible ON series_bible(series_id, category)`,
      `CREATE INDEX IF NOT EXISTS idx_series_books ON series_books(series_id)`,
    ],
  },
];

const EXPECTED_TABLES = [
  'knowledge_objects',
  'canon_items',
  'canon_conflicts',
  'narrative_promises',
  'promise_payoffs',
  'narrative_nodes',
  'narrative_edges',
  'context_contracts',
  'sync_state',
  'research_notes',
  'research_usage',
  'character_scene_states',
  'beta_readers',
  'beta_feedback',
  'agent_queries',
  'foreshadowing_notes',
  'series',
  'series_books',
  'series_bible',
] as const;

export type MigrationTable = (typeof EXPECTED_TABLES)[number];

/**
 * Run all Phase 1 migrations against the given MCPClient.
 * Every statement uses CREATE TABLE/INDEX IF NOT EXISTS, so this is safe to call
 * on an already-migrated database — it is a no-op after the first run.
 */
export async function runMigrations(client: MCPClient): Promise<void> {
  for (const migration of MIGRATIONS) {
    for (const statement of migration.sql) {
      try {
        await client.writeQuery(statement);
      } catch (err) {
        const msg = String(err);
        // ALTER TABLE ADD COLUMN is not idempotent in SQLite — ignore duplicate-column errors
        if (/ALTER TABLE/i.test(statement) && /duplicate column/i.test(msg)) continue;
        throw new Error(
          `Migration ${migration.id} failed on statement:\n${statement}\nCause: ${msg}`
        );
      }
    }
  }
}

/**
 * Returns the list of Phase 1 tables that runMigrations() is responsible for.
 * Useful in tests to verify the schema was applied.
 */
export function getMigrationTables(): readonly string[] {
  return EXPECTED_TABLES;
}
