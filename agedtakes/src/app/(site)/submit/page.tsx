import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { SubmitForm } from "@/components/site/SubmitForm";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Submit a receipt",
  description: "Send Aged Takes an original public statement, prediction or promise and its source. Every submission is reviewed by an editor.",
  path: "/submit",
});

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SubmitPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const person = typeof sp.person === "string" ? sp.person.slice(0, 160) : "";
  return (
    <div className="wrap max-w-3xl py-12">
      <PageHeader kicker="Tips" title="Submit a receipt">
        Know a public statement that has aged — well or badly? Send us the original. An editor reviews every submission; nothing you send is published automatically,
        and we never publish your name or email.
      </PageHeader>
      <div className="mb-8 grid gap-4 border border-rule bg-paper-2/50 p-5 text-sm text-ink-2 sm:grid-cols-3">
        <p><strong className="text-ink">Link the original.</strong> The video, post, filing or article — not a screenshot of a repost.</p>
        <p><strong className="text-ink">Quote it exactly.</strong> Include the time code for video or audio.</p>
        <p><strong className="text-ink">Public only.</strong> Don&apos;t send private messages, leaked documents or personal information.</p>
      </div>
      <SubmitForm defaultPerson={person} />
    </div>
  );
}
