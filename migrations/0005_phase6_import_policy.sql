-- Phase6: import policy, canonical import batches, and app-wide operation settings.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('billing_month_policy', 'payment_month', 'billing_month means the actual payment/debit month'),
  ('card_billing_auto_only_when_missing', 'true', 'CSV billing_month value wins; auto calculation is used only when missing'),
  ('canonical_expense_source', 'kakeibo_all', 'kakeibo_all CSV is treated as the canonical expense source'),
  ('mortgage_schedule_source', 'mortgage_schedule_1_19', 'Mortgage amortization CSV import source'),
  ('owner_display_en', 'role', 'role=Husband/Wife, names=Toshi/Lisa');

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  target TEXT NOT NULL CHECK(target IN ('expenses', 'assets', 'mortgage', 'other')),
  target_month TEXT,
  source_file TEXT,
  mode TEXT NOT NULL DEFAULT 'append' CHECK(mode IN ('append', 'replace_imported')),
  status TEXT NOT NULL DEFAULT 'committed',
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  replaced_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE expense_import_keys ADD COLUMN import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE expense_import_keys ADD COLUMN source_file TEXT;
ALTER TABLE expense_import_keys ADD COLUMN target_month TEXT;
CREATE INDEX IF NOT EXISTS idx_expense_import_keys_source_month ON expense_import_keys(source, target_month);
CREATE INDEX IF NOT EXISTS idx_expense_import_keys_batch ON expense_import_keys(import_batch_id);

ALTER TABLE asset_import_keys ADD COLUMN import_source TEXT NOT NULL DEFAULT 'asset_csv';
ALTER TABLE asset_import_keys ADD COLUMN import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE asset_import_keys ADD COLUMN source_file TEXT;
CREATE INDEX IF NOT EXISTS idx_asset_import_keys_source_key ON asset_import_keys(import_source, setting_key);
CREATE INDEX IF NOT EXISTS idx_asset_import_keys_batch ON asset_import_keys(import_batch_id);
