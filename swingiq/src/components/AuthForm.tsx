"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { Button } from "./ui";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; button: string }> = {
  "sign-in": { title: "Sign in", button: "Sign in" },
  "sign-up": { title: "Create your account", button: "Create account" },
  forgot: { title: "Reset your password", button: "Send reset link" },
  reset: { title: "Choose a new password", button: "Save password" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!cloudEnabled) {
    return (
      <div className="pt-10">
        <h1 className="display text-2xl">Accounts aren&apos;t switched on yet</h1>
        <p className="mt-3 text-[15px] text-chalk-2">SwingIQ works fully without an account. Your swings are saved on this phone.</p>
        <Link href="/" className="mt-6 inline-block text-optic">Back home</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase()!;
    setBusy(true);
    setMsg(null);
    try {
      const origin = window.location.origin;
      if (mode === "sign-in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/profile");
      } else if (mode === "sign-up") {
        if (password.length < 10) throw new Error("Use at least 10 characters.");
        const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/profile` } });
        if (error) throw error;
        setMsg({ ok: true, text: "Check your email to confirm your account, then sign in." });
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/reset` });
        if (error) throw error;
        setMsg({ ok: true, text: "If that email has an account, a reset link is on its way." });
      } else {
        if (password.length < 10) throw new Error("Use at least 10 characters.");
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setMsg({ ok: true, text: "Password saved." });
        setTimeout(() => router.push("/profile"), 900);
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const input = "min-h-12 w-full rounded-xl border border-line bg-night-2 px-4 text-[16px] text-chalk focus:border-chalk-3 focus:outline-none";
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="display text-[1.9rem] leading-tight">{COPY[mode].title}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode !== "reset" && (
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-chalk-2">Email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
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
          </div>
        )}
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-optic" : "text-stitch"}`}>
            {msg.text}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "One sec…" : COPY[mode].button}</Button>
      </form>
      <div className="mt-6 space-y-2 text-[14px] text-chalk-2">
        {mode === "sign-in" && (
          <>
            <p><Link href="/forgot" className="underline">Forgot password?</Link></p>
            <p>New here? <Link href="/sign-up" className="text-optic">Create an account</Link></p>
          </>
        )}
        {mode === "sign-up" && <p>Have an account? <Link href="/sign-in" className="text-optic">Sign in</Link></p>}
        {mode === "forgot" && <p><Link href="/sign-in" className="underline">Back to sign in</Link></p>}
      </div>
    </div>
  );
}
