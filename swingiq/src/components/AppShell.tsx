"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { GapMark, LockupH, Wordmark } from "./Logo";
import { Softball } from "./Softball";
import { usePlayers } from "./PlayerProvider";
import { Sheet } from "./ui";

export { Wordmark };

/*
  Gapper icons: drawn on a 24 grid with a 1.8 stroke and squared-off ends, the same cut-corner geometry as the
  wordmark. No stock icon set.
*/
const I = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinejoin: "miter" as const };

/** Home: the plate seen from above, point down. */
function PlateIcon() {
  return (
    <svg {...I}>
      <path d="M5 5h14v8l-7 6-7-6z" />
    </svg>
  );
}
/** Analyze: a swing frame with the tracked line through it. */
function AnalyzeIcon() {
  return (
    <svg {...I}>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M7.5 16.5l3.5-4 3 2 3.5-5" strokeLinecap="square" />
    </svg>
  );
}
/** Improve: the outfield blocks rising left to right. */
function ImproveIcon() {
  return (
    <svg {...I}>
      <path d="M4 20v-5h3.5v5zM10.25 20v-8h3.5v8zM16.5 20V8H20v12z" />
      <path d="M4 9.5L12 4l2.5 2" strokeLinecap="square" />
    </svg>
  );
}
/** Profile: a batting helmet with the ear flap. */
function HelmetIcon() {
  return (
    <svg {...I}>
      <path d="M4 16a8 8 0 0 1 16 0v1H4z" />
      <path d="M14 17h7M9 13v4" strokeLinecap="square" />
    </svg>
  );
}
/** Bat DNA: a composite barrel and handle. */
function BatIcon() {
  return (
    <svg {...I}>
      <path d="M14.2 3.6l6.2 6.2-9.6 9.6-2.4.6-.6-.6.6-2.4z" />
      <path d="M8.4 15.6L4 20" strokeLinecap="square" strokeWidth="2.2" />
    </svg>
  );
}
/** Record: a filled dot inside a ring. */
export function RecordIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="13" cy="13" r="6" fill="currentColor" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: <PlateIcon /> },
  { href: "/swings", label: "Analyze", icon: <AnalyzeIcon /> },
  { href: "#new", label: "Record", icon: null },
  { href: "/progress", label: "Improve", icon: <ImproveIcon /> },
  { href: "/profile", label: "Profile", icon: <HelmetIcon /> },
];

function NewSwingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Record a swing">
      <ul className="space-y-2.5">
        <li>
          <Link href="/live" onClick={onClose} className="press group flex items-center gap-4 rounded-xl bg-optic px-4 py-4 text-optic-ink hover:bg-optic-2">
            <Softball size={30} />
            <span className="min-w-0 flex-1">
              <span className="brandline block text-[20px] leading-tight">Hit live</span>
              <span className="block text-[13px] font-semibold opacity-75">Prop up your phone. Feedback after every swing.</span>
            </span>
          </Link>
        </li>
        <li>
          <Link href="/record" onClick={onClose} className="press flex items-center gap-4 rounded-xl border border-line-2 bg-night-3 px-4 py-4 hover:border-clay/60">
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <path d="M15 20V5M9 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
              <path d="M4 19v7h22v-7" fill="none" stroke="currentColor" strokeWidth="2.6" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="brandline block text-[20px] leading-tight">Upload a video</span>
              <span className="block text-[13px] text-chalk-3">Or film one now. Slo-mo clips measure exit velo and bat speed.</span>
            </span>
          </Link>
        </li>
      </ul>
    </Sheet>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  const close = useCallback(() => setSheet(false), []);
  const { ready, player } = usePlayers();
  const immersive = path === "/live";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/swings" && path === "/compare"));

  if (immersive) return <>{children}</>;
  // Setup (and "/" before a hitter exists) own the whole viewport: no app chrome.
  if (path === "/start" || (path === "/" && ready && !player)) return <main>{children}</main>;

  return (
    <div className="mx-auto min-h-dvh max-w-[34rem] pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:max-w-[84rem] md:pb-14 md:pl-64">
      <main className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-10 md:pt-10">{children}</main>

      {/* Phone: a carbon bar under the thumb; the lime Record button in the middle is the one action. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0e0f11]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <span className="alloy absolute inset-x-0 top-0 h-px opacity-25" aria-hidden="true" />
        <ul className="mx-auto flex max-w-[34rem] items-end justify-between px-2">
          {TABS.map((t) =>
            t.href === "#new" ? (
              <li key={t.href} className="-mt-5 flex flex-col items-center pb-2">
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  aria-haspopup="dialog"
                  aria-label="Record a swing"
                  className="grid h-[60px] w-[60px] place-items-center rounded-full bg-optic text-optic-ink shadow-[0_0_0_4px_#0e0f11,0_12px_30px_-8px_rgb(196_241_53/0.5)] transition active:scale-95"
                >
                  <RecordIcon />
                </button>
                <span className="mt-1 text-[11px] font-extrabold uppercase italic tracking-[0.06em] text-chalk">Record</span>
              </li>
            ) : (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active(t.href) ? "page" : undefined}
                  className={`relative flex min-w-[3.9rem] flex-col items-center gap-1 px-1.5 pb-2.5 pt-3 text-[11px] font-semibold transition ${active(t.href) ? "text-chalk" : "text-chalk-3 hover:text-chalk-2"}`}
                >
                  {active(t.href) && <span className="absolute top-0 h-[3px] w-7 rounded-b bg-optic" aria-hidden="true" />}
                  <span className={active(t.href) ? "text-optic" : undefined}>{t.icon}</span>
                  <span>{t.label}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      {/* Desktop: a carbon rail with the lockup, the Record action, and the loop as labeled sections. */}
      <nav aria-label="Main" className="carbon fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] px-4 py-7 md:flex">
        <Link href="/" className="mb-2 px-2" aria-label="Gapper home">
          <LockupH height={30} />
        </Link>
        <span className="mb-8 px-2 text-[11px] font-extrabold uppercase italic tracking-[0.08em] text-optic">Built for slowpitch</span>
        <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className="btn-label press mb-8 flex items-center justify-center gap-2.5 rounded-lg bg-optic px-3 py-3 text-[14px] text-optic-ink hover:bg-optic-2">
          <RecordIcon size={18} />
          Record a swing
        </button>
        <ul className="space-y-1">
          {[TABS[0], TABS[1], TABS[3], { href: "/bats", label: "Bat DNA", icon: <BatIcon /> }, TABS[4]].map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active(t.href) ? "page" : undefined}
                className={`press relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] ${active(t.href) ? "bg-white/[0.06] text-chalk" : "text-chalk-3 hover:bg-white/[0.03] hover:text-chalk-2"}`}
              >
                {active(t.href) && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-optic" aria-hidden="true" />}
                <span className={active(t.href) ? "text-optic" : undefined}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-3 px-3">
          <GapMark size={44} ink="var(--color-night-4)" accent="var(--color-optic)" />
          <div className="space-y-1 text-[13px] text-chalk-3">
            <Link href="/guide" className="block hover:text-chalk-2">Camera setup guide</Link>
            <Link href="/how-it-works" className="block hover:text-chalk-2">How Gapper measures</Link>
          </div>
        </div>
      </nav>

      <NewSwingSheet open={sheet} onClose={close} />
    </div>
  );
}
