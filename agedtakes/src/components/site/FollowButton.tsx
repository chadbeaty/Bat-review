"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { getFollowState, setFollow } from "@/app/(site)/follow-actions";

export function FollowButton({ personId, slug }: { personId: string; slug: string }) {
  const [state, setState] = useState<{ signedIn: boolean; following: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getFollowState(personId).then((s) => live && setState(s)).catch(() => live && setState({ signedIn: false, following: false }));
    return () => {
      live = false;
    };
  }, [personId]);

  if (!state) return <span className="btn btn-sm opacity-50" aria-hidden>Follow</span>;
  if (!state.signedIn) {
    return <Link href={`/sign-in?next=${encodeURIComponent(`/people/${slug}`)}`} className="btn btn-sm">Follow</Link>;
  }
  return (
    <button
      type="button"
      className={`btn btn-sm ${state.following ? "btn-ghost" : ""}`}
      disabled={pending}
      aria-pressed={state.following}
      onClick={() => start(async () => setState({ signedIn: true, following: (await setFollow(personId, !state.following)).following }))}
    >
      {state.following ? "Following" : "Follow"}
    </button>
  );
}
