import type { SwingPhases } from "@/engine/types";
import { FOOT_DOWN_WINDOW } from "@/lib/insights";

/**
 * The swing as a line score: load, stride, foot down, launch, contact, laid out in time with contact at the right.
 * The slow-pitch window for landing the front foot (0.14–0.38 s before contact) is shaded, so on-time reads at a glance.
 * The view covers the last ~0.7 s, where the swing happens; anything earlier (a long load) is pinned to the left edge
 * with its time, so the important part never gets squeezed.
 */
export function PhaseLine({ phases }: { phases: SwingPhases }) {
  const W = 340;
  const H = 128;
  const pad = { l: 16, r: 16 };
  const c = phases.contact;
  const events = [
    { key: "load", label: "Load", t: phases.loadStart },
    { key: "stride", label: "Stride", t: phases.strideStart },
    { key: "foot", label: "Foot down", t: phases.footPlant },
    { key: "launch", label: "Launch", t: phases.launch },
    { key: "contact", label: "Contact", t: c },
  ].filter((e): e is { key: string; label: string; t: number } => e.t !== null && e.t <= c + 1);
  const start = c - 700;
  const end = c + 70;
  const xr = (t: number) => pad.l + ((Math.max(start, t) - start) / (end - start)) * (W - pad.l - pad.r);
  const y = 66;
  const foot = phases.footPlant;
  const lead = foot !== null ? c - foot : null;
  const onTime = lead !== null && lead >= FOOT_DOWN_WINDOW.lo && lead <= FOOT_DOWN_WINDOW.hi;

  // Label placement: four lanes (two above, two below); each label takes the first lane with room.
  const lanes = [
    { dy: -22, last: -Infinity },
    { dy: 26, last: -Infinity },
    { dy: -40, last: -Infinity },
    { dy: 44, last: -Infinity },
  ];
  const placed = events.map((e) => {
    const x = xr(e.t);
    const text = e.key === "contact" ? e.label : `${e.label} ${((e.t - c) / 1000).toFixed(2)}s`;
    const width = text.length * 5.6 + 6;
    const lane = lanes.find((l) => x - width / 2 > l.last + 4) ?? lanes[lanes.length - 1];
    lane.last = x + width / 2;
    return { ...e, x, text, dy: lane.dy, clipped: e.t < start };
  });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Swing timeline. ${events.map((e) => `${e.label} ${((e.t - c) / 1000).toFixed(2)} s`).join(", ")}.`}>
        {/* foot-down window */}
        <rect x={xr(c - FOOT_DOWN_WINDOW.hi)} y={y - 10} width={xr(c - FOOT_DOWN_WINDOW.lo) - xr(c - FOOT_DOWN_WINDOW.hi)} height={20} rx="4" fill="var(--color-optic)" fillOpacity="0.08" stroke="var(--color-optic)" strokeOpacity="0.3" strokeDasharray="2 3" />
        <text x={(xr(c - FOOT_DOWN_WINDOW.hi) + xr(c - FOOT_DOWN_WINDOW.lo)) / 2} y={10} textAnchor="middle" fontSize="9.5" fill="var(--color-optic)" fillOpacity="0.8">foot-down window</text>
        <line x1={xr(c - FOOT_DOWN_WINDOW.hi)} x2={xr(c - FOOT_DOWN_WINDOW.hi)} y1={14} y2={y - 11} stroke="var(--color-optic)" strokeOpacity="0.25" />
        <line x1={xr(c - FOOT_DOWN_WINDOW.lo)} x2={xr(c - FOOT_DOWN_WINDOW.lo)} y1={14} y2={y - 11} stroke="var(--color-optic)" strokeOpacity="0.25" />
        {/* time grid */}
        {[-600, -400, -200, 0].map((t) => (
          <g key={t}>
            <line x1={xr(c + t)} x2={xr(c + t)} y1={y - 3} y2={y + 3} stroke="var(--color-line-2)" />
            <text x={xr(c + t)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--color-chalk-3)">{t === 0 ? "contact" : `${(t / 1000).toFixed(1)}s`}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--color-line-2)" strokeWidth="1.5" />
        {phases.strideStart !== null && foot !== null && (
          <line x1={xr(phases.strideStart)} x2={xr(foot)} y1={y} y2={y} stroke="var(--color-chalk-2)" strokeWidth="3" strokeLinecap="round" />
        )}
        <line x1={xr(foot ?? phases.launch)} x2={xr(c)} y1={y} y2={y} stroke={foot === null || onTime ? "var(--color-optic)" : "var(--color-amber)"} strokeWidth="3" strokeLinecap="round" />
        {placed.map((e) => {
          const isContact = e.key === "contact";
          const up = e.dy < 0;
          return (
            <g key={e.key}>
              {e.clipped ? (
                <path d={`M${e.x + 5},${y - 4} l-6,4 l6,4`} fill="none" stroke="var(--color-chalk-2)" strokeWidth="1.4" />
              ) : (
                <circle cx={e.x} cy={y} r={isContact ? 5.5 : 3.8} fill={isContact ? "var(--color-optic)" : "var(--color-night)"} stroke={isContact ? "var(--color-optic)" : "var(--color-chalk)"} strokeWidth="1.6" />
              )}
              <line x1={e.x} x2={e.x} y1={up ? y - 6 : y + 6} y2={y + e.dy + (up ? 4 : -9)} stroke="var(--color-line-2)" />
              <text
                x={e.x}
                y={y + e.dy}
                textAnchor={e.x > W - 50 ? "end" : e.x < 40 ? "start" : "middle"}
                fontSize="10"
                fill={isContact ? "var(--color-optic)" : "var(--color-chalk)"}
                fontWeight={isContact ? 700 : 400}
              >
                {e.text}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[13px] leading-relaxed text-chalk-2">
        {lead === null ? (
          "Front foot landing wasn't visible. Keep your shoes in the picture to time it."
        ) : (
          <>
            Front foot down <span className="num text-chalk">{(lead / 1000).toFixed(2)} s</span> before contact:{" "}
            <span className={onTime ? "text-optic" : "text-amber"}>
              {onTime ? "on time for slow pitch" : lead < FOOT_DOWN_WINDOW.lo ? "late, you're landing as you swing" : "early, you're waiting on the ball"}
            </span>
            .
          </>
        )}
      </figcaption>
    </figure>
  );
}
