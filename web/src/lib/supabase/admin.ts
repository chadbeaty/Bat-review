import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * Service-role client. It bypasses Row Level Security, so use it only in server code after checking who is
 * asking, and only for work the database deliberately keeps away from browsers (orders, webhooks, newsletter,
 * admin actions). Never import this from a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseConfig || !key) return null;
  return createClient(supabaseConfig.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
