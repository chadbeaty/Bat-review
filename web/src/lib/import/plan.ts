// Turns a read post into what the listing flow pre-fills and highlights. Pure and safe to import in Client Components.

import type { Confidence, ImportFieldKey, ModelCandidate, ParsedPost } from "./parse-post";

export type ImportCandidate = ModelCandidate & { manufacturerId: string | null; certifications: string[] };

/** What the server action returns after reading a post (all plain data). */
export type ImportReading = {
  parsed: ParsedPost;
  summary: string;
  categoryId: string;
  /** The model picked automatically, if the match was confident. */
  matched: ImportCandidate | null;
  /** Models to choose from when the match was not certain. */
  candidates: ImportCandidate[];
  moreCandidates: number;
  /** The manufacturer to pre-select when the model is unknown but the brand is clear. */
  manufacturerId: string | null;
};

export type Mark = { confidence: Confidence; evidence: string };

/** The values and highlights carried from the paste box into the later steps of the listing flow. */
export type ImportPlan = {
  /** Raw form values keyed by attribute (as the form holds them, strings or string lists). */
  attributes: Record<string, string | string[]>;
  priceDollars: string | null;
  acceptsOffers: boolean | null;
  description: string;
  /** Fields the post filled, to highlight. */
  marks: Partial<Record<ImportFieldKey, Mark>>;
  /** Fields the post left unsettled, with the reason. */
  empty: Partial<Record<ImportFieldKey, string>>;
  /** Things from the post worth the seller's attention in later steps. */
  notes: string[];
  conditionWords: string[];
};

const dollarsText = (cents: number) => String(cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2));

export function buildPlan(reading: ImportReading): ImportPlan {
  const p = reading.parsed;
  const attributes: ImportPlan["attributes"] = {};
  const marks: ImportPlan["marks"] = {};
  const empty: ImportPlan["empty"] = {};
  for (const f of p.fields) marks[f.key] = { confidence: f.confidence, evidence: f.evidence };
  for (const f of p.flags) empty[f.key] = f.message;

  if (marks.weight_oz && p.weightOz) attributes.weight_oz = String(p.weightOz.value);
  if (marks.length_inches && p.lengthInches) attributes.length_inches = String(p.lengthInches.value);
  if (marks.certification && p.stamps) attributes.certification = p.stamps.value;
  if (marks.approx_hits && p.hits) attributes.approx_hits = String(p.hits.value);

  const notes: string[] = [];
  const d = p.damage;
  const said = (label: string, v: string | null) => (v === "yes" ? [label] : []);
  const damage = [...said("a crack", d.cracks), ...said("a rattle", d.rattle), ...said("a dead spot", d.dead), ...said("a dent or flat spot", d.dents)];
  if (damage.length) notes.push(`Your post mentions ${damage.join(", ")}. Answer the damage questions in step 8 honestly; buyers see them on the listing.`);
  if (d.modified === "yes") notes.push("Your post says the bat was rolled, shaved or altered. The disclosure step asks about alterations, so answer it truthfully.");
  if (p.usage) notes.push(`Your post says "${p.usage}". We didn't turn that into a hit count; add one if you can estimate it.`);
  if (p.shipping.mode === "local") notes.push("Your post says local pickup only. Gamer Bat orders are shipped, so plan to ship this bat to the buyer.");
  else if (p.shipping.mode === "ships" && p.shipping.included) notes.push('Your post says shipping is included. On Gamer Bat the buyer pays shipping separately, so your asking price should be the price of the bat.');
  if (p.descriptionNotes.length) notes.push(`We removed ${p.descriptionNotes.join(", ")} from your description. Buyers message you here.`);

  return {
    attributes,
    priceDollars: marks.price && p.priceCents ? dollarsText(p.priceCents.value) : null,
    acceptsOffers: marks.accepts_offers && p.acceptsOffers ? p.acceptsOffers.value : null,
    description: marks.description ? p.description : "",
    marks,
    empty,
    notes,
    conditionWords: p.conditionWords,
  };
}
