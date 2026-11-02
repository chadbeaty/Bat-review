import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/trust/notify";
import * as trustTemplates from "@/lib/email/trust-templates";
import { listingPath } from "@/lib/paths";

/**
 * Expires every open offer past its expiry time and tells both members. Safe to call at any time and from a
 * scheduler (see /api/cron/expire-offers); calling it twice does nothing the second time.
 */
export async function expireOffers(): Promise<number> {
  const db = createAdminClient();
  if (!db) return 0;
  const { data, error } = await db.rpc("expire_offers");
  if (error || !data?.length) return 0;
  const rows = data as { offer_id: string; buyer_id: string; seller_id: string; listing_id: string }[];
  const { data: listings } = await db.from("equipment_listings").select("id, title").in("id", [...new Set(rows.map((r) => r.listing_id))]);
  const { data: amounts } = await db.from("offers").select("id, amount_cents").in("id", rows.map((r) => r.offer_id));
  const cents = new Map((amounts ?? []).map((a) => [a.id as string, a.amount_cents as number]));
  const titles = new Map((listings ?? []).map((l) => [l.id, l.title as string]));
  for (const r of rows) {
    const title = titles.get(r.listing_id) ?? "a listing";
    for (const userId of [r.buyer_id, r.seller_id]) {
      await notify({ userId, type: "offer_expired", title: `An offer on ${title} expired`, link: "/account/offers",
        entityId: r.offer_id,
        email: (name) => trustTemplates.offerExpired({ name, title, amountCents: cents.get(r.offer_id) ?? 0, listingPath: listingPath(r.listing_id) }),
      });
    }
  }
  return rows.length;
}
