-- Phase7: salary-cycle dashboard and canonical kakeibo_all import accuracy.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('budget_cycle_start_day', '25', 'Budget month starts on day 25 and ends on day 24 of next month'),
  ('dashboard_settlement_model', 'husband_advances_wife_personal_and_split', 'Husband advances wife personal expenses and split household expenses; dashboard shows Wife -> Husband amount'),
  ('kakeibo_all_month_policy', 'cycle_25_to_24', 'kakeibo_all is canonical; expense date is actual payment/debit date, and cycle_month is day25-day24 month');

ALTER TABLE expenses ADD COLUMN payment_due_date TEXT;
ALTER TABLE expenses ADD COLUMN cycle_month TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_cycle_month ON expenses(cycle_month);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_due_date ON expenses(payment_due_date);

-- Backfill existing rows so old imports are visible in the new salary-cycle dashboard.
-- If payment_due_date is unknown, the expense date is treated as the actual debit/payment date.
UPDATE expenses
SET cycle_month = CASE
  WHEN CAST(strftime('%d', COALESCE(payment_due_date, date)) AS INTEGER) >= 25 THEN strftime('%Y-%m', COALESCE(payment_due_date, date))
  ELSE strftime('%Y-%m', date(COALESCE(payment_due_date, date), 'start of month', '-1 month'))
END
WHERE cycle_month IS NULL OR cycle_month = '';
