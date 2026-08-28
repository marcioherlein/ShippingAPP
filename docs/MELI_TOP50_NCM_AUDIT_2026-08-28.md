# Mercado Libre Top-50 → ShippingAPP NCM audit — 2026-08-28

Production target: `https://shippingapp.marciofabrizio.workers.dev`

Audit branch: `audit/meli-top50-ncm-20260828`

This is an audit branch. It is intentionally not merged to `main`.

## Test basis

Mercado Libre documents an Argentina trends resource at `/trends/MLA` that represents 50 weekly search trends. The audit used the current Argentina public trend/search snapshot visible on 2026-08-28 and evaluated the first 50 terms as real user inputs.

Important: these are search terms, not necessarily 50 distinct importable products. The snapshot includes generic terms such as `samsung` and a non-product vertical such as `inmuebles`. Those cases pass only if ShippingAPP avoids inventing a high-confidence NCM.

Each term was run through production as:

1. `POST /api/intake`
2. preserve/extract product identity, category, material and function when available
3. `POST /api/ncm-classify`
4. validate NCM family or exact code where the search term is sufficiently deterministic
5. validate confidence and tariff hydration

The audit did not add product specifications that were absent from the Mercado Libre search term.

## Executive result

- Total search terms: **50**
- Passed end-to-end criterion: **3**
- Failed end-to-end criterion: **47**
- Pass rate: **6%**
- Unsafe high-confidence classifications: **0**
- Hard `/api/ncm-classify` HTTP 503 responses: **7**

Status counts from the automated audit:

| Status | Count |
|---|---:|
| Expected NCM family/code not returned (usually NO_NCM) | 39 |
| Correct family, but LOW confidence blocks economics | 1 |
| Safe broad/non-product handling | 2 |
| HTTP 503 | 7 |
| Correct usable NCM family | 1 |

The `39` figure must **not** be read as 39 confidently wrong classifications. In almost all of those cases ShippingAPP returned **no NCM at all** (`code: null`, `confidence: missing`). The problem is lack of usable classification coverage, not rampant confident hallucination.

## The three passes

### 1. `inmuebles`

- No NCM returned
- Confidence: missing
- Correct behavior: the query is not a concrete importable good, so ShippingAPP did not invent a code.

### 2. `notebook`

- NCM: **8471.30.19**
- Confidence: **medium**
- Correct family: 8471.30
- DIE: **16%**
- TE: **0%**
- VAT: **10.5%**

This is the only ordinary product in the 50-term set that produced a usable classification in this run.

### 3. `samsung`

- No NCM returned
- Confidence: missing
- Correct behavior: a brand name alone is not enough to identify a good.

## Partially correct but unusable

### `cocina gas`

- Returned NCM: **7321.11.00**
- Confidence: **low**
- Family is correct
- DIE: **20%**
- TE: **3%**
- VAT: **21%**
- `missingFacts: []`
- NCM call latency: approximately **24.2 s**

Because confidence is LOW, the current automatic pipeline blocks economics. The result is therefore not usable even though the family is correct. `missingFacts: []` is also a defect: if the engine blocks, it should tell the user what fact would resolve the uncertainty.

## Representative ordinary searches that returned NO_NCM

The production classifier returned no usable code for many highly recognizable goods, including:

- aire acondicionado / split / inverter
- Apple iPhone
- auriculares JBL
- celulares Samsung
- freezer
- freidora de aire / sin aceite
- heladera / no frost / Samsung
- iPhone 14 / 15 / 16 variants
- lavarropas / Drean / Samsung
- lavasecarropas
- microondas
- parlantes
- procesadora
- reloj inteligente
- Samsung A54
- Smart TV / Smart TV 43 pulgadas
- Starlink internet
- tablets
- televisores smart

For many of these, `code` was null and `confidence` was `missing` rather than a wrong high-confidence code.

## Intake problem occurs before NCM

A major upstream defect is that `/api/intake` frequently fails to preserve obvious retail product identity for terse searches.

Examples observed in production:

### `apple iphone`

- intake HTTP 200
- approximately 10.3 s
- `status: clarify`
- `intent: clarify`
- `name: null`
- `category: null`
- says `producto / categoría` is missing

### `iphone 14`

- intake HTTP 200
- approximately 7.3 s
- `status: clarify`
- `name: null`

### `samsung a54`

- intake HTTP 200
- approximately 9.1 s
- `status: clarify`
- `name: null`

### `microondas`

- intake HTTP 200
- approximately 8.2 s
- `status: clarify`
- `name: null`

These are not genuinely ambiguous product identities. The intake layer should identify them immediately and pass canonical product facts to the classifier.

## Cases where intake recognized the product but NCM still failed

The issue is not only intake.

### `auriculares jbl`

Intake preserved:
- name: `auriculares jbl`
- category: `Wireless headphones`
- function: `reproducir audio`

NCM still returned:
- code: null
- confidence: missing

### `termotanque electrico`

Intake preserved:
- name: `termotanque electrico`
- category: `Electric water heater`
- function: `calentar agua`

NCM endpoint then returned HTTP 503.

### `smart tv 43 pulgadas`

Intake preserved the product name but NCM returned no usable code.

This confirms a second defect in the classifier/retrieval layer independently of intake.

## Reliability

Seven NCM calls returned HTTP 503 under only six-way audit concurrency:

- `iphone 15 pro max`
- `iphone 16 plus`
- `iphone 16 pro max`
- `reloj smart watch`
- `secador de pelo`
- `televisor 50 pulgadas`
- `termotanque electrico`

This is a production reliability concern even before traffic scales.

## Latency

Several common products spent many seconds in the NCM path despite ending with no usable classification:

- `celulares samsung`: ~17.2 s
- `parlantes`: ~19.1 s
- `samsung a54`: ~19.9 s
- bare `samsung`: ~24.1 s
- `cocina gas`: ~24.2 s

Common consumer goods should not require a long AI/retrieval path just to find their obvious heading family.

## What is working correctly

- The nomenclator asset itself validated successfully: `NCM_APP.xlsx`, 2026-08-27, 10,504 NCM records and tariff data included.
- Existing regression suite passed before the Top-50 audit: 55 test files / 324 tests.
- Production runtime smoke passed.
- No case in this audit produced an unsafe, unjustified high-confidence NCM for a clearly ambiguous/non-product query.
- `notebook` demonstrated that the NCM + tariff hydration pipeline works when retrieval finds the right candidate.

## Diagnosis

### P0 — canonical product identification

ShippingAPP needs a deterministic normalization layer for common retail names before invoking the expensive classification path. Examples:

- iPhone / Samsung phone → smartphone / mobile telephone
- microondas → microwave oven
- secador de pelo → hair dryer
- termotanque eléctrico → electric storage water heater
- notebook → portable automatic data-processing machine
- smart TV → television receiver
- heladera / freezer → refrigerating/freezing equipment
- lavarropas → household washing machine
- freidora de aire → electrothermic domestic appliance
- auriculares → headphones/earphones

The purpose is not to hardcode arbitrary tariff results. It is to canonicalize the product identity and constrain NCM retrieval to the relevant heading family.

### P0 — family-first NCM retrieval

For obvious goods, retrieve/rank inside the likely NCM heading family instead of searching the entire nomenclator blindly. Exact subheading should still fail closed when the missing physical/function specification is legally discriminating.

### P0 — NCM endpoint reliability

Add bounded retry / concurrency protection / deterministic fast paths so ordinary classification requests do not return 503 under moderate parallel load.

### P1 — actionable missing facts

When confidence is low or classification is unresolved, populate `missingFacts` with the actual discriminators needed for the next step, rather than returning an empty list.

### P1 — latency

Fast-path common consumer goods so obvious product-family resolution occurs in milliseconds and only genuinely difficult tariff questions use the slow AI/retrieval path.

## Conclusion

ShippingAPP currently fails the practical Top-50 Mercado Libre test. The failure is primarily **NO_NCM / missing classification** and service reliability, not confident misclassification. The system is appropriately cautious, but far too cautious and brittle to classify ordinary high-volume consumer goods reliably.

The next corrective target should be: **recognize common product identity deterministically → retrieve within the correct NCM family → ask only the truly discriminating tariff question → hydrate tariffs → continue economics.**
