# ShippingAPP adversarial audit — 2026-08-28

Production target: `https://shippingapp.marciofabrizio.workers.dev`

This branch is an audit branch and intentionally remains red while confirmed defects exist. Do not merge it as-is.

## Executive result

### Responsive layout / typography

**44 / 44 checks passed** in real Chromium against production.

Viewports:
- 1440 × 1000
- 1024 × 768
- 390 × 844
- 360 × 800

Validated at entry and Product Finder stages:
- exactly two visible entry paths
- no horizontal document overflow
- important cards and chatbot surfaces remain inside the viewport
- question cards and Product Finder use the same left/right content rail
- an adversarial long unbroken URL/token remains contained inside its chatbot thread
- computed font stack is consistently `"72 Brand", "72", Arial, Helvetica, sans-serif`
- SAP `72` webfont is available according to `document.fonts.check`

Result: **no responsive/font defect reproduced in the audited surfaces.**

## Unit / economics regression matrix

Vitest result after adding the adversarial matrix:

- Test files: **55 passed / 1 failed**
- Tests: **337 passed / 1 failed**

The single failure is a confirmed optimizer defect:

### BUG — budget below MOQ still returns an unaffordable recommendation

When `budgetUsd` cannot fund any generated candidate, `affordableCandidates` is correctly empty, but `quantityOptimizer` still returns `candidates[0]` as `recommendation`.

Current behavior comes from the fallback semantics:

```ts
const recommendation = (affordableCandidates[0] || candidates[0]) ?? null
```

Expected product behavior:
- if a positive budget is supplied and no candidate fits it, do **not** present an unaffordable quantity as the recommendation;
- return `recommendation = null` (or an explicit budget-blocked recommendation type) and expose the minimum required budget / gap.

All other added economics checks passed:
- each intervention group adds exactly USD 200 once per operation;
- ordinary goods add no intervention charge;
- missing importer/signature adds its USD 200 independently;
- capital-good treatment removes the applicable perceptions/statistics while retaining duty and VAT;
- air freight respects its minimum;
- unknown freight origin fails closed;
- zero quantity is rejected;
- fixed intervention cost dilutes correctly as quantity grows;
- candidates marked affordable never exceed the user budget.

## Live production engine audit

Representative live audit: **16 / 18 passed**.

### Intake

**6 / 6 passed**:
- tennis racket
- padel racket
- USB-C charger
- mini projector
- assembled solar panel
- electric espresso machine

All preserved product identity and avoided falling back to a useless generic clarification merely because the product wording was unfamiliar.

### NCM + tariffs

**4 / 6 passed**:

Passed:
- tennis racket → `9506.51.00`
- padel racket → `9506.59.00`
- USB-C charger → `8504.40.90`
- assembled solar panel → `8541.43.00`

Failed / requires action:

#### BUG / classification quality — mini projector

Expected: `8528.69.00`

Production returned:
- candidate: `9008.50.00`
- confidence: `low`
- DIE: 18%
- TE: 3%
- VAT: 21%
- capital-good eligible: true
- `missingFacts: []`

The fail-closed confidence behavior is useful: LOW confidence should prevent automatic economics. However:
1. the candidate is not the expected digital/video projector heading;
2. a LOW-confidence result should provide useful missing facts/discriminators instead of an empty list.

#### RELIABILITY — electric espresso machine

Expected code: `8516.71.00`.

The isolated live request did not return within the audit's 30-second request budget and was recorded as HTTP 0 / timeout. This is **not yet evidence of a wrong classification**. It is a latency/reliability defect until an isolated retry proves otherwise.

### NCM safety

**1 / 1 passed**.

`Máquina industrial multipropósito` did not produce an unjustified high-confidence classification with no qualifiers. This is the desired fail-closed behavior for ambiguous products.

### Alibaba live search

**3 / 3 passed**:
- carbon padel racket EVA
- USB-C 65W GaN charger
- electric espresso coffee maker

The live provider/failover chain returned usable real-product results.

### Mercado Libre

**2 / 2 passed** for the audited padel-racket and USB-C-charger probes under the current production state. No fabricated live price condition was observed by the audit.

## Priority fixes

### P0
1. Fix quantity optimizer budget semantics so an impossible budget never produces a normal recommendation.

### P1
2. Correct digital projector classification/retrieval weighting so modern video projectors favor heading 8528 rather than 9008, and populate useful `missingFacts` when confidence is low.
3. Isolate and measure espresso-machine NCM latency; add bounded retry/fallback or optimize the slow path if the timeout reproduces.

## Audit conclusion

The UI/layout normalization is currently healthy on the tested desktop/mobile surfaces. Alibaba intake/search and the tested Mercado Libre path are also healthy. The audit uncovered three substantive engine concerns: one confirmed optimizer budget bug, one projector classification-quality defect, and one NCM latency/reliability issue that requires isolated reproduction.
