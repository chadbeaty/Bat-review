import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Camera setup guide" };

function CageDiagram() {
  // Top-down: cage, plate, hitter (righty), pitcher, phone positions for the three views.
  return (
    <svg viewBox="0 0 320 260" className="w-full" role="img" aria-label="Top-down cage diagram: side view phone across the plate facing the hitter's chest; behind view phone behind the plate; front view phone behind the pitcher's screen.">
      <rect x="20" y="10" width="280" height="240" rx="6" fill="none" stroke="var(--color-chalk-3)" strokeDasharray="3 5" />
      <text x="28" y="26" fontSize="10" fill="var(--color-chalk-3)">Cage net</text>
      {/* Pitcher + screen */}
      <rect x="140" y="40" width="40" height="5" fill="var(--color-chalk-3)" />
      <circle cx="160" cy="56" r="6" fill="none" stroke="var(--color-chalk-2)" strokeWidth="2" />
      <text x="190" y="60" fontSize="10" fill="var(--color-chalk-3)">Pitcher</text>
      {/* Arc */}
      <path d="M160 64 Q 160 120 160 186" stroke="var(--color-optic)" strokeWidth="1.5" strokeDasharray="2 4" fill="none" />
      {/* Plate */}
      <path d="M150 188 h20 v8 l-10 7 l-10 -7 z" fill="var(--color-chalk-2)" />
      {/* Hitter */}
      <circle cx="128" cy="196" r="8" fill="none" stroke="var(--color-chalk)" strokeWidth="2" />
      <text x="88" y="222" fontSize="10" fill="var(--color-chalk-2)">You (righty)</text>
      {/* Phones */}
      <g>
        <rect x="246" y="186" width="12" height="20" rx="3" fill="var(--color-optic)" />
        <text x="232" y="224" fontSize="11" fill="var(--color-optic)" fontWeight="700">Side</text>
        <path d="M246 196 L140 196" stroke="var(--color-optic)" strokeWidth="1" opacity="0.4" />
      </g>
      <g>
        <rect x="154" y="226" width="12" height="20" rx="3" fill="var(--color-chalk)" />
        <text x="172" y="242" fontSize="11" fill="var(--color-chalk)">Behind</text>
      </g>
      <g>
        <rect x="154" y="14" width="12" height="20" rx="3" fill="var(--color-chalk)" />
        <text x="172" y="28" fontSize="11" fill="var(--color-chalk)">Front</text>
      </g>
    </svg>
  );
}

const tips = [
  { h: "Feet in the picture", p: "Your shoes have to be in the frame, with a little room below them. Legs and feet are half the swing, and setup won't start on its own until they're in view." },
  { h: "Distance", p: "10–15 feet from you. Your whole body plus the bat at full extension should fit, with a little room at the top and bottom." },
  { h: "Height", p: "Phone at about waist height, level, not tilted up or down. A cheap phone tripod or a clamp on the cage pole works." },
  { h: "Side view (best start)", p: "Best for foot-down timing, stride, weight shift and back heel. Across the plate from you, facing your chest. A righty puts the phone on the first-base side of the plate; a lefty on the third-base side. If you're behind netting, that's fine. Put the lens close to the net so the mesh blurs out." },
  { h: "Light", p: "Bright is better. Fast hands blur in a dim cage. Don't point the phone at the sun or straight at a light." },
  { h: "Background", p: "Keep other people out of the frame if you can. Gapper follows one person, the most visible one." },
  { h: "Earbuds", p: "Connect them before you start and turn on voice cues. You'll hear a two-to-five word tip after each swing without walking to the phone." },
  { h: "Keep it awake", p: "The screen stays on during a session. Plug in for long sessions: the camera and tracker use about 15–25% battery an hour." },
];

export default function GuidePage() {
  return (
    <div className="animate-rise pb-10">
      <Link href="/live" className="-ml-2 inline-block rounded-lg px-2 py-2 text-[15px] text-chalk-2 hover:text-chalk">← Live session</Link>
      <h1 className="display mt-3 text-[2.15rem] leading-[1.02] md:text-[2.6rem]">Camera setup</h1>
      <p className="mt-2 text-[15px] text-chalk-2">For the cage or the field with a slow-pitch toss or an arc machine. Two minutes of setup makes every number better. The app checks all of this live and tells you what to fix.</p>
      <div className="mt-6 rounded-2xl border border-line bg-night-2 p-4">
        <CageDiagram />
      </div>
      <dl className="mt-6 divide-y divide-line">
        {tips.map((t) => (
          <div key={t.h} className="py-4">
            <dt className="text-[15px] font-bold text-chalk">{t.h}</dt>
            <dd className="mt-1 text-[15px] leading-relaxed text-chalk-2">{t.p}</dd>
          </div>
        ))}
      </dl>
      <h2 id="speed" className="mt-8 head text-lg">Filming for exit velo and bat speed</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-chalk-2">
        Speeds come from a slo-mo video you record or upload on the <Link href="/record" className="text-optic underline">Record</Link> screen. No extra gear.
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-chalk-2">
        <li><span className="text-chalk">Turn on Slo-mo</span> in the iPhone Camera app (swipe to SLO-MO). Settings › Camera › Record Slo-mo: 240 fps is best, 120 works.</li>
        <li><span className="text-chalk">Phone on a stand or fence</span>, not in your hand. The background has to stay still.</li>
        <li><span className="text-chalk">Side view</span>: across the plate facing the hitter&apos;s chest, 10 to 15 feet away, about waist high, level.</li>
        <li><span className="text-chalk">Frame it wide enough</span> to see the pitch dropping in and 4 to 6 feet in front of the plate. The arc is Gapper&apos;s ruler.</li>
        <li><span className="text-chalk">Bright light.</span> Daylight is best. Dim light blurs the ball and the numbers get a wider ± range or none at all.</li>
        <li><span className="text-chalk">One or a few swings per clip.</span> On the Record screen tap <span className="text-chalk">Upload a video</span> (the Record button opens a normal-speed camera) and pick the slo-mo speed you filmed at. If you pick wrong, Gapper notices and fixes it.</li>
      </ol>
      <p className="mt-3 text-[14px] text-chalk-3">
        Every speed shows a ± range. If something&apos;s off (no pitch in the shot, too dark), you&apos;ll see why instead of a number.
      </p>

      <h2 className="mt-8 head text-lg">What the live checks mean</h2>
      <ul className="mt-3 space-y-2 text-[15px] text-chalk-2">
        <li><span className="text-chalk">Lighting</span>: average brightness of the picture, and glare.</li>
        <li><span className="text-chalk">Full body</span>: the tracker can see your head, hands, hips and feet.</li>
        <li><span className="text-chalk">Distance</span>: how much of the picture you fill.</li>
        <li><span className="text-chalk">Camera angle</span>: your shoulders look wide in side view and narrow from behind or in front.</li>
        <li><span className="text-chalk">Steady phone</span>: the background shouldn&apos;t move.</li>
        <li><span className="text-chalk">Tracking speed</span>: frames per second the tracker keeps up with. 24+ is good.</li>
      </ul>
    </div>
  );
}
