import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Field, Flash, Panel, Return, Submit, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { formatDateTime } from "@/lib/format";
import { addSnapshot, extractFromSource, fetchSnapshot, openSourceFile, updateSource, uploadSourceFile } from "../actions";
import { SourceFields } from "../SourceForm";

export const metadata = { title: "Source" };

export default async function SourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const { id } = await params;
  const sp = await searchParams;
  const [{ data: s }, { data: snaps }, { data: uses }, { data: statements }] = await Promise.all([
    db.from("evidence_sources").select("*").eq("id", id).maybeSingle(),
    db.from("source_snapshots").select("id, content_hash, fetched_at, fetched_from, content_text").eq("evidence_source_id", id).order("fetched_at", { ascending: false }),
    db.from("case_evidence").select("evidence_role, case:cases(id, title, status)").eq("evidence_source_id", id),
    db.from("statements").select("id, exact_quote").eq("source_id", id).limit(30),
  ]);
  if (!s) notFound();
  const back = `/admin/evidence/${id}`;
  const latest = snaps?.[0];
  return (
    <div>
      <AdminHeader kicker="Evidence" title={s.title} actions={s.canonical_url ? <a className="btn btn-sm" href={s.canonical_url} target="_blank" rel="noopener noreferrer">Open original source ↗</a> : null}>
        {s.is_demo && <strong>DEMO record. </strong>}Collected {formatDateTime(s.collected_at)}.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <Panel title="Details">
          <form action={updateSource} className="space-y-4">
            <input type="hidden" name="id" value={s.id} /><Return to={back} />
            <SourceFields s={s} />
            <Submit>Save source</Submit>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel title="Text snapshot (private)" note={latest ? `${latest.content_text.length.toLocaleString()} chars · ${formatDateTime(latest.fetched_at)}` : "none"}>
            {latest && <pre className="mb-3 max-h-64 overflow-auto whitespace-pre-wrap bg-paper-2 p-3 font-mono text-xs">{latest.content_text.slice(0, 4000)}{latest.content_text.length > 4000 ? "\n…" : ""}</pre>}
            {latest && <p className="meta mb-3 break-all">sha256 {latest.content_hash}</p>}
            <form action={addSnapshot} className="space-y-2">
              <input type="hidden" name="id" value={s.id} /><Return to={back} />
              <Field label="Paste full text" name="snapshot_text" rows={5} />
              <Submit small>Save text</Submit>
            </form>
            {s.canonical_url && (
              <form action={fetchSnapshot} className="mt-3"><input type="hidden" name="id" value={s.id} /><Return to={back} /><Submit tone="ghost" small>Fetch public page text</Submit></form>
            )}
            {latest && (
              <form action={extractFromSource} className="mt-3"><input type="hidden" name="id" value={s.id} /><Return to={back} /><Submit tone="ghost" small>Extract statements with AI</Submit></form>
            )}
          </Panel>
          <Panel title="Stored file (private)" note={s.file_path ? `${s.file_mime} · ${Math.round((s.file_size ?? 0) / 1024)} KB` : "none"}>
            {s.file_path && (
              <form action={openSourceFile} className="mb-3"><input type="hidden" name="id" value={s.id} /><Submit small tone="ghost">Open stored file</Submit></form>
            )}
            {s.file_sha256 && <p className="meta mb-3 break-all">sha256 {s.file_sha256}</p>}
            <form action={uploadSourceFile} className="space-y-2">
              <input type="hidden" name="id" value={s.id} /><Return to={back} />
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="block w-full text-sm" />
              <p className="meta">Screenshot or PDF, up to 4 MB. Kept private; the hash proves it hasn&apos;t changed.</p>
              <Submit small>{s.file_path ? "Replace file" : "Upload file"}</Submit>
            </form>
          </Panel>
          <Panel title="Used in">
            <ul className="space-y-1 text-sm">
              {(uses ?? []).map((u, i) => { const c = u.case as unknown as { id: string; title: string } | null; return c ? <li key={i}><Link className="link" href={`/admin/cases/${c.id}`}>{c.title}</Link> <span className="meta">({u.evidence_role})</span></li> : null; })}
              {(statements ?? []).map((st) => <li key={st.id}><Link className="link" href={`/admin/statements/${st.id}`}>“{st.exact_quote.slice(0, 70)}”</Link></li>)}
              {!uses?.length && !statements?.length && <li className="text-ink-2">Not used yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
