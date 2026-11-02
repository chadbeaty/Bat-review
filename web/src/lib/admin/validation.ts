// Input checks for admin forms that aren't covered by a single zod field.

import { z } from "zod";

const field = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Field keys use lowercase letters, numbers and underscores"),
    label: z.string().trim().min(1, "Every field needs a label").max(80),
    type: z.enum(["text", "number", "select", "multiselect", "boolean"]),
    required: z.boolean().optional(),
    options: z.array(z.union([z.string().max(60), z.number()])).max(60).optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    hint: z.string().max(200).optional(),
  })
  .strict()
  .refine((f) => !["select", "multiselect"].includes(f.type) || (f.options && f.options.length > 0), {
    message: "Select fields need a list of options",
  });

const schema = z
  .array(field)
  .max(40)
  .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, { message: "Each field key can only be used once" });

export type AttributeField = z.infer<typeof field>;

/** Parses and checks a category's attribute_schema JSON. */
export function parseAttributeSchema(text: string): { ok: true; value: AttributeField[] } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't valid JSON." };
  }
  if (!Array.isArray(json)) return { ok: false, error: "The schema must be a JSON list of fields." };
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? ` (field ${Number(issue.path[0]) + 1}${issue.path[1] ? `, ${String(issue.path[1])}` : ""})` : "";
    return { ok: false, error: `${issue.message}${where}.` };
  }
  return { ok: true, value: parsed.data };
}

/** An https URL with a host, or null. */
export function parseHttpsUrl(text: string | null | undefined): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Turns a name into a URL slug ("Miken Freak 2026" → "miken-freak-2026"), or null if nothing is left. */
export function parseSlug(text: string | null | undefined): string | null {
  const s = (text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return s || null;
}

/** Reads a FormData value as trimmed text. */
export function text(form: FormData, name: string, max = 1000): string {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

/** Reads an optional value: empty becomes null. */
export function optional(form: FormData, name: string, max = 1000): string | null {
  return text(form, name, max) || null;
}

export const uuid = z.string().uuid();

/** A search term safe to put inside a PostgREST filter (no commas, parentheses or wildcards). */
export function searchTerm(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9@._+ -]/g, "").trim().slice(0, 80);
}
