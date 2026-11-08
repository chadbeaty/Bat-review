import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

function pepper(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-pepper";
}

/** A one-way hash of the visitor's IP address (raw IPs are never stored). */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHmac("sha256", pepper()).update(ip).digest("hex").slice(0, 32);
}

/** Returns true when the action is allowed. Counts live in Postgres, so this works across serverless instances. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = createAdminClient();
  if (!db) return true;
  const { data, error } = await db.rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    log.warn("rate_limit_unavailable", { key: key.split(":")[0], message: error.message });
    return true;
  }
  return data === true;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Constant-time check of a bearer secret (used by cron endpoints). */
export function checkBearer(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  return safeEqual(authorization, `Bearer ${secret}`);
}
