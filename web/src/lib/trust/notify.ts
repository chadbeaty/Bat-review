import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type RenderedEmail } from "@/lib/email";

export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  message?: string | null;
  link: string;
  entityId?: string | null;
  /** The matching transactional email. Built with the recipient's first name omitted; the layout handles that. */
  email?: (recipientName: string | null) => RenderedEmail;
  /** Skip when the member already has an unread notification of this type for the same thing (for example, messages). */
  dedupe?: boolean;
};

/**
 * Creates a notification row with the service role (members cannot create them) and sends the matching
 * email. Never throws: a failed notification must not undo the action that caused it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const db = createAdminClient();
    if (!db) return;
    if (input.dedupe && input.entityId) {
      const { data: existing } = await db
        .from("notifications")
        .select("id")
        .eq("user_id", input.userId)
        .eq("notification_type", input.type)
        .eq("related_entity_id", input.entityId)
        .is("read_at", null)
        .limit(1);
      if (existing?.length) return;
    }
    await db.from("notifications").insert({
      user_id: input.userId,
      notification_type: input.type,
      title: input.title.slice(0, 200),
      message: input.message?.slice(0, 500) ?? null,
      related_entity_id: input.entityId ?? null,
      link_path: input.link,
    });
    if (input.email) {
      const [{ data: auth }, { data: profile }] = await Promise.all([
        db.auth.admin.getUserById(input.userId),
        db.from("profiles").select("display_name, username").eq("id", input.userId).maybeSingle(),
      ]);
      const to = auth.user?.email;
      if (to) await sendEmail(to, input.email(profile?.display_name || profile?.username || null));
    }
  } catch (err) {
    console.error("notify failed", err instanceof Error ? err.message : err);
  }
}

/** Usernames and display names for a set of members (never emails or phone numbers). */
export async function memberNames(ids: string[]): Promise<Map<string, { username: string; displayName: string | null }>> {
  const map = new Map<string, { username: string; displayName: string | null }>();
  const db = createAdminClient();
  const unique = [...new Set(ids)];
  if (!db || !unique.length) return map;
  const { data } = await db.from("profiles").select("id, username, display_name").in("id", unique);
  for (const p of data ?? []) map.set(p.id, { username: p.username as string, displayName: p.display_name });
  return map;
}
