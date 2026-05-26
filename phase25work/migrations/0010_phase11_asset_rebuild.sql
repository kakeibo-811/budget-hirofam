-- Phase11: rebuild Assets/Liabilities as an auditable monthly plan.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

CREATE TABLE IF NOT EXISTS asset_rebuild_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_rebuild_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  target TEXT NOT NULL CHECK(target IN ('repair_reserve','loan_toshi','loan_lisa','home_loan','stocks_value','stocks_pl')),
  event_type TEXT NOT NULL CHECK(event_type IN ('repair_deposit','repair_spend','loan_extra_repayment','loan_drawdown','balance_adjustment','mortgage_balance_update','stock_value_update','stock_profit_update')),
  amount INTEGER NOT NULL,
  paid_by TEXT CHECK(paid_by IN ('toshi','lisa','shared','other')),
  burden_owner TEXT CHECK(burden_owner IN ('toshi','lisa','shared','other')),
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  note TEXT,
  source_type TEXT,
  source_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_rebuild_events_date ON asset_rebuild_events(event_date);
CREATE INDEX IF NOT EXISTS idx_asset_rebuild_events_target ON asset_rebuild_events(target, event_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_rebuild_events_source_key ON asset_rebuild_events(source_type, source_key) WHERE source_type IS NOT NULL AND source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS asset_rebuild_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,
  from_month TEXT NOT NULL,
  to_month TEXT NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO asset_rebuild_settings (key, value, note) VALUES
  ('plan_start_date', '2026-05-25', 'First month-end date for the rebuilt asset/liability plan'),
  ('projection_end_month', '2051-05', 'Mortgage payoff plan should be managed through this month'),
  ('repair_reserve_start_balance', '393668', 'Repair reserve starting balance'),
  ('repair_reserve_monthly_deposit', '130000', 'Monthly repair reserve saving on loan payment date'),
  ('mortgage_start_balance', '38970413', 'Mortgage starting balance'),
  ('mortgage_monthly_payment', '150263', 'Monthly mortgage payment'),
  ('mortgage_interest_rate', '1.19', 'Annual fixed mortgage rate percent'),
  ('loan_toshi_start_balance', '924213', 'Loan balance owed by Husband to repair reserve'),
  ('loan_lisa_start_balance', '164045', 'Loan balance owed by Wife to repair reserve'),
  ('loan_toshi_monthly_repayment', '10000', 'Monthly Husband loan repayment'),
  ('loan_lisa_monthly_repayment', '10000', 'Monthly Wife loan repayment'),
  ('loan_repayment_day', '25', 'Monthly loan repayment and repair saving date'),
  ('asset_rebuild_model', 'repair_reserve_lends_to_husband_wife', 'Repair reserve is the fund; Husband/Wife loans are receivables repaid monthly'),
  ('asset_rebuild_active', 'true', 'Use Phase11 rebuilt asset/liability model');

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('asset_liability_rebuild_phase', 'phase11', 'Assets/Liabilities tab is rebuilt around mortgage schedule, repair reserve, and Husband/Wife loan repayment linkage'),
  ('asset_loan_repayment_links_expenses', 'true', 'Monthly loan repayments can be synced to expenses idempotently'),
  ('asset_projection_end_month', '2051-05', 'Asset projection should cover mortgage payoff planning through 2051');
