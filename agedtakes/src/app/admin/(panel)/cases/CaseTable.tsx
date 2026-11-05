import Link from "next/link";
import { AiBadge, StatusPill, Table, Td } from "@/components/admin/ui";
import { CASE_TYPE_LABELS, CONFIDENCE, type CaseType, type Confidence } from "@/lib/editorial";
import { checklistProgress } from "@/lib/editorial/legal";
import { formatShortDate } from "@/lib/format";

export type CaseRow = {
  id: string; title: string; status: string; case_type: string; evidence_confidence: string | null; ai_generated: boolean; is_demo: boolean;
  last_updated_at: string; legal_review: Record<string, unknown> | null; person: { name: string } | null;
};

export const CASE_COLUMNS = "id, title, status, case_type, evidence_confidence, ai_generated, is_demo, last_updated_at, legal_review, person:people(name)";

export function CaseTable({ rows, empty }: { rows: CaseRow[]; empty?: string }) {
  return (
    <Table head={["Case", "Subject", "Type", "Status", "Evidence", "Legal", "Updated"]} empty={empty}>
      {rows.map((c) => {
        const legal = checklistProgress(c.legal_review);
        return (
          <tr key={c.id}>
            <Td><Link className="link font-semibold" href={`/admin/cases/${c.id}`}>{c.title}</Link> {c.ai_generated && <AiBadge />}{c.is_demo && <span className="meta ml-1">DEMO</span>}</Td>
            <Td>{c.person?.name}</Td>
            <Td mono>{CASE_TYPE_LABELS[c.case_type as CaseType]}</Td>
            <Td><StatusPill status={c.status} /></Td>
            <Td mono>{c.evidence_confidence ? CONFIDENCE[c.evidence_confidence as Confidence].label : "—"}</Td>
            <Td mono>{legal.done}/{legal.total}</Td>
            <Td mono>{formatShortDate(c.last_updated_at)}</Td>
          </tr>
        );
      })}
    </Table>
  );
}
