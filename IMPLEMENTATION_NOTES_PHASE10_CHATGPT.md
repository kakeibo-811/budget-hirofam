# Phase10 - Fixed Costs, Payment Plans, and Analytics Hardening

Production was not touched. This package is intended for Preview only.

## Purpose

This phase addresses the user-reported issues:

- The Fixed Costs tab was effectively read-only and could not be maintained from the app.
- Fixed costs, variable costs, and other regular/irregular payments need to feed other tabs.
- Account balance shortfall monitoring should include card-external scheduled payments.
- Dashboard and Analytics should use these linked payment plans.
- Monthly trend analysis was too weak and hard to follow.

## Major changes

### DB migration

Added `migrations/0009_phase10_fixed_cost_cashflow_linking.sql`.

It adds safe, additive columns only:

- `fixed_costs.paid_by`
- `fixed_costs.burden_owner`
- `fixed_costs.account_id`
- `fixed_costs.category`
- `fixed_costs.frequency`
- `fixed_costs.due_date`
- `fixed_cost_snapshots.paid_by`
- `fixed_cost_snapshots.burden_owner`
- `fixed_cost_snapshots.payment_due_date`
- `fixed_cost_snapshots.synced_expense_id`

No DROP TABLE. No DELETE without WHERE.

### Fixed Costs tab

The tab now supports:

- Add fixed costs from the UI.
- Edit fixed cost master data.
- Apply a single-month override.
- Generate monthly snapshots.
- Sync monthly fixed costs into the Expenses table idempotently.
- Add/edit/delete card-external scheduled payments such as PayPal, transfers, insurance, taxes, irregular payments.

### Cross-tab linking

Fixed costs can be synced into `expenses` using `ledger_links` with `source_type = fixed_cost`, preventing duplicate expense creation.

Un-synced fixed cost snapshots are also considered by Dashboard/Analytics as forecast payment plans, so planning works before actual sync.

### Analytics

The Analytics tab now:

- Shows selectable ranges: 1M / 3M / 6M / 12M.
- Fetches dashboard calculations month-by-month, so income, settlement, fixed costs, scheduled payments and cashflow are aligned.
- Shows trend bars and a table.
- Shows coverage judgement by month.
- Shows account shortfall monitoring and top expenses.

## Preview deployment

Run migrations, build, type-check, and deploy only to preview:

```powershell
cd "C:\dev\budget-hirofam\worker"
npx wrangler@4 d1 migrations apply DB --remote --env preview --config wrangler.toml

cd "C:\dev\budget-hirofam"
npm install
npm --prefix frontend install
npm --prefix worker install
npm --prefix frontend run build

cd "C:\dev\budget-hirofam\worker"
npx tsc --noEmit
npx wrangler@4 deploy --env preview --config wrangler.toml
```

## Verification

- `/api/health` returns `status: ok` and `db.ok: true`.
- Fixed Costs tab can add/edit/delete fixed costs and scheduled payments.
- Fixed costs can be synced into Expenses once; running sync again skips existing links.
- Dashboard reflects fixed/scheduled payments.
- Analytics trend shows the selected range clearly.
