import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Flash, PageHeader, btn, input, label } from "@/components/ui";
import { requireOwner } from "@/lib/auth/member";
import { integrationStatus } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { loadSettings, type SettingKey } from "@/lib/settings";
import { addMember, memberAction, saveSetting } from "../actions";

export const metadata: Metadata = { title: "Settings" };

type Field = { name: string; label: string; help?: string; step?: string; percent?: boolean; type?: "text" | "number" | "checkbox" | "select"; options?: string[] };

const GROUPS: { key: SettingKey; title: string; subtitle: string; fields: Field[] }[] = [
  {
    key: "scoring_weights", title: "Scoring weights", subtitle: "How much each category counts toward the 0-100 opportunity score. Must add up to 100.",
    fields: [
      { name: "early_momentum", label: "Early momentum" }, { name: "demand_acceleration", label: "Demand acceleration" }, { name: "competition", label: "Competition" },
      { name: "organic_video_potential", label: "Organic video potential" }, { name: "problem_solving", label: "Problem-solving appeal" }, { name: "profit_potential", label: "Profit potential" },
    ],
  },
  {
    key: "alert_thresholds", title: "Alert thresholds", subtitle: "When instant alert emails go out. The same alert is not repeated unless something material changes.",
    fields: [
      { name: "score", label: "Alert at score", help: "Send an alert when a product reaches this score." },
      { name: "rescore_change_points", label: "Re-alert after a rise of", help: "Score points before a high-score alert repeats." },
      { name: "momentum_acceleration", label: "Momentum: acceleration ×", step: "0.1" },
      { name: "momentum_min_mentions_72h", label: "Momentum: min mentions in 72 h" },
      { name: "multi_source_min_platforms", label: "Multi-source: min platforms" },
      { name: "low_competition_min_score", label: "Low competition: min competition score" },
      { name: "strong_demand_min_score", label: "Strong demand: min demand score" },
      { name: "saturation_creators_7d", label: "Saturated at creators in 7 days", help: "Different creators promoting it within a week." },
      { name: "saturation_min_previous_score", label: "Saturation alert if it once scored", help: "Only alert about saturation for products that were promising." },
    ],
  },
  {
    key: "ai", title: "AI (Claude)", subtitle: "Model and hard spending caps. When a cap is reached, AI work pauses until the next day/month; nothing else stops.",
    fields: [
      { name: "model", label: "Model", type: "select", options: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"], help: "Opus 5.5 is the most accurate; Sonnet 5.5 and Haiku 5.5 cost about 2x and 40x less." },
      { name: "daily_budget_usd", label: "Daily budget ($)", step: "0.1" },
      { name: "monthly_budget_usd", label: "Monthly budget ($)", step: "1" },
      { name: "assess_min_prelim_score", label: "Assess products scoring at least", help: "Full AI assessment and video ideas only above this preliminary score." },
      { name: "reassess_after_days", label: "Re-assess after (days)", step: "0.5" },
      { name: "max_videos_per_run", label: "Max videos analysed per run" },
    ],
  },
  {
    key: "youtube", title: "YouTube monitoring", subtitle: "Each check costs about 2-3 of the 10,000 free daily quota units per creator.",
    fields: [
      { name: "poll_interval_hours", label: "Check each creator every (hours)", step: "0.5" },
      { name: "lookback_days", label: "Only consider uploads from the last (days)" },
      { name: "max_new_videos_per_creator", label: "Max new videos per creator per check" },
      { name: "stats_refresh_days", label: "Refresh view counts for videos up to (days old)" },
    ],
  },
  {
    key: "economics", title: "Margin assumptions", subtitle: "Used to turn price and cost estimates into an estimated gross margin.",
    fields: [
      { name: "payment_pct", label: "Payment processing (%)", step: "0.1", percent: true },
      { name: "payment_fixed", label: "Payment fixed fee ($)", step: "0.01" },
      { name: "refund_reserve_pct", label: "Refunds/chargebacks reserve (%)", step: "0.5", percent: true },
      { name: "other_pct", label: "Other costs (%)", step: "0.5", percent: true, help: "Apps, platform fees, packaging." },
      { name: "default_shipping", label: "Default shipping per order ($)", step: "0.5" },
    ],
  },
  { key: "digest", title: "Daily digest", subtitle: "The top opportunities email, sent about 11:30 UTC.", fields: [{ name: "enabled", label: "Send the daily digest", type: "checkbox" }, { name: "top_n", label: "Products in the digest" }] },
  {
    key: "fixed_costs", title: "Monthly fixed costs", subtitle: "What you pay for hosting, for the cost dashboard. $0 on the free plans.",
    fields: [{ name: "vercel", label: "Vercel ($)", step: "0.01" }, { name: "supabase", label: "Supabase ($)", step: "0.01" }, { name: "resend", label: "Resend ($)", step: "0.01" }, { name: "other", label: "Other ($)", step: "0.01" }],
  },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db, user } = await requireOwner("/admin/settings");
  const [settings, { data: members }] = await Promise.all([loadSettings(db), db.from("users").select("id, email, role, receives_alerts, receives_digest").order("created_at")]);
  const integrations = integrationStatus();

  return (
    <>
      <Flash flash={readFlash(sp)} />
      <PageHeader title="Settings" subtitle="Changes take effect on the next run and are recorded in the audit log." />

      <Card title="Connections" subtitle="Keys live in Vercel → Project → Settings → Environment Variables, never in the browser." className="mb-4">
        <ul className="divide-y divide-line text-sm">
          {integrations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div>
                <p className="font-medium">{i.name} {i.configured ? <Badge tone="good">connected</Badge> : <Badge tone={i.required ? "bad" : "warn"}>missing</Badge>}</p>
                <p className="text-xs text-muted">{i.purpose} Get it: {i.getFrom}. Cost: {i.cost}.</p>
              </div>
              <code className="text-[11px] text-muted">{i.vars.join(", ")}</code>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const values = settings[g.key] as Record<string, unknown>;
          return (
            <Card key={g.key} title={g.title} subtitle={g.subtitle}>
              <form action={saveSetting} className="grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="key" value={g.key} />
                {g.fields.map((f) => {
                  const v = values[f.name];
                  const id = `${g.key}-${f.name}`;
                  if (f.type === "checkbox") {
                    return (
                      <label key={f.name} className="col-span-2 flex items-center gap-2 text-sm" htmlFor={id}>
                        <input id={id} type="checkbox" name={f.name} defaultChecked={v === true} /> {f.label}
                      </label>
                    );
                  }
                  return (
                    <div key={f.name}>
                      <label className={label} htmlFor={id}>{f.label}</label>
                      {f.type === "select" ? (
                        <select id={id} name={f.name} defaultValue={String(v)} className={input}>
                          {[...new Set([String(v), ...(f.options ?? [])])].map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input id={id} name={f.name} type="number" step={f.step ?? "1"} min="0" defaultValue={f.percent ? Math.round(Number(v) * 1000) / 10 : String(v)} className={input} required />
                      )}
                      {f.help && <p className="mt-0.5 text-[11px] text-muted">{f.help}</p>}
                    </div>
                  );
                })}
                <div className="col-span-2"><SubmitButton className={btn.primary}>Save</SubmitButton></div>
              </form>
            </Card>
          );
        })}

        <Card title="People with access" subtitle="Members can see everything and keep their own watchlist; only the owner can change settings.">
          <ul className="mb-3 divide-y divide-line text-sm">
            {(members ?? []).map((m) => (
              <li key={m.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{m.email as string} <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{m.role as string}</Badge></span>
                <span className="flex gap-1">
                  {(["toggle_alerts", "toggle_digest"] as const).map((op) => (
                    <form key={op} action={memberAction}>
                      <input type="hidden" name="id" value={m.id as string} />
                      <input type="hidden" name="op" value={op} />
                      <SubmitButton className={btn.small}>{op === "toggle_alerts" ? `Alerts ${m.receives_alerts ? "on" : "off"}` : `Digest ${m.receives_digest ? "on" : "off"}`}</SubmitButton>
                    </form>
                  ))}
                  {m.id !== user.id && (
                    <form action={memberAction}>
                      <input type="hidden" name="id" value={m.id as string} />
                      <input type="hidden" name="op" value="remove" />
                      <SubmitButton className={btn.danger} confirm="Remove this person's access?">Remove</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <form action={addMember} className="flex gap-2">
            <input name="email" type="email" required placeholder="name@example.com" className={input} />
            <SubmitButton className={btn.secondary}>Give access</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
