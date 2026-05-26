-- ============================================================
-- Asset CSV import idempotency keys
-- CSV取り込みの確定登録を複数回押しても、同じイベントを二重作成しないためのキー。
-- DROP TABLEは禁止。既存データは破壊しない。
-- ============================================================

CREATE TABLE IF NOT EXISTS asset_import_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_key TEXT NOT NULL UNIQUE,
  event_id INTEGER REFERENCES asset_events(id) ON DELETE SET NULL,
  setting_key TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_import_keys_event ON asset_import_keys(event_id);
CREATE INDEX IF NOT EXISTS idx_asset_import_keys_date ON asset_import_keys(event_date);
