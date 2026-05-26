# Phase15 repair-reserve and settlement hardening

This patch fixes the issues reported after Phase14:

- Scheduled payment frequencies now support `every_3_years` and `every_5_years`.
- Fire insurance can be treated as a repair-reserve-funded 3/5-year payment.
- Asset monthly plans explicitly show the month where property tax, earthquake insurance, fire insurance, or repair spending is paid from the repair reserve.
- Changing `repair_reserve_monthly_deposit` immediately affects projection rows after saving and reloading.
- Dashboard now includes a visible breakdown table for the Wife -> Husband transfer amount.

No production deployment is performed by this package.
