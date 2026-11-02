"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveSearch, type SaveSearchState } from "@/app/shop/actions";

/** Saves the current search to the member's account. Signed-out visitors are asked to sign in first. */
export function SaveSearchButton({ path, search, name, signedIn }: { path: string; search: string; name: string; signedIn: boolean }) {
  const [state, action, pending] = useActionState<SaveSearchState, FormData>(saveSearch, {});
  if (!signedIn) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(path + search)}`} className="btn btn-outline justify-self-start">
        Sign in to save this search
      </Link>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-success">
        Search saved. Email alerts for new matches start when alerts launch.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="path" value={path} />
      <input type="hidden" name="search" value={search} />
      <input type="hidden" name="name" value={name} />
      <button type="submit" className="btn btn-outline justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Save this search"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
