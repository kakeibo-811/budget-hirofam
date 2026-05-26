-- Phase21: fixed cost active periods and manual expense payment method.

ALTER TABLE fixed_costs ADD COLUMN active_from_month TEXT;
ALTER TABLE fixed_costs ADD COLUMN active_to_month TEXT;

ALTER TABLE expenses ADD COLUMN payment_method TEXT;

CREATE INDEX IF NOT EXISTS idx_fixed_costs_active_period
  ON fixed_costs(active_from_month, active_to_month);

CREATE INDEX IF NOT EXISTS idx_expenses_payment_method
  ON expenses(payment_method);
