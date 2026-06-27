CREATE TABLE IF NOT EXISTS narrative_promises (
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
);

CREATE TABLE IF NOT EXISTS promise_payoffs (
  id TEXT PRIMARY KEY,
  promise_id TEXT NOT NULL,
  payoff_at TEXT NOT NULL,
  description TEXT NOT NULL,
  payoff_strength INTEGER NOT NULL,
  resolves_promise INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promises_project_status
ON narrative_promises(project_id, status);

CREATE INDEX IF NOT EXISTS idx_payoffs_promise
ON promise_payoffs(promise_id);
