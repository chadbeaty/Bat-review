import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getFilters } from "@/lib/data/public";
import { CONFIDENCE, CONFIDENCE_LEVELS, PREDICTION_STATUSES, PREDICTION_STATUS_LABELS } from "@/lib/editorial";
import { LEGAL_CHECKLIST } from "@/lib/editorial/legal";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: "Methodology",
  description: "How Aged Takes classifies evidence, records statements, resolves predictions, counts track records and corrects mistakes.",
  path: "/methodology",
});

const PREDICTION_RULES: Record<string, string> = {
  open: "The deadline hasn't passed, or the criteria can't yet be checked. Never counted as wrong.",
  resolved_correct: "The documented criteria were met by the deadline, according to the stated resolution source.",
  resolved_incorrect: "The deadline passed (or the outcome became impossible, which we explain) without the criteria being met.",
  partially_correct: "A measurable part came true and another part didn't, or an undefined qualifier (\"by a lot\") can't be scored.",
  unscorable: "Too vague to score fairly, or the resolution source no longer exists. Explained case by case.",
  disputed: "Reasonable readings of the wording, or of the data, give different results.",
};

export default async function MethodologyPage() {
  const filters = await getFilters().catch(() => null);
  const versions = filters?.methodology ?? [];
  return (
    <div className="wrap max-w-4xl py-12">
      <PageHeader kicker="Standards" title="Methodology">
        What counts as evidence, how predictions are scored, what we will and won&apos;t say, and how we fix mistakes.
        {versions[0] && <> Current version: <strong>{versions[0].version}</strong>, effective {formatDate(versions[0].effective_at)}.</>}
      </PageHeader>

      <div className="prose-case">
        <h2 id="principles">Principles</h2>
        <ul>
          <li><strong>Original sources first.</strong> Every public claim links to where it came from: the broadcast, the post, the filing, the transaction. We prefer primary records and archive them where we can.</li>
          <li><strong>Exact words only.</strong> Text in quotation marks is the person&apos;s verbatim wording. Summaries are never presented as quotes. Where we can, we check quotations word for word against a stored copy of the source.</li>
          <li><strong>Context travels with the quote.</strong> We record the question being answered, conditions the speaker attached, and anything that changes the meaning.</li>
          <li><strong>Labels matter.</strong> We distinguish an <em>opinion</em>, a <em>prediction</em>, an <em>explicit commitment</em>, a <em>documented action</em> and our own <em>editorial interpretation</em>.</li>
          <li><strong>A changed mind is not dishonesty.</strong> People update their views. We document changes; we do not call them hypocrisy without evidence and editorial review.</li>
          <li><strong>No invented records.</strong> We never fabricate quotes, transactions, people or evidence. Demonstration records are labeled “Demo only — fictional”.</li>
        </ul>

        <h2 id="confidence">Evidence confidence</h2>
        <p>Every case carries one of four classifications. Each evidence item explains what it shows, what it does not show, its limitations, and whether identity or ownership is independently established.</p>
      </div>
      <dl className="my-6 grid gap-4 sm:grid-cols-2">
        {CONFIDENCE_LEVELS.map((l) => (
          <div key={l} className="border border-ink p-5">
            <dt className="headline text-2xl">{CONFIDENCE[l].label}</dt>
            <dd className="mt-2 text-ink-2">{CONFIDENCE[l].description}</dd>
          </div>
        ))}
      </dl>

      <div className="prose-case">
        <h2 id="money">Money, wallets and disclosures</h2>
        <ul>
          <li>A <strong>wallet transfer</strong> is not a sale. An <strong>exchange deposit</strong> is not a completed trade.</li>
          <li><strong>Institutional</strong> or fund holdings are not personal holdings. A <strong>spouse&apos;s or family member&apos;s</strong> transaction is not the person&apos;s own, and we say whose it was.</li>
          <li>We attribute a wallet to someone only if they identified it themselves or ownership is independently verified. A third-party label is not proof.</li>
          <li>A missing disclosure is not proof of concealment. Disclosure amounts reported as ranges are shown as ranges.</li>
          <li>We never state that a person sold an asset unless reliable evidence supports that exact conclusion.</li>
        </ul>

        <h2 id="predictions">How predictions are recorded and resolved</h2>
        <p>When we record a prediction we store, separately and permanently: the exact wording, the date it was made, the subject or asset, any target and currency, the deadline, and the resolution criteria. The original is never edited; if we made a recording error, the fix appears in the <Link href="/corrections">corrections log</Link>.</p>
        <p>We resolve a prediction only when its documented criteria and deadline are satisfied, using an explicitly named price or data source. For price targets we store the provider, the asset identifier, the currency, the time zone, the observation time and the methodology (for example, &quot;official daily close&quot; versus intraday high), and we account for stock splits and other corporate actions that change an asset&apos;s identity or price basis. Resolving before the deadline requires a written reason — for example, the target was reached early. An AI system may <em>propose</em> an outcome; only an editor can confirm it.</p>
      </div>
      <dl className="my-6 divide-y divide-rule border-y border-ink">
        {PREDICTION_STATUSES.map((s) => (
          <div key={s} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="font-mono text-sm font-semibold">{PREDICTION_STATUS_LABELS[s]}</dt>
            <dd className="text-ink-2">{PREDICTION_RULES[s]}</dd>
          </div>
        ))}
      </dl>

      <div className="prose-case">
        <h2 id="scoring">Track records: what we count</h2>
        <p>We do not publish a single reputation or &quot;honesty&quot; score. Profiles show separate, transparent measures, always with their denominators:</p>
        <ul>
          <li><strong>Prediction accuracy</strong> — e.g. &quot;7 correct out of 12 resolved predictions&quot;. Open, unscorable and disputed predictions are listed but not counted.</li>
          <li><strong>Documented contradictions</strong> — the number of published cases about changed positions or broken commitments, each with its evidence classification, dates and editorial explanation.</li>
          <li><strong>Statements on record</strong> — how many public statements we&apos;ve reviewed, so a small sample is visible as small.</li>
        </ul>

        <h2 id="process">Editorial process</h2>
        <p>Every case moves through: Discovered → Researching → Evidence gathering → Draft ready → Needs review → Approved → Published (or Rejected, Needs more evidence, Disputed, Archived). Approval requires an editor, an evidence classification other than Unconfirmed, at least one evidence record and a completed legal review checklist. Publishing requires a separate, explicit confirmation. Editing an approved case sends it back to review. These rules are enforced by the database itself, not just the newsroom screens.</p>

        <h2 id="ai">Use of AI</h2>
        <p>We use AI tools to help find, extract and organize public statements, to match them against earlier statements, to assess evidence and to draft cases and social copy. AI output is a starting point for human reporting. It cannot publish anything: drafts are invisible to the public until an editor has reviewed the sources, completed the legal checklist and approved and published the case. AI agents work from source text we have collected, and quotations are checked mechanically against that text.</p>

        <h2 id="legal">Pre-publication checklist</h2>
      </div>
      <ol className="my-4 list-decimal space-y-2 pl-6 text-ink-2">
        {LEGAL_CHECKLIST.map((i) => <li key={i.key}><strong className="text-ink">{i.label}.</strong> {i.help}</li>)}
      </ol>

      <div className="prose-case">
        <h2 id="reply">Right of reply</h2>
        <p>Before publishing a case that reflects on someone&apos;s conduct, we try to contact them or their representatives and give them reasonable time to respond. Each case shows the outreach status, and we publish responses in full where practical. Responses received after publication are added and dated.</p>

        <h2 id="corrections">Corrections policy</h2>
        <p>We correct errors of fact promptly and visibly. Each correction records the date, what changed and why, and appears on the case and in the public <Link href="/corrections">corrections log</Link>. We don&apos;t quietly rewrite published text: the system refuses edits to published cases that don&apos;t go through a correction. Clarifications that don&apos;t change facts are noted the same way.</p>

        <h2 id="sponsors">Sponsors and advertising</h2>
        <p>Sponsored material is always labeled. Sponsors and advertisers have no say in which people we cover, how evidence is classified, how predictions are scored or what our conclusions are.</p>

        <h2 id="limits">Limitations</h2>
        <ul>
          <li>We can only assess what is publicly documented. Private sales, unreported accounts and off-record statements are outside what we can verify.</li>
          <li>Public records contain errors. Where sources conflict we say so and may classify a case as Disputed.</li>
          <li>Coverage is selective: a person&apos;s profile reflects the statements we have reviewed, not everything they have ever said.</li>
          <li>Nothing on this site is investment advice.</li>
        </ul>

        <h2 id="versions">Methodology versions</h2>
      </div>
      <ul className="mt-4 space-y-3">
        {versions.map((v) => (
          <li key={v.version} className="border-l-[3px] border-ink pl-4">
            <p className="font-mono text-sm font-semibold">Version {v.version} · effective {formatDate(v.effective_at)}</p>
            <p className="text-ink-2">{v.summary}</p>
          </li>
        ))}
        {versions.length === 0 && <li className="text-ink-2">Version 1.0 (initial).</li>}
      </ul>
    </div>
  );
}
