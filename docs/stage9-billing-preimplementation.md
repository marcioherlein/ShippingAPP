# Stage 9 — Billing pre-implementation gate

Status: **ISOLATED DEVELOPMENT**.

Stage 9 may be developed and tested on `feature/saas-stage-9-billing` while Stage 8 remains blocked on external production-domain/email configuration. This branch must not merge into `main` until Stage 8 is formally completed or the SaaS program sequencing rule is explicitly changed.

## Billing authority

- Mercado Pago Subscriptions is accessed only from the Worker.
- Browser redirects and success pages never grant paid entitlement.
- The browser may request a server-owned plan code only; it may not provide amount, currency, provider plan ID, recipient email, user ID or subscription status.
- Provider access tokens, webhook secrets and plan IDs are server-only configuration.
- The Worker derives the payer email from the authenticated user's D1 record.
- A local subscription begins non-active and becomes paid only after authoritative provider reconciliation.
- Existing Stage 5 entitlements consume only D1 subscriptions in `active`/`trialing`, so any write to those states is a security-sensitive billing operation.

## Provider contract

ShippingAPP uses Mercado Pago Subscriptions resources:

- `/preapproval_plan` for provider plans;
- `/preapproval` to create subscriptions;
- `/preapproval/{id}` to read/update a subscription;
- `/preapproval/search` for recovery/search;
- webhook topics `subscription_preapproval`, `subscription_authorized_payment` and `subscription_preapproval_plan`.

Webhook payload status is not entitlement authority. After validating authenticity, ShippingAPP fetches the current provider resource server-to-server and reconciles that current state.

## Stage gate

Implementation must cover checkout idempotency/recovery, verified webhooks, replay protection, out-of-order events, cross-tenant attempts, cancellation, provider reconciliation, sanitized failures and client-plan tampering before Stage 9 can be considered mergeable.
