import Link from "next/link";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface p-6">
      <p className="font-semibold">{title}</p>
      <p className="max-w-prose text-ink-soft">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-outline">
          {action.label}
        </Link>
      )}
    </div>
  );
}
