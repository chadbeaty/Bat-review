"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { Button, Empty, PageTitle, Panel, SectionTitle } from "@/components/ui";
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

  if (!ready) return null;
  if (!player)
    return (
      <>
        <PageTitle title="Bat DNA" />
        <Empty title="No hitter yet">Set one up on the Home screen first.</Empty>
      </>
    );

  const input = "min-h-11 w-full rounded-xl border border-line bg-night-3 px-3 text-[16px] placeholder:text-chalk-3";
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
            <label className="flex items-center gap-2 rounded-xl border border-line bg-night-3 px-3">
              <input aria-label="Length in inches" inputMode="numeric" className="min-h-11 w-full bg-transparent text-[16px] focus:outline-none" value={form.lengthIn} onChange={(e) => setForm({ ...form, lengthIn: e.target.value })} />
              <span className="text-sm text-chalk-3">in</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-line bg-night-3 px-3">
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
          <p>Add the bats you swing. Pick one when you record or start a live session, and SwingIQ builds each bat&apos;s profile from your real swings.</p>
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
      <p className="mt-8 text-xs text-chalk-3">
        Bat speed, exit velocity and launch angle appear here only from readings you enter from a sensor or radar on a swing&apos;s page. The camera can&apos;t measure them yet.{" "}
        <Link href="/how-it-works" className="underline">How SwingIQ measures</Link>
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

function BatCard({ bat, s, onRemove }: { bat: Bat; s: BatStats | undefined; onRemove: () => void }) {
  const drop = bat.lengthIn && bat.weightOz ? bat.weightOz - bat.lengthIn : null;
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display truncate text-xl">{bat.brand} {bat.model}</h2>
          <p className="text-[13px] text-chalk-3">
            {[bat.lengthIn && `${bat.lengthIn} in`, bat.weightOz && `${bat.weightOz} oz`, drop !== null && `drop ${drop}`, bat.balance && bat.balance !== "unknown" && BALANCE_LABEL[bat.balance], bat.certification]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button type="button" onClick={onRemove} className="min-h-10 rounded-lg border border-line px-3 text-sm text-chalk-3" aria-label={`Remove ${bat.brand} ${bat.model}`}>
          Remove
        </button>
      </div>
      {!s || s.swings === 0 ? (
        <p className="mt-3 text-[14px] text-chalk-2">No swings with this bat yet. Pick it when you record or start a live session.</p>
      ) : (
        <div className="mt-2 divide-y divide-line">
          <Row label="Swings recorded" value={String(s.swings)} note={s.enough ? undefined : `${s.needMore} more to compare with other bats`} />
          <Row label="Average SwingIQ score" value={s.avgScore !== null ? String(s.avgScore) : "—"} />
          <Row label="Score consistency" value={s.scoreConsistency !== null ? `${s.scoreConsistency}` : "—"} note="100 = every swing scored the same" />
          <Row label="Timing spread" value={s.timingSpreadMs !== null ? `±${s.timingSpreadMs} ms` : "—"} note="How much foot-down timing varies" />
          <Row label="Contact heard" value={s.contactRate ? `${Math.round(s.contactRate.rate * 100)}%` : "—"} note={s.contactRate ? `of ${s.contactRate.n} mic-checked swings` : "Turn on Listen for contact"} />
          <Row label="Line drives" value={s.linerRate ? `${Math.round(s.linerRate.rate * 100)}%` : "—"} note={s.linerRate ? `of ${s.linerRate.n} tagged balls in play` : "Tag hits on a swing's page"} />
          <Row label="Exit velo" value={s.exitVelocity ? `${s.exitVelocity.avg.toFixed(1)} mph` : "—"} note={s.exitVelocity ? `best ${s.exitVelocity.best.toFixed(0)} · ${speedNote(s.exitVelocity)}` : "Film in slo-mo to measure it"} />
          <Row label="Bat speed" value={s.batSpeed ? `${s.batSpeed.avg.toFixed(1)} mph` : "—"} note={s.batSpeed ? `best ${s.batSpeed.best.toFixed(0)} · ${speedNote(s.batSpeed)}` : "Film in slo-mo to measure it"} />
          <Row label="Launch angle" value={s.launchAngle ? `${Math.round(s.launchAngle.avg)}°` : "—"} note={s.launchAngle ? speedNote(s.launchAngle) : "Film in slo-mo to measure it"} />
        </div>
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
    <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
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
