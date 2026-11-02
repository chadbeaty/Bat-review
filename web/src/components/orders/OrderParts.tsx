import { formatPrice } from "@/lib/format";
import { orderTimeline, statusLabel } from "@/lib/payments/state";

export function when(v: string | null | undefined): string {
  if (!v) return "";
  return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" || status === "delivered"
      ? "border-success/40 text-success"
      : status === "disputed" || status === "refunded" || status === "cancelled"
        ? "border-danger/40 text-danger"
        : "border-line-strong text-ink-soft";
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${tone}`} data-testid="order-status">
      {statusLabel(status)}
    </span>
  );
}

export type TimelineOrder = Parameters<typeof orderTimeline>[0];

export function Timeline({ order }: { order: TimelineOrder }) {
  const steps = orderTimeline(order);
  return (
    <ol className="grid gap-2" aria-label="Order progress">
      {steps.map((s) => (
        <li key={s.key} className="flex items-start gap-3 text-sm">
          <span aria-hidden className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full border ${s.done ? "border-success bg-success" : "border-line-strong"}`} />
          <span>
            <span className={s.done ? "font-medium" : "text-ink-soft"}>{s.label}</span>
            {s.at && s.done && <span className="block text-xs text-ink-soft">{when(s.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export type TrackingEventRow = { id: string; tracking_status: string; tracking_description: string | null; event_timestamp: string | null; location: string | null };

export function TrackingEvents({ events }: { events: TrackingEventRow[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-soft">No tracking scans yet.</p>;
  return (
    <ol className="grid gap-2 text-sm" data-testid="tracking-events">
      {events.map((e) => (
        <li key={e.id} className="border-b border-line/70 pb-2">
          <span className="font-medium capitalize">{e.tracking_status.replace(/_/g, " ")}</span>
          {e.tracking_description && <span> · {e.tracking_description}</span>}
          <span className="block text-xs text-ink-soft">
            {when(e.event_timestamp)}
            {e.location ? ` · ${e.location}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MoneyRows({ rows }: { rows: [string, number, string?][] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {rows.map(([label, cents, cls]) => (
        <div key={label} className="contents">
          <dt className={cls}>{label}</dt>
          <dd className={`text-right font-mono ${cls ?? ""}`}>{formatPrice(cents)}</dd>
        </div>
      ))}
    </dl>
  );
}
