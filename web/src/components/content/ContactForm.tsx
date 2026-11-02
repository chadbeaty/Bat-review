"use client";

import { useActionState } from "react";
import { sendSupportMessage, type ContactState } from "@/app/contact/actions";

const TOPICS = [
  { value: "order", label: "An order" },
  { value: "listing", label: "A listing" },
  { value: "account", label: "My account" },
  { value: "safety", label: "Fraud or safety" },
  { value: "catalog", label: "The bat catalog" },
  { value: "other", label: "Something else" },
];

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendSupportMessage, {});
  if (state.ok) {
    return (
      <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-success">
        Thanks, your message was sent. We reply by email to the address on your account.
      </p>
    );
  }
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <label className="field" htmlFor="c-topic">
        <span>Topic</span>
        <select id="c-topic" name="topic" defaultValue="" className="input" aria-invalid={Boolean(err.topic)}>
          <option value="" disabled>
            Choose a topic
          </option>
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {err.topic && <span className="text-sm font-normal text-danger">{err.topic}</span>}
      </label>
      <label className="field" htmlFor="c-subject">
        <span>Subject</span>
        <input id="c-subject" name="subject" maxLength={120} className="input" aria-invalid={Boolean(err.subject)} />
        {err.subject && <span className="text-sm font-normal text-danger">{err.subject}</span>}
      </label>
      <label className="field" htmlFor="c-body">
        <span>Message</span>
        <textarea id="c-body" name="body" rows={6} maxLength={4000} className="input" aria-invalid={Boolean(err.body)} />
        {err.body && <span className="text-sm font-normal text-danger">{err.body}</span>}
        <span className="text-sm font-normal text-ink-soft">For an order, include the order number. Never send card numbers or passwords.</span>
      </label>
      <p>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </button>
      </p>
    </form>
  );
}
