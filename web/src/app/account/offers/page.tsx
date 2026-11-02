import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/EmptyState";
import { OfferActions } from "@/components/trust/OfferForms";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { memberNames } from "@/lib/trust/notify";
import { allowedActions, checkoutPathForOffer, effectiveStatus, STATUS_LABELS, timeLeft, type OfferStatus } from "@/lib/trust/offers";
import { expireOffers } from "@/lib/trust/offers-server";

export const metadata: Metadata = { title: "Your offers", robots: { index: false } };

type OfferRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  made_by: string;
  amount_cents: number;
  message: string | null;
  status: OfferStatus;
  expires_at: string;
  created_at: string;
};

export default async function OffersPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/offers");
  const me = auth.user.id;

  await expireOffers();
  const { data } = await supabase
    .from("offers")
    .select("id, listing_id, buyer_id, seller_id, made_by, amount_cents, message, status, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const offers = (data ?? []) as OfferRow[];
  const admin = createAdminClient();
  const listingIds = [...new Set(offers.map((o) => o.listing_id))];
  const [{ data: listings }, names] = await Promise.all([
    admin && listingIds.length ? admin.from("equipment_listings").select("id, title, asking_price_cents").in("id", listingIds) : Promise.resolve({ data: [] as { id: string; title: string; asking_price_cents: number }[] }),
    memberNames(offers.flatMap((o) => [o.buyer_id, o.seller_id])),
  ]);
  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));
  const made = offers.filter((o) => o.buyer_id === me);
  const received = offers.filter((o) => o.seller_id === me);

  function renderOffer(o: OfferRow) {
    const listing = listingById.get(o.listing_id);
    const status = effectiveStatus(o);
    const actions = allowedActions({ status: o.status, madeBy: o.made_by, buyerId: o.buyer_id, sellerId: o.seller_id, expiresAt: o.expires_at }, me);
    const other = names.get(o.buyer_id === me ? o.seller_id : o.buyer_id);
    const left = status === "pending" || status === "accepted" ? timeLeft(o.expires_at) : null;
    return (
      <li key={o.id} className="card grid gap-2 p-4" data-testid="offer-card" data-status={status}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={listingPath(o.listing_id)} className="font-semibold break-words underline">
            {listing?.title ?? "Listing"}
          </Link>
          <span className="rounded-sm border border-line-strong px-2 py-0.5 text-xs font-medium" data-testid="offer-status">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <p className="text-sm text-ink-soft">
          {o.made_by === me ? "You offered" : `@${names.get(o.made_by)?.username ?? "member"} offered`}{" "}
          <span className="font-mono text-base text-ink">{formatPrice(o.amount_cents)}</span>
          {listing ? ` (asking ${formatPrice(listing.asking_price_cents)})` : ""} · with @{other?.username ?? "member"}
          {left ? ` · ${left} left` : ""}
        </p>
        {o.message && <p className="break-words text-sm">&ldquo;{o.message}&rdquo;</p>}
        {status === "accepted" && o.buyer_id === me && (
          <Link href={checkoutPathForOffer(o.listing_id, o.id)} className="btn btn-primary justify-self-start" data-testid="checkout-link">
            Check out at {formatPrice(o.amount_cents)}
          </Link>
        )}
        {status === "accepted" && o.seller_id === me && <p className="text-sm text-ink-soft">Waiting for the buyer to check out.</p>}
        <OfferActions offerId={o.id} actions={actions} />
      </li>
    );
  }

  return (
    <div className="wrap grid gap-8 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">Your account</p>
        <h1 className="display text-5xl font-bold">Offers</h1>
        <p className="text-ink-soft">Offers expire if nobody responds in time. Only one offer on a listing can be accepted at a time.</p>
      </div>
      <section className="grid gap-3" aria-labelledby="received-heading">
        <h2 id="received-heading" className="display text-3xl font-bold">
          Received
        </h2>
        {received.length ? (
          <ul className="grid gap-3" data-testid="offers-received">
            {received.map(renderOffer)}
          </ul>
        ) : (
          <EmptyState title="No offers received" body="When a buyer makes an offer on one of your listings, it shows up here." />
        )}
      </section>
      <section className="grid gap-3" aria-labelledby="made-heading">
        <h2 id="made-heading" className="display text-3xl font-bold">
          Made
        </h2>
        {made.length ? (
          <ul className="grid gap-3" data-testid="offers-made">
            {made.map(renderOffer)}
          </ul>
        ) : (
          <EmptyState title="No offers made" body="Open a listing that accepts offers and choose Make offer." action={{ href: "/shop", label: "Shop equipment" }} />
        )}
      </section>
    </div>
  );
}
