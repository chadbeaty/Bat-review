import type { NextRequest } from "next/server";
import { cronHandler } from "../_shared";
import { runIngestCycle } from "@/lib/jobs/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Ingestion cycle (scheduled four times a day): YouTube uploads → AI extraction → grouping → scoring → alerts.
export async function GET(request: NextRequest) {
  return cronHandler(request, "ingest", (db) => runIngestCycle(db, "cron"));
}
