import { getJson } from "./http";
import type { SourceConnector } from "./types";

// Market data for resolving price predictions. Each observation records the provider, the asset identifier,
// the currency, the time zone and the methodology, so a resolution can be reproduced.

export type PricePoint = { time: string; value: number };
export type PriceSeries = { provider: "coingecko" | "financial_modeling_prep"; assetId: string; currency: string; timezone: string; methodology: string; points: PricePoint[]; sourceUrl: string };

export async function coingeckoDaily(id: string, from: Date, to: Date, vs = "usd", opts: { fetch?: typeof fetch; apiKey?: string } = {}): Promise<PriceSeries> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart/range?vs_currency=${vs}&from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000)}`;
  const data = await getJson<{ prices?: [number, number][] }>(url, { fetch: opts.fetch, headers: opts.apiKey ? { "x-cg-demo-api-key": opts.apiKey } : {} });
  // Keep the last observation per UTC day as the daily close.
  const byDay = new Map<string, PricePoint>();
  for (const [ms, value] of data.prices ?? []) {
    const day = new Date(ms).toISOString().slice(0, 10);
    byDay.set(day, { time: new Date(ms).toISOString(), value });
  }
  return {
    provider: "coingecko", assetId: id, currency: vs.toUpperCase(), timezone: "UTC",
    methodology: "CoinGecko market_chart/range prices; last observation of each UTC day used as the daily close.",
    points: [...byDay.values()].sort((a, b) => a.time.localeCompare(b.time)),
    sourceUrl: `https://www.coingecko.com/en/coins/${encodeURIComponent(id)}`,
  };
}

export async function fmpDaily(symbol: string, from: Date, to: Date, opts: { fetch?: typeof fetch; apiKey: string }): Promise<PriceSeries> {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${d(from)}&to=${d(to)}&apikey=${encodeURIComponent(opts.apiKey)}`;
  const data = await getJson<{ date: string; close: number; adjClose?: number }[] | { historical?: { date: string; close: number }[] }>(url, { fetch: opts.fetch });
  const rows = Array.isArray(data) ? data : (data.historical ?? []);
  return {
    provider: "financial_modeling_prep", assetId: symbol, currency: "USD", timezone: "America/New_York",
    methodology: "Financial Modeling Prep end-of-day closing prices (split-adjusted by the provider). Check dividends and corporate actions before confirming.",
    points: rows.map((r) => ({ time: `${r.date}T21:00:00Z`, value: Number(r.close) })).sort((a, b) => a.time.localeCompare(b.time)),
    sourceUrl: `https://financialmodelingprep.com/financial-summary/${encodeURIComponent(symbol)}`,
  };
}

export type PriceResolution = {
  result: "correct" | "incorrect" | "not_yet_resolvable" | "unscorable";
  observedValue: number | null;
  observationTime: string | null;
  explanation: string;
};

/** How a price target is checked: reached on any daily close in the window, or judged on the deadline's close. */
export type ResolutionMode = "any_close" | "deadline_close";

/** Reads the mode from the prediction's written criteria ("close on 31 Dec…", "at the end of…" → deadline close). */
export function inferResolutionMode(criteria: string | null | undefined): ResolutionMode {
  const c = (criteria ?? "").toLowerCase();
  if (/any (trading )?day|at any point|any (utc )?daily close|before the deadline|up to and including/.test(c)) return "any_close";
  if (/close on|closes? .* on \d|official close on|at the deadline|on the last trading day|year-end close|end-of-year close/.test(c)) return "deadline_close";
  return "any_close";
}

/**
 * Decides a price-target prediction from a daily series covering the prediction window. A prediction is never
 * called incorrect before its deadline has passed. The result is a proposal: an editor confirms it.
 */
export function resolvePriceTarget(opts: { direction: string | null; target: number | null; deadline: string | null; series: PriceSeries; now?: Date; mode?: ResolutionMode }): PriceResolution {
  const now = opts.now ?? new Date();
  const { direction, target, deadline, series } = opts;
  if (target === null || !["at_or_above", "at_or_below"].includes(direction ?? "")) {
    return { result: "unscorable", observedValue: null, observationTime: null, explanation: "Not a numeric price target; resolve manually." };
  }
  if (!series.points.length) return { result: "not_yet_resolvable", observedValue: null, observationTime: null, explanation: "No price data returned for the window." };
  const meets = (v: number) => (direction === "at_or_above" ? v >= target : v <= target);
  if (opts.mode === "deadline_close") {
    if (!deadline || new Date(`${deadline}T23:59:59Z`) >= now) {
      return { result: "not_yet_resolvable", observedValue: null, observationTime: null, explanation: "Judged on the deadline's close, which hasn't happened yet." };
    }
    const close = [...series.points].reverse().find((p) => p.time.slice(0, 10) <= deadline);
    if (!close) return { result: "not_yet_resolvable", observedValue: null, observationTime: null, explanation: "No close found on or before the deadline." };
    return {
      result: meets(close.value) ? "correct" : "incorrect",
      observedValue: close.value,
      observationTime: close.time,
      explanation: `Close on ${close.time.slice(0, 10)} was ${close.value} ${series.currency} against a target ${direction === "at_or_above" ? "at or above" : "at or below"} ${target}.`,
    };
  }
  const hit = series.points.find((p) => meets(p.value) && (!deadline || p.time.slice(0, 10) <= deadline));
  if (hit) return { result: "correct", observedValue: hit.value, observationTime: hit.time, explanation: `Daily close of ${hit.value} ${series.currency} on ${hit.time.slice(0, 10)} met the target of ${target}.` };
  const deadlinePassed = deadline ? new Date(`${deadline}T23:59:59Z`) < now : false;
  if (!deadlinePassed) return { result: "not_yet_resolvable", observedValue: null, observationTime: null, explanation: "Target not reached yet and the deadline has not passed." };
  const extreme = series.points.reduce((best, p) => (direction === "at_or_above" ? (p.value > best.value ? p : best) : (p.value < best.value ? p : best)));
  return {
    result: "incorrect",
    observedValue: extreme.value,
    observationTime: extreme.time,
    explanation: `No daily close ${direction === "at_or_above" ? "at or above" : "at or below"} ${target} before the deadline; the ${direction === "at_or_above" ? "highest" : "lowest"} close was ${extreme.value} ${series.currency} on ${extreme.time.slice(0, 10)}.`,
  };
}

export const coingeckoConnector: SourceConnector = {
  id: "coingecko",
  label: "CoinGecko prices",
  description: "Crypto price history used by the Prediction Resolution Agent. Works without a key at low volume; COINGECKO_API_KEY raises limits.",
  requiresEnv: [],
  exampleConfig: { ids: ["bitcoin"] },
  terms: "CoinGecko public API within its rate limits. Attribution: prices from CoinGecko.",
  async fetchItems() {
    return { status: "skipped", reason: "Price sources are used during prediction resolution, not monitoring." };
  },
};

export const fmpConnector: SourceConnector = {
  id: "fmp",
  label: "Financial Modeling Prep prices",
  description: "Stock price history used by the Prediction Resolution Agent (needs FMP_API_KEY).",
  requiresEnv: ["FMP_API_KEY"],
  exampleConfig: { symbols: ["AAPL"] },
  terms: "Licensed per your FMP plan.",
  async fetchItems() {
    return { status: "skipped", reason: "Price sources are used during prediction resolution, not monitoring." };
  },
};
