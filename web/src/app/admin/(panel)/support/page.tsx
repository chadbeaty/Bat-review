import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { AdminInputError, must, readFlash, runAdminAction } from "@/lib/admin/action";
import { text, uuid } from "@/lib/admin/validation";
import { AdminTitle, Badge, Empty, Flash, ReturnTo, SubmitButton, dateTime, param } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Support messages" };

async function setClosed(form: FormData) {
  "use server";
  return runAdminAction(["support"], form, "/admin/support", async (staff, db) => {
    const id = text(form, "messageId");
    if (!uuid.safeParse(id).success) throw new AdminInputError("Unknown message.");
    const close = text(form, "close") === "true";
    must(await db.rpc("admin_close_support_message", { p_actor: staff.user.id, p_message: id, p_close: close }));
    return close ? "Marked as handled." : "Reopened.";
  });
}

export default async function SupportPage({ searchParams }: PageProps<"/admin/support">) {
  await requireStaff(["support"], "/admin/support");
  const sp = await searchParams;
  const status = param(sp, "status") === "closed" ? "closed" : "open";
  const db = adminDb();
  const { data } = await db
    .from("support_messages")
    .select("id, user_id, topic, subject, body, status, created_at, closed_at")
    .eq("status", status)
    .order("created_at", { ascending: status === "open" })
    .limit(100);
  const ids = [...new Set((data ?? []).map((m) => m.user_id))];
  const { data: people } = ids.length ? await db.from("profiles").select("id, username, email").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const here = `/admin/support?status=${status}`;

  return (
    <>
      <AdminTitle title="Support messages" intro="Messages members send from the contact page. Reply by email from the support inbox, then mark them handled." />
      <Flash flash={readFlash(sp)} />
      <nav aria-label="Message status" className="flex gap-2">
        {["open", "closed"].map((s) => (
          <Link key={s} href={`/admin/support?status=${s}`} className={`btn px-3 py-1.5 text-sm ${s === status ? "btn-primary" : "btn-outline"}`}>
            {s === "open" ? "Open" : "Handled"}
          </Link>
        ))}
      </nav>
      {(data ?? []).length === 0 ? (
        <Empty>No {status === "open" ? "open" : "handled"} messages.</Empty>
      ) : (
        <ul className="grid gap-3">
          {(data ?? []).map((m) => {
            const who = byId.get(m.user_id);
            return (
              <li key={m.id} className="card grid gap-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{m.subject}</h2>
                  <span className="text-xs text-ink-soft">{dateTime(m.created_at)}</span>
                </div>
                <p className="text-sm">
                  <Badge>{m.topic}</Badge>{" "}
                  <Link href={`/admin/users/${m.user_id}`} className="underline">
                    @{who?.username}
                  </Link>{" "}
                  {who?.email && (
                    <a href={`mailto:${who.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="underline">
                      {who.email}
                    </a>
                  )}
                </p>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                <form action={setClosed}>
                  <ReturnTo path={here} />
                  <input type="hidden" name="messageId" value={m.id} />
                  <input type="hidden" name="close" value={m.status === "open" ? "true" : "false"} />
                  <SubmitButton tone="outline">{m.status === "open" ? "Mark handled" : "Reopen"}</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
