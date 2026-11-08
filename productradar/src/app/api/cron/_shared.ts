import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, type Db } from "@/lib/supabase/admin";
import { checkBearer } from "@/lib/security";
import { log } from "@/lib/log";

/**
 * Protects scheduled endpoints: Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Anything else gets a 401.
 * Runs the job with the service role and returns a JSON summary (also recorded on Admin → Jobs).
 */
export async function cronHandler(request: NextRequest, name: string, fn: (db: Db) => Promise<unknown>) {
  if (!checkBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const started = Date.now();
  try {
    const result = await fn(db);
    log.info("cron_finished", { name, ms: Date.now() - started });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    log.error("cron_failed", { name, err });
    return NextResponse.json({ ok: false, error: "Job failed; see Admin → Jobs." }, { status: 500 });
  }
}
