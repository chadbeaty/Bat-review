// Shipping address form rules. The addresses table checks the same shapes, so bad data can't get in another way.

import { z } from "zod";
import type { Address } from "./types";

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR",
] as const;

export const addressSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the recipient's full name.").max(100),
  street_address: z.string().trim().min(3, "Enter the street address.").max(200),
  apartment: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || null),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((s) => (US_STATES as readonly string[]).includes(s), "Choose a US state."),
  postal_code: z
    .string()
    .trim()
    .regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a 5-digit ZIP code."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[0-9+() .-]{7,20}$/.test(v), "Enter a valid phone number, or leave it empty."),
});

export type AddressInput = z.infer<typeof addressSchema>;

export function parseAddressForm(form: FormData): { ok: true; value: AddressInput } | { ok: false; error: string } {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = addressSchema.safeParse({
    full_name: get("full_name"),
    street_address: get("street_address"),
    apartment: get("apartment"),
    city: get("city"),
    state: get("state"),
    postal_code: get("postal_code"),
    phone: get("phone"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the address." };
  return { ok: true, value: parsed.data };
}

/** An addresses-table row as a provider address. */
export function toProviderAddress(row: {
  full_name: string;
  street_address: string;
  apartment: string | null;
  city: string;
  state: string;
  postal_code: string;
  phone: string | null;
}): Address {
  return {
    name: row.full_name,
    street1: row.street_address,
    street2: row.apartment,
    city: row.city,
    state: row.state,
    zip: row.postal_code,
    country: "US",
    phone: row.phone,
  };
}

export function formatAddressLines(row: { full_name: string; street_address: string; apartment: string | null; city: string; state: string; postal_code: string }): string[] {
  return [row.full_name, row.street_address, row.apartment, `${row.city}, ${row.state} ${row.postal_code}`].filter(Boolean) as string[];
}
