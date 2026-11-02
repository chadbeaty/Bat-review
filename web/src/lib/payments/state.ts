// The order state machine. The database functions enforce the same transitions with their own status checks;
// this module is what pages use to decide what to show, and what the tests pin down.

export const ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "completed",
  "disputed",
  "refunded",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // Paid only from a verified Stripe webhook; cancelled when the checkout expires or is abandoned.
  awaiting_payment: ["paid", "cancelled"],
  // A cancelled order can still become paid if Stripe confirms a payment that raced the expiry and the hold is free.
  cancelled: ["paid"],
  paid: ["processing", "shipped", "delivered", "disputed", "refunded"],
  processing: ["shipped", "delivered", "disputed", "refunded"],
  shipped: ["delivered", "disputed", "refunded"],
  delivered: ["completed", "disputed", "refunded"],
  // A dispute ends with the order going back to where it was, completing, or a refund.
  disputed: ["paid", "processing", "shipped", "delivered", "completed", "refunded"],
  // A chargeback or refund can still arrive after completion.
  completed: ["disputed", "refunded"],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}

/** Statuses in which the buyer has paid and the money hasn't gone back. */
export const PAID_STATUSES: OrderStatus[] = ["paid", "processing", "shipped", "delivered", "completed", "disputed"];

/** Whether the seller can buy the shipping label now. */
export function canBuyLabel(status: string): boolean {
  return status === "paid" || status === "processing";
}

/** Whether the buyer can confirm they received the item. */
export function canConfirmReceipt(status: string, buyerConfirmedAt: string | null): boolean {
  return (status === "shipped" || status === "delivered") && !buyerConfirmedAt;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for payment",
  paid: "Paid, waiting for the seller to ship",
  processing: "Label created",
  shipped: "On its way",
  delivered: "Delivered",
  completed: "Complete",
  disputed: "On hold: problem reported",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export function statusLabel(s: string): string {
  return isOrderStatus(s) ? STATUS_LABELS[s] : s;
}

export type TimelineStep = { key: string; label: string; at: string | null; done: boolean };

/** The steps shown on an order page, in order, with the time each happened. */
export function orderTimeline(o: {
  order_status: string;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  label_at?: string | null;
}): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: "placed", label: "Order placed", at: o.created_at, done: true },
    { key: "paid", label: "Payment confirmed", at: o.paid_at, done: Boolean(o.paid_at) },
    { key: "label", label: "Shipping label created", at: o.label_at ?? null, done: Boolean(o.label_at) || Boolean(o.shipped_at) },
    { key: "shipped", label: "Shipped", at: o.shipped_at, done: Boolean(o.shipped_at) },
    { key: "delivered", label: "Delivered", at: o.delivered_at, done: Boolean(o.delivered_at) },
    { key: "completed", label: "Complete, seller paid", at: o.completed_at, done: Boolean(o.completed_at) },
  ];
  return steps;
}
