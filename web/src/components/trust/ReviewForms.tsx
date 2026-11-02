"use client";

import { StatefulForm } from "./StatefulForm";
import { reportReview, respondToReview, submitReview } from "@/app/reviews/actions";

export function ReviewForm({ orderId, otherUsername }: { orderId: string; otherUsername: string }) {
  return (
    <StatefulForm action={submitReview} label="Leave a review" resetOnSuccess={false}>
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className="grid gap-2">
        <legend className="font-semibold">Rating for @{otherUsername}</legend>
        <div className="flex flex-wrap gap-3">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="flex items-center gap-1">
              <input type="radio" name="rating" value={n} required />
              <span>
                {n} {n === 1 ? "star" : "stars"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field" htmlFor="review-text">
        <span>
          Your review <span className="font-normal text-ink-soft">(optional)</span>
        </span>
        <textarea id="review-text" name="text" rows={4} maxLength={2000} className="input" />
      </label>
      <button type="submit" className="btn btn-primary justify-self-start">
        Post review
      </button>
    </StatefulForm>
  );
}

export function ReviewResponseForm({ reviewId }: { reviewId: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold underline">Respond publicly</summary>
      <StatefulForm action={respondToReview} className="mt-2 grid gap-2">
        <input type="hidden" name="reviewId" value={reviewId} />
        <label className="field" htmlFor={`response-${reviewId}`}>
          <span>Your response</span>
          <textarea id={`response-${reviewId}`} name="response" rows={3} maxLength={1000} required className="input" />
        </label>
        <button type="submit" className="btn btn-outline justify-self-start">
          Post response
        </button>
      </StatefulForm>
    </details>
  );
}

export function ReportReviewForm({ reviewId }: { reviewId: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-soft underline">Report this review</summary>
      <StatefulForm action={reportReview} className="mt-2 grid gap-2">
        <input type="hidden" name="reviewId" value={reviewId} />
        <label className="field" htmlFor={`report-review-${reviewId}`}>
          <span>What is wrong with it?</span>
          <textarea id={`report-review-${reviewId}`} name="details" rows={2} maxLength={2000} required className="input" />
        </label>
        <button type="submit" className="btn btn-outline justify-self-start">
          Send report
        </button>
      </StatefulForm>
    </details>
  );
}
