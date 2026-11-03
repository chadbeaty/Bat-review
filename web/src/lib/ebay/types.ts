/** One eBay listing, reduced to what the page shows. Never stored in our database. */
export type EbayItem = {
  id: string;
  title: string;
  /** Price in cents, in USD. For an auction this is the current bid. */
  priceCents: number;
  /** eBay's condition text, for example "Pre-Owned". */
  condition: string | null;
  imageUrl: string | null;
  /** The affiliate link when eBay returned one, otherwise the plain item link. */
  url: string;
  /** True when the link carries the affiliate campaign. */
  affiliate: boolean;
  auction: boolean;
};

export type EbayResult = {
  items: EbayItem[];
  /** When this result was fetched, ISO 8601. */
  fetchedAt: string;
};
