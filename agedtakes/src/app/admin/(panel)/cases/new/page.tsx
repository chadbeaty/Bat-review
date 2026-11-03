import { AdminHeader, Field, Flash, Panel, Return, SelectField, Submit, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { peopleOptions } from "@/lib/admin/queries";
import { CASE_TYPES, CASE_TYPE_LABELS } from "@/lib/editorial";
import { createCase } from "../actions";

export const metadata = { title: "New case" };

export default async function NewCase({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const sp = await searchParams;
  const people = await peopleOptions(staff);
  return (
    <div className="max-w-3xl">
      <AdminHeader kicker="Cases" title="Open a new case">Start with a working headline. You&apos;ll add the statement, evidence, timeline and article on the next screen.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <Panel title="Case">
        <form action={createCase} className="grid gap-4 md:grid-cols-2">
          <Return to="/admin/cases/new" />
          <div className="md:col-span-2"><Field label="Working headline" name="title" required /></div>
          <Field label="Address (slug)" name="slug" help="Leave blank to generate from the headline." />
          <SelectField label="Case type" name="case_type" options={CASE_TYPES.map((t) => [t, CASE_TYPE_LABELS[t]] as const)} />
          <div className="md:col-span-2"><SelectField label="Subject" name="person_id" options={people} defaultValue={sp1(sp.person)} required empty="Choose…" /></div>
          <div className="md:col-span-2"><Submit>Open case</Submit></div>
        </form>
      </Panel>
    </div>
  );
}
