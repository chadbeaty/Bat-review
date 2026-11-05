import { z } from "zod";
import { CASE_TYPES, CONFIDENCE_LEVELS, EVIDENCE_ROLES, OUTREACH_STATUSES, SOURCE_TYPES, STATEMENT_TYPES } from "@/lib/editorial";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);
const text = (max: number) => z.preprocess(blankToNull, z.string().max(max).nullable());
const url = z.preprocess(blankToNull, z.string().max(2000).url().refine((u) => /^https?:\/\//.test(u), "Use an http(s) link").nullable());
const httpsUrl = z.preprocess(blankToNull, z.string().max(2000).url().refine((u) => u.startsWith("https://"), "Images must use https").nullable());
const date = z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable());
const datetime = z.preprocess(blankToNull, z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time").nullable());
export const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens").min(2).max(120);
const uuid = z.preprocess(blankToNull, z.string().uuid().nullable());

export const personSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  occupation: text(200),
  organization: text(200),
  biography: text(4000),
  image_url: httpsUrl,
  image_credit: text(300),
  image_license: text(200),
  website_url: url,
  status: z.enum(["draft", "research_candidate", "active", "archived"]),
});

export const sourceSchema = z.object({
  source_type: z.enum(SOURCE_TYPES),
  title: z.string().trim().min(2).max(400),
  publisher: text(200),
  author: text(200),
  canonical_url: url,
  archive_url: url,
  published_at: datetime,
  source_excerpt: text(4000),
  reliability_notes: text(2000),
  is_primary: z.boolean(),
  verification_status: z.enum(["unverified", "verified", "disputed", "retracted", "unavailable"]),
});

export const statementSchema = z.object({
  person_id: z.string().uuid(),
  exact_quote: z.string().trim().min(3).max(4000),
  normalized_summary: text(1000),
  statement_type: z.enum(STATEMENT_TYPES),
  asset_or_topic: text(120),
  published_at: datetime,
  date_precision: z.enum(["exact", "day", "month", "year", "unknown"]),
  source_id: uuid,
  source_timecode: z.preprocess(blankToNull, z.string().regex(/^\d{1,2}(:\d{2}){1,2}$/, "Use mm:ss or h:mm:ss").nullable()),
  context: text(4000),
  conditions: text(1000),
  verification_status: z.enum(["unverified", "verified", "disputed", "unverifiable"]),
});

export const predictionSchema = z.object({
  person_id: z.string().uuid(),
  statement_id: z.string().uuid(),
  prediction_text: z.string().trim().min(3).max(2000),
  asset: text(120),
  asset_identifier: text(120),
  target_value: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[, $]/g, ""))), z.number().finite().nullable()),
  target_currency: z.preprocess(blankToNull, z.string().regex(/^[A-Z]{3,5}$/, "Use a currency code like USD").nullable()),
  target_direction: z.preprocess(blankToNull, z.enum(["at_or_above", "at_or_below", "event_occurs", "event_does_not_occur", "other"]).nullable()),
  prediction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deadline: date,
  resolution_method: text(2000),
  resolution_criteria: text(2000),
  price_provider: z.preprocess(blankToNull, z.enum(["coingecko", "financial_modeling_prep", "manual", "other"]).nullable()),
  timezone: z.string().trim().min(1).max(60).default("UTC"),
});

export const caseSchema = z.object({
  title: z.string().trim().min(5).max(200),
  slug,
  person_id: z.string().uuid(),
  case_type: z.enum(CASE_TYPES),
  primary_statement_id: uuid,
  prediction_id: uuid,
  summary: text(1200),
  article_body: text(60000),
  what_happened: text(8000),
  limitations: text(8000),
  editorial_conclusion: text(4000),
  evidence_confidence: z.preprocess(blankToNull, z.enum(CONFIDENCE_LEVELS).nullable()),
  is_sponsored: z.boolean(),
  sponsor_disclosure: text(500),
});

export const distributionSchema = z.object({
  social_headline: text(200),
  social_post: text(600),
  newsletter_summary: text(1200),
  seo_description: text(300),
  social_graphic_text: text(200),
});

export const caseEvidenceSchema = z.object({
  evidence_source_id: z.string().uuid(),
  evidence_role: z.enum(EVIDENCE_ROLES),
  classification: z.preprocess(blankToNull, z.enum(CONFIDENCE_LEVELS).nullable()),
  what_it_proves: text(2000),
  what_it_does_not_prove: text(2000),
  limitations: text(2000),
  notes: text(2000),
  identity_established: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : null), z.boolean().nullable()),
  sort_order: z.preprocess((v) => (v === "" || v == null ? 100 : Number(v)), z.number().int().min(0).max(1000)),
});

export const timelineSchema = z.object({
  occurred_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  date_precision: z.enum(["exact", "day", "month", "year"]),
  label: z.string().trim().min(2).max(200),
  description: text(2000),
  kind: z.enum(["statement", "action", "market", "disclosure", "event", "response", "correction"]),
  evidence_source_id: uuid,
});

export const responseSchema = z.object({
  outreach_status: z.enum(OUTREACH_STATUSES),
  contact_method: z.preprocess(blankToNull, z.enum(["email", "social_dm", "representative", "press_office", "phone", "other"]).nullable()),
  contacted_at: datetime,
  response_deadline: datetime,
  response_text: text(8000),
  response_source: text(400),
  received_at: datetime,
  internal_notes: text(4000),
});

export const monitoredSourceSchema = z.object({
  connector: z.enum(["rss", "youtube", "sec_edgar", "house_disclosures", "senate_disclosures", "coingecko", "fmp", "manual_url"]),
  label: z.string().trim().min(2).max(200),
  config: z.preprocess((v) => {
    if (typeof v !== "string" || !v.trim()) return {};
    try {
      return JSON.parse(v);
    } catch {
      return "invalid";
    }
  }, z.record(z.string(), z.unknown(), { message: "Configuration must be valid JSON, e.g. {\"url\": \"https://…\"}" })),
  person_id: uuid,
  enabled: z.boolean(),
  check_interval_hours: z.preprocess((v) => Number(v || 24), z.number().int().min(1).max(720)),
});

/** Reads a FormData into an object, turning checkboxes into booleans for the given keys. */
export function formValues(form: FormData, booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k !== "return") out[k] = v;
  for (const b of booleans) out[b] = form.get(b) === "on";
  return out;
}

/** A form value that failed validation; its message is safe to show to the editor. */
export class ValidationError extends Error {
  name = "ValidationError";
}

export function parseOrThrow<T extends z.ZodType>(schema: T, values: unknown): z.infer<T> {
  const r = schema.safeParse(values);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue?.path.join(".").replace(/_/g, " ");
    throw new ValidationError(field ? `${field}: ${issue.message}` : issue?.message ?? "Please check the form.");
  }
  return r.data;
}
