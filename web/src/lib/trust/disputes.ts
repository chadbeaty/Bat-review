// Dispute types, statuses and evidence rules shared by the member screens, the admin screens and the tests.

export const DISPUTE_TYPES: Record<string, string> = {
  not_received: "I didn't receive the item",
  not_as_described: "It isn't as described",
  damaged_in_transit: "It arrived damaged",
  counterfeit: "It looks counterfeit or altered",
  payment_chargeback: "Payment problem",
  other: "Something else",
};

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  awaiting_seller: "Waiting for the seller",
  awaiting_buyer: "Waiting for the buyer",
  under_review: "Under review by support",
  resolved_buyer: "Resolved for the buyer",
  resolved_seller: "Resolved for the seller",
  closed: "Closed",
};

export const CLOSED_DISPUTE_STATUSES = ["resolved_buyer", "resolved_seller", "closed"];

export const EVIDENCE_MAX_FILES = 4;
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;
export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Checks the paths a browser reports after uploading evidence: they must sit in the member's own dispute folder. */
export function validEvidencePaths(paths: unknown, userId: string, disputeId: string): string[] | null {
  if (!Array.isArray(paths) || paths.length > EVIDENCE_MAX_FILES) return null;
  const prefix = `${userId}/${disputeId}/`;
  for (const p of paths) {
    if (typeof p !== "string" || !p.startsWith(prefix) || p.includes("..") || p.length > 200 || !/^[A-Za-z0-9_./-]+$/.test(p)) return null;
  }
  return paths as string[];
}
