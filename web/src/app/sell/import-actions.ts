"use server";

import { createClient } from "@/lib/supabase/server";
import { getSellCategories } from "@/lib/sell/server";
import { loadImportCatalog } from "@/lib/import/server";
import { parsePost, summaryLine, type ModelCandidate } from "@/lib/import/parse-post";
import type { ImportCandidate, ImportReading } from "@/lib/import/plan";

// "Paste your post": reads text the seller pasted and returns what it says. It only reads. Nothing is saved or
// published here; the seller reviews the result, and every later step saves through the normal listing actions.

const MAX_POST_CHARS = 10_000;

export type ReadPostResult = { ok: true; reading: ImportReading } | { ok: false; error: string };

export async function readPost(text: unknown): Promise<ReadPostResult> {
  const db = await createClient();
  if (!db) return { ok: false, error: "Importing needs the database, which isn't connected here." };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, error: "Your session has ended. Sign in again to keep going." };
  if (typeof text !== "string") return { ok: false, error: "Paste the text of your post." };
  if (text.length > MAX_POST_CHARS) return { ok: false, error: `That's longer than a bat post usually is. Paste up to ${MAX_POST_CHARS.toLocaleString("en-US")} characters.` };

  const categories = await getSellCategories(db);
  const bats = categories.find((c) => c.slug === "bats");
  if (!bats) return { ok: false, error: "Bat listings aren't available right now." };

  const catalog = await loadImportCatalog(db, bats.id);
  const parsed = parsePost(text, catalog.models);

  // Checks that need the sell form's own rules.
  const weightField = bats.fields.find((f) => f.key === "weight_oz");
  const allowedWeights = (weightField?.options ?? []).map(Number);
  if (parsed.weightOz && allowedWeights.length && !allowedWeights.includes(parsed.weightOz.value)) {
    const w = parsed.weightOz.value;
    parsed.fields = parsed.fields.filter((f) => f.key !== "weight_oz");
    parsed.flags.push({ key: "weight_oz", message: `The post says ${w} oz, which isn't one of the weights we list (${allowedWeights[0]} to ${allowedWeights[allowedWeights.length - 1]} oz). Choose the weight printed on the bat.` });
    parsed.weightOz = null;
  }

  const meta = (c: ModelCandidate): ImportCandidate => ({ ...c, manufacturerId: catalog.meta.get(c.id)?.manufacturerId ?? null, certifications: catalog.meta.get(c.id)?.certifications ?? [] });
  const matched = parsed.model.matched ? meta(parsed.model.matched) : null;
  const candidates = parsed.model.candidates.map(meta);

  // The post's stamps against the catalog's stamps for the model it picked.
  if (matched && parsed.stamps && matched.certifications.length && !parsed.stamps.value.some((s) => matched.certifications.includes(s))) {
    parsed.warnings.push(`Your post says ${parsed.stamps.value.join(" / ")}, but the catalog lists ${matched.certifications.join(" / ")} for this model. Check the barrel; your stamps are used.`);
    const f = parsed.fields.find((x) => x.key === "certification");
    if (f) f.confidence = "medium";
    parsed.stamps = { ...parsed.stamps, confidence: "medium" };
  }

  const manufacturerId = matched?.manufacturerId ?? (parsed.brand ? (catalog.manufacturers.get(parsed.brand) ?? null) : null);
  return {
    ok: true,
    reading: {
      parsed,
      summary: summaryLine(parsed),
      categoryId: bats.id,
      matched,
      candidates,
      moreCandidates: parsed.model.moreCandidates,
      manufacturerId,
    },
  };
}
