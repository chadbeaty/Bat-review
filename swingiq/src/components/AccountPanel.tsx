"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { syncAll } from "@/lib/sync";
import { Button, ButtonLink, Panel } from "./ui";

export function AccountPanel() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!cloudEnabled) {
    return (
      <Panel className="p-4">
        <p className="text-[15px] text-chalk">No account needed</p>
        <p className="mt-1 text-[13px] text-chalk-3">Cloud backup and sign-in aren&apos;t switched on yet. Everything you record is saved on this phone.</p>
      </Panel>
    );
  }

  if (user === undefined) return <Panel className="h-24 p-4" />;

  if (!user) {
    return (
      <Panel className="p-4">
        <p className="text-[15px] text-chalk">Back up your swings</p>
        <p className="mt-1 text-[13px] text-chalk-3">Create a free account to keep your history if you change phones. Video stays on your phone.</p>
        <div className="mt-4 flex gap-3">
          <ButtonLink href="/sign-up">Create account</ButtonLink>
          <ButtonLink href="/sign-in" variant="ghost">Sign in</ButtonLink>
        </div>
      </Panel>
    );
  }

  async function backup() {
    const sb = supabase();
    if (!sb) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await syncAll(sb);
      setMsg(r.swings ? `Backed up ${r.swings} new swings.` : "All caught up.");
    } catch (e) {
      setMsg(`Backup didn't finish: ${e instanceof Error ? e.message : "unknown error"}. Try again on better signal.`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    const sb = supabase();
    if (!sb || !confirm("Delete your cloud account and everything backed up to it? Swings on this phone stay.")) return;
    setBusy(true);
    const { data } = await sb.auth.getSession();
    const res = await fetch("/api/account", { method: "DELETE", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    setBusy(false);
    if (res.ok) {
      await sb.auth.signOut();
      setMsg("Your cloud account is deleted.");
    } else setMsg("Couldn't delete the account right now. Try again later.");
  }

  return (
    <Panel className="space-y-4 p-4">
      <div>
        <p className="text-[15px] text-chalk">Signed in</p>
        <p className="text-[13px] text-chalk-3">{user.email}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={backup} disabled={busy}>{busy ? "Working…" : "Back up now"}</Button>
        <Button variant="ghost" onClick={() => supabase()?.auth.signOut()}>Sign out</Button>
      </div>
      {msg && <p className="text-[13px] text-chalk-2" role="status">{msg}</p>}
      <button type="button" onClick={deleteAccount} className="text-[13px] text-stitch underline" disabled={busy}>
        Delete cloud account
      </button>
      <p className="text-[12px] text-chalk-3">
        <Link href="/privacy" className="underline">What we store</Link>
      </p>
    </Panel>
  );
}
