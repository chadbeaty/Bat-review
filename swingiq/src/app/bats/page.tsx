"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { Button, Empty, Meter, PageSkeleton, PageTitle, Panel, SectionTitle, Stat } from "@/components/ui";
import { CATEGORY_LABEL } from "@/engine/scoring";
import type { ScoreCategoryKey } from "@/engine/types";
import { MIN_SWINGS_TO_COMPARE, batStats, type BatStats } from "@/lib/batdna";
import { db, uid } from "@/lib/store/db";
import { BALANCE_LABEL, type Bat, type BatBalance, type Session, type SwingRecord } from "@/lib/store/types";

const CERTS = ["USSSA", "USA/ASA", "NSA", "ISA", "SSUSA (senior)", "Multi-stamp", "Other"];

export default function BatsPage() {
  const { ready, player } = usePlayers();
  const [bats, setBats] = useState<Bat[]>([]);
  const [swings, setSwings] = useState<SwingRecord[]>([]);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ brand: "", model: "", lengthIn: "34", weightOz: "", certification: "USSSA", balance: "unknown" as BatBalance });
  const [err, setErr] = useState<string | null>(null);
  const [cmp, setCmp] = useState<[string, string] | null>(null);

  const load = useCallback(async () => {
    if (!player) return;
    const [bs, sw, ss] = await Promise.all([db.bats(player.id), db.swingsForPlayer(player.id), db.sessions(player.id)]);
    setBats(bs);
    setSwings(sw);
    setSessions(new Map(ss.map((s) => [s.id, s])));
  }, [player]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => {});
  }, [load]);

  const stats = useMemo(() => Object.fromEntries(bats.map((b) => [b.id, batStats(b, swings, sessions)])), [bats, swings, sessions]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    if (!form.brand.trim() || !form.model.trim()) return setErr("Brand and model, please.");
    const len = form.lengthIn ? Number(form.lengthIn) : null;
    const wt = form.weightOz ? Number(form.weightOz) : null;
    if (len !== null && (len < 24 || len > 36)) return setErr("Length should be 24–36 in.");
    if (wt !== null && (wt < 18 || wt > 34)) return setErr("Weight should be 18–34 oz.");
    setErr(null);
    await db.saveBat({
      id: uid(),
      playerId: player.id,
      brand: form.brand.trim().slice(0, 40),
      model: form.model.trim().slice(0, 60),
      lengthIn: len,
      weightOz: wt,
      certification: form.certification,
      balance: form.balance,
      createdAt: Date.now(),
    });
    setForm({ brand: "", model: "", lengthIn: "34", weightOz: "", certification: "USSSA", balance: "unknown" });
    setAdding(false);
    await load();
  }

  async function remove(b: Bat) {
    if (!confirm(`Remove ${b.brand} ${b.model}? Swings stay; they just won't be linked to this bat.`)) return;
    await db.deleteBat(b.id);
    await load();
  }

  if (!ready) return <PageSkeleton />;
  if (!player)
    return (
      <>
        <PageTitle title="Bat DNA" />
        <Empty title="No hitter yet">Set one up on the Home screen first.</Empty>
      </>
    );

  const input = "min-h-11 w-full rounded-xl border border-line-2 bg-night-3 px-3 text-[16px] placeholder:text-chalk-3";
  const ready2 = bats.filter((b) => stats[b.id]?.enough);

  return (
    <div className="animate-rise pb-10">
      <PageTitle
        title="Bat DNA"
        sub="How you actually swing each bat, from your recorded swings."
        right={<Button variant="ghost" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Add bat"}</Button>}
      />

      {adding && (
        <Panel className="mb-5 p-4">
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <input aria-label="Brand" placeholder="Brand (Miken, Easton…)" className={`${input} col-span-2`} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <input aria-label="Model" placeholder="Model" className={`${input} col-span-2`} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <label className="flex items-center gap-2 rounded-xl border border-line-2 bg-night-3 px-3">
              <input aria-label="Length in inches" inputMode="numeric" className="min-h-11 w-full bg-transparent text-[16px] focus:outline-none" value={form.lengthIn} onChange={(e) => setForm({ ...form, lengthIn: e.target.value })} />
              <span className="text-sm text-chalk-3">in</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-line-2 bg-night-3 px-3">
              <input aria-label="Weight in ounces" inputMode="decimal" placeholder="Weight" className="min-h-11 w-full bg-transparent text-[16px] placeholder:text-chalk-3 focus:outline-none" value={form.weightOz} onChange={(e) => setForm({ ...form, weightOz: e.target.value })} />
              <span className="text-sm text-chalk-3">oz</span>
            </label>
            <select aria-label="Balance" className={`${input} col-span-2`} value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value as BatBalance })}>
              {(Object.keys(BALANCE_LABEL) as BatBalance[]).map((k) => (
                <option key={k} value={k}>{BALANCE_LABEL[k]}</option>
              ))}
            </select>
            <select aria-label="Certification" className={`${input} col-span-2`} value={form.certification} onChange={(e) => setForm({ ...form, certification: e.target.value })}>
              {CERTS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {err && <p role="alert" className="col-span-2 text-sm text-stitch">{err}</p>}
            <Button type="submit" className="col-span-2">Save bat</Button>
          </form>
        </Panel>
      )}

      {bats.length === 0 && !adding && (
        <Empty title="No bats yet">
          <p>Add the bats you swing. Pick one when you record or start a live session, and Gapper builds each bat&apos;s profile from your real swings.</p>
          <Button className="mt-5" onClick={() => setAdding(true)}>Add a bat</Button>
        </Empty>
      )}

      <div className="space-y-4">
        {bats.map((b) => (
          <BatCard key={b.id} bat={b} s={stats[b.id]} onRemove={() => remove(b)} />
        ))}
      </div>

      {bats.length >= 2 && (
        <>
          <SectionTitle>Compare two bats</SectionTitle>
          {ready2.length >= 2 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <select
                    key={i}
                    aria-label={`Bat ${i + 1}`}
                    value={(cmp ?? [ready2[0].id, ready2[1].id])[i]}
                    onChange={(e) => {
                      const cur = cmp ?? [ready2[0].id, ready2[1].id];
                      const next: [string, string] = [...cur] as [string, string];
                      next[i] = e.target.value;
                      setCmp(next);
                    }}
                    className="min-h-11 rounded-xl border border-line bg-night-2 px-2 text-[14px]"
                  >
                    {ready2.map((x) => (
                      <option key={x.id} value={x.id}>{x.brand} {x.model}</option>
                    ))}
                  </select>
                ))}
              </div>
              <BatCompare a={stats[(cmp ?? [ready2[0].id, ready2[1].id])[0]]} b={stats[(cmp ?? [ready2[0].id, ready2[1].id])[1]]} />
            </>
          ) : (
            <p className="text-[14px] text-chalk-2">
              Comparisons need at least {MIN_SWINGS_TO_COMPARE} recorded swings with each bat, so a couple of lucky swings don&apos;t decide it.{" "}
              {bats.map((b) => `${b.brand} ${b.model}: ${stats[b.id]?.swings ?? 0}`).join(" · ")}
            </p>
          )}
        </>
      )}
      <p className="mt-8 text-xs leading-relaxed text-chalk-3">
        Exit velo, bat speed and launch angle come from slo-mo videos you upload, or from a sensor or radar reading you type in on a swing&apos;s page (that wins when both exist).{" "}
        <Link href="/how-it-works#speed" className="underline">How Gapper measures</Link>
      </p>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[14px] text-chalk-2">
        {label}
        {note && <span className="block text-[11px] text-chalk-3">{note}</span>}
      </span>
      <span className="num text-lg text-chalk">{value}</span>
    </div>
  );
}

/** The bat drawn to its real proportions, with a marker where its balance sits (end-loaded bats balance further out). */
function BatProfile({ bat }: { bat: Bat }) {
  const len = bat.lengthIn ?? 34;
  const w = 320;
  const L = (len / 36) * (w - 12);
  const bal = bat.balance === "end-loaded" ? 0.71 : bat.balance === "half-end" ? 0.65 : bat.balance === "balanced" ? 0.59 : null;
  const r = bat.balance === "end-loaded" ? 12 : 11;
  const cy = 22;
  const x0 = 6;
  const hx = x0 + 18;
  const path = [
    `M${x0},${cy - 5.5}`,
    `Q${x0 - 2},${cy} ${x0},${cy + 5.5}`,
    `L${x0 + 6},${cy + 5.5} L${x0 + 6},${cy + 3.6} L${hx},${cy + 3.4}`,
    `L${x0 + L * 0.42},${cy + 3.8}`,
    `C${x0 + L * 0.52},${cy + 4.5} ${x0 + L * 0.56},${cy + r} ${x0 + L * 0.62},${cy + r}`,
    `L${x0 + L - 4},${cy + r} Q${x0 + L},${cy + r} ${x0 + L},${cy} Q${x0 + L},${cy - r} ${x0 + L - 4},${cy - r}`,
    `L${x0 + L * 0.62},${cy - r}`,
    `C${x0 + L * 0.56},${cy - r} ${x0 + L * 0.52},${cy - 4.5} ${x0 + L * 0.42},${cy - 3.8}`,
    `L${hx},${cy - 3.4} L${x0 + 6},${cy - 3.6} L${x0 + 6},${cy - 5.5} Z`,
  ].join(" ");
  return (
    <svg viewBox={`0 0 ${w} 52`} className="mt-3 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`bat-${bat.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4a5b74" />
          <stop offset="0.35" stopColor="#2e3d55" />
          <stop offset="1" stopColor="#18233a" />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#bat-${bat.id})`} stroke="var(--color-line-2)" strokeWidth="1" />
      <rect x={x0 + L * 0.66} y={cy - 1} width={L * 0.26} height="2" rx="1" fill="var(--color-optic)" opacity="0.55" />
      <text x={x0 + L * 0.79} y={cy - r - 4} textAnchor="middle" fontSize="8.5" fill="var(--color-chalk-3)">sweet spot</text>
      {bal !== null && (
        <g>
          <path d={`M${x0 + L * bal},${cy + r + 3} l-4.5,7 h9 z`} fill="var(--color-clay)" />
          <text x={x0 + L * bal} y="51" textAnchor="middle" fontSize="8.5" fill="var(--color-clay)">balance</text>
        </g>
      )}
    </svg>
  );
}

function BatCard({ bat, s, onRemove }: { bat: Bat; s: BatStats | undefined; onRemove: () => void }) {
  const drop = bat.lengthIn && bat.weightOz ? bat.weightOz - bat.lengthIn : null;
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display truncate text-[1.35rem]">{bat.brand} {bat.model}</h2>
          <p className="mt-0.5 text-[13px] text-chalk-3">
            {[bat.lengthIn && `${bat.lengthIn} in`, bat.weightOz && `${bat.weightOz} oz`, drop !== null && `drop ${drop}`, bat.balance && bat.balance !== "unknown" && BALANCE_LABEL[bat.balance], bat.certification]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button type="button" onClick={onRemove} className="press min-h-10 rounded-lg border border-line-2 px-3 text-sm text-chalk-3 hover:text-chalk" aria-label={`Remove ${bat.brand} ${bat.model}`}>
          Remove
        </button>
      </div>
      <BatProfile bat={bat} />
      {!s || s.swings === 0 ? (
        <p className="mt-3 text-[14px] text-chalk-2">No swings with this bat yet. Pick it when you record or start a live session.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <Stat label="Swings" value={s.swings} size="sm" note={s.enough ? "enough to compare" : `${s.needMore} more to compare with other bats`} />
            <Stat label="Avg score" value={s.avgScore ?? "—"} size="sm" />
            <Stat label="Exit velo" value={s.exitVelocity ? Math.round(s.exitVelocity.avg) : "—"} unit={s.exitVelocity ? "mph" : undefined} size="sm" source={s.exitVelocity ? (s.exitVelocity.sensor ? "sensor" : "slomo") : undefined} note={s.exitVelocity ? `best ${Math.round(s.exitVelocity.best)}` : undefined} />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-chalk-2">Score consistency</span>
              <span className="num text-chalk">{s.scoreConsistency ?? "—"}</span>
            </div>
            <div className="mt-1.5"><Meter value={s.scoreConsistency} label="Score consistency" /></div>
          </div>
          <div className="mt-3 divide-y divide-line">
            <Row label="Timing spread" value={s.timingSpreadMs !== null ? `±${s.timingSpreadMs} ms` : "—"} note="How much foot-down timing varies" />
            <Row label="Contact heard" value={s.contactRate ? `${Math.round(s.contactRate.rate * 100)}%` : "—"} note={s.contactRate ? `of ${s.contactRate.n} mic-checked swings` : "Turn on Listen for contact"} />
            <Row label="Line drives" value={s.linerRate ? `${Math.round(s.linerRate.rate * 100)}%` : "—"} note={s.linerRate ? `of ${s.linerRate.n} tagged balls in play` : "Tag hits on a swing's page"} />
            <Row label="Bat speed" value={s.batSpeed ? `${s.batSpeed.avg.toFixed(1)} mph` : "—"} note={s.batSpeed ? `best ${s.batSpeed.best.toFixed(0)} · ${speedNote(s.batSpeed)}` : "Film in slo-mo to measure it"} />
            <Row label="Launch angle" value={s.launchAngle ? `${Math.round(s.launchAngle.avg)}°` : "—"} note={s.launchAngle ? speedNote(s.launchAngle) : "Film in slo-mo to measure it"} />
          </div>
        </>
      )}
    </Panel>
  );
}

function speedNote(st: { n: number; sensor: number; video: number }) {
  if (st.sensor && st.video) return `${st.n} swings (sensor + slo-mo)`;
  return `${st.n} ${st.sensor ? "sensor readings" : "slo-mo swings"}`;
}

function BatCompare({ a, b }: { a: BatStats; b: BatStats }) {
  const rows: { label: string; va: number | null; vb: number | null; higherBetter: boolean; fmt: (x: number) => string }[] = [
    { label: "Average score", va: a.avgScore, vb: b.avgScore, higherBetter: true, fmt: (x) => String(x) },
    { label: "Score consistency", va: a.scoreConsistency, vb: b.scoreConsistency, higherBetter: true, fmt: (x) => String(x) },
    { label: "Timing spread (ms)", va: a.timingSpreadMs, vb: b.timingSpreadMs, higherBetter: false, fmt: (x) => `±${x}` },
    ...(Object.keys(CATEGORY_LABEL) as ScoreCategoryKey[]).map((k) => ({
      label: CATEGORY_LABEL[k],
      va: a.categories[k] ?? null,
      vb: b.categories[k] ?? null,
      higherBetter: true,
      fmt: (x: number) => String(x),
    })),
    { label: "Contact heard (%)", va: a.contactRate ? Math.round(a.contactRate.rate * 100) : null, vb: b.contactRate ? Math.round(b.contactRate.rate * 100) : null, higherBetter: true, fmt: (x) => `${x}%` },
    { label: "Exit velo (avg)", va: a.exitVelocity ? Math.round(a.exitVelocity.avg * 10) / 10 : null, vb: b.exitVelocity ? Math.round(b.exitVelocity.avg * 10) / 10 : null, higherBetter: true, fmt: (x) => `${x} mph` },
    { label: "Exit velo (best 3)", va: a.exitVelocity ? Math.round(a.exitVelocity.best) : null, vb: b.exitVelocity ? Math.round(b.exitVelocity.best) : null, higherBetter: true, fmt: (x) => `${x} mph` },
    { label: "Bat speed (avg)", va: a.batSpeed ? Math.round(a.batSpeed.avg * 10) / 10 : null, vb: b.batSpeed ? Math.round(b.batSpeed.avg * 10) / 10 : null, higherBetter: true, fmt: (x) => `${x} mph` },
  ];
  return (
    <div className="surface mt-3 overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[20rem] text-[14px]">
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const win = r.va !== null && r.vb !== null && r.va !== r.vb ? ((r.va > r.vb) === r.higherBetter ? "a" : "b") : null;
            return (
              <tr key={r.label}>
                <td className="px-3 py-2 text-chalk-2">{r.label}</td>
                <td className={`num px-3 py-2 text-right ${win === "a" ? "text-optic" : "text-chalk"}`}>{r.va !== null ? r.fmt(r.va) : "—"}</td>
                <td className={`num px-3 py-2 text-right ${win === "b" ? "text-optic" : "text-chalk"}`}>{r.vb !== null ? r.fmt(r.vb) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
