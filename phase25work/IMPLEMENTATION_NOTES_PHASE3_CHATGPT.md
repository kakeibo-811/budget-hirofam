# Phase3 - Asset Operations

## Scope

This phase focuses on making the Asset/Liability tab operational in Preview:

- Asset event add/edit/delete UI
- Undo for the latest asset event operation
- Editable asset settings for initial balances, monthly deltas, annual events, mortgage rate
- Mortgage payoff estimate based on `home_loan` setting
- Safer Worker entrypoint with `writeGuard` active and ASCII-only comments
- Existing CSV preview/commit flow retained
- Existing duplicate prevention via `asset_import_keys` and `ledger_links` retained

## Safety

- Production config remains `WRITE_ENABLED = "false"`.
- Preview config remains `WRITE_ENABLED = "true"` for write testing only.
- D1 binding remains `DB`.
- Static assets binding remains `ASSETS`.
- No `DROP TABLE`.
- Deletes use `WHERE` and are guarded by the app's safety helper.

## Changed files

- `worker/src/index.ts`
- `worker/src/routes/assets.ts`
- `frontend/src/tabs/assets.ts`
- `frontend/src/style.css`

## How to apply and deploy Preview

```powershell
cd "C:\dev"

$zip = "C:\Users\thiro\Downloads\budget-hirofam-chatgpt-phase3-asset-operations.zip"
$backup = "C:\dev\budget-hirofam-backup-before-phase3-asset-operations"
$extract = "C:\dev\budget-hirofam-chatgpt-phase3-asset-operations"

Remove-Item $backup -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "C:\dev\budget-hirofam" $backup -Recurse -Force

Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $extract -Force
robocopy $extract "C:\dev\budget-hirofam" /E /XD node_modules dist .wrangler .git

cd "C:\dev\budget-hirofam"
npm install
npm --prefix frontend install
npm --prefix worker install
npm --prefix frontend run build

cd "C:\dev\budget-hirofam\worker"
npx tsc --noEmit
npx wrangler@4 deploy --env preview --config wrangler.toml
Invoke-WebRequest "https://budget-hirofam-preview.xn487gnzwp.workers.dev/api/health" -UseBasicParsing
Start-Process "https://budget-hirofam-preview.xn487gnzwp.workers.dev"
```

## Test checklist

1. `/api/health` returns `200`, `env=preview`, `db.ok=true`, `write_enabled=true`.
2. Asset tab loads.
3. Add an event, then recalculate.
4. Edit the event, then recalculate.
5. Delete the event, then Undo.
6. Export CSV.
7. Import sample CSV: preview -> commit -> recalculate.
8. Sync repayments twice and confirm the second run skips duplicates.
9. Edit `home_loan` setting with a positive initial balance and negative monthly payment, then check payoff estimate.
