"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { forgetCloud } from "@/lib/sync";
import { useSync } from "./SyncProvider";
import { Button, ButtonLink, Panel } from "./ui";

function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(ms).toLocaleDateString();
}

/** Account and sync: sign in to use Gapper on more than one device, see when it last synced, sync now, sign out. */
export function AccountPanel() {
  const { user, status, lastSyncAt, last, error, syncNow } = useSync();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!cloudEnabled) {
    return (
      <Panel className="p-4">
        <p className="text-[15px] text-chalk">No account needed</p>
        <p className="mt-1 text-[13px] text-chalk-3">Sign-in isn&apos;t switched on yet. Everything you record is saved on this phone.</p>
      </Panel>
    );
  }

  if (user === undefined) return <Panel className="h-24 p-4" />;

  if (!user) {
    return (
      <Panel variant="stage" className="p-5">
        <p className="title">Use Gapper on all your devices</p>
        <p className="mt-1 text-[14px] leading-relaxed text-chalk-2">
          Sign in and your hitters, swings, scores and drills sync to every phone, tablet and computer you use. Free. Video stays on the phone that recorded it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/sign-up">Create account</ButtonLink>
          <ButtonLink href="/sign-in" variant="ghost">Sign in</ButtonLink>
        </div>
      </Panel>
    );
  }

  async function sync() {
    setMsg(null);
    const r = await syncNow();
    if (r) setMsg(r.pushed || r.pulled || r.removed ? `Synced: ${r.pushed} up, ${r.pulled} down${r.removed ? `, ${r.removed} removed` : ""}.` : "All caught up.");
  }

  async function signOut() {
    setBusy(true);
    await supabase()?.auth.signOut();
    setBusy(false);
    setMsg("Signed out. Your swings stay on this device.");
  }

  async function deleteAccount() {
    const sb = supabase();
    if (!sb || !user || !confirm("Delete your account and everything synced to it? Swings on this device stay here.")) return;
    setBusy(true);
    const { error: err } = await sb.rpc("delete_my_account");
    if (err) {
      setBusy(false);
      return setMsg("Couldn't delete the account right now. Try again in a minute.");
    }
    await forgetCloud(user.id);
    await sb.auth.signOut();
    setBusy(false);
    setMsg("Your account is deleted. Swings on this device are still here.");
  }

  const state =
    status === "syncing"
      ? "Syncing…"
      : status === "error"
        ? `Sync didn't finish: ${error ?? "unknown error"}. It'll try again on its own.`
        : lastSyncAt
          ? `Synced ${ago(lastSyncAt, now)}`
          : "Waiting to sync";

  return (
    <Panel variant="stage" className="space-y-4 p-5">
      <div>
        <p className="label text-optic">Signed in</p>
        <p className="mt-1 break-all text-[15px] text-chalk">{user.email}</p>
        <p className={`mt-2 flex items-center gap-2 text-[13px] ${status === "error" ? "text-amber" : "text-chalk-2"}`} role="status">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status === "syncing" ? "animate-pulse bg-optic" : status === "error" ? "bg-amber" : "bg-optic"}`} aria-hidden="true" />
          {state}
        </p>
        {last?.foreign && (
          <p className="mt-2 text-[13px] text-amber">
            The swings already on this device belong to a different account, so they weren&apos;t uploaded to this one.
          </p>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-chalk-3">
        Your hitters, swings, scores, tags and drills sync to every device you sign in on. Video stays on the phone that recorded it; other devices replay the tracked skeleton.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={sync} disabled={busy || status === "syncing"}>{status === "syncing" ? "Syncing…" : "Sync now"}</Button>
        <Button variant="ghost" onClick={signOut} disabled={busy}>Sign out</Button>
      </div>
      {msg && <p className="text-[13px] text-chalk-2" role="status">{msg}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px]">
        <button type="button" onClick={deleteAccount} className="text-stitch underline" disabled={busy}>
          Delete account
        </button>
        <Link href="/privacy" className="text-chalk-3 underline">What we store</Link>
      </div>
    </Panel>
  );
}
