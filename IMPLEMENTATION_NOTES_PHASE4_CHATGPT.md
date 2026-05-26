# Phase4: April actuals CSV import + billing month rules + English cleanup

Production is not touched. Deploy only with `--env preview`.

## Main changes

- Added `migrations/0004_expense_import_keys.sql` for idempotent expense CSV imports.
- Added `/api/expenses/import/preview` and `/api/expenses/import/commit`.
- Added `/api/expenses/billing-rules`.
- Added `/api/expenses/export.csv`.
- Expenses list now returns `payment_due_date` derived from `billing_month` and card `pay_day`.
- Expense CSV import supports Japanese and English headers:
  - `日付` / `ご利用日` / `date`
  - `金額` / `ご利用金額` / `amount`
  - `内容` / `ご利用店名` / `description`
  - `支払者` / `payer`
  - `カード名` / `card_name`
  - `請求月` / `billing_month`
  - `カテゴリ` / `category`
  - `メモ` / `note`
- CSV import has preview and commit steps.
- Duplicate import is prevented by `expense_import_keys.import_key`.
- Expenses tab now explains billing month and payment date rules.
- English labels in the Expenses import flow were improved.

## Billing month rule

`billing_month` is the actual payment month.

For registered cards:

- usage day <= close_day -> billing_month = next month
- usage day > close_day -> billing_month = month after next
- payment_due_date = billing_month + card pay_day, clamped to month-end

If CSV has an explicit `billing_month` / `請求月`, the CSV value takes priority.

## Test commands

```powershell
cd "C:\dev\budget-hirofam\worker"
npx wrangler@4 d1 migrations apply DB --remote --env preview --config wrangler.toml

cd "C:\dev\budget-hirofam"
npm install
npm --prefix frontend install
npm --prefix worker install
npm --prefix frontend run build
cd worker
npx tsc --noEmit
npx wrangler@4 deploy --env preview --config wrangler.toml
Invoke-WebRequest "https://budget-hirofam-preview.xn487gnzwp.workers.dev/api/health" -UseBasicParsing
```
