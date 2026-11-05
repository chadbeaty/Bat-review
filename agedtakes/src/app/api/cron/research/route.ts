import type { NextRequest } from "next/server";
import { cronHandler } from "../_shared";
import { processJobs } from "@/lib/jobs/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Works through the research queue (extraction → matching → evidence → draft) within a time budget.
export async function GET(request: NextRequest) {
  return cronHandler(request, "research", (db) => processJobs(db, { worker: `cron-${crypto.randomUUID().slice(0, 8)}`, budgetMs: 240_000, maxJobs: 25 }));
}
