import { AdminHeader, Check, Field, Flash, Panel, Return, SelectField, Stat, Submit, Table, Td, sp1, type SearchParams } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/staff";
import { readFlash } from "@/lib/admin/action";
import { atLeast } from "@/lib/auth/roles";
import { emailConfigured } from "@/lib/email/send";
import { digestEmail } from "@/lib/email/templates";
import { digestCases } from "@/lib/newsletter-send";
import { BRAND, absoluteUrl } from "@/lib/seo";
import { formatDateTime } from "@/lib/format";
import { createIssue, sendNewsletterIssue, updateSubscriber } from "../system-actions";
import { CopyButton } from "@/components/admin/CopyButton";
import { weeklyRoundupCopy } from "@/lib/social/copy";

export const metadata = { title: "Newsletter" };
export const maxDuration = 300;

export default async function Newsletter({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaff("editor");
  const sp = await searchParams;
  const admin = atLeast(staff.role, "admin");
  const issueId = sp1(sp.issue);
  const head = { count: "exact" as const, head: true };
  const [confirmed, pending, unsubscribed, { data: issues }, { data: published }, subs] = await Promise.all([
    staff.db.from("newsletter_subscribers").select("id", head).eq("status", "confirmed"),
    staff.db.from("newsletter_subscribers").select("id", head).eq("status", "pending"),
    staff.db.from("newsletter_subscribers").select("id", head).eq("status", "unsubscribed"),
    staff.db.from("newsletter_issues").select("*").order("created_at", { ascending: false }).limit(30),
    staff.db.from("cases").select("id, title, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(30),
    admin ? staff.db.from("newsletter_subscribers").select("id, email, status, confirmed_at, created_at, consent_source").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: null }),
  ]);
  const issue = (issues ?? []).find((i) => i.id === issueId);
  const issueCases = issue ? await digestCases(staff.db, issue.case_ids) : [];
  const siteRoot = absoluteUrl("/").replace(/\/$/, "");
  const preview = issue ? digestEmail({ subject: issue.subject, intro: issue.intro, cases: issueCases, siteUrl: siteRoot, unsubscribeUrl: "#", oneClickUrl: "#" }) : null;
  const roundup = issueCases.length ? weeklyRoundupCopy(issueCases.map((c) => ({ title: c.title, url: c.url })), siteRoot) : null;
  return (
    <div className="space-y-6">
      <AdminHeader kicker="Audience" title={BRAND.newsletter}>Double opt-in only. Issues can include published cases only — the database refuses anything else.{!emailConfigured() && <strong className="block text-amber">Resend is not configured: emails won&apos;t send.</strong>}</AdminHeader>
      <Flash flash={readFlash(sp)} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Confirmed" value={confirmed.count ?? 0} /><Stat label="Pending confirmation" value={pending.count ?? 0} /><Stat label="Unsubscribed" value={unsubscribed.count ?? 0} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="New issue">
          <form action={createIssue} className="space-y-3">
            <Return to="/admin/newsletter" />
            <SelectField label="Kind" name="kind" options={[["weekly", `Weekly digest (${BRAND.newsletter})`], ["alert", "New investigation alert"]]} />
            <Field label="Subject" name="subject" defaultValue={`${BRAND.newsletter}: the receipts`} required />
            <Field label="Intro" name="intro" rows={3} />
            <fieldset><legend className="label">Published cases</legend>
              <div className="max-h-64 space-y-1 overflow-y-auto border border-rule p-2">{(published ?? []).map((c) => <label key={c.id} className="flex gap-2 text-sm"><input type="checkbox" name="case_ids" value={c.id} /> {c.title}</label>)}</div>
            </fieldset>
            <Submit small>Save draft</Submit>
          </form>
        </Panel>
        <Panel title="Issues">
          <Table head={["Subject", "Kind", "Status", "Sent"]}>
            {(issues ?? []).map((i) => <tr key={i.id}><Td><a className="link" href={`/admin/newsletter?issue=${i.id}`}>{i.subject}</a></Td><Td mono>{i.kind}</Td><Td mono>{i.status}</Td><Td mono>{i.sent_at ? `${i.sent_count} · ${formatDateTime(i.sent_at)}` : "—"}</Td></tr>)}
          </Table>
        </Panel>
      </div>
      {issue && preview && (
        <Panel title={`Preview: ${issue.subject}`} note={issue.status}>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[36rem] w-full border border-rule bg-white" />
          {roundup && (
            <div className="mt-4 border-t border-rule pt-3">
              <div className="flex items-center justify-between"><p className="kicker">Weekly roundup post</p><CopyButton text={roundup} /></div>
              <pre className="mt-1 whitespace-pre-wrap bg-paper-2 p-2 font-mono text-xs">{roundup}</pre>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["square", "story", "og"] as const).map((f) => <a key={f} className="btn btn-ghost btn-sm" href={`/admin/social/weekly/${issue.id}?format=${f}`} target="_blank" rel="noopener">{f === "square" ? "Square graphic" : f === "story" ? "Vertical graphic" : "Link graphic"}</a>)}
              </div>
            </div>
          )}
          {issue.status !== "sent" && (
            <form action={sendNewsletterIssue} className="mt-4 space-y-2">
              <input type="hidden" name="issue_id" value={issue.id} /><Return to={`/admin/newsletter?issue=${issue.id}`} />
              <Check label={`Send to all ${issue.kind === "alert" ? "alert-subscribed" : "confirmed"} subscribers now`} name="confirm" />
              <Submit tone="red" small>Send</Submit>
            </form>
          )}
        </Panel>
      )}
      {admin && (
        <Panel title="Subscribers (latest 100)" note="Admins only">
          <Table head={["Email", "Status", "Source", "Confirmed", ""]}>
            {(subs.data ?? []).map((s) => (
              <tr key={s.id}>
                <Td mono>{s.email}</Td><Td mono>{s.status}</Td><Td mono>{s.consent_source}</Td><Td mono>{formatDateTime(s.confirmed_at)}</Td>
                <Td>{s.status !== "unsubscribed" && <form action={updateSubscriber}><input type="hidden" name="subscriber_id" value={s.id} /><input type="hidden" name="status" value="unsubscribed" /><Return to="/admin/newsletter" /><Submit small tone="ghost">Unsubscribe</Submit></form>}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
