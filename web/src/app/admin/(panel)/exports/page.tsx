import type { Metadata } from "next";
import { requireStaff } from "@/lib/admin/auth";
import { EXPORTS } from "@/lib/admin/exports";
import { AdminTitle } from "@/components/admin/ui";

export const metadata: Metadata = { title: "CSV exports" };

export default async function ExportsPage() {
  await requireStaff(["admin"], "/admin/exports");
  return (
    <>
      <AdminTitle
        title="CSV exports"
        intro="Download spreadsheets for bookkeeping and review. Files open in Excel, Numbers or Google Sheets. Cells that look like formulas are made safe so they can't run."
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {EXPORTS.map((e) => (
          <li key={e.kind} className="card grid content-start gap-2 p-4">
            <h2 className="font-semibold">{e.title}</h2>
            <p className="text-sm text-ink-soft">{e.description}</p>
            <p>
              <a href={`/admin/exports/${e.kind}`} className="btn btn-outline px-3 py-1.5 text-sm" download>
                Download {e.kind}.csv
              </a>
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-soft">Each export is limited to the most recent 10,000 rows and is recorded in the audit log.</p>
    </>
  );
}
