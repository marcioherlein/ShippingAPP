# ShippingAPP D1 Persistence and Migration Procedure

Status: Stage 1 foundation

## Purpose

Stage 1 introduces durable SaaS state without making current product flows depend on authenticated users. The Worker receives a `DB` D1 binding, but the existing analysis engine remains behaviorally unchanged until later stages intentionally persist user-owned data.

## Schema source of truth

- migrations live in `migrations/`;
- migrations are forward-only and immutable after production application;
- `migrations/0001_saas_foundation.sql` creates the initial SaaS schema;
- Wrangler records applied migrations in its D1 migrations table;
- schema constraints are part of the security boundary, not a substitute for future server authorization.

## Ownership model

Every user-owned root resource carries `user_id`. Relationships that could otherwise create cross-tenant links use composite foreign keys where practical:

- `credit_ledger(usage_period_id, user_id)` must match the owner of the usage period;
- `credit_ledger(analysis_id, user_id)` must match the owner of the analysis when an analysis is present;
- `watchlist_items(analysis_id, user_id)` must match the owner of the analysis when linked;
- `billing_events(subscription_id, user_id)` must match the subscription owner when linked.

Later authorization stages must still scope every user query by the server-authenticated user ID.

## Idempotency boundaries

The schema reserves replay protection before billing and credits exist in production:

- `usage_periods`: unique `(user_id, period_start, period_end)`;
- `analyses`: unique `(user_id, idempotency_key)` when a key is supplied;
- `credit_ledger`: globally unique `idempotency_key`;
- `watchlist_snapshots`: globally unique `idempotency_key`;
- `email_events`: globally unique `idempotency_key`;
- `billing_events`: unique `(provider, provider_event_id)`;
- provider message/subscription IDs use partial unique indexes when present.

Repository helpers treat same-key/different-payload replays as collisions rather than silently accepting mutated data.

## Local / CI

CI uses an isolated local D1 store and runs the migration twice:

```bash
rm -rf .d1-ci
npx wrangler@latest d1 migrations apply DB --local --persist-to .d1-ci
npx wrangler@latest d1 migrations apply DB --local --persist-to .d1-ci
node scripts/validate-d1-schema.mjs
```

The second apply must be a no-op/success. Vitest separately executes repository CRUD, ownership, replay, SQL-injection and malformed/oversized-value tests against SQLite semantics compatible with D1.

## Production

Stage 1 uses Wrangler automatic resource provisioning for the `DB` binding. The first production deploy creates/links the D1 resource if it does not exist. The deployment workflow then applies pending migrations remotely and verifies all required tables exist before product smoke tests continue.

No application request path reads from or writes to D1 in Stage 1, so a migration failure blocks the deployment pipeline without putting current analysis requests onto a partially initialized schema.

## Forward-only recovery procedure

1. Stop the deployment if a migration fails.
2. Do not edit an already-applied migration.
3. Confirm the failed migration was rolled back and identify the last applied migration.
4. Correct the defect in a new forward migration.
5. Re-run local migration and adversarial tests from an empty database and from the prior schema state.
6. Apply the corrective migration to production.
7. If data restoration is required, use Cloudflare D1 backup/Time Travel procedures rather than destructive ad-hoc SQL.

A rollback of Worker code does not imply a rollback of the database schema. New schema changes must therefore remain backward-compatible across the deploy window whenever later stages begin depending on D1.

## Stage 1 non-goals

- no signup/login behavior;
- no production user records are created automatically;
- no current analysis is persisted;
- no credits are consumed;
- no billing state changes are accepted;
- no watchlist/email feature becomes user-visible.
