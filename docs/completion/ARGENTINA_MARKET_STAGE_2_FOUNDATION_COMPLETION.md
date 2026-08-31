# Argentina Market V2 — Stage 2 Provider Foundation Completion Report

Status: `PASS WITH LIMITATIONS`

- Date: 2026-08-31
- Branch: `feature/argentina-market-stage-2`
- PR: #65
- CI run: `33388013610`

## Scope delivered

- Introduced source-agnostic discovery-provider contracts.
- Introduced a separate effective-price resolver contract.
- Added a provider-independent Argentina benchmark engine.
- Preserved Stage 1 deterministic matching as the acceptance gate.
- Added candidate deduplication, outlier screening, minimum-comparable gating, price-quality classification and benchmark confidence outside provider-specific code.
- Reordered production smoke gates so the Mercado Libre market smoke runs before the unrelated Alibaba opportunity-search provider.

## Adversarial test evidence

| Scenario | Expected behavior | Result |
|---|---|---|
| Non-MercadoLibre discovery provider with 6 valid listings | Produce live benchmark without ML coupling | PASS |
| Independent effective-price resolver | Resolve effective prices without discovery coupling | PASS |
| Discovery provider outage | Return `unavailable`, null price, no comparables | PASS |
| Only 4 valid comparables | Return `insufficient`; do not promote benchmark | PASS |
| Duplicate provider candidate | Deduplicate before statistics | PASS |
| 8 wrong product variants | Reject all; null suggested price | PASS |
| Effective-price resolver outage | Retain traceable listed price as lower-quality fallback | PASS |

Provider-engine adversarial success rate: **7/7 = 100%**.

Full repository result after adding Stage 2 foundation: **73 test files / 434 tests passed = 100% automated test pass rate**.

Stage 1 matcher regression remains: **22/22 fixtures, 100% accuracy, 100% precision, 100% recall, 0% false positives**.

D1 schema, NCM/SIM assets, production build, Wrangler dry-run/runtime and public shell smoke also passed in CI.

## Production adversarial finding

The prior Stage 0/1 deployment successfully:

- deployed the Worker to Cloudflare;
- validated production D1;
- passed auth-boundary smoke;
- passed privileged runtime smoke;
- passed Alibaba self-scrape identity smoke.

It then failed on an independent Alibaba opportunity-search dependency because structured search returned **HTTP 402**. The deployment workflow therefore skipped the subsequent Mercado Libre smoke.

This Stage 2 batch does **not** hide or downgrade that 402. It only reorders independent provider gates so Mercado Libre evidence is collected before the unrelated opportunity-search failure.

## Limitations / residual risks

- The existing Mercado Libre implementation in `catalogProvider.ts` has not yet been migrated to call the new generic benchmark engine. This batch establishes and validates the abstraction first.
- No Google Shopping, Apify or other external discovery credential/provider has been invented or enabled.
- The real Mercado Libre production search state is still unknown because the previous deployment never reached its ML smoke.
- A real secondary provider must be selected/configured before cross-provider production success rate can be measured.
- The existing `MarketComparable.priceSource` compatibility labels remain `sale_price` / `search_price`; a provider-neutral evidence schema should replace these in the later benchmark-schema stage.

## Decision

**PASS WITH LIMITATIONS.**

The provider-independent engine and interfaces pass all deterministic adversarial gates and the entire application CI. Stage 2 is not declared fully complete until the existing Mercado Libre provider is migrated behind these contracts and a post-merge production smoke establishes actual provider health.

## Next actions

1. Merge PR #65 after completion-document CI passes.
2. Observe the reordered production Mercado Libre smoke.
3. Use that evidence to decide whether to prioritize ML adapter migration alone or immediately add a secondary discovery adapter.
4. Keep the Alibaba opportunity HTTP 402 as a separate provider incident; do not weaken the market benchmark to compensate for it.
