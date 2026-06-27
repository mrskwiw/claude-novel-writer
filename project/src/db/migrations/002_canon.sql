CREATE TABLE IF NOT EXISTS canon_items (
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
);

CREATE TABLE IF NOT EXISTS canon_conflicts (
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
);

CREATE INDEX IF NOT EXISTS idx_canon_project_subject
ON canon_items(project_id, subject);

CREATE INDEX IF NOT EXISTS idx_canon_project_type
ON canon_items(project_id, type);

CREATE INDEX IF NOT EXISTS idx_canon_conflicts_project
ON canon_conflicts(project_id, status);
