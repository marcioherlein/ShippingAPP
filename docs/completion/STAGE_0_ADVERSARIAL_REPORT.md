# Adversarial Test Report — Stage 0

## Scope

- Stage: 0 — Baseline, observability and adversarial harness
- Code validation SHA: `0ac01981079a4ede761fe7436b53cf4a1a31624b`
- PR: #43
- Environment: GitHub Actions / local Wrangler runtime; existing production smoke endpoint checked by CI
- CI run: `33267680517`
- CI conclusion: SUCCESS

## Persona A — Authentication attacker

User authentication is intentionally not implemented in Stage 0. The attacker's useful Stage 0 objective is therefore to identify which current public routes would become privilege/cost boundaries later.

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Route inventory identifies expensive public APIs | All high-cost routes explicitly classified | `/api/intake`, `/api/opportunity-search`, `/api/discover`, `/api/analyze` classified high-cost and target-authenticated/metered | P1 | PASS |
| Caller-supplied request ID | Must not control server correlation ID | Incoming `x-request-id` ignored; server UUID generated | P2 | PASS |
| New exact API route without classification | Test must fail | Route-drift test compares implementation to executable inventory | P1 | PASS |

Authentication bypass itself is deferred to Stage 2 because no user-auth boundary exists yet.

## Persona B — Tenant-isolation attacker

No user-owned persistence exists in Stage 0, so cross-tenant read/update/delete attacks are not yet applicable. Stage 1 introduces ownership columns and Stage 3 introduces private resources. This persona becomes blocking at those stages.

Result: NOT APPLICABLE TO CURRENT DATA MODEL; test obligations carried forward explicitly.

## Persona C — Economic-abuse attacker

High-cost endpoints are public in the pre-SaaS product. Stage 0 does not pretend to solve this; it makes the exposure explicit and introduces a coarse request-body guard before expensive provider work.

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Oversized declared API body | Reject before expensive handler | `Content-Length > 256 KiB` returns 413 and handler is not called | P2 | PASS |
| High-cost endpoints classified for future metering | No expensive route omitted | All current high-cost compute routes target authenticated + metered | P1 | PASS |

Concurrent-credit/replay/refund attacks are Stage 5 blocking tests because no credit ledger exists yet.

## Persona D — Billing/webhook attacker

Recurring billing does not exist in Stage 0. Mercado Libre's notification endpoint currently acknowledges payloads without mutating product/user/billing state. Authenticity/idempotency enforcement is mandatory before that webhook is allowed to trigger business state changes.

Result: NOT APPLICABLE TO BILLING; provider-webhook risk recorded for future implementation.

## Persona E — Reliability/privacy reviewer

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Malformed JSON | Controlled 4xx, no stack leak | `/api/chat` malformed JSON returns controlled 400 + request ID | P2 | PASS |
| Missing binding | Controlled operational failure | `/api/runtime-smoke` with missing bindings returns controlled 503 + request ID | P2 | PASS |
| Provider exception containing secret | Secret absent from response and logs | Exception message omitted; only error type logged | P1 | PASS |
| API response containing provider secret | Exact configured secret redacted | Response contains `[REDACTED]`, not secret | P1 | PASS |
| OAuth authorization code in query | Query value absent from request logs | Only pathname is logged | P1 | PASS |
| Unknown API route | Remains 404 with traceability | 404 + server request ID | P3 | PASS |
| Static asset | Instrumentation must not change asset behavior | No API header/log wrapper applied | P2 | PASS |
| Image redirect to untrusted host | Redirect must be revalidated and blocked | Redirect to `127.0.0.1` is rejected | P1 | PASS after remediation |
| Allowlisted image redirect chain | Legitimate redirect remains functional | `source.unsplash.com` → `images.unsplash.com` succeeds in regression test | P2 | PASS |

## Stage-specific finding

### ADV-0-001 — Image proxy redirect allowlist bypass

- Severity: **P1**
- Initial status: OPEN during adversarial review
- Attack path: `/api/image-proxy` validated the initial host and then used `fetch(..., { redirect: 'follow' })`. Redirect destinations were not explicitly revalidated by ShippingAPP.
- Impact: an allowlisted origin capable of redirecting could cause the Worker to fetch an unapproved destination, weakening the SSRF boundary.
- Root cause: host validation occurred before the request, while redirects were delegated to automatic fetch behavior.
- Remediation: changed image fetching to `redirect: 'manual'`, capped redirects, and validates every hop through the same host/protocol allowlist.
- Remediation commit: `4a63c6d00ce51ccd2ac57d5be8584851c4ac03b2`
- Regression tests commit: `4f4e6795610871da77c71dd50ba95b41193d5552`
- Retest: final Stage 0 CI run `33267680517` passed full unit/integration suite and Worker validation.
- Status: **CLOSED**

## Residual findings / accepted limitations

### ADV-0-002 — Body limit depends on declared Content-Length

- Severity: P2
- Status: ACCEPTED FOR STAGE 0
- Detail: the edge guard rejects declared payloads over 256 KiB. A streaming/chunked request without a usable `Content-Length` is not fully bounded by this guard.
- Rationale: Stage 0 provides a coarse pre-provider boundary without rewriting every parser. When authenticated request parsing is centralized, introduce a bounded body reader/stream limiter.
- Follow-up target: Stage 2 security boundary or earlier if a streaming abuse path becomes observable.

### ADV-0-003 — Mercado Libre bootstrap callback exposes authorization code to browser

- Severity: P2
- Status: ACCEPTED FOR CURRENT BOOTSTRAP FLOW
- Detail: the current administrative/bootstrap OAuth callback displays the short-lived authorization code. The new logging boundary ensures the query/code is not logged.
- Follow-up: replace manual bootstrap with a server-side OAuth exchange before treating the integration as a general production user OAuth flow.

### ADV-0-004 — Operational endpoints remain network-public

- Severity: P2
- Status: ACCEPTED FOR STAGE 0
- Detail: runtime/ML status endpoints are currently reachable because CI/operations use them. Their target classification is `internal` and their responses are constrained to avoid credential material.
- Follow-up: enforce operational access strategy without breaking deployment probes.

## Regression evidence

Final code validation CI run `33267680517` on SHA `0ac01981079a4ede761fe7436b53cf4a1a31624b`:

- Unit and integration tests: PASS
- NCM/SIM asset validation: PASS
- Production build: PASS
- `wrangler check`: PASS
- Wrangler deploy dry-run: PASS
- Local Worker runtime smoke: PASS
- Existing production Worker smoke: PASS

## Decision

- P0 open: 0
- P1 open: 0
- P2 accepted: 3
- P3 open: 0 blocking
- Adversarial decision: **PASS FOR MERGE**

Stage 0 must still verify the post-merge production deployment before the master tracker is marked completed.
