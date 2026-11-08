import type { Metadata } from "next";
import { Card, PageHeader, Stat } from "@/components/ui";
import { requireOwner } from "@/lib/auth/member";
import { startOfUtcDay, startOfUtcMonth } from "@/lib/ai/client";
import { loadSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Usage & costs" };

const YT_DAILY_QUOTA = 10_000;
const RESEND_MONTHLY_FREE = 3_000;
const RESEND_DAILY_FREE = 100;

export default async function UsagePage() {
  const { db } = await requireOwner("/admin/usage");
  const today = startOfUtcDay();
  const month = startOfUtcMonth();
  // YouTube quota resets at midnight Pacific time; this approximates it with the UTC day.
  const [settings, { data: aiMonth }, { data: usage }] = await Promise.all([
    loadSettings(db),
    db.from("ai_runs").select("task, model, estimated_cost, input_tokens, output_tokens, status, created_at").gte("created_at", month).limit(10000),
    db.from("api_usage").select("provider, operation, units, created_at").gte("created_at", month).limit(10000),
  ]);
  const runs = aiMonth ?? [];
  const sum = (xs: { estimated_cost: unknown }[]) => xs.reduce((a, r) => a + Number(r.estimated_cost ?? 0), 0);
  const spentMonth = sum(runs);
  const spentToday = sum(runs.filter((r) => (r.created_at as string) >= today));
  const byTask = new Map<string, { calls: number; cost: number; inTok: number; outTok: number; failed: number }>();
  for (const r of runs) {
    const t = byTask.get(r.task as string) ?? { calls: 0, cost: 0, inTok: 0, outTok: 0, failed: 0 };
    t.calls++;
    t.cost += Number(r.estimated_cost ?? 0);
    t.inTok += Number(r.input_tokens ?? 0);
    t.outTok += Number(r.output_tokens ?? 0);
    if (r.status !== "succeeded") t.failed++;
    byTask.set(r.task as string, t);
  }
  const u = usage ?? [];
  const units = (provider: string, since: string) => u.filter((x) => x.provider === provider && (x.created_at as string) >= since).reduce((a, x) => a + Number(x.units), 0);
  const ytToday = units("youtube", today);
  const emailsMonth = units("resend", month);
  const emailsToday = units("resend", today);

  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = Math.max(1, (now.getTime() - new Date(month).getTime()) / 86400_000);
  const projectedAi = (spentMonth / daysElapsed) * daysInMonth;
  const fixed = settings.fixed_costs;
  const fixedTotal = fixed.vercel + fixed.supabase + fixed.resend + fixed.other;
  const projected = projectedAi + fixedTotal;

  return (
    <>
      <PageHeader title="Usage & costs" subtitle="API consumption and estimated operating cost this month (UTC). AI costs are estimated from token counts at list prices." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="AI spend today" value={`$${spentToday.toFixed(2)}`} hint={`Daily cap $${settings.ai.daily_budget_usd.toFixed(2)}`} />
        <Stat label="AI spend this month" value={`$${spentMonth.toFixed(2)}`} hint={`Monthly cap $${settings.ai.monthly_budget_usd.toFixed(2)}`} />
        <Stat label="YouTube quota today" value={`${ytToday.toLocaleString()} units`} hint={`of ${YT_DAILY_QUOTA.toLocaleString()} free per day`} />
        <Stat label="Emails this month" value={emailsMonth} hint={`${emailsToday} today · free plan ${RESEND_DAILY_FREE}/day, ${RESEND_MONTHLY_FREE.toLocaleString()}/month`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Projected monthly operating cost" subtitle="Fixed costs are what you entered in Settings; AI is projected from this month's pace.">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              <tr><td className="py-1.5">Claude API ({settings.ai.model})</td><td className="tabular text-right">${projectedAi.toFixed(2)}</td></tr>
              <tr><td className="py-1.5">Vercel</td><td className="tabular text-right">${fixed.vercel.toFixed(2)}</td></tr>
              <tr><td className="py-1.5">Supabase</td><td className="tabular text-right">${fixed.supabase.toFixed(2)}</td></tr>
              <tr><td className="py-1.5">Resend</td><td className="tabular text-right">${fixed.resend.toFixed(2)}</td></tr>
              <tr><td className="py-1.5">Other</td><td className="tabular text-right">${fixed.other.toFixed(2)}</td></tr>
              <tr className="font-semibold"><td className="py-1.5">Total</td><td className="tabular text-right">${projected.toFixed(2)}</td></tr>
            </tbody>
          </table>
          <p className={`mt-2 text-xs ${projected > 50 ? "text-bad" : "text-muted"}`}>Target: under $50/month. {projected > 50 ? "Over target: lower the AI budget or switch the model in Settings." : "Within target."}</p>
        </Card>
        <Card title="AI calls this month by task">
          {byTask.size ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-left font-medium">Task</th><th className="text-right font-medium">Calls</th><th className="text-right font-medium">Failed</th><th className="text-right font-medium">Tokens in/out</th><th className="text-right font-medium">Cost</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...byTask.entries()].map(([task, t]) => (
                  <tr key={task}><td className="py-1.5">{task.replace(/_/g, " ")}</td><td className="tabular text-right">{t.calls}</td><td className="tabular text-right">{t.failed}</td><td className="tabular text-right">{(t.inTok / 1000).toFixed(0)}k / {(t.outTok / 1000).toFixed(0)}k</td><td className="tabular text-right">${t.cost.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No AI calls this month.</p>
          )}
        </Card>
      </div>
    </>
  );
}
