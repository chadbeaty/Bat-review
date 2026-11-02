"use server";

import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { parseSearchParams, toQueryString } from "@/lib/search";

export type SaveSearchState = { ok?: boolean; error?: string };

const schema = z.object({
  path: z.string().regex(/^\/(shop(\/[a-z0-9-]{1,40})?|bats)$/, "Unknown page"),
  search: z.string().max(2000),
  name: z.string().trim().min(1).max(80),
});

/** Saves the current search for the signed-in member, so alerts can be sent when they launch. */
export async function saveSearch(_state: SaveSearchState, formData: FormData): Promise<SaveSearchState> {
  const parsed = schema.safeParse({ path: formData.get("path"), search: formData.get("search") ?? "", name: formData.get("name") });
  if (!parsed.success) return { error: "This search can't be saved." };
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to save searches." };
  const supabase = (await createClient())!;

  // Store the cleaned query, never the raw string the browser sent.
  const query = parseSearchParams(new URLSearchParams(parsed.data.search), { attributeKeys: attributeKeysIn(parsed.data.search) });
  const params = toQueryString({ ...query, page: 1 });
  const { data: existing } = await supabase
    .from("saved_searches")
    .select("id")
    .eq("user_id", user.id)
    .contains("query", { path: parsed.data.path, params })
    .limit(1);
  if (existing?.length) return { ok: true };

  const { error } = await supabase
    .from("saved_searches")
    .insert({ user_id: user.id, name: parsed.data.name, query: { path: parsed.data.path, params } });
  if (error) {
    console.error("saved search insert failed", error.message);
    return { error: "We couldn't save this search. Try again in a minute." };
  }
  return { ok: true };
}

function attributeKeysIn(search: string): string[] {
  return [...new URLSearchParams(search).keys()].filter((k) => k.startsWith("a.")).map((k) => k.slice(2));
}
