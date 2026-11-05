import Link from "next/link";
import { AdminHeader, Table, Td } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Corrections" };

export default async function Corrections() {
  const { db } = await requireStaff("researcher");
  const { data } = await db.from("corrections").select("*, case:cases(id, title), prediction:predictions(id, prediction_text), statement:statements(id, exact_quote)").order("created_at", { ascending: false }).limit(300);
  return (
    <div>
      <AdminHeader kicker="Record" title="Corrections">
        Append-only. Corrections are made from the case, statement or prediction page and appear on the public <Link className="link" href="/corrections">corrections log</Link>.
      </AdminHeader>
      <Table head={["When", "Record", "Field", "Reason", "Public"]}>
        {(data ?? []).map((k) => {
          const c = k.case as { id: string; title: string } | null;
          const p = k.prediction as { id: string; prediction_text: string } | null;
          const s = k.statement as { id: string; exact_quote: string } | null;
          return (
            <tr key={k.id}>
              <Td mono>{formatDateTime(k.created_at)}</Td>
              <Td>{c ? <Link className="link" href={`/admin/cases/${c.id}`}>{c.title}</Link> : p ? <Link className="link" href={`/admin/predictions/${p.id}`}>Prediction: {p.prediction_text.slice(0, 60)}</Link> : s ? <Link className="link" href={`/admin/statements/${s.id}`}>Statement: {s.exact_quote.slice(0, 60)}</Link> : "—"}</Td>
              <Td mono>{k.field}</Td>
              <Td className="max-w-md text-sm">{k.reason}</Td>
              <Td mono>{k.is_public ? "yes" : "internal"}</Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
