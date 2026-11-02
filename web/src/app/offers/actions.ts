"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { templates } from "@/lib/email";
import * as trustTemplates from "@/lib/email/trust-templates";
import { friendlyDbError } from "@/lib/trust/errors";
import { memberNames, notify } from "@/lib/trust/notify";
import { checkoutPathForOffer, parseDollarsToCents, validateOfferAmount } from "@/lib/trust/offers";
import { expireOffers } from "@/lib/trust/offers-server";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import type { FormState } from "@/components/trust/StatefulForm";

const uuid = z.string().uuid();
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

/** A buyer's first offer on a listing. Row level security checks the listing is live, accepts offers, and no block exists. */
export async function makeOffer(_prev: FormState, form: FormData): Promise<FormState> {
  const listingId = String(form.get("listingId") ?? "");
  const amount = parseDollarsToCents(String(form.get("amount") ?? ""));
  const message = String(form.get("message") ?? "").trim().slice(0, 500);
  if (!uuid.safeParse(listingId).success) return { error: "That listing could not be found." };
  if (amount === null) return { error: "Enter your offer as a dollar amount, like 150 or 150.50." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return { error: "Sign in to make an offer." };

  await expireOffers();
  const { data: listing } = await supabase
    .from("equipment_listings")
    .select("id, seller_id, title, asking_price_cents, listing_status, accepts_offers")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.listing_status !== "active") return { error: "This listing isn't available for offers." };
  if (!listing.accepts_offers) return { error: "The seller isn't accepting offers on this listing." };
  if (listing.seller_id === user.id) return { error: "You can't make an offer on your own listing." };
  const bad = validateOfferAmount(amount, listing.asking_price_cents);
  if (bad) return { error: bad };

  const { data: offer, error } = await supabase
    .from("offers")
    .insert({ listing_id: listingId, buyer_id: user.id, seller_id: listing.seller_id, made_by: user.id, amount_cents: amount, message: message || null })
    .select("id, expires_at")
    .single();
  if (error || !offer) return { error: friendlyDbError(error, "Your offer could not be sent.") };

  await notify({
    userId: listing.seller_id,
    type: "offer_received",
    title: `New offer of ${formatPrice(amount)} on ${listing.title}`,
    message: message || null,
    link: "/account/offers",
    entityId: offer.id,
    email: (name) =>
      templates.offerReceived({ name, title: listing.title, amountCents: amount, askingCents: listing.asking_price_cents, expiresAt: when(offer.expires_at), offerPath: "/account/offers" }),
  });
  revalidatePath("/account/offers");
  return { ok: `Offer of ${formatPrice(amount)} sent. The seller has until ${when(offer.expires_at)} to respond.`, nonce: Date.now() };
}

const ACTIONS = ["accept", "reject", "counter", "withdraw"] as const;

/** Accept, reject, counter or withdraw an offer. The database function does the checks and the state change. */
export async function respondToOffer(_prev: FormState, form: FormData): Promise<FormState> {
  const offerId = String(form.get("offerId") ?? "");
  const action = String(form.get("action") ?? "");
  if (!uuid.safeParse(offerId).success || !(ACTIONS as readonly string[]).includes(action)) return { error: "Unknown offer." };
  const user = await getCurrentUser();
  const db = createAdminClient();
  if (!user || !db) return { error: "Sign in to respond to offers." };

  let amount: number | null = null;
  const message = String(form.get("message") ?? "").trim().slice(0, 500);
  if (action === "counter") {
    amount = parseDollarsToCents(String(form.get("amount") ?? ""));
    if (amount === null) return { error: "Enter your counteroffer as a dollar amount, like 175 or 175.50." };
  }

  const { data: before } = await db.from("offers").select("id, listing_id, buyer_id, seller_id, amount_cents").eq("id", offerId).maybeSingle();
  if (!before || ![before.buyer_id, before.seller_id].includes(user.id)) return { error: "Offer not found." };

  const { data, error } = await db.rpc("respond_to_offer", { p_actor: user.id, p_offer: offerId, p_action: action, p_amount_cents: amount, p_message: message || null });
  if (error) return { error: friendlyDbError(error, "That didn't work. Please try again.") };
  const result = data as { status: string; offer_id: string; notify: string; new_offer_id?: string; auto_rejected?: string[] };

  const { data: listing } = await db.from("equipment_listings").select("id, title").eq("id", before.listing_id).maybeSingle();
  const title = listing?.title ?? "a listing";
  const names = await memberNames([user.id]);
  const me = names.get(user.id)?.username ?? "a member";

  if (result.status === "accepted") {
    const checkout = checkoutPathForOffer(before.listing_id, offerId);
    const { data: accepted } = await db.from("offers").select("expires_at").eq("id", offerId).maybeSingle();
    const payBy = accepted ? when(accepted.expires_at) : "soon";
    if (user.id === before.seller_id) {
      await notify({
        userId: result.notify,
        type: "offer_accepted",
        title: `Your offer on ${title} was accepted`,
        message: `${formatPrice(before.amount_cents)}. Check out to buy it.`,
        link: "/account/offers",
        entityId: offerId,
        email: (name) => templates.offerAccepted({ name, title, amountCents: before.amount_cents, checkoutPath: checkout, payBy }),
      });
    } else {
      // The buyer accepted the seller's counteroffer; the buyer now checks out, the seller is told.
      await notify({
        userId: result.notify,
        type: "offer_accepted",
        title: `@${me} accepted your counteroffer on ${title}`,
        message: `${formatPrice(before.amount_cents)}. They can now check out.`,
        link: "/account/offers",
        entityId: offerId,
      });
    }
    for (const rejectedId of result.auto_rejected ?? []) {
      const { data: r } = await db.from("offers").select("id, buyer_id, seller_id, made_by, amount_cents").eq("id", rejectedId).maybeSingle();
      if (!r) continue;
      await notify({
        userId: r.buyer_id,
        type: "offer_rejected",
        title: `Your offer on ${title} was declined`,
        message: "The seller accepted another offer.",
        link: "/account/offers",
        entityId: rejectedId,
        email: (name) => templates.offerRejected({ name, title, amountCents: r.amount_cents, listingPath: listingPath(before.listing_id) }),
      });
    }
  } else if (result.status === "rejected") {
    await notify({
      userId: result.notify,
      type: "offer_rejected",
      title: `Your offer on ${title} was declined`,
      link: "/account/offers",
      entityId: offerId,
      email: (name) => templates.offerRejected({ name, title, amountCents: before.amount_cents, listingPath: listingPath(before.listing_id) }),
    });
  } else if (result.status === "countered" && result.new_offer_id) {
    const { data: counter } = await db.from("offers").select("expires_at").eq("id", result.new_offer_id).maybeSingle();
    await notify({
      userId: result.notify,
      type: "offer_countered",
      title: `@${me} countered with ${formatPrice(amount ?? 0)} on ${title}`,
      message: message || null,
      link: "/account/offers",
      entityId: result.new_offer_id,
      email: (name) =>
        trustTemplates.offerCountered({ name, title, amountCents: amount ?? 0, fromUsername: me, offerPath: "/account/offers", expiresAt: counter ? when(counter.expires_at) : "soon" }),
    });
  } else if (result.status === "withdrawn") {
    await notify({ userId: result.notify, type: "offer_withdrawn", title: `@${me} withdrew an offer on ${title}`, link: "/account/offers", entityId: offerId });
  }
  revalidatePath("/account/offers");
  const label: Record<string, string> = { accepted: "Offer accepted.", rejected: "Offer declined.", countered: "Counteroffer sent.", withdrawn: "Offer withdrawn." };
  return { ok: label[result.status] ?? "Done.", nonce: Date.now() };
}
