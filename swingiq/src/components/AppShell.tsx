"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { LogoMark, Wordmark } from "./Logo";
import { Softball } from "./Softball";
import { Sheet } from "./ui";

export { Wordmark };

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4 5h16v8l-8 6-8-6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function FramesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M19 8v8M22 10v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function ArcIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 19 Q12 -3 21 19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="17.5" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}
function HelmetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4 15a8 8 0 0 1 16 0v1H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 16h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function BatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M5 19l11.5-11.5a2.5 2.5 0 0 1 3.5 3.5L8.5 22.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" transform="translate(0 -3)" />
      <path d="M3.5 20.5l2-2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: <PlateIcon /> },
  { href: "/swings", label: "Swings", icon: <FramesIcon /> },
  { href: "#new", label: "New swing", icon: null },
  { href: "/progress", label: "Progress", icon: <ArcIcon /> },
  { href: "/profile", label: "Profile", icon: <HelmetIcon /> },
];

function NewSwingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="New swing">
      <ul className="space-y-2.5">
        <li>
          <Link href="/record" onClick={onClose} className="press group flex items-center gap-4 rounded-xl bg-optic px-4 py-4 text-optic-ink hover:bg-optic-2">
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <rect x="2" y="7" width="19" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M21 13l7-4v12l-7-4z" fill="currentColor" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="display block text-[19px] leading-tight">Record or upload</span>
              <span className="block text-[13px] font-semibold opacity-75">Every frame analyzed. Slo-mo adds exit velo and bat speed.</span>
            </span>
          </Link>
        </li>
        <li>
          <Link href="/live" onClick={onClose} className="press flex items-center gap-4 rounded-xl border border-line-2 bg-night-3 px-4 py-4 hover:border-chalk-3">
            <Softball size={30} />
            <span className="min-w-0 flex-1">
              <span className="display block text-[19px] leading-tight">Live cage session</span>
              <span className="block text-[13px] text-chalk-3">Phone on the fence. A voice cue after every swing.</span>
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
  const immersive = path === "/live";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  if (immersive) return <>{children}</>;

  return (
    <div className="mx-auto min-h-dvh max-w-[34rem] pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:max-w-[68rem] md:pb-14 md:pl-60">
      <main className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-10 md:pt-10">{children}</main>

      {/* Phone: a floating bar under the thumb, the mark in the middle as the one action. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[32rem] rounded-[1.6rem] border border-white/[0.08] bg-[#172133] shadow-[0_20px_50px_-12px_rgb(3_6_12/0.95),inset_0_1px_0_rgb(255_255_255/0.05)] md:hidden"
      >
        <ul className="flex items-center justify-between px-1.5">
          {TABS.map((t) =>
            t.href === "#new" ? (
              <li key={t.href} className="-my-3">
                <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label="New swing" className="grid h-[62px] w-[62px] place-items-center rounded-full bg-optic shadow-[0_0_0_5px_var(--color-night),0_10px_28px_-8px_rgb(183_243_74/0.45)] transition active:scale-95">
                  <LogoMark size={36} fill="var(--color-optic-ink)" ball="var(--color-optic-ink)" />
                </button>
              </li>
            ) : (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active(t.href) ? "page" : undefined}
                  className={`relative flex min-w-[3.9rem] flex-col items-center gap-1 px-1.5 pb-2.5 pt-3 text-[11px] font-medium transition ${active(t.href) ? "text-chalk" : "text-chalk-3 hover:text-chalk-2"}`}
                >
                  <span className={active(t.href) ? "text-optic" : undefined}>{t.icon}</span>
                  <span>{t.label}</span>
                  {active(t.href) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-optic" aria-hidden="true" />}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      {/* Desktop: a left rail with the wordmark, the action, and labeled sections. */}
      <nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-[#0d1421] px-4 py-7 md:flex">
        <Link href="/" className="mb-9 px-2" aria-label="Gapper home">
          <Wordmark height={21} />
        </Link>
        <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className="press mb-7 flex items-center justify-center gap-2.5 rounded-xl bg-optic px-3 py-3 font-semibold text-optic-ink hover:bg-optic-2">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          New swing
        </button>
        <ul className="space-y-1">
          {[...TABS.filter((t) => t.href !== "#new").slice(0, 3), { href: "/bats", label: "Bat DNA", icon: <BatIcon /> }, TABS[4]].map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active(t.href) ? "page" : undefined}
                className={`press flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] ${active(t.href) ? "bg-white/[0.06] text-chalk shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]" : "text-chalk-3 hover:bg-white/[0.03] hover:text-chalk-2"}`}
              >
                <span className={active(t.href) ? "text-optic" : undefined}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-1 px-3 text-[13px] text-chalk-3">
          <Link href="/guide" className="block hover:text-chalk-2">Camera setup guide</Link>
          <Link href="/how-it-works" className="block hover:text-chalk-2">How Gapper measures</Link>
        </div>
      </nav>

      <NewSwingSheet open={sheet} onClose={close} />
    </div>
  );
}
