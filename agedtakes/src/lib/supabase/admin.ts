import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * Service-role client. It bypasses Row Level Security, so use it only in server code for work the database
 * deliberately keeps away from browsers: scheduled jobs, the AI research engine, newsletter signups and reader
 * submissions. Database triggers still refuse to let it approve or publish anything. Staff edits use the
 * staff member's own session instead (see lib/auth/staff.ts). Never import this from a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseConfig || !key) return null;
  return createClient(supabaseConfig.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
