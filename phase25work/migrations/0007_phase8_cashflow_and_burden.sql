-- Phase8: cashflow monitoring, non-card scheduled payments, and burden-vs-paid-by accuracy.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

ALTER TABLE expenses ADD COLUMN paid_by TEXT;
ALTER TABLE expenses ADD COLUMN burden_owner TEXT;
ALTER TABLE expenses ADD COLUMN settlement_role TEXT;

-- Backfill: existing payer was historically used as the responsibility owner.
UPDATE expenses
SET burden_owner = COALESCE(NULLIF(burden_owner, ''), payer)
WHERE burden_owner IS NULL OR burden_owner = '';

-- Existing card imports are usually paid/advanced by Husband. Non-card rows keep their payer.
UPDATE expenses
SET paid_by = COALESCE(NULLIF(paid_by, ''), CASE WHEN card_id IS NOT NULL THEN 'toshi' ELSE payer END)
WHERE paid_by IS NULL OR paid_by = '';

CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_burden_owner ON expenses(burden_owner);

ALTER TABLE cards ADD COLUMN card_kind TEXT NOT NULL DEFAULT 'credit';
ALTER TABLE cards ADD COLUMN default_burden_owner TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE cards ADD COLUMN default_paid_by TEXT NOT NULL DEFAULT 'toshi';
ALTER TABLE cards ADD COLUMN billing_rule TEXT NOT NULL DEFAULT 'payment_month';
ALTER TABLE cards ADD COLUMN rule_note TEXT;

CREATE TABLE IF NOT EXISTS scheduled_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly', -- monthly / once / yearly / irregular
  due_day INTEGER,
  due_month INTEGER,
  due_date TEXT,
  paid_by TEXT NOT NULL DEFAULT 'toshi',       -- actual cash/card payer
  burden_owner TEXT NOT NULL DEFAULT 'shared', -- toshi / lisa / shared / other
  split INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_payments_active ON scheduled_payments(active, archived_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_owner ON scheduled_payments(paid_by, burden_owner);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_due ON scheduled_payments(due_date, due_month, due_day);

CREATE TABLE IF NOT EXISTS operation_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_text TEXT NOT NULL,
  parsed_action TEXT,
  preview_json TEXT,
  status TEXT NOT NULL DEFAULT 'preview', -- preview / committed / rejected / unsupported
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT
);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('cashflow_monitoring_enabled', 'true', 'Dashboard and analytics monitor whether accounts will short before the next cycle ends'),
  ('expense_payer_meaning', 'burden_owner', 'In canonical kakeibo_all imports, CSV payer means who should bear the cost; actual paid_by defaults to Husband'),
  ('wife_transfer_dashboard_primary', 'true', 'First dashboard highlights Wife -> Husband transfer due by month end');
