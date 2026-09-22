# Intake CPU incident — 2026-09-22

Status: unresolved in production. Do not equate successful upload, CI, or an isolated HTTP 200 with a healthy release.

## Evidence

- Production commit: 5aa4b6f2200a525e46edeeb0525032d131778f23 (PR #187).
- Deploy https://github.com/marcioherlein/ShippingAPP/actions/runs/35750437881: upload, Argentina retailer benchmark and hybrid economics passed; intake mouse failed with HTTP 503.
- Isolated probe https://github.com/marcioherlein/ShippingAPP/actions/runs/35755253598: mouse intake HTTP 200, 245 ms CPU; direct mouse benchmark HTTP 200, 169 ms CPU, insufficient evidence.
- Sequence probe https://github.com/marcioherlein/ShippingAPP/actions/runs/35755504408: mouse passed, then panel-solar-completo failed with outcome exceededCpu, 17 ms CPU and 1606 ms wall time. Other complete intake requests consumed 117–365 ms CPU. The sequence stopped before NCM cases.
- Settings probe https://github.com/marcioherlein/ShippingAPP/actions/runs/35755820402: account and Worker usage_model=standard; no explicit limits returned. Subscription read denied (403). Standard usage model alone does not establish a paid subscription.

The confirmed failure mode is CPU exhaustion. Memory exhaustion was not the recorded cause. PR #187's bounded-body improvements remain useful but did not resolve this incident.

## Proposed remediation requiring plan confirmation

1. Verify Workers subscription in the account dashboard. Do not confuse the website/zone plan with Workers billing.
2. If already paid, inspect effective CPU limits and apply the configuration below through the normal reviewed deployment.
3. If Free, obtain approval before enabling Workers Paid. Published base cost is USD 5/month plus usage beyond included quotas; this is not a hard USD 5 spending cap. No billing change has been made.
4. Proposed explicit per-invocation cap in wrangler.jsonc after paid entitlement is confirmed:

```json
"limits": { "cpu_ms": 5000 }
```

This is a proposed safety ceiling, not a measured requirement for every route and not a monthly spending limit. Validate NCM CPU before declaring it sufficient. Do not deploy an unsupported CPU configuration to Free merely to test whether the plan is enabled.

## Acceptance

- Run complete production workflow at the same committed configuration.
- Require all 20 intake and 20 classification cases, including mouse and solar panel, to pass.
- Capture filtered tail outcomes during the sequence; require no exceededCpu or exceededMemory outcomes.
- Require Argentina retailer and hybrid economics gates to pass independently.
- Preserve minimum comparable evidence, tariff validation and freight calculations.
- Mercado Libre remains degraded; retailer success must not be reported as Mercado Libre success.
- Verify login draft recovery and mobile layout separately; this incident work does not certify those paths.

If paid hosting is declined, redesign the computation into supported bounded stages/offloaded execution, then prove each stage fits its platform limits. Do not rely on retries, relaxed evidence thresholds or Cloudflare's temporary CPU overrun tolerance.

References:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
