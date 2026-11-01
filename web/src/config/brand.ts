// Every brand-specific value lives here. Change the name, colors, emails or links in this one file and the
// whole site follows. "Dugout Trade" is a working name until the final name is cleared (see docs/BRAND.md).

export const brand = {
  name: "Dugout Trade",
  shortName: "Dugout Trade",
  /** Two-part wordmark: the second part is drawn lighter. */
  wordmark: ["Dugout", "Trade"] as const,
  tagline: "Buy. Sell. Trade. All things slow-pitch.",
  description:
    "The marketplace built for softball players. Shop used bats, gloves, bags and equipment from players nationwide.",
  /** Production URL once a domain is chosen. Used for canonical links, sitemaps and emails. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  colors: {
    ink: "#16191d",
    inkSoft: "#4a525c",
    paper: "#f7f7f4",
    surface: "#ffffff",
    line: "#e3e4df",
    lineStrong: "#c8cbc4",
    /** Softball optic yellow. Used for fills with ink text, never for text on white. */
    accent: "#e4f034",
    accentInk: "#16191d",
    success: "#1f7a4d",
    danger: "#b4372b",
    warning: "#8a6a10",
  },
  email: {
    fromName: "Dugout Trade",
    fromAddress: "hello@example.com",
    supportAddress: "support@example.com",
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
