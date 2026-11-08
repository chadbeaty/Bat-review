# Operating Product Radar

## Daily use

1. Read the morning digest email (top 10 opportunities, about 11:30 UTC).
2. Open **Overview** for what's new, accelerating and saturating.
3. On a product page, check the **confidence** and the **mentions** list before acting. Low confidence usually
   means only one or two monitored creators have shown it so far.
4. Add promising products to your **watchlist**. When you test one, record the result on its page (revenue,
   orders, costs, verdict). These results are stored for the Phase 5 learning step.

## Correcting the system

- **Two products are really the same**: Admin → Products & matching → "Same product: merge", or paste both links
  into "Merge two products". History moves to the product you keep.
- **Wrong name or missing alias**: product page → Owner tools → Rename, or "Also sold as" → Add.
- **Not a real product** (e.g. a prop): product page → "Not a product". It disappears from lists and alerts.
- **Wrong creator channel**: Admin → Creators → "Wrong channel", then paste the right link.

## Costs and limits

Admin → Usage & costs shows AI spend (today / month), YouTube quota used today (10,000 free per day) and emails
sent (free plan: 100/day, 3,000/month), with a projected monthly total. When an AI budget is reached, AI work
pauses until the next UTC day or month; monitoring and everything else continue, and waiting videos are analysed
once the budget resets. Change budgets or the model in Admin → Settings → AI.

## When something goes wrong

| Symptom | Where to look | Usual fix |
|---|---|---|
| No new products | Admin → Jobs (latest run) | Check the run's error. "AI is not configured" → add `ANTHROPIC_API_KEY` in Vercel. "AI budget reached" → wait or raise it. |
| A creator shows an error | Admin → Creators / Jobs → "Creators with errors" | "quota" → wait for the daily reset. "Channel not found" → the channel was renamed or removed; paste the new link. |
| Emails not arriving | Admin → Jobs → "Recent alerts and emails" | "not configured" → add `RESEND_API_KEY` and `ALERT_FROM_EMAIL`. "failed" → the from-address domain must be verified in Resend. |
| Jobs never run | Vercel → project → Settings → Cron Jobs | `CRON_SECRET` must be set in Vercel; redeploy after adding it. |
| "Videos that failed analysis" keeps growing | Admin → Jobs | Read the error, fix the cause, then click Retry. |

## Data rules the system keeps

- Every observation has a source URL and a time. Estimates are labelled.
- Platforms are accessed only through their official APIs or public endpoints they provide. Marketplaces whose
  terms forbid automated access (Amazon, AliExpress, Temu, Walmart, eBay, TikTok Shop) are never fetched.
- Missing data is never treated as zero competition or zero demand.
