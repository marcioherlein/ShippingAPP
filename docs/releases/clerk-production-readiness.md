# Clerk environment readiness — 2026-10-11

The published login was observed showing Clerk **Development mode**. Google sign-in in the cloud test browser stopped at a 502 before a session could be verified; this is not proof of an application-side OAuth failure.

## Changes

- Deployment rejects partial, malformed and mixed test/live Clerk configurations before syncing secrets or publishing assets. Consistent development credentials remain deployable for testing, with an explicit warning.
- Internal production readiness reports the Clerk environment and blocks launch readiness unless live frontend/backend credentials, a JWT key and authentication enforcement are configured. Only categories and booleans are returned, never key values.
- The strict Stage 8 gate requires this status. The automatic non-strict gate remains a boundary check and must not be reported as launch acceptance.

## Concurrent chat regression repair

The chat redesign added on main during this review used fixed white card backgrounds alongside dark-mode text and a low-contrast grey panel title. The existing semantic surface, border and text colors now apply to those new panels/cards in both modes, preserving the new layout and user bubbles. Existing browser contrast gates validate the integrated change.

## External cutover still required

1. Activate the production instance in Clerk for `globalshipping.app`; complete its DNS verification and provider OAuth configuration.
2. Replace repository variable `VITE_CLERK_PUBLISHABLE_KEY` and Actions secrets `CLERK_SECRET_KEY` / `CLERK_JWT_KEY` together, from that same production instance. Enter secrets only through the service's secure settings.
3. Deploy and validate login → `Cuenta conectada` → `/api/me` → resume the retained search → classify → calculate on the final domain.
4. Verify account continuity before retiring the development instance: production is a separate environment, and this patch does not migrate accounts or link different Clerk subjects.

Prefix checks detect environments, not whether two live keys/JWT belong to the same instance. DNS/OAuth correctness and session acceptance remain real-browser checks. Connected GitHub tools cannot manage Actions secrets or Clerk/DNS settings, so this patch does not perform that external cutover.
