import { formatPrice } from "@/lib/format";
import { MessageButton, OfferButton } from "./TrustButtons";

// Buy, offer and message buttons for a listing. Checkout and messaging aren't open yet, so the buttons are
// shown disabled with a clear note. The checkout track replaces this component when payments launch.

export type ListingActionsProps = {
  listingId: string;
  status: string;
  priceCents: number;
  acceptsOffers: boolean;
  isOwner: boolean;
};

export function ListingActions({ listingId, status, priceCents, acceptsOffers, isOwner }: ListingActionsProps) {
  if (status === "sold" || status === "reserved") {
    return (
      <div className="grid gap-2 rounded-lg border border-line bg-paper p-4" data-testid="listing-actions">
        <p className="font-semibold">{status === "sold" ? "This item has sold." : "This item is reserved for a buyer who is paying now."}</p>
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
  return (
    <div className="grid gap-2" data-testid="listing-actions">
      <button type="button" className="btn btn-primary w-full py-3 text-base" disabled aria-describedby="checkout-soon">
        Buy now for {formatPrice(priceCents)}
      </button>
      <div className="grid gap-2">
        {acceptsOffers && <OfferButton listingId={listingId} priceCents={priceCents} />}
        <MessageButton listingId={listingId} />
      </div>
      <p id="checkout-soon" className="text-sm text-ink-soft">
        Checkout opens soon. Payments, offers and messages all happen on the site once it does.
      </p>
    </div>
  );
}
