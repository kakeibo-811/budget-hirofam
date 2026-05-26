# Phase6 - Requirement gap hardening and canonical import policy

This phase is Preview-only. It does not deploy to Production.

## Added

- Migration `0005_phase6_import_policy.sql`
  - `app_settings` for operation policy such as billing month definition and canonical expense source.
  - `import_batches` for CSV import audit history.
  - Additional metadata columns on `expense_import_keys` and `asset_import_keys`.
- Expense CSV commit improvements
  - `source`, `source_file`, `target_month`, and `mode` fields.
  - `mode=replace_imported` replaces rows previously imported from the same source and target month.
  - Default UI source is `kakeibo_all`, matching the canonical CSV policy.
- Asset/mortgage CSV commit improvements
  - `import_source`, `source_file`, and `mode` fields.
  - Mortgage schedule imports can be tracked as `mortgage_schedule_1_19`.
  - Replace mode only deletes asset events previously imported by the same import source; manual events are preserved.
- Diagnostics
  - `/api/diag/policy`
  - `/api/diag/checklist`
  - Import batch history in the DB diagnostics UI.
  - Requirement checklist card for DB binding, assets binding, duplicate prevention, import audit, repayment idempotency, and Undo base.
- English display
  - English owner/payer labels now use Husband/Wife by default, matching the requirement.

## Still intentionally not complete

- XLSX export is not implemented yet; UTF-8 BOM CSV remains the supported export path.
- Cloudflare Access values still need actual Cloudflare configuration.
- Full salary-cycle analytics requires a separate implementation pass.
- Fixed-cost single-month/future/bulk change workflow requires a separate implementation pass.
- Message posting/edit/delete may require a separate implementation pass depending on desired UX.

## Required after applying

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
