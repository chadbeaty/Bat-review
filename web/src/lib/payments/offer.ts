// Accepted offers at checkout. The database (checkout_create_order) is the authority and re-checks everything
// under a lock; this module gives the page and the server action the same rules up front, so a buyer gets a
// clear message and tax is computed on the amount that will actually be charged.

import { PaymentsError, must, type Db } from "./deps";

export type OfferForCheckout = {
  id: string;
  listing_id: string;
  buyer_id: string;
  status: string;
  amount_cents: number;
  expires_at: string;
};

export type OfferCheck = { ok: true; amountCents: number } | { ok: false; code: "not_found" | "not_accepted" | "expired"; message: string };

/** Whether this buyer may pay this offer's price for this listing right now. */
export function checkOfferForCheckout(offer: OfferForCheckout | null, ctx: { buyerId: string; listingId: string; now?: Date }): OfferCheck {
  // Someone else's offer (or another listing's) looks exactly like a missing one.
  if (!offer || offer.buyer_id !== ctx.buyerId || offer.listing_id !== ctx.listingId) {
    return { ok: false, code: "not_found", message: "That offer couldn't be found." };
  }
  if (offer.status !== "accepted") {
    return { ok: false, code: offer.status === "expired" ? "expired" : "not_accepted", message: `This offer is ${offer.status}, so it can't be paid for.` };
  }
  if (new Date(offer.expires_at).getTime() <= (ctx.now ?? new Date()).getTime()) {
    return { ok: false, code: "expired", message: "The payment window for this offer has ended." };
  }
  if (!Number.isInteger(offer.amount_cents) || offer.amount_cents < 1) {
    return { ok: false, code: "not_found", message: "That offer couldn't be found." };
  }
  return { ok: true, amountCents: offer.amount_cents };
}

/** Loads the offer with the service role and applies checkOfferForCheckout. Throws a friendly PaymentsError. */
export async function requireCheckoutOffer(db: Db, offerId: string, ctx: { buyerId: string; listingId: string; now?: Date }): Promise<number> {
  const offer = must(
    await db.from("offers").select("id, listing_id, buyer_id, status, amount_cents, expires_at").eq("id", offerId).maybeSingle<OfferForCheckout>()
  );
  const result = checkOfferForCheckout(offer, ctx);
  if (!result.ok) throw new PaymentsError(result.message, `offer_${result.code}`);
  return result.amountCents;
}
