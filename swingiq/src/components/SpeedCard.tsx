"use client";
import Link from "next/link";
import type { MetricValue, MetricKey } from "@/engine/types";

/**
 * Exit velo and bat speed, big, with their ± range. From a slo-mo video only; anything else gets a short note on how
 * to get them.
 */
export function SpeedCard({ metrics, source }: { metrics: Partial<Record<MetricKey, MetricValue>>; source?: "live" | "video" }) {
  const ev = metrics.exitVelocity;
  const bat = metrics.batSpeed;
  const la = metrics.launchAngle;
  const pitch = metrics.pitchSpeed;
  const descent = metrics.descentAngle;
  const has = (m?: MetricValue): m is MetricValue & { value: number } => !!m && m.source !== "unavailable" && m.value !== null;
  if (!has(ev) && !has(pitch)) {
    const why = ev?.source === "unavailable" && ev.reason && !/Needs ball tracking|Phase 2/.test(ev.reason) ? ev.reason : null;
    return (
      <section aria-label="Speed" className="rounded-2xl border border-line bg-night-2 p-4">
        <h2 className="text-[15px] font-bold">Exit velo and bat speed</h2>
        <p className="mt-1 text-[14px] text-chalk-2">
          {why ?? (source === "live" ? "Live mode can't catch the ball. Film the swing in slo-mo and upload it to get them." : "Film the swing in slo-mo to get them.")}
        </p>
        <Link href="/guide#speed" className="mt-2 inline-block text-[14px] text-optic">How to film for speed</Link>
      </section>
    );
  }
  const big = (label: string, m: MetricValue | undefined, unit: string, testId: string) => (
    <div className="min-w-0 flex-1" data-testid={testId}>
      <span className="block text-[12px] uppercase tracking-wide text-chalk-3">{label}</span>
      {has(m) ? (
        <>
          <span className="num text-4xl text-chalk">{Math.round(m.value)}</span>
          <span className="ml-1 text-sm text-chalk-3">{unit}</span>
          {m.plusMinus !== undefined && <span className="block text-[12px] text-chalk-3">± {Math.round(m.plusMinus)} {unit}</span>}
        </>
      ) : (
        <span className="num block text-4xl text-chalk-3" aria-label="not measured">—</span>
      )}
    </div>
  );
  return (
    <section aria-label="Speed" className="rounded-2xl border border-optic/40 bg-night-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">Speed</h2>
        <span className="rounded-md border border-optic/40 px-1.5 py-0.5 text-[11px] text-optic">From slo-mo video</span>
      </div>
      <div className="mt-3 flex gap-4">
        {big("Exit velo", ev, "mph", "speed-ev")}
        {big("Bat speed", bat, "mph", "speed-bat")}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="text-chalk-3">Launch</dt>
          <dd className="text-chalk">{has(la) ? `${la.value}°` : "—"}</dd>
        </div>
        <div>
          <dt className="text-chalk-3">Pitch</dt>
          <dd className="text-chalk">{has(pitch) ? `${Math.round(pitch.value)} mph` : "—"}</dd>
        </div>
        <div>
          <dt className="text-chalk-3">Pitch drop</dt>
          <dd className="text-chalk">{has(descent) ? `${descent.value}°` : "—"}</dd>
        </div>
      </dl>
      {has(bat) && <p className="mt-3 text-[12px] text-chalk-3">Bat speed is worked out from exit velo and pitch speed, assuming a sweet-spot hit, so a mishit reads low.</p>}
      {!has(ev) && ev?.reason && <p className="mt-3 text-[13px] text-amber">{ev.reason}</p>}
    </section>
  );
}
