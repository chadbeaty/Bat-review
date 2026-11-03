# Aged Takes — production launch checklist

Tick every item before announcing the site.

## Accounts and plans
- [ ] Vercel project uses **Root Directory `agedtakes`** and is on **Pro** (Hobby forbids commercial/ad-supported use).
- [ ] Supabase project on **Pro** (no auto-pause; daily backups). Point-in-time recovery considered.
- [ ] Domain purchased, added in Vercel, DNS records live, HTTPS certificate issued.
- [ ] Resend domain verified (SPF, DKIM); `NEWSLETTER_FROM_EMAIL` on that domain.
- [ ] Anthropic API billing active; daily budget set in Admin → Settings.

## Production environment variables (Vercel → Settings → Environment Variables → Production)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SITE_URL` and `NEXT_PUBLIC_SITE_URL` = `https://<your domain>` (no trailing slash)
- [ ] `ADMIN_EMAIL`
- [ ] `CRON_SECRET` (32+ random characters)
- [ ] `NEWSLETTER_SECRET`, `RATE_LIMIT_SALT` (random; **never change NEWSLETTER_SECRET after launch**)
- [ ] `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`)
- [ ] `RESEND_API_KEY`, `NEWSLETTER_FROM_EMAIL`, `NEXT_PUBLIC_CONTACT_EMAIL`
- [ ] Optional: `SEC_USER_AGENT`, `YOUTUBE_API_KEY`, `COINGECKO_API_KEY`, `FMP_API_KEY`, `SENTRY_DSN`
- [ ] Preview environment uses a **separate** Supabase project (or no service key), so preview deploys never touch production data.
- [ ] Admin → Settings → Integrations shows everything you need as "configured".

## Supabase configuration
- [ ] All migrations applied (GitHub Action "Aged Takes: deploy database" succeeded).
- [ ] Authentication → URL Configuration: Site URL = your domain; Redirect URLs include `https://<domain>/auth/confirm`.
- [ ] Magic Link email template uses `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`.
- [ ] Custom SMTP (Resend) configured for auth emails.
- [ ] MFA (TOTP) enabled. Admin → Settings → "staff mfa required" is **on**.
- [ ] Supabase → Advisors (Security and Performance) show no critical issues.

## Content
- [ ] **Demo data deleted** (Admin → Settings → Delete demo data). The homepage shows no "DEMO ONLY" banner.
- [ ] Every published case has been through the full workflow, with sources opened and checked by an editor.
- [ ] Research candidates have been researched or remain internal (status "Research candidate").
- [ ] Person photos: only images you have the right to use, each with a credit.
- [ ] About page contact email and right-of-reply route work.
- [ ] Methodology version recorded (Admin → Settings → Methodology versions).

## Legal (needs a qualified attorney)
- [ ] Privacy policy and Terms reviewed and adapted to your jurisdiction(s); then set `NEXT_PUBLIC_LEGAL_REVIEWED=true`.
- [ ] Newsletter consent wording and unsubscribe flow reviewed (CAN-SPAM, GDPR/UK GDPR, CASL if relevant). Add a postal address to the email footer if required.
- [ ] Corrections and right-of-reply policies reviewed.
- [ ] Pre-publication legal review process agreed for potentially defamatory material (below).
- [ ] Advertising/sponsorship disclosures reviewed.
- [ ] Media liability (errors & omissions) insurance considered.

### Pre-publication legal review — for every case that reflects on someone's conduct
1. Is every quotation verbatim, linked to the original, with its time code and date?
2. Is the surrounding context included — the question asked, conditions, jokes, hypotheticals?
3. Is each factual claim supported by a primary record or multiple independent reliable sources?
4. Have we avoided words like liar, fraud, criminal, scam or hypocrite? If any is used, is it substantiated and approved by counsel?
5. Is identity established — the right person, the right account, the right wallet? Is wallet ownership claimed by the subject or independently verified (not a third-party label)?
6. Have we described transactions exactly — transfer vs sale, deposit vs trade, spouse/family vs self, fund vs personal?
7. Is a missing disclosure described as missing, not as concealment?
8. Are opinion, prediction, explicit commitment, documented action and our editorial interpretation clearly separated?
9. Was the subject offered a reasonable opportunity to respond, and is the outreach recorded?
10. Are limitations stated — what the evidence does not establish?
11. Would we be comfortable showing every source to the subject and a judge?

## Technical
- [ ] `npm run lint`, `npm run typecheck`, `npm test` (with the database tests) and `npm run build` pass in CI.
- [ ] Vercel → Settings → Cron Jobs shows the three jobs; a manual run of `/api/cron/monitor` with the bearer secret returns `ok`.
- [ ] Sign-in, two-step verification, newsroom access for each role tested with real accounts.
- [ ] Publish a test case on a staging project end to end (draft → approve → typed confirmation → live → correction → newsletter).
- [ ] Newsletter: subscribe, confirm, receive welcome, unsubscribe (link and one-click) all work.
- [ ] `https://<domain>/sitemap.xml` and `/robots.txt` correct; submitted to Google Search Console and Bing Webmaster Tools.
- [ ] Share preview checked with the X/Facebook/LinkedIn card validators.
- [ ] Error tracking connected (optional) and Vercel log drain/alerts set.
- [ ] Backups: confirm Supabase daily backups; run and store one manual export (see OPERATIONS.md).
