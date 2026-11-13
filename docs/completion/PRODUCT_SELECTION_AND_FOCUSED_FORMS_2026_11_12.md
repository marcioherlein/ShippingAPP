# Product selection, processing and focused forms

Selecting a search result previously depended entirely on a second Alibaba detail read. A blocked/slow detail page stranded the user despite an existing product choice. Separately, a partial constraint object could throw while rendering the selected product (`excludedOriginCountries is not iterable`).

## Resulting behavior

- Selection preserves the actual search result. Detail reading has a 12-second deadline; a supplier failure continues into confirmation with the title, source, image, MOQ and original evidence available. Currency, offer basis, packaging and customs classification are not invented from the search card. Authentication failures retain their separate sign-in/recovery path.
- Missing or malformed search constraints are normalized before evaluation. An absent threshold is not reported as a passed constraint.
- Foreground search, product reading, catalog loading, classification, calculation and saving display one full-screen native modal. Underlying navigation and form controls are inert for pointer and keyboard input. The screen shows actual stages, without fabricated percentages. Concurrent requests cannot release the screen prematurely. Timeout, abort, authentication errors and unmount release their respective work registrations.
- Requests retain their existing 30-second transport deadline; a stalled lazy-loaded step releases the modal after 20 seconds and offers reload recovery. Background usage/history reads do not lock the application.
- Entering the calculator moves keyboard focus to its title after foreground loading has finished. This prevents the lazy-loading modal from suppressing or undoing the entry focus.
- Product, supplier and packaging forms use a shared form stylesheet, consistent fields and primary/secondary actions, wrapping labels, and a single main surface. The former product sidebar and nested question cards were removed. Original price evidence is visible when confirming a supplier amount.
- Product/operation context can be expanded without displacing the current question. Editing the operation is placed after the main task. The redundant “Revisar producto” navigation action is omitted while already reviewing the product.

## Verification

- Full local unit/integration run: 198 files, 1,283 tests passed.
- Local search/calculation browser flows: 16 cases across Chromium and WebKit; guards assert no unhandled JavaScript or React rendering errors.
- Header and manual intake checks: 10 cases across both engines, covering 320/390/1440 widths and light/dark headers.
- Processing-screen browser checks: 6 cases across both engines, including full viewport coverage, real pointer/keyboard blocking, Escape, success/failure release and accessibility.
- Landing/entry focus and legal navigation: 12 repeated browser cases across both engines after fixing the loading-dialog focus race. The full CI run that identified the race passed the other 145 browser cases; that failed run is not treated as a passing release gate.
- Production build, TypeScript and bundle budgets pass. The repository has no lint script; `git diff --check` is used alongside those checks.

Independent visual review uses controlled supplier/search/analysis responses, including a deliberate detail-read 502. It covers the journey through the dashboard, manual product entry and packaging, light/dark, 320/390/1440 widths. Initial contrast and price-tier spacing issues were corrected and rechecked. Evidence is retained outside the checkout under `/workspace/shipping-review/flow-cleanup-2026-11-12/` when that workspace is available.

The review covers 80 journey states plus four final focused mobile states, with 41 images opened individually. The final 320/390px price and function questions fit the field and primary action within a 900px viewport from scroll position zero; the 320px price action ends at 818px. No document/button overflow, unhandled JavaScript errors or serious/critical axe findings remained in the reviewed states. These measurements describe the tested content, not every possible product title or translation.

The Vite visual harness serves the source catalog, whose descriptions precede SIM label reconciliation. The production build reconciles `dist/data/ncm-index.json`; development screenshots are not evidence that the runtime catalog is unreconciled. Provider availability in production is verified separately by the deployment workflow. Graceful fallback does not promise that every external supplier page can be read.
