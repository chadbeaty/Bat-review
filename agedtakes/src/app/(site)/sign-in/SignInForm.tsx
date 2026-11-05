"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, { status: "idle", message: "" });
  if (state.status === "sent") {
    return (
      <div role="status" className="border border-ink p-5">
        <p className="headline text-2xl">Check your email.</p>
        <p className="mt-2 text-ink-2">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="field" />
      </div>
      {state.status === "error" && <p role="alert" className="text-red-ink">{state.message}</p>}
      <button className="btn w-full" type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
  );
}
