# Browser quality gates

Playwright tests in this directory use the `*.e2e.ts` suffix so Vitest does not collect them.

Run locally with:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite targets deterministic UI/accessibility behavior only and should not depend on live Alibaba, Mercado Libre, authentication, freight or customs services.
