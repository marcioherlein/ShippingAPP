# Stage 5 Completion Report — Usage, Credits and Atomic Entitlements

**Status:** PASS / COMPLETED  
**Date:** 2026-09-01  
**Implementation PR:** #98  
**Drift reconciliation PR:** #102  
**Production recovery hotfix PR:** #103  
**Implementation merge:** `d650fb399679e09cb840a6db1dc99946492c0906`  
**Final validated main:** `d85075688cd8a582ac5306eef2729677203e2331`  
**Production deployment:** #218 / run `33500194342` — SUCCESS  
**Decision:** PASS

## 1. Scope delivered

Stage 5 establishes server-owned usage accounting and plan entitlements for authenticated customer work. Client-provided plan, owner, credit balance or entitlement fields are not authoritative.

Delivered capability:

- Free / Pro / Business entitlement configuration with 3 / 30 / 100 monthly credits.
- Authenticated `GET /api/usage` usage view.
- Liquid-glass account usage badge backed by the server usage view.
- D1 `credit_reservations` state machine and append-only consume/refund ledger.
- Atomic reservation before expensive provider work.
- Idempotent replay protection for metered POST operations.
- Exactly one credit for the full analysis journey from `/api/analyze` or `/api/intake` into `/api/ncm-classify`.
- Owner-scoped, server-issued NCM continuation reservations; the reservation transport identifier is removed before normal application/history persistence.
- Explicit credit rules for high-cost routes, including discovery/opportunity, Argentina and Mercado Libre benchmarks and Watchlist refresh.
- Operational service identity remains separate from customer identity and does not create, inspect or debit a customer usage account.
- Production D1 schema/invariant validation and a Stage 5 usage-boundary adversarial smoke added to the deploy gate.

## 2. Implementation components

Primary Stage 5 components include:

- `migrations/0003_usage_entitlements.sql`
- `worker/persistence/usageRepository.ts`
- `worker/usage.ts`
- `worker/usage.test.ts`
- `worker/usageAbuse.test.ts`
- `worker/entry.ts`
- `worker/routePolicy.ts`
- `src/lib/usage.ts`
- `src/components/UsageBadge.tsx`
- `src/lib/apiClient.ts`
- NCM continuation transport changes in product analysis/intake clients
- `scripts/smoke-production-usage-boundary.mjs`
- Stage 5 extensions to `scripts/validate-d1-schema.mjs`
- Stage 5 production D1 and smoke gates in `.github/workflows/deploy-production.yml`
- `scripts/d1-migration-portability.test.ts` added after the production D1 parser finding.

## 3. Functional and economic rules

### Reservation and settlement

Authenticated metered work follows this order:

1. server authentication/authorization;
2. server-side entitlement and quota reservation in D1;
3. provider/AI/browser work;
4. settle on useful success or release/refund on qualifying failure.

D1 triggers enforce quota and ledger invariants at write time so parallel requests cannot all observe and consume the same final credit.

### Full analysis continuation

A completed product extraction waiting for user confirmation/NCM is useful delivered work and remains charged. NCM continuation reuses the original full-analysis reservation and does not debit a second credit.

### Refund and retry policy

Qualifying failures release the reservation exactly once. Refunds restore the user's normal credit balance but do not erase the historical provider attempt from the append-only consume ledger. Total attempted paid work is capped at four times the period credit allowance, preventing provider-error/refund loops from becoming unlimited free external work.

### Idempotency

A logical operation key is unique per user. Replays return or continue the existing operation rather than invoking duplicate provider work or double-charging. Released retries are allowed only inside the original active usage period and within the attempt budget.

## 4. Automated verification evidence

### Final main CI

Main CI #1304, run `33500194362`: **SUCCESS**.

- Test files: **102 / 102 passed**.
- Tests: **614 / 614 passed**.
- Final automated test success rate: **100%**.
- `worker/usage.test.ts`: **14 / 14 passed**.
- `worker/usageAbuse.test.ts`: **4 / 4 passed**.
- D1 remote-migration portability regression: **2 / 2 passed**.
- D1 local validation: **12 tables, 16 required indexes, 3 migrations**.
- Stage 5 atomic reservation/ledger constraints: **PASS**.
- D1 rollback probe: **PASS**.
- NCM/SIM assets: **PASS**.
- Production build: **PASS**.
- Wrangler validation/dry-run/runtime smoke: **PASS**.
- Production shell smoke: **PASS**.

Pre-merge Stage 5 evidence also passed after final drift reconciliation:

- push CI #1300 / run `33499523814` — SUCCESS;
- PR CI #1301 / run `33499527130` — SUCCESS;
- candidate suite at that point: 101 / 101 test files and 612 / 612 tests.

## 5. Adversarial testing and findings

### P1 — Retry against an expired usage period

**Finding:** a released operation key from an older period could theoretically be retried against its original allowance while the current period stayed untouched.

**Remediation:** period-bound retry checks added in TypeScript and D1 trigger enforcement. Provider execution is blocked before work if the original usage period is closed.

**Retest:** PASS.

### P1 — Wait-to-refund useful analysis

**Finding:** a `continuation_ready` full analysis could otherwise be auto-released after lease expiry even though useful product extraction had already been delivered.

**Remediation:** only actively running work is eligible for stale release. `continuation_ready` remains charged while awaiting NCM continuation, including across month rollover.

**Retest:** PASS.

### P1 — Unlimited provider-error/refund loop

**Finding:** exactly-once refunds alone could allow repeated provider failures to generate unlimited external work at zero net credit consumption.

**Remediation:** non-refundable attempted-work budget capped at four times the period credit allowance using the append-only consume ledger.

**Retest:** PASS; fifth attempt is blocked when a one-credit plan has exhausted the four-attempt budget.

### Defense — Refund counter/ledger divergence

**Finding:** inconsistent counter state must never allow a refund ledger record without the corresponding valid counter transition.

**Remediation:** D1 transition trigger aborts fail-closed before the refund entry is appended.

**Retest:** PASS.

### P2 — Stale usage badge refresh

**Finding:** overlapping `/api/usage` responses could allow an older response to overwrite newer UI state.

**Remediation:** request-generation guard added; the badge still obtains authoritative balance by refetching the server usage view.

**Retest:** PASS.

### P2 — Calendar-dependent rollover test

**Finding:** after the calendar changed to 2026-09-01, an abuse test assumed the current period was still August. The production logic was correct; the test fixture was coupled to the runner date.

**Remediation:** the regression now checks the security invariant independently of the real current month while separately testing deterministic August-to-September continuation rollover with an injected clock.

**Retest:** push CI #1300 and PR CI #1301 — SUCCESS.

## 6. Production migration incident and recovery

### Initial production attempt

After implementation PR #98 merged, post-merge main CI #1302 succeeded, but Deploy Production #217 / run `33499742216` failed at `Apply production D1 migrations` with:

`incomplete input: SQLITE_ERROR [7500]`

The Worker deployment had already succeeded, so this was treated as a production partial-state blocker rather than hidden or waived.

### Root cause

The Stage 5 migration contained trigger bodies with unparenthesized `SELECT CASE ... END`. Local SQLite/Wrangler accepted the migration, but Cloudflare D1's remote migration statement parsing split that trigger form incorrectly.

### Remediation

Hotfix PR #103:

- changed the two expressions to parser-safe `SELECT (CASE ... END)`;
- made the Stage 5 table, indexes and all six triggers `IF NOT EXISTS` so a retry converges safely after a partially-executed remote request;
- added `scripts/d1-migration-portability.test.ts` to prevent recurrence.

No entitlement, quota, ownership, refund or route-policy semantics were relaxed.

Hotfix merge: `d85075688cd8a582ac5306eef2729677203e2331`.

### Recovery evidence

Deploy Production #218 / run `33500194342`: **SUCCESS**.

- Worker deploy — PASS.
- `0003_usage_entitlements.sql` remote apply — PASS.
- Production D1 base schema — PASS.
- Production History schema — PASS.
- Production Watchlist schema — PASS.
- **Production usage entitlement schema/invariants — PASS.**
- Authentication-boundary adversarial smoke — PASS.
- Private-History boundary adversarial smoke — PASS.
- Watchlist boundary adversarial smoke — PASS.
- **Usage-boundary adversarial smoke — PASS.**
- Privileged runtime smoke — PASS.
- Alibaba self-scrape — PASS.
- Argentina market benchmark — PASS.
- Hybrid economics user path — PASS.
- Mercado Libre diagnostic — PASS.
- Opportunity search — PASS.
- Intake/NCM matrix — PASS.

Production functional/deployment gate success rate on the final recovery run: **30 / 30 functional steps passed = 100%**.

## 7. Audit conclusions

- Authentication precedes metering.
- Metering precedes customer provider/AI/browser dispatch.
- Quota enforcement is server-owned and D1-enforced at write time.
- Client plan, remaining-credit, entitlement and owner fields are non-authoritative.
- Cross-user reservation lookup and continuation are owner-scoped.
- Internal service credentials cannot become a customer identity or inspect `/api/me`.
- Idempotent replay does not duplicate provider work or debit.
- Full analysis continuation does not double-charge NCM.
- Useful completed analysis cannot be converted into a free operation by waiting.
- Refunds are exactly-once and bounded against economic abuse.
- Production schema validates all Stage 5 reservation triggers/invariants.

**Open P0:** 0  
**Open P1:** 0

## 8. Residual risks / accepted items

Accepted/deferred non-blocking items:

- **P3:** Vite emits a >500 kB minified main-chunk warning. This is a performance/code-splitting concern, not a Stage 5 correctness/security blocker.
- **P3 / CI maintenance:** GitHub-hosted runner reports that actions targeting Node 20 are being forced onto Node 24. Current workflows pass; action-version maintenance should be handled separately.
- Commercial pricing and payment-provider authority are intentionally not part of Stage 5; recurring billing is Stage 9 and paywall UX is Stage 10.
- Scheduled Watchlist monitoring and alert delivery remain Stage 7/11 scope.

## 9. Rollback and recovery

- Worker code can be rolled back to a previously validated deployment if a runtime regression is found.
- Stage 5 D1 structures are additive and must not be blindly dropped during application rollback because reservations/ledger rows are audit/economic state.
- The final `0003` migration is retry-safe for its table/index/trigger creation path.
- A rollback must preserve existing usage/ledger data and restore application compatibility rather than deleting economic records.

## 10. Completion decision

All mandatory Stage 5 completion gates pass:

1. Implementation — PASS.
2. Normal automated tests — PASS.
3. Adversarial tests — PASS.
4. Regression — PASS.
5. Build/Wrangler — PASS.
6. Production migration/smoke — PASS.
7. Audit — PASS.
8. Completion report — PASS once this report PR is merged.
9. P0/P1 zero — PASS.
10. P2/P3 accepted/remediated/documented — PASS.

**Final Stage 5 decision: PASS / COMPLETED upon merge of this completion report and update of master Issue #41.**

## 11. Next stage prerequisites

Stage 6 — Email architecture and preferences (development mode) can begin after this completion report is merged and the master tracker is updated.

Stage 6 should preserve the same server-authoritative boundaries established in Stages 2–5, especially tenant ownership, preference privacy and clear separation between lifecycle/security mail and optional marketing communication.
