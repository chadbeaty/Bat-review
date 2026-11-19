"use client";
import { useState } from "react";
import type { Handedness } from "@/engine/types";
import { uid } from "@/lib/store/db";
import { GOAL_LABEL, LEVEL_LABEL, POSITIONS, type HittingGoal, type Player, type PlayingLevel, type Position } from "@/lib/store/types";
import { Button, Segmented } from "./ui";

/** Create or edit a hitter. Height is required: it's how pixels become inches. */
export function PlayerForm({ initial, onSave, onCancel, submitLabel = "Save hitter" }: { initial?: Player | null; onSave: (p: Player) => Promise<void> | void; onCancel?: () => void; submitLabel?: string }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hand, setHand] = useState<Handedness>(initial?.hand ?? "R");
  const [ft, setFt] = useState(initial ? String(Math.floor(initial.heightIn / 12)) : "5");
  const [inch, setInch] = useState(initial ? String(Math.round(initial.heightIn % 12)) : "10");
  const [level, setLevel] = useState<PlayingLevel | "">(initial?.level ?? "");
  const [positions, setPositions] = useState<Position[]>(initial?.positions ?? []);
  const [goals, setGoals] = useState<HittingGoal[]>(initial?.goals ?? []);
  const [more, setMore] = useState(Boolean(initial?.level || initial?.positions?.length || initial?.goals?.length));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const heightIn = Number(ft) * 12 + Number(inch);
    if (!name.trim()) return setErr("Add a name.");
    if (!Number.isFinite(heightIn) || heightIn < 48 || heightIn > 90) return setErr("Height should be between 4'0\" and 7'6\".");
    setBusy(true);
    try {
      await onSave({
        id: initial?.id ?? uid(),
        name: name.trim().slice(0, 40),
        hand,
        heightIn,
        createdAt: initial?.createdAt ?? Date.now(),
        remoteId: initial?.remoteId ?? null,
        level: level || undefined,
        positions,
        goals,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="pname" className="mb-1.5 block text-sm text-chalk-2">Name</label>
        <input
          id="pname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          className="min-h-12 w-full rounded-xl border border-line bg-night-2 px-4 text-[16px] text-chalk placeholder:text-chalk-3 focus:border-chalk-3 focus:outline-none"
          placeholder="Who's hitting?"
        />
      </div>
      <div>
        <span className="mb-1.5 block text-sm text-chalk-2">Bats</span>
        <Segmented label="Bats" value={hand} onChange={setHand} options={[{ value: "R", label: "Right-handed" }, { value: "L", label: "Left-handed" }]} />
      </div>
      <div>
        <span className="mb-1.5 block text-sm text-chalk-2">Height <span className="text-chalk-3">(turns the camera&apos;s pixels into inches)</span></span>
        <div className="flex gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-night-2 px-4">
            <input inputMode="numeric" aria-label="Feet" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, "").slice(0, 1))} className="min-h-12 w-full bg-transparent text-[16px] text-chalk focus:outline-none" />
            <span className="text-chalk-3">ft</span>
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-night-2 px-4">
            <input inputMode="numeric" aria-label="Inches" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, "").slice(0, 2))} className="min-h-12 w-full bg-transparent text-[16px] text-chalk focus:outline-none" />
            <span className="text-chalk-3">in</span>
          </label>
        </div>
      </div>
      <div>
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="text-sm text-optic">
          {more ? "Hide" : "Add"} level, position and goals <span className="text-chalk-3">(optional)</span>
        </button>
        {more && (
          <div className="mt-4 space-y-5">
            <div>
              <label htmlFor="plevel" className="mb-1.5 block text-sm text-chalk-2">Playing level</label>
              <select
                id="plevel"
                value={level}
                onChange={(e) => setLevel(e.target.value as PlayingLevel | "")}
                className="min-h-12 w-full rounded-xl border border-line bg-night-2 px-3 text-[16px] text-chalk"
              >
                <option value="">Choose…</option>
                {(Object.keys(LEVEL_LABEL) as PlayingLevel[]).map((k) => (
                  <option key={k} value={k}>{LEVEL_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <ChipGroup label="Positions" values={POSITIONS} labels={Object.fromEntries(POSITIONS.map((p) => [p, p]))} selected={positions} onChange={setPositions} />
            <ChipGroup
              label="Hitting goals"
              values={Object.keys(GOAL_LABEL) as HittingGoal[]}
              labels={GOAL_LABEL}
              selected={goals}
              onChange={setGoals}
            />
          </div>
        )}
      </div>
      {err && <p role="alert" className="text-sm text-stitch">{err}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy} className="flex-1">{submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

function ChipGroup<T extends string>({ label, values, labels, selected, onChange }: { label: string; values: T[]; labels: Record<string, string>; selected: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm text-chalk-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== v) : [...selected, v])}
              className={`min-h-10 rounded-xl border px-3 text-sm ${on ? "border-optic bg-night-3 text-chalk" : "border-line text-chalk-2"}`}
            >
              {labels[v]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
