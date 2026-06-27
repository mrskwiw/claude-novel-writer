CREATE TABLE IF NOT EXISTS context_contracts (
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
);
