import { Check, Field, SelectField } from "@/components/admin/ui";
import { SOURCE_TYPES, humanize } from "@/lib/editorial";

type Source = Record<string, unknown> | null;

export function SourceFields({ s }: { s: Source }) {
  const v = (k: string) => (s?.[k] as string | null | undefined) ?? null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField label="Type" name="source_type" required defaultValue={v("source_type") ?? "video"} options={SOURCE_TYPES.map((t) => [t, humanize(t)] as const)} />
      <SelectField label="Verification" name="verification_status" defaultValue={v("verification_status") ?? "unverified"} options={[["unverified", "Unverified"], ["verified", "Verified (I opened and checked it)"], ["disputed", "Disputed"], ["retracted", "Retracted by publisher"], ["unavailable", "No longer available"]]} />
      <div className="md:col-span-2"><Field label="Title" name="title" defaultValue={v("title")} required /></div>
      <Field label="Publisher" name="publisher" defaultValue={v("publisher")} placeholder="e.g. CNBC, SEC, the person's own channel" />
      <Field label="Author / speaker" name="author" defaultValue={v("author")} />
      <Field label="Original link" name="canonical_url" type="url" defaultValue={v("canonical_url")} help="Link the original, not a repost." />
      <Field label="Archived copy" name="archive_url" type="url" defaultValue={v("archive_url")} help="e.g. web.archive.org snapshot" />
      <Field label="Published at (UTC)" name="published_at" type="datetime-local" defaultValue={v("published_at") ? String(v("published_at")).slice(0, 16) : null} />
      <div className="flex items-end"><Check label="Primary source" name="is_primary" defaultChecked={Boolean(s?.is_primary)} help="The original record itself (broadcast, filing, post, ledger)." /></div>
      <div className="md:col-span-2"><Field label="Key excerpt (shown publicly)" name="source_excerpt" defaultValue={v("source_excerpt")} rows={3} help="Short, exact excerpt with time code if relevant." /></div>
      <div className="md:col-span-2"><Field label="Reliability notes (shown publicly)" name="reliability_notes" defaultValue={v("reliability_notes")} rows={2} /></div>
    </div>
  );
}
