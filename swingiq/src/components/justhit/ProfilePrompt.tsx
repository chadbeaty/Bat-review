"use client";
import { useState } from "react";
import type { Handedness } from "@/engine/types";
import { answerQuestion, parseHeight, type ProfileQuestion } from "@/lib/guest";
import type { Player } from "@/lib/store/types";

const COPY: Record<ProfileQuestion, string> = {
  heightIn: "Add your height for sharper numbers.",
  hand: "Which side do you hit from?",
  name: "Put your name on your swings.",
};

const field = "min-h-11 w-full rounded-xl border border-line bg-night-2 px-3 text-[16px] text-chalk placeholder:text-chalk-3 focus:border-chalk-3 focus:outline-none";

/**
 * The progressive profile: one small question after a swing, at most one per visit. Answering turns the guest into a
 * normal hitter with the same id, so every swing so far stays theirs. "Not now" is always fine.
 */
export function ProfilePrompt({ player, question, onSave, onDismiss }: { player: Player; question: ProfileQuestion; onSave: (p: Player) => Promise<void>; onDismiss: () => void }) {
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save(next: Player) {
    setBusy(true);
    try {
      await onSave(next);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (question === "heightIn") {
      const h = parseHeight(ft, inch);
      if (h === null) return setErr("Height should be between 4'0\" and 7'6\".");
      return save(answerQuestion(player, { field: "heightIn", value: h }));
    }
    if (question === "name") {
      if (!name.trim()) return setErr("Add a name.");
      return save(answerQuestion(player, { field: "name", value: name }));
    }
  }

  const side = (h: Handedness) => save(answerQuestion(player, { field: "hand", value: h }));

  if (done) {
    return (
      <p role="status" className="rounded-xl border border-line px-4 py-3 text-[14px] text-chalk-2">
        Saved. Your next swings use it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} aria-label="Sharpen your numbers" className="rounded-xl border border-dashed border-line-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-chalk">{COPY[question]}</p>
        <button type="button" onClick={onDismiss} className="shrink-0 text-[13px] text-chalk-3 hover:text-chalk-2">
          Not now
        </button>
      </div>

      {question === "heightIn" && (
        <div className="mt-3 flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-night-2 px-3">
            <input inputMode="numeric" aria-label="Feet" placeholder="5" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, "").slice(0, 1))} className="min-h-11 w-full bg-transparent text-[16px] text-chalk placeholder:text-chalk-3 focus:outline-none" />
            <span className="text-chalk-3">ft</span>
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-night-2 px-3">
            <input inputMode="numeric" aria-label="Inches" placeholder="10" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, "").slice(0, 2))} className="min-h-11 w-full bg-transparent text-[16px] text-chalk placeholder:text-chalk-3 focus:outline-none" />
            <span className="text-chalk-3">in</span>
          </label>
          <button type="submit" disabled={busy} className="press min-h-11 rounded-xl bg-night-4 px-4 text-[15px] font-semibold text-chalk disabled:opacity-40">
            Save
          </button>
        </div>
      )}

      {question === "hand" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["R", "L"] as const).map((h) => (
            <button key={h} type="button" disabled={busy} onClick={() => side(h)} className={`press min-h-11 rounded-xl border px-3 text-[15px] ${player.hand === h ? "border-optic text-chalk" : "border-line text-chalk-2"}`}>
              {h === "R" ? "Right" : "Left"}
              {player.hand === h && <span className="sr-only"> (what your swing looked like)</span>}
            </button>
          ))}
        </div>
      )}

      {question === "name" && (
        <div className="mt-3 flex gap-2">
          <input aria-label="Name" autoComplete="given-name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <button type="submit" disabled={busy} className="press min-h-11 rounded-xl bg-night-4 px-4 text-[15px] font-semibold text-chalk disabled:opacity-40">
            Save
          </button>
        </div>
      )}

      {err && (
        <p role="alert" className="mt-2 text-[13px] text-stitch">
          {err}
        </p>
      )}
    </form>
  );
}
