"use client";
import Link from "next/link";
import type { MetricValue, MetricKey } from "@/engine/types";
import { RangeBar, speedDomain } from "./viz/RangeBar";

/**
 * Exit velo and bat speed, big, with their ± range drawn on a scale next to the player's own average and best. From a
 * slo-mo video only; anything else gets a short note on how to get them.
 */
export function SpeedCard({
  metrics,
  source,
  history,
}: {
  metrics: Partial<Record<MetricKey, MetricValue>>;
  source?: "live" | "video";
  history?: { ev: number[]; bat: number[] };
}) {
  const ev = metrics.exitVelocity;
  const bat = metrics.batSpeed;
  const la = metrics.launchAngle;
  const pitch = metrics.pitchSpeed;
  const descent = metrics.descentAngle;
  const attack = metrics.attackAngle;
  const has = (m?: MetricValue): m is MetricValue & { value: number } => !!m && m.source !== "unavailable" && m.value !== null;
  if (!has(ev) && !has(pitch)) {
    const why = ev?.source === "unavailable" && ev.reason && !/Needs ball tracking|Phase 2/.test(ev.reason) ? ev.reason : null;
    return (
      <section aria-label="Speed" className="surface rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
            <path d="M2 20 Q10 2 18 16 L32 4" fill="none" stroke="var(--color-line-2)" strokeWidth="1.6" strokeDasharray="1.5 3" strokeLinecap="round" />
            <circle cx="32" cy="4" r="2.6" fill="var(--color-chalk-3)" />
          </svg>
          <h2 className="head text-[15px]">Exit velo and bat speed</h2>
        </div>
        <p className="mt-2 text-[14px] text-chalk-2">
          {why ?? (source === "live" ? "Live mode can't catch the ball. Film the swing in slo-mo and upload it to get them." : "Film the swing in slo-mo to get them.")}
        </p>
        <Link href="/guide#speed" className="mt-2 inline-block text-[14px] text-optic">
          How to film for speed
        </Link>
      </section>
    );
  }
  const evs = history?.ev ?? [];
  const avg = (xs: number[]) => (xs.length >= 2 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const best = (xs: number[]) => (xs.length >= 2 ? Math.max(...xs) : null);
  const big = (label: string, m: MetricValue | undefined, unit: string, testId: string, note?: string) => (
    <div className="min-w-0 flex-1" data-testid={testId}>
      <span className="block text-[13px] text-chalk-3">{label}</span>
      {has(m) ? (
        <>
          <span className="num text-[2.6rem] leading-none text-chalk">{Math.round(m.value)}</span>
          <span className="ml-1 text-sm text-chalk-3">{unit}</span>
          {m.plusMinus !== undefined && <span className="mt-1 block text-[12px] text-chalk-3">± {Math.round(m.plusMinus)} {unit}</span>}
          {note && <span className="block text-[11px] text-chalk-3">{note}</span>}
        </>
      ) : (
        <span className="num block text-[2.6rem] leading-none text-chalk-3" aria-label="not measured">
          —
        </span>
      )}
    </div>
  );
  return (
    <section aria-label="Speed" className="surface boxed rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="head text-[15px]">Speed</h2>
        <span className="rounded-md border border-optic/40 bg-optic-wash px-1.5 py-0.5 text-[11px] text-optic">From high-speed video</span>
      </div>
      <div className="mt-3 flex gap-4">
        {big("Exit velo", ev, "mph", "speed-ev")}
        {big("Bat speed", bat, "mph", "speed-bat", has(bat) ? (bat.method === "barrel tracking" ? "tracked from the bat" : "worked out from exit velo") : undefined)}
      </div>
      {has(ev) && (
        <div className="mt-4">
          <RangeBar value={ev.value} pm={ev.plusMinus} avg={avg(evs)} best={best(evs)} domain={speedDomain([...evs, ev.value], [40, 110])} unit="mph" label="Exit velo" />
        </div>
      )}
      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-[13px]">
        <div className="bg-night-2 px-3 py-2">
          <dt className="text-chalk-3">Launch</dt>
          <dd className="num text-[17px] text-chalk">{has(la) ? `${la.value}°` : "—"}</dd>
        </div>
        <div className="bg-night-2 px-3 py-2">
          <dt className="text-chalk-3">Pitch</dt>
          <dd className="num text-[17px] text-chalk">{has(pitch) ? `${Math.round(pitch.value)} mph` : "—"}</dd>
        </div>
        <div className="bg-night-2 px-3 py-2">
          <dt className="text-chalk-3">Pitch drop</dt>
          <dd className="num text-[17px] text-chalk">{has(descent) ? `${descent.value}°` : "—"}</dd>
        </div>
        {has(attack) && (
          <div className="col-span-3 bg-night-2 px-3 py-2">
            <dt className="text-chalk-3">Attack angle</dt>
            <dd className="num text-[17px] text-chalk">
              {attack.value > 0 ? "+" : ""}
              {attack.value}°<span className="ml-2 text-[12px] text-chalk-3">± {Math.round(attack.plusMinus ?? 5)}° · barrel tracking</span>
            </dd>
          </div>
        )}
      </dl>
      {has(bat) && bat.method === "barrel tracking" && (
        <p className="mt-3 text-[12px] leading-relaxed text-chalk-3">
          Bat speed is the sweet spot&apos;s peak speed (6 inches from the end of the barrel), tracked frame by frame from the bat itself.
          Exit velo comes from tracking the ball. Two separate measurements.
        </p>
      )}
      {has(bat) && bat.method !== "barrel tracking" && (
        <p className="mt-3 text-[12px] leading-relaxed text-chalk-3">
          The bat wasn&apos;t clear enough to track, so bat speed is worked out from exit velo and pitch speed, assuming a sweet-spot hit. A mishit reads low.
        </p>
      )}
      {!has(ev) && ev?.reason && <p className="mt-3 text-[13px] text-amber">{ev.reason}</p>}
    </section>
  );
}
