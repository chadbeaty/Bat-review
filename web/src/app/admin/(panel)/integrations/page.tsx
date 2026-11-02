import type { Metadata } from "next";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { integrationStatus } from "@/lib/env";
import { AdminTitle, Badge, Table, dateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await requireStaff(["admin"], "/admin/integrations");
  // Only whether each variable is set is shown. Values never leave the server.
  const status = integrationStatus().map((i) => ({
    id: i.id,
    name: i.name,
    phase: i.phase,
    configured: i.configured,
    vars: i.vars.map((v) => ({ name: v, set: Boolean(process.env[v]) })),
  }));
  const { data: emails } = await adminDb().from("email_deliveries").select("template, status, provider, created_at").order("created_at", { ascending: false }).limit(10);

  return (
    <>
      <AdminTitle
        title="Integrations"
        intro="Which outside services have their keys set on this deployment. Values are never shown here; change them in your hosting provider's environment settings."
      />
      <Table label="Integrations">
        <thead>
          <tr>
            <th>Service</th>
            <th>Needed from</th>
            <th>Status</th>
            <th>Environment variables</th>
          </tr>
        </thead>
        <tbody>
          {status.map((i) => (
            <tr key={i.id}>
              <td className="font-medium">{i.name}</td>
              <td>Phase {i.phase}</td>
              <td>
                <Badge tone={i.configured ? "good" : "warn"}>{i.configured ? "Configured" : "Not configured"}</Badge>
              </td>
              <td>
                <ul className="grid gap-0.5">
                  {i.vars.map((v) => (
                    <li key={v.name} className="font-mono text-xs">
                      {v.name}: {v.set ? "set" : "missing"}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <section className="grid gap-2">
        <h2 className="font-semibold">Recent emails</h2>
        <p className="text-sm text-ink-soft">
          Without a Resend key, emails are logged as &ldquo;not sent&rdquo; instead of being delivered. Account emails (sign-up and password reset) are sent by
          Supabase and don&apos;t appear here.
        </p>
        {(emails ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No emails yet.</p>
        ) : (
          <Table label="Recent emails">
            <thead>
              <tr>
                <th>When</th>
                <th>Template</th>
                <th>Provider</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {(emails ?? []).map((e, i) => (
                <tr key={i}>
                  <td>{dateTime(e.created_at)}</td>
                  <td className="font-mono">{e.template}</td>
                  <td>{e.provider}</td>
                  <td>
                    <Badge tone={e.status === "sent" ? "good" : e.status === "failed" ? "bad" : "warn"}>{e.status.replace("_", " ")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
