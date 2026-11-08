// Formatting helpers (dates, money, numbers). All times shown in UTC so they match the stored evidence.

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "unknown";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 0) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function day(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "unknown";
}

export function money(n: number | string | null | undefined, digits = 2): string | null {
  if (n === null || n === undefined || n === "") return null;
  return `$${Number(n).toFixed(digits)}`;
}

export function range(lo: number | null | undefined, hi: number | null | undefined): string | null {
  const a = money(lo);
  const b = money(hi);
  if (!a && !b) return null;
  if (a && b && a !== b) return `${a}–${b}`;
  return a ?? b;
}

export function compact(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n));
}

/** The request time. Server components render once per request, so reading the clock here is intended. */
export function requestTime(): number {
  return Date.now();
}
