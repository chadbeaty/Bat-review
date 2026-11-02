// Category-specific listing fields. Each category's attribute_schema (in product_categories) describes its
// fields, so the listing form, its validation and its prefill all come from data rather than code.
// Safe to import in Client Components.

import { z } from "zod";
import { WEIGHTING_LABELS } from "@/lib/format";

export type AttributeValue = string | number | string[];
export type Attributes = Record<string, AttributeValue>;

export type AttributeField = {
  key: string;
  label: string;
  type: "number" | "select" | "multiselect" | "text";
  required: boolean;
  options?: (string | number)[];
  default?: AttributeValue;
};

export type RequiredPhoto = { type: string; label: string; optional: boolean };

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  type: z.enum(["number", "select", "multiselect", "text"]),
  required: z.boolean().optional().default(false),
  options: z.array(z.union([z.string(), z.number()])).optional(),
  default: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
});

/** The fields in a category's attribute_schema. Malformed entries are skipped rather than breaking the form. */
export function parseAttributeSchema(raw: unknown): AttributeField[] {
  if (!Array.isArray(raw)) return [];
  const out: AttributeField[] = [];
  for (const item of raw) {
    const parsed = fieldSchema.safeParse(item);
    if (parsed.success && !out.some((f) => f.key === parsed.data.key)) out.push(parsed.data);
  }
  return out;
}

const photoSchema = z.object({ type: z.string().min(1), label: z.string().min(1), optional: z.boolean().optional().default(false) });

/** The photo checklist from a category's required_photos. */
export function parseRequiredPhotos(raw: unknown): RequiredPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = photoSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const OPTION_LABELS: Record<string, string> = {
  ...WEIGHTING_LABELS,
  unknown: "Not sure",
  one_piece: "One-piece",
  two_piece: "Two-piece",
  first_base: "First base",
  mens: "Men's",
  womens: "Women's",
};

/** How an option value is shown to people: "one_piece" → "One-piece", 26 → "26". */
export function optionLabel(value: string | number): string {
  if (typeof value === "number") return String(value);
  if (OPTION_LABELS[value]) return OPTION_LABELS[value];
  if (/^[A-Z0-9]+$/.test(value)) return value; // stamps such as USSSA or sizes such as XL
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A readable value for previews and listing pages. */
export function formatAttribute(field: AttributeField, value: AttributeValue | undefined): string | null {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (Array.isArray(value)) return value.map(optionLabel).join(", ");
  if (field.key === "weight_oz") return `${value} oz`;
  if (field.key.endsWith("_inches")) return `${value} in`;
  return optionLabel(value);
}

function numberRange(key: string): [number, number] {
  if (key === "model_year") return [1980, new Date().getFullYear() + 2];
  if (key === "weight_oz") return [10, 40];
  if (key.endsWith("_inches")) return [1, 120];
  return [0, 100000];
}

/** A zod schema for one category's attribute values, built from its attribute_schema. */
export function attributesSchema(fields: AttributeField[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    let s: z.ZodType;
    if (f.type === "number") {
      const [min, max] = numberRange(f.key);
      let n = z.number({ message: `Enter ${f.label.toLowerCase()}` }).min(min, `${f.label}: use ${min} or more`).max(max, `${f.label}: use ${max} or less`);
      if (f.key === "model_year") n = n.int(`${f.label}: use a whole year`);
      s = f.options?.length
        ? n.refine((v) => f.options!.map(Number).includes(v), `Choose one of the listed values for ${f.label.toLowerCase()}`)
        : n;
    } else if (f.type === "select") {
      const opts = (f.options ?? []).map(String);
      s = z.string().refine((v) => opts.length === 0 || opts.includes(v), `Choose ${f.label.toLowerCase()}`);
    } else if (f.type === "multiselect") {
      const opts = (f.options ?? []).map(String);
      let arr = z.array(z.string().refine((v) => opts.length === 0 || opts.includes(v), "Choose from the list"));
      if (f.required) arr = arr.min(1, `Choose at least one: ${f.label.toLowerCase()}`);
      s = arr;
    } else {
      s = z.string().trim().max(200, `${f.label}: use 200 characters or fewer`);
      if (f.required) s = (s as z.ZodString).min(1, `Enter ${f.label.toLowerCase()}`);
    }
    shape[f.key] = f.required ? s : s.optional();
  }
  return z.object(shape).strip();
}

/**
 * Turns raw form values (strings from inputs, arrays from checkboxes) into typed attribute values.
 * Empty values are dropped so optional fields stay unset.
 */
export function coerceAttributes(fields: AttributeField[], raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (v == null) continue;
    if (f.type === "multiselect") {
      const arr = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
      if (arr.length || f.required) out[f.key] = arr;
    } else if (f.type === "number") {
      const s = String(v).trim();
      if (s === "") continue;
      const n = Number(s);
      out[f.key] = Number.isFinite(n) ? n : s;
    } else {
      const s = String(v).trim();
      if (s !== "") out[f.key] = s;
    }
  }
  return out;
}

/** Defaults from the schema (for example a 34-inch length) for a brand-new listing. */
export function defaultAttributes(fields: AttributeField[]): Attributes {
  const out: Attributes = {};
  for (const f of fields) if (f.default !== undefined) out[f.key] = f.default;
  return out;
}

export type ProductForPrefill = {
  model_year: number | null;
  certification_association: string[] | null;
  product_specifications: Record<string, unknown> | null;
  bat_specifications: {
    weight_oz: number | string | null;
    length_inches: number | string | null;
    barrel_length_inches: number | string | null;
    weighting_type: string | null;
    construction_type: string | null;
  }[];
};

const CONSTRUCTION_FROM_SPECS: Record<string, string> = { "1pc": "one_piece", "2pc": "two_piece" };

/**
 * Values we already know from the catalog for the chosen model. The seller confirms or changes each one.
 * Only values the category's schema accepts are used; unknowns stay empty.
 */
export function prefillFromProduct(fields: AttributeField[], product: ProductForPrefill): Attributes {
  const specs = product.bat_specifications ?? [];
  const ps = product.product_specifications ?? {};
  const first = <T,>(pick: (s: ProductForPrefill["bat_specifications"][number]) => T | null | undefined): T | undefined => {
    for (const s of specs) {
      const v = pick(s);
      if (v != null && v !== "unknown") return v;
    }
    return undefined;
  };
  const weights = [...new Set(specs.map((s) => (s.weight_oz == null ? null : Number(s.weight_oz))).filter((w): w is number => w != null))];
  const known: Record<string, AttributeValue | undefined> = {
    model_year: product.model_year ?? undefined,
    certification: product.certification_association?.length ? product.certification_association : undefined,
    weighting_type: first((s) => s.weighting_type) ?? (typeof ps.weighting === "string" && ["balanced", "endload", "midload"].includes(ps.weighting) ? ps.weighting : undefined),
    construction_type: first((s) => s.construction_type) ?? (typeof ps.construction === "string" ? CONSTRUCTION_FROM_SPECS[ps.construction] : undefined),
    barrel_length_inches: first((s) => (s.barrel_length_inches == null ? null : Number(s.barrel_length_inches))) ?? (typeof ps.barrel_length_inches === "number" ? ps.barrel_length_inches : undefined),
    length_inches: first((s) => (s.length_inches == null ? null : Number(s.length_inches))),
    // Only when the model comes in a single listed weight; otherwise the seller picks theirs.
    weight_oz: weights.length === 1 ? weights[0] : undefined,
  };
  const out: Attributes = {};
  for (const f of fields) {
    const v = known[f.key];
    if (v === undefined) continue;
    if (f.type === "multiselect") {
      const opts = (f.options ?? []).map(String);
      const arr = (Array.isArray(v) ? v : [v]).map(String).filter((x) => opts.length === 0 || opts.includes(x));
      if (arr.length) out[f.key] = arr;
    } else if (f.type === "select") {
      if (!f.options?.length || f.options.map(String).includes(String(v))) out[f.key] = String(v);
    } else if (f.type === "number") {
      const n = Number(v);
      if (Number.isFinite(n) && (!f.options?.length || f.options.map(Number).includes(n))) out[f.key] = n;
    } else {
      out[f.key] = String(v);
    }
  }
  return out;
}

/** Weights the catalog lists for a model, for a hint next to the weight field. */
export function listedWeights(product: Pick<ProductForPrefill, "bat_specifications">): number[] {
  return [...new Set(product.bat_specifications.map((s) => (s.weight_oz == null ? null : Number(s.weight_oz))).filter((w): w is number => w != null))].sort(
    (a, b) => a - b
  );
}
