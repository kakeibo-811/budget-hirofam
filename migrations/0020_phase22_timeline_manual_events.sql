-- Phase22: timeline-only manual events and suppressions.

CREATE TABLE IF NOT EXISTS timeline_manual_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  owner TEXT NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'payment',
  label TEXT NOT NULL,
  note TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_timeline_manual_events_date
  ON timeline_manual_events(event_date, owner, archived_at);

CREATE TABLE IF NOT EXISTS timeline_event_suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL,
  source TEXT,
  label TEXT,
  event_date TEXT,
  owner TEXT,
  amount INTEGER,
  note TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_event_suppressions_active_key
  ON timeline_event_suppressions(event_key)
  WHERE archived_at IS NULL;
