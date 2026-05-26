# Codex Handoff: budget-hirofam

This repository is the Budget HiroFam household budget app for Toshi and Lisa.
It runs on Cloudflare Workers, Cloudflare D1, and a Vite frontend.

## Mandatory Rules

- Read `AGENTS.md` before making changes.
- Work only against Preview unless explicitly instructed otherwise.
- Do not deploy to production.
- Do not run destructive database operations.
- Do not use `DROP TABLE`.
- Do not use `DELETE` without `WHERE`.
- Keep the D1 binding name as `DB`.
- Keep the assets binding name as `ASSETS`.
- Keep `worker/wrangler.toml` in `[assets]` binding style.
- Do not switch back to old `[site]` bucket mode.
- Do not commit secrets, API tokens, `.env`, `.dev.vars`, or Cloudflare credentials.
- `APP_BUILD` must remain ASCII.
- Do not add Japanese comments to `worker/wrangler.toml`.

## Project Structure

```text
budget-hirofam/
  AGENTS.md
  README.md
  package.json
  frontend/
    index.html
    package.json
    vite.config.ts
    src/
      main.ts
      style.css
      components/
      i18n/
      tabs/
      utils/
  worker/
    package.json
    wrangler.toml
    src/
      index.ts
      db/
      middleware/
      routes/
  migrations/
    0001_initial_schema.sql
    ...
    0016_phase18_income_settlement_graph_soft_ui.sql
  scripts/
    deploy-preview.ps1
    deploy-preview-write.ps1
    enable-write.ps1
    setup.ps1
    backup.ps1
    promote-prod.ps1
    rollback.ps1
```

## Component Roles

### frontend

`frontend/` is the Vite TypeScript single page app.
It builds to `frontend/dist`, which is served by the Worker assets binding.
During local frontend development, `frontend/vite.config.ts` proxies `/api` to `http://localhost:8787`.

Important entry points:

- `frontend/src/main.ts`: app bootstrap and tab wiring.
- `frontend/src/tabs/`: user-facing tab implementations such as dashboard, expenses, cards, fixed costs, incomes, settlements, analytics, assets, and settings/diagnostics.
- `frontend/src/utils/index.ts`: shared API client and format helpers.
- `frontend/src/i18n/`: UI language strings.

### worker

`worker/` is the Cloudflare Worker API and static asset host.
`worker/src/index.ts` creates the Hono app, exposes health/meta endpoints, applies security middleware, routes `/api/*`, and serves the frontend through the `ASSETS` binding for SPA fallback.

Important areas:

- `worker/src/routes/`: API route modules for expenses, cards, accounts, incomes, fixed costs, settlements, assets, analytics, import/export, scheduled payments, commands, investments, and bulk operations.
- `worker/src/middleware/cf-access.ts`: Cloudflare Access authentication.
- `worker/src/middleware/write-guard.ts`: blocks write methods unless `WRITE_ENABLED` is `true`.
- `worker/src/db/helpers.ts`: shared D1 helper logic, including bulk and idempotent link helpers.

### D1 migrations

`migrations/` contains Cloudflare D1 SQL migrations.
The active D1 binding is `DB`.
Migrations are referenced from `worker/wrangler.toml` with `migrations_dir = "../migrations"` for each environment.

Treat migrations as append-only and additive where possible.
Before modifying CSV import, fixed costs, incomes, accounts, or asset ledger logic, check downstream impact on dashboard, settlement, and analysis behavior.

### wrangler.toml

The Cloudflare configuration lives at `worker/wrangler.toml`.
There is no root-level `wrangler.toml`.

Key points:

- Top-level worker name: `budget-hirofam`
- Worker entry: `worker/src/index.ts`
- Assets binding:
  - `directory = "../frontend/dist"`
  - `binding = "ASSETS"`
- Preview environment:
  - worker name: `budget-hirofam-preview`
  - D1 binding: `DB`
  - D1 database name: `budget-hirofam-preview`
  - `APP_ENV = "preview"`
- Production environment:
  - worker name: `budget-hirofam-prod`
  - D1 binding: `DB`
  - D1 database name: `kakeibo-production`
  - `APP_ENV = "production"`

Production settings are documented for awareness only. Do not deploy or migrate production during Preview work.

## Build Method

Install dependencies:

```powershell
npm run install:all
```

Build frontend and worker:

```powershell
npm run build
```

Root `npm run build` runs:

```powershell
npm --prefix frontend run build
npm --prefix worker run build
```

The worker build script currently prints that Wrangler builds the Worker at deploy time.

## Preview Deploy Method

Human operator command for Preview deploy:

```powershell
./scripts/deploy-preview.ps1
```

Equivalent root npm script:

```powershell
npm run deploy:preview
```

Both paths build the frontend and deploy with:

```powershell
wrangler deploy --env preview --config worker/wrangler.toml
```

Do not run `npm run deploy:production`, `./scripts/promote-prod.ps1`, or any production deploy command during Preview-only work.

## Preview D1 Migration Method

Human operator command for Preview D1 migrations:

```powershell
npm run migrate:preview
```

This applies migrations remotely to the Preview D1 binding:

```powershell
wrangler d1 migrations apply DB --remote --env preview --config worker/wrangler.toml
```

The `scripts/deploy-preview-write.ps1` script also applies Preview migrations before deploying Preview with writes enabled. Use it only when explicitly appropriate for Preview testing.

Do not run `npm run migrate:production` or production D1 migration commands during Preview-only work.

## Verification Checklist

For documentation-only changes:

```powershell
npm run build
```

For Preview release preparation, ask the human operator to run:

```powershell
npm run migrate:preview
./scripts/deploy-preview.ps1
```

After Preview deploy, check:

- `/` loads the app shell.
- `/api/health` returns JSON with `status: "ok"` and `db.ok: true`.
- Tab navigation works.
- Theme and language toggles work.

## Notes for Future Codex Work

- This handoff does not add features.
- Existing application code should remain unchanged unless a later task explicitly asks for implementation.
- The current README appears partially mojibake/garbled in this checkout, so prefer `AGENTS.md`, `package.json`, scripts, and `worker/wrangler.toml` as authoritative operational references.
- Settlement transfers and loan repayments between spouses must not be treated as income.
- The dashboard's main business purpose is to show how much Lisa should transfer to Toshi.
- The dashboard month period is from the 25th of the current month to the 24th of the next month.
- Card cycle behavior matters: a payment on 5/10 should be attributed to April, not March.
