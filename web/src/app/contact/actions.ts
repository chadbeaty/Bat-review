"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ContactState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  topic: z.enum(["order", "listing", "account", "safety", "catalog", "other"], { message: "Choose a topic" }),
  subject: z.string().trim().min(3, "Add a short subject").max(120, "Keep the subject under 120 characters"),
  body: z.string().trim().min(10, "Tell us a bit more (at least 10 characters)").max(4000, "Keep it under 4,000 characters"),
});

/** Saves a support message from a signed-in member. Row Level Security and a rate limit apply in the database. */
export async function sendSupportMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const supabase = await createClient();
  if (!supabase) return { error: "Messages aren't available yet. Email us instead." };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sign in to send a message, or email us instead." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const { error } = await supabase.from("support_messages").insert({ user_id: data.user.id, ...parsed.data });
  if (error) {
    if (error.code === "54000") return { error: error.message };
    return { error: "That didn't go through. Try again, or email us." };
  }
  return { ok: true };
}
