import Link from "next/link";
import { AdminHeader, FilterLinks, Flash, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { CASE_STATUSES, CASE_STATUS_LABELS } from "@/lib/editorial";
import { CASE_COLUMNS, CaseTable, type CaseRow } from "./CaseTable";

export const metadata = { title: "Cases" };

export default async function Cases({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const status = sp1(sp.status);
  const q = sp1(sp.q);
  let query = db.from("cases").select(CASE_COLUMNS).order("last_updated_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  return (
    <div>
      <AdminHeader kicker="Newsroom" title="Cases" actions={<Link className="btn btn-sm" href="/admin/cases/new">New case</Link>}>
        Discovered → Researching → Evidence gathering → Draft ready → Needs review → Approved → Published.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <FilterLinks base="/admin/cases" param="status" current={status} options={CASE_STATUSES.map((s) => [s, CASE_STATUS_LABELS[s]] as const)} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search headlines" className="field max-w-xs" /><button className="btn btn-sm">Search</button></form>
      <CaseTable rows={(data ?? []) as unknown as CaseRow[]} />
    </div>
  );
}
