"use client";

import { useActionState } from "react";
import { submitReceiptAction, type FormState } from "@/app/(site)/actions";

const initial: FormState = { status: "idle", message: "" };

export function SubmitForm({ defaultPerson = "" }: { defaultPerson?: string }) {
  const [state, action, pending] = useActionState(submitReceiptAction, initial);
  const v = (k: string, fallback = "") => state.values?.[k] ?? fallback;
  if (state.status === "ok") {
    return (
      <div role="status" className="border border-ink p-6">
        <p className="headline text-3xl">Received.</p>
        <p className="mt-2 text-lg text-ink-2">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <div className="hidden" aria-hidden>
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div>
        <label className="label" htmlFor="person_name">Who said it? *</label>
        <input id="person_name" name="person_name" required maxLength={160} defaultValue={v("person_name", defaultPerson)} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="statement_text">The exact statement *</label>
        <textarea id="statement_text" name="statement_text" required rows={4} maxLength={4000} defaultValue={v("statement_text")} className="field" placeholder="Paste the exact wording, with the time code if it's a video." />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="statement_date">When was it said?</label>
          <input id="statement_date" name="statement_date" maxLength={40} defaultValue={v("statement_date")} className="field" placeholder="e.g. 14 March 2023" />
        </div>
        <div>
          <label className="label" htmlFor="source_url">Link to the original source *</label>
          <input id="source_url" name="source_url" type="url" required maxLength={2000} defaultValue={v("source_url")} className="field" placeholder="https://" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="supporting_urls">Supporting links (what happened next)</label>
        <textarea id="supporting_urls" name="supporting_urls" rows={3} defaultValue={v("supporting_urls")} className="field" placeholder="One link per line — filings, data, later statements" />
      </div>
      <div>
        <label className="label" htmlFor="context">Context</label>
        <textarea id="context" name="context" rows={3} maxLength={4000} defaultValue={v("context")} className="field" placeholder="What was the question? Any conditions attached?" />
      </div>
      <fieldset className="grid gap-5 border-t border-rule pt-5 sm:grid-cols-2">
        <legend className="kicker mb-3">Optional — only so an editor can follow up. Never published.</legend>
        <div>
          <label className="label" htmlFor="submitter_name">Your name</label>
          <input id="submitter_name" name="submitter_name" maxLength={120} defaultValue={v("submitter_name")} className="field" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="submitter_email">Your email</label>
          <input id="submitter_email" name="submitter_email" type="email" maxLength={254} defaultValue={v("submitter_email")} className="field" autoComplete="email" />
        </div>
      </fieldset>
      {state.status === "error" && <p role="alert" className="text-red-ink">{state.message}</p>}
      <button className="btn btn-red" type="submit" disabled={pending}>{pending ? "Sending…" : "Send to the newsroom"}</button>
    </form>
  );
}
