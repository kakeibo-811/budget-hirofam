# ChatGPT implementation notes - asset/liability phase 1

Scope implemented in this package:

- Asset/liability API enhancements under `worker/src/routes/assets.ts`
  - projection calculation from asset settings and events
  - saved snapshot recalculation endpoint
  - repayment sync endpoint with ledger_links idempotency
  - CSV export with UTF-8 BOM
  - CSV import preview and guarded commit endpoint
- Diagnostics enhancements under `worker/src/routes/diag.ts`
  - full JSON backup endpoint `/api/diag/export.json`
- Frontend asset tab replacement under `frontend/src/tabs/assets.ts`
  - month picker
  - summary cards
  - settings table
  - monthly projection/snapshot table
  - recalculate, repayment sync, CSV export buttons
  - CSV import preview textarea
- Frontend diagnostics/export links updated under `frontend/src/tabs/settings-and-diag.ts`
- Mobile table/style improvements in `frontend/src/style.css`
- Root `package.json` migration scripts corrected to use `DB --remote --env preview/production`
- Preview deploy script updated to use `npx wrangler@4` and current `[assets]` binding approach

No migration was added because the current schema already includes the tables used here:
`asset_settings`, `asset_events`, `asset_snapshots`, `ledger_links`, `expenses`, and `undo_log`.

Safety:

- No production deployment is performed by this package.
- `wrangler.toml` remains on `[assets] binding = "ASSETS"` and D1 `binding = "DB"`.
- Write endpoints remain protected by `WRITE_ENABLED` via the existing write guard.
- The repayment sync uses `ledger_links` to avoid duplicate linked expenses.
