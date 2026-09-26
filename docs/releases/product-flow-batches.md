# ShippingAPP — pending delivery batches

Updated September 23, 2026 from the owner's requested corrections.
Budget: no paid services or plan upgrades. Clerk production cutover is deferred.
Current main: 5aa4b6f. Never equate a successful build with production recovery.

## Batch 1 — free compute recovery (in progress)

- Route API processing through SQLite-backed Durable Objects on Workers Free.
- Preserve authentication, credits, requests and source-evidence requirements.
- Pass CI, real Wrangler runtime, deployment, 20 intake + 20 NCM cases, local
  retailer comparisons and chat tests before closing the incident.
- Current local evidence: 934 tests and production build passed. Wrangler bundle
  dry-run passed. Local runtime blocked by uv_interface_addresses environment
  error; CI must supply real runtime evidence. Not deployed yet.

## Batch 2 — extracted facts, currency and supplier confirmation

### 2A — explicit review before quoting (implementation in review)

- Require an unchecked acknowledgement before quoting the reviewed product, unit
  USD price, supplier minimum and shipment data. Edits and refreshed analysis
  clear the acknowledgement; the submit handler also guards it.
- Show identity, source, description and known commercial facts together.
  Missing MOQ is explicitly shown as not supplied and remains optional.
- Browser regression covers blocked submit, explicit acknowledgement and price
  changes invalidating acknowledgement at mobile and desktop widths.
- This does not complete currency provenance/conversion, price tier/pack or
  variant validation. Those remain pending in 2B below.

### 2B — currency and supplier price evidence (pending)

- Require an explicit user confirmation of ALL extracted facts before using them
  for a calculation: name/type, supplier URL, variant, price, original currency,
  price tier, unit/pack basis, MOQ, dimensions, packed weight, volume and origin.
- One editable review screen with a single confirmation action; show missing
  values explicitly. Never silently accept extracted facts. Reconfirm changed
  extracted facts after a re-read or variant/quantity change.
- Identify supplier currency before conversion; dollar symbols alone are not
  proof of USD. Keep the original value/currency and the converted USD value.
- USD remains USD. For ARS use the official USD exchange rate with source, date
  and direction. Other currencies need a supported source-backed cross rate to
  USD. Do not apply ARS/USD to CNY, BRL or other currencies. When evidence is
  missing or ambiguous, require correction instead of inventing a rate.
- Validate unit prices versus packs, ranges and volume tiers for the selected
  variant and purchase quantity. Confirm supplier MOQ without making unknown MOQ
  mandatory. Keep commercial MOQ distinct from the buyer's selected quantity.
- Show the same official ARS/USD basis consistently in local-market comparison,
  without confusing displayed conversion with customs valuation rules.
- Tests: ambiguous $, USD unchanged, ARS official conversion, cross currency,
  tier changes, packs, missing MOQ and confirmation invalidation.

## Batch 3 — guided classification and bilingual product identity

- Display a Spanish product description while retaining the supplier's original
  title, brand/model and technical specifications for traceability.
- Build Argentine-market queries using Spanish product/category synonyms;
  preserve brands, model identifiers, units and discriminating attributes.
- Prefer existing deterministic mappings and translation capabilities; no new
  paid translation provider. Never present guessed translated specs as facts.
- If NCM classification fails, explain the missing distinction in plain Spanish,
  ask one targeted question and then offer the existing manual text/code/chapter
  search. No endless repeated questions or forced restart.
- Validate manual choices against the official index and complete tariff data;
  confirmation is not a substitute for valid tariff evidence.
- Tests: English supplier names, Spanish retail matches, preserved model/units,
  repeated clarification recovery and manual NCM continuation.

## Batch 4 — one purchase quantity throughout the journey

- Reuse the budget/quantity already entered. Do not ask repeatedly for quantity.
- A range remains a range until a quantity is selected or proposed and confirmed.
  For budget-only input, propose an affordable quantity and obtain confirmation.
- If neither budget nor quantity was supplied, ask whether the user wants the
  confirmed supplier minimum. Never automatically substitute MOQ for quantity.
- If MOQ is unknown, ask for desired quantity; unknown MOQ must not block progress.
- Reflect edits consistently in supplier tiers, freight, taxes, total and unit
  landed cost. Explain any change that invalidates a prior price tier.
- Tests: explicit quantity, range, budget only, accept/reject MOQ, unknown MOQ,
  change quantity and no duplicate prompting after sign-in/reload.

## Batch 5 — Apple HIG / Insic-style guided experience

- Apply Apple HIG and the user's Insic/AppLlama principles to the web, preserving
  ShippingAPP identity: simple hierarchy, restrained typography, progressive
  disclosure, comfortable touch targets and clear primary actions.
- A visible step-by-step journey: product, editable confirmation, classification,
  quantity review when needed, cost and Argentine comparison. Reuse earlier data.
- Clear progress while work runs; remove stale thinking messages on failure.
  Recovery keeps the draft. Respect reduced-motion preferences.
- Mobile-first layouts without horizontal overflow; accessible labels, focus,
  keyboard support and contrast. Avoid oversized controls and repetitive copy.
- Verify Chromium and mobile WebKit plus actual production flows. Cover login
  return, price confirmation, NCM recovery and quantity changes end to end.

## Completion evidence

Record each batch's PR/commit, test results, production deployment and live case
results here. No batch is complete merely because its implementation is present.
Keep external-provider coverage gaps visible; never lower comparable-product
quality thresholds just to make a gate green.
