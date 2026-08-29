# Adversarial Test Report — Stage 1

## Scope

- Stage: 1 — Cloudflare D1 persistence foundation
- PR: #48
- Final code-validation SHA before this evidence-only commit: `65a3c8c588f46937ca3201b85851d9305e48973e`
- CI run: `33272590162`
- CI conclusion: SUCCESS
- Environment: GitHub Actions, local Wrangler D1, in-memory SQLite compatibility tests, existing production Worker smoke
- Production D1 state: NOT YET PROVISIONED / NOT YET MIGRATED at this review point

Stage 1 introduces persistence primitives only. No current end-user request path reads from or writes to the new D1 schema, so authentication enforcement remains a Stage 2 gate rather than being falsely claimed here.

## Persona A — Authentication attacker

Authentication does not exist yet. Stage 1 therefore tests the identity/storage invariants that Stage 2 will rely on rather than pretending to test token bypasses against a boundary that does not yet exist.

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Duplicate external identity | `(auth_provider, auth_subject)` cannot create a second user row | Unique constraint rejects duplicate identity | P1 | PASS |
| Empty/invalid local identity key | Invalid IDs rejected before persistence | Repository validation rejects empty IDs; DB also constrains ID length | P2 | PASS |
| Current anonymous product routes | Must not start persisting user-owned data in Stage 1 | Existing engine is not wired to `SaasRepository` | P1 | PASS |

Missing/forged/expired credential tests remain Stage 2 blocking tests.

## Persona B — Tenant-isolation attacker

Stage 1 treats ownership as a database invariant where relationships can otherwise be forged.

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| User B ledger references User A usage period | Reject | Composite FK `(usage_period_id, user_id)` rejects link | P0 | PASS |
| User B ledger references User A analysis | Reject | Composite FK `(analysis_id, user_id)` rejects link | P0 | PASS |
| User B watchlist references User A analysis | Reject | Composite FK `(analysis_id, user_id)` rejects link | P0 | PASS |
| User B billing event references User A subscription | Reject | Composite FK `(subscription_id, user_id)` rejects link | P0 | PASS |
| Subscription linked without an owner | Reject | Schema check requires `user_id` when `subscription_id` is present | P1 | PASS |
| User B deletes User A watchlist item through repository helper | No deletion | Delete statement scopes by both `id` and `user_id`; zero rows changed | P0 | PASS |

These constraints are defense in depth. Stage 2 and later APIs must still derive `user_id` from verified server-side identity and scope every resource query by that ID.

## Persona C — Economic-abuse attacker

Stage 1 does not consume credits yet, but it creates the storage primitives that must survive replay and concurrency when Stage 5 introduces paid entitlements.

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Concurrent/repeated usage-period initialization | One period only | Unique `(user_id, period_start, period_end)` plus conflict-safe repository path returns one row | P1 | PASS |
| Same period key with different credit grant | Reject semantic collision | Repository detects mismatch and raises `Usage period idempotency collision` | P1 | PASS |
| Credit-ledger replay key reuse | Duplicate work must not create second ledger entry | Globally unique ledger idempotency key; repository verifies replay semantics | P1 | PASS |
| Analysis replay | Same user/idempotency key cannot create a divergent request | Repository verifies stored input matches replay input | P1 | PASS |

Atomic credit reservation/spend/refund under real concurrent paid requests is intentionally deferred to Stage 5 and remains blocking there.

## Persona D — Billing/webhook attacker

Billing does not exist in production yet, but Stage 1 establishes replay-resistant event storage.

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Duplicate provider event | One stored event | Unique `(provider, provider_event_id)` and conflict-safe insert return existing event | P1 | PASS |
| Provider event ID reused with altered payload | Reject | SHA-256 payload mismatch raises replay mismatch | P0/P1 | PASS |
| Billing event linked to another user's subscription | Reject | Composite ownership FK rejects write | P0 | PASS |
| Invalid payload digest | Reject malformed audit identity | Repository requires lowercase 64-character SHA-256 hex | P2 | PASS |

Webhook signature verification, event ordering and provider/API reconciliation remain Stage 9 gates because no billing endpoint mutates subscription state yet.

## Persona E — Reliability / privacy reviewer

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| SQL injection payload in auth subject | Persist as data, never execute | Parameterized statement stores payload; `users` table remains intact | P0/P1 | PASS |
| Invalid foreign key | Reject | Foreign-key enforcement rejects missing users/resources | P1 | PASS |
| Oversized analysis input | Reject before persistence | Repository rejects JSON beyond configured boundary; DB has matching size check | P2 | PASS |
| Oversized watchlist title | Reject | Repository and schema length boundaries reject | P2 | PASS |
| Snapshot for nonexistent item | Reject | Foreign key rejects write | P1 | PASS |
| Apply initial migration to empty DB | Succeed | Wrangler local D1 migration succeeds | P1 | PASS |
| Apply migrations a second time | Safe no-op/success | Second `wrangler d1 migrations apply DB --local` succeeds | P1 | PASS |
| Later migration fails part-way | Failed transaction leaves no partial new schema and prior schema survives | Synthetic transaction rollback test passes | P1 | PASS |
| Existing Worker behavior after D1 binding | No regression | Unit/integration, build, Wrangler validation, local runtime and current production smoke pass | P1 | PASS |

## Stage-specific findings

### ADV-1-001 — Cross-tenant relational links must be impossible below the API layer

- Severity if unmitigated: **P0**
- Status: **CLOSED BY DESIGN AND TEST**
- Attack path: a future compromised/mis-scoped handler supplies User B as owner while referencing User A's usage period, analysis or subscription.
- Defense: composite unique parent keys plus composite foreign keys bind the referenced resource ID to the same `user_id`.
- Evidence: dedicated cross-user ledger, watchlist and billing relationship tests all reject the write.
- Follow-up: Stage 2 must still enforce authenticated owner-scoped reads and mutations; schema constraints do not replace authorization.

### ADV-1-002 — Ambiguous draft `preview_database_id` in automatic-provisioning configuration

- Severity: **P2**
- Initial status: OPEN during configuration review
- Detail: the first Stage 1 draft included `preview_database_id: "shippingapp-local"` while relying on Wrangler automatic D1 resource provisioning. The value was unnecessary and was not an actual provisioned database UUID.
- Risk: local validation could succeed while leaving ambiguity for remote provisioning/deployment behavior.
- Remediation: removed `preview_database_id`; the D1 config now declares the `DB` binding plus `migrations_dir` and leaves resource creation/linking to Wrangler automatic provisioning.
- Remediation SHA: `65a3c8c588f46937ca3201b85851d9305e48973e`
- Retest: CI run `33272590162` passed local D1 migration twice, build, Wrangler configuration validation, dry-run and runtime smoke.
- Status: **CLOSED**

### ADV-1-003 — Concurrent mainline production-smoke changes during Stage 1

- Severity: **P2 process/integration risk**
- Initial status: OPEN during PR integration
- Detail: `main` added and then reordered a production Alibaba no-Parse replay gate while Stage 1 was being built.
- Risk: blindly replacing `deploy-production.yml` would have silently removed or reordered a newly introduced production safeguard.
- Remediation: Stage 1 explicitly merged current `main`, preserved `scripts/smoke-production-alibaba-self.mjs`, and preserves the latest ordering where the self-scrape smoke runs before flaky external-provider smokes.
- Reconciled main SHA: `1c27f5eb6224f663bbcc298af09486fde5ef9ed6`
- Status: **CLOSED**

## Residual findings / accepted limitations

### ADV-1-004 — Remote D1 automatic provisioning is not proven until merge/deploy

- Severity: P2
- Status: **BLOCKS STAGE COMPLETION, NOT PR CODE REVIEW**
- Detail: Wrangler automatic provisioning is currently a beta capability. Local migrations, config validation and deploy dry-run are green, but a real remote D1 resource has not yet been provisioned by this Stage 1 change.
- Gate: after merge, `Deploy Production` must successfully deploy, apply `0001_saas_foundation.sql` remotely, query the remote schema and confirm all 11 tables before Stage 1 may be marked completed.

### ADV-1-005 — No dedicated remote preview D1 environment yet

- Severity: P2
- Status: ACCEPTED FOR STAGE 1
- Detail: CI uses isolated local Wrangler D1 and SQLite compatibility tests. A dedicated remote preview database should exist before preview environments begin hosting real authenticated state.
- Follow-up: introduce alongside/preceding stateful preview authentication rollout.

### ADV-1-006 — User deletion / audit-retention policy is not finalized

- Severity: P2
- Status: ACCEPTED FOR STAGE 1
- Detail: Stage 1 defines ownership and deletion behavior sufficient for an empty foundation, but legal/product retention rules for credit, billing and email audit records versus account deletion have not yet been finalized.
- Risk containment: Stage 1 creates no production user rows and no current request path writes SaaS records.
- Follow-up: finalize retention/anonymization semantics before production billing/email/user-deletion workflows become active.

## Regression evidence

Code-validation CI run `33272590162` on SHA `65a3c8c588f46937ca3201b85851d9305e48973e`:

- Unit/integration and adversarial persistence tests: PASS
- D1 local migration first apply: PASS
- D1 local migration second apply: PASS
- D1 schema/rollback validator: PASS
- NCM/SIM asset validation: PASS
- Production build: PASS
- `wrangler check`: PASS
- Wrangler deployment dry-run: PASS
- Local Worker runtime smoke: PASS
- Existing production Worker smoke: PASS

## Decision before production gate

- P0 open: 0
- P1 open: 0
- P2 closed: 2
- P2 accepted/deferred: 2
- P2 blocking final Stage 1 completion: 1 (`ADV-1-004`, remote provisioning/migration proof)
- Adversarial decision for merge: **PASS FOR PRODUCTION GATE**
- Stage completion decision: **NOT YET COMPLETE** until production D1 provisioning, remote migration, remote schema verification and all product smoke tests pass.
