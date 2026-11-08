// Name normalisation for grouping products sold under different names.
// Deterministic matching only handles near-identical names; anything fuzzier goes to the AI matcher, and
// anything the AI is unsure about goes to a person (Admin → Products → Review matches).

const STOP = new Set([
  "the", "a", "an", "for", "with", "and", "of", "to", "in", "on", "new", "best", "viral", "tiktok", "amazon", "trending",
  "mini", "portable", "upgraded", "premium", "pro", "smart", "2024", "2025", "2026", "2027", "pack", "set", "pcs", "piece",
  "gadget", "product", "item", "made", "find", "finds", "must", "have",
]);

// Words that look like modifiers but change what the product IS, so they are never stripped.
// (Kept here for documentation; normalisation never removes them.)
export const FUNCTIONAL_WORDS = ["heated", "electric", "manual", "magnetic", "wireless", "rechargeable", "cordless", "automatic"];

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ")
    .trim();
}

/** The informative words of a name, for comparison. */
export function coreTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

function singular(w: string): string {
  if (w.length <= 3 || /ss$/.test(w)) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/us$/.test(w)) return w.slice(0, -1);
  return w;
}

export function slugify(name: string): string {
  return (
    normalizeName(name)
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60)
      .replace(/^-|-$/g, "") || "product"
  );
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.split(" ")) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Trigram similarity (same idea as Postgres pg_trgm), 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const x = trigrams(normalizeName(a));
  const y = trigrams(normalizeName(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

/** Word-set similarity on informative words, 0..1. Order-insensitive ("bag sealer handheld" = "handheld bag sealer"). */
export function tokenSimilarity(a: string, b: string): number {
  const x = new Set(coreTokens(a));
  const y = new Set(coreTokens(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

export type MatchCandidate = { productId: string; alias: string; similarity: number };

export type MatchDecision =
  | { kind: "exact"; productId: string; confidence: number }
  | { kind: "needs_ai"; candidates: MatchCandidate[] }
  | { kind: "new" };

/**
 * Decides whether a newly seen name can be matched without AI. Only an essentially identical name (same informative
 * words in any order) counts as exact; otherwise plausible candidates are handed to the AI matcher.
 */
export function decideMatch(names: string[], candidates: MatchCandidate[]): MatchDecision {
  if (!candidates.length) return { kind: "new" };
  let best: { c: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    for (const n of names) {
      const tok = tokenSimilarity(n, c.alias);
      const tri = trigramSimilarity(n, c.alias);
      const score = Math.max(tok, tri);
      if (!best || score > best.score) best = { c, score };
      if (tok === 1 && coreTokens(n).length >= 2) return { kind: "exact", productId: c.productId, confidence: 0.95 };
    }
  }
  const plausible = candidates.filter((c) => c.similarity >= 0.3 || names.some((n) => tokenSimilarity(n, c.alias) >= 0.34));
  if (!plausible.length || !best) return { kind: "new" };
  return { kind: "needs_ai", candidates: plausible.slice(0, 8) };
}

/** Unique, normalised alias list (keeps the original spelling of the first occurrence). */
export function uniqueAliases(names: (string | null | undefined)[]): { alias: string; normalized: string }[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const alias = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (alias.length < 3) continue;
    const normalized = normalizeName(alias);
    if (normalized.length < 3 || seen.has(normalized)) continue;
    seen.set(normalized, alias);
  }
  return [...seen.entries()].map(([normalized, alias]) => ({ alias, normalized }));
}
