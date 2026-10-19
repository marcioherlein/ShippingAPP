# GlobalShipping

GlobalShipping is an early-stage web application built with React, TypeScript, Vite, and Cloudflare Workers.

This repository is the source of truth for the application code and deployment configuration.


## Product workflow

GlobalShipping turns a product into an import decision: estimated landed unit cost,
total investment, quantity alternatives and the evidence still needed before buying.
The quote opens as a focused sequence with one active question per screen. The
decision dashboard appears after completion. Confirm supplier currency, variant,
price tiers and packaging; validate NCM
before calculating. Saved quotes retain their original date, sources and scenarios.

See [the workspace release audit](docs/releases/import-decision-workspace.md) for
pending batches, verification evidence and remaining production gates.

## Development

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

`npm run dev` runs the frontend only. The full application requires the Worker:
apply D1 migrations with `wrangler d1 migrations apply DB --local`, then run
`wrangler dev --local` after building assets. Use the same `--persist-to` directory
for migrations and runtime. Keep local credentials in ignored configuration and
never run remote migrations as part of development setup. Production provider
credentials are not required for the deterministic test suites.

## Mercado Libre market benchmark

GlobalShipping uses the official Mercado Libre Argentina API to build a local market-price benchmark for each analyzed product.

The flow is:

1. Predict the most relevant Mercado Libre category with `domain_discovery`.
2. Search active MLA listings inside that category.
3. Reject weak comparables, accessories, used listings, premium-brand mismatches and duplicates.
4. Resolve `/items/{id}/sale_price?context=channel_marketplace` for accepted comparables when available.
5. Remove price outliers and calculate P25, median, P75 and a competitive P40 screening price.
6. Keep demand separate: public stock is never interpreted as observed sales.

Market prices only feed opportunity economics when the authenticated benchmark is `live` and has enough accepted comparables.

### Authentication

Never commit Mercado Libre credentials to the repository.

For a quick temporary setup, configure the Worker secret:

```bash
npx wrangler secret put MERCADOLIBRE_ACCESS_TOKEN
```

Mercado Libre access tokens expire, so production should use automatic refresh. GlobalShipping supports token rotation when the Worker environment provides:

- `MERCADOLIBRE_CLIENT_ID` as a secret
- `MERCADOLIBRE_CLIENT_SECRET` as a secret
- `MERCADOLIBRE_REFRESH_TOKEN` as the initial/bootstrap refresh-token secret
- `MERCADOLIBRE_TOKEN_STORE` as a Cloudflare KV binding

The Worker refreshes before expiry and writes the newly rotated access and refresh tokens to KV. If authentication is missing or unavailable, GlobalShipping fails closed and does not promote an unauthenticated Mercado Libre price into the business case.

### Production smoke endpoints

Use these endpoints to diagnose the Mercado Libre integration without running the full import flow.

Check whether authentication is configured. This endpoint never returns access tokens:

```bash
curl -s https://shippingapp.marciofabrizio.workers.dev/api/mercadolibre/status
```

Run a direct Mercado Libre benchmark for a product:

```bash
curl -s https://shippingapp.marciofabrizio.workers.dev/api/mercadolibre/benchmark \
  -H 'content-type: application/json' \
  -d '{"productName":"Paleta de pádel carbono EVA","category":"Padel racket"}'
```

Expected behavior:

- With valid Mercado Libre credentials, response `status` can become `live` and include comparables, P25/median/P75 and suggested price.
- Without credentials, response remains `configuration_required`, with no promoted market price and no fake comparables.
- With expired or invalid credentials, response is `unavailable` and the app blocks Mercado Libre economics instead of reusing old benchmarks.
