-- Phase18: income/settlement editability, graph UI support, and soft design hardening.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

ALTER TABLE incomes ADD COLUMN archived_at TEXT;
ALTER TABLE incomes ADD COLUMN updated_at TEXT;
UPDATE incomes SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_incomes_active_month ON incomes(date, owner, archived_at);

ALTER TABLE recurring_incomes ADD COLUMN archived_at TEXT;
ALTER TABLE recurring_incomes ADD COLUMN updated_at TEXT;
UPDATE recurring_incomes SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_incomes_active ON recurring_incomes(active, archived_at, owner, pay_day);

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('phase18_income_edit_delete_enabled', 'true', 'Income rows and recurring incomes can be edited/deleted from the UI.'),
  ('phase18_settlement_adjustment_edit_enabled', 'true', 'Settlement manual adjustments can be edited/deleted from the UI.'),
  ('phase18_analytics_visual_graphs_enabled', 'true', 'Analytics tab shows SVG trend and stacked monthly graphs.'),
  ('phase18_soft_round_design_enabled', 'true', 'Rounded and softer visual design is enabled.');
