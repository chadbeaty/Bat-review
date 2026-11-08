import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Empty, Flash, PageHeader, btn, input, label } from "@/components/ui";
import { requireMember } from "@/lib/auth/member";
import { readFlash } from "@/lib/flash";
import { ago } from "@/lib/format";
import { submitUrl } from "./actions";

export const metadata: Metadata = { title: "Submit a URL" };
export const maxDuration = 300;

const WHAT: [string, string][] = [
  ["YouTube video or Short", "Read through the official API: title, description, tags, thumbnail and public counts."],
  ["TikTok video", "TikTok's public lookup returns only the video id, so describe the product in the notes."],
  ["Instagram, Reddit", "Stored as a link (no approved API yet); describe the product in the notes."],
  ["Shopify or other store page", "Read once, politely, if the site's robots.txt allows: title, image, listed price."],
  ["Amazon, AliExpress, Temu, TikTok Shop", "Never fetched (their terms forbid it). Stored as evidence; use the notes."],
];

export default async function SubmitPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireMember("/submit");
  const { data: recent } = await db.from("manual_submissions").select("id, url, platform, status, result, created_at").order("created_at", { ascending: false }).limit(15);

  return (
    <>
      <Flash flash={readFlash(sp)} />
      <PageHeader title="Submit a URL" subtitle="Paste a video, post or product page you spotted. It's analysed right away and grouped with any product already being tracked." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form action={submitUrl} className="space-y-3">
            <div>
              <label className={label} htmlFor="url">Link</label>
              <input id="url" name="url" type="url" required placeholder="https://www.tiktok.com/@creator/video/…" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="notes">Notes (what&apos;s the product? caption text, price, anything you noticed)</label>
              <textarea id="notes" name="notes" rows={4} className={input} placeholder="e.g. Mini handheld bag sealer, magnetic, USB-C rechargeable. 2.1M views, comments asking where to buy." />
              <p className="mt-1 text-xs text-muted">Your notes are stored as owner-provided evidence and labelled that way.</p>
            </div>
            <SubmitButton className={btn.primary} pendingText="Analysing… (up to a minute)">Analyse</SubmitButton>
          </form>
        </Card>
        <Card title="What gets read">
          <ul className="space-y-2 text-xs">
            {WHAT.map(([k, v]) => (
              <li key={k}><strong className="text-ink-2">{k}:</strong> <span className="text-muted">{v}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Recent submissions" className="mt-4">
        {(recent ?? []).length ? (
          <ul className="divide-y divide-line text-sm">
            {(recent ?? []).map((r) => (
              <li key={r.id as string} className="py-2">
                <a href={r.url as string} target="_blank" rel="noopener noreferrer nofollow" className="break-all hover:text-accent">{r.url as string}</a>
                <p className="text-xs text-muted">
                  <Badge tone={r.status === "analyzed" ? "good" : r.status === "failed" ? "bad" : "neutral"}>{r.status as string}</Badge> {r.platform as string} · {ago(r.created_at as string)} {r.result ? `· ${r.result}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nothing submitted yet" />
        )}
      </Card>
    </>
  );
}
