import type { PassportCheck } from "@/lib/passport";
import { ThunkGroup } from "@/components/ThunkGroup";
import { SourceLabel } from "@/components/listing/SourceLabel";
import type { PassportSource } from "@/lib/passport";

export type PassportIdent = {
  /** Short number printed on the cover, for example GB-4F2A91. */
  number: string;
  rows: { label: string; value: string; source?: PassportSource }[];
  /** The two machine-readable lines, built from the listing's real fields. */
  mrz: [string, string];
};

const SHAPES: Record<PassportCheck["key"], { shape: "circle" | "rect" | "oval"; color: string }> = {
  stamp: { shape: "circle", color: "var(--brand-cleared-green)" },
  price: { shape: "rect", color: "var(--brand-customs-red)" },
  owners: { shape: "oval", color: "var(--brand-passport-violet)" },
  listing: { shape: "rect", color: "var(--brand-ink)" },
};

/**
 * The Bat Passport as an actual passport spread. Presentation only: the rules live in src/lib/passport.ts.
 * Left page: the bat's ID fields and machine-readable line. Right page: one ink stamp per check that has real data,
 * and a dashed "Not stamped yet" spot for each check that doesn't.
 */
export function BatPassport({ checks, filledCount, ident }: { checks: PassportCheck[]; filledCount: number; ident?: PassportIdent }) {
  return (
    <section aria-labelledby="passport-heading" className="grid gap-3" data-testid="bat-passport">
      <div className="grid overflow-hidden border-2 border-ink md:grid-cols-2" style={{ boxShadow: "6px 6px 0 var(--brand-ink)" }}>
        <div className="guilloche relative grid min-w-0 content-start gap-4 p-5 sm:p-6 md:min-h-[26rem] md:border-r-2 md:border-dashed md:border-[#cfc8b8]">
          <div className="flex items-baseline justify-between gap-3 border-b border-[#d9d2c2] pb-2">
            <h2 id="passport-heading" className="disp text-xl sm:text-2xl">
              Bat Passport
            </h2>
            {ident && <span className="label !text-[0.625rem] text-ink-soft">No. {ident.number}</span>}
          </div>
          {ident && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {ident.rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="label !text-[0.625rem] pt-[3px] text-ink-soft">{r.label}</dt>
                  <dd className="min-w-0 break-words">
                    {r.value}
                    {r.source && <SourceLabel source={r.source} className="ml-2 align-middle" />}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {ident && (
            <p className="mt-auto border-t border-[#d9d2c2] pt-3 font-mono leading-[1.6] tracking-[0.06em] text-[#4c4a44]" style={{ fontSize: "clamp(8.5px, 2.35vw, 12px)" }} aria-label="Machine-readable line built from this listing's fields" role="img">
              <span aria-hidden="true">
                {ident.mrz[0]}
                <br />
                {ident.mrz[1]}
              </span>
            </p>
          )}
        </div>
        <div className="guilloche min-w-0 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3 border-b border-[#d9d2c2] pb-2">
            <p className="label text-ink-soft">Checks</p>
            <p className="label" aria-label={`${filledCount} of 4 checks have data`}>
              {filledCount} of 4 stamped
            </p>
          </div>
          <ThunkGroup className="mt-2 grid gap-x-3 gap-y-2 sm:grid-cols-2">
            {checks.map((c) => {
              const look = SHAPES[c.key];
              const [head, tail] = c.key === "stamp" ? splitStamp(c.headline) : [c.headline, null];
              return (
                <div key={c.key} className="stamp-slot" data-check={c.key} data-filled={c.filled} data-source={c.source}>
                  {c.filled && <SourceLabel source={c.source} className="mb-1.5" />}
                  {c.filled ? (
                    <div className={`ink-stamp ${look.shape}`} style={{ ["--c" as string]: look.color }}>
                      <div>
                        <small>{c.title}</small>
                        <span className="hd">{head}</span>
                        {tail && <small>{tail}</small>}
                        {c.detail && <small className="mt-1 !tracking-normal normal-case">{c.detail}</small>}
                        <span className="sr-only"> (has data)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="ink-stamp empty">
                      <div>
                        <small>{c.title}</small>
                        <span className="hd">Not stamped yet</span>
                        <small className="!tracking-normal normal-case">{c.headline}</small>
                        {c.detail && <small className="mt-0.5 !tracking-normal normal-case">{c.detail}</small>}
                        <span className="sr-only"> (no data yet)</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </ThunkGroup>
        </div>
      </div>
      <p className="max-w-[70ch] text-sm text-ink-soft">
        Every line says where it comes from: Verified (catalog certification status and completed sales on the site), Seller says (this listing&apos;s own condition and damage answers) or Owners report (reports from people who own the model). A dashed spot means that check doesn&apos;t have enough data yet. Official lists:{" "}
        <a href="https://usssa.com" className="underline" rel="noopener noreferrer">
          USSSA
        </a>
        ,{" "}
        <a href="https://www.teamusa.org/usa-softball" className="underline" rel="noopener noreferrer">
          USA Softball
        </a>
        .
      </p>
    </section>
  );
}

function splitStamp(headline: string): [string, string | null] {
  const i = headline.indexOf(" · ");
  return i === -1 ? [headline, null] : [headline.slice(0, i), headline.slice(i + 3)];
}
