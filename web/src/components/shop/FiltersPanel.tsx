"use client";

import { useState } from "react";

/** Filters column: always visible on large screens, behind a "Filters" button on phones and tablets. */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid content-start gap-3">
      <button
        type="button"
        className="btn btn-outline w-full justify-between lg:hidden"
        aria-expanded={open}
        aria-controls="shop-filters"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Filters{activeCount ? ` (${activeCount})` : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id="shop-filters" className={open ? "block" : "hidden lg:block"}>
        {children}
      </div>
    </div>
  );
}
