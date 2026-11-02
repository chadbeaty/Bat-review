import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

// Buy, offer and message buttons for a listing. "Buy now" opens checkout when the checkout_enabled setting is on
// and the seller has finished payout setup. Offers and messages are built by another track, so those buttons
// stay disabled here.

export type ListingActionsProps = {
  listingId: string;
  status: string;
  priceCents: number;
  acceptsOffers: boolean;
  isOwner: boolean;
};

async function sellerCanAcceptPayments(listingId: string): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data: listing } = await supabase.from("equipment_listings").select("seller_id").eq("id", listingId).maybeSingle();
  if (!listing) return false;
  const { data } = await supabase.rpc("seller_can_accept_payments", { p_seller: listing.seller_id });
  return data === true;
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
      <div className="grid grid-cols-2 gap-2">
        {acceptsOffers && (
          <button type="button" className="btn btn-outline" disabled aria-describedby="offers-soon">
            Make offer
          </button>
        )}
        <button type="button" className={`btn btn-outline ${acceptsOffers ? "" : "col-span-2"}`} disabled aria-describedby="offers-soon">
          Message seller
        </button>
      </div>
      {!checkoutEnabled ? (
        <p id="checkout-soon" className="text-sm text-ink-soft">
          Checkout opens soon. Payments, offers and messages all happen on the site once it does.
        </p>
      ) : !sellerReady ? (
        <p id="checkout-soon" className="text-sm text-ink-soft">
          The seller is still setting up payouts, so this item can&apos;t be bought yet.
        </p>
      ) : (
        <p className="text-sm text-ink-soft">Secure checkout through Stripe. Your payment is held until the item arrives as described.</p>
      )}
      <p id="offers-soon" className="sr-only">
        Offers and messages open soon.
      </p>
    </div>
  );
}
