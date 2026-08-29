# Stage 0 — Baseline, Observability and Adversarial Harness Completion Report

Status: `COMPLETED`

- Date: 2026-08-29
- Implementation branch: `feature/saas-stage-0-baseline`
- Closeout branch: `docs/saas-stage-0-closeout`
- Implementation PR: #43
- Production merge SHA: `ca59958b0bec7968acf7ece0063028e8d668f447`
- Final pre-merge evidence SHA: `d1c9b626b1d5588f3551a8c57cbda760767a625c`
- Reviewer model: implementation pass + independent adversarial pass

## 1. Scope delivered

Stage 0 established the safety and evidence baseline required before introducing persistent SaaS state, authentication, credits or billing.

Delivered capabilities:

- executable inventory of current API/OAuth routes, external providers, cost risk, current access and target access/metering state;
- server-generated request/correlation IDs for API/OAuth requests;
- structured request completion/failure logging without request bodies or query strings;
- generic uncaught-exception handling at the Worker boundary;
- textual API response redaction for configured provider secrets and common credential fields;
- coarse pre-handler request-size protection for declared API payloads over 256 KiB;
- reusable Worker API test harness;
- automatic route-policy drift detection in tests;
- documented local / preview-test / production environment model;
- standardized adversarial-test report template;
- Stage 0 adversarial report with findings, remediation and residual risks;
- image-proxy redirect SSRF hardening discovered during adversarial review;
- reconciliation of Stage 0 with the newer production `worker/router.ts` introduced on `main` during implementation.

Core import/calculation domain logic was intentionally not rewritten.

## 2. Files/components changed

Primary implementation and evidence files:

- `worker/entry.ts`
- `worker/requestContext.ts`
- `worker/requestContext.test.ts`
- `worker/routePolicy.ts`
- `worker/routePolicy.test.ts`
- `worker/entry.test.ts`
- `worker/test/apiHarness.ts`
- `worker/imageProxy.ts`
- `worker/imageProxy.test.ts`
- `wrangler.jsonc`
- `docs/SAAS_ROUTE_INVENTORY.md`
- `docs/SAAS_ENVIRONMENTS.md`
- `docs/completion/ADVERSARIAL_TEST_TEMPLATE.md`
- `docs/completion/STAGE_0_ADVERSARIAL_REPORT.md`

`worker/entry.ts` wraps the latest production `worker/router.ts`; it does not replace or bypass the router's native Alibaba path.

## 3. Tasks completed

- [x] Inventory current `/api/*` and `/oauth/*` routes.
- [x] Classify current/target access and metering state.
- [x] Identify current external provider calls and expensive operations.
- [x] Establish server-generated correlation IDs.
- [x] Prevent request bodies/query strings from entering the new structured request logs.
- [x] Add secret-redaction boundary for textual API responses.
- [x] Add generic uncaught-exception response handling.
- [x] Add declared oversized-payload rejection before expensive handlers.
- [x] Add route-inventory drift regression test.
- [x] Add malformed JSON, missing binding and unknown-route Worker-boundary tests.
- [x] Add reusable API test helpers.
- [x] Document environment separation and secret-handling rules.
- [x] Establish adversarial test template.
- [x] Run adversarial review.
- [x] Remediate discovered P1 image-proxy redirect/SSRF weakness.
- [x] Reconcile against latest `main` router without discarding newer Alibaba routing.
- [x] Pass pre-merge CI.
- [x] Merge to `main`.
- [x] Deploy production merge.
- [x] Pass runtime, opportunity-search, Mercado Libre and intake production smoke tests.

## 4. Automated test evidence

| Test | Command / CI job | Result | Evidence |
|---|---|---|---|
| Unit/integration | GitHub Actions CI `33268048236` | PASS | All Vitest/unit-integration checks completed successfully on final PR head |
| Regression | GitHub Actions CI `33268048236` | PASS | Existing engine test suite remained green |
| NCM/SIM validation | GitHub Actions CI `33268048236` | PASS | Asset validation completed successfully |
| Production build | GitHub Actions CI `33268048236` | PASS | TypeScript/Vite production build succeeded |
| Wrangler validation | GitHub Actions CI `33268048236` | PASS | `wrangler check` and deployment dry-run succeeded |
| Local Worker smoke | GitHub Actions CI `33268048236` | PASS | Local Wrangler runtime smoke succeeded |
| Pre-merge production smoke | GitHub Actions CI `33268048236` | PASS | Existing production runtime smoke remained healthy |
| Production deployment | Deploy Production `33268091018` | PASS | Cloudflare deployment step succeeded for merge SHA `ca59958...` |
| Production runtime smoke | Deploy Production `33268091018` | PASS | Production Worker smoke succeeded after deployment |
| Production opportunity search | Deploy Production `33268091018` | PASS | Opportunity-search smoke succeeded |
| Production Mercado Libre | Deploy Production `33268091018` | PASS | Mercado Libre benchmark smoke succeeded |
| Production intake | Deploy Production `33268091018` | PASS | Intake smoke suite succeeded |

The production deployment job completed successfully end-to-end on the actual Stage 0 merge commit.

## 5. Adversarial testing

| Persona | Attack / failure scenario | Expected | Actual | Result |
|---|---|---|---|---|
| Authentication attacker | Caller controls request ID / newly introduced expensive route omitted from policy | Server controls correlation ID; route drift detected | Caller ID ignored; drift test enforced; latest native Alibaba probe classified | PASS |
| Tenant-isolation attacker | Cross-user access | No persistent user-owned resources exist yet | Not applicable in Stage 0; becomes blocking once Stage 1/3 introduce owned state | N/A with explicit carry-forward |
| Economic-abuse attacker | Oversized input reaches expensive provider; expensive routes omitted from future entitlement boundary | Reject declared oversized body and classify costly surfaces | 413 before handler; user compute targets authenticated/metered and native diagnostic targets internal | PASS |
| Billing/webhook attacker | Forged recurring billing state | Billing does not exist yet | Not applicable; provider-webhook authenticity/idempotency requirement recorded before future state mutation | N/A with explicit carry-forward |
| Reliability/privacy reviewer | Secret in provider exception/response/log; malformed JSON; missing binding; SSRF redirect | No secret leak, controlled degradation, redirect revalidation | Tests pass; P1 redirect weakness discovered and closed | PASS |

Detailed evidence is recorded in `docs/completion/STAGE_0_ADVERSARIAL_REPORT.md`.

## 6. Implementation audit

### Findings

The Stage 0 controls are appropriately placed around the existing Worker rather than spread through domain handlers. This provides one boundary for future authentication, entitlement and observability controls while preserving the current calculation engine.

The route inventory is executable rather than documentation-only. This was validated during the implementation itself: when `main` introduced `worker/router.ts` and `/api/alibaba-native-probe`, the Stage 0 merge gate identified that the branch was stale. The branch was reconciled against the newer router and the new expensive diagnostic route was classified before merge.

### Security / tenant isolation

- No user/tenant data exists yet, therefore Stage 0 cannot claim tenant isolation.
- All future owned resources must include server-derived ownership and adversarial cross-user tests.
- Secrets are explicitly excluded from new structured logs and redacted from textual API responses when they match configured secret values/common credential fields.
- Request IDs are generated by the server rather than accepted from caller input.
- Image redirects are now manually followed and every hop is revalidated against the image-host allowlist.

### Reliability / concurrency

- Uncaught exceptions at the outer Worker boundary degrade to generic 500 responses with correlation IDs.
- Missing runtime bindings and malformed JSON have explicit regression coverage.
- No persistent writes or credit counters exist yet, so transaction/race guarantees are deferred to Stage 1 and Stage 5 rather than falsely claimed here.

### Data / privacy

- New structured request logs intentionally omit query strings and bodies.
- OAuth codes in URL query parameters are not included in those structured logs.
- Environment-separation rules explicitly prohibit production data reuse in local development and prohibit secrets in Vite-exposed variables.

### Cost / abuse controls

- High-cost surfaces are explicitly identified before auth/billing work begins.
- Declared bodies over 256 KiB are rejected before invoking expensive handlers.
- This is not a complete rate-limiting or metering solution; those protections remain Stage 2/5 requirements.

## 7. Defects discovered and remediation

| ID | Severity | Finding | Remediation | Retest |
|---|---|---|---|---|
| ADV-0-001 | P1 | Image proxy validated only initial host while automatic redirects could escape allowlist | Manual redirect handling, per-hop allowlist/protocol validation, redirect cap | PASS |
| ADV-0-005 | P1 if ignored | `main` advanced to new `worker/router.ts` during implementation; forcing stale branch would risk bypassing newer routing and omit native diagnostic from inventory | Explicit merge reconciliation preserving router; wrapper changed to router; route policy/tests expanded | PASS |
| ADV-0-002 | P2 accepted | 256 KiB guard relies on declared `Content-Length` | Accepted for Stage 0; bounded stream/body reader carried forward | ACCEPTED |
| ADV-0-003 | P2 accepted | Current administrative Mercado Libre OAuth bootstrap callback displays short-lived authorization code in browser | Query omitted from logs; server-side code exchange carried forward before general-user OAuth | ACCEPTED |
| ADV-0-004 | P2 accepted | Operational endpoints remain network-public while used by CI/operations | Target state classified `internal`; access enforcement carried forward without breaking probes | ACCEPTED |

Open P0 findings: **0**  
Open P1 findings: **0**

## 8. Production validation

- Deployment status: **SUCCESS**
- Production commit: `ca59958b0bec7968acf7ece0063028e8d668f447`
- Production deployment run: `33268091018`
- Production URL: `https://shippingapp.marciofabrizio.workers.dev`
- Cloudflare deployment: PASS
- Runtime smoke: PASS
- Opportunity-search smoke: PASS
- Mercado Libre benchmark smoke: PASS
- Conversational intake smoke: PASS
- Existing engine regression result: PASS
- Observed Stage 0 production regressions: **none identified by automated production gates**

## 9. Residual risks / accepted limitations

1. **Chunked/streaming oversized requests — P2 accepted.** The current edge guard relies on declared `Content-Length`; central bounded request reading remains required when protected parsing is centralized.
2. **Mercado Libre bootstrap OAuth code display — P2 accepted.** Acceptable for the current administrative bootstrap flow only; not acceptable as the long-term general-user OAuth design.
3. **Operational endpoints network-public — P2 accepted.** Runtime/status/native diagnostic endpoints have target state `internal`, but enforcement must be introduced without breaking deployment health checks.
4. **No authentication or tenant boundary yet.** This is intentional. Stage 0 documents the future boundary; Stage 2 must enforce it server-side.
5. **No rate limiting/atomic usage accounting yet.** This is intentional and becomes a blocking concern for Stage 5.

None of these accepted residual risks is a P0/P1 Stage 0 blocker.

## 10. Rollback procedure

Preferred rollback if Stage 0 causes an unforeseen production regression:

1. revert merge commit `ca59958b0bec7968acf7ece0063028e8d668f447` from `main`;
2. redeploy through the normal `Deploy Production` workflow;
3. run runtime, opportunity-search, Mercado Libre and intake production smokes;
4. open a blocking incident/follow-up against the failed Stage 0 control.

Security caveat: a wholesale rollback would also remove the image-proxy redirect SSRF remediation. If the regression is isolated to the new request-context wrapper, the safer emergency rollback is to restore `wrangler.jsonc` directly to `worker/router.ts` **while preserving the hardened `worker/imageProxy.ts`**, then investigate the wrapper separately.

No database rollback is required because Stage 0 introduced no persistent database state.

## 11. Completion decision

**Decision: `PASS`**

**Stage status: `COMPLETED`**

Reason:

- all planned Stage 0 baseline tasks are implemented;
- final pre-merge CI is green;
- independent adversarial review found a real P1 defect and it was remediated/retested;
- an integration drift conflict was blocked rather than forced and was reconciled against current production routing;
- no P0/P1 findings remain open;
- residual P2 limitations are explicit and have follow-up owners by stage;
- the actual merged commit deployed successfully to Cloudflare production;
- all defined production smoke gates passed after deployment.

## 12. Next-stage prerequisites

Stage 1 — D1 persistence foundation can begin.

Required Stage 1 outcomes before completion:

- dedicated D1 persistence design and environment separation;
- forward-only migrations;
- ownership columns/indexes/foreign keys appropriate for future users;
- idempotency constraints for provider/billing/event state where applicable;
- repository/data-access helpers separated from domain calculation logic;
- local/test migration tests and safe production migration procedure;
- adversarial testing for duplicate creation, constraint bypass, partial writes, destructive migrations and environment/data separation.

Stage 1 must not introduce user-visible authentication yet; identity enforcement remains Stage 2.
