// Allowed values for catalog fields edited in the admin screens (they match the database checks).

export const CATALOG_STATUSES = ["draft", "pending_review", "published", "archived"] as const;
export const CERT_STATUSES = ["unverified", "manufacturer_listed", "association_listed", "decertified", "not_applicable"] as const;
export const STAMPS = ["USSSA", "USA", "NSA", "ISA", "SSUSA", "ASA", "Other"] as const;
export const WEIGHTINGS = ["balanced", "endload", "midload", "other", "unknown"] as const;
