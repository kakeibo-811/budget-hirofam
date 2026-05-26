-- Expense CSV import idempotency keys
-- Prevents duplicate import when the same April actuals CSV is committed more than once.
CREATE TABLE IF NOT EXISTS expense_import_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'csv',
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expense_import_keys_expense ON expense_import_keys(expense_id);
