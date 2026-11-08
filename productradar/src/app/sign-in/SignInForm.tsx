"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, { status: "idle", message: "" });
  if (state.status === "sent") {
    return <p className="rounded-lg bg-good-wash p-4 text-sm text-good">{state.message}</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-ink-2" htmlFor="email">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        placeholder="you@example.com"
      />
      {state.status === "error" && <p className="text-sm text-bad">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
