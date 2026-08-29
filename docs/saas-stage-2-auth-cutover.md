# SaaS Stage 2 — Authentication cutover runbook

Status: pre-cutover. `AUTH_ENFORCEMENT` must remain `false` until every gate below passes.

## Credential ownership

Never commit Clerk or operational credentials to the repository.

Configure in GitHub repository settings:

- Repository variable `VITE_CLERK_PUBLISHABLE_KEY`: Clerk Publishable Key (`pk_test_...` for the initial development instance).
- Actions secret `CLERK_SECRET_KEY`: Clerk backend Secret Key (`sk_test_...`).
- Actions secret `CLERK_JWT_KEY`: PEM JWT public key from Clerk Dashboard → API keys → Show JWT public key → PEM Public Key.
- Actions secret `INTERNAL_API_TOKEN`: random server-only value of at least 32 characters. It must never be placed in a `VITE_` variable or browser code.

The production deployment workflow synchronizes the server-side values to Cloudflare Worker secrets. The publishable key is also supplied to the Vite build and is intentionally browser-visible.

## Phase A — credentialed deployment with enforcement OFF

1. Keep `AUTH_ENFORCEMENT` set to `false` in `wrangler.jsonc`.
2. Configure all Clerk values plus `INTERNAL_API_TOKEN` in GitHub.
3. Merge/deploy the credential wiring.
4. Confirm the production deploy passes:
   - unit/integration tests;
   - local D1 validation;
   - production D1 schema validation;
   - privileged `/api/runtime-smoke` using the server-only token;
   - Alibaba self-scrape smoke;
   - opportunity search smoke;
   - Mercado Libre smoke;
   - intake smoke.
5. Open ShippingAPP and verify Clerk sign-in/sign-up renders.
6. Sign in with a development user and call `/api/me`; confirm exactly one corresponding D1 `users` record is created.

Do not proceed if the frontend can expose `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or `INTERNAL_API_TOKEN` in generated assets, logs, or network requests.

## Phase B — adversarial pre-cutover checks

With credentials loaded but enforcement still OFF, run the automated auth tests and verify the intended boundary map:

- public routes remain public;
- customer compute routes are classified `authenticated`;
- operational diagnostics are classified `internal`;
- provider callbacks/webhooks retain their dedicated access class;
- `/api/me` requires a real user identity once enforcement is ON and cannot use the operational token.

## Phase C — enforcement cutover

Change only:

```json
"AUTH_ENFORCEMENT": "true"
```

Deploy from `main`, then immediately verify:

1. `GET /api/runtime-smoke` without `x-shippingapp-internal-token` returns `401`.
2. The same request with the GitHub/Cloudflare operational credential succeeds.
3. Direct unauthenticated calls to `/api/analyze`, `/api/opportunity-search`, `/api/intake`, `/api/ncm-classify`, `/api/mercadolibre/benchmark`, and `/api/chat` return `401` before provider/AI/browser work occurs.
4. A forged `x-shippingapp-user-id`, `x-shippingapp-auth-subject`, or `x-shippingapp-auth-kind` header does not grant access.
5. An invalid, expired, or wrong-instance Clerk token returns `401`.
6. A valid signed-in browser session succeeds and `/api/me` returns only the server-derived D1 user identity.
7. The operational token cannot impersonate a user on `/api/me`.
8. Existing provider callback/webhook routes still behave as designed.

## Rollback

If any P0/P1 auth or availability regression appears after cutover:

1. Change `AUTH_ENFORCEMENT` back to `false` and deploy immediately.
2. Do not remove D1 user records or rotate Clerk keys unless compromise is suspected.
3. If the operational token is exposed, rotate `INTERNAL_API_TOKEN` in GitHub and Cloudflare before any re-enable attempt.
4. If a Clerk server secret is exposed, rotate it in Clerk, update the GitHub secret, redeploy, and re-run the full Stage 2 adversarial suite.
5. Record the failure and remediation before attempting another cutover.

## Stage 2 completion gate

Stage 2 is `COMPLETED` only when:

- CI is green;
- credentialed production deployment is green;
- enforcement is ON;
- valid browser sign-in works;
- unauthenticated/direct-Worker bypass attempts fail;
- forged identity headers fail;
- internal-token separation is proven;
- cross-user authorization tests pass for every user-owned endpoint introduced in later persistence stages;
- P0/P1 findings are zero.
