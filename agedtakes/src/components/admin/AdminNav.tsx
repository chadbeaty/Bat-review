"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminArea } from "@/lib/auth/roles";

export function AdminNav({ areas }: { areas: AdminArea[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = [...new Set(areas.map((a) => a.group))];
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <>
      <button type="button" className="btn btn-sm mx-4 mb-3 lg:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close menu" : "Newsroom menu"}</button>
      <nav aria-label="Newsroom" className={`${open ? "block" : "hidden"} px-2 pb-4 lg:block`}>
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <p className="kicker px-2 py-1">{g}</p>
            <ul>
              {areas.filter((a) => a.group === g).map((a) => (
                <li key={a.href}>
                  <Link href={a.href} onClick={() => setOpen(false)} aria-current={active(a.href) ? "page" : undefined}
                    className={`block px-2 py-1.5 text-[0.95rem] ${active(a.href) ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-3"}`}>
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
