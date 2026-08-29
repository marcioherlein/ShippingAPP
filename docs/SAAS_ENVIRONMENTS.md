# ShippingAPP SaaS Environment Model

Status: Stage 0 baseline

The SaaS layer must preserve strict separation between local development, preview/test and production. No environment should depend on secrets committed to the repository.

## Local development

Purpose:
- unit tests;
- integration tests with local/mocked bindings;
- local Wrangler smoke tests;
- schema/migration development once D1 is introduced.

Rules:
- use dummy provider credentials unless a specific manual provider test requires otherwise;
- never copy production D1 data into local development;
- never commit `.dev.vars`, `.env`, API tokens or OAuth secrets;
- test fixtures must use obviously fake credentials and fake user identifiers.

## Preview / test

Purpose:
- branch/PR validation;
- destructive/adversarial tests that must not touch production users or production subscriptions;
- provider sandbox/test credentials where available.

Target state:
- separate D1 database from production;
- separate auth instance/environment;
- separate billing sandbox/test configuration;
- separate email test configuration;
- provider secrets stored through Cloudflare/GitHub secret stores, never repository variables containing plaintext secrets.

Until a dedicated preview deployment is introduced, CI local Wrangler execution is the primary pre-production runtime boundary. Tests must not assume production secrets are present.

## Production

Current production Worker:

`https://shippingapp.marciofabrizio.workers.dev`

Production requirements:
- only production Cloudflare bindings and secrets;
- no test users automatically promoted to paid entitlements;
- production billing state sourced from verified provider data/webhooks;
- production D1 migrations executed deliberately and recorded;
- transactional email sent only after domain/provider production readiness;
- operational smoke endpoints must never return credential material.

## Secret-handling rules

Known sensitive Worker configuration includes:
- `PARSEBOT_API_KEY`;
- `MERCADOLIBRE_ACCESS_TOKEN` when temporary static auth is used;
- `MERCADOLIBRE_CLIENT_SECRET`;
- `MERCADOLIBRE_REFRESH_TOKEN`;
- future Clerk/auth verification secrets;
- future Resend API key;
- future billing provider access tokens/webhook secrets.

Rules:
1. secrets are injected through platform secret stores;
2. secrets are not committed to Git;
3. secrets are not returned in API responses;
4. secrets are not placed in query strings by ShippingAPP;
5. request logs never include request bodies or query strings;
6. exception messages are treated as untrusted because provider SDKs may embed request metadata;
7. frontend `VITE_*` variables must never contain server secrets because Vite exposes them to browser bundles.

## Data separation target

Starting in Stage 1, persistent state must be environment-specific:

| Resource | Local | Preview/Test | Production |
|---|---|---|---|
| D1 | local Wrangler DB | dedicated test DB | dedicated production DB |
| Auth | test/dev | test/dev | production |
| Billing | mock/sandbox | sandbox | live |
| Email | test recipient only | test/sandbox | verified production domain |
| Provider secrets | fake/manual dev | test credentials | production credentials |

## Deployment gate

A change that alters persistent state, authentication, billing, email delivery or entitlements must document which environment was tested and must not claim production completion based only on local tests.
