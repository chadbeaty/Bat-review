import Link from "next/link";
import type { Prediction } from "@/lib/data/types";
import { formatDate, formatMoney, formatNumber, formatShortDate } from "@/lib/format";
import { DemoBadge, PredictionStatusBadge, SourceLine } from "@/components/ui";

function target(p: Prediction): string {
  if (p.target_value === null || p.target_value === undefined) return p.target_direction === "event_occurs" ? "Event occurs" : "See criteria";
  const v = p.target_currency && /^[A-Z]{3}$/.test(p.target_currency) ? formatMoney(p.target_value, p.target_currency) : formatNumber(p.target_value);
  const dir = p.target_direction === "at_or_below" ? "≤ " : p.target_direction === "at_or_above" ? "≥ " : "";
  return `${dir}${v}`;
}

/** Whether an open prediction's deadline has passed (it then awaits resolution — it is never "incorrect" by default). */
export function awaitingResolution(p: Prediction, now = new Date()): boolean {
  return p.status === "open" && Boolean(p.deadline) && new Date(`${p.deadline}T23:59:59Z`) < now;
}

export function PredictionCard({ p, showPerson = true }: { p: Prediction; showPerson?: boolean }) {
  return (
    <article className="grid gap-4 border-t border-rule py-6 md:grid-cols-[1fr_15rem]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <PredictionStatusBadge status={p.status} />
          {awaitingResolution(p) && <span className="meta !text-amber">Deadline passed · awaiting resolution</span>}
          {p.is_demo && <DemoBadge />}
        </div>
        <p className="headline text-xl !font-medium sm:text-2xl">
          <span className="text-red">“</span>{p.statement?.exact_quote ?? p.prediction_text}<span className="text-red">”</span>
        </p>
        <p className="meta mt-2">
          {showPerson && p.person && (
            <>
              <Link href={`/people/${p.person.slug}`} className="link !text-ink">{p.person.name}</Link>
              {" · "}
            </>
          )}
          Said {formatDate(p.prediction_date)}
        </p>
        <div className="mt-2">
          <SourceLine source={p.statement?.source} timecode={p.statement?.source_timecode} />
        </div>
        {p.outcome && (
          <div className="mt-4 border-l-[3px] border-ink pl-3">
            <p className="kicker mb-1">Outcome</p>
            <p className="text-ink-2">{p.outcome}</p>
            {p.outcome_source && <div className="mt-1"><SourceLine source={p.outcome_source} /></div>}
            {p.early_resolution_reason && <p className="meta mt-1">Resolved before the deadline because: {p.early_resolution_reason}</p>}
          </div>
        )}
        {p.case_slug && (
          <Link href={`/cases/${p.case_slug}`} className="meta link mt-3 inline-block !text-red-ink">Read the investigation →</Link>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 self-start border border-rule bg-paper-2/50 p-3 text-sm md:grid-cols-1">
        <Fact label="Subject" value={p.asset ?? "—"} />
        <Fact label="Target" value={target(p)} />
        <Fact label="Deadline" value={p.deadline ? formatShortDate(p.deadline) : "None stated"} />
        <Fact label="Resolution" value={p.resolution_criteria ?? p.resolution_method ?? "—"} wide />
        {p.observation && (
          <Fact
            label="Observed"
            value={`${p.observation.observed_value !== null ? formatNumber(p.observation.observed_value) : "—"}${p.observation.observed_currency ? ` ${p.observation.observed_currency}` : ""} · ${p.observation.price_provider ?? "source"}${p.observation.observation_time ? ` · ${formatShortDate(p.observation.observation_time)} (${p.observation.timezone})` : ""}`}
            wide
          />
        )}
      </dl>
    </article>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 md:col-span-1" : ""}>
      <dt className="kicker !text-[0.625rem]">{label}</dt>
      <dd className="text-ink-2">{value}</dd>
    </div>
  );
}

export function PredictionTable({ items }: { items: Prediction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-ink">
            <th className="kicker py-2 pr-4">Who</th>
            <th className="kicker py-2 pr-4">The call</th>
            <th className="kicker py-2 pr-4">Deadline</th>
            <th className="kicker py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-rule align-top">
              <td className="py-3 pr-4">
                {p.person && <Link className="link font-semibold" href={`/people/${p.person.slug}`}>{p.person.name}</Link>}
                {p.is_demo && <div className="mt-1"><DemoBadge /></div>}
              </td>
              <td className="py-3 pr-4 text-ink-2">“{p.prediction_text}”</td>
              <td className="meta py-3 pr-4 whitespace-nowrap">{p.deadline ? formatShortDate(p.deadline) : "—"}</td>
              <td className="py-3"><PredictionStatusBadge status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
