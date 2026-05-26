# Phase17: Bulk operations, sort controls, and imported-month deletion

Preview-only patch. Production is not touched.

## Added

- Shared backend bulk operations API under `/api/bulk`.
- Supports major data entities: expenses, fixed costs, scheduled payments, incomes, cards, accounts, settlement adjustments, asset events, investments.
- Bulk update and bulk delete/archive require `confirm: true`.
- Bulk operation audit log table: `bulk_operation_log`.
- Expenses can be sorted ascending/descending by date, amount, billing month, budget month, payment date, description, or id.
- Expense tab now has row checkboxes, select-all, bulk field update, bulk delete/archive.
- Expense tab can archive imported rows by import source + month.
- Settings tab has an all-tab bulk operation center for cross-tab bulk update/delete and imported-month deletion.
- Incomes now get `archived_at` so they can be safely archived instead of hard-deleted by bulk operations.

## Safety

- No DROP TABLE.
- DELETE/UPDATE without WHERE is still blocked by the db helper.
- Bulk operations are chunked by 50 IDs to avoid D1 variable limits.
- Bulk delete is soft delete where the table supports `archived_at`.
- All bulk operations are logged.
