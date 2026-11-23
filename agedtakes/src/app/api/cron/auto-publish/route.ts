import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { cronHandler } from "../_shared";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Auto-publish: when the owner has switched it on (Admin → Settings), publishes research-agent drafts that have
// waited out the review window and pass every automatic check. The rules live in the database
// (auto_publish_due_cases in supabase/migrations/20261123000100_auto_publish.sql).
export async function GET(request: NextRequest) {
  return cronHandler(request, "auto-publish", async (db) => {
    const { data, error } = await db.rpc("auto_publish_due_cases");
    if (error) throw new Error(error.message);
    const result = data as { published?: { slug: string }[] } | null;
    if (result?.published?.length) {
      revalidatePath("/", "layout");
      for (const p of result.published) revalidatePath(`/cases/${p.slug}`);
    }
    return result;
  });
}
