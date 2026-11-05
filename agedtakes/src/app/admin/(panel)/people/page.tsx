import Link from "next/link";
import { AdminHeader, Field, FilterLinks, Flash, Panel, Return, SelectField, Submit, Table, Td, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { formatShortDate } from "@/lib/format";
import { createPerson } from "./actions";

export const metadata = { title: "People" };

const STATUSES = [["draft", "Draft"], ["research_candidate", "Research candidate"], ["active", "Active (public)"], ["archived", "Archived"]] as const;

export default async function AdminPeople({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const status = sp1(sp.status);
  const q = sp1(sp.q);
  let query = db.from("people").select("id, name, slug, status, occupation, is_demo, follower_count, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data: people } = await query;

  return (
    <div>
      <AdminHeader kicker="Record" title="People">Add, remove and edit tracked people. Research candidates are internal only — listing someone is not an allegation.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <FilterLinks base="/admin/people" param="status" current={status} options={STATUSES} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search names" className="field max-w-xs" />{status && <input type="hidden" name="status" value={status} />}<button className="btn btn-sm">Search</button></form>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Table head={["Name", "Status", "Occupation", "Followers", "Updated"]}>
          {(people ?? []).map((p) => (
            <tr key={p.id}>
              <Td><Link className="link font-semibold" href={`/admin/people/${p.id}`}>{p.name}</Link>{p.is_demo && <span className="meta ml-2">DEMO</span>}</Td>
              <Td mono>{p.status.replace("_", " ")}</Td>
              <Td>{p.occupation ?? "—"}</Td>
              <Td mono>{p.follower_count}</Td>
              <Td mono>{formatShortDate(p.updated_at)}</Td>
            </tr>
          ))}
        </Table>
        <Panel title="Add a person">
          <form action={createPerson} className="space-y-3">
            <Return to="/admin/people" />
            <Field label="Name" name="name" required />
            <Field label="Address (slug)" name="slug" help="Leave blank to generate from the name." />
            <Field label="Occupation" name="occupation" />
            <SelectField label="Status" name="status" options={STATUSES} defaultValue="draft" />
            <Submit>Add person</Submit>
          </form>
        </Panel>
      </div>
    </div>
  );
}
