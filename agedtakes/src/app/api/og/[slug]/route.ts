import type { NextRequest } from "next/server";
import { getCase } from "@/lib/data/public";
import { FORMATS, requiredFootnote, socialCard, templateForCaseType, type SocialFormat } from "@/lib/social/card";
import { CONFIDENCE } from "@/lib/editorial";
import { formatDate } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 300;

/** Share image for a PUBLISHED case (reads through the public API, so drafts can never render here). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const formatParam = request.nextUrl.searchParams.get("format") ?? "og";
  const format: SocialFormat = formatParam in FORMATS ? (formatParam as SocialFormat) : "og";
  const data = await getCase(slug).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  const template = templateForCaseType(data.case.case_type);
  const image = await socialCard(
    {
      template,
      headline: data.case.social_graphic_text || data.case.title,
      quote: data.statement?.exact_quote,
      subject: data.person.name,
      date: formatDate(data.case.published_at),
      confidence: data.case.evidence_confidence ? CONFIDENCE[data.case.evidence_confidence].label : null,
      isDemo: data.case.is_demo,
      footnote: requiredFootnote(template),
      url: absoluteUrl(`/cases/${data.case.slug}`),
    },
    format
  );
  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  return image;
}
