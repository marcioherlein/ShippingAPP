# Stage 7 Completion Report — Weekly Digest Scheduler

**Date:** 2026-09-01  
**Status:** PASS / COMPLETED CANDIDATE  
**Stage:** 7 — Weekly digest scheduler

## Completion decision

Stage 7 satisfies the implementation, normal-test, adversarial-test, regression, build/Wrangler, production-schema, scheduler-boundary, audit and P0/P1 closure gates. The hourly reconciler is deployed and its persistence/privacy/idempotency boundaries are verified in production. Real application email delivery remains intentionally disabled (`EMAIL_SENDING_ENABLED=false`) until Stage 8 configures the final sender/domain identity.

Formal completion becomes final when this report is merged and master Issue #41 is updated.

## Implementation evidence

- Implementation PR: **#118 — SaaS Stage 7 — weekly digest scheduler**
- Implementation merge: `e1ecc704cc02362ee4b97d0d4f4301ce8f175c6b`
- Final Stage 7 candidate head: `8cfcb97f9986ba7f0a58707af2dcdf39487864c2`
- Main-drift reconciliation before implementation merge: PR **#124**
- Merge-candidate CI: run `33559779962` — CI #1439 — **SUCCESS**
- Stage 7 was subsequently regression-tested on later concurrent product work; current validated main at report creation: `868763559d21656c19441f0c7e056c6704a5d2d8`.

## Delivered capability

- Cloudflare hourly reconciler configured with cron `0 * * * *`.
- Weekly logical run key (`weekly:<Monday date>`) and Monday 11:00 UTC due policy.
- At most one logical digest per user/week through run/recipient idempotency plus Stage 6 email-event idempotency.
- Durable `digest_runs` and `digest_run_recipients` persistence.
- Atomic weekly-run lease with expiry so concurrent cron invocations cannot both cross the delivery boundary; abandoned leases are recoverable.
- Bounded batches (default 50, hard maximum 100), cursor continuation and bounded recipient retry attempts.
- Owner-scoped digest construction from each recipient's active Watchlist only.
- Maximum 12 Watchlist products per digest.
- Stale, missing, corrupt or unavailable market evidence is represented honestly as unavailable; it is never promoted into a fabricated movement.
- Digest preference and valid server-owned recipient-email eligibility checks.
- Per-recipient failure isolation: one rendering/provider failure does not abort the rest of the batch.
- Aggregate-only operational dry-run/runtime visibility without persisting or returning message bodies, product titles or recipient addresses.
- Production-safe disabled mode while Stage 8 sender/domain activation is pending.

## Automated test evidence

Current-main CI:

- Run: `33560212050` — CI #1447 — **SUCCESS**
- Test files: **122/122 PASS**
- Tests: **712/712 PASS**
- Stage 7 scheduler suite `worker/weeklyDigest.test.ts`: **10/10 PASS**
- Stage 7 lease suite `worker/weeklyDigestLease.test.ts`: **2/2 PASS**
- Stage 7 schema/privacy suite `scripts/digest-schema-privacy.test.ts`: **10/10 PASS**
- D1 local migrations/schema: **PASS**
- D1 validator: **14 tables, 19 required indexes, 4 migrations**, Stage 7 weekly-run/recipient idempotency+privacy + rollback probe — **PASS**
- NCM/SIM regression: **PASS**
- TypeScript/Vite production build: **PASS**
- Cloudflare config/dry-run: **PASS**
- Wrangler runtime smoke: **PASS**
- production public-shell smoke: **PASS**

The same CI also retained the Stage 0–6 auth/history/watchlist/usage/email regressions and current product-engine tests.

## Adversarial evidence

The Stage 7 adversarial pass demonstrated:

- duplicate or simultaneous cron invocations cannot produce two logical weekly deliveries for the same user;
- an abandoned run lease can expire and be safely recovered;
- scheduler retry after a partial batch resumes from durable state rather than restarting all recipients;
- repeated delivery uses a stable per-week/per-user idempotency key;
- one user's rendering/provider failure is isolated from other recipients;
- provider failure/rate limiting is bounded by recipient attempt limits;
- batching remains bounded under 10x expected recipient volume;
- opted-out users and users without an active Watchlist are not eligible;
- recipient email is derived from server-owned user state;
- digest content is built by owner-scoped Watchlist queries for that same user;
- stale/unavailable/corrupt snapshots do not create false price/margin movements;
- scheduler persistence does not contain message HTML/text, product-title or recipient-email columns;
- `email_event_id` is the only intentionally email-named scheduler column and is an opaque FK to the Stage 6 event audit record;
- operational dry-run/runtime output is aggregate-only and does not expose recipients or message content.

Open P0 findings: **0**  
Open P1 findings: **0**

## Production evidence

The original implementation deploy (#231) was cancelled by GitHub Actions concurrency after a newer `main` commit superseded it; this was not accepted as completion evidence.

Current-main production regression:

- Deploy Production #232 — run `33560212093` — **SUCCESS**
- Production D1 migrations: **PASS**, including `0004_weekly_digest_scheduler.sql`
- Production D1 schema verification: **PASS**
- Auth/history/watchlist/usage boundary smokes: **PASS**
- Runtime, Alibaba, Argentina market, hybrid economics, Mercado Libre diagnostic, opportunity search and intake/NCM regression: **PASS**

Dedicated Stage 7 production gate:

- Stage 7 Digest Production Gate #2 — run `33560744594` — **SUCCESS**
- hourly reconciler cron `0 * * * *`: **PASS**
- remote `digest_runs` table/indexes: **PASS**
- remote `digest_run_recipients` table/indexes: **PASS**
- run lease owner/expiry columns: **PASS**
- run/user/email-event foreign keys: **PASS**
- scheduler persistence privacy allowlist: **PASS**
- production digest-boundary adversarial smoke: **PASS**
- production dry-run result: `status=ok`, weekly run key resolved, aggregate eligibility returned, `sendingEnabled=false` — **PASS / EXPECTED**

`EMAIL_SENDING_ENABLED=false` is intentional. Stage 7 proves safe scheduling, recipient selection, persistence and retry boundaries without authorizing real application-email delivery before Stage 8.

## Persistence / migration result

Migration `0004_weekly_digest_scheduler.sql` is installed and validated in production.

The production gate confirms:

- `digest_runs` exists;
- `digest_run_recipients` exists;
- required run/recipient indexes exist;
- lease state exists;
- run/user/email-event foreign keys exist;
- scheduler tables do not persist recipient addresses or message/product content.

## Findings remediated during Stage 7

1. **Concurrent cron delivery risk** — hardened with an atomic weekly-run lease and expiry/recovery semantics.
2. **Unbounded retry/volume risk** — bounded batch size, cursor continuation and maximum recipient attempts.
3. **Cross-user digest/privacy risk** — digest assembly uses owner-scoped Watchlist access only; scheduler persistence stores opaque user/event references, not message content.
4. **Stale/unavailable-data false-movement risk** — freshness and evidence-status rules fail closed and explicitly report missing/stale evidence.
5. **Schema-content creep risk** — exact scheduler-column privacy allowlist added to CI and production validation.

## Accepted / deferred items

- **Stage 8:** final app/domain identity, Resend production credentials, verified sending domain, From/Reply-To/support mailbox, SPF/DKIM/DMARC, production unsubscribe URL and controlled activation of `EMAIL_SENDING_ENABLED`.
- **Stage 11:** Pro event-triggered monitoring alerts and alert thresholds/deduplication; Stage 7 only owns the weekly digest.
- **P3:** Vite reports the main JS bundle above 500 kB; code splitting remains a launch-hardening optimization.
- **P3:** GitHub Actions reports Node 20 deprecation warnings from upstream actions while running under Node 24; workflows remain green.
- Pure Mercado Libre provider search remains independently constrained; user-facing Argentina market/economics retains its traceable hybrid/direct-retailer path and is not a Stage 7 defect.

## Rollback / safety path

- Keep `EMAIL_SENDING_ENABLED=false` to prevent all application-email delivery immediately.
- Remove/disable the cron trigger if scheduler execution itself must be stopped.
- Revert Stage 7 Worker/scheduler code if a runtime regression appears.
- Preserve `digest_runs`, `digest_run_recipients` and `email_events` during rollback so idempotency/audit state is not lost.
- Stage 8 production sender activation remains an independent controlled change and can be rolled back without removing scheduler persistence.

## Completion gate

- Implementation complete: **PASS**
- Normal tests: **PASS**
- Adversarial tests: **PASS**
- Regression: **PASS**
- Build/Wrangler: **PASS**
- Production migration/schema: **PASS**
- Production scheduler boundary: **PASS**
- Implementation audit: **PASS**
- Completion report: **PASS once merged**
- P0/P1 zero: **PASS**
- Deferred P2/P3 documented: **PASS**

**Decision:** merge this completion report, update Issue #41, mark **Stage 7 COMPLETED**, and make **Stage 8 — Production brand/domain/email readiness** the active stage.
