"use client";
import { useEffect, useState } from "react";
import { Softball } from "./Softball";

/*
  Shared Gapper brand pieces used across screens: the count-up for jumbotron numbers, the broadcast crawl, the gap
  streak divider, the swing figure and the ball-flight diagram (illustrations only: no numbers, nothing measured).
*/

/** Counts up to `value` (about 0.9 s, eased). Jumps straight there for reduced motion. */
export function useCountUp(value: number | null, ms = 900): number | null {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = reduce ? 1 : Math.min(1, (t - t0) / ms);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return value === null ? null : shown;
}

/** A number that counts up on first view. */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return (
    <span className={className} aria-label={String(value)}>
      {v}
    </span>
  );
}

/** Broadcast crawl: the things Gapper reads, scrolling past like a ticker. Duplicated once so it loops seamlessly. */
export function Crawl({ items }: { items: string[] }) {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((t) => (
        <span key={t} className="flex items-center">
          <span className="brandline whitespace-nowrap px-5 text-[15px] tracking-[0.02em] text-chalk md:text-[17px]">{t}</span>
          <span className="h-2 w-2 rounded-full bg-optic" />
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden border-y border-white/[0.07] bg-[#0c1320] py-3.5" role="marquee" aria-label={items.join(", ")}>
      <div className="crawl motion-reduce:animate-none">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** The gap streak: a lime line drive ending in the ball. A divider and an accent. */
export function Streak({ className = "", width = 120 }: { className?: string; width?: number }) {
  return (
    <svg width={width} height="14" viewBox={`0 0 ${width} 14`} className={className} aria-hidden="true">
      <path d={`M2 11 L${width - 14} 5`} stroke="var(--color-optic)" strokeWidth="2.4" strokeLinecap="round" className="streak" style={{ ["--len" as string]: width }} />
      <circle cx={width - 8} cy="4.4" r="4.2" fill="var(--color-optic)" className="land" style={{ animationDelay: "0.7s" }} />
    </svg>
  );
}

/**
 * A hitter at contact, drawn the way Gapper sees one: the body as tracked points and lines, the front leg (what it
 * reads first) in lime, firm into a block, and the ball leaving the barrel.
 */
export function SwingFigure({ className = "" }: { className?: string }) {
  const J = {
    head: [150, 46],
    neck: [146, 70],
    sF: [132, 80],
    sB: [162, 84],
    eF: [116, 108],
    eB: [150, 112],
    hands: [124, 124],
    hipF: [128, 146],
    hipB: [154, 150],
    kF: [102, 190],
    aF: [88, 240],
    tF: [70, 244],
    kB: [170, 196],
    aB: [188, 236],
    tB: [200, 246],
  } as const;
  const seg = (a: keyof typeof J, b: keyof typeof J) => `M${J[a][0]} ${J[a][1]}L${J[b][0]} ${J[b][1]}`;
  const body = [seg("neck", "sF"), seg("neck", "sB"), seg("sF", "eF"), seg("eF", "hands"), seg("sB", "eB"), seg("eB", "hands"), seg("sF", "hipF"), seg("sB", "hipB"), seg("hipF", "hipB"), seg("hipB", "kB"), seg("kB", "aB"), seg("aB", "tB")].join("");
  const front = [seg("hipF", "kF"), seg("kF", "aF"), seg("aF", "tF")].join("");
  return (
    <svg viewBox="0 0 280 270" className={className} aria-hidden="true">
      {/* ground and the plate */}
      <path d="M20 250 H270" stroke="var(--color-line-2)" strokeWidth="1" />
      <path d="M118 250 l10 -5 h20 l10 5 z" fill="var(--color-chalk-3)" opacity="0.5" />
      {/* the bat through the zone */}
      <path d="M124 124 L40 116" stroke="var(--color-chalk-2)" strokeWidth="6" strokeLinecap="round" />
      <path d="M124 124 L40 116" stroke="var(--color-night)" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
      {/* ball off the barrel, up through the gap */}
      <path d="M44 112 L8 74" stroke="var(--color-optic)" strokeWidth="2.6" strokeLinecap="round" className="streak" style={{ ["--len" as string]: 60, animationDelay: "0.4s" }} />
      <circle cx="8" cy="72" r="6.5" fill="var(--color-optic)" className="land" style={{ animationDelay: "1.1s" }} />
      <path d={body} fill="none" stroke="var(--color-chalk)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={front} fill="none" stroke="var(--color-optic)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={J.head[0]} cy={J.head[1]} r="14" fill="none" stroke="var(--color-chalk)" strokeWidth="3" />
      {(Object.keys(J) as (keyof typeof J)[])
        .filter((k) => k !== "head")
        .map((k) => (
          <circle key={k} cx={J[k][0]} cy={J[k][1]} r={k === "kF" || k === "aF" || k === "hipF" ? 4.5 : 3.4} fill={k === "kF" || k === "aF" || k === "hipF" ? "var(--color-optic)" : "var(--color-chalk)"} />
        ))}
      {/* the knee angle Gapper reads, as an arc */}
      <path d="M95 176 A16 16 0 0 1 111 199" fill="none" stroke="var(--color-optic)" strokeWidth="1.5" strokeDasharray="2 3" />
    </svg>
  );
}

/** How a slo-mo clip turns into speeds: the pitch dropping in, contact, and the ball leaving at its launch angle. */
export function FlightDiagram({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 200" className={className} role="img" aria-label="Diagram: the pitch arcs down into the zone, the bat meets it, and the ball leaves at a launch angle. Gapper times both flights in slo-mo.">
      <path d="M10 186 H350" stroke="var(--color-line-2)" />
      {/* pitch arc */}
      <path d="M350 120 Q262 -10 190 140" fill="none" stroke="var(--color-chalk-3)" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
      {[0.15, 0.35, 0.55, 0.75].map((t) => {
        const x = (1 - t) * (1 - t) * 350 + 2 * (1 - t) * t * 262 + t * t * 190;
        const y = (1 - t) * (1 - t) * 120 + 2 * (1 - t) * t * -10 + t * t * 140;
        return <circle key={t} cx={x} cy={y} r="3.6" fill="var(--color-chalk-2)" opacity={0.35 + t * 0.6} />;
      })}
      {/* contact */}
      <circle cx="190" cy="140" r="9" fill="none" stroke="var(--color-chalk)" strokeWidth="1.5" />
      {/* exit line and launch angle */}
      <path d="M190 140 L30 88" stroke="var(--color-optic)" strokeWidth="3" strokeLinecap="round" className="streak" style={{ ["--len" as string]: 170, animationDelay: "0.3s" }} />
      <circle cx="30" cy="88" r="7" fill="var(--color-optic)" className="land" style={{ animationDelay: "1s" }} />
      <path d="M190 140 H110" stroke="var(--color-line-2)" strokeDasharray="3 4" />
      <path d="M128 140 A62 62 0 0 1 131 121" fill="none" stroke="var(--color-optic)" strokeWidth="1.6" />
      <text x="282" y="30" fill="var(--color-chalk-2)" fontSize="12">pitch speed</text>
      <text x="74" y="76" fill="var(--color-optic)" fontSize="12">exit velo</text>
      <text x="74" y="160" fill="var(--color-chalk-2)" fontSize="12">launch angle</text>
      <text x="200" y="168" fill="var(--color-chalk-2)" fontSize="12">bat speed</text>
    </svg>
  );
}

/**
 * The league patch: who Gapper is for, worn next to the logo. Slow-pitch softball only (see SITE.sport); it reads
 * like the sport patch on a jersey sleeve, not a marketing label.
 */
export function SportTag({ className = "" }: { className?: string }) {
  // A "hidden …:inline-flex" from the caller decides when it shows; otherwise it's always inline-flex.
  const display = /(^|\s)hidden(\s|$)/.test(className) ? "" : "inline-flex";
  return (
    <span className={`${display} items-center gap-1.5 rounded-full border border-line-2 bg-night-2/80 py-1 pl-1 pr-2.5 text-[12px] font-semibold leading-none text-chalk-2 ${className}`}>
      <Softball size={16} />
      Slow-pitch softball
    </span>
  );
}
