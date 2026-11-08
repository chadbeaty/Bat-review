import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Flash, PageHeader, btn, input, label, type Tone } from "@/components/ui";
import { requireOwner } from "@/lib/auth/member";
import type { CreatorRow } from "@/lib/data/types";
import { readFlash } from "@/lib/flash";
import { ago, compact } from "@/lib/format";
import { addCreator, creatorAction, setCreatorChannel } from "../actions";

export const metadata: Metadata = { title: "Creators" };

const STATUS: Record<string, Tone> = { verified: "good", candidate: "warn", unresolved: "neutral", rejected: "bad" };

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner("/admin/creators");
  const { data } = await db.from("creators").select("*").order("is_active", { ascending: false }).order("verification_status").order("display_name");
  const creators = (data ?? []) as CreatorRow[];
  const { data: counts } = await db.from("creator_videos").select("creator_id").not("creator_id", "is", null).limit(10000);
  const videosBy = new Map<string, number>();
  for (const c of counts ?? []) videosBy.set(c.creator_id as string, (videosBy.get(c.creator_id as string) ?? 0) + 1);
  const hasKey = Boolean(process.env.YOUTUBE_API_KEY);

  const op = (id: string, value: string, text: string, cls = btn.small, confirm?: string) => (
    <form action={creatorAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={value} />
      <SubmitButton className={cls} confirm={confirm} pendingText="…">{text}</SubmitButton>
    </form>
  );

  return (
    <>
      <Flash flash={readFlash(sp)} />
      <PageHeader
        title="Creators"
        subtitle="YouTube channels checked for new uploads every few hours. A creator is only monitored after its channel is verified as the right person: confirm each lookup before activating it."
      />
      {!hasKey && <p className="mb-4 rounded-lg bg-warn-wash p-3 text-sm text-warn">No YouTube API key is set. Monitoring uses the public upload feed (no tags, likes or comments, and it is sometimes unavailable), and new channels can&apos;t be verified until the key is added.</p>}

      <Card title="Add a creator" className="mb-4">
        <form action={addCreator} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <div><label className={label} htmlFor="display_name">Name</label><input id="display_name" name="display_name" required className={input} placeholder="e.g. Jordan Welch" /></div>
          <div><label className={label} htmlFor="channel">Channel link or @handle</label><input id="channel" name="channel" className={input} placeholder="https://www.youtube.com/@handle" /></div>
          <SubmitButton className={btn.primary} pendingText="Looking up…">Look up</SubmitButton>
        </form>
      </Card>

      <div className="space-y-2">
        {creators.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {c.display_name} <Badge tone={STATUS[c.verification_status]}>{c.verification_status}</Badge>{" "}
                  {c.is_active ? <Badge tone="accent">monitoring</Badge> : <Badge>not monitored</Badge>}
                </p>
                <p className="text-xs text-muted">
                  {c.channel_url ? <a className="text-accent hover:underline" href={c.channel_url} target="_blank" rel="noopener noreferrer">{c.channel_title ?? c.handle ?? c.channel_url}</a> : "No channel linked"}
                  {c.subscriber_count !== null && ` · ${compact(c.subscriber_count)} subscribers`}
                  {` · ${videosBy.get(c.id) ?? 0} videos collected`}
                  {c.last_polled_at && ` · checked ${ago(c.last_polled_at)}`}
                </p>
                {c.verification_notes && <p className="mt-1 text-xs text-ink-2">{c.verification_notes}</p>}
                {c.last_error && <p className="mt-1 text-xs text-bad">Last error: {c.last_error}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                {c.verification_status === "candidate" && c.channel_id && op(c.id, "confirm", "Confirm & activate", btn.primary)}
                {c.verification_status === "verified" && !c.is_active && op(c.id, "activate", "Activate")}
                {c.is_active && op(c.id, "deactivate", "Pause")}
                {c.is_active && op(c.id, "poll", "Check now")}
                {c.verification_status !== "rejected" && c.verification_status !== "verified" && c.channel_id && op(c.id, "reject", "Wrong channel")}
                {op(c.id, "delete", "Remove", btn.danger, `Remove ${c.display_name}? Collected videos are kept.`)}
              </div>
            </div>
            {c.verification_status !== "verified" && (
              <form action={setCreatorChannel} className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input name="channel" required placeholder="Paste the correct channel link (youtube.com/@handle)" className={input} />
                <SubmitButton className={btn.small} pendingText="Looking up…">Look up</SubmitButton>
              </form>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
