"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileSchema } from "@/lib/validation/profile";
import { fieldErrors, type FormState } from "@/lib/validation/auth";
import { AVATAR_TYPES, MAX_AVATAR_BYTES } from "@/lib/sell/listing";

const AVATARS = "avatars";

async function signedIn() {
  const db = await createClient();
  if (!db) return null;
  const { data } = await db.auth.getUser();
  return data.user ? { db, user: data.user } : null;
}

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["username", "displayName", "bio", "city", "state", "postalCode"].map((k) => [k, String(formData.get(k) ?? "")]));
  const s = await signedIn();
  if (!s) return { error: "Your session has ended. Sign in again.", values: raw };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: raw };
  const v = parsed.data;

  const { error } = await s.db
    .from("profiles")
    .update({ username: v.username, display_name: v.displayName, bio: v.bio, city: v.city, state: v.state, postal_code: v.postalCode })
    .eq("id", s.user.id);
  if (error) {
    // Usernames are unique regardless of case (citext).
    if (error.code === "23505") return { fieldErrors: { username: "That username is taken. Try another." }, values: raw };
    return { error: "We couldn't save your profile. Try again.", values: raw };
  }
  revalidatePath("/account", "layout");
  return { message: "Profile saved.", values: raw };
}

/** Records an avatar the browser uploaded to avatars/<user id>/…, after checking it, and deletes the previous one. */
export async function saveAvatar(path: string): Promise<{ ok: boolean; error?: string; url?: string }> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "Your session has ended. Sign in again." };
  const valid = z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/).safeParse(path);
  if (!valid.success || !path.startsWith(`${s.user.id}/`)) return { ok: false, error: "That upload wasn't valid. Try again." };

  const admin = createAdminClient();
  if (admin) {
    const { data: info } = await admin.storage.from(AVATARS).info(path);
    const type = info?.contentType ?? "";
    if (!info || !(AVATAR_TYPES as readonly string[]).includes(type) || Number(info.size ?? 0) > MAX_AVATAR_BYTES) {
      await admin.storage.from(AVATARS).remove([path]);
      return { ok: false, error: "Use a JPG, PNG or WEBP photo up to 2 MB." };
    }
  }
  const { data: before } = await s.db.from("profiles").select("profile_photo_url").eq("id", s.user.id).maybeSingle();
  const url = s.db.storage.from(AVATARS).getPublicUrl(path).data.publicUrl;
  const { error } = await s.db.from("profiles").update({ profile_photo_url: url }).eq("id", s.user.id);
  if (error) return { ok: false, error: "We couldn't save your photo. Try again." };

  const marker = `/object/public/${AVATARS}/`;
  const old = before?.profile_photo_url?.includes(marker) ? before.profile_photo_url.split(marker)[1] : null;
  if (admin && old && old !== path && old.startsWith(`${s.user.id}/`)) await admin.storage.from(AVATARS).remove([old]);
  revalidatePath("/account", "layout");
  return { ok: true, url };
}

export async function removeAvatar(): Promise<{ ok: boolean; error?: string }> {
  const s = await signedIn();
  if (!s) return { ok: false, error: "Your session has ended. Sign in again." };
  const { data: before } = await s.db.from("profiles").select("profile_photo_url").eq("id", s.user.id).maybeSingle();
  const { error } = await s.db.from("profiles").update({ profile_photo_url: null }).eq("id", s.user.id);
  if (error) return { ok: false, error: "We couldn't remove your photo. Try again." };
  const marker = `/object/public/${AVATARS}/`;
  const old = before?.profile_photo_url?.includes(marker) ? before.profile_photo_url.split(marker)[1] : null;
  if (old && old.startsWith(`${s.user.id}/`)) await createAdminClient()?.storage.from(AVATARS).remove([old]);
  revalidatePath("/account", "layout");
  return { ok: true };
}
