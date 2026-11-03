import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * Anonymous, cookie-free client for public pages. It sees exactly what any visitor may see (Row Level Security
 * decides), and because it never reads cookies, public pages can be statically cached (ISR) and revalidated on publish.
 */
export function createPublicClient() {
  if (!supabaseConfig) return null;
  return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
