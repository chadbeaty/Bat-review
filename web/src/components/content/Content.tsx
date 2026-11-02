import Link from "next/link";
import { brand } from "@/config/brand";

/** The notice at the top of every legal draft. */
export function AttorneyNotice() {
  return (
    <div role="note" className="rounded-md border-2 border-warning/60 bg-warning/5 px-4 py-3 text-warning">
      <p className="font-semibold">Draft for review by a qualified attorney before launch. Not legal advice.</p>
      <p className="mt-1 text-sm">
        Bracketed items are decisions for the owner. {brand.legalEntity} is a placeholder for the business&apos;s legal name.
      </p>
    </div>
  );
}

/** A decision the owner still has to make, shown highlighted so it can't be missed. */
export function Decide({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-accent/60 px-1 text-ink">[{children}]</mark>;
}

/** Shared layout for content pages: heading, intro and readable body text. */
export function ContentPage({
  eyebrow,
  title,
  intro,
  children,
  legal = false,
  updated,
  toc,
}: {
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  legal?: boolean;
  updated?: string;
  toc?: { id: string; label: string }[];
}) {
  return (
    <article className="wrap grid max-w-3xl gap-6 py-10 md:py-14">
      <header className="grid gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display text-5xl font-bold">{title}</h1>
        {intro && <div className="text-lg text-ink-soft">{intro}</div>}
        {updated && <p className="text-sm text-ink-soft">Draft prepared {updated}</p>}
      </header>
      {legal && <AttorneyNotice />}
      {toc && toc.length > 0 && (
        <nav aria-label="On this page" className="card p-4 text-sm">
          <p className="mb-2 font-semibold">On this page</p>
          <ol className="grid list-decimal gap-1 pl-5">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="underline">
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="prose-content grid gap-6 leading-relaxed [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_section]:grid [&_section]:gap-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function RelatedLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Related pages" className="flex flex-wrap gap-3 border-t border-line pt-6 text-sm">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="btn btn-outline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
