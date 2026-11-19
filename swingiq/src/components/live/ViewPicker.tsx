"use client";
import type { CameraView, Handedness } from "@/engine/types";

/** Top-down diagram: plate, hitter, pitch direction and where the phone goes. */
function Diagram({ view, hand }: { view: CameraView; hand: Handedness }) {
  // Hitter on the left of the plate for a righty (catcher's view), right for a lefty. Pitcher at the top.
  const hx = hand === "R" ? 34 : 86;
  const phone = view === "side" ? { x: hand === "R" ? 104 : 16, y: 52, r: hand === "R" ? 270 : 90 } : view === "behind" ? { x: 60, y: 96, r: 0 } : { x: 60, y: 10, r: 180 };
  return (
    <svg viewBox="0 0 120 106" className="h-24 w-full" aria-hidden="true">
      <path d="M60 4 v20" stroke="var(--color-chalk-3)" strokeWidth="1.5" strokeDasharray="2 3" />
      <path d="M56 22 l4 5 l4 -5" fill="none" stroke="var(--color-chalk-3)" strokeWidth="1.5" />
      <path d="M52 48 h16 v7 l-8 6 l-8 -6 z" fill="var(--color-chalk-2)" />
      <circle cx={hx} cy="54" r="7" fill="none" stroke="var(--color-chalk)" strokeWidth="2" />
      <path d={`M${hx - 9} 54 h18`} stroke="var(--color-chalk)" strokeWidth="2" />
      <g transform={`translate(${phone.x} ${phone.y}) rotate(${phone.r})`}>
        <rect x="-6" y="-9" width="12" height="18" rx="2.5" fill="var(--color-optic)" />
        <path d="M0 -9 L-14 -34 M0 -9 L14 -34" stroke="var(--color-optic)" strokeWidth="1" opacity="0.5" />
      </g>
    </svg>
  );
}

const VIEWS: { value: CameraView; label: string; tip: string; best: string }[] = [
  { value: "side", label: "Side", tip: "Across the plate, facing your chest", best: "Best overall: foot-down timing, stride, weight shift, back heel, head and hands" },
  { value: "behind", label: "Behind", tip: "Behind the plate, in line with the pitch", best: "Best for knees: front-leg block, back leg, stride direction. No stride length" },
  { value: "front", label: "Front", tip: "From the pitcher's side (behind a screen)", best: "Front-leg block and foot-down timing. No stride length" },
];

export function ViewPicker({ value, onChange, hand }: { value: CameraView; onChange: (v: CameraView) => void; hand: Handedness }) {
  return (
    <div role="radiogroup" aria-label="Camera view" className="grid grid-cols-3 gap-2">
      {VIEWS.map((v) => (
        <button
          key={v.value}
          type="button"
          role="radio"
          aria-checked={value === v.value}
          onClick={() => onChange(v.value)}
          className={`rounded-2xl border p-2 text-left transition ${value === v.value ? "border-optic bg-night-3" : "border-line bg-night-2 hover:border-chalk-3"}`}
        >
          <Diagram view={v.value} hand={hand} />
          <span className="mt-1 block px-1 text-[15px] font-bold text-chalk">{v.label}</span>
          <span className="block px-1 pb-1 text-[12px] leading-tight text-chalk-3">{v.tip}</span>
        </button>
      ))}
    </div>
  );
}

export function viewNote(v: CameraView) {
  return VIEWS.find((x) => x.value === v)!.best;
}
