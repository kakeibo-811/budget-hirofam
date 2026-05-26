-- Phase14 all-in-one: shared repair reserve account, settlement adjustments,
-- embedded messages, wife manual support, investment holdings, and dashboard hardening.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

CREATE TABLE IF NOT EXISTS settlement_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'lisa_to_toshi', -- lisa_to_toshi / toshi_to_lisa / none
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  note TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_settlement_adjustments_month ON settlement_adjustments(month, archived_at);

CREATE TABLE IF NOT EXISTS investment_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT,
  market TEXT DEFAULT 'TYO',
  owner TEXT NOT NULL DEFAULT 'shared' CHECK(owner IN ('toshi','lisa','shared','other')),
  quantity REAL NOT NULL DEFAULT 0,
  average_cost REAL,
  manual_price REAL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  note TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_investment_holdings_owner ON investment_holdings(owner, archived_at);
CREATE INDEX IF NOT EXISTS idx_investment_holdings_symbol ON investment_holdings(symbol, market, archived_at);

CREATE TABLE IF NOT EXISTS investment_price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holding_id INTEGER REFERENCES investment_holdings(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market TEXT,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  source TEXT NOT NULL DEFAULT 'manual',
  as_of TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_investment_price_snapshots_holding ON investment_price_snapshots(holding_id, as_of DESC);

ALTER TABLE messages ADD COLUMN read_at TEXT;
ALTER TABLE messages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_active_month ON messages(month, archived_at, created_at DESC);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('shared_account_meaning', 'repair_reserve_account', 'The shared account is treated as the repair reserve savings account'),
  ('repair_reserve_scheduled_payments_affect_asset_plan', 'true', 'Earthquake insurance, fire insurance, property tax and repair spending affect repair reserve projection'),
  ('messages_embedded_under_transfer', 'true', 'Message board is shown below the Wife to Husband transfer card and removed from the tab bar'),
  ('wife_manual_primary_use', 'csv_import_and_transfer_check', 'Manual focuses on importing card CSV and checking how much Wife should pay Husband'),
  ('investment_summary_enabled', 'true', 'Investment holdings can be entered manually and optionally refreshed by external quote data'),
  ('yahoo_quote_source_note', 'experimental', 'External quote lookup is best-effort and manual price remains authoritative if unavailable');

-- Seed typical repair-reserve-funded annual payments as editable scheduled payments.
INSERT INTO scheduled_payments (name, amount, frequency, due_day, due_month, paid_by, burden_owner, split, category, active, note, sort_order)
SELECT '固定資産税', 500000, 'yearly', 25, 6, 'shared', 'shared', 1, 'property_tax', 1, '修繕積立金/共同口座から支払う想定。金額・月は固定費/その他支払で編集可能。', 100
WHERE NOT EXISTS (SELECT 1 FROM scheduled_payments WHERE name = '固定資産税' AND category = 'property_tax' AND archived_at IS NULL);

INSERT INTO scheduled_payments (name, amount, frequency, due_day, due_month, paid_by, burden_owner, split, category, active, note, sort_order)
SELECT '地震保険', 100000, 'yearly', 25, 6, 'shared', 'shared', 1, 'earthquake_insurance', 1, '修繕積立金/共同口座から支払う想定。資産負債の月次計画にも反映。', 110
WHERE NOT EXISTS (SELECT 1 FROM scheduled_payments WHERE name = '地震保険' AND category = 'earthquake_insurance' AND archived_at IS NULL);

INSERT INTO scheduled_payments (name, amount, frequency, due_day, due_month, paid_by, burden_owner, split, category, active, note, sort_order)
SELECT '火災保険', 300000, 'irregular', 25, 6, 'shared', 'shared', 1, 'fire_insurance', 1, '5年に1回想定。次回支払日は固定費/その他支払で必要に応じて調整。', 120
WHERE NOT EXISTS (SELECT 1 FROM scheduled_payments WHERE name = '火災保険' AND category = 'fire_insurance' AND archived_at IS NULL);

INSERT OR IGNORE INTO asset_rebuild_settings (key, value, note) VALUES
  ('repair_reserve_account_owner', 'shared', 'Shared account is the repair reserve bank account'),
  ('repair_reserve_deduct_scheduled_categories', 'property_tax,earthquake_insurance,fire_insurance,repair_spend', 'Scheduled payment categories deducted from repair reserve monthly plan');
