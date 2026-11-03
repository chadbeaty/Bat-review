"use client";

// Header dropdowns are plain <details> elements. This closes them when you tap outside, tap a link inside,
// press Escape, open the other dropdown, or move to another page, so two menus never stay open together.

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const SELECTOR = "details[data-header-menu]";

function closeAll(except?: Element | null) {
  document.querySelectorAll<HTMLDetailsElement>(SELECTOR).forEach((d) => {
    if (d !== except) d.open = false;
  });
}

export function HeaderMenus() {
  const pathname = usePathname();

  useEffect(() => {
    closeAll();
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const menu = target?.closest(SELECTOR) ?? null;
      // A link or button inside the open panel (not the summary itself) finishes the menu's job.
      if (menu && target?.closest("a, button") && !target.closest("summary")) {
        closeAll();
        return;
      }
      closeAll(menu);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return null;
}
