import { AdminHeader, Panel, Stat, Table, Td, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { aiConfig } from "@/lib/env";
import { MODEL_PRICES } from "@/lib/ai/pricing";
import { daysAgoIso, formatDateTime, formatUsd } from "@/lib/format";

export const metadata = { title: "AI usage and cost" };

export default async function AiUsage({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  await searchParams;
  const since = daysAgoIso(30);
  const [{ data: runs }, { data: budget }] = await Promise.all([
    db.from("ai_runs").select("id, agent, model, status, input_tokens, output_tokens, estimated_cost, duration_ms, error_message, created_at, case_id, prompt_version").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    db.from("site_settings").select("value").eq("key", "ai_daily_budget_usd").maybeSingle(),
  ]);
  const all = runs ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const sum = (rows: typeof all) => rows.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0);
  const todaySpend = sum(all.filter((r) => r.created_at.slice(0, 10) === today));
  const byAgent = new Map<string, { runs: number; cost: number; failed: number; tokens: number }>();
  for (const r of all) {
    const a = byAgent.get(r.agent) ?? { runs: 0, cost: 0, failed: 0, tokens: 0 };
    a.runs++; a.cost += Number(r.estimated_cost ?? 0); a.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0); if (r.status !== "succeeded") a.failed++;
    byAgent.set(r.agent, a);
  }
  const byDay = new Map<string, number>();
  for (const r of all) byDay.set(r.created_at.slice(0, 10), (byDay.get(r.created_at.slice(0, 10)) ?? 0) + Number(r.estimated_cost ?? 0));
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const price = MODEL_PRICES[aiConfig.model];
  return (
    <div className="space-y-6">
      <AdminHeader kicker="Pipeline" title="AI usage and cost">
        Estimated from token counts at list prices; your Anthropic invoice is authoritative. Model: <strong>{aiConfig.model}</strong>{price ? ` ($${price.input}/$${price.output} per million input/output tokens)` : ""}. {aiConfig.enabled ? "API key configured." : "No API key: AI jobs are paused."}
      </AdminHeader>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Today" value={formatUsd(todaySpend)} tone={todaySpend >= Number(budget?.value ?? 5) ? "warn" : undefined} />
        <Stat label="Daily budget" value={formatUsd(Number(budget?.value ?? 5))} href="/admin/settings" />
        <Stat label="Last 30 days" value={formatUsd(sum(all))} />
        <Stat label="Runs (30 days)" value={all.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="By agent (30 days)">
          <Table head={["Agent", "Runs", "Failed", "Tokens", "Cost"]}>
            {[...byAgent.entries()].map(([agent, a]) => <tr key={agent}><Td mono>{agent}</Td><Td mono>{a.runs}</Td><Td mono>{a.failed}</Td><Td mono>{a.tokens.toLocaleString()}</Td><Td mono>{formatUsd(a.cost)}</Td></tr>)}
          </Table>
        </Panel>
        <Panel title="By day">
          <Table head={["Day", "Cost"]}>{days.map(([d, c]) => <tr key={d}><Td mono>{d}</Td><Td mono>{formatUsd(c)}</Td></tr>)}</Table>
        </Panel>
      </div>
      <Panel title="Recent runs">
        <Table head={["When", "Agent", "Status", "Tokens in/out", "Cost", "Time", "Note"]}>
          {all.slice(0, 100).map((r) => (
            <tr key={r.id}>
              <Td mono>{formatDateTime(r.created_at)}</Td>
              <Td mono>{r.agent}{r.case_id ? <a className="link ml-1" href={`/admin/cases/${r.case_id}`}>case</a> : null}</Td>
              <Td mono>{r.status}</Td>
              <Td mono>{r.input_tokens}/{r.output_tokens}</Td>
              <Td mono>{formatUsd(Number(r.estimated_cost ?? 0))}</Td>
              <Td mono>{r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : "—"}</Td>
              <Td className="max-w-xs text-sm">{r.error_message ?? r.prompt_version}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
