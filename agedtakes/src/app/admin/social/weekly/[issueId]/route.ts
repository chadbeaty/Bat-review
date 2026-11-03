import { NextResponse, type NextRequest } from "next/server";
import { checkStaff } from "@/lib/auth/staff";
import { FORMATS, socialCard, type SocialFormat } from "@/lib/social/card";
import { digestCases } from "@/lib/newsletter-send";
import { formatDate } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";

// Share graphic for a weekly roundup issue. Lists only published cases (digestCases filters to published).
export async function GET(request: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  const check = await checkStaff("editor");
  if (!check.ok) return new NextResponse("Not found", { status: 404 });
  const { issueId } = await params;
  const { data: issue } = await check.staff.db.from("newsletter_issues").select("subject, case_ids, created_at").eq("id", issueId).maybeSingle();
  if (!issue) return new NextResponse("Not found", { status: 404 });
  const cases = await digestCases(check.staff.db, issue.case_ids ?? []);
  if (!cases.length) return new NextResponse("This issue has no published cases.", { status: 409 });
  const formatParam = request.nextUrl.searchParams.get("format") ?? "square";
  const format: SocialFormat = formatParam in FORMATS ? (formatParam as SocialFormat) : "square";
  const image = await socialCard({
    template: "weekly",
    headline: `This week's receipts: ${cases.length} investigation${cases.length === 1 ? "" : "s"}`,
    quote: cases.slice(0, 3).map((c) => c.title).join(" · "),
    date: formatDate(issue.created_at),
    isDemo: cases.some((c) => c.isDemo),
    footnote: "Every claim links to its original source.",
    url: absoluteUrl("/cases"),
  }, format);
  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
