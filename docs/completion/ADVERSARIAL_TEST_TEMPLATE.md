# Adversarial Test Report — Stage N

## Scope

- Stage:
- Commit / PR:
- Environment:
- Reviewer pass date:

## Persona A — Authentication attacker

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Missing credentials | | | | |
| Forged credentials | | | | |
| Expired credentials | | | | |
| Direct protected-route call | | | | |
| Client-side plan/session manipulation | | | | |

## Persona B — Tenant-isolation attacker

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Read another user's resource | | | P0 | |
| Update another user's resource | | | P0 | |
| Delete another user's resource | | | P0 | |
| Enumerate predictable IDs | | | P1 | |

## Persona C — Economic-abuse attacker

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Concurrent requests at final credit | | | P1 | |
| Retry/replay | | | P1 | |
| Double click | | | P2 | |
| Failed-engine refund loop | | | P1 | |
| Bypass via unmetered endpoint | | | P1 | |

## Persona D — Billing/webhook attacker

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Fake success redirect | | | P0 | |
| Forged webhook | | | P0 | |
| Duplicate webhook | | | P1 | |
| Out-of-order events | | | P1 | |
| Provider/API discrepancy | | | P1 | |

## Persona E — Reliability/privacy reviewer

| Test | Expected | Actual | Severity if failed | Result |
|---|---|---|---|---|
| Provider timeout | | | P2 | |
| Partial write | | | P1 | |
| Scheduler retry/duplication | | | P1 | |
| Secret in error response | | | P0/P1 | |
| Secret/PII in logs | | | P0/P1 | |
| Oversized/malformed request | | | P2 | |
| Missing environment binding | | | P1/P2 | |

## Stage-specific attacks

Add attacks unique to the capability under review. Do not treat the generic matrix as exhaustive.

| ID | Attack | Expected defense | Actual result | Severity | Result |
|---|---|---|---|---|---|
| ADV-N-001 | | | | | |

## Findings

### Finding ADV-N-X
- Severity:
- Attack path:
- Evidence:
- Impact:
- Root cause:
- Remediation:
- Retest evidence:
- Status: OPEN / CLOSED / ACCEPTED

## Regression check

- Existing Vitest suite:
- Build:
- Wrangler check:
- Wrangler dry-run:
- Local smoke:
- Production smoke, if applicable:

## Decision

- P0 open:
- P1 open:
- P2 open/accepted:
- P3 open:
- Adversarial decision: PASS / BLOCKED
