import { z } from "zod";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Enter a full link starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://");

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** Reader submissions. Everything goes to moderation; nothing submitted is ever published automatically. */
export const submissionSchema = z.object({
  person_name: z.string().trim().min(2, "Who said it?").max(160),
  statement_text: z.string().trim().min(5, "Paste the statement or describe it.").max(4000),
  statement_date: optionalText(40),
  source_url: httpUrl,
  supporting_urls: z
    .string()
    .max(6000)
    .optional()
    .transform((v) => (v ?? "").split(/\s+/).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(httpUrl).max(10, "Up to 10 supporting links.")),
  context: optionalText(4000),
  submitter_name: optionalText(120),
  submitter_email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().email("Enter a valid email, or leave it blank.").optional()),
  // Honeypot: real visitors never see or fill this field.
  website: z.string().max(0).optional(),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form.";
}
