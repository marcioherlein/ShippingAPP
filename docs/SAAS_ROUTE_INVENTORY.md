# ShippingAPP SaaS Route & Provider Inventory

Status: Stage 0 baseline

This document records the current API surface before authentication, persistence, metering and billing are introduced. The executable source of truth is `worker/routePolicy.ts`; CI tests detect drift between exact routes implemented in `worker/enrich.ts` / `worker/index.ts` and the policy inventory.

## Current route posture

| Route | Methods | Current access | Target access | Target metered | Cost risk | External dependency |
|---|---|---|---|---:|---|---|
| `/api/image-proxy` | GET, HEAD | public | public | no | medium | remote product-image host |
| `/api/runtime-smoke` | GET | operational | internal | no | low | none |
| `/oauth/mercadolibre/callback` | GET | provider callback | provider callback | no | low | Mercado Libre |
| `/api/mercadolibre/callback` | GET | provider callback | provider callback | no | low | Mercado Libre |
| `/api/mercadolibre/notifications` | GET, POST | provider webhook | provider webhook | no | low | Mercado Libre |
| `/api/mercadolibre/status` | GET | operational | internal | no | medium | Mercado Libre |
| `/api/mercadolibre/benchmark` | POST | public | authenticated | yes | medium | Mercado Libre |
| `/api/chat` | POST | public | authenticated | no* | medium | Cloudflare Workers AI |
| `/api/intake` | POST | public | authenticated | yes | high | Workers AI, Mercado Libre, BCRA |
| `/api/opportunity-search` | POST | public | authenticated | yes | high | Parse.bot / Alibaba |
| `/api/discover` | POST | public | authenticated | yes | high | Cloudflare Browser / Alibaba |
| `/api/ncm-classify` | POST | public | authenticated | yes | medium | Workers AI |
| `/api/analyze` | POST | public | authenticated | yes | high | Parse.bot, Browser, Workers AI, Mercado Libre, BCRA |

`*` Chat authentication is required in the target state; whether individual chat turns consume credits is deliberately deferred to the Stage 5 entitlement design.

## Stage 0 finding

The expensive computation routes are currently public because ShippingAPP has not yet implemented user authentication. This is accepted only as a pre-SaaS baseline and is explicitly scheduled for Stage 2 (authentication) and Stage 5 (atomic metering).

High-cost routes must not remain public at SaaS launch.

## External provider inventory

### Cloudflare Workers AI
Used for product extraction/classification, import analysis and conversational intake. Main risks: uncontrolled compute consumption, provider timeout, malformed model output and accidental propagation of provider errors.

### Cloudflare Browser
Used as a fallback/live browser path for Alibaba. Main risks: expensive browser execution, timeout and abuse through repeated requests.

### Parse.bot
Used for Alibaba product/opportunity extraction. `PARSEBOT_API_KEY` is a secret. Provider error messages must be treated as untrusted and must not expose credentials to clients.

### Mercado Libre
Uses OAuth credentials/access tokens for authenticated market benchmarking. Sensitive values include access tokens, refresh tokens and client secret. OAuth authorization codes are sensitive and must not appear in logs.

### BCRA
Used for FX reference data. No application credential is currently required, but provider availability can block current economics.

### Remote image hosts
The image proxy retrieves product images. The proxy remains a public capability, so domain/SSRF constraints remain part of its security boundary.

## Request boundary introduced in Stage 0

`worker/entry.ts` wraps the existing Worker without changing core domain calculations. For `/api/*` and `/oauth/*` it:

1. creates a server-generated UUID request ID;
2. ignores caller-supplied request IDs;
3. attaches `x-request-id` to API responses;
4. records only method, pathname, route classification, status and duration in structured logs;
5. does not log query strings or request bodies;
6. converts uncaught exceptions to a generic 500 response;
7. redacts configured provider secrets and common credential fields from textual API responses;
8. rejects requests whose declared `Content-Length` exceeds 256 KiB before invoking an expensive handler.

## Known Stage 0 limitations / follow-up

- The 256 KiB boundary is enforced against declared `Content-Length`. A streaming/chunked request without a declared length is not fully bounded by this Stage 0 guard. A full bounded JSON reader can be introduced when protected request parsing is centralized.
- Mercado Libre's current bootstrap callback displays an authorization code to the browser by design. The code is not logged; the production OAuth lifecycle should later exchange provider codes server-side rather than rely on a manual bootstrap flow.
- Mercado Libre notification processing currently acknowledges payloads but does not act on them. When business logic is added, signature/authenticity and idempotency validation become mandatory.
- Operational endpoints are still network-public today. Their target state is `internal`, to be enforced in a later security stage without breaking existing CI/deployment probes.

## Change-control rule

Any future exact `/api/*` or `/oauth/*` route must be added to `API_ROUTE_POLICIES` in the same change. A route-inventory test intentionally fails if implementation and classification drift apart.
