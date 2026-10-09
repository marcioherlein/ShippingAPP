# Quantity, budget and recalculation

The result derives its unit price from the confirmed supplier tier for the selected quantity. Adopting a suggested quantity recalculates FOB, freight, taxes and landed unit cost; an uncovered quantity hides the result and offers correction. The confirmed unit price is read-only in the standalone simulator.

Budget search evaluates each confirmed price band independently, including later discounts when the first band exceeds budget. Proposals respect the buyer's range and supplier increment. Calculations without a usable transport mode cannot be labelled affordable. The confirmation proposal uses the same purpose, entity, importer signature and sensitive-category profile as the final calculation. Editing MOQ changes its explicit quantity shortcut.

Regression coverage includes discounted-band affordability, range/increment constraints, missing-origin costs and rendered tier recalculation. Browser cases exercise budget selection and range selection on Chromium and mobile WebKit with controlled provider responses. Original capacity is reused and saved/result quantities match. Real-account login and physical iPhone keyboard/zoom remain outstanding acceptance checks.

The intervening landing redesign changed its markup/copy without updating existing tests and restored the removed G mark. This change updates those tests and removes both restored marks.

The first browser run passed the new budget/range cases, but exposed existing design overrides that forced a light header and dark title in dark mode and overrode reduced-motion transitions. The follow-up retains the intervening full-width navigation/font changes, uses semantic surfaces/text colors and restores motion preferences, including landing scroll behavior. These regressions must pass the unchanged accessibility gates before merge.
