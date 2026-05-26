# ChatGPT Phase 2 - Preview write + CSV import commit

## Scope
- Preview only. Production is untouched.
- `wrangler.toml` keeps `[assets] binding = "ASSETS"` and D1 `binding = "DB"`.
- `env.preview.vars.WRITE_ENABLED` is set to `"true"` so CSV commit, recalculation, and repayment sync can be tested in Preview.
- `env.production.vars.WRITE_ENABLED` remains `"false"`.

## Added
- `migrations/0003_asset_import_keys.sql`
  - Adds `asset_import_keys` to prevent duplicate CSV event imports.
- `worker/src/middleware/write-guard.ts`
  - Allows `/api/assets/import/preview` even when writes are disabled because preview does not write DB.
- `worker/src/routes/assets.ts`
  - More robust event type normalization including Japanese values.
  - CSV commit now deduplicates by import key.
  - CSV commit validates known `asset_settings.key`.
  - CSV commit can recalculate snapshots after insertion.
- `frontend/src/tabs/assets.ts`
  - Adds CSV file picker.
  - Supports UTF-8/BOM and Shift-JIS reading in browser when supported.
  - Adds preview -> confirm commit flow.
  - Adds sample CSV insertion button.
- `scripts/deploy-preview-write.ps1`
  - Applies migrations, builds, type-checks, deploys Preview with writes enabled.

## Required commands
```powershell
cd "C:\dev\budget-hirofam"
.\scripts\deploy-preview-write.ps1
```

Or manually:
```powershell
cd "C:\dev\budget-hirofam\worker"
npx wrangler@4 d1 migrations apply DB --remote --env preview --config wrangler.toml
cd ..
npm --prefix frontend run build
cd worker
npx tsc --noEmit
npx wrangler@4 deploy --env preview --config wrangler.toml
```

## CSV format
Recommended English columns:
```csv
setting_key,event_date,event_type,amount,note
loan_toshi,2026-06-25,lump_repayment,100000,one-time repayment
repair_reserve,2026-07-25,adjustment,30000,extra reserve
```

Japanese headers are also accepted:
```csv
項目キー,日付,種別,金額,メモ
loan_toshi,2026-06-25,一括返済,100000,夫貸付の一括返済
```

Supported event types:
- `lump_repayment` / `一括返済` / `繰上返済`
- `adjustment` / `調整` / `修正`
- `extra_payment` / `臨時返済` / `追加支払`
- `rate_change` / `金利変更`
- `value_update` / `評価更新` / `残高更新`

## Safety
- No DROP TABLE.
- No production deploy.
- Duplicate CSV imports are skipped via `asset_import_keys.import_key`.
- CSV preview must be run before commit in the UI.
