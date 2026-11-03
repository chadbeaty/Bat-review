import Link from "next/link";
import { BatDrawing } from "@/components/BatDrawing";
import { batSpecFrom } from "@/lib/bat-drawing";

const EMPTY_BAT = batSpecFrom({ length_inches: 34, barrel_length_inches: 12.75, construction_type: "one_piece", weighting_type: "balanced" }, null);

/** A designed empty state: a dashed spot with a faint, clearly decorative bat drawing. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="grid-paper grid justify-items-start gap-3 border-2 border-dashed border-ink p-6">
      <div className="w-40 opacity-40" aria-hidden="true">
        <BatDrawing spec={EMPTY_BAT} fluid decorative detail={false} />
      </div>
      <p className="font-bold">{title}</p>
      <p className="max-w-prose text-ink-soft">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-outline">
          {action.label}
        </Link>
      )}
    </div>
  );
}
