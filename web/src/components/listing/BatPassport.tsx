import type { PassportCheck } from "@/lib/passport";

/** Presentation only: the rules live in src/lib/passport.ts. A diamond is filled when the check has real data. */
export function BatPassport({ checks, filledCount }: { checks: PassportCheck[]; filledCount: number }) {
  return (
    <section aria-labelledby="passport-heading" className="card overflow-hidden" data-testid="bat-passport">
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-2 text-surface">
        <h2 id="passport-heading" className="font-mono text-sm font-medium uppercase tracking-wider">
          Bat Passport
        </h2>
        <p className="font-mono text-sm" aria-label={`${filledCount} of 4 checks have data`}>
          {filledCount} of 4
        </p>
      </div>
      <ul className="divide-y divide-line">
        {checks.map((c) => (
          <li key={c.key} className="grid grid-cols-[1.5rem_1fr] gap-3 px-4 py-3" data-check={c.key} data-filled={c.filled}>
            <span
              aria-hidden="true"
              className={`mt-1.5 block h-3 w-3 rotate-45 border-2 border-ink ${c.filled ? "bg-accent" : "bg-surface"}`}
            />
            <div className="grid gap-0.5">
              <p className="eyebrow">{c.title}</p>
              <p className="font-semibold">
                {c.headline}
                <span className="sr-only">{c.filled ? " (has data)" : " (no data yet)"}</span>
              </p>
              {c.detail && <p className="text-sm text-ink-soft">{c.detail}</p>}
              {c.key === "stamp" && (
                <p className="text-xs text-ink-soft">
                  Official lists:{" "}
                  <a href="https://usssa.com" className="underline" rel="noopener noreferrer">
                    USSSA
                  </a>
                  ,{" "}
                  <a href="https://www.teamusa.org/usa-softball" className="underline" rel="noopener noreferrer">
                    USA Softball
                  </a>
                  .
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
