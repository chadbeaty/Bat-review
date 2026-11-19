"use client";
import Link from "next/link";
import type { Player } from "@/lib/store/types";
import { Crawl, FlightDiagram, Streak, SwingFigure } from "./brand";
import { Crest, LockupH, Patch } from "./Logo";
import { PlayerForm } from "./PlayerForm";

const READS = [
  "Foot-down timing",
  "Stride",
  "Front-leg block",
  "Weight shift",
  "Hips before hands",
  "Hand path",
  "Head movement",
  "Swing time",
  "Exit velo",
  "Launch angle",
  "Pitch speed",
  "Bat speed",
];

/** Full-width band inside the landing (the landing has no app chrome, so it owns the whole viewport). */
function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[72rem] px-5 md:px-10 ${className}`}>{children}</div>;
}

/**
 * getgapper.com for someone who hasn't set up a hitter yet: the brand, what it reads, how speeds work, then setup.
 * Illustrations only; no numbers here pretend to be anyone's results.
 */
export function Landing({ onSave, storageOk }: { onSave: (p: Player) => Promise<void> | void; storageOk: boolean }) {
  return (
    <div className="animate-fade overflow-x-clip">
      {/* Hero: the outfield under the lights */}
      <section className="turf relative overflow-hidden pb-14 md:pb-20">
        <Wrap className="flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))]">
          <LockupH height={30} />
          <nav aria-label="Site" className="flex items-center gap-1 text-[14px]">
            <Link href="/how-it-works" className="rounded-lg px-3 py-2 text-chalk-2 hover:text-chalk">How it measures</Link>
            <Link href="/sign-in" className="hidden rounded-lg px-3 py-2 text-chalk-2 hover:text-chalk sm:inline">Sign in</Link>
          </nav>
        </Wrap>
        <Wrap className="mt-8 grid items-center gap-10 md:mt-12 md:grid-cols-[1.35fr_1fr]">
          <div className="order-2 md:order-1">
            <h1>
              <span className="brandline slant block text-[4.1rem] leading-[0.84] sm:text-[5.2rem] md:text-[6.4rem]">
                Own{" "}
                <br />
                the gap<span className="text-optic">.</span>
              </span>
              <span className="mt-5 block text-[1.3rem] font-semibold leading-tight text-chalk [font-stretch:110%] md:text-[1.55rem]">Know your swing. Own your game.</span>
            </h1>
            <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed text-chalk-2">
              Gapper is the hitting lab in your pocket. Prop up your phone and swing: it catches every rep, reads your legs and feet first, and tells you the one thing to fix.
              Film in slo-mo and it clocks exit velo and bat speed too.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#start" className="cut press inline-flex min-h-14 items-center gap-3 rounded-xl bg-optic pl-6 pr-8 text-[17px] font-bold text-optic-ink hover:bg-optic-2">
                Start swinging
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h11M10 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
              <Link href="/how-it-works" className="press inline-flex min-h-14 items-center rounded-xl border border-white/15 px-5 text-chalk hover:border-white/30">
                See how it measures
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-chalk-3">Free. No account, no extra gear. Your swings stay on your phone.</p>
          </div>
          <div className="order-1 flex justify-center md:order-2 md:justify-end">
            <div className="relative">
              <Crest width={300} animate className="relative h-auto w-[190px] drop-shadow-[0_30px_40px_rgb(0_0_0/0.45)] sm:w-[240px] md:w-[300px]" />
            </div>
          </div>
        </Wrap>
      </section>

      <Crawl items={READS} />

      {/* Every swing has a story */}
      <section>
        <Wrap className="grid items-center gap-8 py-16 md:grid-cols-2 md:gap-14 md:py-24">
          <div>
            <Streak width={110} />
            <h2 className="display slant mt-4 text-[2.4rem] leading-[0.95] md:text-[3.2rem]">Every swing has a story.</h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-chalk-2">
              Gapper tracks 33 points on your body in every frame, right on the phone. It finds the swing on its own and splits it into load, stride, launch and contact. Then it
              reads it the way a slow-pitch coach would: legs and feet first.
            </p>
            <ul className="mt-6 space-y-3 text-[15px]">
              {[
                ["Foot down on time", "Slow-pitch timing: the front heel lands about two tenths of a second before contact."],
                ["Front side firm", "The front knee straightens into a block and the hips turn against it."],
                ["One fix, one drill", "A score for six skill areas, the single change that matters most, and a drill for it."],
              ].map(([h, p]) => (
                <li key={h} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-optic" aria-hidden="true" />
                  <span>
                    <span className="font-semibold text-chalk">{h}.</span> <span className="text-chalk-2">{p}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="surface cut relative overflow-hidden rounded-2xl p-6">
            <SwingFigure className="mx-auto w-full max-w-[420px]" />
            <p className="mt-2 text-center text-[13px] text-chalk-3">What Gapper sees: your body as tracked points, the front leg first.</p>
          </div>
        </Wrap>
      </section>

      {/* Turn data into distance */}
      <section className="turf">
        <Wrap className="grid items-center gap-8 py-16 md:grid-cols-[1fr_1.1fr] md:gap-14 md:py-24">
          <div className="md:order-2">
            <Streak width={110} />
            <h2 className="display slant mt-4 text-[2.4rem] leading-[0.95] md:text-[3.2rem]">Turn data into distance.</h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-chalk-2">
              Film in your phone&apos;s Slo-mo and Gapper follows the ball frame by frame: how fast the pitch came in, how fast it left, the angle it took, and what that says about
              your bat speed. Every number comes with a ± range, and nothing is shown that one camera can&apos;t back up.
            </p>
            <Link href="/guide#speed" className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-optic">
              How to film for speed
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </Link>
          </div>
          <div className="md:order-1">
            <FlightDiagram className="w-full" />
          </div>
        </Wrap>
      </section>

      {/* Setup */}
      <section id="start" className="scroll-mt-4">
        <Wrap className="grid gap-10 py-16 md:grid-cols-[1fr_1.1fr] md:items-start md:py-24">
          <div>
            <h2 className="display slant text-[2.4rem] leading-[0.95] md:text-[3.2rem]">Step in.</h2>
            <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-chalk-2">Set up your hitter and record your first swing. Takes a minute. Everything stays on this phone; no account, no sign-up.</p>
            <p className="mt-6 text-[13px] leading-relaxed text-chalk-3">
              Built for slow-pitch softball first; baseball is on the way. Camera estimates show how sure they are.{" "}
              <Link href="/how-it-works" className="text-chalk-2 underline">
                Here&apos;s the honest version.
              </Link>
            </p>
          </div>
          <div className="surface boxed cut rounded-2xl p-5 md:p-6">
            {!storageOk && <p className="mb-4 rounded-xl border border-amber/40 bg-amber-wash px-4 py-3 text-sm text-chalk">This browser is blocking storage (private mode?). Swings won&apos;t be saved.</p>}
            <h3 className="head text-[19px]">Set up your hitter</h3>
            <p className="mb-5 mt-1 text-[14px] text-chalk-3">Name, which side you hit from, and your height (it turns pixels into inches).</p>
            <PlayerForm onSave={onSave} submitLabel="Let's hit" />
          </div>
        </Wrap>
      </section>

      <footer className="border-t border-white/[0.07]">
        <Wrap className="flex flex-col items-center gap-6 py-12 md:flex-row md:justify-between">
          <div className="flex items-center gap-5">
            <Patch width={84} />
            <div>
              <LockupH height={26} />
              <p className="mt-2 text-[13px] text-chalk-3">Hitting analytics on your phone.</p>
            </div>
          </div>
          <div className="flex gap-5 text-[13px] text-chalk-3">
            <Link href="/how-it-works" className="hover:text-chalk-2">How it measures</Link>
            <Link href="/guide" className="hover:text-chalk-2">Camera setup</Link>
            <Link href="/privacy" className="hover:text-chalk-2">Privacy</Link>
            <Link href="/sign-in" className="hover:text-chalk-2">Sign in</Link>
          </div>
        </Wrap>
      </footer>
    </div>
  );
}
