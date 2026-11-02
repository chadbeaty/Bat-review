import Link from "next/link";
import type { BatSummary } from "@/lib/bats";
import { CONSTRUCTION_LABELS, formatInches, weightingText } from "@/lib/bat-display";

export function BatMiniCard({ bat, extra }: { bat: BatSummary; extra?: React.ReactNode }) {
  const facts = [
    weightingText(bat.weightingType, bat.endloadOz),
    CONSTRUCTION_LABELS[bat.constructionType],
    bat.barrelLengthInches ? `${formatInches(bat.barrelLengthInches)} barrel` : null,
  ].filter((x) => x && x !== "Not listed");
  return (
    <Link href={bat.path} className="card grid h-full content-start gap-2 p-4 no-underline hover:border-ink">
      <span className="text-xs font-medium text-ink-soft">
        {bat.manufacturerName} · {bat.modelYear}
      </span>
      <span className="font-semibold">{bat.modelName}</span>
      <span className="flex flex-wrap items-center gap-1">
        {bat.stamps.map((s) => (
          <span key={s} className="rounded-sm border border-ink px-1.5 py-0.5 font-mono text-[0.68rem] tracking-wider">
            {s}
          </span>
        ))}
        <span className="px-1 text-xs text-ink-soft">{facts.join(" · ")}</span>
      </span>
      {extra}
    </Link>
  );
}
