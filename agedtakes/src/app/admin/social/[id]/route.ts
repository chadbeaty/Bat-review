import { NextResponse, type NextRequest } from "next/server";
import { checkStaff } from "@/lib/auth/staff";
import { CONFIDENCE, type Confidence } from "@/lib/editorial";
import { FORMATS, requiredFootnote, socialCard, templateForCaseType, type SocialFormat } from "@/lib/social/card";
import { formatDate } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";

// Share graphics for staff: works for approved (not yet published) cases too. Never for unapproved drafts.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkStaff("researcher");
  if (!check.ok) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const { data: c } = await check.staff.db.from("cases").select("slug, title, case_type, status, evidence_confidence, published_at, approved_at, is_demo, social_graphic_text, person:people(name), statement:statements!cases_primary_statement_id_fkey(exact_quote)").eq("id", id).maybeSingle();
  if (!c || !["approved", "published", "disputed"].includes(c.status)) return new NextResponse("Share graphics are available once a case is approved.", { status: 409 });
  const formatParam = request.nextUrl.searchParams.get("format") ?? "og";
  const format: SocialFormat = formatParam in FORMATS ? (formatParam as SocialFormat) : "og";
  const template = templateForCaseType(c.case_type);
  const image = await socialCard({
    template,
    headline: c.social_graphic_text || c.title,
    quote: (c.statement as unknown as { exact_quote: string } | null)?.exact_quote ?? null,
    subject: (c.person as unknown as { name: string } | null)?.name ?? null,
    date: formatDate(c.published_at ?? c.approved_at),
    confidence: c.evidence_confidence ? CONFIDENCE[c.evidence_confidence as Confidence].label : null,
    isDemo: c.is_demo,
    footnote: requiredFootnote(template),
    url: absoluteUrl(`/cases/${c.slug}`),
  }, format);
  image.headers.set("Content-Disposition", `inline; filename="aged-takes-${c.slug}-${format}.png"`);
  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
