// The listing flow: steps, per-step validation, title suggestions, photo rules and publish error messages.
// Safe to import in Client Components; the server actions validate with the same schemas.

import { z } from "zod";

export const STEPS = [
  { key: "category", label: "Category" },
  { key: "manufacturer", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "details", label: "Details" },
  { key: "photos", label: "Photos" },
  { key: "price", label: "Price" },
  { key: "shipping", label: "Shipping" },
  { key: "disclosures", label: "Disclosures" },
  { key: "preview", label: "Preview" },
  { key: "publish", label: "Publish" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export function isStepKey(v: unknown): v is StepKey {
  return STEPS.some((s) => s.key === v);
}

export function stepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();
const year = z.number().int("Use a whole year").min(1980, "Use 1980 or later").max(new Date().getFullYear() + 2, "That year is too far ahead");

export const startListingSchema = z
  .object({
    categoryId: uuid,
    manufacturerId: uuid.nullable(),
    productId: uuid.nullable(),
    // Filled in when the seller's model isn't in the catalog.
    request: z
      .object({
        modelName: z.string().trim().min(2, "Enter the model name").max(120, "Use 120 characters or fewer"),
        modelYear: year.nullable(),
        manufacturerName: z.string().trim().max(80, "Use 80 characters or fewer").optional(),
      })
      .nullable(),
  })
  .refine((v) => v.productId || v.request, { message: "Choose your model or tell us what it is", path: ["productId"] });

export const detailsSchema = z.object({
  title: z.string().trim().min(5, "Use at least 5 characters").max(120, "Use 120 characters or fewer"),
  description: z.string().trim().max(5000, "Use 5,000 characters or fewer").optional().default(""),
  conditionScore: z.number({ message: "Choose a condition score" }).int().min(1, "Choose a condition score").max(10),
  attributes: z.record(z.string(), z.unknown()),
});

/** Dollars typed by a seller ("199", "199.5", "$1,200.00") to whole cents. Null when it isn't a price. */
export function parseDollars(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export const priceSchema = z.object({
  price: z
    .string()
    .transform((v, ctx) => {
      const cents = parseDollars(v);
      if (cents == null) {
        ctx.addIssue({ code: "custom", message: "Enter a price in dollars, for example 180" });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(z.number().min(100, "The lowest price is $1").max(2500000, "The highest price is $25,000")),
  acceptsOffers: z.boolean(),
});

const dimension = (label: string) =>
  z.number({ message: `Enter the ${label}` }).gt(0, `Enter the ${label}`).max(108, `The ${label} can be up to 108 inches`);

export const shippingSchema = z.object({
  weightLb: z.number({ message: "Enter the package weight" }).gt(0, "Enter the package weight").max(150, "Use 150 lb or less"),
  lengthIn: dimension("length"),
  widthIn: dimension("width"),
  heightIn: dimension("height"),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
});

/** A starting point for a single bat. Sellers measure their own box and change it. */
export const STANDARD_BAT_BOX = { weightLb: 3, lengthIn: 36, widthIn: 5, heightIn: 5 } as const;

export const DAMAGE_QUESTIONS = [
  { key: "hasCracks", column: "has_cracks", short: "Cracks", label: "Does it have any cracks?" },
  { key: "hasRattle", column: "has_rattle", short: "Rattles when shaken", label: "Does it rattle when shaken?" },
  { key: "hasLooseEndCap", column: "has_loose_end_cap", short: "Loose end cap or knob", label: "Is the end cap or knob loose?" },
  { key: "hasRepairs", column: "has_repairs", short: "Has been repaired", label: "Has it been repaired?" },
  { key: "hasAlterations", column: "has_alterations", short: "Altered or modified", label: "Has it been altered, rolled, shaved or modified?" },
  { key: "hasSignificantDamage", column: "has_significant_damage", short: "Other significant damage", label: "Does it have any other significant damage (dents, flat spots, separation)?" },
] as const;

export type DamageKey = (typeof DAMAGE_QUESTIONS)[number]["key"];

const answer = z.boolean({ message: "Answer yes or no" });

export const disclosuresSchema = z
  .object({
    structuralDisclosure: z.enum(["no_known_damage", "damage_disclosed", "unknown"], { message: "Choose one" }),
    hasCracks: answer,
    hasRattle: answer,
    hasLooseEndCap: answer,
    hasRepairs: answer,
    hasAlterations: answer,
    hasSignificantDamage: answer,
    cosmeticWear: z.string().trim().max(1000, "Use 1,000 characters or fewer").optional().default(""),
    damageDisclosure: z.string().trim().max(2000, "Use 2,000 characters or fewer").optional().default(""),
    ownership: z.literal(true, { message: "Confirm that you own this item" }),
    authenticity: z.literal(true, { message: "Confirm that this item is authentic" }),
  })
  .superRefine((v, ctx) => {
    const anyDamage = DAMAGE_QUESTIONS.some((q) => v[q.key]);
    if (anyDamage && v.structuralDisclosure !== "damage_disclosed") {
      ctx.addIssue({ code: "custom", path: ["structuralDisclosure"], message: "You answered yes to a damage question, so choose “Yes, damage described below”" });
    }
    if ((anyDamage || v.structuralDisclosure === "damage_disclosed") && v.damageDisclosure.length < 10) {
      ctx.addIssue({ code: "custom", path: ["damageDisclosure"], message: "Describe the damage so buyers know exactly what they're getting" });
    }
  });

/** Field errors keyed by field name (first message per field), from a zod error. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Title suggestion
// ---------------------------------------------------------------------------

/**
 * A title like "2026 Miken Freak Black Maxload USSSA 26 oz" from what the seller has told us.
 * Words already in the model name (the year or brand) aren't repeated. Editable by the seller.
 */
export function suggestTitle(p: {
  modelYear?: number | null;
  brand?: string | null;
  model?: string | null;
  stamps?: string[] | null;
  weightOz?: number | null;
  fallback?: string;
}): string {
  const model = (p.model ?? "").replace(/\s+/g, " ").trim();
  const lower = model.toLowerCase();
  const parts: string[] = [];
  if (p.modelYear && !lower.includes(String(p.modelYear))) parts.push(String(p.modelYear));
  const brand = p.brand && p.brand !== "Other" ? p.brand.trim() : "";
  if (brand && !lower.includes(brand.toLowerCase())) parts.push(brand);
  if (model) parts.push(model);
  const stamps = (p.stamps ?? []).filter((s) => s !== "Other" && !new RegExp(`\\b${s}\\b`, "i").test(model));
  if (stamps.length) parts.push(stamps.join("/"));
  if (p.weightOz) parts.push(`${p.weightOz} oz`);
  let title = parts.join(" ").trim();
  if (title.length < 5) title = [title, p.fallback].filter(Boolean).join(" ").trim();
  if (title.length > 120) title = title.slice(0, 120).replace(/\s+\S*$/, "");
  return title;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 12;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const IMAGE_TYPE_LABELS: Record<string, string> = {
  full: "Full bat",
  barrel: "Barrel",
  end_cap: "End cap",
  knob: "Knob",
  markings: "Markings",
  damage: "Damage",
  front: "Front",
  back: "Back",
  detail: "Detail",
  label: "Label",
  other: "Other",
};
export const IMAGE_TYPES = Object.keys(IMAGE_TYPE_LABELS);

/** Null when the file is acceptable, otherwise the message to show. HEIC files sometimes report no type. */
export function photoProblem(file: { name: string; type: string; size: number }, opts: { types?: readonly string[]; maxBytes?: number } = {}): string | null {
  const types = opts.types ?? PHOTO_TYPES;
  const maxBytes = opts.maxBytes ?? MAX_PHOTO_BYTES;
  const type = file.type || (/\.hei[cf]$/i.test(file.name) ? "image/heic" : "");
  if (!types.includes(type)) {
    const names = types.map((t) => t.replace("image/", "").toUpperCase().replace("JPEG", "JPG")).join(", ");
    return `${file.name}: use a ${names} photo`;
  }
  if (file.size > maxBytes) return `${file.name}: photos can be up to ${Math.round(maxBytes / 1024 / 1024)} MB`;
  if (file.size === 0) return `${file.name}: this file is empty`;
  return null;
}

/** listing-images/<user id>/<listing id>/<random>.<ext>, which the storage rules require. */
export function listingPhotoPath(userId: string, listingId: string, random: string, ext: string): string {
  return `${userId}/${listingId}/${random}.${ext}`;
}

export function isOwnListingPhotoPath(path: string, userId: string, listingId: string): boolean {
  const prefix = `${userId}/${listingId}/`;
  return path.startsWith(prefix) && /^[A-Za-z0-9._-]+$/.test(path.slice(prefix.length)) && !path.includes("..");
}

// ---------------------------------------------------------------------------
// Publish errors from the database, mapped to the step that fixes them
// ---------------------------------------------------------------------------

const ERROR_STEPS: { match: RegExp; step: StepKey | null; message: string }[] = [
  { match: /asking price/i, step: "price", message: "Set an asking price before publishing." },
  { match: /ownership and authenticity/i, step: "disclosures", message: "Confirm that you own the item and that it's authentic." },
  { match: /cosmetic condition/i, step: "details", message: "Choose a cosmetic condition score." },
  { match: /damage question/i, step: "disclosures", message: "Answer every damage question with yes or no." },
  { match: /structural disclosure/i, step: "disclosures", message: "You reported damage, so the structural disclosure must say damage is described." },
  { match: /package weight|ship-from/i, step: "shipping", message: "Add the package weight, size and ship-from ZIP code." },
  { match: /at least one photo/i, step: "photos", message: "Add at least one photo." },
  { match: /up to 12 photos/i, step: "photos", message: `A listing can have up to ${MAX_PHOTOS} photos.` },
  { match: /cannot publish listings/i, step: null, message: "Your account can't publish listings right now. Contact support if you think this is a mistake." },
  { match: /reserved or sold/i, step: null, message: "This listing is reserved or sold, so it can't be changed." },
];

export function mapListingError(message: string | null | undefined): { step: StepKey | null; message: string } {
  const hit = ERROR_STEPS.find((e) => e.match.test(message ?? ""));
  return hit ? { step: hit.step, message: hit.message } : { step: null, message: "We couldn't save that. Try again in a moment." };
}

// ---------------------------------------------------------------------------
// Readiness: what's still missing before a listing can go live
// ---------------------------------------------------------------------------

export type ListingRecord = {
  id: string;
  category_id: string;
  manufacturer_id: string | null;
  product_id: string | null;
  title: string;
  description: string | null;
  attributes: Record<string, unknown>;
  asking_price_cents: number | null;
  accepts_offers: boolean;
  condition_score: number | null;
  structural_disclosure: string;
  has_cracks: boolean | null;
  has_rattle: boolean | null;
  has_loose_end_cap: boolean | null;
  has_repairs: boolean | null;
  has_alterations: boolean | null;
  has_significant_damage: boolean | null;
  cosmetic_wear: string | null;
  damage_disclosure: string | null;
  authenticity_declaration: boolean;
  ownership_declaration: boolean;
  shipping_weight_oz: number | string | null;
  package_length_inches: number | string | null;
  package_width_inches: number | string | null;
  package_height_inches: number | string | null;
  location_city: string | null;
  location_state: string | null;
  listing_status: string;
  published_at: string | null;
  expires_at: string | null;
};

export function missingForPublish(
  l: ListingRecord,
  ctx: { photoCount: number; hasShipFrom: boolean; attributesValid: boolean }
): { step: StepKey; message: string }[] {
  const out: { step: StepKey; message: string }[] = [];
  if (!ctx.attributesValid || l.condition_score == null) out.push({ step: "details", message: "Item details and condition" });
  if (ctx.photoCount < 1) out.push({ step: "photos", message: "At least one photo" });
  if (l.asking_price_cents == null) out.push({ step: "price", message: "Asking price" });
  if (l.shipping_weight_oz == null || l.package_length_inches == null || l.package_width_inches == null || l.package_height_inches == null || !ctx.hasShipFrom)
    out.push({ step: "shipping", message: "Package size, weight and ship-from ZIP" });
  const answered = DAMAGE_QUESTIONS.every((q) => l[q.column] != null);
  if (!answered || !l.ownership_declaration || !l.authenticity_declaration) out.push({ step: "disclosures", message: "Damage questions and declarations" });
  return out;
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "In review",
  active: "Live",
  reserved: "Reserved",
  sold: "Sold",
  removed: "Removed",
  expired: "Expired",
};

/** Ounces stored in the database to pounds shown in the form, to one decimal. */
export function ozToLb(oz: number | string | null): number | null {
  if (oz == null) return null;
  return Math.round((Number(oz) / 16) * 10) / 10;
}
