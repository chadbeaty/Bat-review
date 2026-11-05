import { AdminHeader, Check, Field, Flash, Panel, Return, SelectField, Submit, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { atLeast } from "@/lib/auth/roles";
import { peopleOptions } from "@/lib/admin/queries";
import { CONNECTORS } from "@/lib/connectors";
import { formatDateTime } from "@/lib/format";
import { deleteMonitoredSource, runMonitorNow, saveMonitoredSource } from "../pipeline-actions";

export const metadata = { title: "Sources" };
export const maxDuration = 300;

export default async function Sources({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("researcher");
  const sp = await searchParams;
  const [{ data: sources }, people] = await Promise.all([staff.db.from("monitored_sources").select("*").order("created_at"), peopleOptions(staff)]);
  const editor = atLeast(staff.role, "editor");
  const connectorOptions = Object.values(CONNECTORS).map((c) => [c.id, c.label] as const);
  return (
    <div className="space-y-6">
      <AdminHeader kicker="Pipeline" title="Monitored sources" actions={<form action={runMonitorNow}><Return to="/admin/sources" /><Submit small>Check all due sources now</Submit></form>}>
        What the Source Monitor checks. Connectors use official APIs and public feeds only; they never bypass paywalls, logins or site terms.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      {(sources ?? []).map((s) => {
        const c = CONNECTORS[s.connector];
        const missing = c?.requiresEnv.filter((v) => !process.env[v]) ?? [];
        return (
          <Panel key={s.id} title={`${s.label} · ${c?.label ?? s.connector}`} note={`${s.enabled ? "enabled" : "disabled"} · last checked ${formatDateTime(s.last_checked_at)}`} tone={s.last_error || missing.length ? "warn" : "default"}>
            {missing.length > 0 && <p className="mb-2 text-sm text-amber">Needs {missing.join(", ")} in the environment.</p>}
            {s.last_error && <p className="mb-2 text-sm text-red-ink">Last error: {s.last_error}</p>}
            <SourceForm s={s} people={people} connectors={connectorOptions} editor={editor} />
            <div className="mt-3 flex gap-2">
              <form action={runMonitorNow}><Return to="/admin/sources" /><input type="hidden" name="source_id" value={s.id} /><Submit small tone="ghost">Check now</Submit></form>
              {editor && <form action={deleteMonitoredSource}><Return to="/admin/sources" /><input type="hidden" name="source_id" value={s.id} /><Submit small tone="ghost">Remove</Submit></form>}
            </div>
          </Panel>
        );
      })}
      {editor && (
        <Panel title="Add a source">
          <SourceForm s={null} people={people} connectors={connectorOptions} editor />
        </Panel>
      )}
      <Panel title="Available connectors">
        <dl className="space-y-3 text-sm">
          {Object.values(CONNECTORS).map((c) => (
            <div key={c.id}>
              <dt className="font-semibold">{c.label} <span className="meta">({c.id}){c.requiresEnv.length ? ` · needs ${c.requiresEnv.join(", ")}` : ""}</span></dt>
              <dd className="text-ink-2">{c.description} <span className="meta">Example config: {JSON.stringify(c.exampleConfig)}. {c.terms}</span></dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

function SourceForm({ s, people, connectors, editor }: { s: Record<string, unknown> | null; people: [string, string][]; connectors: readonly (readonly [string, string])[]; editor: boolean }) {
  return (
    <form action={saveMonitoredSource} className="grid gap-3 md:grid-cols-3">
      <Return to="/admin/sources" />
      {s && <input type="hidden" name="source_id" value={String(s.id)} />}
      <SelectField label="Connector" name="connector" options={connectors} defaultValue={(s?.connector as string) ?? "rss"} />
      <Field label="Label" name="label" defaultValue={(s?.label as string) ?? ""} required />
      <SelectField label="About a person (optional)" name="person_id" options={people} defaultValue={(s?.person_id as string) ?? null} empty="—" />
      <div className="md:col-span-2"><Field label="Configuration (JSON)" name="config" defaultValue={JSON.stringify(s?.config ?? {})} help='e.g. {"url": "https://…/feed.xml"} or {"cik": "0001067983", "forms": ["4"]}' /></div>
      <Field label="Check every (hours)" name="check_interval_hours" defaultValue={(s?.check_interval_hours as number) ?? 24} />
      <Check label="Enabled" name="enabled" defaultChecked={Boolean(s?.enabled ?? true)} />
      {editor && <div className="md:col-span-3"><Submit small>{s ? "Save" : "Add source"}</Submit></div>}
    </form>
  );
}
