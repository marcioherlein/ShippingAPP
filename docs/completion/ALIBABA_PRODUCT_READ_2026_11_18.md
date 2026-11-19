# Alibaba customer-link read reliability

Reported listing: `1601389995797`, Factory Manufacture Inner Bladder Basketball Making. The actual item is a winding machine used in ball production; the truncated URL slug omits important identity words.

## Cause and change

The customer route could chain an unbounded detail fetch, public corroboration, rendered HTML, structured browser extraction/retries and optional provider lookups beyond the browser's 30-second limit. It also required all seven commercial/logistics signals before finishing, even when the supplier omitted packing dimensions. Earlier diagnostics tested individual readers or only a nonempty product name, allowing a URL-derived title to look like a successful read.

The resolver now has a 20-second total budget; the HTTP handler has a 22-second safety bound spanning retry and body consumption. Provider deadlines include response bodies and cancellation, with time reserved for the configured structured rescue. Inner deadlines leave time to return evidence before the outer guard. Free intake finishes when an observed identity, published offer and MOQ are available; unknown freight facts stay pending.

The direct provider corroborates only cards matching the exact Alibaba product ID. It retains the observed full title, original price/currency and MOQ. Public result headings remain search context rather than a confirmed product category. Native extraction no longer substitutes URL words for a missing title. Structured results cannot relabel that provisional identity as verified without an actual name. Categories are derived only after identity verification, and later supplier categories replace derived labels.

Structured lookup tries the working exact-URL POST first, uses one shared deadline, rejects contradictory product IDs and never takes a neighbouring search result. Unqualified dimensions such as `500X1430X1420` stay as original evidence; they no longer become 1,015.3 m³ by assuming centimetres. Explicit units convert normally, and packaged/gross weight takes precedence over generic/net weight.

The client keeps one error message, the complete URL and a clear retry action. Authentication waits remain authentication errors instead of being misreported as supplier-read timeouts. The existing 30-second client limit has not been increased.

## Evidence and validation

- The original public detail response was HTTP 200 CAPTCHA with no usable product data. Normal public listing surfaces exposed the exact card, including the full machine title, MOQ 1 set and offers in USD/EUR. A real direct probe recovered USD 2,700 in approximately four seconds. Repeating with Worker headers returned different listings without that ID; this variability is explicitly not treated as a guarantee of live extraction.
- The pre-fix authenticated Cloudflare diagnostic returned in 15 seconds using its configured structured rescue, but retained the URL title and produced the ambiguous-unit volume. Its native-reader diagnostic exceeded 40 seconds. The normalized output was insufficient evidence that the customer path worked.
- Local full suite: 206 files, 1,351 tests passed; production build and bundle budgets pass. The repository has no lint script; diff checks accompany the build/tests.
- Client browser tests cover the exact tracked URL, single-error recovery/retry, progress release, saved input and absence of paid-analysis calls in mobile/desktop Chromium and WebKit. Their provider responses are controlled fixtures.
- `scripts/smoke-production-product-read.mjs` is a separate deployment gate for the actual free `/api/product-read` route and reported URL. It requires an observed machine identity, matching provider product ID, published offer, MOQ, a response inside the acceptance deadline, no paid reservation and no return of the known ambiguous-volume regression. A diagnostic workflow collecting errors is not this acceptance gate.

Evidence and captures are retained, when that workspace is available, in `/workspace/shipping-review/alibaba-link-2026-11-18/`. Production success must be recorded separately after the new gate completes against the deployed release. No new provider subscription or credential was installed.

## Production acceptance found a second deadline problem

PR 221 passed 1,351 unit/integration tests and 154 browser tests, and its public build was checked in 320/390/1440 viewports. The deployed diagnostic recovered the exact machine, USD 2,700 and MOQ 1 in 11.7 seconds using `GET product_id`, with ambiguous volume correctly left unknown. A separate customer-route gate then returned 503 after 20.2 seconds. That successful diagnostic is therefore not evidence of stable acceptance.

The structured reader still cut every individual lookup at 3.5 seconds, cycling through request variants while discarding slower useful responses. The provider's public marketplace specification confirms `get_product` uses GET with required `product_id`; its [official GET execution documentation](https://docs.parse.bot/api-reference/execute/execute-an-api-endpoint-get.md) matches that contract. The follow-up gives this canonical exact-ID lookup up to eight seconds and a single exact-URL POST compatibility fallback within the same shared deadline. Free intake limits the direct stage to six seconds when structured rescue is configured and reserves twelve seconds for that rescue. No-key operation retains its first-party budget; the overall 20/22/30-second resolver/server/client limits do not increase.

Provider-stage timing and outcome metadata accompanies unsuccessful reads, without raw responses, credentials or supplier request URLs. The production customer gate now requires three separate strict reads; it stops on the first failure and never retries a failed acceptance until it happens to pass. An integration regression also requires recovery of a seven-second structured response after stalled first-party readers, instead of repeatedly aborting it at 3.5 seconds. An original EUR offer survives a later reader supplying only its missing MOQ. Follow-up local validation: 1,358 tests across 206 files, production build, bundle checks and Worker dry-run passed. Live acceptance of this follow-up remains pending until its deployment gate completes.
