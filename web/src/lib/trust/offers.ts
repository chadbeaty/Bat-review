// Offer rules shared by the screens, the server actions and the tests. The database enforces the same rules
// (respond_to_offer); this module lets screens show only the buttons that can work and show expiry on read.

export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "expired" | "withdrawn" | "completed";
export type OfferAction = "accept" | "reject" | "counter" | "withdraw";

export type OfferLike = {
  status: OfferStatus;
  madeBy: string;
  buyerId: string;
  sellerId: string;
  expiresAt: string | Date;
};

export const OFFER_MIN_CENTS = 100;

/** The status a member should see: open offers past their expiry read as expired even before the sweep runs. */
export function effectiveStatus(offer: Pick<OfferLike, "status" | "expiresAt">, now: Date = new Date()): OfferStatus {
  if ((offer.status === "pending" || offer.status === "accepted") && new Date(offer.expiresAt).getTime() <= now.getTime()) return "expired";
  return offer.status;
}

/** When an offer made now expires. */
export function expiryFrom(now: Date, expiryHours: number): Date {
  const hours = Number.isFinite(expiryHours) && expiryHours >= 1 ? expiryHours : 48;
  return new Date(now.getTime() + hours * 3_600_000);
}

/** Time left as short text ("35 min", "30 h", "3 d 4 h"), or null when expired. */
export function timeLeft(expiresAt: string | Date, now: Date = new Date()): string | null {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** Which actions this member can take on the offer right now. */
export function allowedActions(offer: OfferLike, actorId: string, now: Date = new Date()): OfferAction[] {
  if (effectiveStatus(offer, now) !== "pending") return [];
  if (actorId !== offer.buyerId && actorId !== offer.sellerId) return [];
  if (actorId === offer.madeBy) return ["withdraw"];
  return ["accept", "reject", "counter"];
}

/** Validates an amount in cents for an offer or counter on a listing. Returns an error message or null. */
export function validateOfferAmount(amountCents: number, askingCents: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents < OFFER_MIN_CENTS) return "Enter an amount of at least $1.00.";
  if (amountCents >= askingCents) return "Offers must be below the asking price. Use Buy now to pay the full price.";
  return null;
}

/** Parses "125", "125.50" or "$1,250" to cents; null when it isn't a plain dollar amount. */
export function parseDollarsToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export const STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Waiting for a response",
  accepted: "Accepted",
  rejected: "Declined",
  countered: "Countered",
  expired: "Expired",
  withdrawn: "Withdrawn",
  completed: "Completed",
};

export function checkoutPathForOffer(listingId: string, offerId: string): string {
  return `/checkout/${listingId}?offer=${offerId}`;
}
