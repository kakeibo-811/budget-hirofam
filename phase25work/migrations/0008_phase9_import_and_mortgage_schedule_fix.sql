-- Phase9: robust CSV import and full mortgage schedule management through payoff.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

CREATE TABLE IF NOT EXISTS mortgage_schedule_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_source TEXT NOT NULL DEFAULT 'mortgage_schedule_1_19',
  payment_date TEXT NOT NULL,
  starting_balance INTEGER,
  interest INTEGER,
  payment INTEGER,
  principal INTEGER,
  ending_balance INTEGER NOT NULL,
  final_payment TEXT,
  asset_event_id INTEGER REFERENCES asset_events(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_source, payment_date)
);
CREATE INDEX IF NOT EXISTS idx_mortgage_schedule_rows_source_date ON mortgage_schedule_rows(schedule_source, payment_date);
CREATE INDEX IF NOT EXISTS idx_mortgage_schedule_rows_event ON mortgage_schedule_rows(asset_event_id);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('mortgage_schedule_full_management', 'true', 'Mortgage schedule CSV is stored through payoff and mirrored into home_loan value_update events'),
  ('mortgage_expected_payoff_month', '2051-05', 'Expected payoff month for the imported 1.19% mortgage schedule'),
  ('expense_import_card_aliases_enabled', 'true', 'JALCard/Amazon Card/Marriott Amex aliases are accepted on CSV import');
