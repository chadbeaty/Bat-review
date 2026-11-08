import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

export type Db = SupabaseClient;

/**
 * Service-role client. It bypasses Row Level Security, so it is only used in server code for background work:
 * scheduled ingestion, AI analysis, scoring and alerts, and the one-time owner bootstrap. Changes people make
 * from the dashboard go through their own session (see lib/auth/member.ts) so RLS and the audit log apply.
 * Never import this from a Client Component.
 */
export function createAdminClient(): Db | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseConfig || !key) return null;
  return createClient(supabaseConfig.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
