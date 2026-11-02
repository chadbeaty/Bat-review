import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/notifications");

  const { data } = await supabase
    .from("notifications")
    .select("id, notification_type, title, message, link_path, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">Your account</p>
        <h1 className="display text-5xl font-bold">Notifications</h1>
        <p className="text-ink-soft" data-testid="unread-summary">
          {unread ? `${unread} unread` : "You're all caught up."}
        </p>
      </div>
      {unread > 0 && (
        <form action={markAllNotificationsRead}>
          <button type="submit" className="btn btn-outline">
            Mark all as read
          </button>
        </form>
      )}
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" body="Messages, offers, reviews and case updates show up here." />
      ) : (
        <ul className="grid gap-3" data-testid="notifications">
          {items.map((n) => (
            <li key={n.id} className={`card grid gap-1 p-4 ${n.read_at ? "" : "border-line-strong bg-surface"}`} data-read={n.read_at ? "true" : "false"}>
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold break-words">{n.title}</span>
                <span className="text-xs text-ink-soft">{new Date(n.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</span>
              </p>
              {n.message && <p className="break-words text-sm text-ink-soft">{n.message}</p>}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {n.link_path && (
                  <Link href={n.link_path} className="font-semibold underline">
                    Open
                  </Link>
                )}
                {!n.read_at && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="underline">
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
