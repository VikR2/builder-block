---
name: stripe-payments-workflow
description: "Use for The Currency Merchant Stripe subscription work: creating or checking $25/month products and prices, configuring Checkout or billing portal behavior, setting webhook events, running test-mode subscriptions, verifying premium access, checking refunds, and preparing live-payment readiness. Trigger when the user mentions Stripe, subscription payments, checkout, billing portal, refunds, webhooks, test mode, or go-live payment checks."
---

# Stripe Payments Workflow

## Rules

- Use the Stripe connector when the user asks for Stripe account objects, products, prices, subscriptions, invoices, customers, refunds, or balances.
- Treat live keys as secrets. Never commit `sk_*`, `whsec_*`, or real `.env.local` values.
- Use test mode for end-to-end payment tests unless the user explicitly asks for live checks.
- Keep production public URL as `https://thecurrencymerchant.com`.

## App Variables

For this repo, the subscription flow uses these env vars:

```env
NEXT_PUBLIC_APP_URL=https://thecurrencymerchant.com
NEXT_PUBLIC_BASE_URL=https://thecurrencymerchant.com
STRIPE_SECRET_KEY=sk_live_or_test
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Use [ui/.env.example](../../../ui/.env.example) as the template. Local development uses `ui/.env.local`; production uses Render environment variables.

## Webhook Events

Use the minimal subscription events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

The production endpoint is:

```text
https://thecurrencymerchant.com/api/stripe/webhooks
```

## Test Workflow

1. Confirm the app is using test keys and a test `STRIPE_PRICE_ID`.
2. Start the app after env changes: `cd ui && npm run dev`.
3. Create or reuse a non-premium local user.
4. Log in and create Checkout from `/api/stripe/checkout`.
5. Complete Stripe Checkout with test card `4242 4242 4242 4242`.
6. Verify Stripe reports a paid invoice and active subscription.
7. Verify signed webhooks update the app database, or use Stripe CLI:
   `stripe listen --forward-to localhost:3000/api/stripe/webhooks`.
8. Verify login returns `isPremium: true`, `hasStripeSubscription: true`, and `hasChatAccess: true`.
9. Verify `/tcm/library`, `/account/subscription`, and `/api/stripe/portal`.
10. If testing admin refund, refund only test-mode charges unless explicitly asked otherwise.

## Go-Live Check

Before saying live payments are ready, verify:

- Live product/price is the intended `$25/month` subscription.
- Render has live `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`.
- Render has both public app URLs set to `https://thecurrencymerchant.com`.
- Stripe live webhook endpoint points at `/api/stripe/webhooks`.
- Production deploy containing payment changes is live.
- `GET /api/health` returns 200.
- Unsigned webhook POST returns 400, proving the webhook route is present and signature-protected.

## Current TCM Values

Use these IDs when checking existing objects, not as secrets:

- Live product: `prod_UQmNwKp3PNazJM`
- Live price: `price_1TRuoJPOBxrKdXizEZZ3GbWa`
- Test product: `prod_UQp2xQSgwCSbxz`
- Test price: `price_1TRxOiPOBxrKdXiz1l9dQexn`
