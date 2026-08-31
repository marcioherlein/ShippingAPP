# Argentina Market Benchmark V2 — implementation and adversarial validation plan

## Objective

Turn the Argentina market-price component into a fail-closed, source-agnostic benchmark. A local price may enter import economics only when ShippingAPP can trace the source, identify a sufficiently comparable product, and pass quality gates.

## Core design

Pipeline:

`Imported product -> product fingerprint -> Argentina discovery providers -> candidate normalization -> deterministic matching -> effective-price resolution -> benchmark statistics -> economics gate`

Mercado Libre is one provider, not the whole market service. Provider failure must degrade the benchmark without fabricating a price.

## Quality metrics

Every stage reports:

- precision: accepted candidates that truly satisfy the expected match class;
- false-positive rate: wrong variants/packs/accessories accepted;
- false-negative rate on the deterministic fixture set;
- provider availability rate on production probes;
- benchmark completion rate: queries producing >= 5 accepted comparables;
- effective-price coverage: accepted Mercado Libre comparables resolved through `sale_price`;
- traceability rate: comparables with source + URL/ID + timestamp/price source;
- fabrication incidents: target = 0.

Critical gate: false-positive rate for exact/strong comparables must remain <= 5% on the adversarial fixture suite. No stage may promote a benchmark into economics when the gate fails.

## Stage 0 — Observability and truthful CI

### Changes

1. Separate provider configuration, provider authentication, provider search availability, matching sufficiency and price-resolution quality.
2. Production smoke must distinguish `healthy`, `degraded`, `blocked` and `misconfigured`.
3. Add an optional strict production mode for release gates. A critical market smoke must not silently convert a broken configured provider into success.
4. Preserve fail-closed economics: no market price when benchmark quality is insufficient.

### Adversarial agents

- **Silent-failure agent:** expired token, 401/403, empty result set, timeout.
- **False-green agent:** verifies CI cannot claim market success merely because the endpoint returned HTTP 200.
- **Secret-leak agent:** ensures tokens and provider secrets never enter responses/log fixtures.

### Gate

All state transitions are test-covered; no fabricated benchmark; strict smoke exits non-zero for configured-but-broken critical provider paths.

## Stage 1 — Generic matcher / Product Fingerprint V2

### Changes

Replace the padel-centric matching core with generic evidence:

- normalized lexical overlap;
- model/alphanumeric identifiers;
- standalone model/version numbers;
- capacity/power/voltage/weight/size specs;
- pack quantity;
- product modifiers (`pro`, `max`, `plus`, `ultra`, etc.);
- predicted category and structured attributes;
- accessory/replacement hard rejects;
- brand-equity guardrails for unknown/private-label targets;
- existing padel rules retained only as a domain extension, not the base algorithm.

Expose rejection reasons/evidence in the next schema iteration.

### Adversarial agents

Fixture families include:

- iPhone model/storage variants;
- tools with different wattage/model;
- single unit vs multi-pack;
- full product vs replacement/accessory;
- new vs used;
- generic/private-label vs premium branded products;
- same product with title reordering/noise;
- existing padel regressions.

### Gate

>= 95% classification accuracy on the deterministic adversarial set and 0 known high-severity false positives (wrong model, wrong capacity, wrong pack, accessory-as-product).

## Stage 2 — Mercado Libre hybrid provider

### Changes

Split discovery from authoritative item pricing:

- discovery provider returns candidate MLA IDs;
- official Mercado Libre item endpoint enriches attributes where permitted;
- official `/items/{id}/sale_price?context=channel_marketplace` resolves effective marketplace price;
- listed/search price remains explicitly lower-quality fallback;
- current OAuth/KV rotation remains reusable.

External discovery can be added behind an adapter when credentials are supplied; it must not be embedded into matching/economics logic.

### Adversarial agents

- ML `/users/me` works but search returns 403;
- discovery works but `sale_price` fails;
- stale/duplicate candidate IDs;
- wrong variant returned near top of search;
- only 1–4 valid comparables.

### Gate

No single ML endpoint failure crashes the market service. Benchmark is `live` only when accepted comparable count and price-quality rules pass.

## Stage 3 — Secondary Argentina discovery provider

Add Google Shopping Argentina or equivalent behind the same provider interface, after credentials/provider choice are configured.

### Gate

Provider independence demonstrated: disabling either provider still produces truthful output; no duplicate offer is counted twice.

## Stage 4 — Benchmark engine V2

Return separate populations:

- `exact`;
- `equivalent`;
- `category_comparable`.

Only allowed classes enter automatic economics. Report P25, median, P75, competitive-price recommendation, freshness, source coverage and confidence.

## Stage 5 — Real-world validation

Maintain a curated 30+ product validation corpus spanning electronics, home, tools, sports, toys, commodities and white-label Alibaba products.

Manual gold labels are compared against automated results. Release requires:

- exact/strong precision >= 95%;
- 0 fabricated prices;
- traceability = 100% for promoted comparables;
- provider outage does not fabricate or reuse stale benchmark as live;
- benchmark result explains source and quality.

## Completion reporting

Each implementation batch must add/update a completion report containing:

- files changed;
- tests added;
- adversarial cases;
- measured success rate;
- known failures;
- residual risks;
- decision: PASS / PASS WITH LIMITATIONS / FAIL;
- next highest-leverage action.
