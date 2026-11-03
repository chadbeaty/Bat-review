import type { NextRequest } from "next/server";
import { cronHandler } from "../_shared";
import { runMonitor } from "@/lib/jobs/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Source Monitor: checks every due monitored source, stores new items and queues extraction.
export async function GET(request: NextRequest) {
  return cronHandler(request, "monitor", (db) => runMonitor(db, { triggeredBy: "cron" }));
}
