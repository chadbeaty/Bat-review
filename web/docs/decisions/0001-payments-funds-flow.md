# Decision 0001: How money moves (Stripe Connect funds flow)

Status: **Proposed, needs owner sign-off before live payments.** It's built in test mode.
Date: 1 November 2026.

## Context

- **Order shape:** one seller per order. The buyer pays item price + shipping + any sales tax.
- **Commission:** 7% of the item price, read from `fee_configuration`. Shipping and tax never count toward it.
- **Used goods carry risk.** Buyers need protection if a bat never arrives or isn't as described, so seller money should not be released the moment the card is charged.
- **The brief rules out improvising.** No unofficial escrow, no holding buyer money in a regular bank account, and no claim of instant payouts.

## Options (from Stripe's Connect documentation)

| | Direct charges | Destination charges | **Separate charges and transfers** |
| --- | --- | --- | --- |
| Who the charge belongs to | Seller's Stripe account | Platform | Platform |
| Refunds and disputes | Seller | Platform's balance is debited; recover by reversing the transfer | Platform's balance is debited; recover by reversing or reducing transfers |
| Pay the seller after delivery | No | Only by delaying the seller's payouts | **Yes: create the transfer when the order completes** |
| Fit for a used-goods marketplace with buyer protection | Poor | OK | **Best. Stripe recommends it for "hold the funds until the goods have been delivered"** |

Sources:
- [Charge types](https://docs.stripe.com/connect/charges)
- [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Refunds and disputes on Connect](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes)
- [Risk and liability](https://docs.stripe.com/connect/risk-management)
- [Manual payouts](https://docs.stripe.com/connect/manual-payouts)

## Decision

Use **separate charges and transfers**, with **Express connected accounts** (Stripe-hosted onboarding and dashboard), **cards and wallets only** at launch.

1. **Buyer pays.** Checkout creates a PaymentIntent on the platform for item + shipping + tax.
   - The order becomes `paid` only from a verified `payment_intent.succeeded` webhook, never from the browser redirect.
   - At that moment the listing is reserved: the unique `order_items` index blocks a second sale.
2. **Shipping.** The shipping charge pays for a Shippo label bought on the platform's Shippo account. Shipping money never goes to the seller and never counts toward commission. The seller can't be charged twice.
3. **Seller is paid when the order completes.** "Completed" means delivered per carrier tracking plus a **2-day inspection window** with no dispute opened (configurable in `site_settings`), or the buyer confirms receipt sooner.
   - Then the platform creates a Transfer for the item price minus commission, using `source_transaction` so it never runs ahead of the charge's funds.
   - The Transfer's id is stored in `orders.stripe_transfer_id`.
   - Stripe then pays out to the seller's bank on their normal payout schedule.
4. **Refunds before completion.** Refund the PaymentIntent. No transfer exists yet, so nothing has to be clawed back.
5. **Refunds and disputes after completion.** The platform's balance is debited. Recover from the seller by reversing the transfer, which an admin approves. This is never automatic.
6. **Payment processing.** The platform absorbs Stripe's processing fee out of its commission at launch, so sellers see one simple number ("7% when it sells").
   - This is controlled by a fee row `seller_processing_passthrough_percent` (default 0), so the owner can pass costs on later without code changes.
   - Actual Stripe fees are read from the balance transaction and stored in `orders.payment_processing_cents` for reporting.
7. **Sales tax.** Marketplace-facilitator laws in most US states likely make the platform responsible for collecting sales tax. Checkout is built to take a tax amount from a tax provider (Stripe Tax calculation API) and stores amount and jurisdiction on the order. Tax collection stays **off** until an accountant confirms registrations. Until then, live checkout must not open.

## Consequences

- **The platform carries chargeback risk** for all charges (true for any indirect charge type). The mitigations:
  - funds held until completion
  - photos and disclosures saved on the order
  - delivery tracking
  - an admin review step before any transfer reversal
- **The platform needs enough Stripe balance** to cover refunds after transfers. Watch it in the admin dashboard.
- **Fees to confirm on the live pricing page before launch.** Stripe Connect lists per-active-account and per-payout fees for platforms that handle pricing, e.g. $2 per monthly active account and 0.25% + 25¢ per payout; the published figures could not be confirmed as current. Reports must include them, not just card processing.
- **Seller timing.** Sellers get paid a few days after delivery, not at shipment. The seller guide and dashboard must say this plainly.

## Owner sign-off needed on

1. Separate charges and transfers with funds held until completion. **Recommended.**
2. The 2-day inspection window after delivery.
3. Platform absorbs processing fees at launch. Recommended for simplicity, at roughly 3% of margin on a typical sale.
4. Engaging an accountant on sales-tax registration before live checkout.
