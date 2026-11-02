import Link from "next/link";

/** Placeholder for pages built in a later phase, so navigation never leads to a broken link. */
export function ComingSoon({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="wrap grid max-w-3xl gap-4 py-16">
      <p className="eyebrow">Coming in {phase}</p>
      <h1 className="display text-5xl font-bold">{title}</h1>
      <p className="text-lg text-ink-soft">{description}</p>
      <p>
        <Link href="/" className="btn btn-outline">
          Back to the homepage
        </Link>
      </p>
    </div>
  );
}
