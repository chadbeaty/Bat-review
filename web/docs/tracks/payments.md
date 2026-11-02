# Track D: checkout, Stripe Connect payments and payouts, Shippo shipping

Built to [decision 0001](../decisions/0001-payments-funds-flow.md): **separate charges and transfers**, Express connected accounts, cards and wallets, funds held on the platform until the order completes. Everything runs in **test mode**. Live checkout must stay off until the go-live checklist at the end is done.

## How money flows

```
Buyer ──pays item + shipping (+ tax)──▶ Platform's Stripe balance (Checkout Session, PaymentIntent on the platform)
                                           │
              shipping money ──────────────┼──▶ pays the Shippo label (platform's Shippo account)
                                           │
   order completes (delivered + inspection │
   window, or buyer confirms) ─────────────┴──▶ Transfer to seller's Express account
                                                 = item price − commission − processing passthrough (0% at launch)
                                                 source_transaction = the order's charge, transfer_group = order id
                                                         │
                                                         └──▶ Stripe pays the seller's bank on their payout schedule
```

- **Commission** is 7% of the item price (`fee_configuration.seller_commission`), never of shipping or tax.
- **Processing passthrough** (`seller_processing_passthrough_percent`, default 0) is a percentage of the order total charged to the seller. At 0 the platform absorbs Stripe's fee, as the decision recommends. Change it on the Fees screen; new orders pick it up, old orders keep their `fee_snapshot`.
- **Rounding**: percentages round half up to the nearest cent with exact integer math (`src/lib/payments/money.ts`, `public.fee_amount_cents`).
- **Actual Stripe fees** are read from the charge's balance transaction when the payment is confirmed and stored in `orders.payment_processing_cents`. The admin overview shows the total. Stripe Connect's own platform fees (per active account, per payout) are billed separately by Stripe and are **not** in these numbers; the overview says so.
- **Refunds before completion** just refund the buyer; they come out of the seller's share (the transfer is reduced by the refunded amount, and a full refund means no transfer).
- **Refunds after completion** come from the platform balance. Recovering the money from the seller (reversing the transfer) is a separate admin-only choice with the order number typed to confirm. Never automatic.
- **Chargebacks** (`charge.dispute.*`) open a `disputes` row and put the order on hold; a seller isn't paid while any dispute is open. Respond to chargebacks in the Stripe dashboard.

## What was built

| Area | Where |
| --- | --- |
| Checkout: address (validated), live rates for the listing's package with reasons for unavailable options, review with disclosures, Stripe Checkout redirect | `/checkout/[listingId]`, `src/lib/payments/checkout.ts` |
| Atomic order + listing hold (one live order per listing), fee snapshot, totals | `checkout_create_order()` |
| Holds released on expiry/cancel | `checkout.session.expired` webhook, buyer "Cancel this checkout", and the scheduled job (expires the Stripe session first) |
| "Buy now" button / "Checkout opens soon" | `src/components/listing/ListingActions.tsx` (offers and messages stay disabled for their own track) |
| Stripe webhook (signature on the raw body, idempotent) | `/api/webhooks/stripe`, `src/lib/payments/webhooks.ts` |
| Shippo tracking webhook (URL token, idempotent per event) | `/api/webhooks/shippo`, `src/lib/shipping/webhook.ts` |
| Seller payouts: Express account, onboarding link, status, payout timing, per-order payouts | `/seller/payouts`, `src/lib/payments/connect.ts` |
| Fulfilment: orders to ship, ship-to address, return address, buy label (once), label PDF, tracking | `/seller/orders`, `/seller/orders/[id]`, `src/lib/shipping/labels.ts` |
| Buyer: purchases, timeline, tracking, "Confirm I received it", problem placeholder (`#problem`) | `/account/purchases`, `/account/purchases/[id]` |
| Completion job: release expired holds, complete ready orders, create transfers, mark sold, price history, emails | `/api/cron/orders`, `src/lib/payments/completion.ts`, `vercel.json` |
| Admin: Refunds, Payouts, Shipping exceptions, Disputes (read-only), payments numbers on Overview, new settings | `/admin/refunds`, `/admin/payouts`, `/admin/shipping`, `/admin/disputes`, `/admin`, `/admin/settings` |
| Shipping providers: `ShippoProvider` (REST) and `FakeShippingProvider` (used when `SHIPPO_API_TOKEN` is unset; every rate, label and tracking view says "Test data — not a real label") | `src/lib/shipping/*` |
| Sales tax interface (no provider is called) | `src/lib/payments/tax.ts` |
| Emails: purchase confirmation, seller order, label available, tracking update, delivered, refund, review request | existing templates in `src/lib/email/templates.ts` |

### Database (`supabase/migrations/20261103000100_payments_shipping.sql`)

- Settings: `checkout_enabled` (false), `tax_collection_enabled` (false), `inspection_window_days` (2), all type-checked. Fee row `seller_processing_passthrough_percent` = 0.
- New order columns: `checkout_expires_at`, `stripe_checkout_url`, `buyer_confirmed_at`, `transfer_amount_cents`, `transfer_reversed_cents`, `transfer_error`, `transfer_attempted_at`, `status_before_dispute`, `payment_issue`.
- New tables (RLS on): `shipping_quotes` (buyer reads own; the server stores rates so a browser can't set its own shipping price), `payment_refunds` (order parties and support read), `seller_payouts` (seller and support read). Browsers can't write any of them.
- Unique index: one outbound label per order.
- Server-only functions (service role): `checkout_create_order`, `checkout_release_order`, `payments_mark_paid`, `shipping_record_event`, `orders_ready_to_complete`, `payments_complete_order`, `payments_apply_refund_total`, `admin_record_refund` (audited, support can refund, only admins can record a transfer reversal), `payments_record_chargeback`, `orders_buyer_confirm_received`, `admin_payments_overview`. Public: `seller_can_accept_payments` (yes/no).

### Order states

`awaiting_payment → paid → processing (label bought) → shipped (first carrier scan) → delivered → completed`, with `cancelled` (hold released), `disputed` (chargeback or problem report) and `refunded` (full refund). The order becomes `paid` **only** from a verified Stripe webhook (`checkout.session.completed` or `payment_intent.succeeded`), never from the browser redirect. A payment that doesn't match the order total is flagged, not accepted. A payment that arrives after its hold was released takes the hold back if the item is still free, otherwise it is refunded automatically.

## Owner setup

### Stripe (test mode first)

1. **Connect**: Dashboard → Connect → get started as a **platform/marketplace**. Choose **Express** accounts. Under Connect settings: set the platform name and icon shown during onboarding, **US** as the country, and enable the **transfers** capability. The platform handles pricing ("Platform pays Stripe fees").
2. **Payment methods**: Settings → Payment methods: turn on **Cards**, **Apple Pay** and **Google Pay** only (this API version uses Dashboard payment method settings for Checkout). Optionally create a payment method configuration with just those and set `STRIPE_PAYMENT_METHOD_CONFIGURATION`.
3. **Apple Pay**: add and verify the site's domain under Payment method domains.
4. **API key**: Developers → API keys → secret key → `STRIPE_SECRET_KEY` (`sk_test_...` until launch).
5. **Webhooks**: Developers → Webhooks → add two endpoints, both `https://<site>/api/webhooks/stripe`:
   - **Your account** events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`, `charge.updated`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `transfer.created`, `transfer.updated`, `transfer.reversed`. Signing secret → `STRIPE_WEBHOOK_SECRET`.
   - **Connected accounts** events: `account.updated`, `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`. Signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`.
6. Never set `STRIPE_API_HOST`, `STRIPE_API_PORT` or `STRIPE_API_PROTOCOL` outside tests.

### Shippo

1. API → token. Use the **test token** (`shippo_test_...`; its labels are free and not real) until launch → `SHIPPO_API_TOKEN`.
2. Connect carrier accounts or use Shippo's default USPS/UPS accounts; labels are billed to the platform's Shippo account.
3. Webhooks: add `https://<site>/api/webhooks/shippo?token=<SHIPPO_WEBHOOK_SECRET>` for **track_updated** (Shippo doesn't sign bodies, so the token in the URL is the check). `SHIPPO_WEBHOOK_SECRET` is any long random string.
4. Without a token the fake provider is used and the site says so on every rate, label and tracking view.

### Scheduled job (Vercel)

`vercel.json` runs `/api/cron/orders` every 15 minutes. Set `CRON_SECRET` (long random string) in the Vercel project; Vercel sends it as `Authorization: Bearer …`. Vercel's Hobby plan only allows daily cron jobs; use Pro, or an external scheduler calling the same URL with the header. The job is safe to run as often as you like.

### Switching on

`/admin/settings`: **Checkout is open** turns on the Buy now button (only for sellers who finished payout setup). **Buyer inspection window** is the 2 days from the decision. Leave **Collect sales tax** off; with it on and no tax provider, checkout pauses itself.

## Testing

| Test | What | Count |
| --- | --- | --- |
| `tests/unit/payments.test.ts` | Money math (rounding, passthrough, refunds vs transfer), state machine, package/oversize rules and dimensional weight, rate selection, tax gating, Shippo parsing and request shape, fake provider and label PDF, Checkout Session parameters, Connect status mapping, address validation | 38 |
| `tests/db/payments.test.ts` (throwaway Postgres) | Atomic hold, totals and fee snapshot, passthrough, second buyer blocked, own/inactive/unready-seller listings refused, expired quote / bad rate / foreign address, checkout off, release on expiry, mark paid once, amount mismatch, late payment, tracking idempotency and ordering, inspection window, dispute hold, buyer confirmation, completion + price history, refunds + audit, transfer reversal admin-only, chargebacks, RLS on the new tables and the ship-to address | 23 |
| `tests/integration/payments.test.ts` (stripe-mock + local Supabase) | Checkout Session creation, quotes, signed webhooks (bad signature 400, duplicate ignored, PI + session both arriving), expiry, chargeback, payout failure, account.updated, Express account + onboarding link, transfer at completion (rerun-safe), not before the window, refunds before/after transfer with typed confirmation and reversal, expiry sweep, test label + tracking webhook | 13 |
| `tests/e2e/payments.spec.ts` (browser, stripe-mock, port 3105) | "Checkout opens soon"; address → rates → review → redirect to `checkout.stripe.com` (intercepted, not followed); signed webhook → paid, listing reserved, second buyer blocked; seller buys a test label; signed DELIVERED tracking webhook; cron after moving delivery back → completed, transfer id, sold, price history; admin (with MFA) refunds another order | 7 |

Run locally: `docker run -d --name stripe-mock -p 12111:12111 stripe/stripe-mock:latest`, put the test values from `.env.example` in `.env.local` (`STRIPE_SECRET_KEY=sk_test_123`, `STRIPE_API_HOST=localhost`, `STRIPE_API_PORT=12111`, `STRIPE_API_PROTOCOL=http`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `SHIPPO_WEBHOOK_SECRET`), then `npm run build && npx next start -p 3105` and `E2E_PORT=3105 npx playwright test tests/e2e/payments.spec.ts`. Integration and browser tests skip themselves when stripe-mock or Supabase isn't running. The browser test turns `checkout_enabled` on only around the checkout steps and restores it.

### What is verified only against test doubles

- **Stripe**: every Stripe call (Checkout Sessions, session expiry, PaymentIntent retrieval with balance transaction, transfers with `source_transaction`, refunds, transfer reversals, Express accounts, account links, login links) is tested only against **stripe-mock**, which checks request shapes against Stripe's OpenAPI spec but returns fixtures and keeps no state. Webhook signatures are real (`stripe.webhooks.generateTestHeaderString` + `constructEvent`), but the event payloads were written by the tests. **Not yet run against real Stripe** (api.stripe.com isn't reachable from the build machine): the hosted Checkout page, wallets, real webhook delivery and retries, Connect onboarding, `source_transaction` timing, real fees.
- **Shippo**: `ShippoProvider` is **untested against the real Shippo API** (api.goshippo.com isn't reachable from here). Its request/response handling is unit tested against a stubbed `fetch` following Shippo's documented shapes. All end-to-end shipping runs on `FakeShippingProvider`.
- **Tax**: no provider is called; only the "off" path and the "on without a provider" guard are tested.

## Known limitations

- Problem reports and the dispute workflow are another track. The buyer page links to `#problem`, which explains this and points to support; admin Disputes is read-only.
- A buyer who contacts support instead of opening a dispute does **not** stop the automatic completion; support must refund before the window ends (or the owner extends the window).
- Shipping insurance isn't bought. Label cost above what the buyer paid is absorbed by the platform and listed on Shipping exceptions.
- Labels are bought for the service the buyer paid for, re-quoted at purchase time; if that service is gone, the cheapest carrier/service that fits is used.
- Seller payouts go to the US only; Express accounts are created as individuals (Stripe lets sellers change the business type during onboarding).
- Refunds issued directly in the Stripe dashboard are synced by `charge.refunded` (totals and a buyer email) but are not in `payment_refunds` and have no staff actor in the audit log.
- The fake provider's rates are made-up numbers; the carrier size limits in `src/lib/shipping/package.ts` must be re-checked against carriers' current published rules.
- `tests/e2e/auth.spec.ts` hardcodes port 3000 in one assertion, so it fails when run on port 3105 (not caused by this track).

## Go-live checklist

1. **Owner signs off decision 0001** (all four points: funds flow, 2-day window, platform absorbs processing, accountant on tax).
2. **Accountant** confirms sales-tax registrations; then connect a tax provider (`TaxProvider` in `src/lib/payments/tax.ts`, for example Stripe Tax calculations) before switching `tax_collection_enabled` on. Until then checkout must not open for real money.
3. **Real test-mode run with real keys**: Stripe test keys + Shippo test token on a staging deployment; do a full purchase with a test card and Apple Pay/Google Pay, onboard a test Express seller, buy a test label, simulate tracking with Shippo's test tracking numbers, let the job complete the order, check the transfer and payout in the Stripe dashboard, issue a refund before and after transfer, trigger a test chargeback.
4. Confirm current Stripe Connect pricing (per active account, per payout) and add it to reporting.
5. Re-check carrier size/weight limits and confirm Shippo label billing.
6. Switch to live keys (`sk_live_...`, live webhook secrets, live Shippo token), recreate both webhook endpoints in live mode, set `CRON_SECRET`, then turn on **Checkout is open**.
