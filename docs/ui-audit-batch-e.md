# UI Audit Batch E — Browser Quality Gates

This batch converts the remaining manual audit expectations into executable browser gates.

## Automated browser checks

- Chromium launches against a local Vite server with Clerk disabled for deterministic public-journey testing.
- Axe scans the initial journey, a keyboard-completed advanced journey state, and the mobile journey.
- CI fails on serious or critical WCAG 2.x violations.
- The primary flow from intent selection through operation and budget can be completed keyboard-only.
- Keyboard focus must have a visible computed outline of at least 2px on the entry action.
- `prefers-reduced-motion: reduce` must be observable and suppress effective transition/animation duration.
- The mobile journey must keep the current work visible and hide the expanded hero description after intent selection.

## CI integration

CI installs Chromium with Playwright, then runs `npm run test:e2e` after the existing unit/integration suite and before schema/build/deployment validation.

## Scope boundary

These tests intentionally avoid external Alibaba, classification, freight, Mercado Libre or authentication calls. They validate the deterministic guided journey and accessibility contract; backend/runtime coverage remains in the existing unit, D1, Wrangler and production shell gates.
