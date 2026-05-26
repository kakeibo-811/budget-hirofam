-- Phase12: expense edit/delete/manual payment-date operations.
-- Safe additions only. No DROP TABLE. DELETE without WHERE remains forbidden in app helpers.

ALTER TABLE expenses ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_archived ON expenses(archived_at);
CREATE INDEX IF NOT EXISTS idx_expenses_active_cycle ON expenses(archived_at, cycle_month);
CREATE INDEX IF NOT EXISTS idx_expenses_active_billing ON expenses(archived_at, billing_month);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('expense_manual_payment_date_enabled', 'true', 'Imported card expense payment_due_date can be edited manually; cycle_month follows payment_due_date'),
  ('expense_edit_delete_sync_policy', 'active_expenses_only', 'Dashboard, settlement, analytics and exports ignore archived expenses after edit/delete operations');
