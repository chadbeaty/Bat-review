import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { matchModelFromBat, type MatchModel } from "@/lib/catalog-match";
import type { BatSummary } from "@/lib/bats";

// Database reads that feed the catalog matcher: the alias list of each product line (product_lines.aliases, loaded
// from data/families.json). Everything is readable by visitors, so it runs as the visitor.

/** Product line id to its aliases. Empty without a database (the line name alone still matches). */
export const getLineAliasMap = cache(async (): Promise<Map<string, string[]>> => {
  const supabase = await createClient();
  const map = new Map<string, string[]>();
  if (!supabase) return map;
  const { data } = await supabase.from("product_lines").select("id, aliases").limit(500);
  for (const row of (data ?? []) as { id: string; aliases: string[] | null }[]) map.set(row.id, row.aliases ?? []);
  return map;
});

/** The matcher's view of a catalog bat, including its product line's aliases. */
export async function matchModelForBat(bat: BatSummary): Promise<MatchModel> {
  const aliases = bat.productLineId ? ((await getLineAliasMap()).get(bat.productLineId) ?? []) : [];
  return matchModelFromBat(bat, aliases);
}
