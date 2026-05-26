# Phase19: Asset assumption save -> monthly plan immediate refresh

Purpose: fix the recurring issue where changing Assets/Liabilities assumptions, especially monthly repair reserve saving, did not visibly change the monthly plan.

What changed:
- `/api/assets/settings` now returns the saved canonical settings and a small projection check immediately after saving.
- `/api/assets/projection`, `/api/assets/settings`, and `/api/assets/settings/debug` return `Cache-Control: no-store`.
- The Assets/Liabilities UI reloads projection with a cache-busting timestamp after saving assumptions.
- The save button label now explicitly says it saves and refreshes the monthly plan.
- Added a "Check assumptions" button to show the DB value and the first projection row.
- Settings now read legacy aliases only as fallback, and rebuilt settings always win.
- Added more aliases for monthly repair saving so old keys cannot keep stale values.

Production was not touched.
