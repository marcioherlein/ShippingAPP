# Stage 6 Completion Report — Email Architecture and Preferences

**Date:** 2026-09-01  
**Status:** PASS / COMPLETED CANDIDATE  
**Stage:** 6 — Email architecture and preferences (development mode)

## Completion decision

Stage 6 satisfies the implementation, normal-test, adversarial-test, regression, build/Wrangler, production-boundary, audit and P0/P1 closure gates. Application email sending remains intentionally disabled in production; production sender/domain activation is a separate Stage 8 responsibility. Weekly digest scheduling is a Stage 7 responsibility.

Formal completion becomes final when this report is merged and master Issue #41 is updated.

## Implementation evidence

- Implementation PR: **#106 — SaaS Stage 6 — email architecture and preferences**
- Implementation merge: `213946f6db5c040b0fd426e457c590b473ae34fa`
- Final Stage 6 candidate head: `97f77437e9a6ca25e674617e6bce5002ba421f8c`
- Stage 6 was subsequently regression-tested on current `main`, including concurrent Argentina-market changes; current validated main at report creation: `771f3dad95cabb89022c443d093272182ba7ce24`.

## Delivered capability

- `EmailProvider` abstraction with a Resend adapter.
- Server-owned Clerk email/display-name synchronization into the local user record; email is not an identity key.
- Templates for welcome, usage, weekly digest, monitoring alert and billing communications.
- Explicit preference scopes: transactional, digest, alerts and marketing.
- Owner-scoped `/api/email-preferences` GET/PATCH API and signed-in preferences UI.
- Signed unsubscribe-token mechanism with confirmation flow.
- `email_events` idempotency and provider-message uniqueness enforcement.
- Recipient address derived only from server-owned user data.
- Environment-driven branding/sender configuration.
- Explicit `EMAIL_SENDING_ENABLED` kill switch.
- Production-safe `/api/email-runtime` operational status without secret/recipient leakage.
- Dedicated Stage 6 production schema and boundary workflow.

## Automated test evidence

Final PR CI:

- Run: `33506595514` — CI #1371 — **SUCCESS**
- Test files: **111/111 PASS**
- Tests: **661/661 PASS**
- D1 local migrations/schema: PASS
- NCM/SIM regression: PASS
- TypeScript/Vite production build: PASS
- Cloudflare configuration/dry-run: PASS
- Wrangler runtime smoke: PASS
- production public-shell smoke: PASS

Stage-specific suites include:

- provider adapter and header validation;
- application templates and HTML escaping;
- unsubscribe token signing/expiry/forgery;
- email repository ownership/idempotency;
- email service send/suppress/retry behavior;
- email preference and unsubscribe HTTP boundary;
- Clerk email/profile synchronization;
- D1 email schema invariants.

The first Stage 6 CI attempt exposed one fixture defect: the fake provider reused a provider message ID across distinct emails. D1 correctly rejected that collision. The fake was changed to issue unique IDs and the provider-message uniqueness defense remains fail-closed. Final CI is fully green.

## Adversarial evidence

The Stage 6 adversarial pass demonstrated:

- forged `userId`/owner input cannot change another user's preferences;
- server/service identity cannot impersonate a customer for owner-scoped preferences;
- forged, altered and expired unsubscribe tokens are rejected;
- a valid stale unsubscribe token after account deletion is handled idempotently without recreating data or exposing an account-existence signal;
- malicious product/title/digest HTML is escaped;
- CR/LF header injection is rejected;
- client-controlled recipient/from/reply-to state cannot redirect a user email;
- caller-controlled request origin cannot create a phishing unsubscribe URL; the base URL is server configuration only;
- repeated send events with the same idempotency key do not create duplicate sends;
- cross-user idempotency-key collision fails closed;
- provider API failures/timeouts are sanitized and do not expose provider payloads/secrets;
- optional communication preferences do not disable transactional/operational mail;
- message body content is not persisted in `email_events`.

Open P0 findings: **0**  
Open P1 findings: **0**

## Production evidence

Implementation deploy:

- Deploy Production #222 — run `33506778797` — **SUCCESS**
- Worker version: `c4c08553-aa03-4b73-973f-4bfab17accc3`
- Existing auth/history/watchlist/usage/product smokes: PASS

Dedicated Stage 6 gate:

- Stage 6 Email Production Gate #1 — run `33507304623` — **SUCCESS**
- remote `email_preferences` ownership PK/FK: PASS
- remote `email_events` user index/FK: PASS
- unique provider-message constraint/index: PASS
- production email boundary adversarial smoke: PASS

Current-main regression after concurrent product work:

- Deploy Production #226 — run `33523816321` — **SUCCESS**
- Stage 6 Email Production Gate #5 — run `33524422627` — **SUCCESS**

Production development-mode status is intentionally fail-closed:

- `EMAIL_SENDING_ENABLED=false`
- `providerConfigured=false`
- `senderConfigured=false`
- `unsubscribeConfigured=false`

This state is expected for Stage 6. It proves the application cannot accidentally send real lifecycle email before Stage 8 sender/domain/secrets are deliberately configured. Stage 6 completion does **not** authorize production email sending.

## Persistence / migration result

No Stage 6 migration was required. Stage 1 already created `email_preferences` and `email_events`; Stage 6 intentionally reused those tables and strengthened their validation/usage rather than creating duplicate persistence.

Remote production schema verification is PASS.

## Findings remediated during Stage 6

1. **Provider-message fixture collision** — discovered by CI; fixture corrected; real unique-provider-ID constraint retained.
2. **Unsubscribe-origin phishing risk** — unsubscribe URL construction changed to use only `EMAIL_PUBLIC_BASE_URL`, never caller origin.
3. **Accidental-send risk** — explicit `EMAIL_SENDING_ENABLED` kill switch added; sending defaults off.
4. **Stale token after user deletion** — valid stale token now returns idempotent success without account recreation or account-existence leakage.

## Accepted / deferred items

- **Stage 7:** scheduler, digest recipient selection, batching/retry/run tracking and recurring weekly delivery.
- **Stage 8:** final product name/domain, Resend production API key, verified sending domain, From/Reply-To/support mailbox, SPF/DKIM/DMARC and activation of `EMAIL_SENDING_ENABLED`.
- **P3:** Vite reports the main JS bundle above 500 kB; code splitting remains a launch-hardening optimization.
- **P3:** GitHub Actions reports Node 20 deprecation warnings from upstream actions; workflow functionality remains green.
- Pure Mercado Libre provider search remains independently constrained in production. The user-facing hybrid/direct-retailer Argentina path is green; this is not a Stage 6 email defect.

## Rollback / safety path

- Keep `EMAIL_SENDING_ENABLED=false` to disable all application email sending immediately.
- Revert Stage 6 runtime/UI changes if an application regression is discovered.
- Do not delete `email_preferences` or `email_events` during rollback; they are durable Stage 1 data structures and useful audit records.
- Stage 8 production activation is a separate controlled change and can be rolled back independently.

## Completion gate

- Implementation complete: **PASS**
- Normal tests: **PASS**
- Adversarial tests: **PASS**
- Regression: **PASS**
- Build/Wrangler: **PASS**
- Production smoke/boundary: **PASS**
- Implementation audit: **PASS**
- Completion report: **PASS once merged**
- P0/P1 zero: **PASS**
- Deferred P2/P3 documented: **PASS**

**Decision:** merge this completion report, update Issue #41, mark **Stage 6 COMPLETED**, and make **Stage 7 — Weekly digest scheduler** the active stage.
