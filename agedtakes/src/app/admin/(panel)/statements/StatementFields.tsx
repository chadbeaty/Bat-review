import { Field, SelectField } from "@/components/admin/ui";
import { STATEMENT_TYPES, STATEMENT_TYPE_LABELS } from "@/lib/editorial";

export function StatementFields({ s, people, sources, locked }: { s: Record<string, unknown> | null; people: [string, string][]; sources: [string, string][]; locked?: boolean }) {
  const v = (k: string) => (s?.[k] as string | null | undefined) ?? null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField label="Person" name="person_id" required options={people} defaultValue={v("person_id")} empty="Choose…" />
      <SelectField label="Type" name="statement_type" required defaultValue={v("statement_type") ?? "opinion"} options={STATEMENT_TYPES.map((t) => [t, STATEMENT_TYPE_LABELS[t]] as const)} help="Explicit commitment only when the wording itself is a commitment." />
      <div className="md:col-span-2">
        <Field label="Exact quotation" name="exact_quote" defaultValue={v("exact_quote")} rows={3} required readOnly={locked} help={locked ? "Public: change through a correction below." : "Character for character from the source. Never paraphrase here."} />
      </div>
      <div className="md:col-span-2"><Field label="Plain-English summary (not a quote)" name="normalized_summary" defaultValue={v("normalized_summary")} /></div>
      <SelectField label="Source" name="source_id" options={sources} defaultValue={v("source_id")} empty="— none yet —" />
      <Field label="Time code" name="source_timecode" defaultValue={v("source_timecode")} placeholder="mm:ss" />
      <Field label="Date said (UTC)" name="published_at" type="datetime-local" defaultValue={v("published_at") ? String(v("published_at")).slice(0, 16) : null} readOnly={locked} />
      <SelectField label="Date precision" name="date_precision" defaultValue={v("date_precision") ?? "day"} options={[["exact", "Exact time"], ["day", "Day"], ["month", "Month"], ["year", "Year"], ["unknown", "Unknown"]]} />
      <Field label="Asset or topic" name="asset_or_topic" defaultValue={v("asset_or_topic")} />
      <SelectField label="Verification" name="verification_status" defaultValue={v("verification_status") ?? "unverified"} options={[["unverified", "Unverified"], ["verified", "Verified against the original"], ["disputed", "Disputed"], ["unverifiable", "Unverifiable"]]} />
      <div className="md:col-span-2"><Field label="Context" name="context" defaultValue={v("context")} rows={3} help="The question asked, what came before and after, anything that changes the meaning." /></div>
      <div className="md:col-span-2"><Field label="Conditions the speaker attached" name="conditions" defaultValue={v("conditions")} /></div>
    </div>
  );
}
