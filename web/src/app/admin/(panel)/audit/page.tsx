import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { searchTerm, uuid } from "@/lib/admin/validation";
import { AdminTitle, Empty, Pager, Table, dateTime, pageNumber, param } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const entityTypes = [
  "profile",
  "equipment_listing",
  "report",
  "product",
  "bat_specification",
  "product_submission",
  "manufacturer",
  "product_category",
  "fee_configuration",
  "site_settings",
  "advertising_campaign",
  "support_message",
  "export",
];

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff(["admin"], "/admin/audit");
  const sp = await searchParams;
  const actor = searchTerm(param(sp, "actor"));
  const entity = param(sp, "entity").replace(/[^a-z_]/g, "");
  const action = param(sp, "action").replace(/[^a-z0-9_.]/g, "");
  const from = DATE_RE.test(param(sp, "from")) ? param(sp, "from") : "";
  const to = DATE_RE.test(param(sp, "to")) ? param(sp, "to") : "";
  const page = pageNumber(sp);
  const db = adminDb();

  // The actor filter takes a username or a member id.
  let actorId: string | null = null;
  let actorMissing = false;
  if (actor) {
    if (uuid.safeParse(actor).success) actorId = actor;
    else {
      const { data } = await db.from("profiles").select("id").eq("username", actor.replace(/^@/, "")).maybeSingle();
      actorId = data?.id ?? null;
      actorMissing = !actorId;
    }
  }

  let query = db
    .from("audit_logs")
    .select("id, actor_user_id, action, entity_type, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (actorId) query = query.eq("actor_user_id", actorId);
  if (entity) query = query.eq("entity_type", entity);
  if (action) query = query.ilike("action", `${action}%`);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  const { data, error } = actorMissing ? { data: [], error: null } : await query;
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await db.from("profiles").select("id, username").in("id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.id, a.username as string]));

  return (
    <>
      <AdminTitle title="Audit log" intro="Every staff action and every fee or setting change. Entries can't be edited or deleted, by anyone." />
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="field">
          <span className="text-sm">Actor (username or id)</span>
          <input name="actor" defaultValue={actor} className="input w-48" />
        </label>
        <label className="field">
          <span className="text-sm">Entity type</span>
          <select name="entity" defaultValue={entity} className="input">
            <option value="">Any</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-sm">Action starts with</span>
          <input name="action" defaultValue={action} placeholder="user." className="input w-36" />
        </label>
        <label className="field">
          <span className="text-sm">From</span>
          <input name="from" type="date" defaultValue={from} className="input" />
        </label>
        <label className="field">
          <span className="text-sm">To</span>
          <input name="to" type="date" defaultValue={to} className="input" />
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      {actorMissing && <p className="text-sm text-danger">No member has that username.</p>}
      {error ? (
        <p className="text-danger">Couldn&apos;t load the audit log: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No entries match.</Empty>
      ) : (
        <Table label="Audit entries">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateTime(r.created_at)}</td>
                <td>
                  {r.actor_user_id ? (
                    <Link href={`/admin/users/${r.actor_user_id}`} className="underline">
                      @{names.get(r.actor_user_id) ?? r.actor_user_id.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="text-ink-soft">System</span>
                  )}
                </td>
                <td className="font-mono">{r.action}</td>
                <td className="text-xs">
                  {r.entity_type}
                  {r.entity_id && <span className="block font-mono text-ink-soft">{r.entity_id}</span>}
                </td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-xs">Show</summary>
                    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(r.metadata, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager basePath="/admin/audit" params={{ actor, entity, action, from, to }} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
