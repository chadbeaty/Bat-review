import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Field, Flash, Panel, Return, SelectField, StatusPill, Submit, Table, Td, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { formatShortDate } from "@/lib/format";
import { deletePerson, updatePerson } from "../actions";

export const metadata = { title: "Edit person" };

export default async function EditPerson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { db, role } = await requireStaff("researcher");
  const { id } = await params;
  const sp = await searchParams;
  const [{ data: p }, { data: cats }, { data: mine }, { data: cases }, { data: statements }] = await Promise.all([
    db.from("people").select("*").eq("id", id).maybeSingle(),
    db.from("categories").select("id, name, kind").order("kind").order("sort_order"),
    db.from("person_categories").select("category_id").eq("person_id", id),
    db.from("cases").select("id, title, status").eq("person_id", id).order("updated_at", { ascending: false }),
    db.from("statements").select("id, exact_quote, visibility, verification_status").eq("person_id", id).order("published_at", { ascending: false }).limit(20),
  ]);
  if (!p) notFound();
  const selected = new Set((mine ?? []).map((m) => m.category_id));
  const back = `/admin/people/${id}`;

  return (
    <div>
      <AdminHeader kicker="People" title={p.name} actions={p.status === "active" ? <Link className="btn btn-ghost btn-sm" href={`/people/${p.slug}`}>View public profile</Link> : null}>
        {p.is_demo && <strong>DEMO record. </strong>}Status: {p.status.replace("_", " ")}.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Panel title="Profile">
          <form action={updatePerson} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={p.id} />
            <Return to={back} />
            <Field label="Name" name="name" defaultValue={p.name} required />
            <Field label="Address (slug)" name="slug" defaultValue={p.slug} required help="Changing it breaks existing links." />
            <Field label="Occupation" name="occupation" defaultValue={p.occupation} />
            <Field label="Organization" name="organization" defaultValue={p.organization} />
            <div className="md:col-span-2"><Field label="Short biography" name="biography" defaultValue={p.biography} rows={5} help="Neutral and factual. No claims without sources." /></div>
            <Field label="Photo URL (https)" name="image_url" defaultValue={p.image_url} help="Only images you have the right to use." />
            <Field label="Photo credit" name="image_credit" defaultValue={p.image_credit} help="Required when a photo is set." />
            <Field label="Photo license" name="image_license" defaultValue={p.image_license} placeholder="e.g. CC BY 2.0" />
            <Field label="Official website" name="website_url" defaultValue={p.website_url} />
            <SelectField label="Status" name="status" defaultValue={p.status} options={[["draft", "Draft"], ["research_candidate", "Research candidate"], ["active", "Active (public)"], ["archived", "Archived"]]} help={role === "researcher" ? "Only editors can make a profile public." : undefined} />
            <fieldset className="md:col-span-2">
              <legend className="label">Categories, industries and topics</legend>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {(cats ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="category" value={c.id} defaultChecked={selected.has(c.id)} /> {c.name} <span className="meta">{c.kind}</span></label>
                ))}
              </div>
            </fieldset>
            <div className="md:col-span-2"><Submit>Save profile</Submit></div>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Cases">
            <ul className="space-y-2">{(cases ?? []).map((c) => <li key={c.id} className="flex justify-between gap-2"><Link className="link" href={`/admin/cases/${c.id}`}>{c.title}</Link><StatusPill status={c.status} /></li>)}</ul>
            <Link className="btn btn-sm mt-3" href={`/admin/cases/new?person=${p.id}`}>New case</Link>
          </Panel>
          <Panel title="Recent statements">
            <Table head={["Quote", "Status"]}>
              {(statements ?? []).map((s) => <tr key={s.id}><Td><Link className="link" href={`/admin/statements/${s.id}`}>“{s.exact_quote.slice(0, 80)}”</Link></Td><Td mono>{s.visibility} · {s.verification_status}</Td></tr>)}
            </Table>
            <Link className="btn btn-sm mt-3" href={`/admin/statements/new?person=${p.id}`}>Record a statement</Link>
          </Panel>
          {role === "admin" && (
            <Panel title="Delete" tone="warn">
              <form action={deletePerson} className="space-y-2">
                <input type="hidden" name="id" value={p.id} /><Return to={back} />
                <p className="text-sm">Only possible when nothing references this person. Prefer “Archived”.</p>
                <Field label='Type "DELETE"' name="confirm" />
                <Submit tone="red" small>Delete person</Submit>
              </form>
            </Panel>
          )}
          <p className="meta">Created {formatShortDate(p.created_at)} · Updated {formatShortDate(p.updated_at)}</p>
        </div>
      </div>
    </div>
  );
}
