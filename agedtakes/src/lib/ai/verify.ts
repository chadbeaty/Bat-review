// Mechanical checks on AI output. These run in code, after the model, and are what make "never misquote"
// enforceable rather than a request in a prompt.

/** Normalizes typography so a verbatim check isn't defeated by curly quotes, dashes or line breaks. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True when the quotation appears word for word in the source text (ignoring typography, case and whitespace).
 * Ellipses inside the quote are treated as gaps: every fragment must appear, in order.
 */
export function quoteAppearsVerbatim(quote: string, sourceText: string): boolean {
  const q = normalizeForMatch(quote).replace(/^["']|["']$/g, "");
  const src = normalizeForMatch(sourceText);
  if (q.length < 3) return false;
  const parts = q.split(/\s*(?:\.\.\.|\[\.\.\.\])\s*/).filter((p) => p.length > 0);
  let from = 0;
  for (const part of parts) {
    const at = src.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

/** Accusatory words that must never appear in AI-proposed copy without a human editor choosing them. */
const ACCUSATORY = /\b(liar|lied|lying|fraud(ster)?|criminal|crook|scam(mer)?|hypocrit(e|ical|ically)|con\s?man|grift(er)?|ponzi|corrupt|deceiv(e|ed|ing)|cheat(ed|er)?)\b/i;

export function accusatoryTerms(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const re = new RegExp(ACCUSATORY.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[0].toLowerCase());
  return [...found];
}

/** "a sale" inferred from a transfer/deposit is the classic error; flag copy that says "sold" when evidence is only a transfer. */
export function claimsSaleWithoutSaleEvidence(text: string, evidenceKinds: string[]): boolean {
  const saysSold = /\b(sold|dumped|cashed out|sell-?off)\b/i.test(text);
  const hasSaleEvidence = evidenceKinds.some((k) => k === "sale" || k === "partial_sale");
  return saysSold && !hasSaleEvidence;
}

export type ExtractedStatement = { person_slug: string; exact_quote: string };

/**
 * Splits extracted statements into those that may be stored and those that must be rejected: the speaker must be
 * a tracked person, and the quotation must appear word for word in the source text.
 */
export function screenExtracted<T extends ExtractedStatement>(statements: T[], sourceText: string, knownSlugs: Set<string>) {
  const accepted: T[] = [];
  const rejected: { quote: string; reason: string }[] = [];
  for (const s of statements) {
    if (!knownSlugs.has(s.person_slug)) rejected.push({ quote: s.exact_quote.slice(0, 120), reason: `Unknown person "${s.person_slug}"` });
    else if (!quoteAppearsVerbatim(s.exact_quote, sourceText)) rejected.push({ quote: s.exact_quote.slice(0, 120), reason: "Not found verbatim in the source text" });
    else accepted.push(s);
  }
  return { accepted, rejected };
}
