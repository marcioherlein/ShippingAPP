# Argentina Market V2 — Stage 0 & 1 Completion Report

Status: `COMPLETED`

- Date: 2026-08-31
- Branch: `feature/argentina-market-v2`
- PR: #64
- Code commit validated: `dc7431b0504701943fc955e290a8bf962046dc94`
- Reviewer: CI + adversarial fixture gates

## 1. Scope delivered

### Stage 0 — truthful market observability

- Added explicit provider health states instead of allowing a successful HTTP response to imply market capability is healthy.
- Added measurable market smoke `successRate` based on applicable checks.
- Configured-but-broken Mercado Libre now fails the strict production market smoke.
- Unconfigured Mercado Libre remains non-blocking but is explicitly reported as unhealthy/unconfigured.
- Preserved fail-closed economics: no fabricated/local fallback price is promoted when the benchmark is insufficient.

### Stage 1 — generic market matcher V2

- Replaced the padel-centric base matcher with generic evidence and hard conflicts.
- Added generic market query construction using product evidence rather than category alone.
- Added model/version, quantitative specs, pack quantity, condition, accessory/replacement and variant guardrails.
- Expanded conservative brand-equity protection for private-label/unknown targets.
- Retained padel-specific logic only as a domain extension/regression.

## 2. Files/components changed

- `docs/ARGENTINA_MARKET_V2_IMPLEMENTATION_PLAN.md`
- `scripts/market-smoke-policy.mjs`
- `scripts/market-smoke-policy.test.ts`
- `scripts/smoke-production-mercadolibre.mjs`
- `worker/catalogMatch.ts`
- `worker/catalogMatchV2.test.ts`
- `worker/catalogRules.ts`

## 3. Tasks completed

- [x] Define implementation stages and quality gates.
- [x] Make Mercado Libre production smoke distinguish unconfigured vs configured-broken.
- [x] Add strict failure for configured provider with broken auth/API/benchmark/price state.
- [x] Create cross-category matcher instead of category/padel-only matching.
- [x] Add hard reject for wrong model/version/capacity/power/pack/accessory/condition.
- [x] Add cross-category adversarial corpus.
- [x] Measure accuracy, precision, recall and false-positive rate in CI.
- [x] Repair regressions discovered by the adversarial CI loop.
- [x] Validate full build/runtime after final matcher improvement.

## 4. Automated test evidence

| Test | Command / CI job | Result | Evidence |
|---|---|---|---|
| Unit/integration | CI run `33387379523` | PASS | 72 test files / 427 tests passed |
| Market matcher adversarial corpus | `worker/catalogMatchV2.test.ts` | PASS | 22/22 correct; accuracy 100%; precision 100%; recall 100%; false-positive rate 0% |
| Legacy market regression | `worker/catalogMatch.test.ts` + `worker/mercadoLibreEndpoint.test.ts` | PASS | Existing padel and Mercado Libre endpoint behavior retained |
| Smoke policy adversarial states | `scripts/market-smoke-policy.test.ts` | PASS | 5/5 states passed |
| D1 validation | CI run `33387379523` | PASS | 11 tables, 13 required indexes, rollback probe PASS |
| NCM/SIM assets | CI run `33387379523` | PASS | NCM_APP schema 4 and SIM assets validated |
| Production build | CI run `33387379523` | PASS | TypeScript + Vite production build succeeded |
| Wrangler bundle | CI run `33387379523` | PASS | Dry-run bundle succeeded; required bindings present |
| Local runtime smoke | CI run `33387379523` | PASS | Worker runtime smoke returned expected checks |
| Production shell | CI run `33387379523` | PASS | Public React shell responded correctly |
| Live Mercado Libre production benchmark | Post-merge deployment | PENDING | Must be measured against the deployed branch; this stage does not claim provider success before that probe |

## 5. Adversarial testing

| Persona | Attack / failure scenario | Expected | Actual | Result |
|---|---|---|---|---|
| False-green reviewer | Provider returns HTTP 200 but auth/API is not usable | Must not report healthy | Health policy reports configured-broken/unconfigured | PASS |
| Availability attacker | Expired/forbidden Mercado Libre auth | Configured provider fails strict smoke | Covered by explicit configured-broken gate | PASS |
| Benchmark integrity reviewer | Fewer than 5 valid comparables | No live benchmark | `configured_insufficient` / strict failure | PASS |
| Price-integrity reviewer | Benchmark marked live but price is null/non-positive | Not healthy | Explicit positive-price check fails | PASS |
| Product-variant attacker | iPhone 15 vs 15 Pro / 128 GB vs 256 GB / iPhone 14 | Hard reject | Score 0 | PASS |
| Specification attacker | Same tool/model but wrong wattage | Hard reject | Score 0 | PASS |
| Product-type attacker | Vacuum vs replacement filter | Hard reject | Score 0 | PASS |
| Pack attacker | Single unit vs x10 / x10 vs x6 | Hard reject | Score 0 | PASS |
| Condition attacker | New target vs used listing | Hard reject | Score 0 | PASS |
| Brand-bias attacker | Unknown/private-label target vs premium branded item | Hard reject | Score 0 | PASS |
| Regression reviewer | Commodity/padel listing uses marketing word `Pro` | Do not misclassify as model variant without model evidence | Corrected after first CI failure | PASS |

## 6. Implementation audit

### Findings

- The former matcher encoded substantial padel-specific assumptions and was unsafe as a generic Argentina market matcher.
- The former production Mercado Libre smoke could skip configured failure states and still let a deployment appear successful.
- The new matcher intentionally favors false negatives over false positives; after exact-spec evidence was strengthened, the current deterministic corpus achieves both 100% precision and 100% recall.

### Security / privacy

- No provider token is returned by health or benchmark responses.
- Existing Mercado Libre endpoint tests that check token non-disclosure remain green.

### Reliability

- Market provider health is now a state machine rather than an implicit HTTP-success assumption.
- Full application CI remains green after changes.

### Data quality

- Conflicting quantitative specs are checked before scoring and hard-rejected.
- Matching is deterministic and explainable through evidence classes, not delegated to an unconstrained LLM.

## 7. Defects discovered and remediation

| ID | Severity | Finding | Remediation | Retest |
|---|---|---|---|---|
| AM-01 | P1 | Candidate-only `Pro` modifier hard-rejected commodity/padel comparables, causing live ML fixture to become insufficient | Candidate-only variant modifier now hard-rejects only when shared model/version evidence makes it a credible model variant | PASS |
| AM-02 | P1 | Carbon target vs glass-fiber padel candidate scored above acceptance threshold | Restored strong negative evidence when required carbon is absent | PASS |
| AM-03 | P2 | Exact 60 L storage-box fixture was conservatively rejected | Increased weight only for exact quantitative spec matches; conflicting specs remain hard rejects | PASS |

Initial adversarial CI exposed AM-01 and AM-02: 425/427 tests passed and the batch was rejected. After correction the full suite passed. AM-03 was then visible in measured metrics (95.45% accuracy / 100% precision / 87.5% recall); the final constrained improvement moved the corpus to 100% / 100% / 100% with 0% false positives.

## 8. Production validation

- Deployment status: pending merge of PR #64.
- Endpoint/UI checked before merge: production shell only.
- Live provider validation: deliberately pending. This report does not claim Mercado Libre search success based on mocks.
- Required next evidence: post-merge `Production MercadoLibre benchmark smoke test` from the deployment workflow.

## 9. Residual risks / accepted limitations

- The adversarial matcher corpus has 22 deterministic fixtures, not yet the planned 30+ manually gold-labeled real-world products.
- Marketplace discovery still depends on the existing Mercado Libre search/fallback path; Stage 2 must separate discovery from authoritative price resolution.
- A secondary Argentina discovery provider is not yet connected; no credentials or third-party provider are fabricated in this stage.
- Live Mercado Libre listing-search permissions/403 behavior must be measured after deployment.
- Exact/equivalent/category-comparable populations are not yet separately exposed in the benchmark result schema.

## 10. Rollback procedure

- Revert PR #64 or the merge commit if production smoke shows an unexpected regression.
- No database migration is introduced by this batch.
- Existing fail-closed market behavior remains the safe fallback.

## 11. Completion decision

**Decision:** `PASS`

**Reason:**

Stage 0 and Stage 1 satisfy their deterministic gates. Final adversarial metrics are 100% accuracy, 100% precision, 100% recall and 0% false-positive rate on the 22-case corpus, while the entire 427-test application suite, build, Wrangler bundle and runtime smoke pass. This decision does not imply Stage 2/provider availability is complete.

## 12. Next-stage prerequisites

- Merge PR #64 after CI validates this completion-document commit.
- Observe the real production Mercado Libre smoke result.
- If listing discovery remains blocked/degraded, begin Stage 2 by extracting provider contracts and separating discovery from official item/sale-price resolution.
- Expand the gold-label corpus as real provider results become available.
