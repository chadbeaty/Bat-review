import Link from "next/link";
import { AdminHeader, FilterLinks, Flash, Table, Td, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { formatShortDate, hostname } from "@/lib/format";
import { humanize } from "@/lib/editorial";

export const metadata = { title: "Evidence" };

export default async function EvidenceList({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const status = sp1(sp.status);
  const q = sp1(sp.q);
  let query = db.from("evidence_sources").select("id, title, publisher, source_type, canonical_url, published_at, verification_status, is_primary, is_demo, content_hash").order("created_at", { ascending: false }).limit(200);
  if (status) query = query.eq("verification_status", status);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%_,()]/g, "")}%,publisher.ilike.%${q.replace(/[%_,()]/g, "")}%`);
  const { data } = await query;
  return (
    <div>
      <AdminHeader kicker="Record" title="Evidence sources" actions={<Link className="btn btn-sm" href="/admin/evidence/new">Add a source</Link>}>
        Every public claim links to one of these. Store full text snapshots so quotations can be checked word for word.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <FilterLinks base="/admin/evidence" param="status" current={status} options={[["unverified", "Unverified"], ["verified", "Verified"], ["disputed", "Disputed"], ["retracted", "Retracted"], ["unavailable", "Unavailable"]]} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search title or publisher" className="field max-w-xs" /><button className="btn btn-sm">Search</button></form>
      <Table head={["Source", "Type", "Published", "Status", "Text"]}>
        {(data ?? []).map((s) => (
          <tr key={s.id}>
            <Td><Link className="link font-semibold" href={`/admin/evidence/${s.id}`}>{s.title}</Link><div className="meta">{s.publisher ?? ""} {hostname(s.canonical_url)}{s.is_primary ? " · primary" : ""}{s.is_demo ? " · DEMO" : ""}</div></Td>
            <Td mono>{humanize(s.source_type)}</Td>
            <Td mono>{formatShortDate(s.published_at)}</Td>
            <Td mono>{s.verification_status}</Td>
            <Td mono>{s.content_hash ? "stored" : "—"}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
