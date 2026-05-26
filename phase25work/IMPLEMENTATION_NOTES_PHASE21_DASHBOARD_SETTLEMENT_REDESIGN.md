# Phase21 Dashboard settlement redesign

This patch fixes the most important dashboard calculation rule:

- `burden_owner` / payer means who ultimately bears the cost.
- `paid_by` means whose card/account actually paid it.
- Wife pays Husband for:
  - Wife personal costs paid by Husband
  - Wife's half of shared/split costs paid by Husband
  - Wife's share of fixed/scheduled payments paid by Husband
  - minus credits where Wife paid Husband's costs or Wife paid shared costs

Important fixes:

- Dashboard no longer excludes `personal` / `個人` rows. Wife personal costs on Husband cards must count toward Wife→Husband transfer.
- Dashboard ignores only loan/loan_repayment categories and out-of-scope (`other`) burden rows.
- Dashboard joins card default payer fields and uses card default_paid_by / card owner when row paid_by is missing.
- Wife→Husband breakdown is now shown as first-class summary cards and detailed evidence table.
- The dashboard calculation policy text was rewritten to match the user's real operation.

Production was not touched. Deploy only to preview.
