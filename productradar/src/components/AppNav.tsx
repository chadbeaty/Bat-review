"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "Overview" },
  { href: "/opportunities", label: "Early opportunities" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/submit", label: "Submit a URL" },
];
const ADMIN = [
  { href: "/admin/creators", label: "Creators" },
  { href: "/admin/sources", label: "Data sources" },
  { href: "/admin/products", label: "Products & matching" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/usage", label: "Usage & costs" },
  { href: "/admin/settings", label: "Settings" },
];

export function AppNav({ isOwner, email }: { isOwner: boolean; email: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const link = (i: { href: string; label: string }) => (
    <Link
      key={i.href}
      href={i.href}
      className={`block rounded-md px-3 py-1.5 text-sm ${active(i.href) ? "bg-accent-wash font-semibold text-accent-ink" : "text-ink-2 hover:bg-slate-100"}`}
    >
      {i.label}
    </Link>
  );
  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <Link href="/" className="mb-4 flex items-center gap-2 px-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-white">PR</span>
        <span className="text-sm font-semibold">Product Radar</span>
      </Link>
      {MAIN.map(link)}
      {isOwner && (
        <>
          <p className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Admin</p>
          {ADMIN.map(link)}
        </>
      )}
      <div className="mt-auto border-t border-line px-3 pt-3">
        <p className="truncate text-xs text-muted" title={email}>{email}</p>
        <form action="/auth/sign-out" method="post">
          <button className="mt-1 text-xs font-medium text-accent hover:underline">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
