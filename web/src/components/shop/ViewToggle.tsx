"use client";

// Rack / list toggle. The links carry ?view= (so the choice is shareable) and a cookie remembers it for next time.

import Link from "next/link";
import { useEffect } from "react";
import { VIEW_COOKIE, type ViewMode } from "@/lib/view-mode-shared";
import { FenceIcon } from "@/components/icons";

export function ViewToggle({ view, hrefs, rackLabel = "Rack" }: { view: ViewMode; hrefs: Record<ViewMode, string>; rackLabel?: string }) {
  useEffect(() => {
    try {
      document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the URL still carries the choice.
    }
  }, [view]);
  const item = (mode: ViewMode, label: string) => (
    <Link
      key={mode}
      href={hrefs[mode]}
      replace
      scroll={false}
      aria-current={view === mode ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider no-underline ${
        view === mode ? "bg-ink text-surface" : "bg-surface text-ink hover:bg-paper"
      }`}
    >
      {mode === "rack" ? <FenceIcon size={15} /> : <ListIcon />}
      {label}
    </Link>
  );
  return (
    <nav aria-label="Layout" className="inline-flex divide-x-2 divide-ink overflow-hidden rounded-sm border-2 border-ink">
      {item("rack", rackLabel)}
      {item("list", "List")}
    </nav>
  );
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true" focusable="false">
      <path d="M3 6H21M3 12H21M3 18H21" />
    </svg>
  );
}
