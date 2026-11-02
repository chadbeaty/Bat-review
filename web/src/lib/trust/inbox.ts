import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Marks every unread message to the member in a conversation as read, and clears its notification. */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  const now = new Date().toISOString();
  await supabase.from("messages").update({ read_at: now }).eq("conversation_id", conversationId).eq("recipient_id", userId).is("read_at", null);
  await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", userId)
    .eq("notification_type", "new_message")
    .eq("related_entity_id", conversationId)
    .is("read_at", null);
}
