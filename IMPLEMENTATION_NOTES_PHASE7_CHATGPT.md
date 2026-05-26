# Phase7: Dashboard and canonical kakeibo_all cycle policy

Production was not touched by ChatGPT. Deploy only to Cloudflare preview.

## Key fixes

- Dashboard now reflects the real household workflow:
  - Husband advances Wife's personal household expenses and split household expenses.
  - The most important dashboard number is how much Wife should pay Husband by month end.
  - The selected month is the salary-cycle month from the 25th through the 24th of the following month.
- `kakeibo_all` is treated as canonical data.
  - Its `date` is treated as the actual payment/debit date.
  - `cycle_month` is calculated by the 25th-to-24th rule.
  - Payer value `折半` is normalized to `shared`.
- Expenses now have `payment_due_date` and `cycle_month` columns.
- The Expenses screen shows both budget/cycle month and billing/payment month.
- The tab menu default order is more intuitive, and tabs can be drag-reordered locally.

## New migration

- `migrations/0006_phase7_cycle_dashboard_policy.sql`

## Safety notes

- No DROP TABLE.
- No DELETE without WHERE.
- Preview only.
- `wrangler.toml` keeps `env.DB` and `env.ASSETS`.
