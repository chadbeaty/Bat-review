// Types and allowed ranges for each site setting. The database checks the same rules
// (validate_site_setting in the admin migration), so a bad value can't get in through any path.

export type SettingRule =
  | { key: string; label: string; kind: "integer"; min: number; max: number; unit?: string }
  | { key: string; label: string; kind: "boolean" };

export const SETTING_RULES: SettingRule[] = [
  { key: "price_guide_min_sales", label: "Price guide: verified sales before a range is shown", kind: "integer", min: 1, max: 1000, unit: "sales" },
  { key: "price_guide_full_sales", label: "Price guide: verified sales before a full average is shown", kind: "integer", min: 1, max: 10000, unit: "sales" },
  { key: "offer_expiry_hours", label: "Offers expire after", kind: "integer", min: 1, max: 720, unit: "hours" },
  { key: "listing_expiry_days", label: "Listings expire after", kind: "integer", min: 1, max: 365, unit: "days" },
  { key: "messages_per_minute_limit", label: "Messages a member can send per minute", kind: "integer", min: 1, max: 120, unit: "messages" },
  { key: "new_release_window_days", label: "A model counts as a new release for", kind: "integer", min: 1, max: 730, unit: "days" },
  { key: "early_report_threshold", label: "Owner reports before a new release shows early reports", kind: "integer", min: 1, max: 1000, unit: "owners" },
  { key: "durability_min_owners", label: "Owners reporting before the durability tracker shows a model", kind: "integer", min: 1, max: 1000, unit: "owners" },
  { key: "owner_report_interval_days", label: "Minimum days between one owner's reports on a model", kind: "integer", min: 1, max: 365, unit: "days" },
  { key: "featured_listings_enabled", label: "Sellers can buy featured placement", kind: "boolean" },
  { key: "premium_seller_enabled", label: "Premium seller memberships are on sale", kind: "boolean" },
];

export function settingRule(key: string): SettingRule | undefined {
  return SETTING_RULES.find((r) => r.key === key);
}

export type SettingResult = { ok: true; value: number | boolean } | { ok: false; error: string };

/**
 * Parses a form value for a setting. Integers must be whole numbers in range; booleans must be "true" or "false".
 * `others` holds current values, used for checks between settings (the price guide thresholds).
 */
export function parseSetting(key: string, raw: string, others: Record<string, unknown> = {}): SettingResult {
  const rule = settingRule(key);
  if (!rule) return { ok: false, error: "This setting can't be edited here." };
  const text = raw.trim();
  if (rule.kind === "boolean") {
    if (text === "true") return { ok: true, value: true };
    if (text === "false") return { ok: true, value: false };
    return { ok: false, error: "Choose on or off." };
  }
  if (!/^-?\d+$/.test(text)) return { ok: false, error: `Enter a whole number from ${rule.min} to ${rule.max}.` };
  const n = Number(text);
  if (n < rule.min || n > rule.max) return { ok: false, error: `Enter a whole number from ${rule.min} to ${rule.max}.` };
  if (key === "price_guide_full_sales" && typeof others.price_guide_min_sales === "number" && n < others.price_guide_min_sales)
    return { ok: false, error: `This can't be lower than the minimum (${others.price_guide_min_sales}).` };
  if (key === "price_guide_min_sales" && typeof others.price_guide_full_sales === "number" && n > others.price_guide_full_sales)
    return { ok: false, error: `This can't be higher than the full threshold (${others.price_guide_full_sales}).` };
  return { ok: true, value: n };
}
