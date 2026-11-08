import type { NextRequest } from "next/server";
import { cronHandler } from "../_shared";
import { runDaily } from "@/lib/jobs/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Daily: rescore active and watchlisted products, competition snapshots, daily digest email.
export async function GET(request: NextRequest) {
  return cronHandler(request, "daily", (db) => runDaily(db, "cron"));
}
