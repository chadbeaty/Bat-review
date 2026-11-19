"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Softball } from "./Softball";
import { Sheet } from "./ui";

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

/** Wordmark: the pitch arc over the name, ball at the top of the arc. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="SwingIQ">
      <svg viewBox="0 0 32 22" width={compact ? 28 : 32} height={compact ? 19 : 22} aria-hidden="true">
        <path d="M2 20 Q16 -6 30 20" fill="none" stroke="var(--color-chalk-3)" strokeWidth="1.6" strokeDasharray="1.5 3" strokeLinecap="round" />
        <circle cx="20.5" cy="8" r="3.4" fill="var(--color-optic)" />
      </svg>
      {!compact && (
        <span className="display text-[17px] leading-none tracking-tight">
          Swing<span className="text-optic">IQ</span>
        </span>
      )}
    </span>
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
          <Link href="/record" onClick={onClose} className="press group flex items-center gap-4 rounded-xl bg-optic px-4 py-4 text-optic-ink">
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
    <div className="mx-auto min-h-dvh max-w-[34rem] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:max-w-[66rem] md:pb-14 md:pl-56">
      <main className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-10 md:pt-10">{children}</main>

      {/* Phone: a solid bar under the thumb, one action in the middle. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[#090c10] pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto flex max-w-[34rem] items-end justify-between px-1">
          {TABS.map((t) =>
            t.href === "#new" ? (
              <li key={t.href} className="-mt-6">
                <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className="group flex flex-col items-center gap-1 px-2">
                  <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-[#090c10] ring-1 ring-line transition group-active:scale-95">
                    <Softball size={52} className="drop-shadow-[0_0_16px_rgba(228,245,66,0.35)]" />
                  </span>
                  <span className="text-[11px] font-semibold text-optic">New swing</span>
                </button>
              </li>
            ) : (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active(t.href) ? "page" : undefined}
                  className={`relative flex min-w-16 flex-col items-center gap-1 px-2 pb-2.5 pt-3 text-[11px] transition ${active(t.href) ? "text-chalk" : "text-chalk-3 hover:text-chalk-2"}`}
                >
                  {active(t.href) && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-optic" aria-hidden="true" />}
                  {t.icon}
                  <span className={active(t.href) ? "font-semibold" : undefined}>{t.label}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>

      {/* Desktop: a left rail with the wordmark, the action, and labeled sections. */}
      <nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-line bg-[#090c10] px-4 py-7 md:flex">
        <Link href="/" className="mb-8 px-2">
          <Wordmark />
        </Link>
        <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className="press mb-6 flex items-center gap-3 rounded-xl bg-optic px-3 py-3 font-bold text-optic-ink">
          <Softball size={26} />
          New swing
        </button>
        <ul className="space-y-1">
          {[...TABS.filter((t) => t.href !== "#new").slice(0, 3), { href: "/bats", label: "Bat DNA", icon: <BatIcon /> }, TABS[4]].map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active(t.href) ? "page" : undefined}
                className={`press flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] ${active(t.href) ? "bg-night-3 text-chalk" : "text-chalk-3 hover:bg-night-2 hover:text-chalk-2"}`}
              >
                <span className={active(t.href) ? "text-optic" : undefined}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-1 px-3 text-[13px] text-chalk-3">
          <Link href="/guide" className="block hover:text-chalk-2">Camera setup guide</Link>
          <Link href="/how-it-works" className="block hover:text-chalk-2">How SwingIQ measures</Link>
        </div>
      </nav>

      <NewSwingSheet open={sheet} onClose={close} />
    </div>
  );
}
