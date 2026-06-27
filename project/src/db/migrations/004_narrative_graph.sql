CREATE TABLE IF NOT EXISTS narrative_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT,
  source_id TEXT,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS narrative_edges (
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
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_project_type
ON narrative_nodes(project_id, type);

CREATE INDEX IF NOT EXISTS idx_graph_edges_from
ON narrative_edges(project_id, from_node_id);

CREATE INDEX IF NOT EXISTS idx_graph_edges_to
ON narrative_edges(project_id, to_node_id);

CREATE INDEX IF NOT EXISTS idx_graph_edges_type
ON narrative_edges(project_id, type);
