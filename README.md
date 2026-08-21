# ShippingAPP

ShippingAPP is an early-stage web application built with React, TypeScript, Vite, and Cloudflare Workers.

This repository is the source of truth for the application code and deployment configuration.

## Mercado Libre market benchmark

ShippingAPP uses the official Mercado Libre Argentina API to build a local market-price benchmark for each analyzed product.

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

Mercado Libre access tokens expire, so production should use automatic refresh. ShippingAPP supports token rotation when the Worker environment provides:

- `MERCADOLIBRE_CLIENT_ID` as a secret
- `MERCADOLIBRE_CLIENT_SECRET` as a secret
- `MERCADOLIBRE_REFRESH_TOKEN` as the initial/bootstrap refresh-token secret
- `MERCADOLIBRE_TOKEN_STORE` as a Cloudflare KV binding

The Worker refreshes before expiry and writes the newly rotated access and refresh tokens to KV. If authentication is missing or unavailable, ShippingAPP fails closed and does not promote an unauthenticated Mercado Libre price into the business case.
