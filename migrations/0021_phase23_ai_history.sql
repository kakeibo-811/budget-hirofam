-- Phase23: AI assistant request history.

CREATE TABLE IF NOT EXISTS ai_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  mode TEXT NOT NULL,
  question TEXT,
  answer TEXT NOT NULL,
  model TEXT NOT NULL,
  configured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_history_created
  ON ai_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_history_month_mode
  ON ai_history(month, mode, created_at DESC);
