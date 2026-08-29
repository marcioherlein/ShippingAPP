# ShippingAPP SaaS Implementation Plan

## Objective

Turn ShippingAPP from a stateless calculation experience into a production SaaS with:

- authenticated users;
- private analysis history;
- user-owned watchlists;
- monthly usage entitlements;
- transactional and lifecycle email;
- recurring billing;
- paywalls and plan enforcement;
- scheduled monitoring and alerts;
- auditable delivery evidence for every stage.

The existing calculation/import engine remains isolated from the SaaS layer wherever possible. Identity, persistence, entitlement and billing checks are introduced around existing `/api/*` routes rather than rewriting core domain logic.

---

# Delivery principles

## 1. Stage-gated delivery

A stage may move to `COMPLETED` only when all of the following are true:

1. implementation tasks are complete;
2. normal automated tests pass;
3. adversarial tests pass;
4. regression suite passes;
5. build and Cloudflare validation pass;
6. production smoke tests pass when the stage changes production behavior;
7. an implementation audit has been performed;
8. a completion report has been committed;
9. all P0/P1 findings are closed;
10. remaining P2/P3 findings are explicitly accepted and documented.

Compilation alone is never sufficient evidence of completion.

## 2. Evidence over assertions

Every completion report must link or record evidence for the claimed result:

- commit SHA;
- PR number;
- test command and result;
- CI run result;
- relevant smoke-test response;
- migration status when applicable;
- production URL/endpoint tested when applicable;
- known limitations;
- rollback path.

## 3. Independent adversarial pass

The implementation pass and adversarial review pass are treated as separate activities. The adversarial reviewer assumes the feature is wrong until demonstrated otherwise.

Adversarial reviews use five recurring attacker/reviewer personas:

### A. Authentication attacker
Attempts impersonation, forged tokens, expired tokens, missing tokens, session confusion and protected-route bypass.

### B. Tenant-isolation attacker
Attempts to read, update or delete another user's analyses, watchlist, usage records, preferences or billing state.

### C. Economic-abuse attacker
Attempts to obtain paid work without consuming entitlement: concurrent requests, retries, double clicks, replay, race conditions, failed-engine refunds and client-side plan manipulation.

### D. Billing/webhook attacker
Attempts forged callbacks, duplicate events, out-of-order events, stale subscription state and false activation through success-page redirects.

### E. Reliability/privacy reviewer
Attempts provider failures, partial writes, retries, scheduler duplication, email leakage, accidental logging of secrets/PII and destructive migration scenarios.

Each stage adds domain-specific attacks to this common suite.

---

# Severity model

| Severity | Meaning | Completion rule |
|---|---|---|
| P0 | Critical security, cross-user exposure, payment bypass or data-loss defect | Stage blocked |
| P1 | High-impact functional/security defect | Stage blocked |
| P2 | Material but contained defect with workaround | Must fix or explicitly accept before completion |
| P3 | Minor defect / polish / optimization | May remain with documented follow-up |

---

# Existing CI baseline

ShippingAPP already runs the following on CI and this remains the minimum regression baseline:

- Vitest unit/integration suite;
- nomenclador/NCM/SIM asset validation;
- production TypeScript/Vite build;
- `wrangler check`;
- Cloudflare deployment dry-run;
- local Worker runtime smoke test;
- production Worker smoke test.

Production deployment additionally runs the existing opportunity-search, Mercado Libre and conversational-intake smoke tests.

Every SaaS stage must preserve this baseline.

---

# Standard branch and reporting convention

Each implementation stage uses:

```text
feature/saas-stage-N-short-name
```

Each stage produces:

```text
docs/completion/STAGE_N_<NAME>_COMPLETION.md
```

Recommended PR title:

```text
SaaS Stage N — <capability>
```

A stage PR should not be merged until its Completion Gate is satisfied.

---

# Stage 0 — Baseline, observability and test harness

## Goal

Create a safe baseline before introducing stateful SaaS behavior.

## Implementation tasks

- inventory current `/api/*` routes and classify each as public, authenticated, metered or internal;
- identify all current external provider calls and expensive operations;
- establish request/correlation IDs for server-side diagnostics;
- ensure secrets are never written to logs or API responses;
- document environment split: local, preview/test, production;
- add reusable API-test helpers for Worker requests;
- establish stage-completion report template;
- establish adversarial-test checklist template.

## Normal tests

- existing Vitest suite;
- existing build and Wrangler checks;
- existing runtime smoke tests;
- route inventory test verifies expected protected/metered classification configuration.

## Adversarial tests

- malformed JSON across state-changing routes;
- oversized input at API boundaries;
- missing environment bindings;
- provider timeout behavior;
- exception response does not leak stack/secrets;
- runtime smoke remains healthy after instrumentation.

## Audit questions

- Can every future user-state mutation be traced to a request ID?
- Are any current expensive routes accidentally public without intentional classification?
- Are provider credentials exposed anywhere in client assets, responses or logs?

## Completion Gate

`STAGE 0 COMPLETE` only after baseline CI is green and route/security inventory is committed.

---

# Stage 1 — D1 persistence foundation

## Goal

Introduce the durable storage layer without changing user-facing behavior.

## Proposed tables

- `users`;
- `plans`;
- `subscriptions`;
- `usage_periods`;
- `credit_ledger`;
- `analyses`;
- `watchlist_items`;
- `watchlist_snapshots`;
- `email_preferences`;
- `email_events`;
- `billing_events`.

## Implementation tasks

- add Cloudflare D1 binding;
- create forward-only SQL migrations;
- add foreign keys/ownership columns and indexes;
- define repository/data-access helpers;
- add migration procedure for local/test/production;
- design idempotency keys where duplicate writes would be harmful;
- add timestamps consistently in UTC.

## Normal tests

- migrate empty database;
- execute migrations twice safely where appropriate;
- CRUD repository tests;
- index/unique-constraint tests;
- foreign-key ownership tests;
- production build and Wrangler validation.

## Adversarial tests

- duplicate user creation;
- duplicate provider event IDs;
- concurrent usage-row initialization;
- invalid foreign-key references;
- SQL injection payloads through repository boundaries;
- migration failure halfway through deployment;
- unexpected null/oversized values.

## Audit questions

- Are ownership boundaries represented in the schema itself, not just UI code?
- Can billing/webhook events be replayed safely?
- Is there a recoverable migration/rollback procedure?

## Completion Gate

Schema + migrations + data-access tests pass. No production user data is yet dependent on unfinished auth logic.

---

# Stage 2 — Authentication and server-side authorization

## Goal

Introduce identity while ensuring the Worker, not React, is the security authority.

## Implementation tasks

- integrate selected auth provider in React;
- add signup/login/logout/session UX;
- validate auth tokens in the Cloudflare Worker;
- implement `requireUser()` / equivalent;
- create/sync local `users` record from provider identity;
- define public vs authenticated API routes;
- ensure client-supplied user IDs are ignored for ownership decisions.

## Normal tests

- valid logged-in request;
- logged-out request;
- expired/invalid session;
- signup-to-first-authenticated-request flow;
- user record creation/sync;
- logout invalidates protected UI behavior.

## Adversarial tests

Authentication attacker must attempt:

- fabricated bearer token;
- token with invalid signature;
- expired token;
- token for User A while body contains User B ID;
- missing auth header;
- replayed stale token;
- direct POST to protected endpoints bypassing React;
- manipulation of role/plan fields in browser storage or request body.

## Audit questions

- Is identity derived only from validated server-side credentials?
- Are any protected actions relying on hidden buttons rather than backend authorization?
- Can User A force the Worker to act as User B by changing request payloads?

## Completion Gate

Zero cross-user/unauthenticated protected-route bypasses. Any P0/P1 finding blocks progression.

---

# Stage 3 — Private analysis history

## Goal

Persist every successful completed analysis and make it accessible only to its owner.

## Implementation tasks

- persist normalized analysis input/result after successful completion;
- assign stable analysis IDs;
- add user history endpoint;
- add single-analysis endpoint;
- add history UI;
- define retention/deletion behavior;
- never consume/save a completed result for a failed analysis.

## Normal tests

- successful analysis stored once;
- history ordering/pagination;
- analysis re-open;
- failure does not create misleading completed record;
- deletion if supported;
- existing calculation engine output remains unchanged.

## Adversarial tests

Tenant-isolation attacker attempts:

- enumerate IDs;
- retrieve another user's analysis;
- modify another user's record;
- delete another user's record;
- infer existence from different 403/404 behavior;
- inject ownership ID through body/query params.

Reliability reviewer attempts duplicate POST/retry and network interruption after engine completion.

## Audit questions

- Does every DB lookup constrain by authenticated owner?
- Can analysis content containing malicious text break history rendering?
- Is potentially sensitive analysis data excluded from unnecessary logs?

## Completion Gate

User A cannot observe or mutate User B history under automated adversarial tests.

---

# Stage 4 — Watchlist and historical snapshots

## Goal

Turn saved opportunities into a persistent monitoring product.

## Implementation tasks

- add/remove watchlist item;
- prevent duplicate watchlist entries;
- display watchlist;
- capture market/cost/margin snapshots;
- preserve snapshot provenance and source timestamps;
- distinguish analysis history from explicit watchlist membership.

## Normal tests

- add/remove/re-add;
- duplicate prevention;
- snapshot creation;
- calculation of change versus previous snapshot;
- empty watchlist behavior;
- stale or unavailable source data behavior.

## Adversarial tests

- modify another user's watchlist;
- snapshot spoofing through client input;
- duplicate concurrent add requests;
- provider outage during snapshot refresh;
- missing prior snapshot;
- absurd market/FX values causing false alerts.

## Audit questions

- Are snapshots produced by trusted server-side calculations?
- Can stale/unavailable external data be mistaken for a real economic movement?
- Is provenance available for every displayed change?

## Completion Gate

Watchlist ownership, deduplication and trustworthy snapshot semantics verified.

---

# Stage 5 — Usage, credits and entitlements

## Goal

Introduce server-enforced usage limits before payment integration.

## Implementation tasks

- define free and paid entitlement model in configuration/data;
- implement monthly usage periods;
- implement atomic credit reservation;
- identify which operations consume credits;
- implement success settlement / failed-operation refund where required;
- expose remaining usage to UI;
- prevent the frontend from setting its own plan or usage state;
- implement admin/test override mechanism separately from user API.

## Normal tests

- first free analysis consumes one credit;
- remaining counter correct;
- period reset behavior;
- failed engine call refunds/does not settle according to policy;
- paid entitlement changes limits correctly;
- read-only/history actions do not consume credits.

## Adversarial tests

Economic-abuse attacker attempts:

- two simultaneous requests with one credit left;
- ten concurrent requests with one credit left;
- double click;
- browser retry;
- same idempotency key replay;
- different idempotency keys for identical request;
- cancel request mid-flight;
- tamper `plan=business` client-side;
- call engine endpoints directly;
- exploit error/refund loops for unlimited free calls.

## Audit questions

- Is credit enforcement atomic?
- Is entitlement checked before expensive provider calls?
- Can a user create negative usage or unlimited refunds?
- Can internal failures unfairly consume entitlement?

## Completion Gate

Concurrency tests prove the configured limit cannot be exceeded without an explicit ledger entry.

---

# Stage 6 — Email architecture and preferences (development mode)

## Goal

Build provider-agnostic application email before final brand/domain selection.

## Implementation tasks

- introduce `EmailProvider` abstraction;
- integrate development email provider configuration;
- create templates for welcome, usage, weekly digest, alerts and billing events;
- add `email_preferences` endpoints/UI;
- add unsubscribe-token mechanism;
- separate transactional/security communication from optional marketing;
- record send events without storing unnecessary message content;
- keep sender/app branding environment-driven.

## Normal tests

- template rendering;
- preferences respected;
- unsubscribe works;
- missing provider configuration fails safely;
- provider API error does not crash unrelated user operations;
- no duplicate email on retry when idempotency applies.

## Adversarial tests

- forged unsubscribe token;
- unsubscribe another user;
- header/content injection;
- malicious product title in HTML email;
- provider key missing/invalid;
- repeated event causing duplicate sends;
- email address leakage across recipients.

## Audit questions

- Are recipient addresses derived from authenticated/server-owned data?
- Is marketing consent independent from operational messages?
- Can email failures corrupt core application state?

## Completion Gate

Development emails can be generated safely without requiring final production domain/brand.

---

# Stage 7 — Weekly digest scheduler

## Goal

Create recurring value from the watchlist through personalized weekly summaries.

## Implementation tasks

- add Cloudflare scheduled trigger;
- identify active eligible recipients;
- calculate changes from trusted watchlist snapshots;
- generate personalized digest;
- enforce preferences;
- add scheduler idempotency/run tracking;
- define maximum batch size and continuation strategy;
- expose operational run summary.

## Normal tests

- eligible user receives digest;
- opted-out user does not;
- empty watchlist does not receive meaningless mail;
- unavailable data represented accurately;
- scheduler retry does not duplicate mail;
- multiple time zones handled according to documented policy.

## Adversarial tests

- cron fires twice;
- job fails halfway through batch;
- one user's rendering throws;
- 10x expected user count;
- provider rate limiting;
- corrupt snapshot;
- cross-user data accidentally inserted into another digest.

## Audit questions

- Is each digest built from the correct user's data only?
- Can scheduler retry safely after partial completion?
- Do changes distinguish real data movement from missing/stale data?

## Completion Gate

Scheduler is idempotent, privacy-safe and fault-tolerant before production enablement.

---

# Stage 8 — Production brand/domain/email readiness

## Goal

Move authentication and application email from development sender identities to final production identity.

## Implementation tasks

- configure final application domain/subdomains;
- configure production auth domain;
- configure sending domain;
- SPF;
- DKIM;
- DMARC;
- support mailbox;
- environment-specific app/sender names;
- production unsubscribe URL;
- sender reputation/warm-up plan.

## Normal tests

- DNS verification;
- auth links resolve correctly;
- transactional mail delivered to multiple providers;
- unsubscribe URL uses production domain;
- reply/support address functional.

## Adversarial tests

- development sender accidentally used in production;
- production secrets exposed to preview builds;
- spoofed From/Reply-To configuration;
- broken auth redirect on alternate host;
- unsubscribe link domain manipulation.

## Completion Gate

Production domain/email identity verified before emailing real users at scale.

---

# Stage 9 — Recurring billing provider integration

## Goal

Integrate monthly subscriptions without allowing the browser or payment redirect to grant access.

## Implementation tasks

- implement billing-provider abstraction;
- create checkout/subscription creation endpoint;
- persist provider customer/subscription references;
- implement signed/verified webhook endpoint;
- implement billing event idempotency;
- map provider states to internal subscription states;
- implement cancellation and renewal handling;
- implement server-side subscription reconciliation;
- add billing status UI.

## Normal tests

- subscription created;
- approved payment activates expected plan;
- rejection does not activate;
- cancellation reflected;
- renewal extends entitlement;
- webhook retry processed once;
- provider reconciliation repairs stale local state.

## Adversarial tests

Billing/webhook attacker attempts:

- fake success redirect;
- forged webhook;
- replay webhook;
- duplicate payment event;
- out-of-order cancellation/approval;
- webhook for another subscription/user;
- changed price/plan identifier from browser;
- stale paid state after provider cancellation;
- provider timeout during checkout or reconciliation.

## Audit questions

- Can any browser-controlled event grant paid access?
- Is provider state verified server-to-server?
- Are webhook IDs idempotent?
- Is subscription ownership validated?

## Completion Gate

No entitlement can be created solely from client input or redirect state. Webhook/reconciliation tests pass.

---

# Stage 10 — Paywalls and product entitlement UX

## Goal

Expose server-enforced limits clearly without creating client-side security assumptions.

## Implementation tasks

- usage counter;
- near-limit warning;
- hard paywall;
- upgrade checkout flow;
- paid feature flags based on server entitlement;
- downgrade behavior;
- preserve user history after cancellation;
- define locked versus deleted behavior explicitly.

## Normal tests

- free user under limit;
- warning threshold;
- zero-credit paywall;
- successful upgrade unlocks without stale cache;
- cancellation/downgrade behaves correctly;
- existing saved data remains visible according to policy.

## Adversarial tests

- remove paywall DOM;
- alter React state;
- edit local storage;
- call paid endpoint directly;
- stale entitlement cached after cancellation;
- race: request begins just before plan expires;
- downgrade with watchlist larger than new limit.

## Audit questions

- Is every paid capability enforced at API level?
- Are downgrade semantics predictable and non-destructive?
- Can cache/session timing create unintended continued access?

## Completion Gate

Paywall bypass in browser never bypasses backend entitlement.

---

# Stage 11 — Pro monitoring alerts

## Goal

Make subscription retention depend on ongoing monitoring value rather than only additional searches.

## Implementation tasks

- define alert thresholds and significance rules;
- refresh eligible watchlist items on schedule;
- compare snapshots;
- create margin/market/cost alerts;
- suppress noisy/duplicate alerts;
- respect plan and email preferences;
- record why an alert was triggered.

## Normal tests

- significant margin decline alert;
- significant margin improvement alert if enabled;
- insignificant change suppressed;
- stale data suppressed/flagged;
- paid entitlement required;
- preferences respected;
- duplicate alert suppression.

## Adversarial tests

- erroneous provider spike;
- FX missing;
- market benchmark unavailable;
- freight value stale;
- same condition repeated every job;
- cancellation between calculation and send;
- very large watchlist causing resource exhaustion.

## Audit questions

- Are alerts explainable from stored snapshots?
- Is the app warning on actual trusted changes instead of missing data?
- Can alert spam damage sender reputation or user trust?

## Completion Gate

Every sent alert has reproducible evidence and duplicate/noise controls.

---

# Stage 12 — Launch hardening and operational readiness

## Goal

Validate the entire SaaS as a connected system before broad public launch.

## Implementation tasks

- end-to-end signup → analysis → history → watchlist → usage → upgrade → alert flow;
- production backup/recovery procedure;
- incident/runbook documentation;
- billing reconciliation job;
- email deliverability monitoring;
- application metrics dashboard/queries;
- privacy/data deletion workflow;
- rate limiting/abuse controls;
- final dependency/security review;
- launch rollback procedure.

## Full adversarial campaign

Run the complete persona suite against production-like environment:

1. anonymous attacker;
2. authenticated free user;
3. malicious free user attempting credit bypass;
4. paid user attempting higher-tier access;
5. User A attacking User B resources;
6. forged payment/webhook actor;
7. scheduler duplicate/failure scenarios;
8. provider outage scenarios;
9. data deletion/privacy flow;
10. deploy/regression rollback scenario.

## Completion Gate

Launch only when:

- no open P0/P1 findings;
- all critical end-to-end tests green;
- existing import-engine smoke tests green;
- auth tenant isolation green;
- entitlement concurrency green;
- billing reconciliation green;
- scheduled email/alert idempotency green;
- recovery/runbook tested;
- final launch completion report approved.

---

# Mandatory Stage Completion Report Template

Every stage must create a report using the following structure.

```markdown
# Stage N — <Name> Completion Report

Status: COMPLETED | BLOCKED | PARTIALLY COMPLETE
Date:
Branch:
PR:
Commit SHA:
Reviewer:

## 1. Scope delivered
- ...

## 2. Files/components changed
- ...

## 3. Tasks completed
- [x] ...

## 4. Automated test evidence
| Test | Command / CI job | Result |
|---|---|---|
| Unit/integration | ... | PASS/FAIL |
| Regression | ... | PASS/FAIL |
| Build | ... | PASS/FAIL |
| Wrangler validation | ... | PASS/FAIL |
| Smoke | ... | PASS/FAIL |

## 5. Adversarial testing
| Attack / failure scenario | Expected | Actual | Result |
|---|---|---|---|
| ... | ... | ... | PASS/FAIL |

## 6. Implementation audit
### Findings
- ...

### Security/tenant-isolation assessment
- ...

### Reliability assessment
- ...

### Data/privacy assessment
- ...

## 7. Defects discovered and remediation
| ID | Severity | Finding | Fix | Retest |
|---|---|---|---|---|
| ... | ... | ... | ... | PASS |

## 8. Production validation
- Deployment status:
- Endpoint/UI checked:
- Smoke result:
- Observed regressions:

## 9. Residual risks / accepted limitations
- ...

## 10. Rollback procedure
- ...

## 11. Completion decision
Decision: PASS / BLOCKED
Reason:

## 12. Next-stage prerequisites
- ...
```

---

# Implementation Result Report Template

For individual meaningful implementation batches inside a stage, record:

```markdown
## Implementation Batch <N.X>

### Intended change
...

### Implemented
...

### Validation performed
...

### Adversarial findings
...

### Defects fixed
...

### Result
PASS | NEEDS FIX | BLOCKED
```

This prevents a stage report from hiding defects discovered during intermediate work.

---

# Recommended execution order

```text
Stage 0   Baseline / observability
   ↓
Stage 1   D1 persistence
   ↓
Stage 2   Authentication / authorization
   ↓
Stage 3   Analysis history
   ↓
Stage 4   Watchlist / snapshots
   ↓
Stage 5   Usage / credits
   ↓
Stage 6   Email architecture
   ↓
Stage 7   Weekly digest
   ↓
Stage 8   Brand/domain production readiness
   ↓
Stage 9   Billing
   ↓
Stage 10  Paywalls / entitlements UX
   ↓
Stage 11  Pro alerts
   ↓
Stage 12  Launch hardening
```

Stages 6 and 7 may be developed before the final product name/domain. Stage 8 is the point where production branding and sending identity become required.

---

# Reporting cadence during implementation

For every stage:

1. **Stage Start Report** — scope, dependencies, expected files and test plan.
2. **Implementation Batch Reports** — what changed and immediate validation result.
3. **Adversarial Review Report** — attacks attempted, defects found, severity.
4. **Remediation Report** — fixes made and retest evidence.
5. **Completion Report** — consolidated PASS/BLOCKED decision.
6. **Post-deployment Audit** — production smoke and regression result when applicable.

No stage should silently absorb unresolved defects into the next stage.

---

# Definition of SaaS launch complete

ShippingAPP is not considered SaaS-ready until the following can be demonstrated end-to-end:

```text
Visitor
  → authenticate
  → run allowed analysis
  → consume correct entitlement atomically
  → persist private history
  → add item to private watchlist
  → generate trusted historical snapshots
  → receive permitted digest/alert
  → reach usage limit
  → pay through verified billing provider state
  → receive server-side paid entitlement
  → use paid capability
  → cancel/downgrade safely
```

The final launch decision must be supported by the Stage 12 completion report rather than by feature presence alone.
