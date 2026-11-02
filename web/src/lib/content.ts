import "server-only";
import { getCurrentFee, getSetting } from "@/lib/settings";
import { describeFee, workedExample } from "@/lib/admin/fees";
import { formatPrice } from "@/lib/format";

/** Marketplace numbers quoted on content pages, read from the database so the pages never drift from the real fees. */
export async function marketplaceFacts() {
  const [commission, featured, offerHours, listingDays] = await Promise.all([
    getCurrentFee("seller_commission"),
    getCurrentFee("featured_listing"),
    getSetting<number>("offer_expiry_hours", 48),
    getSetting<number>("listing_expiry_days", 90),
  ]);
  const example = commission ? workedExample(commission) : null;
  return {
    /** "7%", or a neutral phrase when the database isn't connected. */
    commission: commission ? describeFee(commission) : "the commission shown when you list",
    hasCommission: Boolean(commission),
    featuredFee: featured ? describeFee(featured) : null,
    example: example
      ? {
          price: formatPrice(example.itemPriceCents),
          commission: formatPrice(example.commissionCents),
          seller: formatPrice(example.sellerBeforeProcessingCents),
        }
      : null,
    offerHours: Number(offerHours),
    listingDays: Number(listingDays),
  };
}
