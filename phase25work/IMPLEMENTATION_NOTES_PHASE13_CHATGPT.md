# Phase13: English UI Cleanup

Production was not touched.

## Scope
- Added a shared frontend i18n helper (`frontend/src/i18n/ui.ts`).
- Cleaned remaining Japanese-only labels in major daily-use tabs.
- Improved English labels for Cards, Accounts, Fixed/Scheduled Payments, Income, Settlement, Messages, Settings, Diagnostics, and Dashboard status text.
- Preserved existing DB schema and API behavior.

## Verified locally
- `npm --prefix frontend run build`
- `cd worker && npx tsc --noEmit`

## Not included in this phase
The following are larger functional changes and should be handled in the next phases:
- Full joint-account / repair-reserve cashflow model.
- Settlement tab edit/delete operations.
- Income add/edit/delete UI.
- Investment ticker integration.
- Wife-focused manual and inline message placement.
