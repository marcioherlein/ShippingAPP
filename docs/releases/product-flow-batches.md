# ShippingAPP — launch recovery batches

Updated October 6, 2026. No new paid services. Clerk production cutover remains deferred.
Baseline main: d04ed3e0e71252e3f87e02191bd31cf7eb49811b.

## 1. Unblock product intake and classification

MOQ is optional and absent values remain unknown. Neither MOQ nor suggested scenarios
become the buyer's purchase quantity. The chat no longer silently confirms or repeatedly
reclassifies products. A single editable review remains available after failure, together
with missing facts, candidates and the manual nomenclature search. Manual selections
require a matching index entry and complete tariff evidence.

Per-tab product, review, search and chatbot drafts survive reload/sign-in navigation.
The 8711.60.00 source index label now uses the canonical ARCA/SIM electric-motor
label rather than the erroneous piston-engine label; tariff columns are unchanged.
A semantic sentinel prevents recurrence in the deployment bundle.

Evidence: Chromium 320px motorcycle journey skips MOQ, preserves variant, selects
8711.60.00 through the validated index and reports missing packaging volume without
requiring a new product. Authentication-return persistence is separately covered.

## 2. Product search and recovery

Supplier search and product extraction have distinct visible states. API calls have a
30-second deadline covering session lookup, response headers and body; cancellation
releases the request. Classification begins after product confirmation. Errors expose
retry and manual description. Existing results and queries survive failure/reload.
Authentication resumes only an explicitly interrupted request.

Evidence: mobile browser fixture covers successful supplier search, failed Alibaba
extraction and failed retry with preserved query/results. Deadline unit test covers a
stalled request. These provider responses are controlled fixtures, not proof that
Alibaba always succeeds in production.

## 3. Confirmed supplier evidence

One review shows original source/text, currency, unit/pack basis, variant, MOQ, weight
and packaging volume. Unknown extracted currency/basis/variant require correction.
USD remains USD. Other currencies require an editable documented USD cross rate,
source and date. Pack amounts divide by confirmed units per pack. Quantity bands are
editable, including additional tiers; overlapping bands and uncovered quantities block
costs. Source extraction retains original price/currency/unit/variant evidence.
No weight-derived volume is generated. No cost-derived Argentina selling price is generated.

Evidence: unit tests cover ambiguous currency, unchanged USD, documented CNY pack
conversion, missing rate evidence, tier overlap/gaps and explicit quantities. Browser
coverage verifies the review cannot calculate until these values are confirmed.
Live signed-in supplier/variant evidence remains an acceptance requirement.

## 4. Quantity and results

An exact initial quantity is reused. A range remains a range until selected. Budget
input is shown and can propose an affordable quantity using confirmed supplier pricing.
The MOQ shortcut requires an explicit click. Product edits return to the same review,
and quantity edits invalidate the result before recalculating price, freight, tax and
unit cost. Optimizer scenarios use confirmed tiers and omit uncovered quantities.
Argentina comparison requires live source/comparable evidence; missing evidence is
visible and does not invent profitability. Manual local prices remain estimates.

Evidence: quantity/confirmation tests and an end-to-end pack/tier edit exercise the
same stored purchase quantity and changed landed unit cost. Budget proposal and
production authenticated provider behavior still require real-case acceptance.

## 5. Mobile visual system

A shared neutral/lavender palette, semantic surfaces and consistent typography/buttons
apply across intake/review/results in light/dark mode. Inputs use 16px text and controls
44px minimum targets. The account toolbar occupies document flow; navigation and chat
text wrap without clipping. New-case action remains reachable on narrow phones.

Evidence: browser gates include keyboard/focus, axe, reduced motion, larger text,
320px/390px screens and desktop screenshots. The final dark result flow passes
axe without serious/critical WCAG AA violations, including the original-price review,
NCM summary, provider messages and landed-cost cards. New acceptance tests also run in mobile
WebKit in CI. Local WebKit cannot run because required host libraries are unavailable;
CI must supply that evidence. Physical iPhone keyboard/zoom remains unverified.

## Verification and release status

Local unit/integration suite: 169 files, 991 tests passing; one additional optimizer regression passes in the targeted suite (992 total). Production build and
nomenclature asset validation pass. Existing isolated Chromium suite: 27 tests passing;
29 existing/recovery Chromium cases pass in the combined run; all three new acceptance
cases pass after correcting implicit label activation in the shared currency dropdown.
The deployed baseline subsequently passed CI: 992 unit/integration tests and 42
Chromium/mobile WebKit tests. CI run 37521831322 and Deploy Production run
37521831510 completed successfully; Stage 6, 7 and 8 production gates also passed.
A successful build does not close the five batches: real signed-in Alibaba cases
and a physical iPhone session remain outstanding.

## October 6 follow-up — publication authorized, verification pending

The result no longer substitutes 1 (or displays the prefill's zero sentinel) for an
unknown supplier MOQ. Confirmed results show “Sin dato”; corrections return to the
product review. Standalone estimates allow leaving MOQ empty.

The quantity optimizer no longer treats the buyer's starting quantity as an inferred
MOQ. With MOQ unknown it can consider smaller, affordable scenarios within confirmed
price bands. It explicitly warns that the supplier minimum still needs confirmation.
An open budget is no longer described as proof that a proposed quantity is affordable.

Manual local-price edits remove the confirmed benchmark badge, expose an editable
source field and identify the value as user-entered. The result no longer claims that
the entered price was generated using a 1.6 markup.

WebKit coverage now also selects intake recovery, result dossier and accessibility
tests. New browser regressions verify unknown MOQ in the result and manual-price
provenance, including editing an originally live benchmark at 320px.

The first expanded CI run passed 996 unit/integration and 54 browser tests, but
visual review found the WebKit dark full-page result capture blank below the
pipeline summary. The quotation now paints without an opacity entrance animation.
The ready-state reveal runs after React commits the result instead of querying a
not-yet-mounted DOM node. Browser acceptance additionally requires the cost hero
to enter the viewport automatically after each confirmation, before screenshot/axe.

Local validation of this follow-up: 170 files / 996 unit and integration tests pass,
including rendered React result regressions; production build and nomenclature asset
validation pass. The updated browser suite has not run locally: this workspace has
no installed Playwright browsers. These are prepared tests, not claimed browser evidence.

Publication to marcioherlein/ShippingAPP was explicitly authorized on October 6.
Require the expanded CI browser suite to pass before merging, then verify production gates.

Remaining launch acceptance: real authenticated Alibaba extraction (including the
reported gram/kilogram case), realistic budget-based selection, physical iPhone
keyboard/zoom, and visual approval of the ComplyDo-inspired navigation/layout.
