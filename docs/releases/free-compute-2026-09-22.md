# Workers Free compute boundary

The account's Workers Free plan was confirmed from the owner's dashboard.
Production tail reported `exceededCpu` during the complete intake sequence.
Earlier bounded-response fixes reduced memory exposure but did not resolve CPU.

## Change

API requests are forwarded, without parsing bodies at the edge, to a fresh
SQLite-backed `ShippingCompute` Durable Object. It invokes the existing
request-context, authentication, entitlement and application pipeline once.
No internal bypass headers are added. Object IDs and request bodies are not
persisted. No timers, alarms, sockets or SQL writes are introduced.
Each request has its own object to avoid sharing the six-connection I/O budget
across concurrent retailer searches. Static pages and scheduled email processing
keep their existing entrypoints.

Failed dispatch returns JSON 503 without retries or fallback execution because
the original operation may already have saved data or consumed a credit.
Normal application responses retain status/body/headers and add
`x-shippingapp-compute: durable-object` for verification.

## Budget

No plan upgrade or paid provider is enabled. SQLite Durable Objects are supported
on Workers Free. Current included daily quotas: 100,000 requests and 13,000 GB-s
duration. Quota exhaustion fails operations instead of charging overages on Free.
Each object consumes duration while waiting for provider responses, so this is
not unlimited capacity. Existing provider quotas still apply.

Sources checked September 22, 2026:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## Verification and recovery

Unit coverage checks independent concurrent dispatch, request preservation,
non-replay on dispatch failure, missing binding and authentication enforcement.
Wrangler local runtime must exercise a real object, not only a mock namespace.
Production intake gate must pass all 20 intake and 20 NCM cases and require the
compute header. Retailer, hybrid-market and chat gates must also pass before
declaring recovery. CI passing alone is not production recovery evidence.

`FREE_COMPUTE_ENABLED=false` restores the previous edge routing for emergency
rollback but also restores its known CPU limitation. Keep the exported class,
binding and migration when reverting routing; do not delete a namespace as part
of rollback. The account must remain Free under the owner's zero-spend constraint.
