import { AdminHeader, Flash, Panel, Return, Submit, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { peopleOptions, sourceOptions } from "@/lib/admin/queries";
import { createStatement } from "../actions";
import { StatementFields } from "../StatementFields";

export const metadata = { title: "Record a statement" };

export default async function NewStatement({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const sp = await searchParams;
  const [people, sources] = await Promise.all([peopleOptions(staff), sourceOptions(staff)]);
  return (
    <div className="max-w-4xl">
      <AdminHeader kicker="Statements" title="Record a statement">Add the source first (Evidence → Add a source) so the quote can be linked and verified.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <Panel title="Statement">
        <form action={createStatement} className="space-y-4">
          <Return to="/admin/statements/new" />
          <StatementFields s={{ person_id: sp1(sp.person) ?? null }} people={people} sources={sources} />
          <Submit>Record statement</Submit>
        </form>
      </Panel>
    </div>
  );
}
