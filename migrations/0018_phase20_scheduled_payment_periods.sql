-- Phase20: scheduled payment active periods.
-- Safe additions only. No DROP TABLE. No DELETE without WHERE.

ALTER TABLE scheduled_payments ADD COLUMN active_from_month TEXT;
ALTER TABLE scheduled_payments ADD COLUMN active_to_month TEXT;

CREATE INDEX IF NOT EXISTS idx_scheduled_payments_active_period
  ON scheduled_payments(active_from_month, active_to_month);
