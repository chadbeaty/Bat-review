import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Flash, PageHeader, btn, input, label, type Tone } from "@/components/ui";
import { requireOwner } from "@/lib/auth/member";
import { readFlash } from "@/lib/flash";
import { ago } from "@/lib/format";
import { addSource, sourceAction } from "../actions";

export const metadata: Metadata = { title: "Data sources" };

const TONE: Record<string, Tone> = { active: "good", paused: "warn", planned: "accent", unavailable: "neutral" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner("/admin/sources");
  const { data } = await db.from("sources").select("*").order("status").order("kind");
  return (
    <>
      <Flash flash={readFlash(sp)} />
      <PageHeader
        title="Data sources"
        subtitle="Each connector and what it can legitimately access. Sources marked planned or unavailable need an approved API or a licensed provider first; nothing here scrapes platforms that forbid it."
      />
      <div className="space-y-2">
        {(data ?? []).map((s) => (
          <Card key={s.id as string}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 max-w-3xl">
                <p className="font-medium">{s.name as string} <Badge tone={TONE[s.status as string]}>{s.status as string}</Badge> <Badge>{s.kind as string}</Badge></p>
                {s.url && <p className="break-all text-xs text-accent">{s.url as string}</p>}
                {s.notes && <p className="mt-1 text-xs text-ink-2">{s.notes as string}</p>}
                {s.last_error && <p className="mt-1 text-xs text-bad">{s.last_error as string}</p>}
                <p className="mt-1 text-[11px] text-muted">Added {ago(s.created_at as string)}</p>
              </div>
              <div className="flex gap-1">
                {s.status === "active" && (
                  <form action={sourceAction}><input type="hidden" name="id" value={s.id as string} /><input type="hidden" name="op" value="pause" /><SubmitButton className={btn.small}>Pause</SubmitButton></form>
                )}
                {s.status === "paused" && (
                  <form action={sourceAction}><input type="hidden" name="id" value={s.id as string} /><input type="hidden" name="op" value="activate" /><SubmitButton className={btn.small}>Resume</SubmitButton></form>
                )}
                {s.url && (
                  <form action={sourceAction}><input type="hidden" name="id" value={s.id as string} /><input type="hidden" name="op" value="delete" /><SubmitButton className={btn.danger} confirm="Remove this source?">Remove</SubmitButton></form>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card title="Save a source URL" subtitle="Subreddits, competitor stores, marketplace categories… Saved now and monitored once a permitted connector for that type exists. For one-off videos or listings, use Submit a URL." className="mt-4">
        <form action={addSource} className="grid gap-2 sm:grid-cols-2">
          <div><label className={label}>Name</label><input name="name" required className={input} placeholder="r/BuyItForLife" /></div>
          <div><label className={label}>Type</label><select name="kind" className={input}><option value="web">Website / store</option><option value="reddit">Reddit</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="amazon">Amazon</option><option value="aliexpress">AliExpress</option><option value="google_shopping">Google Shopping</option></select></div>
          <div className="sm:col-span-2"><label className={label}>URL</label><input name="url" type="url" required className={input} placeholder="https://www.reddit.com/r/BuyItForLife/" /></div>
          <div className="sm:col-span-2"><label className={label}>Notes</label><input name="notes" className={input} /></div>
          <div><SubmitButton className={btn.primary}>Save</SubmitButton></div>
        </form>
      </Card>
    </>
  );
}
