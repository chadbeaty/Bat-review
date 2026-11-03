"use client";

import { useEffect, useState } from "react";
import { CloseIcon, FilterIcon } from "@/components/icons";

/**
 * Filters: a column on large screens; on phones a "Filters" button that opens a slide-up sheet. The form inside is
 * a plain GET form with its own Apply button, so applying reloads the page with the filters in the URL.
 */
export function FiltersPanel({ activeCount, resultCount, children }: { activeCount: number; resultCount?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="grid content-start gap-3">
      <button
        type="button"
        className="btn btn-outline min-h-11 w-full justify-between lg:hidden"
        aria-expanded={open}
        aria-controls="shop-filters"
        onClick={() => setOpen(true)}
        data-testid="open-filters"
      >
        <span className="inline-flex items-center gap-2">
          <FilterIcon size={18} />
          Filters{activeCount ? ` (${activeCount})` : ""}
        </span>
        <span aria-hidden="true">+</span>
      </button>
      {open && <div className="fixed inset-0 z-40 bg-ink/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div
        id="shop-filters"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Filters" : undefined}
        className={
          open
            ? "fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain border-t-[3px] border-ink bg-paper px-4 pt-3 shadow-[0_-4px_0_var(--brand-ink)] lg:static lg:max-h-none lg:overflow-visible lg:border-0 lg:p-0 lg:shadow-none"
            : "hidden lg:block"
        }
        style={open ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
      >
        {open && (
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <p className="disp text-xl">Filters{typeof resultCount === "number" ? <span className="ml-2 font-mono text-xs normal-case not-italic text-ink-soft">{resultCount} listings</span> : null}</p>
            <button type="button" className="grid h-11 w-11 place-items-center border-2 border-ink bg-surface" onClick={() => setOpen(false)} aria-label="Close filters">
              <CloseIcon size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
