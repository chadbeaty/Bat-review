import type { Metadata } from "next";
import Link from "next/link";
import { Positioning } from "@/components/brand";
import { PillarStrip } from "@/components/ui";
import { METRICS } from "@/engine/catalog";
import type { MetricKey } from "@/engine/types";

export const metadata: Metadata = {
  title: "How Gapper measures",
  description: "What a phone camera can and can't measure about a slow-pitch swing, and exactly how each Gapper number is made.",
};

const ROWS: { k: MetricKey; now: string; slomo: string }[] = [
  { k: "strideTiming", now: "Yes", slomo: "Sharper" },
  { k: "timingStyle", now: "Yes", slomo: "Yes" },
  { k: "strideLength", now: "Side view", slomo: "Side view" },
  { k: "frontFootSlide", now: "Yes", slomo: "Yes" },
  { k: "frontLegBlock", now: "As a change", slomo: "As a change" },
  { k: "backKnee", now: "Rough", slomo: "Rough" },
  { k: "backHeel", now: "Side view", slomo: "Side view" },
  { k: "weightShift", now: "Side view", slomo: "Side view" },
  { k: "strideDirection", now: "Behind view", slomo: "Behind view" },
  { k: "swingTime", now: "Yes", slomo: "Sharper" },
  { k: "contact", now: "Yes (mic)", slomo: "Yes (ball)" },
  { k: "headMovement", now: "Yes", slomo: "Yes" },
  { k: "handDrop", now: "Yes", slomo: "Yes" },
  { k: "handCast", now: "Rough", slomo: "Yes" },
  { k: "balance", now: "Yes", slomo: "Yes" },
  { k: "hipLead", now: "No (needs 60 fps)", slomo: "Rough" },
  { k: "hipTurn", now: "No", slomo: "No (needs 2 cameras)" },
  { k: "handSpeed", now: "Rough", slomo: "Rough" },
  { k: "exitVelocity", now: "No", slomo: "Yes, ± a few mph" },
  { k: "launchAngle", now: "No", slomo: "Yes, ± 1–3°" },
  { k: "pitchSpeed", now: "No", slomo: "Yes" },
  { k: "batSpeed", now: "No", slomo: "Estimate, ± about 5 mph" },
  { k: "attackAngle", now: "No", slomo: "No (sensor)" },
];

export default function HowItWorks() {
  return (
    <div className="animate-rise pb-12">
      <PillarStrip active="analyze" className="mb-3 mt-3" />
      <h1 className="display text-[2.15rem] md:text-[2.75rem]">How Gapper measures</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-chalk-2">
        Gapper tracks 33 points on your body in every camera frame, right on your phone. From how those points move, it finds your swing, splits it into phases and measures your mechanics.
        We never make up a number. If the footage can&apos;t support a measurement, you&apos;ll see why instead of a guess.
      </p>

      <h2 className="mt-10 head text-lg">
        <Positioning />
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        General swing apps are built for every hitter, and their softball usually means fastpitch. Slow pitch is its own swing. Gapper is the performance analytics platform for the slow-pitch community, built for that swing and nothing else:
      </p>
      <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-chalk-2">
        <li><span className="text-chalk">Timed to the arc.</span> The pitch drops in on a 6–12 ft arc, so timing is about the drop, not a fastball. Your front foot is graded against the slow-pitch window (down about 0.14–0.38 s before contact), not baseball&apos;s &ldquo;get your foot down early.&rdquo;</li>
        <li><span className="text-chalk">Slow-pitch faults.</span> The fixes are the ones that cost slow-pitch hitters: drifting out front and rolling over into pull-side grounders, dropping the hands, pulling the head off the ball.</li>
        <li><span className="text-chalk">Slow-pitch speeds.</span> Exit velo is read off a 12&quot; or 11&quot; softball, using the arc&apos;s own fall as the ruler, and bat speed uses the collision physics softball bats are certified by.</li>
        <li><span className="text-chalk">Four outfielders, three gaps.</span> Ten fielders means line drives into the gaps win. Tag your hits (line drive, grounder, fly ball; pull side, middle, opposite field) and your Hitting Profile shows your line-drive rate and tendencies. A cage net stops the ball, so Gapper never pretends to see where it landed.</li>
        <li><span className="text-chalk">Slow-pitch gear and teams.</span> Bat DNA knows end-loaded and half-ounce balance and USSSA, USA/ASA, NSA, ISA and senior stamps. Positions include Rover and EH; levels run from rec to C/D to A/B and up.</li>
      </ul>

      <h2 className="mt-10 head text-lg">Every number is labeled</h2>
      <dl className="mt-3 space-y-3 text-[15px]">
        <div><dt className="inline font-bold text-chalk"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-chalk align-middle" aria-hidden="true" />Measured</dt> <dd className="inline text-chalk-2">counted or timed directly, like your swing count or the moment the mic heard contact.</dd></div>
        <div><dt className="inline font-bold text-chalk"><span className="mr-1.5 inline-block h-2 w-2 rounded-full border border-chalk-2 align-middle" aria-hidden="true" />Camera estimate</dt> <dd className="inline text-chalk-2">worked out from body tracking, shown with a High, Medium or Low confidence.</dd></div>
        <div><dt className="inline font-bold text-chalk"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-clay align-middle" aria-hidden="true" />Sensor</dt> <dd className="inline text-chalk-2">from a radar or bat sensor, including a reading you typed in from your own device.</dd></div>
        <div><dt className="inline font-bold text-chalk"><span className="mr-1.5 inline-block h-2 w-2 rounded-full border border-dashed border-line-2 align-middle" aria-hidden="true" />Not available</dt> <dd className="inline text-chalk-2">the footage can&apos;t support it, with the reason.</dd></div>
      </dl>

      <h2 className="mt-10 head text-lg">What a phone can measure</h2>
      <p className="mt-1 text-[14px] text-chalk-3">Live mode and normal videos (about 30 frames a second) vs. a slo-mo video you upload (120–240 frames a second).</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[22rem] text-left text-[14px]">
          <thead className="bg-night-2 text-chalk-3">
            <tr>
              <th className="px-4 py-2.5 font-normal">Metric</th>
              <th className="px-4 py-2.5 font-normal">Live / normal video</th>
              <th className="px-4 py-2.5 font-normal">Slo-mo video</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROWS.map((r) => (
              <tr key={r.k}>
                <td className="px-4 py-2.5 text-chalk">{METRICS[r.k].label}</td>
                <td className={`px-4 py-2.5 ${r.now.startsWith("No") ? "text-chalk-3" : r.now === "Rough" ? "text-amber" : "text-chalk"}`}>{r.now}</td>
                <td className="px-4 py-2.5 text-chalk-2">{r.slomo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 head text-lg">Legs and feet come first</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        Slow pitch is a timing game on a ball dropping in on a 6–12 ft arc. Skilled slow-pitch hitters start their step near the top of the arc and land the front heel about 0.2 seconds
        before contact, then firm up the front side and turn against it. So Gapper reads your feet first: your timing move (toe tap, stride or leg lift), when your front foot lands,
        whether it stays planted, how much your front leg firms up, your back leg and back heel, and where your weight is at contact. Foot-plant timing is one of the most reliable things a
        phone can measure. Knee angles are shown as a change from foot-down to contact, because one camera reads absolute knee angles to within roughly 10°.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-chalk-2">
        Your shoes have to be in the picture. Setup won&apos;t start on its own until they are, and during a session you&apos;ll see a warning if they slip out.
      </p>

      <h2 id="gap" className="mt-10 head text-lg">The gap timer</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        In a live session, scoreboard mode puts one number up big enough to read from the plate: the gap, the time from your front foot landing to contact, in seconds. Next to it is
        the slow-pitch reference (skilled hitters about 0.20 s). Live mode tracks at 30–60 frames a second, so the gap is only good to about one frame: it&apos;s rounded to hundredths,
        shown with its ± and labeled an estimate. If your feet weren&apos;t clear or the tracking was shaky, you&apos;ll see a dash and the reason instead of a number. The scoreboard also
        shows your swing score and the cue, and the voice can read them out. It never shows exit velo or bat speed: those need a slo-mo upload.
      </p>

      <h2 className="mt-10 head text-lg">Why no hip-turn degrees?</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        Measuring hip rotation needs depth, and one camera has to guess depth. Even a professional two-phone system filming at 240 frames a second misses hip rotation speed by about
        150°/s on average. Rather than show you a made-up number, Gapper leaves it out.
      </p>

      <h2 id="speed" className="mt-10 head text-lg">Exit velo and bat speed from slo-mo</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        At 30 frames a second a 90 mph ball crosses the picture in a frame or two, so live mode can&apos;t time it. In slo-mo (120 or 240 frames a second) Gapper follows the ball frame
        by frame. The hard part with one camera is knowing how many pixels make a foot. Gapper uses two independent rulers and checks them against each other:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-chalk-2">
        <li>
          <span className="text-chalk">Gravity.</span> A slow-pitch pitch is in free fall on its arc, and gravity pulls everything down at the same 32 feet per second per second. How fast
          the pitch speeds up on its way down tells Gapper the scale right over the plate, where contact happens. Air drag is accounted for; spin it can&apos;t see goes into the ± range.
        </li>
        <li>
          <span className="text-chalk">The ball itself.</span> A 12&quot; softball is 3.82&quot; across, so its width in pixels is a second ruler. As a hit flies away it shrinks (pulled)
          or grows (opposite field), which shows how fast it&apos;s moving toward or away from the camera, so those hits aren&apos;t undercounted.
        </li>
      </ul>
      <p className="mt-3 text-[15px] leading-relaxed text-chalk-2">
        <span className="text-chalk">Exit velo and launch angle</span> come straight from the ball&apos;s first frames off the bat and are shown with a ± range. In testing on rendered
        hits with known speeds, the typical miss was under 2% and the ± range covered the true speed every time. Real-world accuracy depends on good light, a still phone and a clean view
        of the ball. <span className="text-chalk">Bat speed</span> can&apos;t be seen directly from one side camera (at contact the barrel points at the lens), so it&apos;s worked out from
        exit velo and pitch speed using the same bat-ball physics bats are certified with. It assumes a sweet-spot hit, so a mishit reads low. Attack angle still needs a sensor.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-chalk-2">
        Got a radar or bat sensor? Enter its reading on any swing and it takes priority. <Link href="/guide#speed" className="text-optic underline">How to film for speed</Link>
      </p>

      <h2 className="mt-10 head text-lg">The Gapper Score</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        A 0–100 grade of your mechanics, not a prediction of how hard you hit it. It blends the checks your footage supports: quiet head, hands that stay up, staying back, a balanced finish,
        a controlled stride, hips leading shoulders, and sequence. Each check counts more when we trust it more. Every swing page shows exactly what went into its score.
      </p>

      <h2 className="mt-10 head text-lg">Every metric, explained</h2>
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
