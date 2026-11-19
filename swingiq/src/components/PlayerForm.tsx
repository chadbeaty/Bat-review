"use client";
import { useState } from "react";
import type { Handedness } from "@/engine/types";
import { uid } from "@/lib/store/db";
import type { Player } from "@/lib/store/types";
import { Button, Segmented } from "./ui";

/** Create or edit a hitter. Height is required: it's how pixels become inches. */
export function PlayerForm({ initial, onSave, onCancel, submitLabel = "Save hitter" }: { initial?: Player | null; onSave: (p: Player) => Promise<void> | void; onCancel?: () => void; submitLabel?: string }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hand, setHand] = useState<Handedness>(initial?.hand ?? "R");
  const [ft, setFt] = useState(initial ? String(Math.floor(initial.heightIn / 12)) : "5");
  const [inch, setInch] = useState(initial ? String(Math.round(initial.heightIn % 12)) : "10");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const heightIn = Number(ft) * 12 + Number(inch);
    if (!name.trim()) return setErr("Add a name.");
    if (!Number.isFinite(heightIn) || heightIn < 48 || heightIn > 90) return setErr("Height should be between 4'0\" and 7'6\".");
    setBusy(true);
    try {
      await onSave({ id: initial?.id ?? uid(), name: name.trim().slice(0, 40), hand, heightIn, createdAt: initial?.createdAt ?? Date.now(), remoteId: initial?.remoteId ?? null });
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
      {err && <p role="alert" className="text-sm text-stitch">{err}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy} className="flex-1">{submitLabel}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
