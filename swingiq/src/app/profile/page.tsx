"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { PlayerForm } from "@/components/PlayerForm";
import { usePlayers } from "@/components/PlayerProvider";
import { Button, PageTitle, Panel, Segmented, SectionTitle, Toggle } from "@/components/ui";
import { voice, type VoiceFrequency } from "@/live/voice";
import { db, uid } from "@/lib/store/db";
import type { Bat, Player } from "@/lib/store/types";

export default function ProfilePage() {
  const { ready, players, player, settings, updateSettings, savePlayer, removePlayer, setActive, refresh } = usePlayers();
  const router = useRouter();
  const [editing, setEditing] = useState<Player | "new" | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [usage, setUsage] = useState<{ usedMB: number; quotaMB: number } | null>(null);

  useEffect(() => {
    const load = () => setVoices(voice.voices());
    load();
    if (voice.supported()) window.speechSynthesis.addEventListener("voiceschanged", load);
    db.usage().then(setUsage).catch(() => {});
    return () => {
      if (voice.supported()) window.speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, []);

  if (!ready) return null;

  async function exportData() {
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), players: [] as unknown[] };
    for (const p of players) {
      const sessions = await db.sessions(p.id);
      const swings = (await db.swingsForPlayer(p.id)).map((s) => ({ ...s, pose: undefined }));
      const bats = await db.bats(p.id);
      (out.players as unknown[]).push({ player: p, bats, sessions, swings });
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `swingiq-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function wipe() {
    if (!confirm("Delete every hitter, session, swing and video on this phone? This can't be undone.")) return;
    await db.wipe();
    await refresh();
    router.replace("/");
  }

  return (
    <div className="animate-rise pb-8">
      <PageTitle title="Profile" />

      <SectionTitle right={<button type="button" onClick={() => setEditing("new")} className="text-sm text-optic">Add hitter</button>}>Hitters</SectionTitle>
      <p className="-mt-1 mb-3 text-[13px] text-chalk-3">Coaches and parents can keep several hitters on one phone.</p>
      {editing === "new" && (
        <Panel className="mb-3 p-4">
          <PlayerForm
            onSave={async (p) => {
              await savePlayer(p);
              await setActive(p.id);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </Panel>
      )}
      <Panel>
        <ul className="divide-y divide-line">
          {players.map((p) => (
            <li key={p.id} className="px-4 py-3">
              {editing !== "new" && editing?.id === p.id ? (
                <PlayerForm
                  initial={p}
                  onSave={async (np) => {
                    await savePlayer(np);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setActive(p.id)} className="min-w-0 text-left" aria-pressed={player?.id === p.id}>
                    <span className="block text-[15px] text-chalk">
                      {p.name} {player?.id === p.id && <span className="ml-1 rounded-md bg-optic px-1.5 py-0.5 text-[11px] font-bold text-optic-ink">Active</span>}
                    </span>
                    <span className="block text-[13px] text-chalk-3">
                      {p.hand === "R" ? "Right-handed" : "Left-handed"} · {Math.floor(p.heightIn / 12)}&apos;{Math.round(p.heightIn % 12)}&quot;
                    </span>
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(p)} className="min-h-10 rounded-lg border border-line px-3 text-sm text-chalk-2">Edit</button>
                    <button
                      type="button"
                      onClick={() => confirm(`Delete ${p.name} and all their swings?`) && removePlayer(p.id)}
                      className="min-h-10 rounded-lg border border-line px-3 text-sm text-stitch"
                      aria-label={`Delete ${p.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {players.length === 0 && <li className="px-4 py-4 text-sm text-chalk-3">No hitters yet.</li>}
        </ul>
      </Panel>

      {player && <BatsSection playerId={player.id} />}

      <SectionTitle>Voice coaching</SectionTitle>
      <Panel className="divide-y divide-line px-4">
        <Toggle id="v-on" checked={settings.voiceOn} onChange={(v) => updateSettings({ voiceOn: v })} label="Voice cues" hint="A two-to-five word tip after a swing." />
        <Toggle id="v-quiet" checked={settings.quiet} onChange={(v) => updateSettings({ quiet: v })} label="Quiet mode" hint="No sound at all. Results only on screen." />
        <div className="py-3">
          <span className="mb-2 block text-[15px]">How often</span>
          <Segmented<VoiceFrequency>
            label="Voice frequency"
            value={settings.voiceFrequency}
            onChange={(v) => updateSettings({ voiceFrequency: v })}
            options={[
              { value: "every", label: "Every swing" },
              { value: "fixes", label: "Only fixes" },
              { value: "every3", label: "Every 3rd" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <label htmlFor="voice" className="text-[15px]">Voice</label>
          <select
            id="voice"
            value={settings.voiceURI ?? ""}
            onChange={(e) => updateSettings({ voiceURI: e.target.value || null })}
            className="min-h-10 max-w-[60%] rounded-lg border border-line bg-night-3 px-2 text-sm"
          >
            <option value="">Phone default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="py-3">
          <Button variant="ghost" onClick={() => voice.say("Good swing. Hands stayed up.", settings.voiceURI)} disabled={!voice.supported()}>
            Test voice
          </Button>
        </div>
      </Panel>

      <SectionTitle>Session settings</SectionTitle>
      <Panel className="divide-y divide-line px-4">
        <Toggle id="mic" checked={settings.micOn} onChange={(v) => updateSettings({ micOn: v })} label="Listen for contact" hint="Hears bat-on-ball through the mic. Audio is never saved or sent." />
        <Toggle id="clips" checked={settings.keepClips} onChange={(v) => updateSettings({ keepClips: v })} label="Save swing video" hint="Off saves space: you keep the tracking and numbers, not the frames." />
        <div className="py-3">
          <span className="mb-1 block text-[15px]">Tracking</span>
          <span className="mb-2 block text-[13px] text-chalk-3">Accurate is steadier on fast hands. Fast suits older phones.</span>
          <Segmented
            label="Tracking model"
            value={settings.modelQuality}
            onChange={(v) => updateSettings({ modelQuality: v })}
            options={[
              { value: "full", label: "Accurate" },
              { value: "lite", label: "Fast" },
            ]}
          />
        </div>
      </Panel>

      <SectionTitle>Account</SectionTitle>
      <AccountPanel />

      <SectionTitle>Your data</SectionTitle>
      <Panel className="space-y-4 p-4">
        <p className="text-[14px] text-chalk-2">
          Everything is stored on this phone{usage ? ` (${usage.usedMB.toFixed(0)} MB used)` : ""}. You own it: export it or delete it any time.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" onClick={exportData} disabled={players.length === 0}>Export my data</Button>
          <Button variant="danger" onClick={wipe}>Delete everything on this phone</Button>
        </div>
      </Panel>

      <div className="mt-10 space-y-2 text-[13px] text-chalk-3">
        <p>
          <Link href="/how-it-works" className="underline">How SwingIQ measures</Link> · <Link href="/guide" className="underline">Camera setup guide</Link> · <Link href="/privacy" className="underline">Privacy</Link>
        </p>
      </div>
    </div>
  );
}

function BatsSection({ playerId }: { playerId: string }) {
  const [bats, setBats] = useState<Bat[]>([]);
  const [stats, setStats] = useState<Record<string, { swings: number; avg: number | null }>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ brand: "", model: "", lengthIn: "34", weightOz: "", certification: "USSSA" });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const bs = await db.bats(playerId);
    setBats(bs);
    const sessions = await db.sessions(playerId);
    const out: Record<string, { swings: number; avg: number | null }> = {};
    for (const b of bs) {
      const ss = sessions.filter((s) => s.batId === b.id);
      const swings = ss.reduce((a, s) => a + s.swingCount, 0);
      const weighted = ss.filter((s) => s.avgScore !== null);
      const n = weighted.reduce((a, s) => a + s.swingCount, 0);
      out[b.id] = { swings, avg: n ? Math.round(weighted.reduce((a, s) => a + s.avgScore! * s.swingCount, 0) / n) : null };
    }
    setStats(out);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim() || !form.model.trim()) return setErr("Brand and model, please.");
    const len = form.lengthIn ? Number(form.lengthIn) : null;
    const wt = form.weightOz ? Number(form.weightOz) : null;
    if (len !== null && (len < 24 || len > 36)) return setErr("Length should be 24–36 in.");
    if (wt !== null && (wt < 18 || wt > 34)) return setErr("Weight should be 18–34 oz.");
    setErr(null);
    await db.saveBat({ id: uid(), playerId, brand: form.brand.trim().slice(0, 40), model: form.model.trim().slice(0, 60), lengthIn: len, weightOz: wt, certification: form.certification, createdAt: Date.now() });
    setForm({ brand: "", model: "", lengthIn: "34", weightOz: "", certification: "USSSA" });
    setAdding(false);
    await load();
  }

  const input = "min-h-11 w-full rounded-xl border border-line bg-night-3 px-3 text-[16px] placeholder:text-chalk-3";
  return (
    <>
      <SectionTitle right={<button type="button" onClick={() => setAdding((a) => !a)} className="text-sm text-optic">{adding ? "Cancel" : "Add bat"}</button>}>My bats</SectionTitle>
      <p className="-mt-1 mb-3 text-[13px] text-chalk-3">Pick a bat when you start a session and SwingIQ compares how you swing each one.</p>
      {adding && (
        <Panel className="mb-3 p-4">
          <form onSubmit={add} className="grid grid-cols-2 gap-3">
            <input aria-label="Brand" placeholder="Brand (Miken, Easton…)" className={`${input} col-span-2`} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <input aria-label="Model" placeholder="Model" className={`${input} col-span-2`} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <label className="flex items-center gap-2 rounded-xl border border-line bg-night-3 px-3">
              <input aria-label="Length in inches" inputMode="numeric" className="min-h-11 w-full bg-transparent text-[16px] focus:outline-none" value={form.lengthIn} onChange={(e) => setForm({ ...form, lengthIn: e.target.value })} />
              <span className="text-sm text-chalk-3">in</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-line bg-night-3 px-3">
              <input aria-label="Weight in ounces" inputMode="decimal" placeholder="Weight" className="min-h-11 w-full bg-transparent text-[16px] placeholder:text-chalk-3 focus:outline-none" value={form.weightOz} onChange={(e) => setForm({ ...form, weightOz: e.target.value })} />
              <span className="text-sm text-chalk-3">oz</span>
            </label>
            <select aria-label="Certification" className={`${input} col-span-2`} value={form.certification} onChange={(e) => setForm({ ...form, certification: e.target.value })}>
              {["USSSA", "USA/ASA", "NSA", "ISA", "SSUSA (senior)", "Multi-stamp", "Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {err && <p role="alert" className="col-span-2 text-sm text-stitch">{err}</p>}
            <Button type="submit" className="col-span-2">Save bat</Button>
          </form>
        </Panel>
      )}
      <Panel>
        <ul className="divide-y divide-line">
          {bats.map((b) => {
            const drop = b.lengthIn && b.weightOz ? b.weightOz - b.lengthIn : null;
            return (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-chalk">{b.brand} {b.model}</span>
                  <span className="block text-[13px] text-chalk-3">
                    {[b.lengthIn && `${b.lengthIn} in`, b.weightOz && `${b.weightOz} oz`, drop !== null && `drop ${drop}`, b.certification].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-right">
                  <span>
                    <span className="num block text-xl text-chalk">{stats[b.id]?.avg ?? "—"}</span>
                    <span className="block text-[11px] text-chalk-3">{stats[b.id]?.swings ?? 0} swings</span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Remove ${b.brand} ${b.model}?`)) return;
                      await db.deleteBat(b.id);
                      await load();
                    }}
                    className="min-h-10 rounded-lg border border-line px-2.5 text-sm text-chalk-3"
                    aria-label={`Remove ${b.brand} ${b.model}`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
          {bats.length === 0 && <li className="px-4 py-4 text-sm text-chalk-3">No bats yet.</li>}
        </ul>
      </Panel>
    </>
  );
}
