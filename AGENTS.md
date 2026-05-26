# AGENTS.md

## Project
夫婦家計簿アプリ budget-hirofam

## Stack
- Cloudflare Workers
- Cloudflare D1
- Vite frontend
- Preview-first development

## Absolute rules
- Do not deploy to production.
- Work only for Preview unless explicitly instructed otherwise.
- D1 binding name must remain `DB`.
- Assets binding name must remain `ASSETS`.
- Keep `wrangler.toml` in `[assets]` binding style.
- Do not revert to old `[site]` bucket mode.
- Do not use DROP TABLE.
- Do not use DELETE without WHERE.
- Do not run destructive migrations without explicit confirmation.
- APP_BUILD must be ASCII, for example `2026-05-26`.
- Do not add Japanese comments to `wrangler.toml`.
- Do not commit secrets, API tokens, `.env`, `.dev.vars`, or Cloudflare credentials.

## Deployment policy
- Codex should prepare code changes and explain deployment steps.
- Codex should not assume production deployment.
- Preview deploy command should be shown separately for the human operator.

## Important business logic
- Household expenses are split 50/50.
- Husband = Toshi.
- Wife = Lisa.
- Dashboard main purpose: show how much Lisa should transfer to Toshi.
- Dashboard month period: 25th of current month to 24th of next month.
- Card cycle: usually 11th to next month 10th.
- A payment on 5/10 should be attributed to April, not March.
- Wife main operation: import Delta Amex CSV into expenses and check dashboard transfer amount.
- Settlement transfers and loan repayments between spouses must not be treated as income.

## Database safety
- Prefer additive migrations.
- Migrations must be idempotent where possible.
- Never delete user data unless specifically requested.
- Before changing CSV import, fixed costs, income, accounts, or asset ledger logic, check downstream effects on dashboard, settlement, and analysis tabs.

## UX priorities
- Wife manual should be simple.
- CSV import must show preview, clear errors, and confirmation before commit.
- Fixed costs must not disappear or become uneditable.
