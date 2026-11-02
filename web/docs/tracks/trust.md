# Track E: messaging, offers, reviews, disputes and notifications

## What was built

- **Messaging**: "Message seller" on a listing starts or reopens one conversation per buyer and listing. `/messages` is the inbox (other member, listing, last message, unread count). `/messages/[id]` is the thread, newest at the bottom, refreshed every 5 seconds while the tab is visible. The database triggers' errors (rate limit, blocks) are shown in plain words. Members can block and unblock the other person and report a conversation. Emails and phone numbers are never shown; the composer warns against paying off the site.
- **Off-platform payment flags**: a sent message that mentions Venmo, Zelle, Cash App, PayPal friends and family, wire transfers, gift cards or crypto, or paying "off the site" is delivered normally and also files a report (`reports.source = 'auto'`, reason `off_platform_payment`, reporter = the sender) that shows in **Admin > Reports** with an "auto-flagged" badge.
- **Offers**: "Make offer" on active listings that accept offers (amount below the asking price, optional message). `/account/offers` lists offers made and received with status and time left. The member who did not make an offer can accept, decline or counter it; the maker can withdraw. Accepting gives the buyer **Check out at $X** linking to `/checkout/<listingId>?offer=<offerId>` (the checkout track reads `offer`). Only one offer per listing can be accepted at a time (unique index); accepting rejects the other pending offers and tells those buyers. Offers expire after `offer_expiry_hours` (accepted offers get a fresh window to pay). Expiry is enforced on read (`effectiveStatus`), whenever offers are touched, and by `expire_offers()` / `GET|POST /api/cron/expire-offers` (header `Authorization: Bearer $CRON_SECRET`; returns 503 if `CRON_SECRET` is unset).
- **Reviews**: `/reviews/new?order=<id>` lets the buyer and the seller of a completed order each leave one 1 to 5 star review. Reviews, the average, review count, completed sales and account age show on `/sellers/[username]`. The reviewed member can post one public response there; other signed-in members can report a review.
- **Disputes**: `/disputes/new?order=<id>` (order parties, paid or later orders) takes a type, a description and up to four photos or PDFs. Files go from the browser to the private `dispute-evidence` bucket under `<user id>/<dispute id>/`, and the server accepts only paths inside that folder. `/disputes/[id]` shows status, evidence (one-hour signed links, created on the server after the party check), the thread and the resolution. New table `dispute_messages` (parties and support read; parties write while the case is open; the database sets the author role; messages cannot be edited).
- **Admin > Disputes** (support role and above): list with status filters, case page with evidence, both parties, the thread, internal notes (never shown to members), status changes, resolution text (required to close) and messages to both members. Every change goes through `admin_update_dispute` / `admin_add_dispute_message` and is written to the audit log. **Nothing is refunded automatically**; the case page links to Refunds.
- **Notifications**: `/account/notifications` with mark read and mark all read; unread count pill on the header's Account menu. Rows are created by the server for new message (one unread per conversation), offer received, accepted, declined, countered, withdrawn and expired, review received, dispute opened and updated. Matching transactional emails are sent through `src/lib/email` (existing templates plus `trust-templates.ts`: counteroffer, review received, case update).

## Bug fixed in the existing security rules

The offer and conversation insert policies checked `user_blocks` as the buyer, and members can only see their own blocks, so a seller's block never applied to offers or new conversations. `has_blocked()` (a definer function) now backs both policies. Messages were already blocked by the trigger.

## Database (`supabase/migrations/20261103000200_trust.sql`)

Additive and re-runnable. Adds: unique indexes `offers_one_accepted_per_listing` and `offers_one_open_per_buyer`; `prepare_offer` (expiry from settings, below asking price); `expire_offers()`; `respond_to_offer()` (accept, reject, counter, withdraw; service role only); `has_blocked()`; `inbox_summary()` (security invoker); `reports.source`; `dispute_messages` with RLS and triggers; `admin_update_dispute`, `admin_add_dispute_message`.

## Code map

- `src/lib/trust/`: `offers.ts` (state machine, expiry, amounts), `flags.ts` (off-platform terms), `errors.ts`, `disputes.ts`, `notify.ts`, `offers-server.ts`, `inbox.ts`, `disputes-server.ts`.
- Actions: `src/app/messages/actions.ts`, `src/app/offers/actions.ts`, `src/app/reviews/actions.ts`, `src/app/disputes/actions.ts`, `src/app/account/notifications/actions.ts`, `src/app/admin/(panel)/disputes/actions.ts`.
- Pages: `/messages`, `/messages/[id]`, `/account/offers`, `/account/notifications`, `/reviews/new`, `/disputes/new`, `/disputes/[id]`, `/admin/disputes`, `/admin/disputes/[id]`.
- Components: `src/components/trust/*`, `src/components/listing/TrustButtons.tsx`, `src/components/NotificationBadge.tsx`.

## Shared files changed (small, isolated edits)

`src/components/listing/ListingActions.tsx` (Make offer and Message seller only; Buy now untouched), `src/components/Header.tsx` (unread pill, Messages, Offers, Notifications links), `src/app/account/page.tsx` (links), `src/app/sellers/[username]/page.tsx` (response and report forms, account age), `src/lib/listings.ts` (`reviewerId` on reviews), `src/app/admin/(panel)/reports/page.tsx` (auto-flag badge, dispute link), `src/app/admin/(panel)/disputes/page.tsx` (replaced placeholder).

## Tests

- `tests/unit/trust.test.ts`: offer state machine, expiry, amounts, off-platform detection (positives and negatives), error messages, evidence paths, email templates.
- `tests/db/trust.test.ts`: offer rules, counters, auto-reject, one accepted offer, expiry, blocks, inbox summary, reports source, reviews, dispute messages and RLS, admin dispute functions and audit.
- `tests/e2e/trust.spec.ts`: two-browser message exchange, flagged message, report, blocking, offer to counter to accept with checkout link and auto-rejected second offer, notifications, review and response, dispute with photo upload and admin resolution, phone layouts.

## Limitations

- The thread refreshes by polling every 5 seconds; there is no realtime push.
- Message emails are sent only for the first unread message in a conversation, to avoid mail floods.
- `/checkout/<listingId>?offer=` is built by the checkout track; until it exists the link leads to a 404.
- Opening a dispute does not change the order status, and there is no member-facing list of cases yet (reached from notifications, the order page link and the admin list).
- Offer acceptance does not reserve the listing; the checkout track should honor the accepted offer's price and expiry.
- Evidence photos are not scanned or resized; limits are 8 MB each, four per case.
- No scheduler is configured: call `/api/cron/expire-offers` hourly. Without it, expiry still applies on every read and whenever anyone touches offers.
