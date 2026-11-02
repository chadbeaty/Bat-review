import Link from "next/link";
import type { ListingDetail } from "@/lib/listings";

const QUESTIONS: { key: keyof ListingDetail["damage"]; label: string }[] = [
  { key: "hasCracks", label: "Cracks" },
  { key: "hasRattle", label: "Rattle" },
  { key: "hasLooseEndCap", label: "Loose end cap" },
  { key: "hasRepairs", label: "Repairs" },
  { key: "hasAlterations", label: "Alterations (rolled, shaved or otherwise modified)" },
  { key: "hasSignificantDamage", label: "Significant damage" },
];

const STRUCTURAL: Record<ListingDetail["structuralDisclosure"], { title: string; tone: string }> = {
  no_known_damage: { title: "Seller reports no known structural damage", tone: "border-success/40 bg-success/5" },
  damage_disclosed: { title: "Seller disclosed damage", tone: "border-danger/40 bg-danger/5" },
  unknown: { title: "Seller doesn't know the structural condition", tone: "border-warning/50 bg-warning/10" },
};

function answer(v: boolean | null) {
  if (v === true) return { text: "Yes", cls: "font-semibold text-danger" };
  if (v === false) return { text: "No", cls: "text-success" };
  return { text: "Not answered", cls: "text-ink-soft" };
}

/** Structural disclosure and every damage answer, shown near the top of a listing. */
export function Disclosures({ listing }: { listing: ListingDetail }) {
  const s = STRUCTURAL[listing.structuralDisclosure] ?? STRUCTURAL.unknown;
  return (
    <section aria-labelledby="disclosure-heading" className={`grid gap-3 rounded-lg border p-4 ${s.tone}`} data-testid="damage-disclosure">
      <h2 id="disclosure-heading" className="font-semibold">
        {s.title}
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {QUESTIONS.map((q) => {
          const a = answer(listing.damage[q.key]);
          return (
            <div key={q.key} className="flex justify-between gap-3 border-b border-line/70 py-1">
              <dt>{q.label}</dt>
              <dd className={a.cls}>{a.text}</dd>
            </div>
          );
        })}
      </dl>
      {listing.damageDisclosure && (
        <div className="grid gap-1 text-sm">
          <h3 className="font-semibold">Damage notes from the seller</h3>
          <p className="whitespace-pre-line">{listing.damageDisclosure}</p>
        </div>
      )}
      {listing.cosmeticWear && (
        <div className="grid gap-1 text-sm">
          <h3 className="font-semibold">Cosmetic wear</h3>
          <p className="whitespace-pre-line">{listing.cosmeticWear}</p>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        These are the seller&apos;s own answers. Check the photos for anything they don&apos;t mention. See{" "}
        <Link href="/buyer-protection" className="underline">
          buyer protection
        </Link>{" "}
        for what happens if an item isn&apos;t as described.
      </p>
    </section>
  );
}
