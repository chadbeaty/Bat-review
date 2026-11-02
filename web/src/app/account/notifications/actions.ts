"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function markNotificationRead(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/account/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  if (!user || !supabase) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/account/notifications");
}
