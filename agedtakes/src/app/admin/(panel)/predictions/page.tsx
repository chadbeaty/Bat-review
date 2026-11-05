import Link from "next/link";
import { AdminHeader, FilterLinks, Flash, Table, Td, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { PREDICTION_STATUSES, PREDICTION_STATUS_LABELS, type PredictionStatus } from "@/lib/editorial";
import { formatShortDate } from "@/lib/format";

export const metadata = { title: "Predictions" };

export default async function Predictions({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const status = sp1(sp.status);
  const proposedOnly = sp1(sp.outcomes) === "proposed";
  let q = db.from("predictions").select("id, prediction_text, deadline, status, visibility, price_provider, person:people(name), outcomes:prediction_outcomes(status)").order("deadline", { ascending: true, nullsFirst: false }).limit(300);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).filter((p) => !proposedOnly || (p.outcomes as { status: string }[]).some((o) => o.status === "proposed"));
  return (
    <div>
      <AdminHeader kicker="Record" title="Predictions">Original wording, target, deadline and resolution criteria are locked once public. Outcomes are proposed (by the agent or a researcher) and confirmed only by an editor.</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <FilterLinks base="/admin/predictions" param="status" current={status} options={PREDICTION_STATUSES.map((s) => [s, PREDICTION_STATUS_LABELS[s]] as const)} />
      <Link href="/admin/predictions?outcomes=proposed" className={`btn btn-sm mb-4 ${proposedOnly ? "" : "btn-ghost"}`}>Outcomes awaiting confirmation</Link>
      <Table head={["Prediction", "Person", "Deadline", "Status", "Visibility"]}>
        {rows.map((p) => {
          const pending = (p.outcomes as { status: string }[]).filter((o) => o.status === "proposed").length;
          return (
            <tr key={p.id}>
              <Td><Link className="link" href={`/admin/predictions/${p.id}`}>“{p.prediction_text.slice(0, 100)}”</Link>{pending > 0 && <span className="meta ml-2 !text-amber">{pending} outcome to confirm</span>}</Td>
              <Td>{(p.person as unknown as { name: string } | null)?.name}</Td>
              <Td mono>{formatShortDate(p.deadline)}{p.status === "open" && p.deadline && p.deadline < today ? " · due" : ""}</Td>
              <Td mono>{PREDICTION_STATUS_LABELS[p.status as PredictionStatus]}</Td>
              <Td mono>{p.visibility}{p.price_provider ? ` · ${p.price_provider}` : ""}</Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
