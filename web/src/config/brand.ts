// Every brand-specific value lives here. Change the name, colors, emails or links in this one file and the
// whole site follows. "Gamer Bat" (gamerbat.com) was chosen on 2026-11-03; the owner still has to run a trademark search (see docs/BRAND.md).

export const brand = {
  name: "Gamer Bat",
  shortName: "Gamer Bat",
  domain: "gamerbat.com",
  /** Two-part wordmark: the second part is drawn lighter. */
  wordmark: ["Gamer", "Bat"] as const,
  tagline: "The used slow-pitch bat market players trust",
  description:
    "Buy and sell used slow-pitch softball bats and gear. Every bat model comes with its stamp, real sold prices and owner reports.",
  /** Production URL once a domain is chosen. Used for canonical links, sitemaps and emails. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /**
   * Identity colors (see docs/BRAND.md). Concrete is the page, ink is text and rules, paper is the card/passport page.
   * Tag yellow is for prices and money actions ONLY, always as a background behind ink text, never as text on a light page.
   * Violet, red and green are passport ink colors and mean "verified".
   */
  colors: {
    ink: "#121820",
    inkSoft: "#59636b",
    /** Dugout concrete: the page background. */
    paper: "#e4e6e1",
    /** Passport paper: cards, inputs and pages that sit on the concrete. */
    surface: "#f7f5ef",
    line: "#c4c8c2",
    lineStrong: "#8e989e",
    /** Hang-tag yellow. Prices and money actions only, with ink text on top. */
    accent: "#ffd23f",
    accentInk: "#121820",
    steel: "#8e989e",
    passportViolet: "#4b2fa0",
    customsRed: "#c0352b",
    clearedGreen: "#1d6e4b",
    success: "#1d6e4b",
    danger: "#b02e24",
    warning: "#7a5c08",
  },
  email: {
    fromName: "Gamer Bat",
    fromAddress: "hello@gamerbat.com",
    supportAddress: "support@gamerbat.com",
  },
  /** Leave a link empty to hide it. */
  social: {
    instagram: "",
    facebook: "",
    x: "",
    youtube: "",
  },
  legalEntity: "PROJECT_LEGAL_ENTITY",
} as const;

export type Brand = typeof brand;

/** CSS custom properties generated from the brand colors (injected in the root layout). */
export function brandCssVariables(colors: Brand["colors"] = brand.colors): string {
  const toVar = (key: string) => "--brand-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  return `:root{${Object.entries(colors)
    .map(([k, v]) => `${toVar(k)}:${v}`)
    .join(";")}}`;
}
