import Link from "next/link";
import type { BatSummary } from "@/lib/bats";
import { BatDrawing } from "@/components/BatDrawing";
import { batSpecFromCatalog } from "@/lib/bat-drawing";
import { CONSTRUCTION_LABELS, formatInches, weightingText } from "@/lib/bat-display";

export function BatMiniCard({ bat, extra }: { bat: BatSummary; extra?: React.ReactNode }) {
  const facts = [
    weightingText(bat.weightingType, bat.endloadOz),
    CONSTRUCTION_LABELS[bat.constructionType],
    bat.barrelLengthInches ? `${formatInches(bat.barrelLengthInches)} barrel` : null,
  ].filter((x) => x && x !== "Not listed");
  return (
    <Link href={bat.path} className="card grid h-full content-start gap-2 p-4 no-underline hover:shadow-[4px_4px_0_var(--brand-ink)]">
      <span className="grid-paper -mx-4 -mt-4 mb-1 block border-b-[1.5px] border-ink px-4 py-3">
        <BatDrawing spec={batSpecFromCatalog(bat)} fluid decorative detail />
      </span>
      <span className="text-xs font-medium text-ink-soft">
        {bat.manufacturerName} · {bat.modelYear}
      </span>
      <span className="disp-c text-[1.15rem]">{bat.modelName}</span>
      <span className="flex flex-wrap items-center gap-1">
        {bat.stamps.map((s) => (
          <span key={s} className="stamp-chip">
            {s}
          </span>
        ))}
        <span className="px-1 text-xs text-ink-soft">{facts.join(" · ")}</span>
      </span>
      {extra}
    </Link>
  );
}
