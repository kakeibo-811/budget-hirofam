-- Phase19: editable app rules and clearer dashboard/future-cost controls.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('dashboard_card_fixed_split_explained', 'true', 'Dashboard explicitly separates actual card/non-card expenses from fixed and scheduled plans.'),
  ('dashboard_editable_rules_enabled', 'true', 'Safe app behavior settings can be edited from the Settings tab.'),
  ('asset_future_cost_editor_enabled', 'true', 'Assets/Liabilities tab can edit scheduled future costs that feed the projection.');
