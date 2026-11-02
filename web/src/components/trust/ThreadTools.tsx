"use client";

import { StatefulForm } from "./StatefulForm";
import { blockMember, reportConversation, sendMessage, unblockMember } from "@/app/messages/actions";
import { OFF_PLATFORM_WARNING } from "@/lib/trust/flags";

export function Composer({ conversationId, disabledReason }: { conversationId: string; disabledReason?: string }) {
  if (disabledReason) {
    return (
      <p role="status" className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm">
        {disabledReason}
      </p>
    );
  }
  return (
    <StatefulForm action={sendMessage} label="Send a message">
      <input type="hidden" name="conversationId" value={conversationId} />
      <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-testid="payment-warning">
        {OFF_PLATFORM_WARNING}
      </p>
      <label className="field" htmlFor="message-body">
        <span>Your message</span>
        <textarea id="message-body" name="body" rows={3} maxLength={4000} required className="input" />
      </label>
      <button type="submit" className="btn btn-primary justify-self-start">
        Send message
      </button>
    </StatefulForm>
  );
}

export function BlockControl({ conversationId, userId, username, blocked }: { conversationId: string; userId: string; username: string; blocked: boolean }) {
  return (
    <StatefulForm action={blocked ? unblockMember : blockMember} resetOnSuccess={false} className="grid gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <button type="submit" className="btn btn-outline justify-self-start">
        {blocked ? `Unblock @${username}` : `Block @${username}`}
      </button>
    </StatefulForm>
  );
}

export function ReportConversation({ conversationId }: { conversationId: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-soft underline">Report this conversation</summary>
      <StatefulForm action={reportConversation} className="mt-3 grid gap-3">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label className="field" htmlFor="convo-report-reason">
          <span>Reason</span>
          <select id="convo-report-reason" name="reason" className="input" required defaultValue="">
            <option value="" disabled>
              Choose a reason
            </option>
            <option value="harassment">Harassment or abuse</option>
            <option value="off_platform_payment">Asks to pay outside the site</option>
            <option value="spam">Spam</option>
            <option value="counterfeit">Counterfeit or fraud</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="field" htmlFor="convo-report-details">
          <span>
            Details <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <textarea id="convo-report-details" name="details" rows={3} maxLength={2000} className="input" />
        </label>
        <button type="submit" className="btn btn-outline justify-self-start">
          Send report
        </button>
      </StatefulForm>
    </details>
  );
}
