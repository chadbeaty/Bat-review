import type { NextRequest } from "next/server";
import { cronHandler } from "../_shared";
import { processJobs, queueDuePredictions } from "@/lib/jobs/runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Prediction Resolution: proposes outcomes for due predictions. Editors confirm every proposal.
export async function GET(request: NextRequest) {
  return cronHandler(request, "resolve-predictions", async (db) => {
    const queued = await queueDuePredictions(db);
    const run = await processJobs(db, { worker: `resolve-${crypto.randomUUID().slice(0, 8)}`, budgetMs: 200_000, maxJobs: 40, types: ["resolve_prediction"] });
    return { queued, ...run };
  });
}
