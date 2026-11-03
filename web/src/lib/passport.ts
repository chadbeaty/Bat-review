// Bat Passport: turns real catalog, sales, owner-report and listing data into four check states.
// Pure functions only (no database access), so the look can change without touching the rules.
// Nothing here claims a bat is legal for play: it only reports what the data says and where it came from.

import { soldStats, type PriceThresholds, type SaleRecord } from "@/lib/price-stats";

export type PassportCheckKey = "stamp" | "price" | "owners" | "listing";

export type PassportCheck = {
  key: PassportCheckKey;
  title: string;
  /** True when the check has real data / passes. */
  filled: boolean;
  headline: string;
  detail: string | null;
};

export type PassportInput = {
  stamp: { associations: string[]; status: string | null; verifiedAt: string | null; source: string | null };
  sales: SaleRecord[];
  thresholds: Pick<PriceThresholds, "minSales">;
  /** Row of owner_report_durability (only exists once enough owners have reported), or null. */
  durability: { reportingOwners: number; ownersReportingFailure: number; ownersCracked: number; medianHitsIntact: number | null } | null;
  /** Published owner reports for the model, whether or not the minimum is reached. */
  publishedReports: number;
  minOwners: number;
  listing: {
    conditionScore: number | null;
    conditionLabel: string | null;
    structuralDisclosure: "no_known_damage" | "damage_disclosed" | "unknown";
    damageAnswers: (boolean | null)[];
    photoCount: number;
  };
};

export const CERT_STATUS_LABELS: Record<string, string> = {
  unverified: "not verified yet",
  manufacturer_listed: "listed by the manufacturer",
  association_listed: "listed by the association",
  decertified: "removed from the approved list",
  not_applicable: "not applicable",
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function stampCheck(s: PassportInput["stamp"]): PassportCheck {
  const title = "Stamp";
  const assoc = s.associations.filter(Boolean);
  const status = s.status;
  const known = status === "manufacturer_listed" || status === "association_listed" || status === "decertified";
  if (!assoc.length || !status || !known) {
    return {
      key: "stamp",
      title,
      filled: false,
      headline: "Stamp not verified yet",
      detail: assoc.length ? `Catalog lists ${assoc.join(" / ")}, but nobody has verified it. Check the barrel stamp.` : "No stamp is recorded for this model.",
    };
  }
  const label = `${assoc.join(" / ")} · ${CERT_STATUS_LABELS[status]}`;
  if (status === "decertified") return { key: "stamp", title, filled: false, headline: label, detail: "Check the current approved list before you buy." };
  let detail = status === "association_listed" ? "Approved list status" : "Listed status";
  if (s.verifiedAt) detail += `: verified on ${s.verifiedAt.slice(0, 10)}`;
  if (s.source) detail += ` (${s.source})`;
  return { key: "stamp", title, filled: true, headline: label, detail: `${detail}. Lists change, so confirm with the association.` };
}

export function priceCheck(sales: SaleRecord[], t: Pick<PriceThresholds, "minSales">): PassportCheck {
  const title = "Price history";
  const stats = soldStats(sales, { minSales: t.minSales, fullSales: Math.max(t.minSales, 10) });
  if (stats.tier === "insufficient") {
    return { key: "price", title, filled: false, headline: `Not enough sales yet (${stats.count})`, detail: `Needs ${t.minSales} verified sales on the site.` };
  }
  return {
    key: "price",
    title,
    filled: true,
    headline: `${usd(stats.minCents)} to ${usd(stats.maxCents)}`,
    detail: `${plural(stats.count, "verified sale")}, ${stats.firstDate} to ${stats.lastDate}`,
  };
}

export function ownersCheck(d: PassportInput["durability"], publishedReports: number, minOwners: number): PassportCheck {
  const title = "Owner reports";
  if (!d || d.reportingOwners < minOwners) {
    return {
      key: "owners",
      title,
      filled: false,
      headline: `Not enough owner reports yet (${publishedReports})`,
      detail: `Shown once ${minOwners} owners have reported.`,
    };
  }
  const hits = d.medianHitsIntact != null ? `Median ${Math.round(d.medianHitsIntact)} hits on bats still intact` : "Median hits not reported";
  return {
    key: "owners",
    title,
    filled: true,
    headline: hits,
    detail: `${plural(d.reportingOwners, "owner")} reporting, ${d.ownersCracked} reported cracks`,
  };
}

export function listingCheck(l: PassportInput["listing"]): PassportCheck {
  const title = "Listing details";
  const answered = l.damageAnswers.filter((a) => a !== null).length;
  const filled = l.conditionScore != null && l.structuralDisclosure !== "unknown" && l.photoCount > 0;
  const condition = l.conditionScore != null ? `Condition ${l.conditionScore}/10` : "Condition not rated";
  return {
    key: "listing",
    title,
    filled,
    headline: condition,
    detail: `${answered} of ${l.damageAnswers.length} damage questions answered, ${plural(l.photoCount, "photo")}`,
  };
}

export function buildPassport(input: PassportInput): { checks: PassportCheck[]; filledCount: number } {
  const checks = [
    stampCheck(input.stamp),
    priceCheck(input.sales, input.thresholds),
    ownersCheck(input.durability, input.publishedReports, input.minOwners),
    listingCheck(input.listing),
  ];
  return { checks, filledCount: checks.filter((c) => c.filled).length };
}
