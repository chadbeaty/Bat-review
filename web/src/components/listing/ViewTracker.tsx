"use client";

import { useEffect } from "react";

/** Records one view of a listing after the page loads. The server decides whether it counts. */
export function ViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    fetch(`/api/listings/${listingId}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [listingId]);
  return null;
}
