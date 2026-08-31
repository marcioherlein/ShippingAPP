# ShippingAPP SaaS Route & Provider Inventory

Status: updated through SaaS Stage 4 implementation

This document records the production API surface and the intended SaaS authorization/metering posture. The executable source of truth is `worker/routePolicy.ts`; CI detects drift between exact routes implemented by the Worker and this policy inventory.

## Current route posture

| Route | Methods | Production boundary | Target metered | Cost risk | External dependency |
|---|---|---|---:|---|---|
| `/api/image-proxy` | GET, HEAD | public | no | medium | remote product-image host |
| `/api/me` | GET | authenticated user | no | low | Clerk |
| `/api/history` | GET, POST | authenticated user + owner scope | no | low | none |
| `/api/history-item` | GET, DELETE | authenticated user + owner scope | no | low | none |
| `/api/watchlist` | GET, POST | authenticated user + owner scope | no | low | none |
| `/api/watchlist-item` | GET, DELETE | authenticated user + owner scope | no | low | none |
| `/api/watchlist-refresh` | POST | authenticated user + owner scope | **yes target** | high | Argentina market providers |
| `/api/runtime-smoke` | GET | internal/service | no | low | none |
| `/api/alibaba-direct-probe` | POST | internal/service | no | medium | Alibaba |
| `/api/alibaba-native-probe` | POST | internal/service | no | high | Cloudflare Browser / Alibaba |
| `/oauth/mercadolibre/callback` | GET | provider callback | no | low | Mercado Libre |
| `/api/mercadolibre/callback` | GET | provider callback | no | low | Mercado Libre |
| `/api/mercadolibre/notifications` | GET, POST | provider webhook | no | low | Mercado Libre |
| `/api/mercadolibre/status` | GET | internal/service | no | medium | Mercado Libre |
| `/api/mercadolibre/benchmark` | POST | authenticated | yes target | medium | Mercado Libre |
| `/api/argentina-market/benchmark` | POST | authenticated | yes target | high | Mercado Libre, SerpApi/direct retailers |
| `/api/chat` | POST | authenticated | no* | medium | Cloudflare Workers AI |
| `/api/intake` | POST | authenticated | yes target | high | Workers AI, market providers, BCRA |
| `/api/opportunity-search` | POST | authenticated | yes target | high | Parse.bot / Alibaba |
| `/api/discover` | POST | authenticated | yes target | high | Cloudflare Browser / Alibaba |
| `/api/ncm-classify` | POST | authenticated | yes target | medium | Workers AI |
| `/api/analyze` | POST | authenticated | yes target | high | Alibaba, Workers AI, market providers, BCRA |

`*` Chat authentication is enforced; whether an individual chat turn consumes a credit remains a Stage 5 entitlement-policy decision.

`target metered` describes the contractual destination in `routePolicy.ts`. Stage 5 introduces the atomic credit/entitlement enforcement. Stage 4 therefore marks `/api/watchlist-refresh` as a metered target because it can perform external market-provider work, while ordinary list/add/detail/remove operations remain unmetered.

## Authentication and identity boundary

`worker/entry.ts` invokes `authorizeRequest()` before stateful SaaS handlers. Caller-supplied trusted-looking identity headers are removed. When `AUTH_ENFORCEMENT=true`, authenticated routes require either a validated Clerk user session or, for operational testing of selected compute routes, the server-only internal credential. Stateful user handlers such as History and Watchlist additionally require `readTrustedUserId()`, so the internal service identity cannot become a user owner.

User ownership never comes from request bodies or query parameters.

## Stage 3 private History boundary

History is automatic after a completed analysis and is distinct from explicit monitoring.

- `/api/history` POST persists a completed analysis under the authenticated user.
- `/api/history` GET lists only that user's visible completed analyses.
- `/api/history-item` GET/DELETE always constrain by owner.
- missing and cross-tenant IDs intentionally return indistinguishable not-found behavior.
- soft deletion removes the item from History without rewriting its completed calculation.

## Stage 4 Watchlist boundary

Watchlist membership is explicit: the user chooses **Seguir producto** from an owned completed analysis.

### `/api/watchlist` POST

The only meaningful client field is `analysisId`. The Worker loads that analysis with the authenticated owner's History repository and derives all persistent fields server-side:

- title;
- source URL / stable fallback identity;
- NCM metadata;
- completed-analysis unit landed-cost basis;
- FX basis and source timestamp;
- initial market evidence.

Caller-supplied `userId`, title, URL, market price, landed cost, margin or similar economic fields do not become trusted data.

The schema-level `UNIQUE(user_id, source_url)` constraint and an owner-scoped upsert prevent duplicate followed items. Removing a follow sets `active=0`; re-adding the same source reactivates the same item and preserves its snapshot history.

### Snapshots

Every snapshot is generated inside the Worker. `watchlist_snapshots` has no direct user ID; tenant ownership is inherited through its `watchlist_item_id`, and all application reads join back to `watchlist_items.user_id`.

Snapshots preserve provenance including observation time, market status/source and the landed-cost basis timestamp. An initial snapshot is built from the completed analysis. A manual refresh performs a fresh Argentina market lookup, but does not falsely claim that historical freight/customs/FX inputs were recomputed: the landed-cost portion remains explicitly tied to the completed-analysis basis.

Refresh idempotency is server-namespaced by watchlist item. A replay is detected before provider work and returns the existing snapshot without another external call.

If market data is unavailable or insufficient, the new snapshot stores a null market price and an unavailable/insufficient status. The change calculation returns null rather than treating missing data or the previous trusted price as a new market movement.

Raw upstream exception messages are never persisted into snapshot provenance or returned to the user; provider failure is reduced to a generic availability signal.

## External provider inventory

### Cloudflare Workers AI
Used for product extraction/classification, import analysis and conversational intake. Main risks: uncontrolled compute consumption, provider timeout, malformed model output and accidental propagation of provider errors.

### Cloudflare Browser / Alibaba
Used in first-party/fallback Alibaba extraction and diagnostics. Main risks: expensive browser execution, timeout, upstream markup drift and repeated-request abuse.

### Parse.bot
Optional Alibaba provider/supplement. `PARSEBOT_API_KEY` is a secret. Provider errors are untrusted and must not expose credentials.

### Mercado Libre
Uses OAuth credentials/access-token rotation for authenticated provider diagnostics/benchmarking. Current Mercado Libre listing/catalog behavior can yield insufficient pure-provider evidence even with healthy authentication; ShippingAPP fails closed instead of fabricating a price.

### Argentina market direct-retailer / optional SerpApi evidence
The authoritative user-path market overlay can use traceable Argentine retailer evidence. Watchlist refresh consumes the same trusted market orchestration. Missing/stale provider evidence must be represented explicitly rather than carried forward as current.

### BCRA
Used for FX reference data. No application credential is currently required, but provider freshness/availability affects economics.

### Remote image hosts
The image proxy remains public. Domain/SSRF constraints remain part of its security boundary.

## Request and privacy boundary

For `/api/*` and `/oauth/*`, the Worker request context:

1. creates a server-generated request ID;
2. ignores caller-supplied request IDs;
3. attaches `x-request-id` to API responses;
4. records only safe request metadata in structured logs;
5. does not intentionally log query strings or request bodies;
6. converts uncaught exceptions to a generic 500 response;
7. redacts configured provider secrets/common credential fields from textual API responses;
8. rejects oversized declared request bodies before invoking expensive handlers.

Stateful repositories add their own validation/size boundaries before D1 persistence.

## Known follow-up

- Stage 5 must enforce the target metering/entitlement policy atomically, including `/api/watchlist-refresh`; Stage 4 establishes authentication, owner scope, replay safety and trusted snapshot semantics but does not yet debit credits.
- Stage 11 will decide scheduled monitoring cadence and whether scheduled snapshots recompute more of the landed-cost basis rather than retaining the last completed-analysis basis.
- Watchlist list rendering currently performs a bounded per-item snapshot lookup. This is acceptable at current scale but can be optimized into a batched/window query as usage grows.
- Manual analyses without a canonical product URL use an analysis-scoped fallback source identity, so two independently created manual analyses of the same real product are not automatically deduplicated.
- The public image proxy remains a separate SSRF/security surface.

## Change-control rule

Any future exact `/api/*` or `/oauth/*` route must be added to `API_ROUTE_POLICIES` in the same change. A route-inventory test intentionally fails if implementation and classification drift apart.
