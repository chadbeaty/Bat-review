import { createClient } from "@/lib/supabase/server";

/** Unread notification count for the signed-in member, shown as a small pill. Renders nothing at zero. */
export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  if (!supabase) return 0;
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export function CountPill({ count, label = "unread" }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink" aria-label={`${count} ${label}`} data-testid="unread-badge">
      {count > 99 ? "99+" : count}
    </span>
  );
}
