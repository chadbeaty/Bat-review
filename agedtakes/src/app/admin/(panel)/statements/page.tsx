import Link from "next/link";
import { AdminHeader, FilterLinks, Flash, Table, Td, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { STATEMENT_TYPE_LABELS, type StatementType } from "@/lib/editorial";
import { formatShortDate } from "@/lib/format";

export const metadata = { title: "Statements" };

export default async function Statements({ searchParams }: { searchParams: SearchParams }) {
  const { db } = await requireStaff("researcher");
  const sp = await searchParams;
  const filter = sp1(sp.filter);
  let q = db.from("statements").select("id, exact_quote, statement_type, published_at, visibility, verification_status, quote_verified_verbatim, ai_run_id, extraction_confidence, person:people(name)").order("created_at", { ascending: false }).limit(200);
  if (filter === "unverified") q = q.eq("verification_status", "unverified");
  if (filter === "ai") q = q.not("ai_run_id", "is", null);
  if (filter === "public") q = q.eq("visibility", "public");
  if (filter === "commitments") q = q.eq("statement_type", "explicit_commitment");
  const { data } = await q;
  return (
    <div>
      <AdminHeader kicker="Record" title="Statements" actions={<Link className="btn btn-sm" href="/admin/statements/new">Record a statement</Link>}>
        Exact public statements with their source. AI-extracted statements arrive here as unverified and internal.
      </AdminHeader>
      <Flash flash={readFlash(sp)} />
      <FilterLinks base="/admin/statements" param="filter" current={filter} options={[["unverified", "Unverified"], ["ai", "AI-extracted"], ["commitments", "Explicit commitments"], ["public", "Public"]]} />
      <Table head={["Quote", "Person", "Type", "Date", "Status"]}>
        {(data ?? []).map((s) => (
          <tr key={s.id}>
            <Td><Link className="link" href={`/admin/statements/${s.id}`}>“{s.exact_quote.slice(0, 110)}{s.exact_quote.length > 110 ? "…" : ""}”</Link>{s.ai_run_id && <span className="meta ml-2">AI {s.extraction_confidence ? `· ${Math.round(Number(s.extraction_confidence) * 100)}%` : ""}</span>}</Td>
            <Td>{(s.person as unknown as { name: string } | null)?.name}</Td>
            <Td mono>{STATEMENT_TYPE_LABELS[s.statement_type as StatementType]}</Td>
            <Td mono>{formatShortDate(s.published_at)}</Td>
            <Td mono>{s.visibility} · {s.verification_status}{s.quote_verified_verbatim ? " · verbatim ✓" : ""}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
