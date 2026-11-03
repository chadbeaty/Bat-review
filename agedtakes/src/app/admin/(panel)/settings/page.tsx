import { AdminHeader, Check, Field, Flash, Panel, Return, SelectField, Submit, Table, Td, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { integrationStatus, aiConfig, siteUrl } from "@/lib/env";
import { addMethodologyVersion, deleteDemoData, saveSettings, setRole } from "../system-actions";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("admin");
  const sp = await searchParams;
  const [{ data: settings }, { data: staff }] = await Promise.all([
    db.from("site_settings").select("key, value, description"),
    db.from("profiles").select("id, email, role, status").neq("role", "reader").order("role"),
  ]);
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
  const desc = Object.fromEntries((settings ?? []).map((r) => [r.key, r.description]));
  return (
    <div className="space-y-6">
      <AdminHeader kicker="System" title="Settings" />
      <Flash flash={readFlash(sp)} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Publication settings">
          <form action={saveSettings} className="space-y-3">
            <Return to="/admin/settings" />
            {["show_demo_content", "staff_mfa_required", "ai_research_enabled", "newsletter_enabled", "submissions_enabled"].map((k) => <Check key={k} label={k.replace(/_/g, " ")} name={k} defaultChecked={s[k] === true} help={desc[k] ?? undefined} />)}
            <Field label="AI daily budget (USD, estimated)" name="ai_daily_budget_usd" defaultValue={String(s.ai_daily_budget_usd ?? 5)} />
            <Field label="Current methodology version" name="methodology_version" defaultValue={String(s.methodology_version ?? "1.0")} />
            <Submit small>Save settings</Submit>
          </form>
        </Panel>
        <Panel title="Staff and roles">
          <Table head={["Email", "Role", "Status"]}>{(staff ?? []).map((p) => <tr key={p.id}><Td mono>{p.email}</Td><Td mono>{p.role}</Td><Td mono>{p.status}</Td></tr>)}</Table>
          <form action={setRole} className="mt-4 grid gap-3 md:grid-cols-3">
            <Return to="/admin/settings" />
            <Field label="Email (must have signed in once)" name="email" required />
            <SelectField label="Role" name="role" options={[["researcher", "Researcher"], ["editor", "Editor"], ["admin", "Admin"], ["reader", "Remove staff access"]]} />
            <SelectField label="Status" name="status" options={[["active", "Active"], ["suspended", "Suspended"]]} />
            <div className="md:col-span-3"><Submit small>Save role</Submit></div>
          </form>
          <p className="meta mt-3">Researchers draft and research. Editors also approve, publish, correct and send newsletters. Admins also manage settings, roles, subscribers and the audit log.</p>
        </Panel>
        <Panel title="Integrations" note={siteUrl}>
          <Table head={["Integration", "Status", "Variables"]}>
            {integrationStatus().map((i) => <tr key={i.id}><Td><strong>{i.name}</strong>{i.required ? " *" : ""}<div className="meta">{i.purpose}</div><div className="meta">Get it: {i.getFrom}</div></Td><Td mono>{i.configured ? "configured" : "missing"}</Td><Td mono>{i.vars.join(", ")}</Td></tr>)}
          </Table>
          <p className="meta mt-2">AI model: {aiConfig.model}. Values are set in Vercel → Project → Settings → Environment Variables, never here.</p>
        </Panel>
        <Panel title="Methodology versions">
          <form action={addMethodologyVersion} className="space-y-3">
            <Return to="/admin/settings" />
            <Field label="Version" name="version" required placeholder="1.1" />
            <Field label="Effective date" name="effective_at" type="date" required />
            <Field label="What changed (public)" name="summary" rows={3} required />
            <Submit small>Record version</Submit>
          </form>
        </Panel>
        <Panel title="Delete demo data" tone="warn">
          <form action={deleteDemoData} className="space-y-3">
            <Return to="/admin/settings" />
            <p className="text-sm">Permanently removes every record marked DEMO ONLY and turns off demo content. Do this before launch.</p>
            <Field label='Type "DELETE DEMO DATA"' name="confirm" />
            <Submit small tone="red">Delete demo data</Submit>
          </form>
        </Panel>
      </div>
    </div>
  );
}
