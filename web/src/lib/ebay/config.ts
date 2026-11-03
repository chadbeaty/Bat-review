// eBay configuration. The feature is OFF unless all three required variables are set; every function that
// reads this returns null when it is off, so pages render exactly as they did before.

export type EbayConfig = {
  clientId: string;
  clientSecret: string;
  /** The eBay Partner Network campaign id; it is what makes the links earn a commission. */
  campaignId: string;
  env: "production" | "sandbox";
  /** OAuth token endpoint. */
  tokenUrl: string;
  /** Browse API search endpoint. */
  searchUrl: string;
};

/**
 * eBay "Softball Bats" leaf category used to narrow every search. 50797 is the "Slowpitch Softball Bats" category
 * on ebay.com (it appears in the URLs of eBay's own browse pages, ebay.com/b/Slowpitch-Softball-Bats/50797/...).
 * TO VERIFY before launch: GET /commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=slowpitch softball bat
 * (category tree id 0 is eBay US). The owner can override it with EBAY_CATEGORY_IDS (comma-separated) without a deploy
 * of code, only of environment variables.
 */
export const EBAY_DEFAULT_CATEGORY_IDS = "50797";

export const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
export const EBAY_MARKETPLACE = "EBAY_US";

const HOSTS = {
  production: "https://api.ebay.com",
  sandbox: "https://api.sandbox.ebay.com",
} as const;

export function getEbayConfig(env: Record<string, string | undefined> = process.env): EbayConfig | null {
  const clientId = env.EBAY_CLIENT_ID?.trim();
  const clientSecret = env.EBAY_CLIENT_SECRET?.trim();
  const campaignId = env.EBAY_CAMPAIGN_ID?.trim();
  if (!clientId || !clientSecret || !campaignId) return null;
  const mode = env.EBAY_ENV?.trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
  return {
    clientId,
    clientSecret,
    campaignId,
    env: mode,
    tokenUrl: `${HOSTS[mode]}/identity/v1/oauth2/token`,
    searchUrl: `${HOSTS[mode]}/buy/browse/v1/item_summary/search`,
  };
}

export function ebayCategoryIds(env: Record<string, string | undefined> = process.env): string {
  const v = env.EBAY_CATEGORY_IDS?.trim();
  return v && /^\d+(,\d+)*$/.test(v) ? v : EBAY_DEFAULT_CATEGORY_IDS;
}

export function isEbayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return getEbayConfig(env) !== null;
}
