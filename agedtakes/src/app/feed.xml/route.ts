import { listCases } from "@/lib/data/public";
import { escapeHtml } from "@/lib/email/templates";
import { BRAND, absoluteUrl } from "@/lib/seo";
import { CASE_TYPE_LABELS } from "@/lib/editorial";

export const revalidate = 900;

/** RSS feed of published investigations, for readers' feed apps and news aggregators. Demo records are left out. */
export async function GET() {
  const result = await listCases({ page: 1 }).catch(() => null);
  const items = (result?.items ?? []).filter((c) => !c.is_demo);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeHtml(BRAND.name)}</title>
<link>${absoluteUrl("/")}</link>
<atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml" />
<description>${escapeHtml(BRAND.description)}</description>
<language>en-us</language>
${items
  .map(
    (c) => `<item>
<title>${escapeHtml(c.title)}</title>
<link>${absoluteUrl(`/cases/${c.slug}`)}</link>
<guid isPermaLink="true">${absoluteUrl(`/cases/${c.slug}`)}</guid>
<pubDate>${new Date(c.published_at).toUTCString()}</pubDate>
<category>${escapeHtml(CASE_TYPE_LABELS[c.case_type])}</category>
<description>${escapeHtml(c.summary ?? "")}</description>
</item>`
  )
  .join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
}
