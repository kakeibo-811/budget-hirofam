# Phase16 - Import billing controls, dashboard de-duplication, settlement drilldown

Production was not touched. This patch is intended for Preview only.

## Fixes

- Prevent dashboard/settlement double-counting when a fixed cost or scheduled payment has already been imported as an actual expense in the same month.
- Show a note in the dashboard when planned items are suppressed because actual expenses already cover them.
- Make the Wife -> Husband transfer metric clickable; clicking scrolls to the detailed breakdown.
- Allow card-by-card CSV import by selecting a card before preview.
- Allow manual billing month override before CSV commit.
- Make billing month, budget month, and payment date editable in the import preview table before commit.
- Synchronize legacy asset setting aliases so monthly repair saving changes reflect immediately in the asset monthly projection.

## Verification

1. Build frontend.
2. Type-check worker.
3. Apply migrations to Preview DB.
4. Deploy only to Preview.
5. Re-import a card CSV using the new card selector and billing-month override.
6. Verify Overview no longer double-counts a fixed/scheduled item if the same actual expense exists.
