import { AdminHeader, Flash, Return, Submit, Table, Td, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { formatDateTime } from "@/lib/format";
import { runMonitorNow } from "../pipeline-actions";

export const metadata = { title: "Ingestion jobs" };
export const maxDuration = 300;

export default async function Ingestion({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const { data } = await db.from("ingestion_jobs").select("*, source:monitored_sources(label)").order("started_at", { ascending: false }).limit(200);
  return (
    <div>
      <AdminHeader kicker="Pipeline" title="Ingestion jobs" actions={<form action={runMonitorNow}><Return to="/admin/ingestion" /><input type="hidden" name="from_ingestion" value="on" /><Submit small>Run monitor now</Submit></form>}>
        Every connector run, with what it found. Scheduled daily by Vercel Cron (see vercel.json).
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <Table head={["Started", "Source", "Connector", "Trigger", "Status", "Found / new", "Message", "Duration"]}>
        {(data ?? []).map((j) => (
          <tr key={j.id}>
            <Td mono>{formatDateTime(j.started_at)}</Td>
            <Td>{(j.source as unknown as { label: string } | null)?.label ?? "—"}</Td>
            <Td mono>{j.connector}</Td>
            <Td mono>{j.triggered_by}</Td>
            <Td mono>{j.status}</Td>
            <Td mono>{j.items_found} / {j.items_new}</Td>
            <Td className="max-w-sm text-sm">{j.error_message}</Td>
            <Td mono>{j.finished_at ? `${Math.round((new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) / 1000)}s` : "running"}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
