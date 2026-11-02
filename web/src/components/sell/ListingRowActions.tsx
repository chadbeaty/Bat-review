"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDraft, removeListing } from "@/app/sell/actions";

/** Remove (live listings) and delete (drafts only), each with a confirmation. */
export function ListingRowActions({ id, title, status }: { id: string; title: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canRemove = status === "active" || status === "pending_review";
  const canDelete = status === "draft";
  if (!canRemove && !canDelete) return null;

  const act = () => {
    const question = canDelete
      ? `Delete the draft “${title}”? Its photos are deleted too. This can't be undone.`
      : `Remove “${title}” from sale? Buyers won't see it any more. You can relist it later.`;
    if (!window.confirm(question)) return;
    start(async () => {
      const r = canDelete ? await deleteDraft(id) : await removeListing(id);
      if (!r.ok) setError(r.error ?? "That didn't work. Try again.");
      else router.refresh();
    });
  };

  return (
    <>
      <button type="button" className="btn btn-outline px-3 py-1.5 text-sm text-danger" onClick={act} disabled={pending}>
        {pending ? "Working…" : canDelete ? "Delete" : "Remove"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
