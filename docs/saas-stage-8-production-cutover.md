# SaaS Stage 8 — Production brand/domain/email cutover

Status: **PRE-CUTOVER**. Keep `EMAIL_SENDING_ENABLED=false` until every strict gate below has passed.

This stage moves ShippingAPP from the development/default Worker identity to a final production application/auth/email identity. It does not change the Stage 6/7 rule that recipients, preferences and idempotency are server-authoritative.

## Safety model

1. Production sending has a version-controlled kill switch: `EMAIL_SENDING_ENABLED=false`.
2. GitHub repository variables may stage final public/sender identity without turning delivery on.
3. Resend and unsubscribe secrets are server-only GitHub Actions secrets and are synchronized to the Worker; they are never `VITE_` values.
4. `/api/production-readiness` is internal/service-token only and returns booleans/domains/blockers, never secret values.
5. The strict Stage 8 gate checks the Worker configuration plus public DNS (host, SPF, DKIM, DMARC) while the send kill switch remains OFF.
6. Enabling sending is a separate final code change after external delivery/auth checks.

## GitHub repository variables

Configure these under **Settings → Secrets and variables → Actions → Variables**. They are not credentials.

- `APP_PRODUCTION_URL` — final HTTPS app origin, e.g. `https://app.example.com`.
- `EMAIL_APP_NAME` — sender/application display name.
- `CLERK_AUTHORIZED_PARTIES` — comma-separated allowed origins. Keep localhost only if deliberately required; include the final app origin.
- `EMAIL_FROM` — verified sender identity, e.g. `ShippingAPP <noreply@example.com>`.
- `EMAIL_REPLY_TO` — monitored reply mailbox.
- `EMAIL_SUPPORT_EMAIL` — published support mailbox.
- `EMAIL_DOMAIN` — sending/organizational domain used by the Stage 8 DNS gate.
- `EMAIL_SPF_RECORD_NAME` — DNS name containing the required SPF record.
- `EMAIL_SPF_EXPECTED_FRAGMENT` — provider-supplied public fragment that must appear in SPF.
- `EMAIL_DKIM_RECORD_NAME` — provider-supplied DKIM DNS record name.
- `EMAIL_DKIM_EXPECTED_FRAGMENT` — a public fragment from the provider-supplied DKIM value used to prove the correct record is live.
- `EMAIL_DMARC_RECORD_NAME` — normally `_dmarc.<domain>`.

Do not invent SPF/DKIM values. Copy the exact public DNS values supplied by the selected email provider/domain setup.

## GitHub Actions secrets

Configure under **Settings → Secrets and variables → Actions → Secrets**:

- `RESEND_API_KEY` — production/server Resend credential.
- `EMAIL_UNSUBSCRIBE_SECRET` — random server-only secret, at least 32 characters.

Existing Clerk secrets remain:

- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`
- repository variable `VITE_CLERK_PUBLISHABLE_KEY`

If the production Clerk instance differs from the development instance, replace all three as one coordinated set. Never place `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `RESEND_API_KEY` or `EMAIL_UNSUBSCRIBE_SECRET` in a `VITE_` variable or paste them into chat/issues/logs.

## External domain setup

Before the strict gate:

1. Point the final app host to the ShippingAPP Worker using a Cloudflare Custom Domain / supported Worker route.
2. Configure the final origin in Clerk production allowed origins/redirect configuration.
3. Add and verify the sending domain in Resend.
4. Publish the provider-supplied SPF/DKIM records.
5. Publish DMARC. A monitoring policy (`p=none`) is acceptable for initial validation; later tightening is an operational decision.
6. Create/verify the reply/support mailbox.

The normal Worker deploy continues to use the `workers.dev` endpoint for its existing regression probes so an incomplete DNS cutover cannot hide an application regression. The dedicated Stage 8 gate checks the final public host separately.

## Phase A — staged configuration, sending OFF

After the repository variables and server secrets are configured, deploy trusted `main` while `EMAIL_SENDING_ENABLED=false`.

Expected results:

- deploy synchronizes Resend/unsubscribe secrets to Cloudflare;
- production config consumes the Stage 8 identity variables;
- `/api/production-readiness` reports the final host and aligned sender/reply/support domains;
- unauthenticated access to `/api/production-readiness` returns 401;
- the service-token check succeeds;
- no application email is sent because the kill switch is still OFF.

## Phase B — strict readiness gate

Run **Stage 8 Production Readiness Gate** manually with `require_ready=true`.

It must prove:

- final HTTPS app host resolves;
- final public origin is included in Clerk authorized parties;
- Resend provider is configured in the Worker;
- sender, reply-to and support identities are configured and domain-aligned;
- unsubscribe signing/base URL is configured;
- SPF required provider evidence is live;
- DKIM required provider evidence is live;
- DMARC exists;
- final application shell responds over HTTPS;
- `EMAIL_SENDING_ENABLED=false` remains in effect during readiness validation.

Any failure blocks activation.

## Phase C — Clerk production-session validation

On the final production host:

1. Sign out and sign in using the production Clerk flow.
2. Confirm the UI reports `Cuenta conectada`.
3. Confirm `/api/me` works through the browser session and does not accept the operational token as a user identity.
4. Confirm auth redirects never send the session to the old/default host unexpectedly.
5. Repeat invalid/forged token tests through the existing auth boundary gate.

## Phase D — delivery validation before scheduler activation

With the final sender/domain verified, perform controlled transactional delivery tests to representative mailbox providers (at minimum Gmail and Outlook/Hotmail; add an organizational/custom-domain mailbox if available).

For each test record:

- provider accepted message ID;
- inbox/spam result;
- From, Reply-To and display name;
- SPF result;
- DKIM result;
- DMARC result;
- unsubscribe link origin for optional mail;
- no cross-user content or recipient leakage.

Do not enable the weekly scheduler's real sends until those tests pass.

## Phase E — explicit send activation

Only after Phases A–D and all adversarial/regression gates pass:

1. Create a dedicated activation branch/PR.
2. Change only the version-controlled production send switch from `false` to `true` (plus evidence/tests genuinely needed for the activation).
3. CI must pass.
4. Merge with a fixed head SHA.
5. Production deploy and Stage 8 strict gate must pass again.
6. Send a controlled test before relying on the next scheduled digest.

Do not make send activation a mutable browser value or an unaudited repository variable.

## Adversarial checklist

Stage 8 is blocked if any of the following succeeds:

- production provider secret appears in browser assets/logs/responses;
- preview/PR workflow gains production email secrets;
- final app URL is HTTP, credential-bearing or an unrelated origin;
- Clerk authorized parties omit the final origin;
- From/Reply-To/support can be injected with CRLF;
- From/Reply-To/support use an unrelated/spoofed domain;
- unsubscribe URL resolves to an attacker-controlled origin;
- SPF/DKIM/DMARC evidence is missing or mismatched;
- anonymous caller can read production readiness internals;
- sending becomes enabled before strict readiness/delivery evidence exists.

## Rollback

Email rollback is independent of scheduler/history state:

1. Set/revert `EMAIL_SENDING_ENABLED=false` and deploy.
2. If a secret may be compromised, rotate the affected Resend/unsubscribe/Clerk secret and redeploy.
3. Keep digest/email event persistence so idempotency/audit state is preserved.
4. If the final custom domain is broken, keep the existing `workers.dev` Worker endpoint available while repairing DNS/routing.
5. If Clerk production routing is broken, restore the previous authorized-party/instance configuration before accepting new customer traffic.

## Stage 8 completion gate

Stage 8 is **not complete** until all are true:

- final app/auth/sending identities chosen and configured;
- strict runtime readiness PASS;
- final host/DNS SPF/DKIM/DMARC PASS;
- production Clerk sign-in PASS on final host;
- representative delivery tests PASS;
- preview/prod secret separation adversarial PASS;
- full regression and production smokes PASS;
- explicit send activation PASS (or a documented launch decision to keep sending disabled, if product launch intentionally excludes email);
- completion report merged;
- P0/P1 open = 0.
