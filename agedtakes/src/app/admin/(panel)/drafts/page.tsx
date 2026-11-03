import { AdminHeader, Flash, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { CASE_COLUMNS, CaseTable, type CaseRow } from "../cases/CaseTable";

export const metadata = { title: "AI-generated drafts" };

export default async function Drafts({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const { data } = await db.from("cases").select(CASE_COLUMNS).eq("ai_generated", true).not("status", "in", "(published,archived,rejected)").order("last_updated_at", { ascending: false }).limit(200);
  return (
    <div>
      <AdminHeader kicker="Newsroom" title="AI-generated drafts">
        Cases the research engine discovered or drafted. Each one is a lead, not a finding: open the sources, check the flagged quotes and language, and complete the legal checklist before approving.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <CaseTable rows={(data ?? []) as unknown as CaseRow[]} empty="No AI drafts waiting." />
    </div>
  );
}
