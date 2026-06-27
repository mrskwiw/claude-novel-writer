CREATE TABLE IF NOT EXISTS knowledge_objects (
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
);

CREATE INDEX IF NOT EXISTS idx_knowledge_project
ON knowledge_objects(project_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_project_type
ON knowledge_objects(project_id, type);

CREATE INDEX IF NOT EXISTS idx_knowledge_context
ON knowledge_objects(project_id, context_eligible);
