const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(v: string | Date | null | undefined, precision: string = "day"): string {
  const d = toDate(v);
  if (!d) return "Date unknown";
  if (precision === "year") return String(d.getUTCFullYear());
  if (precision === "month") return monthFmt.format(d);
  return dateFmt.format(d);
}

export function formatShortDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? shortFmt.format(d) : "—";
}

export function formatDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? timeFmt.format(d) : "—";
}

export function isoDate(v: string | Date | null | undefined): string | undefined {
  return toDate(v)?.toISOString();
}

export function formatMoney(value: number | string | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
  } catch {
    return `${n.toLocaleString("en-US")} ${currency}`;
  }
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

export function hostname(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function slugify(input: string, max = 80): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** ISO timestamp for N days before now (server-side request time). */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
