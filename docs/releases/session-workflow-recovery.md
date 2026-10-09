# Session and workflow recovery — 2026-10-09

Scope: launch recovery lot 1. Classification and tax changes are separate lots.

## Resulting behavior

The frontend distinguishes SDK loading, signed out, server verification, connected
and connection error. Customer calls wait for `/api/me` to accept the session.
Only that verified state announces authentication completion. A signed-in rejection
does not reopen the login modal. Account connection failures offer a reconnect action.

Search, selected supplier URL, owned-product URL and confirmation operations are
saved in per-tab session storage before the request. Pending operations survive
redirects and reloads, resume after verified identity even if the component mounts
late, and are marked complete after their result is handled. A busy guard prevents
duplicate simultaneous resume events. New case clears these drafts.

Metered search and analysis retries preserve their original idempotency key.
The server verifies authentication once per request and distinguishes unauthorized
origin, expired session and unavailable identity storage. The client refreshes a
rejected token once, preserving body and key, and never reuses a cached old token
when Clerk cannot provide the current session. Diagnostics log only a fixed auth
reason code alongside the server-generated request ID, never tokens.

Production configuration always includes globalshipping.app, its www origin and
the deployed workers.dev origin. Stale repository overrides cannot remove them.
Other explicitly configured origins must validate as origins.

## Verification boundaries

Automated coverage includes the real Clerk verifier using locally generated RSA
tokens for permitted origin, rejected origin and expiry. React tests cover delayed
server verification, late component mount, selected URL recovery and login-loop
prevention. Browser tests cover redirect recovery at 320px and 390px in Chromium
and WebKit using simulated identity state; they are not a real Clerk account login.

Production acceptance still requires a real account: search while signed out,
complete modal or redirect login, confirm `/api/me` succeeds and the same search
returns. Repeat with reload and expiration. An internal service smoke credential
does not satisfy this acceptance requirement. No signing keys are changed by this
release, so a mismatched Clerk instance must still be diagnosed and corrected.
