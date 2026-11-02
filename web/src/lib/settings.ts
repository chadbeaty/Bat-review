import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FeeRule } from "@/lib/fees";

/** The fee rule in force now, from the fee_configuration table. Null when the database isn't connected. */
export async function getCurrentFee(name: string): Promise<FeeRule | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("current_fee", { name }).maybeSingle<FeeRule & { id: string | null }>();
  if (error || !data || data.id == null) return null;
  return { fee_name: data.fee_name, fee_type: data.fee_type, fee_value: Number(data.fee_value) };
}

/** A public site setting (for example the price guide thresholds). */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = await createClient();
  if (!supabase) return fallback;
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}
