# Stage 4 — Watchlist and Historical Snapshots Completion Report

Status: `COMPLETED`

- Date: 2026-08-31
- Implementation branch: `feature/saas-stage-4-watchlist`
- Implementation PR: #89 — `SaaS Stage 4 — Watchlist and historical snapshots`
- Implementation merge SHA: `9dcba7b89f95721d978bae49616660bb733dd4c3`
- Final production deploy: `Deploy Production` #205, run `33423302206`
- Production Worker version: `ff8b92f0-e3c4-4d18-ad2c-4a7cab869767`
- Post-merge main CI: run `33423302225` — SUCCESS
- Reviewer: implementation + adversarial gate review

## 1. Scope delivered

Stage 4 adds an explicit, authenticated, user-owned Watchlist that remains conceptually and technically separate from automatic analysis History.

Delivered scope:

- signed-in users can explicitly choose `Seguir producto` from an owned completed analysis;
- the browser submits only the owned `analysisId` when creating a Watchlist item;
- server-side code derives owner, title, source URL, baseline market evidence and landed-cost basis from the authenticated user's private completed analysis;
- Watchlist items are owner-scoped and deduplicated per user/source;
- removing an item deactivates it without destroying its snapshot history;
- re-adding a previously removed product reactivates the same Watchlist item instead of creating a duplicate;
- initial and subsequent historical snapshots are persisted with server-generated provenance and observation timestamps;
- manual refresh performs trusted Argentina-market discovery on the server; client-submitted prices, landed costs or margins are ignored as authority;
- refresh requests require idempotency keys and replay the existing snapshot before a second external provider call can occur;
- provider outage produces an explicit unavailable snapshot with no fabricated current market price or false percentage movement;
- raw provider exception messages are not persisted or returned through Watchlist provenance;
- Watchlist can continue monitoring after the source History analysis is soft-deleted because it retains a trusted completed-analysis basis;
- signed-in UI exposes a separate `Seguimiento` surface with latest price, landed cost, margin, deltas and snapshot timeline;
- `/api/watchlist-refresh` is classified as authenticated, high-cost and a metered target for the Stage 5/11 entitlement model;
- production deployment verifies Watchlist D1 ownership/dedupe constraints and the Watchlist authorization boundary.

## 2. Files/components changed

Primary Stage 4 components include:

- `worker/watchlist.ts`
- `worker/watchlist.test.ts`
- `worker/watchlistPrivacy.test.ts`
- `worker/persistence/watchlistRepository.ts`
- `worker/entry.ts`
- `worker/routePolicy.ts`
- `worker/routePolicy.test.ts`
- `src/lib/watchlist.ts`
- `src/lib/watchlist.test.ts`
- `src/components/Watchlist.tsx`
- authenticated History integration for explicit `Seguir producto`
- authenticated account controls exposing `Seguimiento`
- `scripts/validate-d1-schema.mjs`
- `scripts/smoke-production-watchlist-boundary.mjs`
- `.github/workflows/deploy-production.yml`

No new Stage 4 migration was added. `watchlist_items` and `watchlist_snapshots` were deliberately created in the Stage 1 foundation migration; Stage 4 strengthens and verifies those existing constraints rather than introducing a no-op schema migration.

## 3. Tasks completed

- [x] Keep History automatic and Watchlist explicit.
- [x] Allow Watchlist creation only from an analysis owned by the authenticated user.
- [x] Derive Watchlist owner/title/source/economic basis server-side.
- [x] Add owner-scoped Watchlist repository/API methods.
- [x] Add item dedupe and safe reactivation semantics.
- [x] Add server-generated initial snapshot.
- [x] Add trusted refresh snapshots with provenance/timestamps.
- [x] Add replay-safe refresh idempotency before provider work.
- [x] Represent provider outage without inventing market movement.
- [x] Prevent provider exception text from leaking through persisted snapshot provenance.
- [x] Preserve Watchlist monitoring independently of later History soft deletion.
- [x] Add signed-in Watchlist UI and historical snapshot timeline.
- [x] Add tenant-isolation and economic-spoofing adversarial tests.
- [x] Add production Watchlist auth-boundary smoke.
- [x] Verify Watchlist ownership/dedupe constraints against remote D1.
- [x] Run full product regression suite in production.
- [x] Close all Stage 4 P0/P1 findings.

## 4. Automated test evidence

| Test | Command / CI job | Result | Evidence |
|---|---|---|---|
| Full unit/integration suite | Vitest in production deploy #205 | PASS | **92/92 test files; 554/554 tests passed** |
| Stage 4 Worker boundary | `worker/watchlist.test.ts` | PASS | 10/10 tests |
| Stage 4 provider-error privacy | `worker/watchlistPrivacy.test.ts` | PASS | 1/1 test |
| Stage 4 client contract | `src/lib/watchlist.test.ts` | PASS | 2/2 tests |
| Route-policy drift/security | `worker/routePolicy.test.ts` | PASS | 6/6 tests |
| D1 schema / rollback | `scripts/validate-d1-schema.mjs` | PASS | 11 tables, 14 required indexes, 2 migrations, Stage 4 ownership/dedupe constraints PASS, rollback probe PASS |
| Branch CI | run `33422984834` | PASS | tests, D1, NCM/SIM, build, Wrangler runtime and shell smoke |
| PR merge-candidate CI | run `33423122571` | PASS | integrated against current `main` before merge |
| Post-merge main CI | run `33423302225` | PASS | complete main CI after PR #89 merge |
| Production build | TypeScript + Vite | PASS | 120 modules transformed; production bundle built |
| Worker deploy | Deploy Production #205 | PASS | Worker version `ff8b92f0-e3c4-4d18-ad2c-4a7cab869767` |
| Remote D1 migrations | Wrangler remote migration gate | PASS | no pending migrations; Stage 1/3 schema retained |
| Remote Stage 4 schema | production D1 query | PASS | Watchlist item/snapshot indexes, unique indexes, user FK, composite analysis FK and snapshot-parent FK verified |
| Production auth boundary | `smoke-production-auth-boundary.mjs` | PASS | Stage 2 authorization boundary remained intact |
| Production History boundary | `smoke-production-history-boundary.mjs` | PASS | Stage 3 private-history boundary remained intact |
| Production Watchlist boundary | `smoke-production-watchlist-boundary.mjs` | PASS | anonymous, forged-user and service-token identities cannot access, mutate or refresh user Watchlists |
| Existing engine regression | production product smokes | PASS | runtime, Alibaba, Argentina market, hybrid economics, opportunity search and intake completed |
| Production intake matrix | `smoke-production-intake.mjs` | PASS | 20 intake cases + 20 NCM classification cases |

## 5. Adversarial testing

| Persona | Attack / failure scenario | Expected | Actual | Result |
|---|---|---|---|---|
| Authentication attacker | Anonymous access to list/detail/delete/refresh | Reject before Watchlist data access | Rejected | PASS |
| Authentication attacker | Caller forges trusted user headers | Headers must not become an owner identity | Rejected in production smoke | PASS |
| Tenant-isolation attacker | User A references User B's analysis when creating Watchlist item | Indistinguishable from missing analysis; no item created | 404-equivalent owner-scoped failure | PASS |
| Tenant-isolation attacker | User A lists User B's Watchlist | No B rows returned | Empty/owner-scoped result | PASS |
| Tenant-isolation attacker | User A guesses User B item ID for detail/delete/refresh | Missing and foreign IDs indistinguishable; no mutation/provider work | Rejected | PASS |
| Tenant-isolation attacker | Client posts another `userId` | Server identity remains authoritative | Injected owner ignored | PASS |
| Economic-abuse attacker | Client submits fake market price, landed cost or margin | Ignore client economics | Snapshot economics generated from trusted server evidence | PASS |
| Economic-abuse attacker | Replay same refresh idempotency key | No second provider call or duplicate snapshot | Existing snapshot replayed before provider work | PASS |
| Economic-abuse attacker | Concurrent duplicate add requests | One logical Watchlist item / initial snapshot | Dedupe constraint + re-read behavior held | PASS |
| Reliability/privacy reviewer | Market provider outage | No fake current price or movement | New snapshot records unavailable/null current market price | PASS |
| Reliability/privacy reviewer | Provider throws text containing a hypothetical secret/email | Raw error must neither persist nor return | Dedicated response + D1 payload test passed | PASS |
| Reliability/privacy reviewer | Source History analysis later soft-deleted | Existing Watchlist remains monitorable | Trusted Watchlist basis retained | PASS |
| Reliability/privacy reviewer | Remove and re-add | Preserve historical snapshots; avoid duplicate item | Same item reactivated; history retained | PASS |
| Billing/webhook attacker | N/A to Stage 4 billing state | No billing side effect | None introduced | N/A |

Production evidence explicitly reported:

> `Production watchlist boundary smoke PASS: anonymous, forged-user and service-token identities cannot access, mutate or refresh user watchlists.`

## 6. Implementation audit

### Security / tenant isolation

- Every user-visible Watchlist query/mutation is owner-scoped server-side.
- Snapshot reads are constrained through the owner-scoped Watchlist parent.
- Watchlist creation first resolves an owned, visible completed analysis; foreign/missing analysis references are intentionally indistinguishable.
- Service/internal operational identity cannot substitute for a real end-user identity on Watchlist endpoints.
- Client-provided owner, title, source and economic values are not trusted as authorization or snapshot authority.

### Snapshot trust / provenance

- Initial economics are derived from the completed analysis stored under the authenticated user's ownership.
- Refresh market price comes from the server-side Argentina market lookup.
- Landed-cost basis is retained from the completed calculation rather than accepted from arbitrary client refresh payloads.
- Every snapshot has a server observation timestamp and provenance metadata.
- Provider outage creates a truthful unavailable state; historical previous price remains historical and is not promoted as a new observation.

### Reliability / concurrency

- Existing Stage 1 unique constraints provide item dedupe and snapshot idempotency foundations.
- Concurrent creation is tested.
- Refresh replay lookup occurs before expensive provider work.
- Remove/re-add is a reactivation, not destructive recreation.
- No destructive schema migration was required.
- Concurrent `main` NCM/Alibaba changes were integrated through PR merge-candidate CI rather than overwritten.

### Privacy

- Raw provider exception text is deliberately excluded from persisted/returned snapshot provenance.
- User Watchlists and their snapshots are private by authenticated owner.
- Historical snapshots survive normal remove/re-add without becoming cross-tenant visible.

### Cost / abuse controls

- Manual refresh can invoke Argentina-market providers and is therefore classified `high` cost.
- `targetMetered=true` is explicit in route policy so Stage 5 can enforce entitlement/credit behavior rather than silently treating refresh as an indefinitely free expensive endpoint.
- Stage 4 does not claim that credits are already enforced; atomic quota/entitlement reservation remains Stage 5.

## 7. Defects discovered and remediation

| ID | Severity | Finding | Remediation | Retest |
|---|---|---|---|---|
| S4-IDEMP | P1 during implementation | A refresh retry with the same logical idempotency key could reach content comparison after a new server timestamp and collide rather than replay cleanly | Added owner-scoped lookup by server idempotency key **before provider work** and immediately replay the existing snapshot | Dedicated replay test PASS; only one provider call and one refresh snapshot |
| S4-PRIV | P1 during implementation | Raw provider exception text could be embedded in snapshot provenance and become retrievable through detail JSON | Replaced raw exception persistence with a generic provider-unavailable state | Dedicated privacy test verifies both HTTP response and stored D1 payload contain no hypothetical secret/email — PASS |
| S4-METER | P1 design gate | New high-cost refresh route was initially classified unmetered, conflicting with the global high-cost route invariant | Set `/api/watchlist-refresh` target to `targetMetered=true`; actual credit enforcement explicitly deferred to Stage 5/11 | Route-policy tests PASS |
| S4-DRIFT | P3 process | `main` advanced with NCM/Alibaba changes while Stage 4 was being implemented | Compared drift, confirmed no direct Watchlist conflict and required PR merge-candidate CI against new `main` | PR CI `33423122571` PASS |

Open Stage 4 blocker count at closure:

- P0: 0
- P1: 0

## 8. Production validation

- Deployment status: **SUCCESS**
- Production implementation commit: `9dcba7b89f95721d978bae49616660bb733dd4c3`
- Deployment run: `33423302206` / Deploy Production #205
- Worker version: `ff8b92f0-e3c4-4d18-ad2c-4a7cab869767`
- `AUTH_ENFORCEMENT=true`: retained in deployed Worker
- Full automated suite: 92 files / 554 tests — PASS
- D1 local validator: Stage 4 ownership/dedupe constraints — PASS
- Remote SaaS tables: 11/11 — PASS
- Remote Watchlist schema constraints: PASS
- Auth boundary adversarial smoke: PASS
- Private History boundary adversarial smoke: PASS
- Watchlist boundary adversarial smoke: PASS
- Runtime smoke: PASS
- Alibaba self-scrape smoke: PASS under its existing fail-closed identity/price policy
- Free Argentina market benchmark: PASS, 3/3 representative probes live with minimum 5 traceable comparables
- Hybrid economics user-path gate: PASS
- Opportunity-search smoke: PASS, 6 traceable direct results and no synthetic fallback
- Intake smoke: PASS, 20 intake cases + 20 NCM classification cases
- Observed Stage 4 regressions: **none**

### Existing Mercado Libre provider nuance

Mercado Libre OAuth/API identity remains healthy (`/users/me` succeeds), while the pure Mercado Libre benchmark diagnostic remains `configured_insufficient` because listing search is blocked for this application and catalog hydration exposes no usable ARS buy-box evidence for the representative probes.

The diagnostic is intentionally `continue-on-error`; ShippingAPP does not manufacture Mercado Libre prices. The authoritative user-facing Argentina market/economics path remained live in deploy #205 through traceable direct Argentine retailers, with 3/3 market probes and the hybrid economics user path passing. This is an existing provider limitation, not a Stage 4 isolation/snapshot defect.

## 9. Residual risks / accepted limitations

- Stage 4 manual refresh is marked as a metered target, but actual atomic credit reservation/refund and plan entitlements do not exist until Stage 5.
- Automatic scheduled Watchlist monitoring and alert thresholds are not Stage 4 scope; they remain Stage 7/11 work.
- The retained landed-cost component of a Watchlist snapshot is based on the completed analysis/FX basis. Refreshing all underlying import-cost inputs automatically is future monitoring logic, not silently inferred in Stage 4.
- Pure Mercado Libre benchmark discovery remains provider-limited and fail-closed as described above; the user-facing Argentina-market path is independently healthy.
- Alibaba production extraction can still require user confirmation when Alibaba withholds price/logistics facts; its production smoke confirmed page/identity integrity and zero price-integrity failures rather than inventing missing supplier facts.
- Vite reports a non-blocking JavaScript chunk warning above 500 kB. This is a performance/backlog item, not a Stage 4 security or correctness defect.

## 10. Rollback procedure

1. If a Stage 4 runtime regression requires emergency recovery, deploy the last known-good pre-Stage-4 Worker/application version.
2. Do **not** drop `watchlist_items` or `watchlist_snapshots`: these tables predate Stage 4 and belong to the additive Stage 1 SaaS foundation.
3. A prior Worker can coexist with the existing Watchlist tables/constraints.
4. If Watchlist alone must be disabled, remove/disable the Watchlist UI/routes in a forward application deploy while preserving stored rows and snapshots for investigation/recovery.
5. After rollback or forward remediation, rerun auth, History, Watchlist boundary, D1 schema and core product smokes.

## 11. Completion decision

**Decision:** `PASS`

**Reason:**

Stage 4's functional scope is implemented, merged and deployed. Watchlist intent is explicit and separate from History; ownership is server-derived; analysis references are same-tenant constrained; snapshot economics are generated from trusted server evidence; refresh is replay-safe; cross-tenant access/mutation is blocked; provider outage and provider-error privacy fail safely; remote D1 ownership/dedupe constraints are verified; and the final production Worker passed the complete regression suite.

Both P1 findings discovered during implementation were remediated and retested before completion. There are no open Stage 4 P0/P1 findings.

**Stage 4 is therefore eligible to be marked COMPLETED.**

## 12. Next-stage prerequisites

Stage 5 — Usage, credits and atomic entitlements may begin from the latest green `main` after this completion report is merged.

Required Stage 5 invariants:

- the Worker is the sole authority for plan/entitlement/usage decisions;
- expensive work is reserved atomically **before** provider execution;
- one successful full analysis consumes one credit according to the final product policy;
- internal/provider failure releases or refunds the reservation exactly once;
- retries/idempotency cannot double-charge or obtain free duplicate work;
- parallel requests cannot exceed the user's entitlement through race conditions;
- client-supplied plan/credit state is never trusted;
- Watchlist refresh high-cost behavior must receive an explicit entitlement/credit policy rather than remaining accidentally free;
- operational service-token probes must not consume a real user's credits;
- production completion requires concurrency/economic-abuse adversarial smoke plus full regression gates.
