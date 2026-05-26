-- Phase15: repair reserve scheduled-payment hardening.
-- Adds 3-year/5-year recurrence, explicit repair-reserve deduction labels,
-- and keeps fire/earthquake/property-tax payments linked to the repair reserve plan.

ALTER TABLE scheduled_payments ADD COLUMN interval_years INTEGER;
ALTER TABLE scheduled_payments ADD COLUMN recurrence_start_year INTEGER;

-- Backfill recurrence metadata. These UPDATEs are safe and scoped.
UPDATE scheduled_payments
SET interval_years = CASE
  WHEN frequency = 'every_3_years' THEN 3
  WHEN frequency = 'every_5_years' THEN 5
  ELSE interval_years
END
WHERE archived_at IS NULL
  AND frequency IN ('every_3_years','every_5_years');

UPDATE scheduled_payments
SET recurrence_start_year = CASE
  WHEN due_date IS NOT NULL AND length(due_date) >= 4 THEN CAST(substr(due_date, 1, 4) AS INTEGER)
  WHEN recurrence_start_year IS NULL THEN 2026
  ELSE recurrence_start_year
END
WHERE archived_at IS NULL
  AND frequency IN ('every_3_years','every_5_years');

-- Fire insurance is funded by the repair reserve and recurs every 5 years by default.
UPDATE scheduled_payments
SET frequency = 'every_5_years',
    interval_years = 5,
    recurrence_start_year = COALESCE(recurrence_start_year, 2026),
    due_month = COALESCE(due_month, 6),
    due_day = COALESCE(due_day, 25),
    paid_by = 'shared',
    burden_owner = 'shared',
    split = 1,
    category = 'fire_insurance',
    note = COALESCE(note, 'Fire insurance paid from repair reserve / shared account every 5 years.'),
    updated_at = CURRENT_TIMESTAMP
WHERE archived_at IS NULL
  AND (category = 'fire_insurance' OR name LIKE '%火災保険%');

-- Earthquake insurance and property tax are yearly repair-reserve deductions.
UPDATE scheduled_payments
SET frequency = 'yearly',
    paid_by = 'shared',
    burden_owner = 'shared',
    split = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE archived_at IS NULL
  AND category IN ('earthquake_insurance','property_tax');

INSERT OR IGNORE INTO app_settings (key, value, note) VALUES
  ('phase15_repair_reserve_deduction_labels', 'true', 'Asset monthly plan explicitly shows repair-reserve-funded insurance/tax months'),
  ('scheduled_payment_frequency_every_3_5_years', 'true', 'Scheduled payments support every_3_years and every_5_years recurrence');
