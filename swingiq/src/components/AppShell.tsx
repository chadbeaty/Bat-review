"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Softball } from "./Softball";

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M4 5h16v8l-8 6-8-6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function FramesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19 8v8M22 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ArcIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M3 19 Q12 -3 21 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17.5" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}
function HelmetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M4 15a8 8 0 0 1 16 0v1H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 16h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: <PlateIcon /> },
  { href: "/swings", label: "My Swings", icon: <FramesIcon /> },
  { href: "/live", label: "Live", icon: null },
  { href: "/progress", label: "Progress", icon: <ArcIcon /> },
  { href: "/profile", label: "Profile", icon: <HelmetIcon /> },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const immersive = path === "/live";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  if (immersive) return <>{children}</>;

  return (
    <div className="mx-auto min-h-dvh max-w-[34rem] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:max-w-5xl md:pb-12 md:pl-28">
      <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pt-10">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/92 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-y-0 md:left-0 md:right-auto md:w-24 md:border-r md:border-t-0 md:pb-0"
      >
        <ul className="mx-auto flex max-w-[34rem] items-end justify-between px-2 md:h-full md:flex-col md:items-center md:justify-center md:gap-6">
          {TABS.map((t) =>
            t.href === "/live" ? (
              <li key={t.href} className="-mt-7 md:order-first md:mt-0 md:mb-6">
                <Link href="/live" className="group flex flex-col items-center gap-1" aria-label="Start live session">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-night ring-4 ring-night transition group-active:scale-95">
                    <Softball size={60} className="drop-shadow-[0_0_18px_rgba(228,245,66,0.35)]" />
                  </span>
                  <span className="text-[11px] font-semibold text-optic">Live</span>
                </Link>
              </li>
            ) : (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active(t.href) ? "page" : undefined}
                  className={`flex min-w-16 flex-col items-center gap-1 px-2 py-2.5 text-[11px] ${active(t.href) ? "text-chalk" : "text-chalk-3 hover:text-chalk-2"}`}
                >
                  {t.icon}
                  <span className={active(t.href) ? "font-semibold" : undefined}>{t.label}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </div>
  );
}
