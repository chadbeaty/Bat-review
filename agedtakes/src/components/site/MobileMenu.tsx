"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function MobileMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close when the route changes (adjusting state during render, as React recommends).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={panel} className="relative lg:hidden">
      <button type="button" className="btn btn-sm" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute right-0 top-full z-40 mt-2 w-64 border border-ink bg-paper p-2 shadow-[6px_6px_0_0_rgba(21,19,15,0.12)]">
          {[...items, { href: "/submit", label: "Submit a receipt" }, { href: "/search", label: "Search" }].map((item) => (
            <Link key={item.href} href={item.href} className="block border-b border-rule px-3 py-3 font-mono text-xs uppercase tracking-[0.12em] last:border-0 hover:text-red">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
