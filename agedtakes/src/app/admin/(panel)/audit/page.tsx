import { AdminHeader, Table, Td, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

function diff(prev: Record<string, unknown> | null, next: Record<string, unknown> | null): string {
  if (!prev || !next) return "";
  return Object.keys(next).filter((k) => !["updated_at", "last_updated_at"].includes(k) && JSON.stringify(prev[k]) !== JSON.stringify(next[k])).join(", ");
}

export default async function Audit({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("admin");
  const sp = await searchParams;
  const entity = sp1(sp.entity);
  let q = db.from("audit_logs").select("id, actor_id, actor_label, action, entity_type, entity_id, previous_value, new_value, created_at").order("id", { ascending: false }).limit(300);
  if (entity) q = q.eq("entity_type", entity);
  const [{ data }, { data: staff }] = await Promise.all([q, db.from("profiles").select("id, email").neq("role", "reader")]);
  const who = new Map((staff ?? []).map((s) => [s.id, s.email]));
  return (
    <div>
      <AdminHeader kicker="System" title="Audit log">Append-only record of every editorial change, written by the database. Nobody — including admins and the server — can edit or delete it.</AdminHeader>
      <form className="mb-4 flex gap-2"><select name="entity" defaultValue={entity ?? ""} className="field max-w-xs"><option value="">All records</option>{["cases", "statements", "predictions", "prediction_outcomes", "evidence_sources", "case_evidence", "corrections", "people", "profiles", "site_settings", "editorial_reviews", "newsletter_issues", "research_jobs"].map((e) => <option key={e} value={e}>{e}</option>)}</select><button className="btn btn-sm">Filter</button></form>
      <Table head={["When", "Who", "Action", "Record", "Changed fields"]}>
        {(data ?? []).map((a) => (
          <tr key={a.id}>
            <Td mono>{formatDateTime(a.created_at)}</Td>
            <Td mono>{a.actor_id ? who.get(a.actor_id) ?? a.actor_id.slice(0, 8) : a.actor_label}</Td>
            <Td mono>{a.action}</Td>
            <Td mono>{a.entity_type} {a.entity_id?.slice(0, 8)}</Td>
            <Td className="max-w-md text-sm">{diff(a.previous_value, a.new_value)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
