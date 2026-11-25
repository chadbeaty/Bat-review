"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { setHitterCookie } from "@/lib/hitterCookie";
import { db } from "@/lib/store/db";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { GapMark as LogoMark } from "./Logo";
import { useSync } from "./SyncProvider";
import { Button } from "./ui";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; button: string; lead: string }> = {
  "sign-in": {
    title: "Sign in",
    button: "Sign in",
    lead: "Your swings, scores and drills on every phone, tablet and computer you sign in on.",
  },
  "sign-up": {
    title: "Create your account",
    button: "Create account",
    lead: "Free. Your swings sync to every device you sign in on. Video stays on the phone that recorded it.",
  },
  forgot: { title: "Reset your password", button: "Send reset link", lead: "We'll email you a link to choose a new one." },
  reset: { title: "Choose a new password", button: "Save password", lead: "At least 10 characters." },
};

/**
 * Sign in, sign up, forgot and reset. After signing in, the device pulls the player's swings down before opening the
 * app, so a new phone shows the same history straight away.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { user, syncNow } = useSync();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // Back from the confirmation email: say so. Read after mount so the page can be prerendered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmed(new URLSearchParams(window.location.search).has("confirmed"));
  }, []);

  if (!cloudEnabled) {
    return (
      <div className="mx-auto max-w-sm pt-10">
        <LogoMark size={44} />
        <h1 className="display t-m mt-6">Accounts aren&apos;t switched on yet</h1>
        <p className="mt-3 text-[15px] text-chalk-2">Gapper works fully without an account. Your swings are saved on this phone.</p>
        <Link href="/" className="mt-6 inline-block text-optic">Back home</Link>
      </div>
    );
  }

  /** Bring the account's swings to this device, then open the app (or setup, for a brand-new account). */
  async function openApp() {
    setMsg({ ok: true, text: "Signed in. Bringing your swings to this device…" });
    await syncNow();
    const players = await db.players().catch(() => []);
    if (players.length) {
      setHitterCookie(true);
      // A full load on purpose: "/" is the app only once the hitter cookie is set (a rewrite in next.config.ts).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } else router.push("/start");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase()!;
    setBusy(true);
    setMsg(null);
    try {
      const origin = window.location.origin;
      if (mode === "sign-in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message === "Email not confirmed" ? "Confirm your email first: open the link we sent you, then sign in." : error.message);
        await openApp();
        return;
      } else if (mode === "sign-up") {
        if (password.length < 10) throw new Error("Use at least 10 characters.");
        const { error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${origin}/sign-in?confirmed=1` } });
        if (error) throw error;
        setMsg({ ok: true, text: "Check your email and tap the link to confirm your account. Then sign in." });
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/auth/reset` });
        if (error) throw error;
        setMsg({ ok: true, text: "If that email has an account, a reset link is on its way. Open it on this device." });
      } else {
        if (password.length < 10) throw new Error("Use at least 10 characters.");
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw new Error(/session/i.test(error.message) ? "This reset link has expired or was opened in a different browser. Ask for a new one on this device." : error.message);
        setMsg({ ok: true, text: "Password saved." });
        setTimeout(() => router.push("/profile"), 900);
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    }
    setBusy(false);
  }

  const input = "min-h-12 w-full rounded-xl border border-line-2 bg-night-3 px-4 text-[16px] text-chalk focus:border-chalk-3 focus:outline-none";

  // Already signed in on this device (for example, straight back from the confirmation email).
  if ((mode === "sign-in" || mode === "sign-up") && user) {
    return (
      <div className="mx-auto max-w-md pt-8">
        <div className="stage rounded-2xl p-6">
          <LogoMark size={44} />
          <p className="label mt-6 text-optic">Signed in</p>
          <h1 className="display t-m mt-1">You&apos;re in.</h1>
          <p className="mt-2 text-[15px] text-chalk-2">Signed in as {user.email}. Your swings sync to every device you sign in on.</p>
          <Button className="mt-5 w-full" disabled={busy} onClick={() => { setBusy(true); void openApp(); }}>
            {busy ? "One sec…" : "Open my swings"}
          </Button>
          {msg && <p role="status" className="mt-3 text-sm text-optic">{msg.text}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-8">
      <div className="stage rounded-2xl p-6">
        <LogoMark size={44} />
        {confirmed && mode === "sign-in" && (
          <p role="status" className="mt-5 rounded-lg border border-optic/30 bg-optic-wash px-3 py-2 text-[14px] text-chalk">
            Email confirmed. Sign in to bring your swings to this device.
          </p>
        )}
        <h1 className="display t-m mt-6">{COPY[mode].title}</h1>
        <p className="mt-2 text-[15px] text-chalk-2">{COPY[mode].lead}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode !== "reset" && (
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm text-chalk-2">Email</label>
              <input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </div>
          )}
          {mode !== "forgot" && (
            <div>
              <label htmlFor="pw" className="mb-1.5 block text-sm text-chalk-2">Password</label>
              <input
                id="pw"
                type="password"
                required
                minLength={mode === "sign-in" ? 1 : 10}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
              {mode !== "sign-in" && <p className="mt-1.5 text-[12px] text-chalk-3">At least 10 characters.</p>}
            </div>
          )}
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-optic" : "text-stitch"}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy} className="w-full">{busy ? "One sec…" : COPY[mode].button}</Button>
        </form>
        <div className="mt-6 space-y-2 text-[14px] text-chalk-2">
          {mode === "sign-in" && (
            <>
              <p><Link href="/forgot" className="underline">Forgot password?</Link></p>
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-chalk">New to Gapper?</p>
                <Link href="/sign-up" className="press flex min-h-12 w-full items-center justify-center rounded-lg border border-line-2 text-[15px] font-semibold text-chalk hover:bg-white/[0.03]">
                  Create a free account
                </Link>
              </div>
            </>
          )}
          {mode === "sign-up" && <p>Have an account? <Link href="/sign-in" className="text-optic">Sign in</Link></p>}
          {mode === "forgot" && <p><Link href="/sign-in" className="underline">Back to sign in</Link></p>}
        </div>
      </div>
      <p className="mt-4 px-1 text-[12px] leading-relaxed text-chalk-3">
        No account needed to use Gapper. Signing in only adds sync. <Link href="/privacy" className="underline">What we store</Link>
      </p>
    </div>
  );
}
