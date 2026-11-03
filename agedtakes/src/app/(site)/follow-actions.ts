"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

export async function getFollowState(personId: string): Promise<{ signedIn: boolean; following: boolean }> {
  if (!id.safeParse(personId).success) return { signedIn: false, following: false };
  const db = await createClient();
  if (!db) return { signedIn: false, following: false };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { signedIn: false, following: false };
  const { data } = await db.from("user_follows").select("person_id").eq("user_id", auth.user.id).eq("person_id", personId).maybeSingle();
  return { signedIn: true, following: Boolean(data) };
}

/** Follows or unfollows, as the signed-in reader (Row Level Security only allows changing your own follows). */
export async function setFollow(personId: string, follow: boolean): Promise<{ ok: boolean; following: boolean }> {
  if (!id.safeParse(personId).success) return { ok: false, following: !follow };
  const db = await createClient();
  if (!db) return { ok: false, following: !follow };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, following: false };
  const res = follow
    ? await db.from("user_follows").upsert({ user_id: auth.user.id, person_id: personId }, { onConflict: "user_id,person_id", ignoreDuplicates: true })
    : await db.from("user_follows").delete().eq("user_id", auth.user.id).eq("person_id", personId);
  return { ok: !res.error, following: res.error ? !follow : follow };
}
