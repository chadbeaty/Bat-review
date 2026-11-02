import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { MessageButton, OfferButton } from "./TrustButtons";

// Buy, offer and message buttons for a listing. "Buy now" opens checkout when the checkout_enabled setting is on
// and the seller has finished payout setup. Offers and messages work whenever the listing is live.

export type ListingActionsProps = {
  listingId: string;
  status: string;
  priceCents: number;
  acceptsOffers: boolean;
  isOwner: boolean;
};

function untilText(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

async function sellerCanAcceptPayments(listingId: string): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: listing } = await supabase.from("equipment_listings").select("seller_id").eq("id", listingId).maybeSingle();
  if (!listing) return false;
  const { data } = await supabase.rpc("seller_can_accept_payments", { p_seller: listing.seller_id });
  return data === true;
}

type Reservation = { reserved: boolean; held_by_me: boolean; reserved_until: string; offer_id: string | null };

/** An accepted offer reserves the listing for its buyer until the payment window ends. */
async function offerReservation(listingId: string): Promise<Reservation | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("listing_offer_reservation", { p_listing: listingId });
  return Array.isArray(data) && data[0]?.reserved ? (data[0] as Reservation) : null;
}

export async function ListingActions({ listingId, status, priceCents, acceptsOffers, isOwner }: ListingActionsProps) {
  if (status === "sold" || status === "reserved") {
    return (
      <div className="grid gap-2 rounded-lg border border-line bg-paper p-4" data-testid="listing-actions">
        <p className="font-semibold">{status === "sold" ? "This item has sold." : "This item is reserved for a buyer who has paid."}</p>
        <p className="text-sm text-ink-soft">It can&apos;t be bought. Save a search to hear about similar listings.</p>
      </div>
    );
  }
  if (status !== "active") {
    return (
      <div className="grid gap-2 rounded-lg border border-line bg-paper p-4" data-testid="listing-actions">
        <p className="font-semibold">{isOwner ? "Only you can see this listing." : "This listing isn't for sale right now."}</p>
      </div>
    );
  }
  if (isOwner) {
    return (
      <div className="grid gap-2 rounded-lg border border-line bg-paper p-4" data-testid="listing-actions">
        <p className="font-semibold">This is your listing.</p>
        <p className="text-sm text-ink-soft">Buyers see the buy, offer and message buttons here.</p>
      </div>
    );
  }

  const reservation = await offerReservation(listingId);
  if (reservation && reservation.held_by_me && reservation.offer_id) {
    return (
      <div className="grid gap-2" data-testid="listing-actions">
        <Link href={`/checkout/${listingId}?offer=${reservation.offer_id}`} className="btn btn-primary w-full py-3 text-base" prefetch={false} data-testid="offer-checkout">
          Check out with your accepted offer
        </Link>
        <p className="text-sm text-ink-soft">The seller accepted your offer. This item is reserved for you until {untilText(reservation.reserved_until)}.</p>
      </div>
    );
  }
  if (reservation) {
    return (
      <div className="grid gap-2" data-testid="listing-actions">
        <button type="button" className="btn btn-primary w-full py-3 text-base" disabled aria-describedby="reserved-note">
          Buy now for {formatPrice(priceCents)}
        </button>
        <MessageButton listingId={listingId} />
        <p id="reserved-note" className="text-sm text-ink-soft" data-testid="offer-reserved">
          Reserved for another buyer while they pay for an accepted offer. If they don&apos;t pay by {untilText(reservation.reserved_until)}, it becomes available again.
        </p>
      </div>
    );
  }

  const checkoutEnabled = (await getSetting<boolean>("checkout_enabled", false)) === true;
  const sellerReady = checkoutEnabled && (await sellerCanAcceptPayments(listingId));

  return (
    <div className="grid gap-2" data-testid="listing-actions">
      {sellerReady ? (
        <Link href={`/checkout/${listingId}`} className="btn btn-primary w-full py-3 text-base" prefetch={false}>
          Buy now for {formatPrice(priceCents)}
        </Link>
      ) : (
        <button type="button" className="btn btn-primary w-full py-3 text-base" disabled aria-describedby="checkout-soon">
          Buy now for {formatPrice(priceCents)}
        </button>
      )}
      <div className="grid gap-2">
        {acceptsOffers && <OfferButton listingId={listingId} priceCents={priceCents} />}
        <MessageButton listingId={listingId} />
      </div>
      {!checkoutEnabled ? (
        <p id="checkout-soon" className="text-sm text-ink-soft">
          Checkout opens soon. You can message the seller or make an offer now.
        </p>
      ) : !sellerReady ? (
        <p id="checkout-soon" className="text-sm text-ink-soft">
          The seller is still setting up payouts, so this item can&apos;t be bought yet.
        </p>
      ) : (
        <p className="text-sm text-ink-soft">Secure checkout through Stripe. Your payment is held until the item arrives as described.</p>
      )}
    </div>
  );
}
