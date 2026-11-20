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
   * VERCEL_PROJECT_PRODUCTION_URL to the production domain, so this follows getgapper.com with no code change.
   * NEXT_PUBLIC_SITE_URL overrides it.
   */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://getgapper.com"),
  /** Primary tagline. Slow pitch plays four outfielders, so there are three gaps, not two. */
  tagline: "OWN THE GAPS.",
  taglineTitle: "Own the gaps.",
  /** Secondary tagline: who it's for, in one line. */
  secondary: "BUILT FOR SLOWPITCH.",
  secondaryTitle: "Built for slowpitch.",
  /** The three brand words: the whole product loop. */
  pillars: ["Record", "Analyze", "Improve"] as const,
  /** Homepage hero. */
  hero: "STOP GUESSING. START HITTING.",
  heroSub:
    "The next generation of slow-pitch softball swing analytics. Understand your mechanics, measure your progress and build a more consistent swing.",
  cta: "Analyze your swing",
  ctaSecondary: "See how it works",
  /**
   * Who it's for. Gapper is strictly adult slow-pitch softball: not a baseball app with a softball setting, not
   * fastpitch. Never say baseball is coming, and never frame it as "baseball and softball".
   */
  sport: "slow-pitch softball",
  /** Page titles and link previews: what it is, in a few words. */
  what: "Slow-pitch performance analytics",
  /**
   * The position we want to own. Broad swing-analysis products compete for general hitters; Gapper is the name
   * slow-pitch players associate with understanding and improving their swing.
   */
  platform: "The performance analytics platform for the slow-pitch softball community.",
  platformShort: "The performance analytics platform for slow-pitch softball.",
  /** The selling point, said plainly. "Built for slowpitch." is always set in lime wherever it appears as text. */
  positioning: "Built for slowpitch. Not baseball. Not fastpitch.",
  positioningLead: "Built for slowpitch.",
  positioningRest: "Not baseball. Not fastpitch.",
  /** Who's swinging: the players the brand talks to. */
  audience: ["USSSA", "USA Softball", "Independent leagues", "Rec league", "Tournament teams"],
  description:
    "Gapper is the performance analytics platform for the slow-pitch softball community. Record a swing on your phone, see your load-to-contact timing, front-foot landing, bat path and rotation, get the one fix and the drill for it, and track your progress. Exit velo and bat speed come only from slo-mo video, always with a ± range.",
} as const;
