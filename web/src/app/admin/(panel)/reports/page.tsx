import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { AdminInputError, must, readFlash, runAdminAction } from "@/lib/admin/action";
import { text, uuid } from "@/lib/admin/validation";
import { AdminTitle, Badge, Empty, Flash, Pager, ReturnTo, SubmitButton, Table, dateTime, pageNumber, param } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Reports" };

const STATUSES = ["open", "reviewing", "actioned", "dismissed"] as const;
const PAGE_SIZE = 30;

async function updateReport(form: FormData) {
  "use server";
  return runAdminAction(["moderator"], form, "/admin/reports", async (staff, db) => {
    const id = text(form, "reportId");
    const status = text(form, "status");
    if (!uuid.safeParse(id).success || !(STATUSES as readonly string[]).includes(status)) throw new AdminInputError("Unknown report or status.");
    must(await db.rpc("admin_update_report", { p_actor: staff.user.id, p_report: id, p_status: status, p_notes: text(form, "notes", 2000) || null }));
    return `Report marked ${status}.`;
  });
}

function entityLink(type: string, id: string) {
  if (type === "listing") return `/admin/listings?id=${id}`;
  if (type === "user") return `/admin/users/${id}`;
  if (type === "dispute") return `/admin/disputes/${id}`;
  return null;
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireStaff(["moderator"], "/admin/reports");
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(param(sp, "status")) ? param(sp, "status") : "open";
  const page = pageNumber(sp);
  const { data, error } = await adminDb()
    .from("reports")
    .select("id, reporter_id, entity_type, entity_id, reason, details, source, status, resolution_notes, resolved_at, created_at")
    .eq("status", status)
    .order("created_at", { ascending: status === "open" || status === "reviewing" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const here = `/admin/reports?status=${status}&page=${page}`;

  return (
    <>
      <AdminTitle title="Reports" intro="Reports from members about listings, members, messages and reviews. Oldest open reports first." />
      <Flash flash={readFlash(sp)} />
      <nav aria-label="Report status" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}`} className={`btn px-3 py-1.5 text-sm ${s === status ? "btn-primary" : "btn-outline"}`} aria-current={s === status ? "page" : undefined}>
            {s}
          </Link>
        ))}
      </nav>
      {error ? (
        <p className="text-danger">Couldn&apos;t load reports: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No {status} reports.</Empty>
      ) : (
        <Table label="Reports">
          <thead>
            <tr>
              <th>Filed</th>
              <th>About</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Resolve</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const link = entityLink(r.entity_type, r.entity_id);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{dateTime(r.created_at)}</td>
                  <td>
                    {r.entity_type}{" "}
                    {link ? (
                      <Link href={link} className="font-mono text-xs underline">
                        {r.entity_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{r.entity_id.slice(0, 8)}</span>
                    )}
                    <span className="block text-xs text-ink-soft">
                      by{" "}
                      <Link href={`/admin/users/${r.reporter_id}`} className="underline">
                        reporter
                      </Link>
                    </span>
                  </td>
                  <td>
                    <span className="font-medium">{r.reason.replace(/_/g, " ")}</span>{" "}
                    {r.source === "auto" && <Badge tone="warn">auto-flagged</Badge>}
                    {r.details && <p className="mt-1 max-w-sm whitespace-pre-wrap text-xs text-ink-soft">{r.details}</p>}
                  </td>
                  <td>
                    <Badge tone={r.status === "actioned" ? "good" : r.status === "open" ? "warn" : "neutral"}>{r.status}</Badge>
                    {r.resolution_notes && <p className="mt-1 max-w-xs text-xs">{r.resolution_notes}</p>}
                  </td>
                  <td>
                    <form action={updateReport} className="grid gap-1">
                      <ReturnTo path={here} />
                      <input type="hidden" name="reportId" value={r.id} />
                      <select name="status" defaultValue={r.status === "open" ? "reviewing" : r.status} aria-label="New status" className="input px-2 py-1 text-xs">
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <textarea name="notes" rows={2} maxLength={2000} placeholder="Resolution notes (needed to close)" aria-label="Resolution notes" defaultValue={r.resolution_notes ?? ""} className="input px-2 py-1 text-xs" />
                      <SubmitButton tone="outline">Update</SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager basePath="/admin/reports" params={{ status }} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
