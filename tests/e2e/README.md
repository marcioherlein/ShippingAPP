# Browser quality gates

Playwright tests in this directory use the `*.e2e.ts` suffix so Vitest does not collect them.

Run locally with:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite targets deterministic UI/accessibility behavior only and should not depend on live Alibaba, Mercado Libre, authentication, freight or customs services.

Install both configured engines with `npx playwright install chromium webkit`.
For a complete review on a small runner, use `npm run test:e2e -- --workers=1`
and keep the application source stable during the run. Parallel visual harnesses
or Vite reloads can invalidate screenshots and exhaust browser time budgets.

`account-panels.e2e.ts` renders the production history, watchlist and email
preferences inside the shared header with deterministic API responses. Its TSX
harness lives under `tests/e2e/support/`; it is served only by the development
server and is not a production build entry. These cases verify focus, modal
keyboard containment, validation, failure recovery and responsive layout, not a
real Clerk login or ownership enforcement on the backend.

The landing tests distinguish a real legal-document status page from SPA
fallback. A passing route check does **not** establish that the operator has
provided approved privacy/terms content; see the general UX/UI audit report.
