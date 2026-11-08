import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MODEL } from "@/lib/env";

// Typed app settings with safe defaults. Stored as JSON in app_settings and edited on Admin → Settings.

export const weightsSchema = z
  .object({
    early_momentum: z.number().min(0).max(100),
    demand_acceleration: z.number().min(0).max(100),
    competition: z.number().min(0).max(100),
    organic_video_potential: z.number().min(0).max(100),
    problem_solving: z.number().min(0).max(100),
    profit_potential: z.number().min(0).max(100),
  })
  .refine((w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100) < 0.01, { message: "Weights must add up to 100." });
export type Weights = z.infer<typeof weightsSchema>;

export const thresholdsSchema = z.object({
  score: z.number().min(0).max(100),
  momentum_acceleration: z.number().min(1),
  momentum_min_mentions_72h: z.number().int().min(1),
  multi_source_min_platforms: z.number().int().min(2),
  low_competition_min_score: z.number().min(0).max(100),
  strong_demand_min_score: z.number().min(0).max(100),
  saturation_creators_7d: z.number().int().min(2),
  saturation_min_previous_score: z.number().min(0).max(100),
  rescore_change_points: z.number().min(1).max(50),
});
export type Thresholds = z.infer<typeof thresholdsSchema>;

export const aiSettingsSchema = z.object({
  model: z.string().min(3).max(60),
  daily_budget_usd: z.number().min(0).max(100),
  monthly_budget_usd: z.number().min(0).max(1000),
  assess_min_prelim_score: z.number().min(0).max(100),
  reassess_after_days: z.number().min(0.5).max(60),
  max_videos_per_run: z.number().int().min(1).max(100),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const youtubeSettingsSchema = z.object({
  poll_interval_hours: z.number().min(1).max(48),
  lookback_days: z.number().int().min(1).max(60),
  max_new_videos_per_creator: z.number().int().min(1).max(50),
  stats_refresh_days: z.number().int().min(1).max(60),
});
export type YoutubeSettings = z.infer<typeof youtubeSettingsSchema>;

export const economicsSchema = z.object({
  payment_pct: z.number().min(0).max(0.2),
  payment_fixed: z.number().min(0).max(5),
  refund_reserve_pct: z.number().min(0).max(0.5),
  other_pct: z.number().min(0).max(0.5),
  default_shipping: z.number().min(0).max(50),
});
export type Economics = z.infer<typeof economicsSchema>;

export const digestSchema = z.object({ enabled: z.boolean(), top_n: z.number().int().min(1).max(25) });
export const fixedCostsSchema = z.object({ vercel: z.number().min(0), supabase: z.number().min(0), resend: z.number().min(0), other: z.number().min(0) });

export const DEFAULTS = {
  scoring_weights: { early_momentum: 25, demand_acceleration: 20, competition: 20, organic_video_potential: 15, problem_solving: 10, profit_potential: 10 } as Weights,
  alert_thresholds: {
    score: 80, momentum_acceleration: 3, momentum_min_mentions_72h: 3, multi_source_min_platforms: 2, low_competition_min_score: 70,
    strong_demand_min_score: 60, saturation_creators_7d: 8, saturation_min_previous_score: 60, rescore_change_points: 10,
  } as Thresholds,
  ai: { model: DEFAULT_MODEL, daily_budget_usd: 1.5, monthly_budget_usd: 40, assess_min_prelim_score: 40, reassess_after_days: 3, max_videos_per_run: 24 } as AiSettings,
  youtube: { poll_interval_hours: 4, lookback_days: 14, max_new_videos_per_creator: 10, stats_refresh_days: 14 } as YoutubeSettings,
  economics: { payment_pct: 0.029, payment_fixed: 0.3, refund_reserve_pct: 0.05, other_pct: 0.03, default_shipping: 4 } as Economics,
  digest: { enabled: true, top_n: 10 },
  fixed_costs: { vercel: 0, supabase: 0, resend: 0, other: 0 },
};

const SCHEMAS = {
  scoring_weights: weightsSchema,
  alert_thresholds: thresholdsSchema,
  ai: aiSettingsSchema,
  youtube: youtubeSettingsSchema,
  economics: economicsSchema,
  digest: digestSchema,
  fixed_costs: fixedCostsSchema,
} as const;

export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(SCHEMAS) as SettingKey[];

export function parseSetting<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  const merged = value && typeof value === "object" ? { ...DEFAULTS[key], ...(value as object) } : DEFAULTS[key];
  const parsed = SCHEMAS[key].safeParse(merged);
  return (parsed.success ? parsed.data : DEFAULTS[key]) as Settings[K];
}

export function validateSetting(key: SettingKey, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const parsed = SCHEMAS[key].safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value" };
}

export async function loadSettings(db: SupabaseClient): Promise<Settings> {
  const { data } = await db.from("app_settings").select("key, value");
  const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const out = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) out[key] = parseSetting(key, map.get(key));
  return out as Settings;
}
