import { z } from "zod";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: use ${max} characters or fewer`)
    .transform((v) => (v === "" ? null : v));

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,24}$/, "Use 3–24 letters, numbers or underscores"),
  displayName: optionalText(60, "Display name"),
  bio: optionalText(1000, "Bio"),
  city: optionalText(80, "City"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "Use the 2-letter state code, for example TN")
    .transform((v) => (v === "" ? null : v)),
  postalCode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{5}(-\d{4})?$/.test(v), "Enter a 5-digit ZIP code")
    .transform((v) => (v === "" ? null : v)),
});

export type ProfileInput = z.input<typeof profileSchema>;
