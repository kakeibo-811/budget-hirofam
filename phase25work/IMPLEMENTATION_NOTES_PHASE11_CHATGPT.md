# Phase11: Asset/Liability Rebuild + Linked Repayments

Production was not touched. This package is intended for Preview only.

## Main changes

- Rebuilt the Assets/Liabilities tab around the actual operating model:
  - mortgage balance and repayment plan through 2051
  - mortgage monthly payment: 150,263 JPY
  - monthly repair reserve saving: 130,000 JPY
  - repair reserve lends money to Husband/Wife, and those loan balances are repaid monthly
  - Husband loan monthly repayment: 10,000 JPY
  - Wife loan monthly repayment: 10,000 JPY
- Added Phase11 safe migration `0010_phase11_asset_rebuild.sql`.
- Added auditable tables:
  - `asset_rebuild_settings`
  - `asset_rebuild_events`
  - `asset_rebuild_sync_runs`
- Replaced the old asset route implementation with a focused rebuilt model.
- Added direct import support for mortgage schedule CSV in the Assets tab.
- Added idempotent loan repayment sync to the Expenses tab via `ledger_links`.
- Added full projection/export through 2051.

## Important behavior

- No DROP TABLE.
- No DELETE without WHERE.
- Existing old asset tables remain in DB, but the Phase11 Assets tab uses the rebuilt model.
- Mortgage schedule CSV should be imported from the original amortization CSV. If not imported, the app shows a fallback projection using 1.19% and 150,263 JPY/month.
- Loan repayment sync creates expense rows for Husband/Wife repayments and prevents duplicates by ledger link key.

## Validation performed here

- `npm --prefix frontend run build`: passed
- `cd worker && npx tsc --noEmit`: passed

## Preview deployment reminder

Run migrations and deploy only to Preview:

```powershell
cd C:\dev\budget-hirofam\worker
npx wrangler@4 d1 migrations apply DB --remote --env preview --config wrangler.toml
npx wrangler@4 deploy --env preview --config wrangler.toml
```
