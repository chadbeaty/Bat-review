import { z } from "zod";

export const MIN_PASSWORD = 10;

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const password = z
  .string()
  .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`)
  .max(72, "Use 72 characters or fewer");

export const signUpSchema = z.object({
  email,
  password,
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,24}$/, "Use 3–24 letters, numbers or underscores")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  displayName: z.string().trim().max(60, "Use 60 characters or fewer").optional(),
  terms: z.literal("on", { message: "Agree to the terms to create an account" }),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const emailOnlySchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match", path: ["confirm"] });

export type FormState = { error?: string; fieldErrors?: Record<string, string>; message?: string; values?: Record<string, string> };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
