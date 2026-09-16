# Intake and nomenclature recovery — 2026-09-16

Base: main bd49bbf (landing PR #177). Branch: feature/intake-ncm-recovery.

Implemented locally:
- Shared supplier weight conversion handles compact grams (180g), spaced units, decimal commas, milligrams, pounds and ounces; rejects ambiguous ranges instead of treating them as kg.
- Editable technical identity after classification; corrections trigger reclassification. Added a result action returning to the product form.
- NCM manual search by description/code, chapter filter, explicit user confirmation, exact catalog membership and complete tariff validation. Clears stale SIM evidence. This validates catalog existence, not legal correctness of user selection.
- Clarifications update the requested structured field even when it already contains text.
- MOQ optional in intake and quote validation. Explicit quote quantity drives pipeline and result consistently.
- Chat loading bar, recovery actions, manual intake and external Alibaba search. Direct/SEO provider fallback works without a Browser Run binding and does not repeat the existing fallback sequence.
- Cosmetic facial cream shortcut for catalog entry 3304.99.10, excluding detected medicinal descriptions.
- Argentine tennis/badminton query localization.
- Plants/Flowers category, including journey persistence and the existing sensitive-category cost model.
- Removed NCM/confidence from the customs result summary.

Verification:
- 911/911 unit/integration tests passed (156 files).
- Production TypeScript/Vite build passed. Bundle-size warning: 503.03 kB JS uncompressed, 143.90 kB gzip.
- Catalog reconciliation: 10,504 records and 96 SIM chapter files.
- Added Playwright scenarios at 390px and 1280px. Execution blocked before test actions: Chromium executable unavailable; browser downloads timed out.
- Exact reported Alibaba URL could not be fetched here. The RGB compact-gram regression uses a synthetic fixture, not a captured supplier response; actual supplier weight is not asserted.
- Live market/provider outcomes, authenticated flow, browser appearance and production deployment remain UNVERIFIED.

Publication:
- Automatic approval review rejected git push to marcioherlein/ShippingAPP, stating explicit destination publication authorization was missing and remote disclosure/mutation risk.
- No workaround attempted. Changes remain local. User approval is needed to push this branch, run remote browser/Cloudflare gates, and deploy only after passing.

Remaining acceptance:
1. Push branch and run full remote CI including new mobile/desktop browser scenarios.
2. Validate reported RGB Alibaba URL in a real signed-in session; compare source unit and packaging basis with parsed weight and supplier price.
3. Validate grill/manual NCM flow through quote and Argentine market sources; inspect actual comparable listings and ensure insufficient data never declares profitability.
4. Merge and verify Cloudflare release plus production smokes.
5. Clerk production migration and AI SDK remain deferred.
