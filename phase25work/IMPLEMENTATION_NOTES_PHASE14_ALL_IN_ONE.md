# Phase14 all-in-one

Production was not touched. This package is intended for Preview only.

## Included

- Shared account policy: the shared account is treated as the repair reserve savings account.
- Repair reserve monthly plan now deducts scheduled repair-reserve payments such as property tax, earthquake insurance and fire insurance.
- Settlement tab supports manual adjustments with archive/delete behavior and recalculates using expenses, fixed costs and scheduled payments.
- Messages are embedded below the Wife → Husband transfer area on the dashboard; the Message tab is removed from navigation.
- Wife manual tab explains the intended monthly workflow: import CSV, verify Wife → Husband transfer, add notes.
- Income tab supports adding monthly income and recurring income for salary, side income and temporary income.
- Investment holdings are added with manual price entry and best-effort Yahoo Finance chart lookup from the Worker.
- Dashboard includes investment/net-asset hint and inline couple notes.
- Assets tab shows investment holdings and repair-reserve scheduled deductions.

## Still intentionally guarded

- Yahoo/third-party quote lookup is best-effort. Manual price remains authoritative when external lookup fails.
- No DROP TABLE was added.
- Existing historical tables are preserved.
- The Message API remains active, but the standalone tab is removed.

## Preview deploy

```powershell
cd C:\dev\budget-hirofam\worker
npx wrangler@4 d1 migrations apply DB --remote --env preview --config wrangler.toml
cd C:\dev\budget-hirofam
npm install
npm --prefix frontend install
npm --prefix worker install
npm --prefix frontend run build
cd worker
npx tsc --noEmit
npx wrangler@4 deploy --env preview --config wrangler.toml
```
