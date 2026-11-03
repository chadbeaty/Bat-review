import { AdminHeader, Flash, Panel, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { CASE_COLUMNS, CaseTable, type CaseRow } from "../cases/CaseTable";

export const metadata = { title: "Editorial approvals" };

export default async function Approvals({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const [review, approved, disputed] = await Promise.all([
    db.from("cases").select(CASE_COLUMNS).eq("status", "needs_review").order("last_updated_at"),
    db.from("cases").select(CASE_COLUMNS).eq("status", "approved").order("last_updated_at"),
    db.from("cases").select(CASE_COLUMNS).eq("status", "disputed").order("last_updated_at"),
  ]);
  return (
    <div className="space-y-6">
      <AdminHeader kicker="Newsroom" title="Editorial approvals">Approve only what the evidence supports. Publishing is a separate, confirmed step.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <Panel title="Needs review" note={`${review.data?.length ?? 0}`}><CaseTable rows={(review.data ?? []) as unknown as CaseRow[]} empty="Nothing waiting for review." /></Panel>
      <Panel title="Approved — ready to publish" note={`${approved.data?.length ?? 0}`}><CaseTable rows={(approved.data ?? []) as unknown as CaseRow[]} empty="Nothing approved and unpublished." /></Panel>
      <Panel title="Disputed" note={`${disputed.data?.length ?? 0}`}><CaseTable rows={(disputed.data ?? []) as unknown as CaseRow[]} empty="No disputed cases." /></Panel>
    </div>
  );
}
