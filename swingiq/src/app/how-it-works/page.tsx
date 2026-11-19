import type { Metadata } from "next";
import Link from "next/link";
import { METRICS } from "@/engine/catalog";
import type { MetricKey } from "@/engine/types";

export const metadata: Metadata = {
  title: "How SwingIQ measures",
  description: "What a phone camera can and can't measure about a slow-pitch swing, and exactly how each SwingIQ number is made.",
};

const ROWS: { k: MetricKey; now: string; later: string }[] = [
  { k: "swingTime", now: "Yes", later: "Sharper" },
  { k: "contact", now: "Yes (mic)", later: "Yes" },
  { k: "headMovement", now: "Yes", later: "Yes" },
  { k: "handDrop", now: "Yes", later: "Yes" },
  { k: "strideLength", now: "Side view", later: "Yes" },
  { k: "weightShift", now: "Side view", later: "Yes" },
  { k: "balance", now: "Yes", later: "Yes" },
  { k: "separation", now: "Rough", later: "Better" },
  { k: "sequence", now: "Rough", later: "Yes" },
  { k: "handSpeed", now: "Rough", later: "Good" },
  { k: "batSpeed", now: "No", later: "Yes" },
  { k: "attackAngle", now: "No", later: "Yes" },
  { k: "exitVelocity", now: "No", later: "Estimate" },
  { k: "launchAngle", now: "No", later: "Yes" },
];

export default function HowItWorks() {
  return (
    <div className="animate-rise pb-12">
      <h1 className="display mt-2 text-[2rem] leading-[1.05]">How SwingIQ measures</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-chalk-2">
        SwingIQ tracks 33 points on your body in every camera frame, right on your phone. From how those points move, it finds your swing, splits it into phases and measures your mechanics.
        We never make up a number. If the footage can&apos;t support a measurement, you&apos;ll see why instead of a guess.
      </p>

      <h2 className="mt-10 text-lg font-bold">Every number is labeled</h2>
      <dl className="mt-3 space-y-3 text-[15px]">
        <div><dt className="inline font-bold text-chalk">Measured</dt> <dd className="inline text-chalk-2">counted or timed directly, like your swing count or the moment the mic heard contact.</dd></div>
        <div><dt className="inline font-bold text-chalk">Camera estimate</dt> <dd className="inline text-chalk-2">worked out from body tracking, shown with a High, Medium or Low confidence.</dd></div>
        <div><dt className="inline font-bold text-chalk">Sensor</dt> <dd className="inline text-chalk-2">from a radar or bat sensor, including a reading you typed in from your own device.</dd></div>
        <div><dt className="inline font-bold text-chalk">Not available</dt> <dd className="inline text-chalk-2">the footage can&apos;t support it, with the reason.</dd></div>
      </dl>

      <h2 className="mt-10 text-lg font-bold">What a phone can measure</h2>
      <p className="mt-1 text-[14px] text-chalk-3">Today in your browser (about 30 frames a second) vs. the coming iPhone app (120–240 frames a second).</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[22rem] text-left text-[14px]">
          <thead className="bg-night-2 text-chalk-3">
            <tr>
              <th className="px-4 py-2.5 font-normal">Metric</th>
              <th className="px-4 py-2.5 font-normal">Now</th>
              <th className="px-4 py-2.5 font-normal">iPhone app</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROWS.map((r) => (
              <tr key={r.k}>
                <td className="px-4 py-2.5 text-chalk">{METRICS[r.k].label}</td>
                <td className={`px-4 py-2.5 ${r.now === "No" ? "text-chalk-3" : r.now === "Rough" ? "text-amber" : "text-chalk"}`}>{r.now}</td>
                <td className="px-4 py-2.5 text-chalk-2">{r.later}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-lg font-bold">Why no bat speed yet?</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        A slow-pitch barrel moves 60–80 mph. At 30 frames a second it jumps about three feet between frames and smears into a blur, so no honest method can time it. Bat speed, attack angle,
        exit velocity and launch angle need high-speed capture (the native iPhone app) or a sensor. Until then, enter readings from your own radar or bat sensor on any swing.
      </p>

      <h2 className="mt-10 text-lg font-bold">The SwingIQ score</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        A 0–100 grade of your mechanics, not a prediction of how hard you hit it. It blends the checks your footage supports: quiet head, hands that stay up, staying back, a balanced finish,
        a controlled stride, hips leading shoulders, and sequence. Each check counts more when we trust it more. Every swing page shows exactly what went into its score.
      </p>

      <h2 className="mt-10 text-lg font-bold">Every metric, explained</h2>
      <dl className="mt-3 divide-y divide-line">
        {(Object.keys(METRICS) as MetricKey[]).map((k) => (
          <div key={k} className="py-4">
            <dt className="text-[15px] font-bold text-chalk">
              {METRICS[k].label} <span className="font-normal text-chalk-3">· {METRICS[k].unit || "yes / no"}</span>
            </dt>
            <dd className="mt-1 text-[14px] leading-relaxed text-chalk-2">{METRICS[k].explain}</dd>
            <dd className="mt-1 text-[13px] leading-relaxed text-chalk-3">How: {METRICS[k].method}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-[14px] text-chalk-3">
        <Link href="/guide" className="underline">Camera setup guide</Link>
      </p>
    </div>
  );
}
