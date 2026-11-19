"use client";
import type { SetupCheck } from "@/engine/setup";

const dot = { ok: "bg-optic", warn: "bg-amber", bad: "bg-stitch", pending: "bg-chalk-3 animate-pulse" };

export function SetupChecklist({ checks, compact = false }: { checks: SetupCheck[]; compact?: boolean }) {
  const first = checks.find((c) => c.status === "bad") ?? checks.find((c) => c.status === "warn");
  if (compact) {
    return (
      <div className="flex items-center gap-1.5" aria-label="Setup checks">
        {checks.map((c) => (
          <span key={c.id} title={`${c.label}: ${c.message}`} className={`h-2 w-2 rounded-full ${dot[c.status]}`} />
        ))}
      </div>
    );
  }
  return (
    <div aria-live="polite">
      {first && <p className={`mb-3 text-[15px] font-bold ${first.status === "bad" ? "text-stitch" : "text-amber"}`}>{first.message}</p>}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-[13px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[c.status]}`} aria-hidden="true" />
            <span className={c.status === "ok" ? "text-chalk" : "text-chalk-2"}>
              {c.label}
              <span className="sr-only">: {c.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
