-- Phase17: shared bulk operations and import-month deletion audit.
-- Safe additions only. No destructive changes.

CREATE TABLE IF NOT EXISTS bulk_operation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  operation TEXT NOT NULL,
  ids_json TEXT,
  fields_json TEXT,
  affected_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bulk_operation_log_entity ON bulk_operation_log(entity, created_at DESC);

ALTER TABLE incomes ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_incomes_archived ON incomes(archived_at);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('bulk_operations_enabled', 'true', 'Major tabs support shared bulk update/delete operations with confirm=true and audit logging'),
  ('expense_import_delete_by_month_enabled', 'true', 'Imported expense rows can be archived by source and target month'),
  ('sort_order_toggle_enabled', 'true', 'List screens can request ascending or descending order');
