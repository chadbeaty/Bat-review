/** Brand name, domain and the lines we say about it. Use these instead of typing the name or domain in copy. */
export const SITE = {
  name: "Gapper",
  /** Uppercase is for the logo only; in sentences it's "Gapper". */
  wordmark: "GAPPER",
  domain: "getgapper.com",
  /** The canonical home of the brand. */
  canonical: "https://getgapper.com",
  /**
   * Where the site is actually served right now, for link previews and canonical tags. Vercel sets
   * VERCEL_PROJECT_PRODUCTION_URL to the production domain, so once getgapper.com is connected to the project this
   * becomes https://getgapper.com with no code change. NEXT_PUBLIC_SITE_URL overrides it.
   */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://getgapper.com"),
  tagline: "OWN THE GAP.",
  taglineTitle: "Own the gap.",
  lines: ["Know your swing.", "Own your game.", "Every swing has a story.", "Turn data into distance."],
  description:
    "Gapper is a hitting lab on your phone. It catches every swing, scores your mechanics legs and feet first, tells you the one thing to fix, and measures exit velo and bat speed from slo-mo video.",
} as const;
