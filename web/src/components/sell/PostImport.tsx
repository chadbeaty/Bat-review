"use client";

import { useState } from "react";
import { saveModel } from "@/app/sell/actions";
import { readPost } from "@/app/sell/import-actions";
import { buildPlan, type ImportCandidate, type ImportReading } from "@/lib/import/plan";
import type { Confidence, ImportField } from "@/lib/import/parse-post";
import { useWizard } from "./ui";

type Choice = { categoryId: string; manufacturerId: string };

const NONE = "none";

const CONFIDENCE_TEXT: Record<Confidence, string> = { high: "Found in your post", medium: "Check this one", low: "Check this one" };

/**
 * "Already posted it somewhere? Paste your post". The seller pastes the text of a Facebook group post (or any
 * for-sale post); we read it and pre-fill the listing. Nothing is saved until they continue, nothing is published
 * until they publish it themselves after reviewing each step.
 */
export function PostImport({ setChoice }: { setChoice: (c: Choice) => void }) {
  const w = useWizard();
  const bats = w.categories.find((c) => c.slug === "bats");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<ImportReading | null>(null);
  const [pick, setPick] = useState<string>(NONE);

  if (!bats) return null;

  async function read() {
    setBusy(true);
    setError(null);
    setReading(null);
    try {
      const r = await readPost(text);
      if (!r.ok) setError(r.error);
      else {
        setReading(r.reading);
        setPick(r.reading.matched ? r.reading.matched.id : r.reading.candidates.length === 1 ? r.reading.candidates[0].id : NONE);
      }
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const chosen: ImportCandidate | null = reading ? (reading.matched ?? reading.candidates.find((c) => c.id === pick) ?? null) : null;
  const p = reading?.parsed;
  const usable = Boolean(reading && p && p.kind === "text" && !p.multiple);

  async function apply() {
    if (!reading || !usable) return;
    const plan = buildPlan(reading);
    const manufacturerId = chosen?.manufacturerId ?? reading.manufacturerId ?? "";
    w.setImported(plan);
    setChoice({ categoryId: reading.categoryId, manufacturerId });
    if (chosen && chosen.manufacturerId) {
      // A model was picked: start the draft now, and the Details step opens with the values filled in.
      const r = await w.run(
        () => saveModel(null, { categoryId: reading.categoryId, manufacturerId: chosen.manufacturerId, productId: chosen.id, request: null }),
        "details"
      );
      if (!r.ok) w.setImported(null);
    } else {
      w.goTo(manufacturerId ? "model" : "manufacturer");
    }
  }

  return (
    <section className="grid gap-3 border-2 border-dashed border-steel bg-paper p-3 sm:p-4" aria-label="Import from an existing post" data-testid="post-import">
      <button
        type="button"
        id="import-heading"
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold"
        aria-expanded={open}
        aria-controls="import-body"
        onClick={() => setOpen(!open)}
      >
        <span>
          Already posted it somewhere? <span className="underline">Paste your post</span>
        </span>
        <span aria-hidden="true" className="font-mono text-lg">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div id="import-body" className="grid gap-4">
          <p className="text-sm text-ink-soft">
            Copy the words of your Facebook group post (or any for-sale post) and paste them here. We read the text and fill in what it says, then you
            check every step before anything goes live. We can&apos;t open links, so paste the text itself.
          </p>
          <label className="field" htmlFor="post-text">
            <span>Your post</span>
            <textarea
              id="post-text"
              rows={7}
              className="input font-mono text-sm"
              value={text}
              maxLength={10000}
              onChange={(e) => setText(e.target.value)}
              placeholder={"2026 Miken Freak Black Maxload USSSA 34/27\n$150 obo, used one season, ~400 swings. Can ship."}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={read} disabled={busy || text.trim().length === 0}>
              {busy ? "Reading…" : "Read my post"}
            </button>
            <span className="text-sm text-ink-soft">Your photos come next, in the same photo slots as any listing.</span>
          </div>

          <div aria-live="polite" className="grid gap-4">
            {error && (
              <p role="alert" className="border-[1.5px] border-danger bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {reading && p && <Result reading={reading} pick={pick} setPick={setPick} chosen={chosen} usable={usable} onApply={apply} pending={w.pending} />}
            {w.error && (
              <p role="alert" className="border-[1.5px] border-danger bg-danger/5 px-3 py-2 text-sm text-danger">
                {w.error}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Result({
  reading,
  pick,
  setPick,
  chosen,
  usable,
  onApply,
  pending,
}: {
  reading: ImportReading;
  pick: string;
  setPick: (v: string) => void;
  chosen: ImportCandidate | null;
  usable: boolean;
  onApply: () => void;
  pending: boolean;
}) {
  const p = reading.parsed;
  // The model counts as filled only once one is chosen.
  const fields: ImportField[] = [...p.fields];
  if (chosen && !reading.matched) fields.unshift({ key: "model", label: "Model", display: chosen.label, confidence: "medium", evidence: "chosen by you" });
  const count = fields.length;
  const empty = p.flags.filter((f) => !(f.key === "model" && chosen));
  const plan = usable ? buildPlan(reading) : null;

  return (
    <div className="grid gap-4" data-testid="import-result">
      {p.warnings.map((m) => (
        <p key={m} role="alert" className="border-[1.5px] border-warning bg-warning/10 px-3 py-2 text-sm" data-testid="import-warning">
          {m}
        </p>
      ))}

      {usable && (
        <>
          <p className="font-semibold" data-testid="import-summary">
            {count === 0
              ? "We couldn't read any listing details from that text. Nothing was filled in, so you can fill the listing in by hand."
              : `We filled ${count} ${count === 1 ? "field" : "fields"}. Check the highlighted ones.`}
          </p>

          {count > 0 && (
            <ul className="grid gap-2" aria-label="What we found" data-testid="import-fields">
              {fields.map((f) => (
                <li
                  key={f.key}
                  data-confidence={f.confidence}
                  className={`grid gap-0.5 border-[1.5px] px-3 py-2 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-3 ${f.confidence === "high" ? "border-line-strong bg-surface" : "border-warning bg-warning/10"}`}
                >
                  <span className="text-sm text-ink-soft">{f.label}</span>
                  <span className="font-semibold break-words">{f.display}</span>
                  <span className={`label ${f.confidence === "high" ? "text-ink-soft" : "text-warning"}`}>{CONFIDENCE_TEXT[f.confidence]}</span>
                </li>
              ))}
            </ul>
          )}

          {reading.candidates.length > 0 && !reading.matched && (
            <fieldset className="grid gap-2" data-testid="import-candidates">
              <legend className="font-semibold">Which model is yours?</legend>
              <p className="text-sm text-ink-soft">We won&apos;t guess a model. Pick the one printed on your bat, or choose it yourself in the next steps.</p>
              {reading.candidates.map((c) => (
                <label key={c.id} className={`flex cursor-pointer items-start gap-2 border px-3 py-2 ${pick === c.id ? "border-ink bg-surface" : "border-line-strong"}`}>
                  <input type="radio" name="import-model" className="mt-1" checked={pick === c.id} onChange={() => setPick(c.id)} />
                  <span className="grid">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-sm text-ink-soft">{[c.certifications.join(" / "), `matched on ${c.reasons.join(", ")}`].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              ))}
              <label className={`flex cursor-pointer items-center gap-2 border px-3 py-2 ${pick === NONE ? "border-ink bg-surface" : "border-line-strong"}`}>
                <input type="radio" name="import-model" checked={pick === NONE} onChange={() => setPick(NONE)} />
                None of these, I&apos;ll choose it myself
              </label>
              {reading.moreCandidates > 0 && <p className="text-sm text-ink-soft">{reading.moreCandidates} more models also fit. Choose &quot;None of these&quot; to see the full list.</p>}
            </fieldset>
          )}

          {empty.length > 0 && (
            <div className="grid gap-1" data-testid="import-empty">
              <p className="text-sm font-semibold">Left for you to fill in</p>
              <ul className="grid gap-1 text-sm text-ink-soft">
                {empty.map((f) => (
                  <li key={f.key}>{f.message}</li>
                ))}
              </ul>
            </div>
          )}

          {plan && (plan.notes.length > 0 || plan.conditionWords.length > 0) && (
            <div className="grid gap-1 text-sm" data-testid="import-notes">
              <p className="font-semibold">Also in your post</p>
              <ul className="grid gap-1 text-ink-soft">
                {plan.conditionWords.length > 0 && <li>You described it as {plan.conditionWords.join(", ")}. Choose the condition score yourself in step 4.</li>}
                {plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button type="button" className="btn btn-primary" onClick={onApply} disabled={pending} data-testid="import-apply">
              {pending ? "Starting your listing…" : "Use these details and continue"}
            </button>
            <span className="text-sm text-ink-soft">You&apos;ll review every field. Nothing is published yet.</span>
          </div>
        </>
      )}
    </div>
  );
}
