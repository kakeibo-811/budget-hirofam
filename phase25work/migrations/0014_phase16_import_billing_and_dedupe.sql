-- Phase16: dashboard de-duplication policy and manual billing-month CSV import controls.
-- Safe metadata only. No destructive changes.

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('dashboard_actuals_override_plans', 'true', 'Overview excludes fixed/scheduled plans that match actual expenses in the same month to prevent double counting'),
  ('expense_import_manual_billing_month_before_commit', 'true', 'CSV import preview allows manual billing_month / cycle_month / payment_due_date edits before commit'),
  ('expense_import_per_card_mode', 'true', 'CSV import can force a selected card for all rows when importing card-specific statements'),
  ('asset_setting_alias_sync', 'true', 'Asset rebuild settings sync legacy aliases such as monthly_repair_saving to repair_reserve_monthly_deposit');
