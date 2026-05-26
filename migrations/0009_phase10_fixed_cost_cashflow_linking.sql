-- Phase10: fixed cost editing, non-card payment linking, and analytics hardening.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

ALTER TABLE fixed_costs ADD COLUMN paid_by TEXT NOT NULL DEFAULT 'toshi';
ALTER TABLE fixed_costs ADD COLUMN burden_owner TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE fixed_costs ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE fixed_costs ADD COLUMN category TEXT NOT NULL DEFAULT 'fixed_cost';
ALTER TABLE fixed_costs ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE fixed_costs ADD COLUMN due_date TEXT;

ALTER TABLE fixed_cost_snapshots ADD COLUMN paid_by TEXT;
ALTER TABLE fixed_cost_snapshots ADD COLUMN burden_owner TEXT;
ALTER TABLE fixed_cost_snapshots ADD COLUMN payment_due_date TEXT;
ALTER TABLE fixed_cost_snapshots ADD COLUMN synced_expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_costs_paid_burden ON fixed_costs(paid_by, burden_owner);
CREATE INDEX IF NOT EXISTS idx_fixed_costs_account ON fixed_costs(account_id);
CREATE INDEX IF NOT EXISTS idx_fcs_synced_expense ON fixed_cost_snapshots(synced_expense_id);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('fixed_costs_link_to_expenses', 'true', 'Fixed cost tab can sync current-month fixed cost snapshots into expenses idempotently'),
  ('scheduled_payments_feed_cashflow', 'true', 'Card-external recurring and irregular payments feed dashboard and analytics cashflow'),
  ('analysis_monthly_trend_basis', 'cycle_month', 'Analytics trend is grouped by the 25-to-24 budget cycle month');
