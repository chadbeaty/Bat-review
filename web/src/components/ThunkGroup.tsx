"use client";

// Stamps "thunk" in once when scrolled into view. Everything is fully visible with no JS and with reduced motion:
// the hidden starting state is only applied (by this effect) to groups that are still below the fold.

import { useEffect, useRef, type ReactNode } from "react";

export function ThunkGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top < window.innerHeight * 0.8) return; // already on screen (or passed): leave it visible
    el.classList.add("thunk-armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("thunk-go");
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
